from __future__ import annotations

import argparse
import json
import os
import sys

from .video import VideoError, VideoSource

PROFILES = ["veo", "generic_mp4", "phone", "fixed_camera", "other"]


def _err(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="gaa_cv", description="Gaelic football CV processor (candidates only).")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("analyse", help="analyse a video and write an AnalysisDocument JSON")
    a.add_argument("input")
    a.add_argument("--out", required=True)
    a.add_argument("--tracks")
    a.add_argument("--annotate")
    a.add_argument("--stride", type=int, default=2)
    a.add_argument("--model", choices=["nano", "s"], default="nano")
    a.add_argument("--max-seconds", type=float)
    a.add_argument("--home", default="Home")
    a.add_argument("--away", default="Away")
    a.add_argument("--profile", choices=PROFILES, default="generic_mp4")
    a.add_argument("--person-conf", type=float, default=0.35)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    from .detector import ModelMissingError, YoloxOnnxDetector
    from .pipeline import build_document, run_pipeline, write_tracks_csv
    if args.stride < 1:
        return _err("--stride must be >= 1")
    try:
        src = VideoSource(args.input, stride=args.stride, max_seconds=args.max_seconds, profile=args.profile)
    except VideoError as e:
        return _err(str(e))
    try:
        det = YoloxOnnxDetector(args.model, person_conf=args.person_conf)
    except ModelMissingError as e:
        return _err(str(e))

    def progress(n, total):
        pct = f" ({100 * n / total:.0f}%)" if total else ""
        print(f"\rframes analysed: {n}{pct}", end="", file=sys.stderr, flush=True)

    try:
        res = run_pipeline(src, det, args.stride, progress)
    except VideoError as e:
        print(file=sys.stderr)
        return _err(str(e))
    print(file=sys.stderr)
    doc = build_document(res, src, det, home=args.home, away=args.away, profile=args.profile,
                         file_name=os.path.basename(args.input), conf_threshold=args.person_conf)
    src.close()
    with open(args.out, "w") as f:
        json.dump(doc, f, indent=2)
    if args.tracks:
        write_tracks_csv(args.tracks, res)
    if args.annotate:
        from .annotate import annotate_video
        print("rendering annotated video...", file=sys.stderr)
        annotate_video(args.input, res, args.annotate, args.profile)
    fps = res.frames_read / res.elapsed if res.elapsed else 0
    print(f"done: {res.frames_read} frames in {res.elapsed:.1f}s ({fps:.1f} analysed fps); "
          f"{doc['cv']['tracks']['total']} tracks; {len(res.candidates)} candidates -> {args.out}", file=sys.stderr)
    return 0
