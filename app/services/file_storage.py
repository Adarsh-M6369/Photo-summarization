import os
import shutil
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from app.config import settings
from app.core.database import get_db

logger = logging.getLogger("photo_culling.file_storage")


def get_event_upload_dir(event_id: str) -> Path:
    p = settings.uploads_dir / event_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_event_approved_dir(event_id: str) -> Path:
    p = settings.approved_dir / event_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_event_recycle_bin_dir(event_id: str) -> Path:
    p = settings.recycle_bin_dir / event_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_event_thumbnail_dir(event_id: str) -> Path:
    p = settings.thumbnails_dir / event_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def _get_manifest_path(event_id: str) -> Path:
    return get_event_recycle_bin_dir(event_id) / "manifest.json"


def read_recycle_bin_manifest(event_id: str) -> Dict[str, Any]:
    manifest_file = _get_manifest_path(event_id)
    if not manifest_file.exists():
        return {"event_id": event_id, "items": {}, "updated_at": datetime.now(timezone.utc).isoformat()}
    try:
        with open(manifest_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error reading manifest {manifest_file}: {e}")
        return {"event_id": event_id, "items": {}, "updated_at": datetime.now(timezone.utc).isoformat()}


def write_recycle_bin_manifest(event_id: str, data: Dict[str, Any]):
    manifest_file = _get_manifest_path(event_id)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        with open(manifest_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Error writing manifest {manifest_file}: {e}")


async def save_uploaded_photo(event_id: str, photo_id: str, original_filename: str, file_bytes: bytes) -> Dict[str, Any]:
    """
    Saves an uploaded photo file into the event's raw uploads directory and returns metadata.
    """
    upload_dir = get_event_upload_dir(event_id)
    ext = Path(original_filename).suffix.lower() or ".jpg"
    filename = f"{photo_id}{ext}"
    target_path = upload_dir / filename

    with open(target_path, "wb") as f:
        f.write(file_bytes)

    # Generate thumbnail
    thumb_dir = get_event_thumbnail_dir(event_id)
    thumb_path = thumb_dir / f"{photo_id}_thumb.jpg"
    from app.services.cv_filter import generate_thumbnail
    generate_thumbnail(str(target_path), str(thumb_path))

    return {
        "photo_id": photo_id,
        "event_id": event_id,
        "original_filename": original_filename,
        "file_name": filename,
        "file_path": str(target_path),
        "thumbnail_path": str(thumb_path),
        "file_size": len(file_bytes),
        "status": "pending_culling",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def move_to_recycle_bin(
    event_id: str,
    photo_id: str,
    defect_reason: Optional[str] = "unspecified_defect",
    assessment: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Safely moves a discarded photo from storage/uploads/{event_id} to storage/.recycle_bin/{event_id},
    updates the JSON manifest and MongoDB record.
    """
    upload_dir = get_event_upload_dir(event_id)
    recycle_dir = get_event_recycle_bin_dir(event_id)

    # Locate the file
    matching_files = list(upload_dir.glob(f"{photo_id}.*"))
    if not matching_files:
        # Check approved dir just in case
        matching_files = list(get_event_approved_dir(event_id).glob(f"{photo_id}.*"))

    if not matching_files:
        logger.warning(f"File for photo_id {photo_id} not found in uploads or approved for event {event_id}")
        current_path = None
        target_path = None
    else:
        current_file = matching_files[0]
        current_path = str(current_file)
        target_file = recycle_dir / current_file.name
        target_path = str(target_file)
        shutil.move(current_path, target_path)

    timestamp = datetime.now(timezone.utc).isoformat()
    manifest_item = {
        "photo_id": photo_id,
        "event_id": event_id,
        "original_path": current_path,
        "recycle_bin_path": target_path,
        "defect_reason": defect_reason,
        "assessment": assessment or {},
        "discarded_at": timestamp,
    }

    # Update Manifest JSON file
    manifest = read_recycle_bin_manifest(event_id)
    manifest["items"][photo_id] = manifest_item
    write_recycle_bin_manifest(event_id, manifest)

    # Update MongoDB if available
    db = get_db()
    if db is not None:
        try:
            await db.photos.update_one(
                {"event_id": event_id, "photo_id": photo_id},
                {
                    "$set": {
                        "status": "staged_recycle_bin",
                        "file_path": target_path,
                        "defect_reason": defect_reason,
                        "discarded_at": timestamp,
                        "recycle_bin_meta": manifest_item,
                    }
                },
            )
            await db.recycle_bin.update_one(
                {"event_id": event_id, "photo_id": photo_id},
                {"$set": manifest_item},
                upsert=True,
            )
        except Exception as e:
            logger.error(f"MongoDB update failed during move_to_recycle_bin: {e}")

    logger.info(f"Photo {photo_id} moved to .recycle_bin for event {event_id}")
    return manifest_item


async def move_to_approved(event_id: str, photo_id: str) -> Dict[str, Any]:
    """
    Moves a keeper photo to storage/approved/{event_id}.
    """
    upload_dir = get_event_upload_dir(event_id)
    approved_dir = get_event_approved_dir(event_id)

    matching_files = list(upload_dir.glob(f"{photo_id}.*"))
    if matching_files:
        current_file = matching_files[0]
        target_file = approved_dir / current_file.name
        shutil.move(str(current_file), str(target_file))
        new_path = str(target_file)
    else:
        new_path = str(upload_dir / f"{photo_id}.jpg")

    db = get_db()
    if db is not None:
        try:
            await db.photos.update_one(
                {"event_id": event_id, "photo_id": photo_id},
                {"$set": {"status": "approved_keeper", "file_path": new_path}},
            )
        except Exception as e:
            logger.error(f"MongoDB update error: {e}")

    return {"photo_id": photo_id, "status": "approved_keeper", "file_path": new_path}


async def restore_photo(event_id: str, photo_id: str) -> Dict[str, Any]:
    """
    Restores a photo from .recycle_bin back to active uploads or approved pool.
    """
    recycle_dir = get_event_recycle_bin_dir(event_id)
    upload_dir = get_event_upload_dir(event_id)

    matching_files = list(recycle_dir.glob(f"{photo_id}.*"))
    if matching_files:
        current_file = matching_files[0]
        target_file = upload_dir / current_file.name
        shutil.move(str(current_file), str(target_file))
        restored_path = str(target_file)
    else:
        restored_path = str(upload_dir / f"{photo_id}.jpg")

    # Update Manifest JSON
    manifest = read_recycle_bin_manifest(event_id)
    if photo_id in manifest.get("items", {}):
        del manifest["items"][photo_id]
        write_recycle_bin_manifest(event_id, manifest)

    # Update MongoDB
    db = get_db()
    if db is not None:
        try:
            await db.photos.update_one(
                {"event_id": event_id, "photo_id": photo_id},
                {
                    "$set": {
                        "status": "approved_keeper",
                        "file_path": restored_path,
                        "restored_at": datetime.now(timezone.utc).isoformat(),
                    },
                    "$unset": {"defect_reason": "", "recycle_bin_meta": ""},
                },
            )
            await db.recycle_bin.delete_one({"event_id": event_id, "photo_id": photo_id})
        except Exception as e:
            logger.error(f"MongoDB restore update error: {e}")

    logger.info(f"Photo {photo_id} restored from .recycle_bin for event {event_id}")
    return {"photo_id": photo_id, "status": "restored", "file_path": restored_path}


async def empty_recycle_bin(event_id: str) -> Dict[str, Any]:
    """
    Permanently purges all files in the event's .recycle_bin directory and clears manifest.
    """
    recycle_dir = get_event_recycle_bin_dir(event_id)
    purged_count = 0

    if recycle_dir.exists():
        for item in recycle_dir.iterdir():
            if item.is_file() and item.name != ".gitkeep":
                try:
                    item.unlink()
                    purged_count += 1
                except Exception as e:
                    logger.error(f"Failed to delete {item}: {e}")

    # Re-initialize empty manifest
    write_recycle_bin_manifest(event_id, {"event_id": event_id, "items": {}, "purged_at": datetime.now(timezone.utc).isoformat()})

    # MongoDB cleanup
    db = get_db()
    if db is not None:
        try:
            await db.photos.delete_many({"event_id": event_id, "status": "staged_recycle_bin"})
            await db.recycle_bin.delete_many({"event_id": event_id})
        except Exception as e:
            logger.error(f"MongoDB purge error: {e}")

    return {"event_id": event_id, "purged_count": purged_count, "status": "purged"}
