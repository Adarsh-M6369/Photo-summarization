import os
import logging
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
import imagehash
from app.config import settings

logger = logging.getLogger("photo_culling.cv_filter")


def compute_laplacian_variance(image_path: str) -> float:
    """
    Computes the variance of the Laplacian of the image.
    Low variance indicates severe motion blur or missed focus.
    """
    try:
        # Read image using OpenCV in grayscale
        # Using cv2.imdecode to safely support Unicode paths on Windows
        path_obj = Path(image_path)
        if not path_obj.exists():
            logger.warning(f"Image not found at path: {image_path}")
            return 0.0

        with open(str(path_obj), "rb") as f:
            bytes_data = bytearray(f.read())
            numpy_arr = np.asarray(bytes_data, dtype=np.uint8)
            img = cv2.imdecode(numpy_arr, cv2.IMREAD_GRAYSCALE)

        if img is None:
            # Fallback using PIL
            pil_img = Image.open(image_path).convert("L")
            img = np.array(pil_img)

        # Calculate Laplacian variance
        laplacian = cv2.Laplacian(img, cv2.CV_64F)
        variance = float(laplacian.var())
        return round(variance, 2)
    except Exception as exc:
        logger.error(f"Error computing laplacian variance for {image_path}: {exc}")
        return 0.0


def compute_phash(image_path: str) -> str:
    """
    Computes 64-bit Perceptual Hash (pHash) using Discrete Cosine Transform.
    """
    try:
        with Image.open(image_path) as img:
            hash_val = imagehash.phash(img)
            return str(hash_val)
    except Exception as exc:
        logger.error(f"Error computing pHash for {image_path}: {exc}")
        return "0000000000000000"


def compute_exposure_metrics(image_path: str) -> Dict[str, Any]:
    """
    Calculates mean luminance, under-exposure clipping, and over-exposure clipping.
    """
    try:
        with Image.open(image_path) as img:
            rgb_img = img.convert("RGB")
            arr = np.array(rgb_img)
            # Calculate luminance
            luminance = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
            mean_lum = float(np.mean(luminance))
            underexposed_pct = float(np.mean(luminance < 15.0) * 100)
            overexposed_pct = float(np.mean(luminance > 245.0) * 100)
            
            return {
                "mean_luminance": round(mean_lum, 2),
                "underexposed_pct": round(underexposed_pct, 2),
                "overexposed_pct": round(overexposed_pct, 2),
                "is_clipped": (underexposed_pct > 35.0 or overexposed_pct > 25.0)
            }
    except Exception as exc:
        logger.error(f"Error computing exposure metrics for {image_path}: {exc}")
        return {
            "mean_luminance": 128.0,
            "underexposed_pct": 0.0,
            "overexposed_pct": 0.0,
            "is_clipped": False
        }


def generate_thumbnail(image_path: str, output_path: str, max_size: Tuple[int, int] = (400, 400)) -> str:
    """
    Generates a web-optimized thumbnail for fast UI rendering.
    """
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with Image.open(image_path) as img:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            rgb_thumb = img.convert("RGB")
            rgb_thumb.save(output_path, "JPEG", quality=85, optimize=True)
        return output_path
    except Exception as exc:
        logger.error(f"Failed to generate thumbnail for {image_path}: {exc}")
        return image_path


def cluster_burst_duplicates(photos: List[Dict[str, Any]], max_hamming_dist: int = 4) -> List[List[str]]:
    """
    Groups near-identical burst shots by comparing perceptual hashes with Hamming distance.
    Returns a list of clusters, where each cluster is a list of photo_ids.
    """
    clusters: List[List[str]] = []
    visited: set = set()

    # Pre-parse hash objects for speed
    parsed_hashes = {}
    for p in photos:
        pid = p["photo_id"]
        h_str = p.get("phash") or compute_phash(p["file_path"])
        p["phash"] = h_str
        try:
            parsed_hashes[pid] = imagehash.hex_to_hash(h_str)
        except Exception:
            parsed_hashes[pid] = imagehash.hex_to_hash("0000000000000000")

    n = len(photos)
    for i in range(n):
        pid_i = photos[i]["photo_id"]
        if pid_i in visited:
            continue

        cluster = [pid_i]
        visited.add(pid_i)

        for j in range(i + 1, n):
            pid_j = photos[j]["photo_id"]
            if pid_j in visited:
                continue

            # Compare Hamming distance
            dist = parsed_hashes[pid_i] - parsed_hashes[pid_j]
            if dist <= max_hamming_dist:
                cluster.append(pid_j)
                visited.add(pid_j)

        if len(cluster) > 1:
            clusters.append(cluster)

    return clusters


def run_tier1_cv_filter(photo: Dict[str, Any], blur_threshold: float = 120.0) -> Dict[str, Any]:
    """
    Executes Tier 1 Zero-Cost local computer vision filter on a single photo.
    Returns computed metrics and preliminary discard/keep flag.
    """
    path = photo["file_path"]
    lap_var = compute_laplacian_variance(path)
    phash = compute_phash(path)
    exposure = compute_exposure_metrics(path)

    is_blurry = lap_var < blur_threshold
    is_bad_exposure = exposure["is_clipped"]

    tier1_discard = is_blurry or is_bad_exposure
    defect = None
    if is_blurry:
        defect = "motion_blur"
    elif is_bad_exposure:
        defect = "bad_exposure"

    return {
        "photo_id": photo["photo_id"],
        "laplacian_variance": lap_var,
        "phash": phash,
        "is_blurry": is_blurry,
        "exposure": exposure,
        "tier1_discard": tier1_discard,
        "tier1_defect": defect,
    }
