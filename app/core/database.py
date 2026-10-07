import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from app.config import settings

logger = logging.getLogger("photo_culling.database")


class DatabaseManager:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    sync_client: Optional[MongoClient] = None
    is_connected: bool = False


db_manager = DatabaseManager()


async def connect_to_mongo():
    """Initializes async and sync MongoDB connections on application startup."""
    try:
        logger.info(f"Connecting to MongoDB at {settings.MONGO_URI} (db: {settings.MONGO_DB_NAME})...")
        db_manager.client = AsyncIOMotorClient(
            settings.MONGO_URI,
            serverSelectionTimeoutMS=3000,
        )
        # Verify connection
        await db_manager.client.admin.command("ping")
        db_manager.db = db_manager.client[settings.MONGO_DB_NAME]
        db_manager.sync_client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=3000)
        db_manager.is_connected = True
        logger.info("Successfully connected to MongoDB.")

        # Create indexes
        await _init_db_indexes(db_manager.db)
    except Exception as exc:
        logger.warning(
            f"MongoDB connection failed ({exc}). Operating in graceful degradation mode."
        )
        db_manager.is_connected = False


async def _init_db_indexes(db: AsyncIOMotorDatabase):
    """Create essential compound indexes for fast photo queries and batch slicing."""
    try:
        await db.events.create_index("event_id", unique=True)
        await db.photos.create_index([("event_id", 1), ("photo_id", 1)], unique=True)
        await db.photos.create_index([("event_id", 1), ("status", 1)])
        await db.photos.create_index([("event_id", 1), ("tier", 1)])
        await db.recycle_bin.create_index([("event_id", 1), ("photo_id", 1)])
        await db.culling_runs.create_index("run_id", unique=True)
        logger.info("MongoDB indexes verified successfully.")
    except Exception as e:
        logger.error(f"Error creating MongoDB indexes: {e}")


async def close_mongo_connection():
    """Closes MongoDB connection on application shutdown."""
    if db_manager.client:
        logger.info("Closing MongoDB connection...")
        db_manager.client.close()
        db_manager.is_connected = False
        logger.info("MongoDB connection closed.")


def get_db() -> Optional[AsyncIOMotorDatabase]:
    """Dependency injector for asynchronous database access."""
    return db_manager.db


def get_sync_db():
    """Returns sync database reference for LangGraph checkpointers if needed."""
    if db_manager.sync_client:
        return db_manager.sync_client[settings.MONGO_DB_NAME]
    return None
