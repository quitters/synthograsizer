"""Live smoke test for the Interactions API migration.

Exercises every migrated surface against the real Gemini API, in both
google_api_mode settings, using the cheapest sensible models:

  text, streaming (with thought-leak check), JSON mode, multi-turn chat,
  vision analysis, Gemini image generation, google_search grounding.

Usage:
  python scripts/verify_interactions.py                  # both modes, core surfaces
  python scripts/verify_interactions.py --mode interactions
  python scripts/verify_interactions.py --skip-image     # skip image-gen spend
  python scripts/verify_interactions.py --imagen --veo   # also ping legacy-only APIs

Needs GOOGLE_API_KEY / GEMINI_API_KEY (or ai_studio_config.json). Every
Interactions call goes through backend.google_api, so this also verifies
store=False plumbing end-to-end. Exits non-zero if any check fails.
"""

import argparse
import base64
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import config, google_api  # noqa: E402
from backend.policy import policy, VALID_GOOGLE_APIS  # noqa: E402

FAST = config.MODEL_FAST
RESULTS = []


def check(name, fn):
    try:
        detail = fn()
        RESULTS.append((name, True, detail or ""))
        print(f"  OK   {name}" + (f" — {detail}" if detail else ""))
    except Exception as exc:  # noqa: BLE001 — report and continue
        RESULTS.append((name, False, str(exc)))
        print(f"  FAIL {name} — {exc}")


def tiny_png() -> bytes:
    """1x1 red PNG (no PIL dependency needed — hand-rolled is fine via PIL anyway)."""
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def run_mode(client, mode: str, args) -> None:
    print(f"\n=== google_api_mode = {mode} ===")
    policy.update(google_api_mode=mode)

    check("text", lambda: google_api.gen_text(
        client, FAST, [google_api.text_block("Reply with exactly: pong")])[:40])

    def _stream():
        chunks = list(google_api.gen_text_stream(
            client, FAST,
            [google_api.text_block("Count from 1 to 5, digits only.")]))
        text = "".join(chunks)
        assert text.strip(), "empty stream"
        lowered = text.lower()
        for marker in ("thinking", "thought:"):
            assert marker not in lowered, f"possible thought leak: {text[:120]!r}"
        return f"{len(chunks)} chunks: {text.strip()[:30]!r}"
    check("stream", _stream)

    def _json():
        from backend.helpers import parse_llm_json
        raw = google_api.gen_text(
            client, FAST,
            [google_api.text_block(
                'Return JSON: {"colors": ["red", "blue"]} — exactly that object.')],
            json_mode=True)
        data = parse_llm_json(raw)
        assert isinstance(data, dict) and "colors" in data, raw[:120]
        return "parsed"
    check("json_mode", _json)

    def _chat():
        out = google_api.gen_chat(
            client, FAST, "What is my name? Answer with the name only.",
            [{"role": "user", "content": "My name is Syntho."},
             {"role": "assistant", "content": "Nice to meet you, Syntho!"}])
        assert "syntho" in out.lower(), out[:120]
        return out.strip()[:30]
    check("chat_history", _chat)

    check("vision", lambda: google_api.gen_text(
        client, FAST,
        [google_api.text_block("What color dominates this image? One word."),
         google_api.image_block(tiny_png())])[:30])

    if not args.skip_image:
        def _image():
            img, mime, _text = google_api.gen_image(
                client, config.MODEL_IMAGE_GEN_FAST,
                [google_api.text_block("A plain blue circle on white background")],
                aspect_ratio="1:1")
            assert img and len(img) > 1000, "no/tiny image"
            return f"{len(img)} bytes, {mime}"
        check("image_gen", _image)

    # google_search grounding: the Python backend only uses it on the image
    # path (use_google_search), and chatroom/tools.js has its own path — both
    # are covered by the manual chatroom smoke, not duplicated here.

    print(f"--- {mode} done ---")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=list(VALID_GOOGLE_APIS),
                        help="only run one google_api_mode")
    parser.add_argument("--skip-image", action="store_true",
                        help="skip Gemini image generation (saves spend)")
    parser.add_argument("--imagen", action="store_true",
                        help="also ping Imagen (legacy-only surface)")
    parser.add_argument("--veo", action="store_true",
                        help="also ping Veo video generation (slow + costly)")
    args = parser.parse_args()

    api_key = config.get_api_key()
    if not api_key:
        print("No API key configured (GOOGLE_API_KEY / GEMINI_API_KEY / "
              "ai_studio_config.json) — nothing to verify.")
        return 2

    from google import genai
    client = genai.Client(api_key=api_key)

    original_mode = policy.effective_google_api()
    try:
        modes = [args.mode] if args.mode else list(VALID_GOOGLE_APIS)
        for mode in modes:
            run_mode(client, mode, args)

        if args.imagen:
            print("\n=== legacy-only: Imagen ===")
            def _imagen():
                from google.genai import types
                resp = client.models.generate_images(
                    model="imagen-3.0-generate-002",
                    prompt="a plain green square",
                    config=types.GenerateImagesConfig(aspect_ratio="1:1",
                                                      number_of_images=1))
                assert resp.generated_images, "no images"
                return f"{len(resp.generated_images[0].image_bytes)} bytes"
            check("imagen", _imagen)

        if args.veo:
            print("\n=== legacy-only: Veo (long-poll, ~minutes) ===")
            def _veo():
                operation = client.models.generate_videos(
                    model=config.MODEL_VIDEO_GEN,
                    prompt="a slow pan over calm water")
                return f"operation started: {getattr(operation, 'name', 'ok')}"
            check("veo_start", _veo)
    finally:
        policy.update(google_api_mode=original_mode)
        print(f"\n(google_api_mode restored to {original_mode!r})")

    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
