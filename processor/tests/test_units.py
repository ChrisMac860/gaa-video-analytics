import numpy as np
import cv2

from gaa_cv.detector import PERSON, BALL, decode_detections, demo_postprocess, nms, preprocess
from gaa_cv.events import CandidateExtractor, FrameObs, PlayerObs
from gaa_cv.team import KMeansTeamClassifier


def test_preprocess_letterbox():
    img = np.full((360, 640, 3), 50, np.uint8)
    out, r = preprocess(img, 416)
    assert out.shape == (3, 416, 416) and out.dtype == np.float32
    assert abs(r - 416 / 640) < 1e-9
    assert out[0, 10, 10] == 50          # image area, not normalised
    assert out[0, 415, 415] == 114       # pad value
    assert out[1, 300, 5] == 114         # below resized height (234)


def synth_output(size=416):
    n = sum((size // s) ** 2 for s in (8, 16, 32))
    raw = np.zeros((1, n, 85), np.float32)
    raw[..., 2:4] = np.log(1e-3)  # tiny boxes
    return raw


def test_decode_and_nms():
    size = 416
    raw = synth_output(size)
    # cell (row 10, col 20) on stride-8 grid: index = 10*52+20 ; centre = (20+dx)*8
    i = 10 * 52 + 20
    raw[0, i, :2] = 0.5
    raw[0, i, 2:4] = np.log(40 / 8)
    raw[0, i, 4] = 0.9
    raw[0, i, 5 + PERSON] = 0.9
    j = i + 1  # neighbouring cell, overlapping duplicate
    raw[0, j, :2] = 0.5
    raw[0, j, 2:4] = np.log(40 / 8)
    raw[0, j, 4] = 0.8
    raw[0, j, 5 + PERSON] = 0.8
    k = 30 * 52 + 5  # ball
    raw[0, k, :2] = 0.0
    raw[0, k, 2:4] = np.log(8 / 8)
    raw[0, k, 4] = 0.5
    raw[0, k, 5 + BALL] = 0.5
    dec = demo_postprocess(raw, (size, size))
    assert abs(dec[0, i, 0] - (20.5 * 8)) < 1e-3 and abs(dec[0, i, 2] - 40) < 1e-3
    det = decode_detections(raw, size, ratio=0.5, thr_person=0.35, thr_ball=0.15)
    assert (det.class_id == PERSON).sum() == 1      # NMS removed duplicate
    assert (det.class_id == BALL).sum() == 1
    p = det.xyxy[det.class_id == PERSON][0]
    # centre 164+4=164 -> (20.5*8=164, 10.5*8=84), w=h=40, then /0.5
    np.testing.assert_allclose(p, [(164 - 20) / .5, (84 - 20) / .5, (164 + 20) / .5, (84 + 20) / .5], atol=1e-2)
    assert len(decode_detections(synth_output(), 416, 1.0, 0.35, 0.15)) == 0


def test_nms_basic():
    b = np.array([[0, 0, 10, 10], [1, 1, 11, 11], [50, 50, 60, 60]], float)
    assert nms(b, np.array([.9, .8, .7]), 0.45) == [0, 2]


def jersey(frame, box, bgr):
    x1, y1, x2, y2 = box
    frame[y1:y2, x1:x2] = bgr
    return frame


def test_team_clustering_red_vs_blue():
    rng = np.random.default_rng(0)
    clf = KMeansTeamClassifier()
    truth = {}
    for tid in range(1, 11):
        red = tid % 2 == 0
        truth[tid] = red
        for _ in range(5):
            f = np.zeros((200, 100, 3), np.uint8)
            f[:] = (40, 150, 50)  # grass
            col = (30, 30, 200) if red else (200, 60, 30)
            col = tuple(int(np.clip(c + rng.integers(-15, 15), 0, 255)) for c in col)
            jersey(f, (20, 20, 80, 120), col)
            clf.observe(tid, f, (20, 20, 80, 190))
    assert clf.fit()
    labs = {tid: clf.label(tid) for tid in truth}
    assert len({labs[t] for t in truth if truth[t]}) == 1
    assert len({labs[t] for t in truth if not truth[t]}) == 1
    assert labs[2] != labs[1]
    assert all(v.startswith("#") and len(v) == 7 for v in clf.colours.values())


def test_grass_masked():
    clf = KMeansTeamClassifier(min_tracks=2)
    for tid, col in ((1, (30, 30, 200)), (2, (200, 60, 30))):
        f = np.zeros((200, 100, 3), np.uint8)
        f[:] = (40, 150, 50)
        f[20:60, 40:60] = col  # small patch of jersey inside torso, rest grass
        for _ in range(3):
            clf.observe(tid, f, (20, 20, 80, 190))
    assert clf.fit() and clf.label(1) != clf.label(2)


def mk(t, ball, players):
    return FrameObs(t=t, ball=ball, players=[PlayerObs(i, b, tm) for i, b, tm in players])


def test_possession_change():
    A = (0, 0, 20, 60)
    B = (200, 0, 220, 60)
    frames = []
    # ball with A for 6 frames, then with B for 6 frames
    for k in range(6):
        frames.append(mk(k * 0.1, (10, 30, 0.6), [(1, A, "A"), (2, B, "B")]))
    for k in range(6, 12):
        frames.append(mk(k * 0.1, (210, 30, 0.6), [(1, A, "A"), (2, B, "B")]))
    c = CandidateExtractor(min_frames=4).possession_changes(frames, 100)
    assert len(c) == 1
    assert c[0]["teamCluster"] == "B" and c[0]["status"] == "inferred" and c[0]["detail"]
    assert 0 < c[0]["confidence"] <= 0.9
    assert abs(c[0]["t"] - 0.6) < 1e-6


def test_possession_flicker_and_far_ball_ignored():
    A, B = (0, 0, 20, 60), (200, 0, 220, 60)
    frames = [mk(k * 0.1, (10, 30, 0.6), [(1, A, "A"), (2, B, "B")]) for k in range(5)]
    frames += [mk(0.5, (210, 30, 0.6), [(1, A, "A"), (2, B, "B")]),
               mk(0.6, (10, 30, 0.6), [(1, A, "A"), (2, B, "B")])]
    frames += [mk(0.7 + k * 0.1, (110, 30, 0.6), [(1, A, "A"), (2, B, "B")]) for k in range(6)]  # too far (>8px)
    assert CandidateExtractor(min_frames=4).possession_changes(frames, 100) == []


def test_ball_segments():
    frames = [mk(k * 0.1, (5, 5, 0.5) if k not in (4,) else None, []) for k in range(8)]
    frames += [mk(1.0 + k * 0.1, None, []) for k in range(10)]
    frames += [mk(2.0 + k * 0.1, (5, 5, 0.4), []) for k in range(2)]  # too short
    s = CandidateExtractor().ball_segments(frames)
    assert len(s) == 1 and s[0]["status"] == "observed" and s[0]["kind"] == "ball_visible_segment"


def test_render_frame_draws_people_and_ball():
    """Regression: annotating frames that contain people used to crash (no class_id for colour lookup)."""
    from gaa_cv.annotate import render_frame
    from gaa_cv.pipeline import Row

    class Team:
        def label(self, tid):
            return {1: "A", 2: "B"}.get(tid)

    frame = np.zeros((120, 160, 3), np.uint8)
    rows = [Row(0, 0.0, 1, "person", (10, 10, 40, 90), 0.9), Row(0, 0.0, 2, "person", (60, 10, 90, 90), 0.8),
            Row(0, 0.0, 3, "person", (100, 10, 130, 90), 0.7), Row(0, 0.0, -1, "ball", (140, 100, 146, 106), 0.3)]
    out = render_frame(frame, rows, Team())
    assert out.shape == frame.shape and out.any()
    assert not frame.any()  # input untouched
