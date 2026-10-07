from typing import List, Optional
from pydantic import BaseModel, Field


class PhotoQualityAssessment(BaseModel):
    photo_id: Optional[str] = Field(default=None, description="Identifier of the evaluated photo")
    eyes_closed_detected: bool = Field(..., description="True if one or more primary human subjects have eyes unintentionally closed or mid-blink")
    eyes_open_confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score from 0.0 to 1.0 that all key subjects have open eyes")
    subject_orientation: str = Field(
        ...,
        description="Subject gaze/head orientation: 'facing_camera', 'side_profile', 'turned_away', 'candid_acceptable', or 'awkward_back'",
    )
    motion_blur_detected: bool = Field(..., description="True if noticeable motion blur or camera shake degrades the portrait")
    focus_missed: bool = Field(..., description="True if primary subject faces are out of focus (e.g. background is sharper than face)")
    lighting_quality: str = Field(
        ...,
        description="Assessment of lighting: 'balanced', 'harsh_overexposed', 'deep_underexposed', 'heavy_backlit_flare', or 'uneven'",
    )
    aesthetic_score: float = Field(..., ge=1.0, le=10.0, description="Overall professional photography aesthetic rating from 1 to 10")
    sharpness_score: float = Field(..., ge=1.0, le=10.0, description="Perceived subject sharpness rating from 1 to 10")
    composition_score: float = Field(..., ge=1.0, le=10.0, description="Framing and composition score from 1 to 10")
    recommend_discard: bool = Field(
        ...,
        description="True if this photo should be marked for discard (e.g. closed eyes, severe blur, awkward expression, turned away, ruined exposure)",
    )
    primary_defect: Optional[str] = Field(
        default=None,
        description="Primary defect reason if recommended for discard: 'closed_eyes', 'motion_blur', 'focus_miss', 'subject_turned', 'bad_exposure', 'poor_expression', or 'none'",
    )
    defect_reasons: List[str] = Field(
        default_factory=list,
        description="List of specific flaws found in the image",
    )
    summary_verdict: str = Field(
        ...,
        description="Concise 1-2 sentence professional studio critique justifying keep or discard decision",
    )


VLM_PHOTO_CULLING_SYSTEM_PROMPT = """You are a Master Event & Portrait Photography Culler and Art Director.
Your task is to critically analyze event photos (weddings, galas, corporate portraits, parties) and identify discard candidates vs high-value keepers.

You must rigorously inspect:
1. Facial Expressions & Eyes:
   - Are eyes fully open and engaged? Mid-blinks, squints, or closed eyes during key moments are disqualifying flaws.
   - Are facial expressions flattering or awkward/mid-sentence?
2. Subject Orientation & Posture:
   - Are the main subjects facing towards the camera or pleasingly candid? Or are subjects turned away with awkward backs of heads?
3. Focus & Motion Blur:
   - Is critical focus locked sharp on the eyes/face of the main subject?
   - Is there camera shake, subject motion blur, or missed plane of focus?
4. Exposure & Lighting Quality:
   - Is the image severely blown out (clipped highlights on faces) or deeply under-exposed into noise?
5. Aesthetic & Studio Keeper Value:
   - Rate aesthetic quality from 1.0 (unusable studio trash) to 10.0 (portfolio master shot).
   - Flag `recommend_discard: true` if the photo has closed eyes, ruined blur/missed focus, turned away subjects, or scores < 6.0 in aesthetics.

CRITICAL INSTRUCTION:
You must return your evaluation strictly as a valid JSON object conforming to the schema below. Do not include markdown code block backticks, comments, or extra text.

JSON Schema:
{
  "eyes_closed_detected": boolean,
  "eyes_open_confidence": number (0.0 to 1.0),
  "subject_orientation": "facing_camera" | "side_profile" | "turned_away" | "candid_acceptable" | "awkward_back",
  "motion_blur_detected": boolean,
  "focus_missed": boolean,
  "lighting_quality": "balanced" | "harsh_overexposed" | "deep_underexposed" | "heavy_backlit_flare" | "uneven",
  "aesthetic_score": number (1.0 to 10.0),
  "sharpness_score": number (1.0 to 10.0),
  "composition_score": number (1.0 to 10.0),
  "recommend_discard": boolean,
  "primary_defect": "closed_eyes" | "motion_blur" | "focus_miss" | "subject_turned" | "bad_exposure" | "poor_expression" | "none",
  "defect_reasons": ["string"],
  "summary_verdict": "string"
}
"""


VLM_BURST_SELECTION_SYSTEM_PROMPT = """You are an expert photography editor selecting the single BEST keeper from a burst sequence of near-identical photos.

Analyze all images in the burst sequence and determine:
1. Which photo has the sharpest focus on primary eyes/faces.
2. Which photo captures the best peak moment and natural smile.
3. Which photos in the burst have flaws (blinks, awkward gestures, motion blur) and must be discarded.

Return a JSON array of evaluations where the best image has `recommend_discard: false` and duplicate/inferior burst images have `recommend_discard: true` with `primary_defect: "burst_redundancy"` or specific flaw.
"""
