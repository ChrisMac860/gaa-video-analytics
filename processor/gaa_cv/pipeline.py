from __future__ import annotations

import csv
import sys
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

import numpy as np
import supervision as sv

from . import __version__
from .detector import BALL, PERSON, Detector
from .events import CandidateExtractor, FrameObs, PlayerObs
from .team import KMeansTeamClassifier
from .tracker import ByteTrackTracker
from .video import VideoError, VideoSource


@dataclass
class Row:
    frame: int
    t: float
    track_id: int  # -1 for ball
    cls: str
    box: tuple
    conf: float


@dataclass
class RunResult:
    rows: List[Row] = field(default_factory=list)
    obs: List[FrameObs] = field(default_factory=list)
    frame_idx: List[int] = field(default_factory=list)
    team: KMeansTeamClassifier = field(default_factory=KMeansTeamClassifier)
    elapsed: float = 0.0
    frames_read: int = 0
    warnings: List[str] = field(default_factory=list)
    candidates: List[dict] = field(default_factory=list)
    fps: float = 25.0
    stride: int = 1


def run_pipeline(src: VideoSource, detector: Detector, stride: int = 1,
                 progress: Optional[Callable[[int, int], None]] = None,
                 extractor: Optional[CandidateExtractor] = None) -> RunResult:
    res = RunResult(fps=src.fps, stride=src.stride)
    tracker = ByteTrackTracker(frame_rate=src.fps / src.stride)
    t0 = time.time()
    total = int(src.duration * src.fps / src.stride) if src.duration else 0
    tracked_per_frame: List[sv.Detections] = []
    for fi, t, frame in src.frames():
        det = detector.detect(frame)
        persons = det[det.class_id == PERSON] if len(det) else det
        balls = det[det.class_id == BALL] if len(det) else det
        tr = tracker.update(persons)
        for box, tid in zip(tr.xyxy, tr.tracker_id):
            res.team.observe(int(tid), frame, box)
        ball = None
        if len(balls):
            k = int(np.argmax(balls.confidence))
            b = balls.xyxy[k]
            ball = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, float(balls.confidence[k]))
            res.rows.append(Row(fi, t, -1, "ball", tuple(float(v) for v in b), float(balls.confidence[k])))
        for box, tid, c in zip(tr.xyxy, tr.tracker_id, tr.confidence):
            res.rows.append(Row(fi, t, int(tid), "person", tuple(float(v) for v in box), float(c)))
        res.obs.append(FrameObs(t=t, ball=ball, players=[
            PlayerObs(int(tid), tuple(float(v) for v in box), None) for box, tid in zip(tr.xyxy, tr.tracker_id)]))
        res.frame_idx.append(fi)
        res.frames_read += 1
        if progress and res.frames_read % 10 == 0:
            progress(res.frames_read, total)
    res.elapsed = time.time() - t0
    if res.frames_read == 0:
        raise VideoError("No frames could be read from the video (zero frames analysed).")

    if res.team.fit():
        for o in res.obs:
            for p in o.players:
                p.team = res.team.label(p.track_id)
    else:
        res.warnings.append("Team clustering skipped: fewer than 4 person tracks with usable jersey colour. "
                            "Team clusters are unassigned and no possession candidates are produced.")
    ex = extractor or CandidateExtractor()
    res.candidates = ex.extract(res.obs, src.height)
    if not any(o.ball for o in res.obs):
        res.warnings.append("No sports-ball detections: the ball is small and often missed by COCO detectors.")
    return res


def write_tracks_csv(path: str, res: RunResult) -> None:
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["frame", "t", "track_id", "class", "x1", "y1", "x2", "y2", "conf", "team_cluster"])
        for r in res.rows:
            team = res.team.label(r.track_id) if r.cls == "person" else None
            w.writerow([r.frame, f"{r.t:.3f}", r.track_id if r.cls == "person" else "", r.cls,
                        *(f"{v:.1f}" for v in r.box), f"{r.conf:.3f}", team or ""])


def build_document(res: RunResult, src: VideoSource, detector, *, home: str, away: str, profile: str,
                   file_name: str, conf_threshold: float) -> dict:
    labels = {tid: res.team.label(tid) for tid in {r.track_id for r in res.rows if r.cls == "person"}}
    frames = []
    for o in res.obs:
        a = sum(1 for p in o.players if p.team == "A")
        b = sum(1 for p in o.players if p.team == "B")
        frames.append({"t": round(o.t, 3), "persons": len(o.players),
                       "balls": 1 if o.ball else 0, "teamA": a, "teamB": b})
    n_a = sum(1 for v in labels.values() if v == "A")
    n_b = sum(1 for v in labels.values() if v == "B")
    cv = {
        "run": {
            "processor": "gaa_cv", "version": __version__,
            "detector": {"model": detector.model_name, "licence": "Apache-2.0",
                         "inputSize": detector.input_size, "confThreshold": conf_threshold},
            "tracker": "ByteTrack (supervision)",
            "frameStride": res.stride, "framesAnalysed": res.frames_read,
            "elapsedSec": round(res.elapsed, 2),
            "capabilities": {
                "person_detection": "implemented", "person_tracking": "implemented",
                "ball_detection": "experimental", "team_clustering": "experimental",
                "possession_candidates": "experimental", "ball_visible_segments": "implemented",
                "shot_recognition": "not_implemented", "score_recognition": "not_implemented",
                "kickout_recognition": "not_implemented", "pitch_calibration": "not_implemented",
            },
        },
        "frames": frames,
        "tracks": {"total": len(labels), "teamA": n_a, "teamB": n_b, "unassigned": len(labels) - n_a - n_b},
        "candidates": res.candidates,
        "warnings": res.warnings,
    }
    if res.team.colours:
        cv["teamColours"] = res.team.colours
    return {
        "schemaVersion": "1.0", "sport": "gaelic_football",
        "match": {"home": {"name": home}, "away": {"name": away}, "ruleset": "gaa-football-2025"},
        "video": {"fileName": file_name, "durationSec": round(src.duration, 2), "fps": round(src.fps, 3),
                  "width": src.width, "height": src.height, "profile": profile},
        "coverage": {"scores": False, "shots": False, "kickouts": False, "turnovers": False, "frees": False, "cards": False},
        "events": [],
        "cv": cv,
    }
