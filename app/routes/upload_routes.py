import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont
import numpy as np

from app.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, AuthenticatedUser
from app.services.file_storage import save_uploaded_photo, get_event_upload_dir

logger = logging.getLogger("photo_culling.upload_routes")
router = APIRouter(prefix="/api/upload", tags=["Upload & Events"])


class CreateEventRequest(BaseModel):
    title: str
    client_name: Optional[str] = "Private Client"
    shoot_type: Optional[str] = "Wedding & Reception"
    event_date: Optional[str] = None
    notes: Optional[str] = None


@router.post("/event")
async def create_event(
    req: CreateEventRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Registers a new event shoot session for batch photo culling.
    """
    event_id = f"evt_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()

    event_record = {
        "event_id": event_id,
        "title": req.title,
        "client_name": req.client_name,
        "shoot_type": req.shoot_type,
        "event_date": req.event_date or now[:10],
        "notes": req.notes,
        "created_by": user.user_id,
        "created_at": now,
        "status": "created",
        "photo_count": 0,
        "total_keepers": 0,
        "total_discards": 0,
    }

    db = get_db()
    if db is not None:
        try:
            await db.events.insert_one(event_record)
        except Exception as e:
            logger.error(f"Failed to insert event into MongoDB: {e}")

    # Ensure storage folder
    get_event_upload_dir(event_id)

    return {
        "success": True,
        "event_id": event_id,
        "event": {k: v for k, v in event_record.items() if k != "_id"},
    }


@router.get("/events")
async def list_events(user: AuthenticatedUser = Depends(get_current_user)):
    """
    Returns list of all photo culling events.
    """
    db = get_db()
    if db is not None:
        try:
            cursor = db.events.find({}, {"_id": 0}).sort("created_at", -1)
            events = await cursor.to_list(length=100)
            return {"events": events}
        except Exception as e:
            logger.error(f"MongoDB list_events error: {e}")

    return {"events": []}


@router.get("/{event_id}")
async def get_event_details(event_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    """
    Gets details and photo summary for a specific event.
    """
    db = get_db()
    if db is not None:
        evt = await db.events.find_one({"event_id": event_id}, {"_id": 0})
        if evt:
            photos_count = await db.photos.count_documents({"event_id": event_id})
            keepers_count = await db.photos.count_documents({"event_id": event_id, "status": "approved_keeper"})
            discards_count = await db.photos.count_documents({"event_id": event_id, "status": "staged_recycle_bin"})
            evt["photo_count"] = photos_count
            evt["total_keepers"] = keepers_count
            evt["total_discards"] = discards_count
            return {"event": evt}

    return {
        "event": {
            "event_id": event_id,
            "title": f"Event {event_id}",
            "status": "ready",
            "photo_count": 0,
        }
    }


@router.post("/{event_id}/photos")
async def upload_photos(
    event_id: str,
    files: List[UploadFile] = File(...),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Uploads batch of raw event photos (supports hundreds of files).
    """
    db = get_db()
    uploaded_records = []

    for file in files:
        photo_id = f"img_{uuid.uuid4().hex[:12]}"
        content = await file.read()
        
        record = await save_uploaded_photo(
            event_id=event_id,
            photo_id=photo_id,
            original_filename=file.filename or f"{photo_id}.jpg",
            file_bytes=content,
        )

        if db is not None:
            try:
                await db.photos.insert_one(record)
            except Exception as e:
                logger.error(f"Failed to insert photo {photo_id} into MongoDB: {e}")

        # Remove raw non-serializable properties for response
        clean_record = {k: v for k, v in record.items() if k != "_id"}
        uploaded_records.append(clean_record)

    # Update event photo count
    if db is not None:
        try:
            total_count = await db.photos.count_documents({"event_id": event_id})
            await db.events.update_one(
                {"event_id": event_id},
                {"$set": {"photo_count": total_count, "status": "photos_uploaded"}},
            )
        except Exception as e:
            logger.error(f"Failed to update event photo count: {e}")

    return {
        "success": True,
        "event_id": event_id,
        "uploaded_count": len(uploaded_records),
        "photos": uploaded_records[:20],  # sample first 20 in response
    }


@router.post("/{event_id}/generate-demo-dataset")
async def generate_demo_dataset(
    event_id: str,
    count: int = 55,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Generates a realistic synthetic photo dataset for demo/evaluation containing:
    - Crystal clear portraits & candid shots
    - Burst sequences with slight variations & duplicate expressions
    - Blurry / camera-shake shots with low Laplacian variance
    - Underexposed and overexposed shots
    """
    from io import BytesIO

    generated_records = []
    db = get_db()
    
    # Palette themes
    themes = [
        {"bg": (220, 230, 242), "accent": (45, 85, 125), "label": "Bride & Groom Portrait"},
        {"bg": (245, 235, 220), "accent": (160, 90, 40), "label": "Ceremony Exchange"},
        {"bg": (230, 240, 230), "accent": (50, 120, 60), "label": "Reception Toast"},
        {"bg": (240, 225, 235), "accent": (130, 45, 95), "label": "First Dance"},
        {"bg": (225, 235, 245), "accent": (50, 70, 140), "label": "Family Formal"},
    ]

    for i in range(1, count + 1):
        theme = themes[(i - 1) % len(themes)]
        pid = f"demo_{uuid.uuid4().hex[:8]}_{i:03d}"
        
        # Decide characteristic for variety
        is_burst = (10 <= i <= 15) or (30 <= i <= 36)
        is_blurry = (i % 6 == 0) and not is_burst
        is_dark = (i % 11 == 0) and not is_blurry
        is_bright = (i % 13 == 0) and not is_blurry and not is_dark

        # Create PIL canvas (800x600)
        img = Image.new("RGB", (800, 600), color=theme["bg"])
        draw = ImageDraw.Draw(img)

        # Draw decorative studio portrait shapes
        cx, cy = 400, 280
        accent_color = theme["accent"]
        if is_dark:
            accent_color = (25, 25, 30)
            img = Image.new("RGB", (800, 600), color=(30, 32, 35))
            draw = ImageDraw.Draw(img)
        elif is_bright:
            accent_color = (240, 240, 245)
            img = Image.new("RGB", (800, 600), color=(250, 250, 252))
            draw = ImageDraw.Draw(img)

        # Subject head & shoulders silhouette
        draw.ellipse([cx - 90, cy - 130, cx + 90, cy + 60], fill=accent_color)
        draw.ellipse([cx - 160, cy + 50, cx + 160, cy + 300], fill=accent_color)

        # Face details / Eyes
        eye_color = (255, 255, 255) if not is_dark else (80, 80, 80)
        pupil_color = (30, 30, 30)

        # Closed eyes defect for some items
        has_closed_eyes = (i % 7 == 0)
        if has_closed_eyes:
            # Draw closed eye slits
            draw.line([cx - 45, cy - 40, cx - 15, cy - 40], fill=(20, 20, 20), width=4)
            draw.line([cx + 15, cy - 40, cx + 45, cy - 40], fill=(20, 20, 20), width=4)
        else:
            # Open eyes
            draw.ellipse([cx - 45, cy - 50, cx - 15, cy - 30], fill=eye_color)
            draw.ellipse([cx - 35, cy - 45, cx - 25, cy - 35], fill=pupil_color)
            draw.ellipse([cx + 15, cy - 50, cx + 45, cy - 30], fill=eye_color)
            draw.ellipse([cx + 25, cy - 45, cx + 35, cy - 35], fill=pupil_color)

        # Smile
        draw.arc([cx - 30, cy - 10, cx + 30, cy + 25], start=0, end=180, fill=(20, 20, 20), width=3)

        # Studio watermark & info badge
        tag = f"Frame #{i:03d} | {theme['label']}"
        if is_burst:
            tag += " [Burst Sequence]"
        elif is_blurry:
            tag += " [Motion Shake]"
        elif has_closed_eyes:
            tag += " [Mid-Blink]"

        draw.rectangle([20, 530, 780, 580], fill=(20, 25, 35))
        draw.text((40, 545), tag, fill=(240, 245, 255))

        # Apply motion blur filter if flagged
        if is_blurry:
            # Convert to numpy and blur heavily
            arr = np.array(img)
            import cv2
            kernel_size = 25
            kernel = np.zeros((kernel_size, kernel_size))
            kernel[int((kernel_size - 1) / 2), :] = np.ones(kernel_size)
            kernel = kernel / kernel_size
            blurred = cv2.filter2D(arr, -1, kernel)
            img = Image.fromarray(blurred)

        buf = BytesIO()
        img.save(buf, format="JPEG", quality=90)
        file_bytes = buf.getvalue()

        record = await save_uploaded_photo(
            event_id=event_id,
            photo_id=pid,
            original_filename=f"IMG_{i:04d}.jpg",
            file_bytes=file_bytes,
        )

        if db is not None:
            try:
                await db.photos.insert_one(record)
            except Exception as e:
                logger.error(f"DB insert error: {e}")

        clean_record = {k: v for k, v in record.items() if k != "_id"}
        generated_records.append(clean_record)

    if db is not None:
        try:
            await db.events.update_one(
                {"event_id": event_id},
                {"$set": {"photo_count": len(generated_records), "status": "photos_uploaded"}},
                upsert=True,
            )
        except Exception as e:
            logger.error(f"DB update error: {e}")

    return {
        "success": True,
        "event_id": event_id,
        "generated_count": len(generated_records),
        "message": f"Successfully generated {len(generated_records)} realistic event demo photos with bursts, blurs, and portrait poses.",
    }
