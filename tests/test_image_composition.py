"""Typed composition slots: request model → service → block list.

gemini-3.1-flash-image accepts 10 object + 4 character-consistency + 3 style
references. These tests pin the two halves the wire-shape tests in
test_google_api.py do not cover:

- ImageReferences enforces the per-slot caps at the HTTP boundary, so an
  over-cap request 422s instead of reaching Google;
- the service layer turns the typed payload into slot-tagged blocks in a
  stable order, and leaves the flat ``input_images`` path byte-identical.
"""

import pytest
from pydantic import ValidationError

from backend import google_api
from backend.models.requests import ImageReferences, ImageRequest
from backend.services.image_gen import _clamp_reference_slots, _generate_image_gemini


PNG = b"\x89PNG\r\n\x1a\n" + b"fakepixels"


def img(n: int) -> bytes:
    return PNG + bytes([n])


# ── request model ────────────────────────────────────────────────────────────

class TestImageReferencesModel:
    def test_accepts_a_full_house(self):
        refs = ImageReferences(objects=["o"] * 10, character=["c"] * 4,
                               style=["s"] * 3)
        assert not refs.is_empty()

    @pytest.mark.parametrize("slot,over", [("objects", 11), ("character", 5),
                                           ("style", 4)])
    def test_rejects_over_cap_slots(self, slot, over):
        with pytest.raises(ValidationError):
            ImageReferences(**{slot: ["x"] * over})

    def test_rejects_empty_entries(self):
        with pytest.raises(ValidationError):
            ImageReferences(character=["ok", ""])

    def test_absent_slots_are_empty(self):
        assert ImageReferences().is_empty()

    def test_image_request_defaults_to_no_references(self):
        req = ImageRequest(prompt="a cat")
        assert req.references is None
        assert req.input_images is None

    def test_image_request_carries_references(self):
        req = ImageRequest(prompt="a cat",
                           references={"character": ["c1", "c2"]})
        assert req.references.character == ["c1", "c2"]
        assert req.references.objects is None


# ── service normalization ────────────────────────────────────────────────────

class TestClampReferenceSlots:
    def test_none_and_empty_normalize_to_empty(self):
        assert _clamp_reference_slots(None) == {}
        assert _clamp_reference_slots({"objects": []}) == {}

    def test_plural_and_singular_keys_both_land_on_the_canonical_slot(self):
        out = _clamp_reference_slots({"objects": [img(1)], "character": [img(2)],
                                      "style": [img(3)]})
        assert set(out) == {"object", "character", "style"}

    def test_over_cap_slots_are_trimmed_not_rejected(self):
        """Direct Python callers bypass the model's validator; trim defensively."""
        out = _clamp_reference_slots({"character": [img(i) for i in range(9)]})
        assert len(out["character"]) == 4
        assert out["character"] == [img(i) for i in range(4)]

    def test_unknown_slot_is_an_error(self):
        with pytest.raises(ValueError):
            _clamp_reference_slots({"background": [img(1)]})


# ── block assembly ───────────────────────────────────────────────────────────

class _Recorder:
    """Stands in for AIManager: records the blocks gen_image would have sent."""

    def __init__(self):
        self.genai_client = object()
        self.blocks = None

    def embed_metadata(self, data, prompt, tags=None):
        return data

    def save_output(self, data, name):
        pass


@pytest.fixture
def capture_blocks(monkeypatch):
    """Run _generate_image_gemini against a stubbed google_api.gen_image."""
    seen = {}

    def fake_gen_image(client, model, blocks, **kwargs):
        seen["blocks"] = blocks
        seen["kwargs"] = kwargs
        return PNG, "image/png", None

    monkeypatch.setattr(google_api, "gen_image", fake_gen_image)
    monkeypatch.setattr("backend.policy.policy.effective_safety", lambda s: None)

    def run(**kwargs):
        _generate_image_gemini(_Recorder(), "a prompt",
                               "gemini-3.1-flash-image", "1:1", **kwargs)
        return seen["blocks"]

    return run


class TestBlockAssembly:
    def test_flat_list_produces_untagged_blocks(self, capture_blocks):
        """The pre-existing caller contract, unchanged."""
        blocks = capture_blocks(reference_images=[img(1), img(2)])
        assert [b["type"] for b in blocks] == ["image", "image", "text"]
        assert all("reference_type" not in b for b in blocks[:2])
        assert blocks[2]["text"] == "a prompt"

    def test_slots_are_tagged_and_ordered_object_character_style(self, capture_blocks):
        blocks = capture_blocks(reference_slots={
            "style": [img(3)],
            "character": [img(2)],
            "object": [img(1)],
        })
        assert [b.get("reference_type") for b in blocks[:3]] == [
            "object", "character", "style",
        ]
        assert [b["data"] for b in blocks[:3]] == [img(1), img(2), img(3)]

    def test_flat_and_typed_are_additive_with_flat_first(self, capture_blocks):
        blocks = capture_blocks(reference_images=[img(9)],
                                reference_slots={"character": [img(2)]})
        assert len(blocks) == 3
        assert blocks[0]["data"] == img(9) and "reference_type" not in blocks[0]
        assert blocks[1]["reference_type"] == "character"

    def test_no_references_still_sends_just_the_prompt(self, capture_blocks):
        blocks = capture_blocks()
        assert [b["type"] for b in blocks] == ["text"]
