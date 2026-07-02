# Synthograsizer — Headless HTTP API Guide

A reference for driving the Synthograsizer backend entirely from Python over its
HTTP API, with **no browser UI**. Written for an LLM coding agent operating the
suite headlessly.

Everything below was verified against the source (`backend/server.py`,
`backend/routers/*`, `backend/config.py`, `backend/models/requests.py`,
`docs/SCHEMA.md`) and against a live server. Endpoints not listed here are not
covered; do not assume routes that aren't documented.

> Source of truth: model strings live in `backend/config.py`; request bodies in
> `backend/models/requests.py`; route handlers in `backend/routers/*`. If this
> doc and the code disagree, the code wins.

---

## 1. Startup & configuration

### Launch the backend

From the repository root:

```bash
python -m backend.server
```

This runs uvicorn bound to `0.0.0.0:8000` with autoreload on. For a local client
the base URL is:

```
http://127.0.0.1:8000
```

(`start.bat` runs the same entry point on Windows.)

### Keys & tier

- The Google API key is read at startup from the environment: `GOOGLE_API_KEY`
  or `GEMINI_API_KEY` (a `.env` file in the repo root is auto-loaded; a legacy
  `ai_studio_config.json` is a final fallback). See `config.get_api_key()`.
- **Backend tier** is `"google"` (default) or `"local"` (an OpenAI-compatible
  endpoint such as Ollama). **Image generation is Google-only regardless of
  tier** — text steps can run on the local tier, image steps cannot.

### Confirm it's live

`GET /api/health` is the liveness + diagnostics probe **and** the way to read
current configuration. It always returns `200` when the process is up:

```python
import requests
BASE = "http://127.0.0.1:8000"

h = requests.get(f"{BASE}/api/health", timeout=10).json()
assert h["status"] == "ok"
assert h["api_key_configured"] is True          # a key is loaded
assert h["genai_client_available"] is True       # the genai client initialized
print(h["backend_tier"], h["configured_tier"], h["hosted"])
```

Example response:

```json
{
  "status": "ok",
  "api_key_configured": true,
  "genai_client_available": true,
  "message": "Synthograsizer Suite API is running",
  "backend_tier": "google",
  "configured_tier": "google",
  "hosted": false,
  "local_base_url": "http://localhost:11434/v1",
  "local_model": "llama3.1",
  "safety_defaults": [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"}, ...],
  "safety_customized": true
}
```

> **There is no `GET /api/config`.** `GET /api/config` returns `404`. `/api/config`
> exists only as `POST` (operator configuration — see below). To *read* config,
> use `GET /api/health`.

### Change configuration (optional)

`POST /api/config` — all fields optional; send only what you're changing.
Rejected with `403` on hosted instances (`hosted: true`).

```python
requests.post(f"{BASE}/api/config", json={
    "api_key": "AIza...",          # set/replace the Google key
    "backend_tier": "google",      # "google" | "local"
    "local_base_url": "http://localhost:11434/v1",
    "local_model": "llama3.1",
    "google_api_mode": "interactions",  # "interactions" (default) | "legacy" (generateContent)
    "safety_settings": [{"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"}]
})
# -> {"status":"success","applied":["api_key",...],"backend":{...snapshot...}}
```

> **Google API mode.** Gemini-model calls (text / vision / gemini-image) use the
> **Interactions API** by default: every request is stateless (`store=false`,
> nothing retained at Google) and content filtering is Google-managed —
> `safety_settings` thresholds are accepted but **not enforced** in this mode.
> Set `"google_api_mode": "legacy"` to route through generateContent instead,
> which honors the thresholds. `/api/health` reports the active mode as
> `google_api_mode` plus `safety_thresholds_active`. Veo, Imagen, and Lyria are
> unaffected by this switch.

---

## 2. Model identifiers

Exact strings from `backend/config.py`. Pass these as the `model` field.

| Constant | String | Use for |
|---|---|---|
| `MODEL_IMAGE_GEN_FAST` | `gemini-2.5-flash-image` | Fast image gen (default of `ImageRequest`) |
| `MODEL_IMAGE_GEN_NB2` | `gemini-3.1-flash-image-preview` | Image gen, configurable thinking |
| `MODEL_IMAGE_GEN_HQ` | `gemini-3-pro-image-preview` | Highest-quality image gen (thinking always on) |
| `MODEL_VIDEO_GEN` | `veo-3.1-generate-preview` | Video (local server only, long-poll) |
| `MODEL_TEXT_CHAT` / `MODEL_ANALYSIS` / `MODEL_TEMPLATE_GEN` | `gemini-3.1-pro-preview` | Default text/chat, analysis, template gen (quality) |
| `MODEL_FAST` / `MODEL_TEMPLATE_GEN_FAST` | `gemini-3-flash-preview` | Fast text, narrative, fast template gen |
| `MODEL_ANALYSIS_QUICK` / `MODEL_NARRATIVE` | `gemini-3-flash-preview` | Default of analysis requests (= `MODEL_FAST`) |
| `MODEL_DEMO` | `gemini-3.1-flash-lite-preview` | Cheapest; forced when `is_demo: true` |

Notes:
- `ImageRequest.model` defaults to `gemini-2.5-flash-image`. For best quality
  pass `gemini-3-pro-image-preview`; a good middle option is
  `gemini-3.1-flash-image-preview`.
- `TextRequest` / `BatchTextRequest` default to `gemini-3.1-pro-preview`. For
  cheap/fast bulk text (e.g. QC verdicts) pass `gemini-3-flash-preview`.
- `AnalyzeRequest` / `BatchAnalyzeRequest` default to `gemini-3-flash-preview`.
- The legacy id `gemini-2.0-flash-exp` is silently rewritten to
  `gemini-3-flash-preview` by `/api/generate/image`.

---

## 3. Endpoint reference

All bodies are JSON (`Content-Type: application/json`). All base64 image fields
are raw base64 (no `data:` URI prefix). Successful responses include
`"status": "success"` unless noted (`save-*` may return `"status": "exists"`).

### 3a. Generation — `backend/routers/generation.py`

#### `POST /api/generate/image`
Generate one (or, on Imagen, several) image(s).

Body (`ImageRequest`) — key fields:

| field | type | default | notes |
|---|---|---|---|
| `prompt` | str | — | required |
| `model` | str | `gemini-2.5-flash-image` | see model table |
| `aspect_ratio` | str | `"1:1"` | e.g. `"9:16"`, `"16:9"`, `"21:9"`, `"4:5"`, `"auto"` |
| `negative_prompt` | str? | null | |
| `input_images` | list[str]? | null | base64 reference images (image-to-image) |
| `response_modalities` | list[str]? | null | e.g. `["Image"]` or `["Text","Image"]` |
| `thinking_level` | str? | null | `"low"`/`"high"` (Gemini-3 flash image) |
| `media_resolution` | str? | null | `media_resolution_low/medium/high` (Gemini-3) |
| `image_count` | int? | 1 | multi-image is reliable on Imagen only; single image on the Interactions Gemini path |
| `safety_settings` | list[{category,threshold}]? | null | per-request override — enforced only in `legacy` API mode |
| `temperature`/`top_k`/`top_p` | num? | null | sampling controls (`top_k` has no Interactions equivalent — ignored there) |
| `is_demo` | bool? | false | forces `MODEL_DEMO` |

Response: `{"status":"success", "image": "<base64 PNG>"}` for a single image.
Multi-image (Imagen) returns `"images": ["<b64>", ...]`; a `Text,Image` request
may also include `"text"`. Always read whichever of `image` / `images` / `text`
is present.

```python
r = requests.post(f"{BASE}/api/generate/image", json={
    "prompt": "a red phone on a bone-cream desk, editorial product photo",
    "model": "gemini-3-pro-image-preview",
    "aspect_ratio": "9:16",
    "response_modalities": ["Image"],
}, timeout=180).json()
b64 = r.get("image") or r["images"][0]
import base64; open("out.png","wb").write(base64.b64decode(b64))
```

#### `POST /api/generate/text`
Body (`TextRequest`): `{"prompt": str, "model": "gemini-3.1-pro-preview"}`.
Response: `{"status":"success","text": "..."}`.

#### `POST /api/generate/text/stream`
Same body. Streams `text/plain` chunks (read the response body incrementally).

#### `POST /api/batch/text`
Sequential text over many prompts — ideal for QC verdicts.
Body (`BatchTextRequest`): `{"prompts": [str, ...], "model": "gemini-3.1-pro-preview"}`.
Response:

```json
{"status":"success","results":[
  {"prompt":"...","result":"pong","status":"success"},
  {"prompt":"...","error":"...","status":"error"}
]}
```

#### `POST /api/generate/narrative`
Enrich descriptions into prompts.
Body (`NarrativeRequest`): `{"descriptions": [str,...], "user_prompt": str, "mode": "story"|"artwork"}`.
Response: `{"status":"success","prompts":[...]}`.

#### `POST /api/generate/smart-transform`
Image-to-image edit by intent.
Body (`SmartTransformRequest`): `{"user_intent": str, "input_image": "<b64>", "reference_image": "<b64>?", "model": "gemini-3.1-flash-image-preview", "aspect_ratio": "1:1"}`.
Response: `{"status":"success","image":"<b64>","prompt": "..."}`.

#### `POST /api/generate/image-variation-prompts`
Body (`ImageVariationPromptsRequest`): `{"user_direction": str, "image_analysis": str}` → `{"status":"success","prompts":[...]}`.

#### `POST /api/generate/video`  *(local server only; long-poll)*
Body (`VideoRequest`): `{"prompt": str, "model": "veo-3.1-generate-preview", "duration": int?, "aspect_ratio": str?, "start_frame_image": "<b64>?", "end_frame_image": "<b64>?", "reference_images": ["<b64>",...]?, "resolution": "720p"|"1080p"|"4k"?}`.
Response: `{"status":"success","video":"<b64 MP4>","video_uri": "..."}`. Can block
up to `VIDEO_POLL_TIMEOUT_SECONDS` (300s). Not available on hosted instances.

### 3b. Analysis — `backend/routers/analysis.py`

#### `POST /api/analyze/image-to-prompt`
Describe an image (image → prompt-style description). The standard QC describe step.

Body (`AnalyzeRequest`):

| field | type | default |
|---|---|---|
| `image` | str (base64) | — |
| `auto_generate` | bool? | false |
| `model` | str? | `gemini-3-flash-preview` |

Response: `{"status":"success","analysis":"<description>"}`. If
`auto_generate: true`, also returns `generated_image` (b64),
`detected_aspect_ratio`, `original_dimensions`.

```python
desc = requests.post(f"{BASE}/api/analyze/image-to-prompt",
                     json={"image": b64}, timeout=120).json()["analysis"]
```

#### `POST /api/analyze/batch`  *(streaming NDJSON)*
Body (`BatchAnalyzeRequest`): `{"images": ["<b64>",...], "auto_generate": false, "model": "gemini-3-flash-preview"}`.
Streams one JSON object per line: `{"index": i, "status":"success", "analysis":"..."}`
(or `{"index": i, "status":"error", "error":"..."}`). Read line by line:

```python
with requests.post(f"{BASE}/api/analyze/batch", json={"images": imgs}, stream=True) as r:
    for line in r.iter_lines():
        if line:
            rec = json.loads(line)
            print(rec["index"], rec["status"])
```

### 3c. Templates — `backend/routers/templates.py`

#### `POST /api/generate/template`
LLM-authored Synthograsizer template. Default model is Pro (quality); pass
`use_flash: true` or an explicit `model` for speed. Timeout 180s (300s for
`mode: "p5"`); a timeout returns `504`.

Body (`TemplateRequest`) — `mode` selects the pipeline:

| mode | requires | returns |
|---|---|---|
| `text` (default) | `prompt` | `{status, template}` |
| `image` | `images[0]` | `{status, template}` |
| `hybrid` | `images[0]` + `prompt` | `{status, template}` |
| `multi-image` | `images` (≥2) | `{status, template}` |
| `remix` | `current_template` + `prompt` | `{status, template}` |
| `p5` | `prompt` | `{status, template}` (with `p5Code`) |
| `p5_edit` | `current_template.p5Code` + `prompt` | `{status, mode, p5_code, requires_full_remix}` |
| `story` | `prompt` | `{status, template}` |
| `story-beat` | `current_template` + `target_beat_id` | `{status, template}` |
| `workflow` | `workflow` + `images` | `{status, results:[...]}` |

```python
t = requests.post(f"{BASE}/api/generate/template", json={
    "prompt": "a moody synthwave cityscape with tunable neon + weather",
    "mode": "text"
}, timeout=200).json()["template"]
```

#### `POST /api/generate/template-from-analysis`
Body (`TemplateFromAnalysisRequest`): `{"analysis": "<description text>"}` →
`{"status":"success","template": {...}}`.

#### `POST /api/save-template`
Persist a template to `…/Synthograsizer_Output/JSON/Project Templates/`.

Body (`SaveTemplateRequest`): `{"template": {...}, "filename": "my-name"?}`.
- With `filename`: written as `<filename>.json` (sanitized).
- Without: a deterministic content-addressed name is derived and **deduplicated**
  — re-saving identical content returns `"status":"exists"` and the existing path.

Response: `{"status":"success"|"exists","message":...,"filepath":"<abs path>","filename":"<name>.json"}`.

### 3d. Outputs (generic JSON persistence) — `backend/routers/outputs.py`

Content-addressed disk store for browser-side data. **`kind` is restricted** to
the registry below — **images are NOT a supported kind** (write generated PNGs
to disk yourself). Files land under `…/Synthograsizer_Output/JSON/<dir>/`.

| `kind` | directory |
|---|---|
| `agent_profile` | Agent Profiles |
| `taste_profile` | Taste Profiles |
| `agent_log` | Agent Studio Logs |
| `story_output` | Stories |
| `workflow_output` | Workflow Outputs |

- `POST /api/save-output` — body (`SaveOutputRequest`): `{"kind": str, "content": {...}, "filename_hint": str?}`. Returns `{status, kind, filename, filepath, fingerprint}` (`status` is `"success"` or `"exists"`). Unknown kind → `400`.
- `GET /api/list-outputs/{kind}` — `{status, kind, count, items:[{filename, mtime, ...summary}]}`, newest first.
- `GET /api/get-output/{kind}/{filename}` — `{status, kind, filename, content}`. Missing → `404`.
- `DELETE /api/delete-output/{kind}/{filename}` — `{status, kind, filename}`.

### 3e. System — `backend/routers/system.py`
- `GET /api/health` — liveness + config snapshot (see §1).
- `POST /api/config` — operator config (see §1); `403` on hosted.
- `GET /api/backend/local/models` — proxy the local tier's `/models` (settings
  "test connection"); `403` on hosted.

---

## 4. Template / variable schema

Canonical shape (see `docs/SCHEMA.md`; enforced by `normalize_template`). A
template is `promptTemplate` prose with `{{placeholder}}` tokens, plus a
`variables` array. Each variable has a `name` (snake_case, matches the
placeholder), a human `feature_name` (Title Case), and a list of `values`, each
an object `{ "text": ..., "weight": ... }`.

Worked example:

```json
{
  "name": "Neon City",
  "promptTemplate": "A {{mood}} cyberpunk street at night, {{weather}}, neon signs, cinematic",
  "variables": [
    {
      "name": "mood",
      "feature_name": "Mood",
      "values": [
        { "text": "lonely", "weight": 3 },
        { "text": "frantic", "weight": 2 },
        { "text": "serene", "weight": 1 }
      ]
    },
    {
      "name": "weather",
      "feature_name": "Weather",
      "values": [
        { "text": "heavy rain", "weight": 2 },
        { "text": "thick fog", "weight": 1 }
      ]
    }
  ],
  "tags": [
    { "id": "tag_neon01", "type": "custom", "label": "Neon City", "description": "demo" }
  ]
}
```

To render a prompt headlessly, substitute each `{{name}}` with a chosen value's
`text` (string substitution — no model call needed). Optional fields: `p5Code`
(p5.js sketch string), `steps` (story templates), `tags`.

---

## 5. End-to-end recipes

All runnable as-is against a live local server.

### Recipe A — generate one image and save the PNG

```python
import base64, requests
BASE = "http://127.0.0.1:8000"

resp = requests.post(f"{BASE}/api/generate/image", json={
    "prompt": "a single ripe orange on a bone-cream studio backdrop, soft light",
    "model": "gemini-3-pro-image-preview",
    "aspect_ratio": "1:1",
    "response_modalities": ["Image"],
}, timeout=180)
resp.raise_for_status()
data = resp.json()
b64 = data.get("image") or data["images"][0]
with open("orange.png", "wb") as f:
    f.write(base64.b64decode(b64))
print("saved orange.png")
```

### Recipe B — author and save a template

```python
import requests
BASE = "http://127.0.0.1:8000"

template = {
    "name": "Twin Spheres Demo",
    "promptTemplate": "two {{color}} spheres on a {{background}} surface, studio render",
    "variables": [
        {"name": "color", "feature_name": "Color",
         "values": [{"text": "soft peach", "weight": 3}, {"text": "deep crimson", "weight": 1}]},
        {"name": "background", "feature_name": "Background",
         "values": [{"text": "matte black", "weight": 2}, {"text": "clinical white", "weight": 1}]},
    ],
}
r = requests.post(f"{BASE}/api/save-template",
                  json={"template": template, "filename": "twin-spheres-demo"}, timeout=60).json()
print(r["status"], r["filepath"])   # "success" (or "exists") + absolute path
```

### Recipe C — templated batch with an inline QC loop

Render prompts locally from a template, generate each image, describe it, and
ask a cheap text model for a pass/fail verdict; reroll on fail.

```python
import base64, json, re, requests
BASE = "http://127.0.0.1:8000"
IMG_MODEL  = "gemini-3-pro-image-preview"
TEXT_MODEL = "gemini-3-flash-preview"   # cheap, for QC verdicts

template = {
    "promptTemplate": "a {{subject}} in a {{setting}}, cinematic photo",
    "variables": [
        {"name": "subject", "values": [{"text": "red fox"}, {"text": "blue heron"}]},
        {"name": "setting", "values": [{"text": "snowy forest"}, {"text": "misty marsh"}]},
    ],
}

def render(template, choice):
    p = template["promptTemplate"]
    for name, val in choice.items():
        p = p.replace("{{" + name + "}}", val)
    return p

def gen_image(prompt):
    d = requests.post(f"{BASE}/api/generate/image",
                      json={"prompt": prompt, "model": IMG_MODEL,
                            "aspect_ratio": "1:1", "response_modalities": ["Image"]},
                      timeout=180).json()
    return d.get("image") or d["images"][0]

def describe(b64):
    return requests.post(f"{BASE}/api/analyze/image-to-prompt",
                         json={"image": b64, "model": TEXT_MODEL}, timeout=120).json()["analysis"]

def qc(intent, desc):
    q = (f'INTENT: "{intent}". DESCRIPTION: "{desc}". '
         'Does the description satisfy the intent and contain no readable text/logos? '
         'Reply raw JSON only: {"pass": true|false, "reasons": "..."}')
    out = requests.post(f"{BASE}/api/batch/text",
                        json={"prompts": [q], "model": TEXT_MODEL}, timeout=60
                        ).json()["results"][0]["result"]
    cleaned = re.sub(r"^```(json)?|```$", "", out.strip(), flags=re.MULTILINE).strip()
    try:
        v = json.loads(cleaned); return bool(v.get("pass")), v.get("reasons", "")
    except Exception:
        return True, "(unparseable verdict; default pass)"

# deterministic matrix: every subject x every setting
subjects = [v["text"] for v in template["variables"][0]["values"]]
settings = [v["text"] for v in template["variables"][1]["values"]]
for s in subjects:
    for env in settings:
        choice = {"subject": s, "setting": env}
        prompt = render(template, choice)
        for attempt in range(3):                      # 1 try + up to 2 rerolls
            b64 = gen_image(prompt if attempt == 0 else prompt + " (clean, no text)")
            ok, why = qc(prompt, describe(b64))
            if ok or attempt == 2:
                fn = f"{s}_{env}".replace(" ", "_") + ".png"
                open(fn, "wb").write(base64.b64decode(b64))
                print(fn, "PASS" if ok else "FLAGGED", "::", why[:80])
                break
```

---

## 6. Errors, retries & limits

### HTTP status codes the server uses

| code | when |
|---|---|
| `200` | success (body may still carry `"status":"error"` inside `batch/*` per-item results) |
| `400` | bad input — unknown template `mode`, unknown output `kind`, empty `/api/config` payload, invalid filename |
| `403` | mutation attempted on a **hosted** instance (`/api/config`, local-models proxy) |
| `404` | missing output file; also `GET /api/config` (it's POST-only) |
| `422` | **safety block** — content blocked by Google safety (narrative, text-ish, image-variation, smart-transform, video, template). Detail comes from `safety_block_detail`. |
| `429` | **hosted rate limit** (see below) — includes a `Retry-After` header |
| `500` | unhandled error (e.g. generation failed after retries); `detail` is the exception string |
| `504` | `/api/generate/template` exceeded its timeout (180s, or 300s for p5) |

### Transient-error retries (server-side, automatic)

Image generation and image analysis are wrapped with
`retry_on_transient(max_attempts=3, backoff_base=5.0)` (`backend/utils/retry.py`):

- Retries only when the error string contains a transient indicator:
  `500`, `503`, `INTERNAL`, `UNAVAILABLE`, `RESOURCE_EXHAUSTED`.
- **Linear backoff**: waits `5s`, then `10s`, then `15s` between attempts.
- Non-transient errors raise immediately (no retry).
- After 3 failed transient attempts the call surfaces as a `500` to your client.

Implication for clients: a single `/api/generate/image` call may already block
~30s while the server retries. Keep your client timeout generous (≥180s) and add
your own outer retry only for non-transient hiccups.

### Rate limiting (hosted only)

When `SYNTH_HOSTED=1` (or on Vercel), a per-IP sliding window applies to
`POST /api/generate/*`, `/api/chat`, `/api/analyze/*`, `/api/feedback`: default
**30 requests / 300s** (`RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS`).
Exceeding it returns `429` with a `Retry-After` header. A local install
(`hosted: false`) is unaffected — but still call image gen **sequentially** to
respect Google's upstream limits and let the retry decorator absorb transients.

### Other limits (`backend/config.py`)

- `MAX_BATCH_IMAGES = 200` — configured safety cap for batch image work.
- `VIDEO_POLL_TIMEOUT_SECONDS = 300` — max wait for a video render.
- `TEMPLATE_GEN_TIMEOUT_SECONDS = 180`, `TEMPLATE_GEN_P5_TIMEOUT_SECONDS = 300`.
- Output paths default under `~/Desktop/Synthograsizer_Output/`
  (`Images/`, `Videos/`, `JSON/`); override with `SYNTHOGRASIZER_OUTPUT_DIR`.

### Safety blocks (`422`)

A `422` means Google's safety filter blocked the request, not a bug. Adjust the
prompt, or pass a per-request `safety_settings` list of
`{"category": "...", "threshold": "..."}` on `ImageRequest` (categories like
`HARM_CATEGORY_DANGEROUS_CONTENT`; thresholds like `BLOCK_ONLY_HIGH`). On hosted
instances per-request safety overrides are ignored — the operator's defaults win.

Note: thresholds only reach Google in **`legacy` API mode** (generateContent).
On the default Interactions API, filtering is Google-managed and thresholds are
inert; if artistic work gets over-blocked, switch `google_api_mode` to `legacy`
via `POST /api/config` (or the settings panel) to re-arm them.
