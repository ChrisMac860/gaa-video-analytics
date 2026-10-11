"""Candidate extraction. Candidates are NEVER events; a human must accept them."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Protocol, Sequence, Tuple


@dataclass
class PlayerObs:
    track_id: int
    box: Tuple[float, float, float, float]
    team: Optional[str]  # "A" | "B" | None


@dataclass
class FrameObs:
    t: float
    ball: Optional[Tuple[float, float, float]]  # cx, cy, conf
    players: List[PlayerObs] = field(default_factory=list)


class EventExtractor(Protocol):
    def extract(self, frames: Sequence[FrameObs], frame_height: int) -> List[dict]: ...


def _dist_point_box(px: float, py: float, box) -> float:
    x1, y1, x2, y2 = box
    dx = max(x1 - px, 0.0, px - x2)
    dy = max(y1 - py, 0.0, py - y2)
    return math.hypot(dx, dy)


def nearest_player(ball, players: Sequence[PlayerObs], max_dist: float) -> Optional[Tuple[PlayerObs, float]]:
    """Nearest team-labelled player to the ball centre (pixel distance to box; ties by box centre)."""
    best = None
    for p in players:
        if p.team is None:
            continue
        d = _dist_point_box(ball[0], ball[1], p.box)
        cx, cy = (p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2
        key = (d, math.hypot(ball[0] - cx, ball[1] - cy))
        if d <= max_dist and (best is None or key < best[0]):
            best = (key, p, d)
    return (best[1], best[2]) if best else None


class CandidateExtractor:
    def __init__(self, min_frames: int = 4, max_dist_frac: float = 0.08,
                 segment_gap: int = 3, segment_min: int = 3):
        self.min_frames, self.max_dist_frac = min_frames, max_dist_frac
        self.segment_gap, self.segment_min = segment_gap, segment_min

    def extract(self, frames: Sequence[FrameObs], frame_height: int) -> List[dict]:
        out = self.ball_segments(frames) + self.possession_changes(frames, frame_height)
        out.sort(key=lambda c: c["t"])
        for i, c in enumerate(out):
            c["id"] = f"cv-{i + 1:04d}"
        return out

    def ball_segments(self, frames: Sequence[FrameObs]) -> List[dict]:
        segs, cur = [], []
        last_i = None
        for i, f in enumerate(frames):
            if f.ball is None:
                continue
            if last_i is not None and i - last_i > self.segment_gap + 1:
                segs.append(cur)
                cur = []
            cur.append(i)
            last_i = i
        if cur:
            segs.append(cur)
        res = []
        for s in segs:
            if len(s) < self.segment_min:
                continue
            confs = [frames[i].ball[2] for i in s]
            t0, t1 = frames[s[0]].t, frames[s[-1]].t
            res.append({
                "t": round(t0, 3), "tEnd": round(t1, 3), "kind": "ball_visible_segment",
                "confidence": round(float(sum(confs) / len(confs)), 3), "status": "observed",
                "detail": (f"Detector reported a sports ball in {len(s)} sampled frames between "
                           f"{t0:.1f}s and {t1:.1f}s (mean conf {sum(confs) / len(confs):.2f}, "
                           f"gaps <= {self.segment_gap} frames bridged). Detections may include false positives."),
            })
        return res

    def possession_changes(self, frames: Sequence[FrameObs], frame_height: int) -> List[dict]:
        max_dist = self.max_dist_frac * frame_height
        owner: Optional[str] = None
        cand: Optional[str] = None
        run: List[Tuple[float, float, float, int]] = []  # (t, ball_conf, dist, track)
        res = []
        for f in frames:
            if f.ball is None:
                continue
            near = nearest_player(f.ball, f.players, max_dist)
            if near is None:
                continue
            p, d = near
            team = p.team
            if owner is None:
                # need min_frames of agreement to establish initial holder (not an event)
                if cand == team:
                    run.append((f.t, f.ball[2], d, p.track_id))
                else:
                    cand, run = team, [(f.t, f.ball[2], d, p.track_id)]
                if len(run) >= self.min_frames:
                    owner, cand, run = team, None, []
                continue
            if team == owner:
                cand, run = None, []
                continue
            if cand == team:
                run.append((f.t, f.ball[2], d, p.track_id))
            else:
                cand, run = team, [(f.t, f.ball[2], d, p.track_id)]
            if len(run) >= self.min_frames:
                mean_bc = sum(r[1] for r in run) / len(run)
                mean_d = sum(r[2] for r in run) / len(run)
                prox = max(0.0, 1.0 - mean_d / max_dist) if max_dist > 0 else 0.0
                conf = round(float(min(0.9, mean_bc * (0.5 + 0.5 * prox))), 3)
                tracks = sorted({r[3] for r in run})
                res.append({
                    "t": round(run[0][0], 3), "tEnd": round(run[-1][0], 3), "kind": "possession_change",
                    "teamCluster": team, "confidence": conf, "status": "inferred",
                    "detail": (f"Nearest team-labelled player to the ball changed from cluster {owner} to {team} "
                               f"and stayed so for {len(run)} sampled frames ({run[0][0]:.1f}s-{run[-1][0]:.1f}s); "
                               f"mean ball conf {mean_bc:.2f}, mean distance {mean_d:.0f}px "
                               f"(limit {max_dist:.0f}px); track ids {tracks}. Proximity heuristic, not a verified "
                               f"possession; team cluster is from jersey colour."),
                })
                owner, cand, run = team, None, []
        return res
