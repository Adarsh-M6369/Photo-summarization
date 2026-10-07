import os
import logging
from typing import List, Dict, Any, Tuple
import numpy as np
from PIL import Image
import imagehash
from sklearn.cluster import DBSCAN
from app.services.cv_filter import compute_laplacian_variance

logger = logging.getLogger("photo_culling.vector_rag")


def extract_perceptual_feature_vector(image_path: str) -> np.ndarray:
    """
    Extracts a normalized multi-scale feature vector combining:
    1. 64-bit DCT Perceptual Hash vector
    2. 64-bit Wavelet Hash vector
    3. Spatial 3D Color distribution (HSV 8x8 grid)
    4. Edge magnitude profile
    """
    try:
        with Image.open(image_path) as img:
            rgb_img = img.convert("RGB")
            
            # 1. pHash & wHash
            ph = imagehash.phash(rgb_img)
            wh = imagehash.whash(rgb_img)
            ph_vec = np.array(ph.hash.flatten(), dtype=np.float32)
            wh_vec = np.array(wh.hash.flatten(), dtype=np.float32)

            # 2. Color thumbnail grid (8x8x3 = 192 features)
            thumb = rgb_img.resize((8, 8), Image.Resampling.BOX)
            color_vec = np.array(thumb, dtype=np.float32).flatten() / 255.0

            # Combined normalized feature vector
            feature_vector = np.concatenate([ph_vec, wh_vec, color_vec])
            norm = np.linalg.norm(feature_vector)
            if norm > 0:
                feature_vector = feature_vector / norm
            return feature_vector
    except Exception as exc:
        logger.error(f"Error extracting perceptual vector for {image_path}: {exc}")
        return np.zeros(320, dtype=np.float32)


def cluster_photos_by_similarity(
    photos: List[Dict[str, Any]],
    eps: float = 0.28,
    min_samples: int = 2,
) -> Dict[str, Any]:
    """
    Clusters photos into visual similarity groups (poses, repeated scenes, bursts) using DBSCAN.
    For each cluster with > 1 photo, selects the best keeper based on sharpness and aesthetic metrics,
    and flags redundant poses.
    """
    if len(photos) < 2:
        return {"clusters": {}, "redundant_photo_ids": []}

    # Extract vectors
    vectors = []
    valid_photos = []
    for p in photos:
        vec = extract_perceptual_feature_vector(p["file_path"])
        vectors.append(vec)
        valid_photos.append(p)

    matrix = np.array(vectors)

    # Run DBSCAN on cosine distance metric
    clustering = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine").fit(matrix)
    labels = clustering.labels_

    clusters_dict: Dict[int, List[Dict[str, Any]]] = {}
    redundant_ids: List[str] = []

    for idx, label in enumerate(labels):
        if label == -1:
            # Noise / unique standalone photo
            continue
        if label not in clusters_dict:
            clusters_dict[label] = []
        clusters_dict[label].append(valid_photos[idx])

    # Rank each cluster
    ranked_clusters = []
    for label, group in clusters_dict.items():
        # Score each photo: sharpness * 0.6 + aesthetic * 0.4
        def _score(item):
            sharpness = item.get("sharpness_score") or item.get("laplacian_variance", 100.0) / 20.0
            aesthetic = item.get("aesthetic_score", 7.0)
            return (sharpness * 0.6) + (aesthetic * 0.4)

        sorted_group = sorted(group, key=_score, reverse=True)
        best_photo = sorted_group[0]
        duplicates = sorted_group[1:]

        for dup in duplicates:
            redundant_ids.append(dup["photo_id"])
            dup["is_burst_duplicate"] = True
            dup["cluster_best_id"] = best_photo["photo_id"]

        ranked_clusters.append({
            "cluster_id": f"group_{label}",
            "best_photo_id": best_photo["photo_id"],
            "total_shots": len(sorted_group),
            "members": [p["photo_id"] for p in sorted_group],
            "redundant_discards": [p["photo_id"] for p in duplicates],
        })

    return {
        "clusters": ranked_clusters,
        "redundant_photo_ids": redundant_ids,
    }
