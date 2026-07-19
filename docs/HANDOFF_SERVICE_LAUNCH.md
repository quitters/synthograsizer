# Handoff — Synthograsizer Hosted Service (launched 2026-07-19)

The service is **live on Cloud Run**. Companion docs: **[DEPLOY_CLOUDRUN.md](DEPLOY_CLOUDRUN.md)**
(redeploy runbook) · [INCIDENT_PLAYBOOK.md](INCIDENT_PLAYBOOK.md) (kill switches, breach steps)
· [COMPLIANCE_ROADMAP.md](COMPLIANCE_ROADMAP.md) (Mode C context).

## What's running
- **Cloud Run** `synthograsizer`, project `synthograsizer-app` (quittersarts@gmail.com),
  northamerica-northeast1, min=max=1 instance, secrets `synth-gemini-key` / `synth-db-pass`.
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

## Next steps, in order
1. **⚠ Rotate the Gemini API key** — it was pasted into a chat transcript. AI Studio → create new
   key (restrict to Generative Language API via "Secure keys") → `gcloud secrets versions add
   synth-gemini-key --data-file=-` → redeploy (or just restart revision). Delete the old key.
   Also purge it from local `ai_studio_config.json` / `backend/ai_studio_config.json` if rotating.
2. **OAuth origin**: console → Google Auth Platform → Clients → Synthograsizer Web → add the
   `https://…run.app` Service URL to Authorized JavaScript origins (sign-in fails until this
   propagates, 5 min–few hours).
3. **Smoke checklist** — runbook §4, all six steps (anonymous 401 → free-tier flow → admin ∞/Veo →
   DSAR export/delete → log audit).
4. **Watch week one**: `/api/admin/stats` daily; budget emails (synthograsizer-monthly, $100/mo);
   trial credits ($425, expire 2026-10-16 — **upgrade to full account before then or everything
   stops**).
5. **When ready**: custom domain (pick name → Cloud Run domain mapping → add origin to OAuth
   client); counsel review of Terms v0.2 (`static/terms/index.html` — [counsel] items flagged);
   delete the stray empty "Synthograsizer" project under adaheemskerk@gmail.com.
6. **Phase 5 (designed-for, unbuilt)**: Stripe paid tier (`tier` column + webhook + ledger
   `purchase` rows exist), per-user cloud storage, hosted ChatRoom, multi-instance scaling
   (needs shared rate-limit/budget state first).

## Tuning knobs (env only, no code)
`SYNTH_MONTHLY_CREDITS` · `SYNTH_DAILY_BUDGET_USD` · `RATE_LIMIT_USER_REQUESTS` ·
`RETENTION_DAYS` · `ADMIN_EMAILS` · prices in `backend/service/pricing.py`.
