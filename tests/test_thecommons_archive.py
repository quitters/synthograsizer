"""Archive pieces: other artists' works, framed from an archive, with their credit.

The rules under test are the ones thecommons_archive.py states: off unless a
venue names the archive, no piece without a credit, and no piece whose licence
does not permit shared adaptations.
"""

import json

import pytest

from backend.service import thecommons_archive as archive
from backend.service.thecommons_gallery import SECTIONS, load_gallery
from backend.service.thecommons_gallery_tags import ORIGIN_TAGS

ORIGIN = "http://localhost:8130"


def _piece(**credit_over):
    credit = {
        "title": "Screens", "artist": "Thomas Lin Pedersen", "year": 2022,
        "description": "Screens have been at the heart of art mass production.\n\nA second paragraph.",
        "platform": "Art Blocks",
        "url": "https://www.artblocks.io/collections/curated/projects/0xa7d8/255",
        "artistUrl": "https://data-imaginist.com/screens",
        "license": {"text": "CC BY-NC 4.0", "name": "CC BY-NC 4.0",
                    "url": "https://creativecommons.org/licenses/by-nc/4.0/", "adaptation": "permitted",
                    "terms": ["Credit the artist and name the licence.", "Non-commercial use only."]},
        "editions": 1000,
        "onChain": {"network": "ethereum mainnet", "contract": "0xa7d8", "projectId": 255},
        "archiveId": "artblocks:screens",
        "adaptation": "Adapted for The Commons: controls were added.",
    }
    credit.update(credit_over)
    return {
        "name": "Screens",
        "promptTemplate": "A {{style}} composition in {{palette}}, grain {{grain}}. This is edition {{edition}}.",
        "variables": [
            {"name": "palette", "label": "Palette",
             "values": [{"text": "Autumn", "weight": 3}, {"text": "Bauhaus", "weight": 2}, {"text": "Berlin", "weight": 1}]},
            {"name": "style", "label": "Style",
             "values": [{"text": "Hero", "weight": 3}, {"text": "Crowd", "weight": 2}, {"text": "Collapse", "weight": 1}]},
            {"name": "grain", "label": "Grain", "type": "toggle", "default": True},
            {"name": "edition", "label": "Edition", "type": "number", "min": 1, "max": 1000, "step": 1,
             "default": 1, "access": "host"},
            {"name": "reroll", "label": "Reroll", "type": "trigger", "access": "host"},
        ],
        "credit": credit,
        "page": {"path": "/__commons/wall.html?work=artblocks%3Ascreens"},
    }


@pytest.fixture
def archive_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(archive, "_DIR", tmp_path)
    monkeypatch.setenv(archive.ORIGIN_ENV, ORIGIN)
    load_gallery.cache_clear()
    yield tmp_path
    load_gallery.cache_clear()


def _write(directory, slug, piece):
    (directory / f"{slug}.json").write_text(json.dumps(piece), encoding="utf-8")


def test_off_unless_a_venue_names_the_archive(tmp_path, monkeypatch):
    monkeypatch.setattr(archive, "_DIR", tmp_path)
    _write(tmp_path, "screens", _piece())
    monkeypatch.delenv(archive.ORIGIN_ENV, raising=False)
    assert archive.load_archive() == []
    # An origin, not a URL with a path: the page path comes from the piece.
    monkeypatch.setenv(archive.ORIGIN_ENV, "http://localhost:8130/somewhere")
    assert archive.load_archive() == []
    monkeypatch.setenv(archive.ORIGIN_ENV, "javascript:alert(1)")
    assert archive.load_archive() == []


def test_the_shipped_gallery_has_no_archive_pieces_by_default(monkeypatch):
    monkeypatch.delenv(archive.ORIGIN_ENV, raising=False)
    load_gallery.cache_clear()
    try:
        assert not [p for p in load_gallery() if p["section"] == "archive"]
    finally:
        load_gallery.cache_clear()


def test_a_piece_carries_its_credit_and_its_page(archive_dir):
    _write(archive_dir, "screens", _piece())
    [piece] = archive.load_archive()
    sketch = piece["sketch"]
    assert piece["slug"] == "archive-screens" and sketch["gallery"] == "archive-screens"
    assert piece["section"] == "archive" and piece["origin"] == "adapted"
    assert piece["section"] in {s["id"] for s in SECTIONS} and piece["origin"] in ORIGIN_TAGS
    assert sketch["page"] == {"url": ORIGIN + "/__commons/wall.html?work=artblocks%3Ascreens"}
    # The credit rides with the sketch, so the wall and phones always have it.
    assert sketch["credit"]["artist"] == "Thomas Lin Pedersen"
    assert sketch["credit"]["license"]["adaptation"] == "permitted"
    assert "credit" not in piece   # carried once, on the sketch
    assert piece["lineage"].startswith("Adapted for The Commons")
    assert archive.credit_line(sketch["credit"]) == "Screens, Thomas Lin Pedersen, 2022. Art Blocks. CC BY-NC 4.0."
    # The artist's own words open the card, unedited.
    assert piece["blurb"].startswith("Screens have been at the heart")
    # Phones are told whose work it is.
    assert sketch["ui"]["title"] == "Screens" and sketch["ui"]["tagline"] == "by Thomas Lin Pedersen"
    # The fallback drawing is the credit, and none of the artist's code is here.
    assert "Thomas Lin Pedersen" in sketch["code"]


def test_it_joins_the_gallery_and_loads_as_a_preset(archive_dir):
    _write(archive_dir, "screens", _piece())
    slugs = [p["slug"] for p in load_gallery()]
    assert slugs.count("archive-screens") == 1


@pytest.mark.parametrize("credit", [
    {"artist": ""},
    {"title": None},
])
def test_no_credit_no_piece(archive_dir, credit):
    _write(archive_dir, "screens", _piece(**credit))
    assert archive.load_archive() == []


def test_a_piece_with_no_credit_block_is_skipped(archive_dir):
    piece = _piece()
    del piece["credit"]
    _write(archive_dir, "screens", piece)
    assert archive.load_archive() == []


@pytest.mark.parametrize("adaptation", ["not-permitted", "unclear", "anything-else", None])
def test_no_licence_to_adapt_no_piece(archive_dir, adaptation):
    licence = {"text": "CC BY-NC-ND 4.0", "name": "CC BY-NC-ND 4.0", "url": None, "terms": []}
    if adaptation is not None:
        licence["adaptation"] = adaptation
    _write(archive_dir, "screens", _piece(license=licence))
    assert archive.load_archive() == []


def test_a_credit_keeps_only_http_links_and_known_fields(archive_dir):
    _write(archive_dir, "screens", _piece(url="javascript:alert(1)", artistUrl="ftp://example.com/x",
                                           smuggled="<script>"))
    [piece] = archive.load_archive()
    credit = piece["sketch"]["credit"]
    assert credit["url"] is None and credit["artistUrl"] is None
    assert "smuggled" not in credit


def test_the_page_must_be_a_path_on_the_archive(archive_dir):
    piece = _piece()
    piece["page"] = {"path": "//evil.example/wall.html"}
    _write(archive_dir, "screens", piece)
    piece["page"] = {"path": "https://evil.example/wall.html"}
    _write(archive_dir, "screens2", piece)
    assert archive.load_archive() == []


def test_one_bad_file_does_not_cost_the_others(archive_dir):
    _write(archive_dir, "screens", _piece())
    (archive_dir / "broken.json").write_text("{not json", encoding="utf-8")
    assert [p["slug"] for p in archive.load_archive()] == ["archive-screens"]


def test_the_shipped_archive_files_all_load(monkeypatch):
    """Whatever is committed in thecommons_data/archive must pass its own rules."""
    monkeypatch.setenv(archive.ORIGIN_ENV, ORIGIN)
    files = sorted(archive._DIR.glob("*.json"))
    loaded = {p["slug"] for p in archive.load_archive()}
    assert loaded == {f"archive-{f.stem}" for f in files}


def test_a_long_section_is_paged_and_sortable(archive_dir):
    """The section tells the desk to show a page at a time and what it can be
    ordered by; every piece carries the keys those orders need."""
    assert archive.SECTION["title"] == "Creative Commons Generative Art"
    assert archive.SECTION["paged"] >= 6
    piece = _piece()
    piece["listing"] = {"collected": 1234567}
    piece["thumb"] = {"path": "/__commons/thumb?work=artblocks%3Ascreens"}
    _write(archive_dir, "screens", piece)
    [loaded] = archive.load_archive()
    assert set(loaded["order"]) == {sort["id"] for sort in archive.SECTION["sorts"]}
    assert loaded["order"]["collected"] == 1234567 and loaded["order"]["newest"] == 2022
    assert loaded["thumb"] == ORIGIN + "/__commons/thumb?work=artblocks%3Ascreens"


def test_a_thumbnail_anywhere_else_is_dropped(archive_dir):
    piece = _piece()
    piece["thumb"] = {"path": "https://evil.example/x.jpg"}
    _write(archive_dir, "screens", piece)
    [loaded] = archive.load_archive()
    assert loaded["thumb"] is None


# ── non-commercial: never part of anything paid ─────────────────────────────

def test_every_archive_sketch_is_marked_non_commercial(archive_dir):
    _write(archive_dir, "screens", _piece())
    [piece] = archive.load_archive()
    assert piece["sketch"]["nonCommercial"] is True
    assert archive.is_non_commercial(piece["sketch"])
    # A saved copy that lost the flag is still known by its page.
    assert archive.is_non_commercial({"page": {"url": "http://x"}})
    assert not archive.is_non_commercial({"code": "ctx.fillRect(0,0,1,1)"})
    assert not archive.is_non_commercial(None)


def test_showing_one_is_free_and_a_paid_remix_of_it_is_refused(archive_dir, monkeypatch):
    import uuid

    from fastapi.testclient import TestClient

    import backend.server as server
    from backend.routers import thecommons as router
    from backend.service import db as service_db
    from backend.service import thecommons_jobs, thecommons_relay
    from backend.service.thecommons_gallery import gallery_preset_id
    from tests.test_service_auth import CLIENT_ID, _fake_user
    from tests.test_service_credits import _sign_in
    from tests.test_thecommons_rooms import FakeCommonsPool

    monkeypatch.setenv("SYNTH_AUTH", "1")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SYNTH_TERMS_VERSION", "v0.2")
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)   # otherwise the owner is never debited
    pool = FakeCommonsPool()
    monkeypatch.setattr(service_db, "_pool", pool)
    for registry in (thecommons_relay._relays, thecommons_relay._creation_locks, thecommons_jobs._start_locks):
        registry.clear()
    router._gallery_payload.cache_clear()
    router._gallery_section_payload.cache_clear()
    _write(archive_dir, "screens", _piece())
    client = TestClient(server.app, raise_server_exceptions=False)
    try:
        room_id = pool.seed_room(owner_user_id=1)
        cookies = _sign_in(monkeypatch, _fake_user(id=1))
        before = pool.balance_of(1)

        loaded = client.post(f"/api/thecommons/rooms/{room_id}/presets/load", cookies=cookies,
                             json={"presetId": gallery_preset_id("archive-screens")},
                             headers={"Origin": "http://testserver"})
        assert loaded.status_code == 200
        live = thecommons_relay._relays[room_id].current_sketch
        assert live["nonCommercial"] is True and live["credit"]["artist"] == "Thomas Lin Pedersen"
        assert pool.balance_of(1) == before and pool.ledger == []

        remix = client.post("/api/thecommons/generate", cookies=cookies, json={
            "roomId": room_id, "prompt": "make it blue", "requestId": str(uuid.uuid4()),
            "mode": "remix", "baseSketchId": live["id"]})
        assert remix.status_code == 400
        assert "non-commercial" in remix.json()["detail"]
        assert pool.balance_of(1) == before and pool.ledger == []   # refused before any charge

        # The library does not ship these with the page: a count, then on request.
        gallery = client.get("/api/thecommons/gallery").json()
        section = next(s for s in gallery["sections"] if s["id"] == "archive")
        assert section["lazy"] is True and section["count"] == 1
        assert not [p for p in gallery["pieces"] if p["section"] == "archive"]
        pieces = client.get("/api/thecommons/gallery/archive").json()["pieces"]
        assert [p["slug"] for p in pieces] == ["archive-screens"]
        assert pieces[0]["presetId"] == gallery_preset_id("archive-screens")
        assert client.get("/api/thecommons/gallery/demo").status_code == 404
    finally:
        router._gallery_payload.cache_clear()
        router._gallery_section_payload.cache_clear()
        for registry in (thecommons_relay._relays, thecommons_relay._creation_locks, thecommons_jobs._start_locks):
            registry.clear()
