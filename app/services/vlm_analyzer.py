import os
import json
import base64
import logging
import asyncio
from typing import Optional, Dict, Any, List
from pathlib import Path
import httpx
from PIL import Image
from app.config import settings
from app.system_prompt import (
    PhotoQualityAssessment,
    VLM_PHOTO_CULLING_SYSTEM_PROMPT,
)

logger = logging.getLogger("photo_culling.vlm_analyzer")


def _encode_image_to_base64(image_path: str, max_dimension: int = 1024) -> Tuple_Bytes := Tuple[str, str]:
    """Resize image to reasonable size for VLM and return (base64_string, mime_type)."""
    with Image.open(image_path) as img:
        img_copy = img.copy()
        # Downscale for API payload efficiency
        img_copy.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        
        # Convert RGBA/P to RGB if needed
        if img_copy.mode not in ("RGB", "L"):
            img_copy = img_copy.convert("RGB")
            
        import io
        buffer = io.BytesIO()
        img_copy.save(buffer, format="JPEG", quality=85)
        encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return encoded, "image/jpeg"


async def evaluate_photo_with_gemini(
    image_path: str,
    photo_id: str,
    api_key: Optional[str] = None,
) -> PhotoQualityAssessment:
    """
    Evaluates photo using Google Gemini 2.5 Flash / Gemini 1.5 Flash structured output.
    """
    key = api_key or settings.GEMINI_API_KEY
    if not key:
        raise ValueError("GEMINI_API_KEY is not configured.")

    try:
        # Check if google.genai SDK is available
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=key)
        
        # Prepare image bytes
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                VLM_PHOTO_CULLING_SYSTEM_PROMPT,
                f"Evaluate photo with ID '{photo_id}' for event photography culling. Return strict JSON conforming to schema.",
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PhotoQualityAssessment,
                temperature=0.1,
            ),
        )

        parsed_json = json.loads(response.text)
        parsed_json["photo_id"] = photo_id
        return PhotoQualityAssessment(**parsed_json)
    except Exception as exc:
        logger.warning(f"Google GenAI SDK call failed: {exc}. Trying REST API fallback...")
        return await _evaluate_gemini_rest(image_path, photo_id, key)


async def _evaluate_gemini_rest(image_path: str, photo_id: str, api_key: str) -> PhotoQualityAssessment:
    """Fallback to Gemini REST API endpoint directly via httpx."""
    b64_data, mime_type = _encode_image_to_base64(image_path)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": VLM_PHOTO_CULLING_SYSTEM_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_data
                        }
                    },
                    {"text": f"Evaluate photo ID '{photo_id}'. Output raw JSON only."}
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.1
        }
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
        
        # Parse JSON
        parsed = json.loads(raw_text)
        parsed["photo_id"] = photo_id
        return PhotoQualityAssessment(**parsed)


async def evaluate_photo_with_mistral(
    image_path: str,
    photo_id: str,
    api_key: Optional[str] = None,
) -> PhotoQualityAssessment:
    """
    Evaluates photo using Mistral Pixtral VLM API.
    """
    key = api_key or settings.MISTRAL_API_KEY
    if not key:
        raise ValueError("MISTRAL_API_KEY is not configured.")

    b64_data, mime_type = _encode_image_to_base64(image_path)
    image_url = f"data:{mime_type};base64,{b64_data}"

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "pixtral-12b-2409",
        "messages": [
            {
                "role": "system",
                "content": VLM_PHOTO_CULLING_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Evaluate photo ID '{photo_id}' for studio culling. Return JSON only."},
                    {"type": "image_url", "image_url": image_url},
                ],
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post("https://api.mistral.ai/v1/chat/completions", headers=headers, json=payload)
        resp.raise_for_status()
        result = resp.json()
        raw_json_str = result["choices"][0]["message"]["content"]
        parsed = json.loads(raw_json_str)
        parsed["photo_id"] = photo_id
        return PhotoQualityAssessment(**parsed)


def _generate_fallback_heuristic_assessment(photo: Dict[str, Any]) -> PhotoQualityAssessment:
    """
    Robust local heuristic evaluator when cloud VLM API keys are not provided.
    Enables immediate local offline workflow execution and testing.
    """
    lap_var = photo.get("laplacian_variance", 150.0)
    is_blurry = lap_var < settings.LAPLACIAN_BLUR_THRESHOLD
    exposure = photo.get("exposure", {})
    is_clipped = exposure.get("is_clipped", False)

    # Heuristic scoring
    sharpness = min(10.0, max(1.0, (lap_var / 30.0) + 2.0))
    if is_blurry:
        sharpness = min(sharpness, 4.5)

    aesthetic = 8.0
    defect_reasons = []
    primary_defect = "none"
    recommend_discard = False

    if is_blurry:
        aesthetic -= 4.0
        defect_reasons.append("Severe motion blur or camera shake detected by Laplacian filter")
        primary_defect = "motion_blur"
        recommend_discard = True

    if is_clipped:
        aesthetic -= 3.0
        defect_reasons.append("Exposure clipping (excessive shadows or highlight blowout)")
        if primary_defect == "none":
            primary_defect = "bad_exposure"
        recommend_discard = True

    if photo.get("is_burst_duplicate", False):
        aesthetic -= 1.5
        defect_reasons.append("Burst duplicate redundancy")
        if primary_defect == "none":
            primary_defect = "burst_redundancy"
        recommend_discard = True

    aesthetic = max(1.0, min(10.0, aesthetic))

    verdict = (
        f"Automated CV Assessment: Aesthetic {aesthetic}/10, Sharpness {round(sharpness, 1)}/10. "
        + ("Marked for discard due to " + ", ".join(defect_reasons) if recommend_discard else "High sharpness and balanced exposure keeper.")
    )

    return PhotoQualityAssessment(
        photo_id=photo["photo_id"],
        eyes_closed_detected=False,
        eyes_open_confidence=0.92 if not is_blurry else 0.45,
        subject_orientation="facing_camera",
        motion_blur_detected=is_blurry,
        focus_missed=is_blurry,
        lighting_quality="deep_underexposed" if exposure.get("underexposed_pct", 0) > 30 else ("harsh_overexposed" if exposure.get("overexposed_pct", 0) > 20 else "balanced"),
        aesthetic_score=round(aesthetic, 1),
        sharpness_score=round(sharpness, 1),
        composition_score=7.5,
        recommend_discard=recommend_discard,
        primary_defect=primary_defect if primary_defect != "none" else None,
        defect_reasons=defect_reasons,
        summary_verdict=verdict,
    )


async def analyze_photo_vlm(
    photo: Dict[str, Any],
    semaphore: Optional[asyncio.Semaphore] = None,
) -> PhotoQualityAssessment:
    """
    Dispatches VLM analysis using Gemini, Mistral Pixtral, or heuristic fallback.
    """
    image_path = photo["file_path"]
    photo_id = photo["photo_id"]

    async def _do_analysis():
        if settings.GEMINI_API_KEY:
            try:
                return await evaluate_photo_with_gemini(image_path, photo_id)
            except Exception as e:
                logger.error(f"Gemini evaluation failed for {photo_id}: {e}")

        if settings.MISTRAL_API_KEY:
            try:
                return await evaluate_photo_with_mistral(image_path, photo_id)
            except Exception as e:
                logger.error(f"Mistral evaluation failed for {photo_id}: {e}")

        # If no API keys or all cloud calls failed, use heuristic
        return _generate_fallback_heuristic_assessment(photo)

    if semaphore:
        async with semaphore:
            return await _do_analysis()
    return await _do_analysis()
