# CV projects research for a GAA video-analytics tool

Scope: reusable open-source CV building blocks for a Python CV processor (onnxruntime + supervision/ByteTrack) and a static TypeScript/Vite frontend. Sources were read via raw GitHub files, GitHub API/pages, and web search on 2026-10-11. Items marked **unverified** were not confirmed from source.

## 1. Per-project summary

| Project | Detection models / weights | Tracking | Team ID | Pitch calibration / camera motion | Event recognition | Stats aggregation | Review workflow | Licence |
|---|---|---|---|---|---|---|---|---|
| [roboflow/sports](https://github.com/roboflow/sports) | Repo is a research sandbox; no shipped weights named in README. Datasets on Roboflow Universe (soccer player/ball, soccer pitch keypoints, basketball court keypoints). | Listed as a goal, not confirmed as implemented | Not mentioned | Pitch keypoint dataset exists; calibration listed as a goal, not confirmed | None | None confirmed | None | **Not stated** in README; no LICENSE retrieved |
| [roboflow/supervision](https://github.com/roboflow/supervision) | Library, no model weights | `ByteTrack` class ([`supervision/tracker/byte_tracker/core.py`](https://github.com/roboflow/supervision/blob/main/supervision/tracker/byte_tracker/core.py)) | Not a feature of the library itself (use it with sports/own code) | None | None | Detections/annotators/zones utilities | None | **MIT** (GitHub page); Python >=3.10 |
| [dattran1243/football-video-analytics](https://github.com/dattran1243/football-video-analytics) | Football-specific YOLO checkpoint (`football_yolo_v1_100e_best.pt`, V3 hard-frame variant); 32-landmark pitch model (`football-pitch-detection.pt`). Classes: ball, goalkeeper, player, referee. Weights not in repo; source not named. | Scene-local IDs; role stabilisation by temporal voting; tracker not named | Track-level jersey/kit evidence, `UNKNOWN` for ambiguous tracks | 32-landmark pitch model + RANSAC homography with validation; mini-map hidden when geometry is unreliable | Ball-state reconstruction (observed/predicted/interpolated/missing); no discrete pass/shot events | Visible-ball possession (quality-gated), speed estimates; CSV, JSON, HTML, annotated MP4, run manifest | Designed around reviewable outputs and a run manifest; benchmark on 192 reviewed frames (V1 mAP50-95 0.6132) | Code and docs **MIT**; datasets, weights, and third-party media **not** covered (see third-party notices) |
| [alina-letzien/football-analytics](https://github.com/alina-letzien/football-analytics) | Ultralytics YOLO (`yolo26x.pt`, auto-downloaded); optional fine-tune on Roboflow football dataset (player, goalkeeper, referee, ball) | ByteTrack via supervision; ball gaps interpolated | KMeans on jersey colours, **first frame only** (misclassification risk) | Farnebäck optical flow for camera motion; perspective transform; manual calibration needed for metric values; single broadcast camera | None (pass/shot are roadmap) | Per-frame possession by nearest player; team possession %; approximate speed/distance; stdout summary + `analysis.mp4` + `analysis_summary.json` | None (no structured export UI) | **MIT** (README) |
| [tcoca27/football_analysis](https://github.com/tcoca27/football_analysis) (search snippet only) | YOLO | Not verified | K-means on shirt colour | Optical flow + perspective transform | Not verified | Player movement analysis | Not verified | **unverified** |
| [AhmedQassemDev2004/computer-vision-football-analysis](https://github.com/AhmedQassemDev2004/computer-vision-football-analysis) (search snippet only) | YOLO | YOLO-based tracking | Team assignment | Homography to pitch coordinates | Possession | Speed and distance; annotated video | Not verified | **unverified** |
| [SkalskiP/sports](https://github.com/SkalskiP/sports) (older experiments, search snippet) | YOLOv5 detection; YOLOv7 pose | ByteTrack | GPT-4V experiments | Not verified | None | None | None | **unverified** |
| Rugby: Fernando, MSc thesis, Univ. of Moratuwa (2020) ([listing](https://dl.lib.uom.lk/items/c4e3e8ef-1e84-483d-967d-92827d685b4b)) | YOLO retrained on rugby | Tracking-by-detection with appearance embedding + Kalman | Not reported | Not reported | Not reported | Not reported | Not reported | Thesis; code **not** confirmed public |
| Rugby tackle-risk paper, [arXiv:2104.10916](https://export.arxiv.org/pdf/2104.10916) | YOLO for players and ball | Kalman filter (ball) | No | No | Tackle risk (62.5% accuracy) using OpenPose | Not reported | No | Paper |
| GAA-specific | None found on GitHub. Ulster University PhD listing describes zone detection and player/ball tracking for GAA pitches (a listing, not a paper). | — | — | — | — | — | — | — |
| [Ultralytics YOLOv8/YOLO26](https://github.com/ultralytics/ultralytics) | Pretrained COCO weights, auto-downloaded | Via integrations | — | — | — | — | — | **AGPL-3.0** + paid Enterprise licence |
| [YOLOX](https://github.com/Megvii-BaseDetection/YOLOX) | Released PyTorch and ONNX checkpoints | None (detector only) | — | — | — | — | — | **Apache-2.0** (LICENSE, copyright Megvii 2021-2022). Weights licence not stated in README. |

### Commercial tools (feature descriptions only, from secondary sources; low confidence)
- **Sportscode (Hudl/Catapult):** desktop, live capture and tagging during games, frame-accurate clip editing, custom code matrices, output packages, GPS/accelerometer integration in some setups.
- **Hudl:** clip tagging, cut-ups, board-style lesson plans, feedback assigned to athletes, multi-angle review (up to six angles from Sportscode).
- **Veo:** AI camera; auto-tags possession changes, shots, tackles into a timeline; users can add their own tags.
- **Metrica Sports:** AI player tracking and tactical insight (cited for handball).
- **Once Sport:** little detail found; offline mode, CSV/MP4 export.

Source for commercial items: search snippets from [folio3](https://www.folio3.ai/blog/top-8-sports-video-analysis-software-solutions-for-coaches), [FitGap Sportscode](https://us.fitgap.com/products/024565/hudl-sportscode), [Hudl blog](https://www.hudl.com/blog/review-and-share-multi-angle-video-on-hudl), [reelmind Veo vs Hudl](https://reelmind.ai/blog/veo-vs-hudl-comparing-ai-video-analysis-tools). Vendor claims are unverified.

## 2. Three most reusable techniques

1. **YOLOX ONNX detection with a fixed letterbox-style preprocessing and anchor-free decoding** (see section 7). Small, dependency-light, Apache-2.0 code. Fits onnxruntime directly.
2. **ByteTrack via supervision for person/ball tracking**, with ball gap interpolation and track-ID reset after occlusion (pattern from the alina-letzien pipeline). Use `ByteTrack.update_with_detections(detections)` on a `supervision.Detections` object.
3. **Pitch homography with RANSAC and validity gating** (dattran1243). Keypoint-to-pitch mapping, and suppress metric stats (speed, distance) when calibration fails. Essential for GAA where the pitch is larger than soccer and fixed cameras cover only part of it.

Also useful: **quality-gated possession** (dattran1243) and **run manifests** that record model/weights/config per processed video.

## 3. Files/APIs worth studying

- `supervision/tracker/byte_tracker/core.py`: `ByteTrack.__init__(track_activation_threshold=0.25, lost_track_buffer=30, minimum_matching_threshold=0.8, frame_rate=30, minimum_consecutive_frames=1)`; `update_with_detections(detections) -> Detections`.
- `supervision/utils/video.py`: `VideoInfo(width, height, fps, total_frames=None)`; `get_video_frames_generator(source_path, stride=1, start=0, end=None, iterative_seek=False)`; `VideoSink(target_path, video_info, codec="mp4v")`.
- YOLOX `demo/ONNXRuntime/onnx_inference.py`, `yolox/utils/demo_utils.py` (`demo_postprocess`, `multiclass_nms`, `nms`), `yolox/data/data_augment.py` (`preproc`).
- dattran1243: pitch model and homography code (read the README for file names; study the RANSAC validation and the mini-map gating).
- alina-letzien: `train.py` (fine-tune recipe), `config.py` (weights path), KMeans team-colour step (to avoid, see below).

## 4. Reuse immediately

- **supervision** (MIT): ByteTrack, `Detections`, `VideoInfo`, frame generator, `VideoSink`, annotators.
- **YOLOX** Apache-2.0 preprocessing and decoding logic, re-implemented in the processor (verify weight licence first, section 5).
- **dattran1243 homography validation pattern** (MIT code), re-implemented for GAA pitch markings.
- **Output contract**: CSV/JSON + annotated MP4 + run manifest (dattran1243 pattern).

## 5. Licensing constraints

- **Ultralytics YOLOv8/YOLO26 is AGPL-3.0.** Using its code, and arguably its weights, in a distributed Apache-2.0 project creates copyleft obligations (network-use clause included). Avoid in the shipped processor. Commercial use requires the paid Enterprise licence. The README says pretrained weights download from the Ultralytics release, and no separate weights licence is stated, so treat the weights as AGPL.
- **roboflow/sports**: no licence found in the README. Do not copy code until a LICENSE is confirmed.
- **dattran1243 football-video-analytics**: code MIT, but its weights and datasets are excluded from the MIT licence. Do not redistribute its football weights in the repo without checking third-party notices.
- **alina-letzien**: MIT (README); its pipeline depends on Ultralytics (AGPL) via `yolo26x.pt`, so do not reuse that detector path.
- **supervision**: MIT, Python >=3.10.
- **YOLOX**: code Apache-2.0. The ONNX checkpoints are linked from GitHub release pages; the README gives no weights licence. Treat as **unverified** and confirm before bundling (ideally cite the repo's LICENSE and check the release notes; ask upstream if unclear).
- Roboflow Universe datasets: check each dataset's licence before training on it.
- Rugby/academic code: thesis and paper code not confirmed public; do not assume reuse rights.

## 6. Do not build from scratch

- Multi-object tracker: use supervision's ByteTrack (do not write Kalman/Hungarian from scratch).
- Video I/O and frame generator, annotated-video writer: use supervision's `get_video_frames_generator` and `VideoSink`.
- NMS: use the YOLOX/onnx-based NMS, or `supervision`'s NMS; do not hand-roll IoU logic beyond the documented implementation.
- Pitch homography: use OpenCV `findHomography` with RANSAC; do not invent a calibration method.
- Detection training data for GAA: needs a labelled GAA dataset; no public GAA dataset was found. Plan annotation rather than expecting reuse.

## 7. YOLOX ONNX inference details

Verified from [`demo/ONNXRuntime/onnx_inference.py`](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/demo/ONNXRuntime/onnx_inference.py), [`yolox/data/data_augment.py`](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/yolox/data/data_augment.py) (`preproc`) and [`yolox/utils/demo_utils.py`](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/yolox/utils/demo_utils.py).

**Input size**
- Demo default `--input_shape "640,640"`, parsed as `tuple(map(int, args.input_shape.split(',')))`.
- The PyTorch benchmark table gives 640 for s/m/l/x/Darknet53, and 416 for Nano and Tiny. Use the input shape of the specific ONNX file you download (Nano is 416).

**Preprocessing (`preproc`)**
- Input: OpenCV `cv2.imread` image, so **BGR**. No colour conversion.
- Scale ratio: `r = min(input_h / img_h, input_w / img_w)`. Aspect ratio preserved.
- Resize with `cv2.INTER_LINEAR` to `(int(w*r), int(h*r))`, cast to uint8.
- Canvas: `np.ones((input_h, input_w, 3), uint8) * 114`. **Padding value 114** on all channels.
- The resized image is pasted into the **top-left** corner (not centred).
- Transpose HWC to CHW with `swap=(2, 0, 1)`.
- Cast to **float32**, contiguous. **No division by 255, no mean/std normalisation** (raw 0-255 values).
- Batch dimension added in the demo: `img[None, :, :, :]`. Returns `(padded_img, r)`.

**Decoding**
1. `output = session.run(None, {input_name: img})`; `predictions = demo_postprocess(output[0], input_shape)[0]`. Output shape is `[1, N, 5 + num_classes]` (anchor-free, one row per grid cell per stride; 8/16/32 strides).
2. `demo_postprocess`:
   - Build grids per stride: `xv, yv = np.meshgrid(np.arange(wsize), np.arange(hsize))`, `grid = np.stack((xv, yv), 2).reshape(1, -1, 2)`, `expanded_strides = np.full((*shape, 1), stride)`.
   - XY: `outputs[..., :2] = (outputs[..., :2] + grids) * expanded_strides`
   - WH: `outputs[..., 2:4] = np.exp(outputs[..., 2:4]) * expanded_strides`
3. Scores: `scores = predictions[:, 4:5] * predictions[:, 5:]` (objectness x class probability).
4. Boxes: centre/size to corners (`x1 = cx - w/2`, `y1 = cy - h/2`, etc.), then **divide by the ratio**: `boxes_xyxy /= ratio` to map back to the original image.
5. NMS: `multiclass_nms(boxes_xyxy, scores, nms_thr=0.45, score_thr=0.1)`.
   - Default path is class-agnostic: `cls_inds = scores.argmax(1)`, `cls_scores = scores[arange, cls_inds]`, keep `cls_scores > score_thr`, then greedy NMS.
   - Class-aware path loops over classes with the same score mask per column.
   - NMS IoU: `areas = (x2-x1+1)*(y2-y1+1)`; `ovr = inter / (areas[i] + areas[rest] - inter)`; keep `ovr <= nms_thr`.
   - Output per detection: `[x1, y1, x2, y2, score, class_id]`.
6. Drawing in the demo filters again at `score_thr = 0.3` (CLI default), so the effective display threshold is 0.3 while NMS input uses 0.1.

**Implementation notes for the processor**
- Expect `output[0]` shape `[1, N, 85]` for 80-class COCO weights; adjust for GAA class count.
- Use `(x-0)` no normalisation; if a re-exported model expects normalised input, it will misdetect silently. Check the exported model's own preprocess before reuse.
- Decoding is numpy; no torch needed. Port to plain numpy in the Python processor.
- Note the `multiclass_nms_class_agnostic` path assigns `dets` only `if keep:`, so guard against empty results.

**Not verified:** the YOLOX ONNX model zoo table (names, opset, exact input size per file) was not in the README; check the release assets for `yolox_nano.onnx` / `yolox_s.onnx` and their input shapes via `onnx` before relying on them.

## Next steps (short)

1. Confirm YOLOX weight licence (ask upstream or check release notes) before bundling.
2. Confirm roboflow/sports licence before copying anything.
3. Plan a GAA-labelled dataset (no public source found).
4. Prototype: YOLOX (ONNX, 640) -> supervision ByteTrack -> OpenCV homography with RANSAC gating.
