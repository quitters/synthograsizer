"""The gallery of ready-made pieces: curation, the endpoint, and loading them.

The node-driven test at the bottom is the one that matters most. The Python
validator can check a piece's controls but cannot compile JavaScript, so
without it a syntax error in a curated piece would only surface on someone's
wall. It is skipped, not failed, where node isn't installed.
"""

import json
import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

import backend.server as server
from backend.service import thecommons_relay
from backend.service.thecommons_gallery import _DIR, GALLERY, SECTIONS, gallery_preset_id, load_gallery
from backend.service.thecommons_gallery_panels import PANELS
from backend.service.thecommons_ui import SKINS, normalize_ui
from backend.service.thecommons_validate import validate_native_sketch

from tests.test_service_auth import _fake_user
from tests.test_service_credits import _sign_in
from tests.test_thecommons_rooms import service_on, fake_pool  # noqa: F401  (fixtures)

client = TestClient(server.app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def reset_relay_registry():
    # The relay registry is in-process: without this, a piece loaded into
    # "room 1" by one test is still on the wall of the next test's room 1.
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()
    yield
    thecommons_relay._relays.clear()
    thecommons_relay._creation_locks.clear()


# ── the pieces themselves ───────────────────────────────────────────────────

def test_every_piece_loads_and_passes_the_generated_sketch_validator():
    # load_gallery() skips anything invalid rather than crash the app, so a
    # silently-missing piece is the failure mode worth pinning here.
    assert len(load_gallery()) == len(GALLERY)


def test_slugs_and_preset_ids_are_unique_and_every_piece_has_code():
    slugs = [meta["slug"] for meta in GALLERY]
    assert len(set(slugs)) == len(slugs)
    assert len({gallery_preset_id(s) for s in slugs}) == len(slugs)
    for slug in slugs:
        assert (_DIR / f"{slug}.js").is_file(), slug


def test_badges_are_derived_from_the_piece_not_declared():
    for piece in load_gallery():
        triggers = [v for v in piece["sketch"]["variables"] if v.get("type") == "trigger"]
        assert piece["interactive"] == bool(triggers)
        assert piece["usesPeople"] == ("room.people" in piece["sketch"]["code"])


def test_no_two_controls_on_a_piece_share_a_label():
    # A phone shows labels, not names; two "Stars" controls is a real confusion.
    for piece in load_gallery():
        labels = [v["label"] for v in piece["sketch"]["variables"]]
        assert len(set(labels)) == len(labels), piece["slug"]


def test_gallery_marker_does_not_survive_validation():
    """Generated and remixed sketches pass through the validator, which must
    drop the marker — otherwise a remix would still claim to be the curated
    piece and the desk would mark the wrong card as live."""
    sketch = dict(load_gallery()[0]["sketch"])
    assert sketch["gallery"]
    assert "gallery" not in validate_native_sketch(sketch)


def test_every_piece_belongs_to_a_known_section():
    ids = {section["id"] for section in SECTIONS}
    for piece in load_gallery():
        assert piece["section"] in ids, piece["slug"]


def test_provenance_is_honest():
    """A generated piece says so and shows the prompt that made it; a piece
    written here or ported from elsewhere claims neither, and a ported one
    names what it was ported from."""
    for piece in load_gallery():
        if piece["origin"] == "generated":
            assert piece["prompt"], piece["slug"]
            assert "Generated" in piece["lineage"], piece["slug"]
        else:
            assert piece["origin"] in ("hand-written", "ported"), piece["slug"]
            assert piece["prompt"] is None, piece["slug"]
            if piece["origin"] == "ported":
                assert "Ported from" in piece["lineage"], piece["slug"]


def test_every_piece_has_a_panel_that_needed_no_patching():
    """normalize_ui() quietly repairs a bad spec, which is right for model
    output and wrong for a curated one: a panel fixed up on load is a panel
    nobody actually reviewed. So every field written here must come through
    exactly as written."""
    assert set(PANELS) == {meta["slug"] for meta in GALLERY}
    for piece in load_gallery():
        written, served = PANELS[piece["slug"]], piece["sketch"]["ui"]
        for field in ("skin", "variant", "title", "tagline", "mobile", "desktop"):
            assert served[field] == written[field], (piece["slug"], field)
        assert served["groups"] == written["groups"], piece["slug"]
        for name, control in written["controls"].items():
            assert served["controls"][name] == {"hint": "", **control}, (piece["slug"], name)
        assert piece["panel"] == SKINS[written["skin"]]["label"]


def test_the_gallery_shows_off_every_skin():
    counts = {skin: 0 for skin in SKINS if skin != "commons"}
    for piece in load_gallery():
        counts[piece["sketch"]["ui"]["skin"]] += 1
    assert all(n >= 4 for n in counts.values()), counts


# ── the endpoint ────────────────────────────────────────────────────────────

def test_gallery_endpoint_is_public_and_revalidates():
    r = client.get("/api/thecommons/gallery")   # deliberately no cookies
    assert r.status_code == 200
    # Revalidated, never cached for a fixed time: a max-age once hid newly
    # added pieces from the desk for five minutes after a deploy.
    assert r.headers["cache-control"] == "no-cache"
    etag = r.headers["etag"]
    again = client.get("/api/thecommons/gallery", headers={"If-None-Match": etag})
    assert again.status_code == 304
    assert client.get("/api/thecommons/gallery", headers={"If-None-Match": '"stale"'}).status_code == 200
    pieces = r.json()["pieces"]
    assert [p["slug"] for p in pieces] == [meta["slug"] for meta in GALLERY]
    for p in pieces:
        assert p["presetId"] == gallery_preset_id(p["slug"])
        assert p["sketch"]["code"]
    assert [section["id"] for section in r.json()["sections"]] == [section["id"] for section in SECTIONS]


def test_gallery_endpoint_serves_only_curated_code(service_on, fake_pool, monkeypatch):
    """The desk runs everything this endpoint returns, on the signed-in page.
    A room's own saved looks — which may be model-generated — must never appear
    here, however many a room has."""
    room_id = fake_pool.seed_room(owner_user_id=1)
    fake_pool.room_jobs[1] = {
        "id": 1, "room_id": room_id, "status": "preset", "preset_name": "my generated look",
        "sketch": json.dumps({"name": "Generated", "code": "fetch('/api/anything')", "variables": []}),
        "values": "{}", "finished_at": None,
    }
    cookies = _sign_in(monkeypatch, _fake_user(id=1))
    pieces = client.get("/api/thecommons/gallery", cookies=cookies).json()["pieces"]
    curated = {meta["slug"] for meta in GALLERY}
    assert {p["slug"] for p in pieces} == curated
    assert all(p["sketch"]["gallery"] in curated for p in pieces)
    assert not any("fetch(" in p["sketch"]["code"] for p in pieces)


# ── loading a piece onto the wall ───────────────────────────────────────────

def test_gallery_pieces_are_listed_as_presets(service_on, fake_pool, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _sign_in(monkeypatch, _fake_user(id=1))
    presets = client.get(f"/api/thecommons/rooms/{room_id}/presets", cookies=cookies).json()["presets"]
    ids = {p["id"] for p in presets}
    for meta in GALLERY:
        assert gallery_preset_id(meta["slug"]) in ids


def test_loading_a_gallery_piece_puts_it_on_the_wall_for_free(service_on, fake_pool, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _sign_in(monkeypatch, _fake_user(id=1))
    balance_before = fake_pool.balance_of(1)

    r = client.post(f"/api/thecommons/rooms/{room_id}/presets/load", cookies=cookies,
                    json={"presetId": gallery_preset_id("fire")}, headers={"Origin": "http://testserver"})
    assert r.status_code == 200
    assert r.json()["name"] == "Fire"

    relay = thecommons_relay._relays[room_id]
    assert relay.current_sketch["gallery"] == "fire"
    room = client.get(f"/api/thecommons/rooms/{room_id}", cookies=cookies).json()
    assert room["gallerySlug"] == "fire"
    assert room["canUndo"] is True   # so a mis-click needs no confirmation dialog
    # The desk previews the phones' panel from data alone -- never the code.
    assert room["panel"]["ui"]["skin"] == PANELS["fire"]["skin"]
    assert [v["name"] for v in room["panel"]["variables"]] == [v["name"] for v in relay.current_sketch["variables"]]
    assert "code" not in room["panel"]
    # The whole point for hosts: a ready-made piece costs nothing.
    assert fake_pool.balance_of(1) == balance_before
    assert fake_pool.ledger == []


def test_gallery_slug_is_null_for_anything_else(service_on, fake_pool, monkeypatch):
    room_id = fake_pool.seed_room(owner_user_id=1)
    cookies = _sign_in(monkeypatch, _fake_user(id=1))
    room = client.get(f"/api/thecommons/rooms/{room_id}", cookies=cookies).json()
    assert room["gallerySlug"] is None   # a fresh room shows a fallback piece, not a gallery one


# ── the code actually runs ──────────────────────────────────────────────────

_NODE_HARNESS = r"""
const { readFileSync } = require('node:fs');
const [dir, specJson] = process.argv.slice(2);
// A plain object, not a Proxy: pieces make thousands of ctx calls a frame and
// a Proxy trap on each one made this test ten times slower. A method missing
// from this list fails loudly as "not a function" -- add it here if so.
const grad = { addColorStop() {} };
const noop = () => {};
const METHODS = ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
  'rect', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'translate', 'rotate', 'scale',
  'transform', 'setTransform', 'resetTransform', 'drawImage', 'putImageData', 'fillText', 'strokeText',
  'setLineDash', 'bezierCurveTo', 'quadraticCurveTo'];
function stub(canvas) {
  const s = { canvas, globalCompositeOperation: 'source-over', globalAlpha: 1, imageSmoothingEnabled: true,
              fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif' };
  for (const m of METHODS) s[m] = noop;
  s.createImageData = (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  s.createLinearGradient = s.createRadialGradient = s.createConicGradient = () => grad;
  s.createPattern = () => ({});
  s.measureText = (t) => ({ width: String(t).length * 7 });
  s.getLineDash = () => [];
  return s;
}
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; }
                                     getContext() { return stub(this); } };
// Numbers a piece keeps in state must stay numbers. One generated piece blew up
// numerically, and NaN spreads through a simulation until the wall is blank for
// good -- while every other check still passes.
function nanIn(state) {
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'number' && Number.isNaN(value)) return key;
    if (value instanceof Float32Array || value instanceof Float64Array) {
      for (let i = 0; i < value.length; i++) if (Number.isNaN(value[i])) return `${key}[${i}]`;
    }
  }
  return null;
}
const failures = [];
for (const [slug, triggers] of Object.entries(JSON.parse(specJson))) {
  const code = readFileSync(`${dir}/${slug}.js`, 'utf8');
  let draw;
  try { draw = new Function('ctx', 'frame', 'getVar', 'audio', 'room', code); }
  catch (e) { failures.push(`${slug}: does not compile: ${e.message}`); continue; }
  // Wall size and thumbnail size, a crowd and an empty room, with this piece's
  // own triggers firing now and then. Ids are hex strings, like real ones.
  for (const [w, h, people] of [[1920, 1080, 3], [256, 144, 0], [1280, 720, 16]]) {
    const room = { state: {}, events: [],
                   people: Array.from({ length: people }, (_, i) => ({ id: `a3f9${i}c0e`, table: `t${i}`, hue: i * 40 })) };
    try {
      for (let i = 0; i < 90; i++) {
        room.events = i % 25 === 0
          ? triggers.map((name) => ({ name, participantId: 'a3f90c0e', table: 't0', t: i / 60 }))
          : [];
        draw(stub({ width: w, height: h }), { t: i / 60, dt: 1 / 60, width: w, height: h }, () => null,
             { level: 0.4, bass: 0.6, mid: 0.3, treble: 0.2, beat: i % 30 === 0 }, room);
      }
      const bad = nanIn(room.state);
      if (bad) failures.push(`${slug} @${w}x${h} with ${people} people: state went NaN at ${bad}`);
    } catch (e) { failures.push(`${slug} @${w}x${h} with ${people} people: ${e.message}`); }
  }
}
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_every_piece_compiles_and_runs_in_a_javascript_engine(tmp_path):
    harness = tmp_path / "harness.cjs"
    harness.write_text(_NODE_HARNESS, encoding="utf-8")
    spec = json.dumps({
        piece["slug"]: [v["name"] for v in piece["sketch"]["variables"] if v.get("type") == "trigger"]
        for piece in load_gallery()
    })
    result = subprocess.run(["node", str(harness), str(_DIR), spec],
                            capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr
