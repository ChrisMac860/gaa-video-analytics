from __future__ import annotations

import warnings
from typing import Protocol

import numpy as np
import supervision as sv


class Tracker(Protocol):
    def update(self, persons: sv.Detections) -> sv.Detections: ...


class ByteTrackTracker:
    """supervision ByteTrack (MIT) over person detections only. frame_rate = effective sampled fps."""

    def __init__(self, frame_rate: float = 25.0, track_activation_threshold: float = 0.35,
                 lost_track_buffer: int = 30, minimum_matching_threshold: float = 0.8):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", FutureWarning)
            self._bt = sv.ByteTrack(
                track_activation_threshold=track_activation_threshold,
                lost_track_buffer=lost_track_buffer,
                minimum_matching_threshold=minimum_matching_threshold,
                frame_rate=max(1, int(round(frame_rate))))

    def update(self, persons: sv.Detections) -> sv.Detections:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", FutureWarning)
            out = self._bt.update_with_detections(persons)
        if out.tracker_id is None:
            out.tracker_id = np.zeros(len(out), dtype=int)
        return out
