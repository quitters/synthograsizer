# Documentation

| File | Contents |
|------|----------|
| [SCHEMA.md](SCHEMA.md) | Full template JSON schema specification |
| [ENGINE_DESIGN.md](ENGINE_DESIGN.md) | How the image-prompt "engines" (Lost Cinema, Tape Shelf, Specimen Plates...) are designed: bundling dependent attributes, prompt hygiene found from real renders, judging on a contact sheet, and the style-reference recipe for decks. |
| [DEMO_TOUR.md](DEMO_TOUR.md) | Index of the demo tour: one captioned video per major section, each with its own page in the [wiki](https://github.com/quitters/synthograsizer/wiki/Demo-Tour). The caption files are in `demo-tour/captions/`. A dated snapshot, not a spec. |
| [HEADLESS_API.md](HEADLESS_API.md) | Driving the backend entirely over HTTP with no browser UI — endpoint reference, model IDs, recipes. Includes the Videorama batch-video API. |
| [videorama-guide/README.md](videorama-guide/README.md) | User guide for Videorama — prompt → finished video set, the Shot Inspector, Cast & Locations panel, and scripting unattended batches via the CLI. |
| [COMPLIANCE_ROADMAP.md](COMPLIANCE_ROADMAP.md) | Risk self-assessment + phased path to compliance (PIPEDA, Quebec Law 25, GDPR, EU AI Act) and ethics commitments. Pairs with the live [Terms & Privacy page](../static/terms/index.html) at `/terms/`. |
| [HANDOFF_SERVICE_LAUNCH.md](HANDOFF_SERVICE_LAUNCH.md) | Hosted-service launch handoff (2026-07-19) — what's running on Cloud Run, current status, next steps in order. **Start here for service ops.** |
| [DEPLOY_CLOUDRUN.md](DEPLOY_CLOUDRUN.md) | Cloud Run redeploy runbook — secrets, deploy command, OAuth origin, 6-step smoke checklist, field notes. |
| [DEPLOY_NOTES_2026-10-05.md](DEPLOY_NOTES_2026-10-05.md) | What the next release contains (live is `main` as of 2026-09-23), what to decide first, a measured cost check on the model change, a smoke list for the new features, and rollback. |
| [INCIDENT_PLAYBOOK.md](INCIDENT_PLAYBOOK.md) | Kill switches, abuse response, breach steps (PIPEDA/RROSH) for the hosted service. |
| [HANDOFF_CLOUD_STORAGE.md](HANDOFF_CLOUD_STORAGE.md) | Phase 5 "My creations" gallery — per-user GCS storage, signed URLs, DSAR/retention integration. Deployed 2026-07-20; also holds the specced next slice (download button, thumbnails, template library). |
