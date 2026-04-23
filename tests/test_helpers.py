"""Tests for backend.helpers — base64 decoding with size guard, and JSON parsing.

These cover the security-sensitive base64 decode path (size cap prevents a
single oversized request from exhausting memory) and the LLM-JSON parser
(handles markdown code fences from chatty models).
"""
import base64

import pytest

from backend.helpers import (
    MAX_DECODED_IMAGE_BYTES,
    decode_base64_image,
    parse_llm_json,
)


def _b64(payload: bytes) -> str:
    return base64.b64encode(payload).decode("ascii")


class TestDecodeBase64Image:
    def test_decodes_raw_base64(self):
        payload = b"\x89PNG\r\n\x1a\nfake-png-bytes"
        encoded = _b64(payload)
        assert decode_base64_image(encoded) == payload

    def test_strips_data_uri_prefix(self):
        payload = b"hello world"
        encoded = _b64(payload)
        data_uri = f"data:image/png;base64,{encoded}"
        assert decode_base64_image(data_uri) == payload

    def test_rejects_oversized_payload(self):
        # Build an encoded string that *claims* to decode to more than the cap.
        # We don't actually need to allocate the bytes — the size check runs
        # on the encoded string before b64decode is called.
        oversized_encoded_len = ((MAX_DECODED_IMAGE_BYTES + 1024) * 4) // 3
        fake_encoded = "A" * oversized_encoded_len
        with pytest.raises(ValueError, match="too large"):
            decode_base64_image(fake_encoded)

    def test_respects_custom_max(self):
        payload = b"x" * 200
        encoded = _b64(payload)
        with pytest.raises(ValueError, match="too large"):
            decode_base64_image(encoded, max_bytes=64)


class TestParseLlmJson:
    def test_parses_plain_json(self):
        assert parse_llm_json('{"a": 1}') == {"a": 1}

    def test_parses_fenced_json(self):
        wrapped = '```json\n{"a": 1, "b": [2, 3]}\n```'
        assert parse_llm_json(wrapped) == {"a": 1, "b": [2, 3]}

    def test_raises_on_garbage(self):
        with pytest.raises(Exception, match="valid JSON"):
            parse_llm_json("not json and no fence either")
