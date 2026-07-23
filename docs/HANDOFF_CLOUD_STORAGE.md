# Handoff — Per-User Cloud Storage (Phase 5 slice: "My creations")

**✅ BUILT 2026-07-20.** Everything below describes what shipped, not a forward plan — kept as
the design record. Decisions 1–3 were taken exactly as recommended (explicit Save button,
keep-until-deleted quota-bounded, image/video/music scope). Code: `backend/service/storage.py`,
`backend/routers/artifacts.py`, schema v2 (`artifacts` table), DSAR/retention wiring in
`routers/account.py` + `services/retention.py`, frontend in `auth.js` + `studio-integration.js`.
162 tests green. GCS bucket + IAM live (see §"GCP setup" below — already run).

**Deployed to Cloud Run 2026-07-20** (`SYNTH_GCS_BUCKET` + `SYNTH_TERMS_VERSION=v0.3`).
Runbook smoke step 7 still unrun end-to-end.

**Known gaps, not yet done:**
- Save button wired into the main Studio `runSingle()` flow (image + video) only. Batch-grid
  results and Smart Transform results don't have one yet — `generation_id` already flows from
  all three endpoints, so this is a small frontend-only follow-up, not a redesign.
- Terms v0.3 copy is written (`static/terms/index.html`) but — like v0.2 before it — is an
  unreviewed draft; counsel review is still on the launch handoff's open list.

**Next slice is specced below** — see [Roadmap](#roadmap--next-slice-requested-2026-07-20).

Original goal, unchanged: hosted users' generated content (images / video / music) saved to
Google Cloud Storage and browsable from their Synthograsizer account — list, re-download,
delete — with DSAR and retention fully wired in. Written 2026-07-19 against the launched service
(see [HANDOFF_SERVICE_LAUNCH.md](HANDOFF_SERVICE_LAUNCH.md)).

## Why nothing is saved today
- Hosted generation endpoints return base64 in the JSON response and persist **nothing**.
  The disk-save surfaces (`/api/sessions`, `/api/outputs`, save-template, scope frames) are
  403 `not_available_hosted` via `DISABLED_PREFIXES` (`backend/service/enforcement.py`) because
  Cloud Run's filesystem is per-instance tmpfs: cross-user leak risk + gone on restart.
- `AIManager.save_output()` / `save_json_output()` write to the local Desktop output dirs —
  local-mode behavior by design (`retention.purge_old_outputs` covers those dirs when hosted).
- `generations` is metadata-only (`prompt_chars`, never bodies or artifacts). DSAR export is
  metadata; DSAR delete removes the user row (sessions/ledger CASCADE, generations SET NULL).

GCS is the correct fix: durable, per-user-prefixed, deletable by prefix, stateless across
instances (does **not** add to the multi-instance scaling blockers).

## Decisions to make first (recommendations inline)
1. **Save semantics** — explicit "Save to account" button (recommended) vs auto-save every
   successful output. Explicit = smaller bill, clearer consent, no retention of throwaway
   variations; the browser already holds the base64, so saving costs one POST. Auto-save can
   be layered on later inside the endpoints (post-`ch.commit()`, failure must never fail the
   generation).
2. **Retention** — saved items kept until the user deletes them (recommended: it's their
   library; bound it with the quota, and a paid tier can raise it later) vs aging out with
   `RETENTION_DAYS` like everything else. If aging: extend `purge_service_db()` + add a bucket
   lifecycle rule as backstop.
3. **Scope v1** — image + video + music binaries only. Text/template JSON already has
   client-side export; skip it.

## GCP setup (one-time, Cloud Shell, ~10 min)
```bash
gcloud config set project synthograsizer-app

gcloud storage buckets create gs://synthograsizer-app-user-content \
  --location=northamerica-northeast1 \
  --uniform-bucket-level-access \
  --public-access-prevention

# Runtime SA: object CRUD on this bucket only
gcloud storage buckets add-iam-policy-binding gs://synthograsizer-app-user-content \
  --member=serviceAccount:679278101913-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectAdmin

# V4 signed URLs WITHOUT a key file: the SA must be allowed to sign as itself
# (signing goes through the IAM signBlob API — see the gotcha under storage.py below)
gcloud iam service-accounts add-iam-policy-binding \
  679278101913-compute@developer.gserviceaccount.com \
  --member=serviceAccount:679278101913-compute@developer.gserviceaccount.com \
  --role=roles/iam.serviceAccountTokenCreator
```
- Same Montréal region as Cloud SQL — keeps the Terms §7 data-residency story one sentence.
- Object layout: `users/{user_id}/{artifact_id}.{png|mp4|wav}` → account delete = one prefix
  delete. Never anything user-controlled in the object name.
- No bucket CORS needed for `<img>`/`<video>`/`<a download>` against signed URLs; add a CORS
  rule only if the front-end `fetch()`es the blobs.
- **No new secrets** — auth is ambient via the runtime SA. The only new env is the bucket name.

## Schema — v2 (first real `_MIGRATIONS` entry)
Add to `backend/service/schema.sql` (idempotent base) **and** `_MIGRATIONS[2]` in
`backend/service/db.py`, bump `SCHEMA_VERSION = 2`:
```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_id BIGINT,                        -- soft link, like credit_ledger
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind          TEXT NOT NULL,                 -- 'image'|'video'|'music'
  mime          TEXT NOT NULL,
  bytes         BIGINT NOT NULL,
  storage_path  TEXT NOT NULL UNIQUE,          -- users/{uid}/{id}.{ext}
  label         TEXT                           -- optional user-facing name
);
CREATE INDEX IF NOT EXISTS artifacts_user_created ON artifacts(user_id, created_at DESC);
```
Separate table (not columns on `generations`) because: generations rows are inserted at
reserve time before any output exists, age out with `RETENTION_DAYS`, and survive DSAR delete
anonymized — artifacts need the opposite lifecycle (hard CASCADE). Quota = `SUM(bytes)` per
user (the index covers it); cache into a `users.storage_bytes` column only if it gets hot.
Note: `ON DELETE CASCADE` removes **rows**, not objects — ordering in the DSAR section.

## Backend
**`backend/service/storage.py`** — mirror `db.py` conventions (lazy import, module-level
client, self-neutralizing when unconfigured):
- `enabled() -> bool` — `bool(os.environ.get("SYNTH_GCS_BUCKET"))`
- `put(user_id, artifact_id, data: bytes, mime) -> storage_path`
- `signed_url(storage_path, ttl=SYNTH_SIGNED_URL_TTL_S) -> str` — V4 GET. **Gotcha:** on
  Cloud Run there is no private key, and `generate_signed_url` does NOT fall back to IAM
  signing by itself — it raises unless you pass `service_account_email=` and `access_token=`
  (from `google.auth.default()` + `creds.refresh()`). That's what the `tokenCreator` grant
  above enables. Cache the refreshed token, not per-request.
- `delete(storage_path)` / `delete_prefix(f"users/{user_id}/")`

**`pip install google-cloud-storage` → add to `requirements.txt`** — deploy lesson #3
(python-osc) exists because this step got skipped once.

**`backend/routers/artifacts.py`** — mounted unconditionally, every endpoint 404s unless
`service_mode()` (copy the `account.py` `_require_service` pattern):
- `POST /api/artifacts` `{data_b64, kind, mime, generation_id?, label?}` — auth required;
  quota check first (413 `{"error":"storage_quota","used_mb":…,"limit_mb":…}`); insert row →
  upload → return row. Upload failure: delete the row, 503.
- `GET /api/me/artifacts?cursor=` — newest-first, page of 50.
- `GET /api/artifacts/{id}/url` — ownership check (404 on foreign id, same as absent) →
  `{"url": …, "expires_at": …}`.
- `DELETE /api/artifacts/{id}` — object first, then row.

**`backend/service/enforcement.py`**: add `/api/artifacts` to `AI_PREFIXES` (anonymous-401
wall + terms gate + per-user rate limiter ride along). It's not an AI spend, but the same
wall is exactly what these endpoints need; rename the constant if that bothers you.

## Front-end
- `static/shared/js/auth.js` account menu: "My creations" entry (next to Download my data).
- Gallery: simplest fit is a modal owned by auth.js (like the terms interstitial) — thumb grid
  from signed URLs, download + delete per item, quota meter. On an expired-URL 403, re-request
  the URL once.
- "Save to account" button beside image/video/music outputs in the studios — the base64 is
  already in hand; POST it. Show only when signed in and `enabled` (surface a
  `storage: true|false` flag in `/api/health`.service or `/api/me`.features; hide via the
  `tier-gate.js` technique).

## DSAR + retention (the compliance half — do not ship without this)
- `DELETE /api/me` (`backend/routers/account.py`): call
  `storage.delete_prefix(f"users/{id}/")` **before** the user-row delete. If GCS errors,
  still delete the row, log it, and let the janitor sweep — an account delete must never
  fail because GCS hiccuped.
- Janitor (`retention.purge_service_db()`): add an orphan sweep — bucket prefixes with no
  matching `users.id` get deleted (covers the partial-failure case above). If decision #2
  chose aging, also purge artifacts rows + objects past `RETENTION_DAYS` here.
- `GET /api/me/export`: include artifacts rows (metadata + `storage_path`); binaries are
  available through the gallery — no need to inline signed URLs into the export.
- Terms v0.2 §7 hosted-data table: new row — saved creations, GCS Montréal, kept until
  deleted (or N days), deleted immediately with the account. Flag **[counsel]**.
- [INCIDENT_PLAYBOOK.md](INCIDENT_PLAYBOOK.md): kill switch = unset `SYNTH_GCS_BUCKET`
  (uploads 503, gallery empties, nothing crashes — that's what `enabled()` guards buy);
  add the bucket to the breach-scope inventory.

## Env knobs
- `SYNTH_GCS_BUCKET` — unset = feature fully off; **local installs stay bit-for-bit unchanged**.
- `SYNTH_STORAGE_QUOTA_MB` — default 200 (free tier).
- `SYNTH_SIGNED_URL_TTL_S` — default 600.
Add them to the runbook §2 `--set-env-vars` when shipping.

## Tests (suite must stay green with SYNTH_AUTH unset)
`tests/test_service_storage.py` with a `FakeStorage` capturing `put`/`delete`/`signed_url`
calls at the `storage.py` boundary (same philosophy as `FakePool` in
`test_service_credits.py`): quota 413; foreign artifact id → 404; delete removes object then
row; account delete calls `delete_prefix` before the row delete; `SYNTH_GCS_BUCKET` unset →
503 upload / `storage:false` flag; local mode → 404s.

## Smoke additions (runbook §4 grows a step 7)
7. Signed in: generate image → Save to account → appears in My creations → signed URL renders →
   item delete removes it → account delete (test user) leaves
   `gcloud storage ls gs://synthograsizer-app-user-content/users/{id}/` empty.

## Costs
Storage ~$0.023/GB/mo (Montréal standard) + egress on downloads (~$0.12/GB). 100 users at the
full 200 MB quota = 20 GB ≈ **$0.50/mo** — noise next to Cloud SQL. Signing via IAM API is free.

## Order of work
1. Decisions 1–3 (10 min) → 2. GCP setup → 3. schema v2 + `storage.py` + tests →
4. artifacts router + enforcement + tests → 5. auth.js gallery + save buttons →
6. DSAR/retention/terms/playbook edits → 7. `requirements.txt` + deploy + smoke step 7.

**All seven done.** Everything past this point is the next slice.

---

## Roadmap — next slice (requested 2026-07-20)

> **✅ ALL THREE BUILT 2026-07-22.** #1 (download) is deployed and live (Cloud Run rev
> `synthograsizer-00013-qvk`). #2 (thumbnails) and #3 (templates, explicit save) are built +
> tested (187 tests green) but **await a deploy** — they need **schema v3** to reach the prod DB.
> What shipped vs. the plan below:
> - **Schema v3** (`artifacts.thumb_path`) — the first real `_MIGRATIONS` entry with SQL
>   (`ALTER TABLE ADD COLUMN IF NOT EXISTS`). `db.py` bumped to `SCHEMA_VERSION = 3`; it applies
>   automatically at boot on the next deploy.
> - **Thumbnails** are served by a new `GET /api/artifacts/{id}/thumb` **proxy**, not signed URLs —
>   keyless V4 signing is one IAM call per URL, too slow for a 50-row page. The client lazy-loads
>   via `IntersectionObserver`. Images only; video/music keep their icon.
> - **Templates**: `/api/generate/template` now returns `generation_id` (+ a Flash-generated
>   `template_name`, service-mode only so local installs pay no extra call). Load-template reads
>   JSON via a same-origin `GET /api/artifacts/{id}/content` proxy — chosen over a signed URL to
>   avoid a **bucket CORS rule** (a hidden deploy step). Shipped **explicit Save only** (option a);
>   auto-save (b/c) still deferred, still needs Terms v0.4.
> - **Terms §7** got a clarifying line: a saved template stores prompt text (the one exception to
>   "prompt text is never stored"). Kept at **v0.3, no re-prompt** — it clarifies the existing
>   "generated media you explicitly save" carve-out rather than expanding it. Flag for counsel.
> - **Bonus (unrelated ask):** the Agent Composer/Studio "Launch failed: chatroom_unavailable"
>   dead-end on hosted is now an honest local-only message (composer.jsx + .js + agent-studio.js).
>   ChatRoom itself is still local-only — see the launch handoff's Phase 5 remainder.
>
> **Deploy note:** this is a normal §2 → §2b → §2c. Schema v3 auto-migrates at boot; the prod DB
> is small, the ALTER is instant. Smoke step 7 (gallery) now also covers a thumbnail rendering and
> a template save→Load round-trip.

Three follow-ups, ordered smallest-effort first. **#1 and #2 need no terms change; #3 does —
read its consent note before building it.** *(Original plan preserved below for the design record.)*

### 1 · Download button beside Save (images) — do first
Pure frontend: no API, no storage, no cost. The base64 is already in hand where `runSingle()`
renders the result, so it's a `Blob` + `<a download>` next to the existing Save button.

Note it should **not** reuse Save's `canSave` gating — downloading works signed-out and on local
installs too, since nothing leaves the browser. Give it a real filename
(`synthograsizer-<yyyymmdd-hhmm>.png`, not `download.png`). Worth a line of UI copy that PNGs
embed the generation prompt in their metadata (already disclosed in Terms §7) — sharing the file
shares the prompt.

### 2 · Thumbnails in the My creations modal
The gallery deliberately shipped without them: one signed URL per item would mean N round-trips
just to open the list (see the comment above `loadGalleryPage` in `auth.js`). Two fixes, and
they compose:

- **Store a thumbnail at save time** (recommended): downscale client-side to ~256px on a canvas
  before POSTing, upload as a second small object (`users/{id}/{key}_thumb.jpg`, a few KB), and
  record it on the row. Listing stays one request and thumbs are cheap. Costs a schema column
  (`thumb_path TEXT NULL`) — which is exactly the `ALTER TABLE ADD COLUMN` case the migration
  machinery was fixed for on 2026-07-20, so `_MIGRATIONS[3]` finally earns its keep. Note the
  fresh-database rule: new installs get the column from `schema.sql`, so the migration entry is
  only for databases that already exist.
- **Lazy-load with `IntersectionObserver`** so only visible rows fetch anything either way.

Video can't be thumbnailed server-side without ffmpeg in the container — but the client can grab
a frame off the `<video>` element onto a canvas at save time for near-zero cost. Music should
keep the 🎵 icon.

### 3 · Templates in My creations, with a "Load template" button
The storage half is a small extension. The **"automatic"** half needs a decision first.

Mechanically:
- `routers/artifacts.py`: add `"template": ("template",)` to `_KIND_ACTIONS` and
  `"template": "application/json"` to `_KIND_MIME_PREFIX`; `storage.py` `_KIND_EXT` gets
  `"template": "json"`.
- **`POST /api/generate/template` must return `generation_id` — it doesn't yet.** Only image,
  video, and smart-transform were wired (`charged.gen_id`); this is a one-line change in
  `routers/templates.py`, but without it the save endpoint's ownership check rejects everything.
- Gallery: for `kind === 'template'`, swap View for **Load template** — fetch the signed URL,
  `JSON.parse`, hand it to the app's existing template loader.
- Quota: templates are KB not MB, so effectively free against the 200 MB budget — but auto-saving
  *every* generation accumulates. Add a per-kind cap (keep newest ~200) or dedupe by content
  hash, or regenerating a template ten times leaves ten near-identical rows.
- Auto-save must be fire-and-forget: a failed save must never fail or block the generation that
  produced it.

**⚠ Consent note — auto-save contradicts two live Terms claims.** Terms v0.3 (in force since
2026-07-20; every signed-in user was re-prompted to accept it) says both:

> "Saved creations *(opt-in — nothing is saved unless you click Save)*"

> "**Prompt text is never stored server-side**"

A template's whole point is its `promptTemplate` field — it **is** prompt text — and auto-saving
stores it without the user clicking anything. Building it exactly as requested breaks both
sentences at once, for users who accepted them today. Options:

- **(a) Explicit Save for templates too** — reuses the existing button and wording, needs **no
  terms change**, ships immediately. Only loses the never-think-about-it convenience.
- **(b) Auto-save, disclosed** — needs **Terms v0.4** rewriting both claims, plus a second
  re-prompt for every signed-in user within days of the first.
- **(c) Auto-save behind a toggle**, default off, disclosed at first use — still needs v0.4
  language, but a far easier one to write honestly.

**Recommendation: ship (a) now; treat (b)/(c) as a follow-up if users ask.** The Load-template
button — the part with real day-to-day value — is identical under all three, so nothing is lost
by starting explicit. If auto-save does happen later, bundle the terms rewrite with the pending
counsel review rather than spending a third re-prompt on it alone.
