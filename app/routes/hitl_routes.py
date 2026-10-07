import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from langgraph.types import Command

from app.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, AuthenticatedUser
from app.workflows.culling_graph import culling_graph

logger = logging.getLogger("photo_culling.hitl_routes")
router = APIRouter(prefix="/api/hitl", tags=["Human-in-the-Loop (HITL) Batching"])


class ResumeBatchDecisionRequest(BaseModel):
    confirmed_discards: List[str] = Field(
        default_factory=list,
        description="List of photo IDs confirmed by studio owner to be discarded to .recycle_bin",
    )
    rescued_keepers: List[str] = Field(
        default_factory=list,
        description="List of photo IDs that the studio owner decided to rescue and keep",
    )


@router.get("/{event_id}/pending-batch")
async def get_pending_batch(event_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    """
    Returns the current paused 50-photo batch awaiting human approval.
    """
    config = {"configurable": {"thread_id": event_id}}
    graph_state = await culling_graph.aget_state(config)

    if not graph_state or not graph_state.values:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active culling job found for event {event_id}.",
        )

    tasks = graph_state.tasks
    interrupt_payload = None

    if tasks and len(tasks) > 0 and len(tasks[0].interrupts) > 0:
        interrupt_payload = tasks[0].interrupts[0].value

    if not interrupt_payload:
        # Check if batch can be constructed from state
        vals = graph_state.values
        candidates = vals.get("discard_candidates", [])
        b_idx = vals.get("current_batch_index", 0)
        current_slice = candidates[b_idx : b_idx + settings.HITL_BATCH_SIZE]
        
        if not current_slice:
            return {
                "event_id": event_id,
                "has_pending_batch": False,
                "message": "No pending batches requiring review. Culling completed.",
                "total_candidates": len(candidates),
                "items": [],
            }

        batch_num = (b_idx // settings.HITL_BATCH_SIZE) + 1
        total_batches = (len(candidates) + settings.HITL_BATCH_SIZE - 1) // settings.HITL_BATCH_SIZE

        return {
            "event_id": event_id,
            "has_pending_batch": True,
            "batch_index": b_idx,
            "batch_number": batch_num,
            "total_batches": total_batches,
            "batch_size": len(current_slice),
            "total_candidates": len(candidates),
            "items": current_slice,
        }

    return {
        "event_id": event_id,
        "has_pending_batch": True,
        **interrupt_payload,
    }


@router.post("/{event_id}/resume")
async def resume_hitl_batch(
    event_id: str,
    decision: ResumeBatchDecisionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Submits human studio owner decisions for the current 50-photo batch and resumes graph execution.
    """
    config = {"configurable": {"thread_id": event_id}}
    graph_state = await culling_graph.aget_state(config)

    if not graph_state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Culling session not found for event {event_id}.",
        )

    logger.info(
        f"Resuming HITL decision for event {event_id}: {len(decision.confirmed_discards)} discards, {len(decision.rescued_keepers)} rescues."
    )

    resume_payload = {
        "confirmed_discards": decision.confirmed_discards,
        "rescued_keepers": decision.rescued_keepers,
    }

    try:
        # Resume the paused graph using Command(resume=...)
        async for chunk in culling_graph.astream(
            Command(resume=resume_payload),
            config=config,
        ):
            logger.info(f"Graph resumed chunk: {list(chunk.keys())}")

        # Check subsequent state
        updated_state = await culling_graph.aget_state(config)
        is_next_batch_pending = len(updated_state.next) > 0 and "batch_review_node" in updated_state.next

        return {
            "success": True,
            "event_id": event_id,
            "has_more_batches": is_next_batch_pending,
            "status": "awaiting_next_batch" if is_next_batch_pending else "completed",
            "progress_pct": updated_state.values.get("progress_pct", 100.0),
        }
    except Exception as e:
        logger.error(f"Failed to resume graph for event {event_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error resuming culling workflow: {str(e)}",
        )
