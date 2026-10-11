"""YOLOX ONNX detector (Apache-2.0 weights from Megvii).

Pre/post-processing follows YOLOX demo/ONNXRuntime/onnx_inference.py and
yolox/utils/demo_utils.py (preproc letterbox top-left pad 114, no normalisation,
BGR, grid/stride decoding, NMS).
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

import cv2
import numpy as np
import supervision as sv

PERSON, BALL = 0, 32
KEEP_CLASSES = (PERSON, BALL)
MODEL_SPECS = {"nano": ("yolox_nano.onnx", 416), "s": ("yolox_s.onnx", 640)}
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


class ModelMissingError(RuntimeError):
    pass


class Detector(Protocol):
    def detect(self, frame: np.ndarray) -> sv.Detections: ...


def preprocess(img: np.ndarray, input_size: int, swap=(2, 0, 1)):
    """YOLOX `preproc`: resize keeping aspect, pad with 114 at bottom/right."""
    padded = np.ones((input_size, input_size, 3), dtype=np.uint8) * 114
    r = min(input_size / img.shape[0], input_size / img.shape[1])
    resized = cv2.resize(img, (int(img.shape[1] * r), int(img.shape[0] * r)),
                         interpolation=cv2.INTER_LINEAR).astype(np.uint8)
    padded[: resized.shape[0], : resized.shape[1]] = resized
    padded = padded.transpose(swap)
    return np.ascontiguousarray(padded, dtype=np.float32), r


def demo_postprocess(outputs: np.ndarray, img_size, p6: bool = False) -> np.ndarray:
    grids, strides_l = [], []
    strides = [8, 16, 32, 64] if p6 else [8, 16, 32]
    for stride in strides:
        hsize, wsize = img_size[0] // stride, img_size[1] // stride
        xv, yv = np.meshgrid(np.arange(wsize), np.arange(hsize))
        grid = np.stack((xv, yv), 2).reshape(1, -1, 2)
        grids.append(grid)
        strides_l.append(np.full((*grid.shape[:2], 1), stride))
    grids = np.concatenate(grids, 1)
    strides_a = np.concatenate(strides_l, 1)
    outputs = outputs.copy()
    outputs[..., :2] = (outputs[..., :2] + grids) * strides_a
    outputs[..., 2:4] = np.exp(outputs[..., 2:4]) * strides_a
    return outputs


def nms(boxes: np.ndarray, scores: np.ndarray, nms_thr: float) -> list[int]:
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1 + 1)
        h = np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[np.where(ovr <= nms_thr)[0] + 1]
    return keep


def decode_detections(raw: np.ndarray, input_size: int, ratio: float,
                      thr_person: float, thr_ball: float, nms_thr: float = 0.45) -> sv.Detections:
    """raw: model output (1, N, 85). Class-aware NMS for person and ball only."""
    pred = demo_postprocess(raw, (input_size, input_size))[0]
    boxes = pred[:, :4]
    scores = pred[:, 4:5] * pred[:, 5:]
    xyxy = np.empty_like(boxes)
    xyxy[:, 0] = boxes[:, 0] - boxes[:, 2] / 2.0
    xyxy[:, 1] = boxes[:, 1] - boxes[:, 3] / 2.0
    xyxy[:, 2] = boxes[:, 0] + boxes[:, 2] / 2.0
    xyxy[:, 3] = boxes[:, 1] + boxes[:, 3] / 2.0
    xyxy /= ratio
    out_b, out_s, out_c = [], [], []
    for cls, thr in ((PERSON, thr_person), (BALL, thr_ball)):
        cs = scores[:, cls]
        m = cs > thr
        if not m.any():
            continue
        vb, vs = xyxy[m], cs[m]
        keep = nms(vb, vs, nms_thr)
        out_b.append(vb[keep])
        out_s.append(vs[keep])
        out_c.append(np.full(len(keep), cls, dtype=int))
    if not out_b:
        return sv.Detections.empty()
    return sv.Detections(xyxy=np.concatenate(out_b).astype(np.float32),
                         confidence=np.concatenate(out_s).astype(np.float32),
                         class_id=np.concatenate(out_c))


class YoloxOnnxDetector:
    name = "YOLOX"

    def __init__(self, model: str = "nano", person_conf: float = 0.35, ball_conf: float = 0.15,
                 nms_thr: float = 0.45, model_path: str | Path | None = None):
        if model not in MODEL_SPECS:
            raise ValueError(f"Unknown model '{model}' (use nano or s)")
        fname, self.input_size = MODEL_SPECS[model]
        self.model_name = f"yolox_{model}"
        path = Path(model_path) if model_path else MODELS_DIR / fname
        if not path.exists():
            raise ModelMissingError(
                f"Model file not found: {path}\nRun: python processor/scripts/download_models.py {model}")
        import onnxruntime as ort
        self.session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.person_conf, self.ball_conf, self.nms_thr = person_conf, ball_conf, nms_thr

    def detect(self, frame: np.ndarray) -> sv.Detections:
        img, ratio = preprocess(frame, self.input_size)
        raw = self.session.run(None, {self.input_name: img[None]})[0]
        det = decode_detections(raw, self.input_size, ratio, self.person_conf, self.ball_conf, self.nms_thr)
        if len(det):
            h, w = frame.shape[:2]
            det.xyxy[:, [0, 2]] = det.xyxy[:, [0, 2]].clip(0, w - 1)
            det.xyxy[:, [1, 3]] = det.xyxy[:, [1, 3]].clip(0, h - 1)
        return det
