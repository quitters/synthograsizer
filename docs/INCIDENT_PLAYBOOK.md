# Incident Playbook — Synthograsizer Hosted Service

One page. If something is on fire, work top to bottom. (Compliance roadmap §3.1.)

## 0 · Contacts & consoles
- Operator / privacy contact: quittersarts@gmail.com
- Cloud Run + Cloud SQL + Secret Manager: GCP project **synthograsizer-app** (personal gmail)
- Gemini key + quota: AI Studio, project **emerge-ai** (`gen-lang-client-0174962160`, org account)
- Billing alerts: budget `synthograsizer-monthly` ($100/mo, 50/90/100% emails)

## 1 · Kill switches (fastest first)
| Threat | Action |
|---|---|
| Key abuse / runaway spend | AI Studio → API keys → **delete/regenerate the key** (service degrades to "key not configured", stays up) |
| Hostile traffic | `gcloud run services update synthograsizer --min-instances=0 --max-instances=0` (hard stop) |
| One bad account | `POST /api/admin/users/{id}/disable {"disabled":true}` (also kills their sessions) |
| Spend spike, service still wanted | lower `SYNTH_DAILY_BUDGET_USD` env and redeploy — breaker 503s free traffic |
| DB compromise suspected | Cloud SQL → Users → reset password; rotate `synth-db-pass` secret; redeploy |

## 2 · Assess
- `/api/admin/stats` — today's spend/action mix. Cloud Logging — filter `upstream_error` correlation ids.
- Billing → Reports for real cost curve. AI Studio → usage for key-level calls.
- What data could be affected? Server-side there are only: account records (email/name/avatar),
  session hashes, credit ledger, generation *metadata* (no prompt bodies, no media), feedback.

## 3 · Breach notification (PIPEDA)
If personal data was plausibly accessed: record what/when/who in an incident note (date-stamped file
in `docs/incidents/`), assess "real risk of significant harm" (RROSH). If RROSH: report to the
Office of the Privacy Commissioner of Canada and notify affected users at their account email
**as soon as feasible**. Keep the incident record ≥ 24 months. Quebec users: also CAI if applicable.
(Counsel review recommended before any notification goes out.)

## 4 · Recover
- Rotate every touched secret (Gemini key → Secret Manager new version; DB password; consider
  forcing re-login by truncating `sessions`).
- Redeploy a known-good revision (`gcloud run revisions list` → route traffic back).
- Post-incident: write what happened + one prevention item into this file's history.
