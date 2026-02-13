from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    app_name: str = os.getenv("APP_NAME", "Breakfast Store System")
    app_env: str = os.getenv("APP_ENV", "development")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./breakfast.db")
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    secret_key: str = os.getenv("SECRET_KEY", "change-this-secret-in-production")
    token_expire_minutes: int = int(os.getenv("TOKEN_EXPIRE_MINUTES", "720"))


settings = Settings()
