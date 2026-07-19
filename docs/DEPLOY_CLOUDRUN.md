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

## 3 · One-time: OAuth origin
Console → Google Auth Platform → Clients → **Synthograsizer Web** → add the service URL to
**Authorized JavaScript origins**. (Takes 5 min–few hours to propagate. Custom domain later:
add it here too + Cloud Run domain mapping.)

## 4 · Smoke checklist (each deploy)
1. `GET <url>/api/health` → `service.auth_required: true`, `api_key_configured: true`.
2. Anonymous `POST <url>/api/generate/text` → **401**.
3. Sign in with a NON-admin Google account → 300 credits, terms interstitial once, text gen
   decrements badge, Video/Music studios hidden, `/api/generate/video` → 403.
4. Sign in as quittersarts@gmail.com → ∞ badge, Veo works end-to-end (≤ 600s).
5. Account menu → Download my data (JSON) → Delete account → re-signup grants fresh 300.
6. Cloud Logging: no raw 5xx details (only `upstream_error` + id), no prompt text anywhere.

## 5 · Costs & knobs
~$30/mo Cloud SQL + ~$15/mo min-instance Cloud Run (trial credits cover ~3 months).
Tune without code: `SYNTH_MONTHLY_CREDITS`, `SYNTH_DAILY_BUDGET_USD`,
`RATE_LIMIT_USER_REQUESTS`, `RETENTION_DAYS`. Scaling past max-instances=1 needs shared
rate-limit/budget state first (documented in the plan).
