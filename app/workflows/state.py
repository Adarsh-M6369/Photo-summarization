from typing import TypedDict, List, Dict, Any, Optional


class CullingWorkflowState(TypedDict):
    event_id: str
    all_photos: List[Dict[str, Any]]
    tier1_results: List[Dict[str, Any]]
    burst_clusters: List[Dict[str, Any]]
    vlm_evaluations: Dict[str, Any]
    discard_candidates: List[Dict[str, Any]]
    keeper_candidates: List[Dict[str, Any]]
    current_batch_index: int
    current_batch: List[Dict[str, Any]]
    approved_deletions: List[str]
    saved_keepers: List[str]
    status: str
    progress_pct: float
    error: Optional[str]
