# Deploying the Hosted Service — Cloud Run Runbook

Project **synthograsizer-app** (personal gmail) · region **northamerica-northeast1** (Montréal).
Already provisioned: Cloud SQL `synth-db` (Postgres 16), OAuth client (published), budget alert,
APIs (run / sqladmin / secretmanager / artifactregistry / cloudbuild). Run commands in
**Cloud Shell** (console → `>_` icon) from a fresh `git clone`, or locally with gcloud installed.

## 1 · One-time: secrets (operator-only — the two paste steps)
```bash
gcloud config set project synthograsizer-app

# Gemini API key (paste when prompted, then Ctrl-D — never lands in shell history)
gcloud secrets create synth-gemini-key --data-file=-

# Sanity-check EVERY new key version — the bare key only, 39 ASCII chars, no newline:
gcloud secrets versions access latest --secret synth-gemini-key | wc -c   # must print 39

# Cloud SQL password: reset it in console (SQL → synth-db → Users → postgres →
# Change password → let it generate), then:
gcloud secrets create synth-db-pass --data-file=-

# Create the app database (once):
gcloud sql databases create synth --instance=synth-db
```

## 2 · Deploy (repeat per release)
```bash
gcloud run deploy synthograsizer \
  --source . \
  --region northamerica-northeast1 \
  --allow-unauthenticated \
  --add-cloudsql-instances synthograsizer-app:northamerica-northeast1:synth-db \
  --set-secrets GOOGLE_API_KEY=synth-gemini-key:latest,DB_PASS=synth-db-pass:latest \
  --set-env-vars "SYNTH_HOSTED=1,SYNTH_AUTH=1,SYNTH_TERMS_VERSION=v0.2,\
INSTANCE_CONNECTION_NAME=synthograsizer-app:northamerica-northeast1:synth-db,\
DB_USER=postgres,DB_NAME=synth,\
GOOGLE_OAUTH_CLIENT_ID=679278101913-k4am2o8gu3dhah9n08i40lpslb7m0afs.apps.googleusercontent.com,\
ADMIN_EMAILS=quittersarts@gmail.com,SYNTH_MONTHLY_CREDITS=300,SYNTH_DAILY_BUDGET_USD=25" \
  --min-instances 1 --max-instances 1 --timeout 600 --memory 1Gi --cpu 1 \
  --session-affinity
```
First deploy prints the service URL (`https://synthograsizer-<hash>-<region>.a.run.app`).

### 2b · Public origins (only when a proxy/domain fronts the service)
**Run this AFTER §2, never instead of it — and never before it.** Two reasons: §2's
`--set-env-vars` *replaces* the whole env set, so running 2b first silently wipes it; and
`--update-env-vars` reuses the current image, so the variable does nothing until an image
containing the `SYNTH_PUBLIC_ORIGINS` code has been built by §2.
`synthograsizer.com` is proxied to Cloud Run by Vercel, so the browser sends
`Origin: https://synthograsizer.com` while the proxy dials with `Host: …run.app`. The CSRF
check needs that pair allowlisted or **every POST 403s `cross_origin_rejected`** (sign-in included):
```bash
# NOTE: the value contains a comma, which is --set-env-vars' own delimiter.
# The ^@^ prefix switches the delimiter for this flag — without it gcloud
# splits the value and writes a garbage second variable.
gcloud run services update synthograsizer --region northamerica-northeast1 \
  --update-env-vars "^@^SYNTH_PUBLIC_ORIGINS=https://synthograsizer.com,https://www.synthograsizer.com"
```
Unset = same-origin only (local installs and the bare run.app URL need nothing).

### 2c · Enable saved creations (the "My creations" gallery)
One-time GCS setup (bucket + IAM), if not already done — see
[HANDOFF_CLOUD_STORAGE.md](HANDOFF_CLOUD_STORAGE.md). Same ordering rule as 2b: run after a §2
deploy that contains the artifacts-router code, never before.

Bump `SYNTH_TERMS_VERSION` to `v0.3` in the **same call** that turns storage on — v0.3 is the
first terms revision that says generated media can be stored server-side (opt-in, saved
creations only), so consent has to track the feature going live, not lag behind it. This
re-prompts **every already-signed-in user** with the terms interstitial on their next request —
expected, not a bug: they're consenting to a real change in what the service now does.
```bash
gcloud run services update synthograsizer --region northamerica-northeast1 \
  --update-env-vars "SYNTH_GCS_BUCKET=synthograsizer-app-user-content,SYNTH_TERMS_VERSION=v0.3"
```
Optional tuning in the same call: `SYNTH_STORAGE_QUOTA_MB` (default 200), `SYNTH_SIGNED_URL_TTL_S`
(default 600, seconds a "View" link stays valid).

## 3 · One-time: OAuth origin
Console → Google Auth Platform → Clients → **Synthograsizer Web** → add the service URL to
**Authorized JavaScript origins**. (Takes 5 min–few hours to propagate. ✓ run.app origin added
2026-07-19.) Custom domain later: add it here too, but note **Cloud Run domain mappings are not
available in northamerica-northeast1** — route the domain via a Vercel proxy rewrite or a global
external ALB + serverless NEG instead (details in HANDOFF_SERVICE_LAUNCH.md step 5).

## 4 · Smoke checklist (each deploy)
1. `GET <url>/api/health` → `service.auth_required: true`, `api_key_configured: true`.
2. Anonymous `POST <url>/api/generate/text` → **401**.
3. Sign in with a NON-admin Google account → 300 credits, terms interstitial once, text gen
   decrements badge, Video/Music studios hidden, `/api/generate/video` → 403.
4. Sign in as quittersarts@gmail.com → ∞ badge, Veo works end-to-end (≤ 600s).
5. Account menu → Download my data (JSON) → Delete account → re-signup grants fresh 300.
6. Cloud Logging: no raw 5xx details (only `upstream_error` + id), no prompt text anywhere.
7. **(if 2c is enabled)** Generate an image → Save → My creations shows it with the right
   size/date → View opens a working signed link → Delete removes it and the quota meter drops →
   delete the (test) account → `gcloud storage ls gs://synthograsizer-app-user-content/users/<id>/`
   comes back empty.

## 5 · Costs & knobs
~$30/mo Cloud SQL + ~$15/mo min-instance Cloud Run (trial credits cover ~3 months). Saved
creations add ~$0.023/GB/mo storage + ~$0.12/GB egress on downloads — noise next to Cloud SQL
at any realistic per-user quota.
Tune without code: `SYNTH_MONTHLY_CREDITS`, `SYNTH_DAILY_BUDGET_USD`,
`RATE_LIMIT_USER_REQUESTS`, `RETENTION_DAYS`, `SYNTH_GCS_BUCKET`, `SYNTH_STORAGE_QUOTA_MB`,
`SYNTH_SIGNED_URL_TTL_S`. Scaling past max-instances=1 needs shared rate-limit/budget state
first (documented in the plan).

> **Field notes (2026-07-19 launch):** grant the runtime SA secret access once:`gcloud secrets add-iam-policy-binding <secret> --member=serviceAccount:679278101913-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor` for both secrets; deploy FROM `~/synthograsizer` (home-dir deploys use Buildpacks and fail); secrets must have no trailing newline; Cloud SQL enforces password complexity — use `P="$(openssl rand -base64 18)Aa1!"`. See HANDOFF_SERVICE_LAUNCH.md.
>
> **Field note (2026-07-19 smoke):** a `synth-gemini-key` version that isn't the bare key (extra
> pasted text with an em-dash/curly quote) makes **every** Gemini call 500 with
> `'ascii' codec can't encode characters in position N` from the SDK's `before_request` — the key
> rides in an HTTP header and header values must be ASCII. The `wc -c` check in §1 catches this.
> Also: the console's "Scaling: Min 0, Max 20" header is the service-level default display; the
> revision template from the §2 flags is really min=max=1 (check the YAML tab, not the header).
>
> **Field note (2026-07-20, saved creations):** `terms_version()`'s code-level fallback (used only
> if `SYNTH_TERMS_VERSION` is ever left unset) is now `v0.3`, matching the Terms page content —
> keep both in sync if you draft a v0.4. `/api/health`'s `terms_version` field has the same
> fallback in `routers/system.py`; the two had silently drifted apart before (harmless so far,
> since the deploy command has always set the env var explicitly either way).
