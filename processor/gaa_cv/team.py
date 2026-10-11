"""Jersey-colour team clustering. INFERRED: the human maps clusters A/B to home/away."""
from __future__ import annotations

from typing import Dict, Optional, Protocol

import cv2
import numpy as np


def torso_feature(frame: np.ndarray, box) -> Optional[np.ndarray]:
    """Median Lab colour of the upper-torso crop with grass-green pixels masked. None if unusable."""
    x1, y1, x2, y2 = [int(round(v)) for v in box]
    w, h = x2 - x1, y2 - y1
    if w < 6 or h < 16:
        return None
    # upper torso: 15-50% of height, central 60% of width
    ty1, ty2 = y1 + int(0.15 * h), y1 + int(0.50 * h)
    tx1, tx2 = x1 + int(0.20 * w), x2 - int(0.20 * w)
    crop = frame[max(ty1, 0):max(ty2, 0), max(tx1, 0):max(tx2, 0)]
    return crop_feature(crop)


def crop_feature(crop: np.ndarray) -> Optional[np.ndarray]:
    if crop is None or crop.size == 0 or crop.shape[0] < 2 or crop.shape[1] < 2:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hh, ss, vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    grass = (hh >= 30) & (hh <= 90) & (ss > 60) & (vv > 40)  # OpenCV hue 0..179; green ~ 35-85
    keep = ~grass
    if keep.sum() < 8:
        return None
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).reshape(-1, 3)[keep.reshape(-1)]
    return np.median(lab, axis=0).astype(np.float32)


def lab_to_hex(lab) -> str:
    px = np.uint8([[np.clip(lab, 0, 255)]])
    b, g, r = cv2.cvtColor(px, cv2.COLOR_LAB2BGR)[0, 0]
    return f"#{int(r):02x}{int(g):02x}{int(b):02x}"


class TeamClassifier(Protocol):
    def observe(self, track_id: int, frame: np.ndarray, box) -> None: ...
    def fit(self) -> bool: ...
    def label(self, track_id: int) -> Optional[str]: ...


class KMeansTeamClassifier:
    """Collect per-track colour features (median over observations), then 2-cluster k-means."""

    def __init__(self, min_obs: int = 3, min_tracks: int = 4, max_obs_per_track: int = 40):
        self.obs: Dict[int, list] = {}
        self.min_obs, self.min_tracks, self.max_obs = min_obs, min_tracks, max_obs_per_track
        self.centers: Optional[np.ndarray] = None
        self.track_label: Dict[int, str] = {}
        self.colours: Dict[str, str] = {}

    def observe(self, track_id, frame, box) -> None:
        f = torso_feature(frame, box)
        if f is not None:
            lst = self.obs.setdefault(int(track_id), [])
            if len(lst) < self.max_obs:
                lst.append(f)

    def track_features(self) -> Dict[int, np.ndarray]:
        return {t: np.median(np.array(v), axis=0) for t, v in self.obs.items() if len(v) >= self.min_obs}

    def fit(self) -> bool:
        feats = self.track_features()
        if len(feats) < self.min_tracks:
            return False
        ids = list(feats)
        X = np.array([feats[i] for i in ids], dtype=np.float32)
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.1)
        cv2.setRNGSeed(0)
        _, labels, centers = cv2.kmeans(X, 2, None, crit, 10, cv2.KMEANS_PP_CENTERS)
        order = np.argsort(centers[:, 0])[::-1]  # A = lighter cluster (deterministic)
        remap = {int(order[0]): "A", int(order[1]): "B"}
        self.centers = centers[order]
        self.track_label = {tid: remap[int(l)] for tid, l in zip(ids, labels.ravel())}
        self.colours = {"A": lab_to_hex(self.centers[0]), "B": lab_to_hex(self.centers[1])}
        return True

    def label(self, track_id: int) -> Optional[str]:
        """Label a track; tracks seen after fit are assigned to the nearest centre."""
        tid = int(track_id)
        if tid in self.track_label:
            return self.track_label[tid]
        if self.centers is None:
            return None
        v = self.obs.get(tid)
        if not v or len(v) < self.min_obs:
            return None
        d = np.linalg.norm(self.centers - np.median(np.array(v), axis=0), axis=1)
        lab = "A" if d[0] <= d[1] else "B"
        self.track_label[tid] = lab
        return lab
