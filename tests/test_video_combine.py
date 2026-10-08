"""/api/video/combine: join clips, optionally mix a score under their sound. Uses real ffmpeg on tiny generated clips; skipped without it."""
import base64
import shutil
import subprocess

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.routers.video_tools as video_tools

FFMPEG = shutil.which("ffmpeg")
pytestmark = pytest.mark.skipif(not FFMPEG, reason="ffmpeg not installed")


@pytest.fixture(scope="module")
def client():
    app = FastAPI()
    app.include_router(video_tools.router)
    return TestClient(app)


def _run(*args):
    result = subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *args], capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr


def _clip(path, colour, seconds=1, audio=True):
    args = ["-f", "lavfi", "-i", f"color=c={colour}:s=160x120:r=15:d={seconds}"]
    if audio:
        args += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
    args += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if audio:
        args += ["-c:a", "aac", "-shortest"]
    _run(*args, str(path))
    return path


@pytest.fixture(scope="module")
def clips(tmp_path_factory):
    d = tmp_path_factory.mktemp("clips")
    return {
        "red": _clip(d / "red.mp4", "red"),
        "blue": _clip(d / "blue.mp4", "blue"),
        "mute": _clip(d / "mute.mp4", "green", audio=False),
    }


@pytest.fixture(scope="module")
def score(tmp_path_factory):
    path = tmp_path_factory.mktemp("score") / "score.wav"
    _run("-f", "lavfi", "-i", "sine=frequency=220:duration=5", str(path))   # longer than the film: must be trimmed to it
    return path


def b64(path):
    return base64.b64encode(path.read_bytes()).decode()


def info(tmp_path, data_b64, name="out.mp4"):
    out = tmp_path / name
    out.write_bytes(base64.b64decode(data_b64))
    probe = subprocess.run([FFMPEG, "-hide_banner", "-i", str(out)], capture_output=True, text=True)
    text = probe.stderr
    import re
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", text)
    seconds = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return {"seconds": seconds, "audio": " Audio:" in text, "video": " Video:" in text}


def test_two_clips_are_joined(client, clips, tmp_path):
    res = client.post("/api/video/combine", json={"videos": [b64(clips["red"]), b64(clips["blue"])]})
    assert res.status_code == 200, res.text
    got = info(tmp_path, res.json()["video"])
    assert got["video"] and got["audio"]
    assert 1.8 < got["seconds"] < 2.3


def test_one_clip_alone_is_refused(client, clips):
    res = client.post("/api/video/combine", json={"videos": [b64(clips["red"])]})
    assert res.status_code == 400


def test_score_is_mixed_under_the_film_and_trimmed_to_it(client, clips, score, tmp_path):
    res = client.post("/api/video/combine", json={"videos": [b64(clips["red"]), b64(clips["blue"])], "audio": b64(score), "audio_volume": 0.4})
    assert res.status_code == 200, res.text
    got = info(tmp_path, res.json()["video"])
    assert got["video"] and got["audio"]
    assert got["seconds"] < 2.4, "a 5 s score must not lengthen a 2 s film"


def test_one_clip_and_a_score_is_allowed(client, clips, score, tmp_path):
    res = client.post("/api/video/combine", json={"videos": [b64(clips["red"])], "audio": b64(score)})
    assert res.status_code == 200, res.text
    assert info(tmp_path, res.json()["video"])["audio"]


def test_a_film_with_no_sound_gets_the_score_as_its_sound(client, clips, score, tmp_path):
    res = client.post("/api/video/combine", json={"videos": [b64(clips["mute"])], "audio": b64(score)})
    assert res.status_code == 200, res.text
    got = info(tmp_path, res.json()["video"])
    assert got["audio"] and got["seconds"] < 1.4


def test_volume_outside_0_to_1_is_rejected(client, clips, score):
    res = client.post("/api/video/combine", json={"videos": [b64(clips["red"]), b64(clips["blue"])], "audio": b64(score), "audio_volume": 3})
    assert res.status_code == 422


def test_a_data_uri_is_accepted_for_clips_and_score(client, clips, score, tmp_path):
    uri = lambda p, mime: f"data:{mime};base64,{b64(p)}"
    res = client.post("/api/video/combine", json={"videos": [uri(clips["red"], "video/mp4"), uri(clips["blue"], "video/mp4")], "audio": uri(score, "audio/wav")})
    assert res.status_code == 200, res.text
