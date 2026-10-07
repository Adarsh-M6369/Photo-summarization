import asyncio
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, status
from pydantic import BaseModel
from langgraph.checkpoint.memory import MemorySaver

from app.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, AuthenticatedUser
from app.workflows.culling_graph import culling_graph
from app.workflows.state import CullingWorkflowState

logger = logging.getLogger("photo_culling.culling_routes")
router = APIRouter(prefix="/api/culling", tags=["Culling Pipeline"])

# Global in-memory tracking of active jobs
active_culling_jobs: Dict[str, Dict[str, Any]] = {}


async def _execute_graph_task(event_id: str, photos: list):
    """Background task runner for LangGraph workflow execution."""
    config = {"configurable": {"thread_id": event_id}}
    initial_state: CullingWorkflowState = {
        "event_id": event_id,
        "all_photos": photos,
        "tier1_results": [],
        "burst_clusters": [],
        "vlm_evaluations": {},
        "discard_candidates": [],
        "keeper_candidates": [],
        "current_batch_index": 0,
        "current_batch": [],
        "approved_deletions": [],
        "saved_keepers": [],
        "status": "processing",
        "progress_pct": 5.0,
        "error": None,
    }

    try:
        active_culling_jobs[event_id] = {
            "status": "processing",
            "progress_pct": 10.0,
            "stage": "tier1_cv_running",
            "total_photos": len(photos),
            "is_interrupted": False,
        }

        # Stream graph execution until interrupt or completion
        async for chunk in culling_graph.astream(initial_state, config=config):
            logger.info(f"Graph chunk received for {event_id}: {list(chunk.keys())}")
            # Check state
            current_state = await culling_graph.aget_state(config)
            if current_state and current_state.values:
                vals = current_state.values
                active_culling_jobs[event_id] = {
                    "status": vals.get("status", "processing"),
                    "progress_pct": vals.get("progress_pct", 50.0),
                    "stage": vals.get("status", "processing"),
                    "total_photos": len(vals.get("all_photos", [])),
                    "total_discards": len(vals.get("discard_candidates", [])),
                    "total_keepers": len(vals.get("keeper_candidates", [])),
                    "current_batch_index": vals.get("current_batch_index", 0),
                    "is_interrupted": len(current_state.next) > 0 and "batch_review_node" in current_state.next,
                }

        # Check final checkpoint
        final_state = await culling_graph.aget_state(config)
        is_interrupted = len(final_state.next) > 0
        active_culling_jobs[event_id] = {
            "status": "awaiting_hitl_approval" if is_interrupted else "completed",
            "progress_pct": 60.0 if is_interrupted else 100.0,
            "stage": "awaiting_hitl_approval" if is_interrupted else "completed",
            "is_interrupted": is_interrupted,
            "total_photos": len(final_state.values.get("all_photos", [])),
            "total_discards": len(final_state.values.get("discard_candidates", [])),
            "total_keepers": len(final_state.values.get("keeper_candidates", [])),
            "current_batch_index": final_state.values.get("current_batch_index", 0),
        }

    except Exception as exc:
        logger.error(f"Error executing culling graph for event {event_id}: {exc}", exc_info=True)
        active_culling_jobs[event_id] = {
            "status": "failed",
            "progress_pct": 0.0,
            "error": str(exc),
            "is_interrupted": False,
        }


@router.post("/{event_id}/start")
async def start_culling_pipeline(
    event_id: str,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Initiates the multi-tier AI culling workflow (Tier 1 CV -> Tier 2 Grouping -> Tier 3 VLM -> HITL).
    """
    db = get_db()
    photos = []
    if db is not None:
        cursor = db.photos.find({"event_id": event_id}, {"_id": 0})
        photos = await cursor.to_list(length=1000)

    if not photos:
        # Check files from disk directory
        from app.services.file_storage import get_event_upload_dir
        upload_dir = get_event_upload_dir(event_id)
        image_files = list(upload_dir.glob("*.jpg")) + list(upload_dir.glob("*.png")) + list(upload_dir.glob("*.jpeg"))
        if not image_files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No photos found for event {event_id}. Please upload photos first.",
            )
        for f in image_files:
            pid = f.stem
            photos.append({
                "photo_id": pid,
                "event_id": event_id,
                "original_filename": f.name,
                "file_path": str(f),
                "file_name": f.name,
            })

    # Start background task
    background_tasks.add_task(_execute_graph_task, event_id, photos)

    return {
        "success": True,
        "event_id": event_id,
        "message": f"Culling pipeline initiated for {len(photos)} photos.",
        "status": "processing",
    }


@router.get("/{event_id}/status")
async def get_culling_status(event_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    """
    Checks real-time progress and HITL pause status of the culling pipeline.
    """
    config = {"configurable": {"thread_id": event_id}}
    graph_state = await culling_graph.aget_state(config)

    job_info = active_culling_jobs.get(event_id, {
        "status": "not_started",
        "progress_pct": 0.0,
        "is_interrupted": False,
    })

    if graph_state and graph_state.values:
        vals = graph_state.values
        is_interrupted = len(graph_state.next) > 0
        tasks = graph_state.tasks
        interrupt_value = None
        if tasks and len(tasks) > 0 and len(tasks[0].interrupts) > 0:
            interrupt_value = tasks[0].interrupts[0].value

        job_info.update({
            "status": "awaiting_hitl_approval" if is_interrupted else vals.get("status", "completed"),
            "progress_pct": vals.get("progress_pct", 100.0 if not is_interrupted else 60.0),
            "total_photos": len(vals.get("all_photos", [])),
            "total_discards": len(vals.get("discard_candidates", [])),
            "total_keepers": len(vals.get("keeper_candidates", [])),
            "current_batch_index": vals.get("current_batch_index", 0),
            "is_interrupted": is_interrupted,
            "interrupt_data": interrupt_value,
        })

    return {"event_id": event_id, **job_info}


@router.get("/{event_id}/results")
async def get_culling_results(event_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    """
    Retrieves full evaluation breakdown, keeper gallery, discard gallery, and burst clusters.
    """
    config = {"configurable": {"thread_id": event_id}}
    graph_state = await culling_graph.aget_state(config)

    db = get_db()
    photos = []
    if db is not None:
        cursor = db.photos.find({"event_id": event_id}, {"_id": 0})
        photos = await cursor.to_list(length=1000)

    if graph_state and graph_state.values:
        vals = graph_state.values
        return {
            "event_id": event_id,
            "status": vals.get("status"),
            "total_photos": len(vals.get("all_photos", [])),
            "burst_clusters": vals.get("burst_clusters", []),
            "discard_candidates": vals.get("discard_candidates", []),
            "keeper_candidates": vals.get("keeper_candidates", []),
            "approved_deletions": vals.get("approved_deletions", []),
            "saved_keepers": vals.get("saved_keepers", []),
        }

    # Fallback to database query
    keepers = [p for p in photos if p.get("suggested_action") == "keep" or p.get("status") == "approved_keeper"]
    discards = [p for p in photos if p.get("suggested_action") == "discard" or p.get("status") == "staged_recycle_bin"]

    return {
        "event_id": event_id,
        "status": "ready",
        "total_photos": len(photos),
        "burst_clusters": [],
        "discard_candidates": discards,
        "keeper_candidates": keepers,
        "approved_deletions": [p["photo_id"] for p in discards if p.get("status") == "staged_recycle_bin"],
        "saved_keepers": [p["photo_id"] for p in keepers],
    }
