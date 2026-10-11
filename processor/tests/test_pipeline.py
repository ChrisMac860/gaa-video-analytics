import json
import os
from pathlib import Path

import cv2
import numpy as np
import pytest

from gaa_cv.cli import main
from gaa_cv.detector import MODELS_DIR

CONTRACT_TOP = {"schemaVersion", "sport", "match", "video", "coverage", "events", "cv"}
CV_KEYS = {"run", "frames", "tracks", "candidates", "warnings"}
RUN_KEYS = {"processor", "version", "detector", "tracker", "frameStride", "framesAnalysed", "elapsedSec", "capabilities"}


def make_video(path, n=40, fps=25, size=(320, 240)):
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    for i in range(n):
        f = np.full((size[1], size[0], 3), (40, 140, 50), np.uint8)
        cv2.rectangle(f, (20 + i * 3, 80), (50 + i * 3, 160), (30, 30, 200), -1)
        cv2.rectangle(f, (250 - i * 3, 80), (280 - i * 3, 160), (200, 60, 30), -1)
        cv2.circle(f, (160, 200), 4, (255, 255, 255), -1)
        vw.write(f)
    vw.release()


def check_contract(doc):
    assert set(doc) >= CONTRACT_TOP and set(doc) <= CONTRACT_TOP | {"demo"}
    assert doc["events"] == []
    assert doc["coverage"] == {k: False for k in ("scores", "shots", "kickouts", "turnovers", "frees", "cards")}
    # The shared JSON Schema (schema/analysis.schema.json) is the contract with the web app.
    jsonschema = pytest.importorskip("jsonschema")
    schema = json.loads((Path(__file__).resolve().parents[2] / "schema" / "analysis.schema.json").read_text())
    jsonschema.Draft202012Validator(schema).validate(doc)
    assert doc["match"]["ruleset"] == "gaa-football-2025" and doc["sport"] == "gaelic_football"
    assert doc["video"]["profile"] in ("veo", "generic_mp4", "phone", "fixed_camera", "other")
    cv = doc["cv"]
    assert set(cv) >= CV_KEYS and set(cv["run"]) == RUN_KEYS
    assert set(cv["tracks"]) == {"total", "teamA", "teamB", "unassigned"}
    assert set(cv["run"]["detector"]) == {"model", "licence", "inputSize", "confThreshold"}
    for k in ("frameStride", "framesAnalysed", "elapsedSec"):
        assert k in cv["run"]
    assert set(cv["run"]["capabilities"].values()) <= {"implemented", "experimental", "not_implemented"}
    assert cv["run"]["capabilities"]["shot_recognition"] == "not_implemented"
    for fr in cv["frames"]:
        assert set(fr) == {"t", "persons", "balls", "teamA", "teamB"}
    for c in cv["candidates"]:
        assert c["status"] in ("inferred", "observed") and c["detail"] and 0 <= c["confidence"] <= 1


def test_cli_errors(tmp_path, capsys):
    assert main(["analyse", str(tmp_path / "nope.mp4"), "--out", str(tmp_path / "o.json")]) == 1
    assert "not found" in capsys.readouterr().err
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    assert main(["analyse", str(bad), "--out", str(tmp_path / "o.json")]) == 1
    assert "open video" in capsys.readouterr().err


@pytest.mark.skipif(not (MODELS_DIR / "yolox_nano.onnx").exists(), reason="run scripts/download_models.py")
def test_end_to_end(tmp_path):
    v = tmp_path / "syn.mp4"
    make_video(v, n=40)
    out, csvp, ann = tmp_path / "a.json", tmp_path / "t.csv", tmp_path / "ann.mp4"
    rc = main(["analyse", str(v), "--out", str(out), "--tracks", str(csvp), "--annotate", str(ann),
               "--stride", "2", "--model", "nano", "--home", "Foo", "--away", "Bar", "--profile", "veo"])
    assert rc == 0
    doc = json.loads(out.read_text())
    check_contract(doc)
    assert doc["cv"]["run"]["framesAnalysed"] == 20 == len(doc["cv"]["frames"])
    assert doc["match"]["home"]["name"] == "Foo" and doc["video"]["profile"] == "veo"
    assert csvp.read_text().splitlines()[0] == "frame,t,track_id,class,x1,y1,x2,y2,conf,team_cluster"
    assert ann.stat().st_size > 0


@pytest.mark.skipif(not (MODELS_DIR / "yolox_nano.onnx").exists(), reason="run scripts/download_models.py")
def test_zero_detections_blank_video(tmp_path):
    v = tmp_path / "blank.mp4"
    vw = cv2.VideoWriter(str(v), cv2.VideoWriter_fourcc(*"mp4v"), 25, (320, 240))
    for _ in range(10):
        vw.write(np.zeros((240, 320, 3), np.uint8))
    vw.release()
    out = tmp_path / "a.json"
    assert main(["analyse", str(v), "--out", str(out), "--stride", "1", "--max-seconds", "0.3"]) == 0
    doc = json.loads(out.read_text())
    check_contract(doc)
    assert doc["cv"]["tracks"]["total"] == 0 and doc["cv"]["warnings"]


def test_missing_model(tmp_path, capsys, monkeypatch):
    import gaa_cv.detector as d
    monkeypatch.setattr(d, "MODELS_DIR", tmp_path / "none")
    v = tmp_path / "s.mp4"
    make_video(v, n=4)
    assert main(["analyse", str(v), "--out", str(tmp_path / "o.json")]) == 1
    assert "download_models.py" in capsys.readouterr().err
