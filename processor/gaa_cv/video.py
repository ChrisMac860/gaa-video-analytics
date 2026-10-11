from __future__ import annotations

from pathlib import Path
from typing import Iterator, Protocol, Tuple

import cv2
import numpy as np


class VideoError(RuntimeError):
    pass


class FrameSource(Protocol):
    fps: float
    width: int
    height: int
    duration: float
    profile: str

    def frames(self) -> Iterator[Tuple[int, float, np.ndarray]]: ...


class VideoSource:
    """OpenCV video reader. `profile` is metadata only (Veo is just a profile)."""

    def __init__(self, path: str | Path, stride: int = 1, max_seconds: float | None = None,
                 profile: str = "generic_mp4"):
        self.path = Path(path)
        if not self.path.exists():
            raise VideoError(f"Input video not found: {self.path}")
        self.cap = cv2.VideoCapture(str(self.path))
        if not self.cap.isOpened():
            raise VideoError(f"Could not open video (unreadable or unsupported codec): {self.path}")
        self.stride = max(1, int(stride))
        self.profile = profile
        fps = float(self.cap.get(cv2.CAP_PROP_FPS) or 0.0)
        self.fps = fps if fps > 0 else 25.0
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        n = float(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0)
        self.duration = n / self.fps if n > 0 else 0.0
        self.max_frame = int(max_seconds * self.fps) if max_seconds else None

    def frames(self) -> Iterator[Tuple[int, float, np.ndarray]]:
        idx = 0
        while True:
            if self.max_frame is not None and idx >= self.max_frame:
                break
            if idx % self.stride == 0:
                ok, frame = self.cap.read()
            else:
                ok = self.cap.grab()
                frame = None
            if not ok:
                break
            if frame is not None:
                yield idx, idx / self.fps, frame
            idx += 1

    def close(self) -> None:
        self.cap.release()
