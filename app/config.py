from __future__ import annotations

import os
import secrets

from dotenv import load_dotenv

load_dotenv()

_INSECURE_KEY_PLACEHOLDERS = {
    "change-this-secret-in-production",
    "replace-with-long-random-secret",
}


class Settings:
    app_name: str = os.getenv("APP_NAME", "Breakfast Store System")
    app_env: str = os.getenv("APP_ENV", "development")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./breakfast.db")
    cors_origins: str = os.getenv("CORS_ORIGINS", "")
    token_expire_minutes: int = int(os.getenv("TOKEN_EXPIRE_MINUTES", "720"))

    def __init__(self) -> None:
        raw_key = os.getenv("SECRET_KEY", "")
        if self.app_env == "production" and (not raw_key or raw_key in _INSECURE_KEY_PLACEHOLDERS):
            raise RuntimeError(
                "SECRET_KEY is missing or insecure. "
                "Set a strong random SECRET_KEY in production."
            )
        self.secret_key: str = raw_key if raw_key and raw_key not in _INSECURE_KEY_PLACEHOLDERS else secrets.token_hex(32)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
