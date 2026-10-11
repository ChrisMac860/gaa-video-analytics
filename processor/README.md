# gaa_cv - local CV processor

Runs on your machine, reads a match video, and writes an `AnalysisDocument` JSON (see `web/src/core/types.ts`)
plus an optional tracks CSV and annotated MP4. **It never creates events** (`events: []`, `coverage` all false).
It produces *candidates* that a person reviews in the web app. Veo is just a `--profile`; the pipeline is the same for any video.

## Install

```bash
cd processor
pip install -e ".[dev]"            # numpy, opencv-python-headless, onnxruntime, supervision (+pytest)
python scripts/download_models.py   # YOLOX nano + s ONNX -> models/ (gitignored), sha256 verified
```

## Run

```bash
python -m gaa_cv analyse match.mp4 --out analysis.json --tracks tracks.csv --annotate annotated.mp4 \
    --stride 2 --model nano --max-seconds 60 --home "Home GAA" --away "Away GAA" --profile veo
```

`--model nano` (416px, fast) or `s` (640px, better for small/distant players). `--stride N` analyses every Nth frame.
Progress goes to stderr; errors (missing file, unreadable video, missing model, zero frames) exit with code 1 and a message.

## Tests

```bash
python -m pytest -q      # integration tests skip if models are not downloaded
```

## What it does and does not do

| Capability | Status | Notes |
|---|---|---|
| Person detection | implemented | YOLOX COCO class 0 |
| Person tracking | implemented | ByteTrack (supervision); IDs break under occlusion/camera pans |
| Ball detection | experimental | COCO "sports ball"; the ball is tiny in wide shots and often missed. Highest-confidence ball per frame, threshold 0.15 (expect false positives) |
| Team clustering | experimental | Inferred from jersey colour (Lab median of upper torso, grass masked, 2-means over tracks). Labels A/B are arbitrary: **a person maps A/B to home/away**. Fails if kits are similar or one side wears green |
| Possession-change candidates | experimental | Heuristic: nearest player to ball (within 8% of frame height) changes team and holds for >= 4 sampled frames. Status `inferred`. Not a verified possession |
| Ball-visible segments | implemented | Status `observed`; reflects detector output only |
| Shot / score / kick-out recognition | not_implemented | |
| Pitch calibration / pitch coordinates | not_implemented | |
| Referee / goalkeeper / player identity | not_implemented | Referees are counted as persons and may be clustered into a team |

## Licences

- This package: Apache-2.0.
- Model: YOLOX (Megvii) - Apache-2.0. Weights downloaded from the official GitHub release, never committed. Pre/post-processing is reimplemented following the upstream ONNXRuntime demo.
- supervision (Roboflow) - MIT (ByteTrack implementation; deprecated there in favour of the `trackers` package, so `supervision<0.31` is pinned).
- onnxruntime - MIT; opencv-python-headless - Apache-2.0; numpy - BSD.
- No ultralytics / AGPL / GPL code or weights are used.
