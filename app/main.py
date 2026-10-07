import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection, db_manager
from app.routes.upload_routes import router as upload_router
from app.routes.culling_routes import router as culling_router
from app.routes.hitl_routes import router as hitl_router
from app.routes.recycle_bin_routes import router as recycle_bin_router
from app.mcp.file_tools import MCP_TOOL_DEFINITIONS, execute_mcp_tool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("photo_culling.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages application startup and shutdown events."""
    logger.info(f"Starting {settings.APP_NAME}...")
    # Initialize storage directories
    _ = settings.uploads_dir
    _ = settings.approved_dir
    _ = settings.recycle_bin_dir
    _ = settings.thumbnails_dir

    # Connect to MongoDB
    await connect_to_mongo()
    yield
    # Graceful shutdown
    await close_mongo_connection()
    logger.info("Application shutdown complete.")


app = FastAPI(
    title=settings.APP_NAME,
    description="Multi-Tier AI Photo Studio Culling System with LangGraph HITL Batching & Safe Recovery",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount storage directory for static file access (thumbnails and images)
storage_dir = Path(settings.BASE_STORAGE_PATH).resolve()
storage_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_dir)), name="storage")

# Include API Routers
app.include_router(upload_router)
app.include_router(culling_router)
app.include_router(hitl_router)
app.include_router(recycle_bin_router)


@app.get("/api/health", tags=["System"])
async def health_check():
    """Health check endpoint displaying system status, storage paths, and DB connectivity."""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "database_connected": db_manager.is_connected,
        "storage_path": str(settings.storage_dir),
        "vlm_providers": {
            "gemini_configured": bool(settings.GEMINI_API_KEY),
            "mistral_configured": bool(settings.MISTRAL_API_KEY),
        },
        "auth_provider": {
            "clerk_configured": bool(settings.CLERK_PEM_PUBLIC_KEY or settings.CLERK_SECRET_KEY),
        },
    }


@app.get("/api/mcp/tools", tags=["MCP"])
async def list_mcp_tools():
    """Lists available Model Context Protocol tools for safe studio file actions."""
    return {"tools": MCP_TOOL_DEFINITIONS}


@app.post("/api/mcp/execute", tags=["MCP"])
async def run_mcp_tool(payload: dict):
    """Executes an MCP tool call."""
    tool_name = payload.get("tool_name")
    arguments = payload.get("arguments", {})
    return await execute_mcp_tool(tool_name, arguments)
