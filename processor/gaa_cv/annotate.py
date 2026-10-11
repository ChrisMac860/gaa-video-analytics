from __future__ import annotations

from collections import defaultdict
from typing import Optional

import cv2
import numpy as np
import supervision as sv

from .pipeline import RunResult
from .video import VideoSource

PALETTE = {"A": sv.Color(230, 60, 60), "B": sv.Color(60, 110, 240), None: sv.Color(170, 170, 170)}


def render_frame(frame: np.ndarray, rows, team) -> np.ndarray:
    out = frame.copy()
    persons = [r for r in rows if r.cls == "person"]
    if persons:
        det = sv.Detections(xyxy=np.array([r.box for r in persons], dtype=np.float32),
                            tracker_id=np.array([r.track_id for r in persons]),
                            confidence=np.array([r.conf for r in persons], dtype=np.float32))
        labs = [team.label(r.track_id) for r in persons]
        for lab in ("A", "B", None):
            idx = [i for i, l in enumerate(labs) if l == lab]
            if not idx:
                continue
            sub = det[idx]
            out = sv.BoxAnnotator(color=PALETTE[lab], thickness=2).annotate(out, sub)
            out = sv.LabelAnnotator(color=PALETTE[lab], text_scale=0.4, text_padding=3).annotate(
                out, sub, labels=[f"#{t}{(' ' + lab) if lab else ''}" for t in sub.tracker_id])
    for r in rows:
        if r.cls == "ball":
            cx, cy = int((r.box[0] + r.box[2]) / 2), int((r.box[1] + r.box[3]) / 2)
            cv2.circle(out, (cx, cy), 9, (0, 255, 255), 2)
            cv2.putText(out, f"ball {r.conf:.2f}", (cx + 10, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    return out


def annotate_video(src_path: str, res: RunResult, out_path: str, profile: str = "generic_mp4") -> None:
    by_frame = defaultdict(list)
    for r in res.rows:
        by_frame[r.frame].append(r)
    src = VideoSource(src_path, stride=res.stride, profile=profile,
                      max_seconds=(max(by_frame) + 1) / res.fps if by_frame else None)
    eff = res.fps / res.stride
    vw = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), eff, (src.width, src.height))
    try:
        for fi, _t, frame in src.frames():
            vw.write(render_frame(frame, by_frame.get(fi, []), res.team))
    finally:
        vw.release()
        src.close()
