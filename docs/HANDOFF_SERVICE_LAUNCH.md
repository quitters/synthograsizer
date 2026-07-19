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
- Local installs (`SYNTH_AUTH` unset) unchanged. Suite: 131 tests (`python -m pytest tests/`).

## Deploy lessons already learned (now folded into the runbook)
1. Run deploy **from inside `~/synthograsizer`** (a home-dir deploy builds via Buildpacks and fails).
2. Runtime SA needs `roles/secretmanager.secretAccessor` on both secrets (one-time, done).
3. Any locally pip-installed dep must be in `requirements.txt` (python-osc was the catch).
4. Secrets must have **no trailing newline**; Cloud SQL enforces password complexity — use:
   `P="$(openssl rand -base64 18)Aa1!"` pattern from the runbook.

## Status 2026-07-19 (post-launch ops pass)
- ~~OAuth origin~~ **DONE** — run.app URL added to Authorized JavaScript origins; sign-in
  verified working in production.
- Smoke §4: **1 ✓ 2 ✓ 6 ✓**; **3 partial ✓** (non-admin = 300cr, video 403 `tier_required`,
  DSAR export 200; text-gen decrement blocked by the secret issue below); **4, 5 pending**.
- Landing + about **launch CTAs now point at `/synthograsizer/`** (was the gated demo);
  the hosted-demo rewrite script is gone. Committed? — check git; needs push + redeploy to go live.

## Next steps, in order
1. **⚠ BLOCKER — re-add `synth-gemini-key` with a clean value.** Every Gemini call 500s with
   `'ascii' codec can't encode characters in position 100-101` raised in the SDK's
   `before_request` (header build, pre-network): the secret version created 2026-07-19 2:25 PM
   is >100 chars with non-ASCII (em-dash/curly quote) — extra text was pasted alongside the key,
   and HTTP header values must be ASCII. Fix (Cloud Shell):
   ```bash
   printf '%s' 'THE_BARE_KEY' | gcloud secrets versions add synth-gemini-key --data-file=-
   gcloud secrets versions access latest --secret synth-gemini-key | wc -c   # must print 39
   gcloud run services update synthograsizer --region northamerica-northeast1 \
     --update-env-vars DEPLOY_BUMP=keyfix   # new revision picks up :latest
   ```
   While in AI Studio: confirm the old leaked key is deleted and the new one is restricted to
   the Generative Language API ("Secure keys"); purge any copy from local
   `ai_studio_config.json` / `backend/ai_studio_config.json`.
2. **Finish smoke** — runbook §4: signed-in text gen decrements the badge (step 3), admin ∞/Veo
   end-to-end (step 4), DSAR delete → re-signup fresh 300 (step 5).
3. **Redeploy** to ship the launch-CTA change (runbook §2 — keep the full flag set).
4. **Watch week one**: `/api/admin/stats` daily; budget emails (synthograsizer-monthly, $100/mo);
   trial credits ($425, expire 2026-10-16 — **upgrade to full account before then or everything
   stops**).
5. **Custom domain — synthograsizer.com currently sits on Vercel.** Cloud Run domain mappings
   are region-limited and Montréal has not been on the list, so pick one of:
   (a) **Vercel as pure proxy** (fast, free): strip the Vercel project to a single `vercel.json`
   `{"rewrites":[{"source":"/(.*)","destination":"https://synthograsizer-679278101913.northamerica-northeast1.run.app/$1"}]}`
   — test Veo's long requests against Vercel's proxy timeout before trusting it;
   (b) **global external Application Load Balancer + serverless NEG** (~$18/mo, no timeout
   issues): apex A record → LB IP, managed cert. Either way add `https://synthograsizer.com`
   (+ `https://www.…`) to the OAuth client origins. Then: counsel review of Terms v0.2
   (`static/terms/index.html` — [counsel] items flagged); delete the stray empty
   "Synthograsizer" project under adaheemskerk@gmail.com.
6. **Phase 5 (designed-for, unbuilt)**: Stripe paid tier (`tier` column + webhook + ledger
   `purchase` rows exist), per-user cloud storage (**plan written:
   [HANDOFF_CLOUD_STORAGE.md](HANDOFF_CLOUD_STORAGE.md)**), hosted ChatRoom, multi-instance
   scaling (needs shared rate-limit/budget state first).

## Tuning knobs (env only, no code)
`SYNTH_MONTHLY_CREDITS` · `SYNTH_DAILY_BUDGET_USD` · `RATE_LIMIT_USER_REQUESTS` ·
`RETENTION_DAYS` · `ADMIN_EMAILS` · prices in `backend/service/pricing.py`.
