#!/usr/bin/env python3
"""Download YOLOX ONNX weights (Apache-2.0, Megvii) into processor/models/.

Weights are never committed. The sha256 of each file is printed; if a pinned
hash is known it is verified. Usage: python scripts/download_models.py [nano] [s]
"""
from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

BASE = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/"
# sha256 values observed when this script was written (release 0.1.1rc0).
MODELS = {
    "nano": ("yolox_nano.onnx", "c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d"),
    "s": ("yolox_s.onnx", "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063"),
}
DEST = Path(__file__).resolve().parent.parent / "models"


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv: list[str]) -> int:
    names = argv or list(MODELS)
    DEST.mkdir(parents=True, exist_ok=True)
    rc = 0
    for n in names:
        if n not in MODELS:
            print(f"unknown model '{n}' (choose from {', '.join(MODELS)})", file=sys.stderr)
            return 2
        fname, want = MODELS[n]
        out = DEST / fname
        if not out.exists():
            print(f"downloading {BASE + fname}", file=sys.stderr)
            urllib.request.urlretrieve(BASE + fname, out)
        got = sha256(out)
        ok = got == want
        print(f"{fname}  sha256={got}  {'OK' if ok else 'MISMATCH (expected ' + want + ')'}")
        if not ok:
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
