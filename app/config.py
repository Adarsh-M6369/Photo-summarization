import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "AI Photo Studio Culling & HITL Management Engine"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1

    # Database
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "photo_culling_studio"

    # Vision Language Models
    GEMINI_API_KEY: str = ""
    MISTRAL_API_KEY: str = ""

    # Authentication
    CLERK_SECRET_KEY: str = ""
    CLERK_PEM_PUBLIC_KEY: str = ""

    # Storage Paths
    BASE_STORAGE_PATH: str = "./storage"

    # Thresholds for CV Filtering & Culling
    LAPLACIAN_BLUR_THRESHOLD: float = 120.0
    PHASH_HAMMING_THRESHOLD: int = 4
    VLM_MIN_AESTHETIC_SCORE: float = 6.0
    HITL_BATCH_SIZE: int = 50

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def storage_dir(self) -> Path:
        path = Path(self.BASE_STORAGE_PATH).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def uploads_dir(self) -> Path:
        path = self.storage_dir / "uploads"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def approved_dir(self) -> Path:
        path = self.storage_dir / "approved"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def recycle_bin_dir(self) -> Path:
        path = self.storage_dir / ".recycle_bin"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def thumbnails_dir(self) -> Path:
        path = self.storage_dir / "thumbnails"
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
