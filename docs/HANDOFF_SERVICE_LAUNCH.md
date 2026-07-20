# Handoff — Synthograsizer Hosted Service (launched 2026-07-19)

The service is **live on Cloud Run**. Companion docs: **[DEPLOY_CLOUDRUN.md](DEPLOY_CLOUDRUN.md)**
(redeploy runbook) · [INCIDENT_PLAYBOOK.md](INCIDENT_PLAYBOOK.md) (kill switches, breach steps)
· [COMPLIANCE_ROADMAP.md](COMPLIANCE_ROADMAP.md) (Mode C context) ·
[HANDOFF_CLOUD_STORAGE.md](HANDOFF_CLOUD_STORAGE.md) (Phase 5 per-user storage plan).

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
- Local installs (`SYNTH_AUTH` unset) unchanged. Suite: 134 tests (`python -m pytest tests/`).

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

## Next steps, in order
1. **Finish smoke** — runbook §4 steps 4 and 5, the only two never exercised.
2. **Does Veo survive the Vercel proxy?** Untested. Vercel's edge response timeout is well under
   Veo's 600s ceiling, so long renders may fail through `synthograsizer.com` while working fine
   on the run.app URL directly. Admin-only, so worst case is a personal annoyance — but if it
   matters, that's the trigger to move the domain to a global external ALB + serverless NEG
   (~$18/mo, no timeout limit). Test before relying on the domain for video work.
3. **Watch week one**: `/api/admin/stats` daily; budget emails (synthograsizer-monthly, $100/mo);
   trial credits ($425, expire 2026-10-16 — **upgrade to full account before then or everything
   stops**).
4. **Housekeeping**: counsel review of Terms v0.2 (`static/terms/index.html` — [counsel] items
   flagged); delete the stray empty "Synthograsizer" project under adaheemskerk@gmail.com;
   optionally reword the landing page's "No account" line, which is true for local installs but
   not for hosted generation.
5. **Phase 5 (designed-for, unbuilt)**: Stripe paid tier (`tier` column + webhook + ledger
   `purchase` rows exist), per-user cloud storage (**plan written:
   [HANDOFF_CLOUD_STORAGE.md](HANDOFF_CLOUD_STORAGE.md)**), hosted ChatRoom, multi-instance
   scaling (needs shared rate-limit/budget state first).

## Tuning knobs (env only, no code)
`SYNTH_MONTHLY_CREDITS` · `SYNTH_DAILY_BUDGET_USD` · `RATE_LIMIT_USER_REQUESTS` ·
`RETENTION_DAYS` · `ADMIN_EMAILS` · `SYNTH_PUBLIC_ORIGINS` (proxy/domain allowlist — see
runbook §2b) · prices in `backend/service/pricing.py`.
