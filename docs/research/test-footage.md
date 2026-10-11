# Test footage for the CV processor

Status (lead QA, 2026-10-11): **real-footage detection/tracking verified on real (non-GAA) footage; Gaelic football footage NOT yet tested** because Wikimedia's file host rate-limited this environment (HTTP 429).

## Verified run: OpenCV pedestrian sample (real people, not sport)

Clip: `vtest.avi` from the OpenCV repository (`samples/data/vtest.avi`, 768x576, outdoor CCTV-style view of people walking). Downloaded for testing only; not committed and no frames are published (redistribution terms of the clip itself are not stated).

Command: `python -m gaa_cv analyse vtest.avi --out vtest.analysis.json --tracks vtest.tracks.csv --model s --stride 2 --max-seconds 20`

| Measure | Result |
|---|---|
| Frames analysed | 100 (stride 2) |
| Processing speed | 9.6 analysed frames/s, 4-core CPU, yolox_s 640 |
| Persons per frame | min 2, mean 5.7, max 8 |
| Visual check, frame 60 | all 5 visible people boxed correctly, no false positives (lead inspected the rendered frame) |
| Tracks | 24 track ids for roughly 8 distinct people; 15 tracks last ≥10 sampled frames. Indicates ID fragmentation under occlusion (people walking past each other and the lamp post). |
| Ball | 0 detections (no ball in the clip; correct) |
| Team clusters | A=1, B=17, unassigned=6. Meaningless here (no teams), shown to illustrate that clustering always returns two groups, so a person must check it. |
| Output | Validates against `schema/analysis.schema.json` |

In-browser check (web app, YOLOX-nano via onnxruntime-web WASM, Chromium headless): on the same clip at 4.8 s, the app found **7 people, 224 ms** inference. One false positive was a signpost at confidence 0.46. All network requests stayed on the site origin, with no third-party CDN.

## Verified run 2: basketball (real team sport, 1080p60)

Clip: `basketball-1.mp4` from the `supervision` library's official test assets (`supervision.assets.VideoAssets.BASKETBALL`, served by Roboflow). It is 8 s at 1920x1080 and 59.94 fps, and shows an indoor 1-on-1 drill with two players in different kits and a ball. It was downloaded for testing only and is not committed.

Command: `python -m gaa_cv analyse basketball-1.mp4 --out bb.analysis.json --tracks bb.tracks.csv --annotate bb.annotated.mp4 --model s --stride 1`

| Measure | Result |
|---|---|
| Frames analysed | 477, about 9.4 frames/s on a 4-core CPU with yolox_s. That is about 6x slower than real time at 60 fps; `--stride 2` or more is recommended. |
| Persons per frame | 0–3, mean 1.3. This matches the clip: 2 players plus an occasional partial person at the frame edge. Both players were boxed accurately in the frames inspected. |
| Tracks | 3 |
| Ball | detected in 49/477 frames (10%), even though the ball is large and close to the camera. In the inspected frame at 3 s the ball, held in the player's hands, was **missed**. COCO "sports ball" detection is weak. |
| Team clustering | correctly **skipped**: fewer than 4 tracks, with a warning in the output. It did not invent two teams. |
| Candidates | 5 `ball_visible_segment` (observed). No possession candidates, because no team clusters. |
| Web import | the output imported into the **live** site, and accepting a candidate created a CV-verified event (Playwright, no console errors). |
| Bug found | `--annotate` crashed on the first frame containing people. Synthetic tests missed it because their video had no people. Fixed, with a regression test. |

Why not YouTube or broadcast footage (e.g. Armagh v Louth)? YouTube blocks this cloud environment with a sign-in "confirm you're not a bot" wall, and bypassing that is not appropriate. Separately, inter-county broadcast footage belongs to the GAA and its broadcasters. It is fine to analyse locally on a user's own machine, but it must not be committed or redistributed here. Pexels, Vimeo and Pixabay returned 403 to this environment, and Wikimedia stayed rate-limited (429) for over an hour.

## Gaelic football footage (pending)

## What was found

Wikimedia Commons API search (`fetch_sample.py search`) returned redistributable candidates, including genuine Gaelic football:

| File | Licence | Size | Author |
|---|---|---|---|
| File:Detroit Wolfetones v. Cleveland St. Jarlath's video.ogv | CC BY-SA 4.0 | 13.4 MB | Michael Barera |
| File:Combinación galega.ogv (and related Galiza clips) | Public domain | 6.6 MB | Xosé Antonio |
| File:Spectators during a football match.webm | CC0 | 11.4 MB | Samson Ssemakadde |

Not verified by viewing: that the Galiza clips are Gaelic football, or that any clip has a usable pitch-level view.

## Why it was not run

The API host (`commons.wikimedia.org`) responded, but the file host (`upload.wikimedia.org`) answered every download with HTTP 429 and `retry-after: 600`, repeatedly (shared egress IP). No clip could be downloaded in the time budget, so the pipeline has not been run on real footage, and no sample output or annotated still is committed.

## To run it yourself

```bash
cd processor
python scripts/download_models.py s
python scripts/fetch_sample.py get "File:Detroit Wolfetones v. Cleveland St. Jarlath's video.ogv"   # retries on 429
python -m gaa_cv analyse samples/Detroit_Wolfetones_v._Cleveland_St._Jarlath_s_video.ogv \
    --out analysis.json --tracks tracks.csv --annotate ann.mp4 --model s --stride 2 --max-seconds 30
```
Attribution if outputs are redistributed: Michael Barera, CC BY-SA 4.0 (share-alike applies to derived data).

## What has been measured (synthetic only)

Detector speed on a random 1280x720 frame, CPU: yolox_nano ~13 ms, yolox_s ~93 ms per frame (inference + preprocessing). Unit and synthetic end-to-end tests pass; they do not validate detection quality on real footage.
