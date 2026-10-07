import asyncio
import logging
from typing import Dict, Any, List, Optional
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command

from app.config import settings
from app.workflows.state import CullingWorkflowState
from app.services.cv_filter import run_tier1_cv_filter, cluster_burst_duplicates
from app.services.vector_rag import cluster_photos_by_similarity
from app.services.vlm_analyzer import analyze_photo_vlm
from app.services.file_storage import move_to_recycle_bin, move_to_approved
from app.core.database import get_db

logger = logging.getLogger("photo_culling.culling_graph")

# In-memory checkpointer for LangGraph state persistence across interrupts
checkpointer = MemorySaver()


async def tier1_cv_node(state: CullingWorkflowState) -> Dict[str, Any]:
    """
    Tier 1 Node: Rapid local computer vision filtering for motion blur,
    camera shake, and DCT perceptual hashing.
    """
    logger.info(f"[Tier 1] Starting CV pre-filter for event: {state['event_id']} ({len(state['all_photos'])} photos)")
    photos = state["all_photos"]
    tier1_results = []

    for photo in photos:
        res = run_tier1_cv_filter(photo, blur_threshold=settings.LAPLACIAN_BLUR_THRESHOLD)
        photo.update(res)
        tier1_results.append(res)

    return {
        "tier1_results": tier1_results,
        "all_photos": photos,
        "status": "tier1_completed",
        "progress_pct": 25.0,
    }


async def tier2_and_3_evaluation_node(state: CullingWorkflowState) -> Dict[str, Any]:
    """
    Tier 2 (Vector Grouping) & Tier 3 (VLM Aesthetic & Facial Inspection) Node.
    Groups near-identical poses and performs Gemini/Pixtral analysis.
    """
    logger.info(f"[Tier 2 & 3] Starting Vector Grouping & VLM analysis for event: {state['event_id']}")
    photos = state["all_photos"]

    # 1. Tier 2: Vector & Burst Clustering
    clustering_res = cluster_photos_by_similarity(photos)
    burst_clusters = clustering_res.get("clusters", [])
    redundant_ids = set(clustering_res.get("redundant_photo_ids", []))

    # 2. Tier 3: VLM Evaluation with concurrency semaphore
    semaphore = asyncio.Semaphore(10)
    vlm_evaluations: Dict[str, Any] = {}

    tasks = [analyze_photo_vlm(photo, semaphore=semaphore) for photo in photos]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    discard_candidates: List[Dict[str, Any]] = []
    keeper_candidates: List[Dict[str, Any]] = []

    db = get_db()

    for idx, res in enumerate(results):
        photo = photos[idx]
        pid = photo["photo_id"]

        if isinstance(res, Exception):
            logger.error(f"VLM evaluation failed for photo {pid}: {res}")
            # Fallback assessment
            from app.services.vlm_analyzer import _generate_fallback_heuristic_assessment
            assessment = _generate_fallback_heuristic_assessment(photo)
        else:
            assessment = res

        assessment_dict = assessment.model_dump()
        vlm_evaluations[pid] = assessment_dict

        # Combine CV & VLM logic
        is_burst_duplicate = pid in redundant_ids
        should_discard = (
            assessment.recommend_discard
            or assessment.eyes_closed_detected
            or assessment.motion_blur_detected
            or assessment.aesthetic_score < settings.VLM_MIN_AESTHETIC_SCORE
            or is_burst_duplicate
        )

        defect = assessment.primary_defect
        if not defect and is_burst_duplicate:
            defect = "burst_redundancy"
        elif not defect and should_discard:
            defect = "low_aesthetic_quality"

        candidate_record = {
            **photo,
            "assessment": assessment_dict,
            "is_burst_duplicate": is_burst_duplicate,
            "defect_reason": defect,
            "suggested_action": "discard" if should_discard else "keep",
        }

        if should_discard:
            discard_candidates.append(candidate_record)
        else:
            keeper_candidates.append(candidate_record)

        # Update DB if available
        if db is not None:
            try:
                await db.photos.update_one(
                    {"event_id": state["event_id"], "photo_id": pid},
                    {
                        "$set": {
                            "cv_metrics": {
                                "laplacian_variance": photo.get("laplacian_variance"),
                                "phash": photo.get("phash"),
                                "exposure": photo.get("exposure"),
                            },
                            "vlm_assessment": assessment_dict,
                            "suggested_action": "discard" if should_discard else "keep",
                            "defect_reason": defect,
                        }
                    },
                )
            except Exception as e:
                logger.error(f"Failed to update MongoDB photo {pid}: {e}")

    logger.info(
        f"[Tier 2 & 3] Evaluation completed: {len(keeper_candidates)} keepers, {len(discard_candidates)} discard candidates."
    )

    return {
        "burst_clusters": burst_clusters,
        "vlm_evaluations": vlm_evaluations,
        "discard_candidates": discard_candidates,
        "keeper_candidates": keeper_candidates,
        "current_batch_index": 0,
        "status": "awaiting_hitl_approval",
        "progress_pct": 60.0,
    }


async def batch_review_node(state: CullingWorkflowState) -> Dict[str, Any]:
    """
    Node 3 (HITL Batching): Slices exactly 50 candidates from discard_candidates
    and executes an interrupt() to pause the LangGraph workflow for studio owner review.
    """
    candidates = state.get("discard_candidates", [])
    batch_idx = state.get("current_batch_index", 0)
    batch_size = settings.HITL_BATCH_SIZE

    # Slice the 50-photo batch
    current_slice = candidates[batch_idx : batch_idx + batch_size]
    total_candidates = len(candidates)
    batch_num = (batch_idx // batch_size) + 1
    total_batches = (total_candidates + batch_size - 1) // batch_size if total_candidates > 0 else 1

    logger.info(
        f"[HITL Node] Interrupting for Batch {batch_num}/{total_batches} ({len(current_slice)} photos) for event: {state['event_id']}"
    )

    # Trigger LangGraph interrupt payload
    user_decision = interrupt({
        "event_id": state["event_id"],
        "batch_index": batch_idx,
        "batch_number": batch_num,
        "total_batches": total_batches,
        "batch_size": len(current_slice),
        "total_candidates": total_candidates,
        "items": current_slice,
        "message": f"Please approve or rescue items in Batch {batch_num} of {total_batches}.",
    })

    # When resumed via Command(resume=...), user_decision contains the confirmed discards and rescues
    approved_deletions = list(state.get("approved_deletions", []))
    saved_keepers = list(state.get("saved_keepers", []))

    if user_decision and isinstance(user_decision, dict):
        new_discards = user_decision.get("confirmed_discards", [])
        new_rescues = user_decision.get("rescued_keepers", [])
        approved_deletions.extend(new_discards)
        saved_keepers.extend(new_rescues)
    else:
        # Default if user approved whole batch without modifications
        for item in current_slice:
            approved_deletions.append(item["photo_id"])

    next_index = batch_idx + batch_size
    progress = 60.0 + (35.0 * (min(next_index, total_candidates) / max(total_candidates, 1)))

    return {
        "current_batch_index": next_index,
        "current_batch": current_slice,
        "approved_deletions": approved_deletions,
        "saved_keepers": saved_keepers,
        "progress_pct": round(progress, 1),
    }


def router_has_more_batches(state: CullingWorkflowState) -> str:
    """
    Router determining whether more 50-photo batches remain or if workflow can proceed to final commit.
    """
    candidates = state.get("discard_candidates", [])
    batch_idx = state.get("current_batch_index", 0)

    if batch_idx < len(candidates):
        return "batch_review_node"
    return "commit_discards_node"


async def commit_discards_node(state: CullingWorkflowState) -> Dict[str, Any]:
    """
    Node 5: Finalizes all decisions. Safely moves confirmed discards to .recycle_bin/,
    moves keepers to approved/, and updates final event metrics in MongoDB.
    """
    event_id = state["event_id"]
    logger.info(f"[Commit Node] Finalizing decisions for event: {event_id}")

    approved_deletions = set(state.get("approved_deletions", []))
    saved_keepers = set(state.get("saved_keepers", []))

    # Process discards
    for photo in state.get("discard_candidates", []):
        pid = photo["photo_id"]
        if pid in approved_deletions and pid not in saved_keepers:
            await move_to_recycle_bin(
                event_id=event_id,
                photo_id=pid,
                defect_reason=photo.get("defect_reason", "vlm_cull"),
                assessment=photo.get("assessment"),
            )
        else:
            await move_to_approved(event_id, pid)

    # Process natural keepers
    for photo in state.get("keeper_candidates", []):
        pid = photo["photo_id"]
        await move_to_approved(event_id, pid)

    # Update event summary in DB
    db = get_db()
    if db is not None:
        try:
            await db.events.update_one(
                {"event_id": event_id},
                {
                    "$set": {
                        "status": "completed",
                        "total_photos": len(state["all_photos"]),
                        "total_keepers": len(state["keeper_candidates"]) + len(saved_keepers),
                        "total_discards": len(approved_deletions),
                        "completed_at": None,
                    }
                },
            )
        except Exception as e:
            logger.error(f"Failed to update MongoDB event {event_id}: {e}")

    return {
        "status": "completed",
        "progress_pct": 100.0,
    }


def build_culling_graph():
    """Constructs the LangGraph state machine with interrupt checkpointing."""
    builder = StateGraph(CullingWorkflowState)

    builder.add_node("tier1_cv_node", tier1_cv_node)
    builder.add_node("tier2_and_3_evaluation_node", tier2_and_3_evaluation_node)
    builder.add_node("batch_review_node", batch_review_node)
    builder.add_node("commit_discards_node", commit_discards_node)

    builder.add_edge(START, "tier1_cv_node")
    builder.add_edge("tier1_cv_node", "tier2_and_3_evaluation_node")
    builder.add_edge("tier2_and_3_evaluation_node", "batch_review_node")

    builder.add_conditional_edges(
        "batch_review_node",
        router_has_more_batches,
        {
            "batch_review_node": "batch_review_node",
            "commit_discards_node": "commit_discards_node",
        },
    )

    builder.add_edge("commit_discards_node", END)

    return builder.compile(checkpointer=checkpointer)


# Singleton compiled graph instance
culling_graph = build_culling_graph()
