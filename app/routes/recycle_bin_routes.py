import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import get_current_user, AuthenticatedUser
from app.services.file_storage import (
    restore_photo,
    empty_recycle_bin,
    read_recycle_bin_manifest,
)

logger = logging.getLogger("photo_culling.recycle_bin_routes")
router = APIRouter(prefix="/api/recycle-bin", tags=["Recycle Bin & Safe Recovery"])


class RestorePhotosRequest(BaseModel):
    photo_ids: List[str] = Field(..., description="List of photo IDs to restore from the recycle bin")


@router.get("/{event_id}")
async def list_recycle_bin_items(event_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    """
    Lists all staged discards currently in the event's .recycle_bin along with defect reasons.
    """
    manifest = read_recycle_bin_manifest(event_id)
    items = list(manifest.get("items", {}).values())

    # Complement with DB data if available
    db = get_db()
    if db is not None:
        try:
            cursor = db.photos.find({"event_id": event_id, "status": "staged_recycle_bin"}, {"_id": 0})
            db_items = await cursor.to_list(length=1000)
            if db_items:
                # Merge or use DB items
                return {
                    "event_id": event_id,
                    "count": len(db_items),
                    "items": db_items,
                    "manifest_updated_at": manifest.get("updated_at"),
                }
        except Exception as e:
            logger.error(f"MongoDB recycle_bin fetch error: {e}")

    return {
        "event_id": event_id,
        "count": len(items),
        "items": items,
        "manifest_updated_at": manifest.get("updated_at"),
    }


@router.get("/{event_id}/manifest")
async def get_manifest(event_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    """
    Returns the JSON audit manifest for the event's recycle bin.
    """
    return read_recycle_bin_manifest(event_id)


@router.post("/{event_id}/restore")
async def restore_photos_endpoint(
    event_id: str,
    req: RestorePhotosRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Restores specified photo IDs from .recycle_bin back to approved keepers.
    """
    restored_items = []
    for pid in req.photo_ids:
        try:
            res = await restore_photo(event_id, pid)
            restored_items.append(res)
        except Exception as e:
            logger.error(f"Failed to restore photo {pid}: {e}")

    return {
        "success": True,
        "event_id": event_id,
        "restored_count": len(restored_items),
        "restored_items": restored_items,
    }


@router.post("/{event_id}/purge")
async def purge_recycle_bin(event_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    """
    Permanently deletes all files staged in the recycle bin for this event.
    """
    result = await empty_recycle_bin(event_id)
    return {
        "success": True,
        "event_id": event_id,
        "message": f"Purged {result.get('purged_count', 0)} files from recycle bin.",
        **result,
    }
