# Handoff — Synthograsizer Hosted Service (launched 2026-07-19)

The service is **live on Cloud Run**. Companion docs: **[DEPLOY_CLOUDRUN.md](DEPLOY_CLOUDRUN.md)**
(redeploy runbook) · [INCIDENT_PLAYBOOK.md](INCIDENT_PLAYBOOK.md) (kill switches, breach steps)
· [COMPLIANCE_ROADMAP.md](COMPLIANCE_ROADMAP.md) (Mode C context) ·
[HANDOFF_CLOUD_STORAGE.md](HANDOFF_CLOUD_STORAGE.md) (Phase 5 per-user storage — deployed; next slice specced).

## What's running
- **Cloud Run** `synthograsizer`, project `synthograsizer-app` (quittersarts@gmail.com),
  northamerica-northeast1, min=max=1 instance, secrets `synth-gemini-key` / `synth-db-pass`.
  Service URL: **https://synthograsizer-679278101913.northamerica-northeast1.run.app**
  (console header says "Scaling: Min 0, Max 20" — that's the service-level default display;
  the active revision template pins minScale=maxScale=1. Cosmetic, no action.)
- **Cloud SQL** `synth-db` (Postgres 16, db-g1-small). Schema auto-migrates at boot.
- **Free tier**: Google sign-in → 300 credits/mo (text ⚡1–5, images ⚡4–15). **Veo/Lyria/Videorama
  locked to `ADMIN_EMAILS`** (four enforcement layers). $25/day breaker; per-user + per-IP limits;
  5xx scrubbing; DSAR export/delete self-serve; hourly retention incl. orphan-refund janitor.
- **Public domain**: `synthograsizer.com` → Vercel rewrite → Cloud Run. Apex 307s to `www.`, so
  **www is the effective origin**; both are on the OAuth client alongside the run.app URL.
- Local installs (`SYNTH_AUTH` unset) unchanged. Suite: 194 tests (`python -m pytest tests/`).

## Deploy lessons already learned (now folded into the runbook)
1. Run deploy **from inside `~/synthograsizer`** (a home-dir deploy builds via Buildpacks and fails).
2. Runtime SA needs `roles/secretmanager.secretAccessor` on both secrets (one-time, done).
3. Any locally pip-installed dep must be in `requirements.txt` (python-osc was the catch).
4. Secrets must have **no trailing newline**; Cloud SQL enforces password complexity — use:
   `P="$(openssl rand -base64 18)Aa1!"` pattern from the runbook.
5. **A secret must hold the bare value and nothing else.** A `synth-gemini-key` version that had
   ~330 characters of stray pasted text alongside the key made *every* Gemini call 500 with
   `'ascii' codec can't encode characters in position 100-101` — raised in the SDK's
   `before_request` while building the auth header, before any request left the container.
   `api_key_configured: true` in `/api/health` does **not** catch this: it only checks that a
   string is present. Always verify with `gcloud secrets versions access latest --secret <name>
   | wc -c` (39 for a Gemini key). Cost: ~18 hours of a launched-but-broken service.
6. Paste secrets via `read -rs KEY` → `printf '%s' "$KEY" | gcloud secrets versions add …`.
   `read -rs` is **silent by design** — no echo, no asterisks. That is not a hang; don't Ctrl-C it.
   Confirm capture with `echo ${#KEY}` before writing, which never puts the key on screen.

## Status 2026-07-20 — service fully operational ✅
The launch blocker is cleared and generation works end-to-end on the public domain.
- **Gemini key fixed**: `synth-gemini-key` version 2 holds the bare 39-byte key (same key — not
  rotated; Alexander judged it un-leaked beyond a local file and a chat transcript). Verified by
  readback. See deploy lesson 5 — this single malformed secret was the entire outage.
- **OAuth origins** (5): both localhosts, the run.app URL, `synthograsizer.com`, `www.…`.
- **Deployed**: `synthograsizer-00006-jcv` (image with the CTA + CSRF changes), then
  `synthograsizer-00007-4b7` (adds `SYNTH_PUBLIC_ORIGINS`). Both serving 100%.
- **Domain verified**: POST through `www.synthograsizer.com` returns `401 auth_required` — the
  auth wall, not the `403 cross_origin_rejected` CSRF wall it hit before. Zero ascii-codec errors
  in Cloud Logging since. Signed-in generation confirmed working by Alexander.
- **Smoke §4**: 1 ✓ 2 ✓ 3 ✓ 6 ✓. **Steps 4 (admin ∞/Veo end-to-end) and 5 (DSAR delete →
  re-signup grants fresh 300) still unrun.**

## Status 2026-07-20 (later) — "My creations" gallery built and DEPLOYED ✅
Per-user saved images/video/music, backed by Cloud Storage. Full design record:
[HANDOFF_CLOUD_STORAGE.md](HANDOFF_CLOUD_STORAGE.md). 162 tests green; frontend verified live
in-browser (including a fetch-mocked signed-in session, since no Postgres/GCS is reachable
outside Cloud Run). **Live on Cloud Run as of 2026-07-20** with `SYNTH_GCS_BUCKET` and
`SYNTH_TERMS_VERSION=v0.3` set. Smoke step 7 still unrun end-to-end.
- GCS bucket `synthograsizer-app-user-content` (Montréal, uniform access + public-access
  prevention) + IAM (runtime SA `objectAdmin` + `serviceAccountTokenCreator` on itself for
  keyless V4 signed-URL signing) — **already created**, live in GCP, nothing pending there.
- `artifacts` table (schema v2) — first real entry in the migration-stepping code, which
  surfaced and fixed a fresh-database replay bug in the same pass (see commit `4146f66`).
- `POST/GET/DELETE /api/artifacts`: every save requires an owned `generation_id` of a compatible
  action — not a bare upload endpoint. Quota-checked (`SYNTH_STORAGE_QUOTA_MB`, default 200MB).
- DSAR delete purges the GCS prefix before the row delete (tolerant of GCS failures — never
  blocks account deletion); the retention janitor sweeps any prefix left orphaned by that.
- Account menu → **My creations**: quota meter, paginated list, view (signed URL) and delete.
  Save buttons wired into the main Studio image/video generate flow.
- **Terms bumped to v0.3** (code default in `auth.py` + `routers/system.py`, and the page
  content) — this is the first version that says generated media can be stored server-side
  (opt-in only). Bumping it in production **re-prompts every signed-in user** — see runbook §2c,
  which pairs the terms bump with turning the bucket on so consent tracks the actual feature.
- **Deploy incident (same day):** the §2 redeploy that shipped this code **silently wiped
  `SYNTH_PUBLIC_ORIGINS`** — `--set-env-vars` replaces the entire environment, and §2's var list
  never included it. Every POST through the domain (sign-in, terms acceptance, generation, saves)
  403'd `cross_origin_rejected`; the only visible symptom was "Could not record acceptance" on
  the terms screen. Fixed by re-running §2b. **§2b/§2c are now mandatory after every §2** — see
  the warning at the top of runbook §2 and new smoke step 0.
- Known gap: Save button not yet wired into batch-grid or Smart Transform results (small
  follow-up, not a redesign — `generation_id` already flows from those endpoints too).

## Status 2026-07-24 — workflows on hosted, tier gate fixed, Studio menu bar ✅ DEPLOYED
Four commits (`2e07ad5` · `2407acf` · `33fc6a5` · `0bd196c`) are live as
**`synthograsizer-00031-ff8`**, 100% to latest, deployed 2026-07-24 01:32 EDT. All four are
front-end only — **zero changes under `backend/`**, no schema change (v3 was already applied).
194 tests green.

The revision list shows the runbook triple done correctly, and is the cheapest way to read a
deploy's history after the fact: `00029` (§2, 01:31:46) → `00030` (§2b, 01:32:07) → `00031`
(§2c, 01:32:21), ~15s apart. **Every deploy since 2026-07-22 is a clean triple** — 00011-13,
00014-16, 00017-19, 00020-22, 00023-25, 00026-28, 00029-31 — so the fingerprint is reliable:
**a lone revision with no siblings ~15s behind it means §2b/§2c were skipped, and the env needs
looking at immediately.** (00006/00007 on 07-20 is the pre-§2c pair; 00002–00005 are the 07-19
launch, before any of this applied.) Verified for this one: the live revision carries both
`SYNTH_PUBLIC_ORIGINS` and `SYNTH_GCS_BUCKET`, and smoke step 0 passes (domain POST with a good
Origin → `401 auth_required`; bogus Origin → `403 cross_origin_rejected`).

### Workflows now run on the hosted service, minus the Veo ones (`33fc6a5`)
Workflows had been local-only because the engine lived in the ChatRoom Node backend, which isn't
deployed on Cloud Run. It turned out not to need Node at all: `workflowEngine.js` /
`workflowTemplates.js` / `synthClient.js` / `stylePresets.js` are pure ESM that only orchestrate
HTTP calls. So the engine now runs **client-side** on hosted; local installs keep the ChatRoom
path unchanged (`workflow-runner.js` branches on `SynthAuth.active`, read as a live getter
because auth resolves asynchronously after the runner is constructed).

- **Vendored** at `static/synthograsizer/js/workflow-engine/`. `workflowTemplates.js` and
  `stylePresets.js` are byte-for-byte identical to source (verified with `cmp`); `workflowEngine.js`
  and `synthClient.js` carry one documented shim edit each (uuid import → local shim; same-origin
  base URL and no `process.env`). Vendoring rather than mounting the untracked source dir is
  *required*: **the Dockerfile only copies `backend/`, `static/`, `scripts/`** — anything the
  browser needs must live under `static/`.
  ⚠ The two copies must stay in sync — `diff` them before editing either.
- **Three browser shims** under the same module names, so the engine imports unmodified:
  `workflowLibrary` → localStorage checkpoints, `urlGuard` → fetch with timeout + byte cap,
  `uuid` → `crypto.randomUUID`. `urlGuard`'s DNS anti-SSRF pinning is deliberately dropped: a
  browser fetch reaches only what the user already can, carries no server credentials, and is
  CORS-bound — server-side SSRF defence there would be theatre.
- **Resume is half-built** (correction to `33fc6a5`'s commit message, which claims a run
  "survives a tab close and can resume"). Only the first half is true: the engine writes
  checkpoints to localStorage on every step and `workflowEngine.resume()` exists — but **nothing
  in `workflow-runner.js` calls it**, so there is no UI path back into an interrupted run. A
  closed tab leaves a resumable checkpoint that nothing resumes (they're under
  `synthWorkflowCheckpoint:*`, cleaned up on success, kept on failure). Wiring a "resume" entry
  into the workflow modal is a small, self-contained follow-up.
- **Metering is free**: each step is a normal authenticated same-origin `/api/*` call, so
  credits, per-user rate limits, and the daily budget breaker all apply per step through the
  existing middleware. The client engine needs no metering of its own.
- **Veo templates**: 3 of 17 (`img_to_video`, `cinematic_short`, `cinematic_animator`) are
  detected by building each definition and scanning for a `synth_video` step — not a hardcoded
  id list, so a future video template is caught automatically. Non-admins see them listed but
  inert (lock badge, reason, refusing click handler); `_runWorkflow` also refuses before
  `submit()` is ever called. Admins see all 16 unlocked.
- ⚠ **Never verified against real generation.** All four cohorts were checked in-browser against
  mocked `/api/*` (full event lifecycle, media store, one `/api/generate/image` call, zero
  `/chatroom` calls) — a real multi-step run on live Gemini is still unrun. See next steps.
- **Compliance:** this moved workflows out of the "local-only" mitigation that
  [COMPLIANCE_ROADMAP.md](COMPLIANCE_ROADMAP.md) R3 relied on. The row was re-assessed on
  2026-07-24 and the conclusion held — the `synth_fetch` step now runs in the *user's* browser,
  so there is no server-side SSRF surface to defend, and no shipped hosted template uses it. The
  live obligation is to **keep `synth_fetch` out of hosted templates** and re-open R3 if a hosted
  UI ever lets a user author an arbitrary fetch URL. The ChatRoom agent tools are unaffected —
  still local-only, still needing the full R3 hardening before that backend is ever hosted.

### Tier gate actually hides things now (`2407acf`)
Video Studio, Music Studio, and the whole Scope panel had been **visible to free-tier accounts on
the live service for over a month**. Three independent causes, all in `tier-gate.js`: it targeted
button ids that don't exist (the real ones are `studio-video-btn` / `studio-music-btn`); Scope had
no UI gating at all; and signed-out visitors were skipped entirely because the handler returned
early on a null `me`, which is exactly what `auth.js` announces for anonymous hosted visitors.
Hiding moved from imperative `style.display` to **CSS keyed off `<html>` classes** — the studio
grid is re-rendered by `studio-integration.js` at times the gate doesn't control, so anything
imperative was a race, and dead ids fail silently. Scope is hidden for *everyone* in service mode,
admins included: `/api/scope/` and `/api/osc/` are in `DISABLED_PREFIXES` and it bridges to a
renderer on the user's own machine, so an admin-visible button could only ever fail.

### Studio menu bar + template naming (`0bd196c`, `2e07ad5`)
The AI Studio Tools button grid became a desktop-style menu bar under the app-bar (Studio mode
only), with the 11 non-Template tools grouped into Generate / Transform / Automate / Inspect and
Template Gen pulled out as a featured accent button. **Every menu item keeps its `studio-*-btn`
id**, so the `bindSafe()` wiring and the tier-gate CSS rules above apply unchanged — it's a
relocation, not a rewrite. Separately: the header chip now follows the loaded template (the loader
pre-caches ~50 templates, and the cached branch had been skipping `updateHeaderButton()`, so
*nearly every* pick left the chip naming the previous template), and the loader stamps the
picker's display name onto each template as it loads — so saves land in My creations as
"Spring Physics v2" rather than the generic "Image", without editing 54 JSON files.

## Next steps, in order
1. **Finish smoke — everything left needs real credits and a signed-in browser.** Nothing here
   can be done from a dev machine; all of it is unrun:
   - **A real multi-step workflow on live Gemini** (highest value — newest code path, verified
     only against mocks, and it bills per step).
   - Runbook §4 **step 7** (gallery: generate → Save → thumbnail → View → Delete → account
     delete leaves the GCS prefix empty).
   - Runbook §4 **steps 4** (admin ∞ / Veo end-to-end) **and 5** (DSAR delete → re-signup grants
     fresh 300 — wants a throwaway Google account, since it deletes one).
2. **Next feature slice** — ~~Save buttons on batch-grid & Smart Transform results~~ **shipped
   2026-07-24, not yet deployed** (frontend-only, no backend change). Each batch tile captures
   its own `generation_id` rather than reusing `lastGenerationId`: the artifacts endpoint checks
   the id belongs to this account and produced media of this kind, so a shared id would silently
   attach every save to whichever generation finished last and still return 200. Next slice is
   the Stripe paid tier. (The 2026-07-20 slice — download, thumbnails, saved templates — shipped
   07-22 and is deployed; see [HANDOFF_CLOUD_STORAGE.md](HANDOFF_CLOUD_STORAGE.md#roadmap--next-slice-requested-2026-07-20).)
   **Standing note:** auto-saving templates conflicts with two claims in Terms v0.3 ("nothing is
   saved unless you click Save" and "prompt text is never stored server-side" — a template *is*
   prompt text). Explicit Save needs no terms change; auto-save needs v0.4 and sign-off.
3. **Does Veo survive the Vercel proxy?** Untested. Vercel's edge response timeout is well under
   Veo's 600s ceiling, so long renders may fail through `synthograsizer.com` while working fine
   on the run.app URL directly. Admin-only, so worst case is a personal annoyance — but if it
   matters, that's the trigger to move the domain to a global external ALB + serverless NEG
   (~$18/mo, no timeout limit). Test before relying on the domain for video work.
4. **Watch week one**: `/api/admin/stats` daily; budget emails (synthograsizer-monthly, $100/mo);
   trial credits ($425, expire 2026-10-16 — **upgrade to full account before then or everything
   stops**).
5. **Housekeeping**: counsel review of Terms v0.3 (`static/terms/index.html` — [counsel] items
   flagged, now including the saved-creations row); delete the stray empty "Synthograsizer"
   project under adaheemskerk@gmail.com; optionally reword the landing page's "No account" line,
   which is true for local installs but not for hosted generation.
6. **Phase 5 remainder (designed-for, unbuilt)**: Stripe paid tier (`tier` column + webhook +
   ledger `purchase` rows exist), hosted ChatRoom, multi-instance scaling (needs shared
   rate-limit/budget state first). Per-user storage is done — see above.
   **ChatRoom is not "the same trick as workflows".** The workflow engine could move into the
   browser because it is stateless HTTP orchestration whose every step hits a metered `/api/*`
   endpoint. ChatRoom is an Express + SSE server running autonomous multi-agent turn-taking
   against Gemini on its own — hosting it means hosting that spend, so its Gemini calls have to
   be routed through credit metering *first*, or it is an uncapped bill. It stays local-only,
   with an honest message on hosted.

## Tuning knobs (env only, no code)
`SYNTH_MONTHLY_CREDITS` · `SYNTH_DAILY_BUDGET_USD` · `RATE_LIMIT_USER_REQUESTS` ·
`RETENTION_DAYS` · `ADMIN_EMAILS` · `SYNTH_PUBLIC_ORIGINS` (proxy/domain allowlist — see
runbook §2b) · `SYNTH_GCS_BUCKET` / `SYNTH_STORAGE_QUOTA_MB` / `SYNTH_SIGNED_URL_TTL_S` (saved
creations — see runbook §2c) · prices in `backend/service/pricing.py`.
