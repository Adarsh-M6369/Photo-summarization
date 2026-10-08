from dotenv import load_dotenv
import os
from pathlib import Path

load_dotenv()


class Settings:
    APP_NAME = os.getenv("APP_NAME", "AI Photo Studio Culling & HITL Management Engine")
    DEBUG = os.getenv("DEBUG", "true").lower() in ("true", "1", "yes")
    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "8000"))
    WORKERS = int(os.getenv("WORKERS", "1"))

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
    MONGO_URL = os.getenv("MONGO_URL")
    MONGO_URL_local = os.getenv("MONGO_URL_local")
    MONGO_URI = os.getenv("MONGO_URL") or os.getenv("MONGO_URL_local") or os.getenv("MONGO_URI", "mongodb://localhost:27017")
    DB_NAME = os.getenv("DB_NAME", "rag_db")
    MONGO_DB_NAME = os.getenv("DB_NAME", "rag_db")
    NEWS_API_KEY = os.getenv("NEWS_API_KEY")
    CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY")
    CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
    CLERK_PEM_PUBLIC_KEY = os.getenv("CLERK_PEM_PUBLIC_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES = 15
    REFRESH_TOKEN_EXPIRE_DAYS = 7
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # Storage paths
    BASE_STORAGE_PATH = os.getenv("BASE_STORAGE_PATH", "./storage")

    # Thresholds for CV Filtering & Culling
    LAPLACIAN_BLUR_THRESHOLD = float(os.getenv("LAPLACIAN_BLUR_THRESHOLD", "120.0"))
    PHASH_HAMMING_THRESHOLD = int(os.getenv("PHASH_HAMMING_THRESHOLD", "4"))
    VLM_MIN_AESTHETIC_SCORE = float(os.getenv("VLM_MIN_AESTHETIC_SCORE", "6.0"))
    HITL_BATCH_SIZE = int(os.getenv("HITL_BATCH_SIZE", "50"))

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
