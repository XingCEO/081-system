from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
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

origins = [origin.strip() for origin in settings.cors_origins.split(",")] if settings.cors_origins else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
