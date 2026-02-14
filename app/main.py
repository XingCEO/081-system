from __future__ import annotations

import logging
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from time import time

from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_websocket_user
from app.config import settings
from app.database import SessionLocal, get_db
from app.models import AuditLog
from app.routers import analytics, audit, auth, inventory, menu, orders
from app.seed import seed_database
from app.ws import manager

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simple in-memory rate limiter for login
# ---------------------------------------------------------------------------
_login_attempts: dict[str, list[float]] = defaultdict(list)
LOGIN_RATE_WINDOW = 60  # seconds
LOGIN_RATE_MAX = 10  # max attempts per window


def clear_rate_limits() -> None:
    """Clear all rate limit state. Used by tests."""
    _login_attempts.clear()


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        try:
            db.execute(select(AuditLog.id).limit(1)).all()
            seed_database(db)
        except SQLAlchemyError as exc:
            raise RuntimeError(
                "Database schema is not ready. Run 'alembic upgrade head' first.",
            ) from exc
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# ---------------------------------------------------------------------------
# CORS — refuse wildcard in production
# ---------------------------------------------------------------------------
if settings.cors_origins:
    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
else:
    origins = []

if not origins and not settings.is_production:
    origins = ["http://localhost:8000", "http://127.0.0.1:8000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Security headers middleware (CSP, etc.)
# ---------------------------------------------------------------------------
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self' ws: wss:; "
        "frame-ancestors 'none'"
    )
    return response


# ---------------------------------------------------------------------------
# Login rate-limit middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def login_rate_limit(request: Request, call_next):
    if request.url.path == "/api/auth/login" and request.method == "POST":
        client_ip = request.client.host if request.client else "unknown"
        now = time()
        attempts = _login_attempts[client_ip]
        # Prune old entries
        _login_attempts[client_ip] = [t for t in attempts if now - t < LOGIN_RATE_WINDOW]
        if len(_login_attempts[client_ip]) >= LOGIN_RATE_MAX:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many login attempts. Please try again later."},
            )
        _login_attempts[client_ip].append(now)
    return await call_next(request)


app.include_router(menu.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(audit.router, prefix="/api")


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


@app.get("/api/config/public")
def public_config() -> dict:
    """Expose non-sensitive config to frontend (e.g. whether to show demo credentials)."""
    return {"env": settings.app_env}


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    with SessionLocal() as db:
        get_websocket_user(token=token, db=db)

    await manager.connect(websocket)
    await websocket.send_json({"event": "connected"})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/pos", StaticFiles(directory=frontend_dir / "pos", html=True), name="pos")
app.mount("/kds", StaticFiles(directory=frontend_dir / "kds", html=True), name="kds")
app.mount("/admin", StaticFiles(directory=frontend_dir / "admin", html=True), name="admin")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
