# Compliance & Ethics Roadmap — Synthograsizer Suite

> **Status:** working draft v0.1 · 2026-06-11
> **What this is:** an honest self-assessment of where the Suite touches regulated or ethically sensitive territory, and a phased plan toward compliance in Canada, the EU (GDPR + AI Act), and good practice generally.
> **What this is not:** legal advice. This document was drafted with AI assistance and structured for review by a lawyer. Items marked **[counsel]** need professional confirmation.

---

## 1 · Honest risk assessment

The Suite is a creative instrument — a structured front-end over Google's generative AI APIs. Nothing in it is *designed* to test safety boundaries: it does not train models, does not attempt to bypass or weaken provider safety filters (generation errors from Google's filters are surfaced to the user as failures, not retried around), does not scrape at scale, does not autonomously publish anything, and does not do surveillance, scoring, or decision-making about people.

That said, five areas deserve eyes-open handling:

| # | Area | Why it's sensitive | Current state | Action |
|---|------|--------------------|---------------|--------|
| R1 | **Person-image transformation** (Smart Transform, template remix with reference images, multi-image extraction) | Any image-to-image tool is deepfake-*adjacent*: a user could feed in a real person's photo and transform them. | Google's API-side safety filters apply; no face-targeting features; no attempt to bypass filters. | AUP now prohibits non-consensual likeness use (Terms §6). For a hosted instance: add upload consent checkbox + abuse-report contact. Longer-term: visible "AI-generated" labeling option for display output. |
| R2 | **Taste profiling** | The taste-profile feature deliberately builds a psychological/aesthetic profile of a person from their work, quiz answers, and prompt corpus. Under GDPR this is *profiling* (Art. 4(4)); under PIPEDA it is personal information. Fine when you profile **yourself** on your own machine; a different thing entirely if hosted for others or pointed at someone else. | First-person by design; stored locally (localStorage + operator disk); never shared or used to score/rank. | Terms §7 now states first-person-only intent. Hosted mode: explicit consent screen before synthesis, retention limit, one-click delete (delete endpoints already exist). GDPR mode: DPIA before launch **[counsel]**. |
| R3 | **Autonomous agent web tools** (`[SEARCH]`, `[ANALYZE_URL]`, `[RESEARCH]`, workflow `synth_fetch`) | Server-side fetch of model-chosen or user-supplied URLs = SSRF risk on a hosted box (internal network probing), plus scraping/ToS concerns. Agents act in a loop without a human approving each fetch. | Local-only today (ChatRoom doesn't deploy to Vercel). Tools are read-only — agents cannot post outward. | Before any hosted deployment: block private/link-local IP ranges + redirects to them, enforce timeouts and response-size caps, respect robots.txt, per-session rate limits. Keep agents read-only. |
| R4 | **API key handling** | `/api/config` saves the Google key to plaintext `ai_studio_config.json`. Fine for a solo local install; on a shared host, one user's key would serve everyone, and a server compromise leaks it. | Gitignored; env-var (`GOOGLE_API_KEY`) already supported; Vercel uses env config. | Hosted mode: env-var only — disable the key-save endpoint (`VERCEL` guard already skips writes; make it explicit policy). Multi-user mode: per-user BYOK held in session only, never written to disk. |
| R5 | **Prompt metadata in shared images** | Generated PNGs embed the full generation prompt (provenance feature). Good for reproducibility and AI-content transparency — but users sharing a PNG also share their prompt, which can itself be personal. | Documented now (Terms §5). | Add a "strip metadata" export option next to download actions. Keep embedding ON by default — it's the right transparency default. |

**Boundary verdict:** nothing here falls into the bad-actor category the Anthropic/Wired story is about, and nothing requires a feature to be removed. R1–R5 are the standard obligations of *any* generative-AI tool the moment it serves people other than its author. The single highest-leverage fact: **today the Suite is local-first with no accounts and no analytics** — the heavy obligations switch on only when a hosted instance serves other people.

One adjacent note: the prompt-engineering layer (this repo's system prompts) instructs models to honor "a specific aesthetic/artist/genre" named by the user. That's user freedom, not a violation — but shipped *templates* should avoid baking in living artists' names as style targets. See §7.2.

**Housekeeping flag:** the site footer says **CC BY-NC 4.0** while the repo `LICENSE` file is **MIT**. These conflict (MIT permits commercial use; BY-NC forbids it). Decide which governs what (common pattern: MIT for code, CC BY-NC for shipped template/art content) and make footer + LICENSE + README agree. **[counsel-lite — a deliberate decision more than a legal question]**

---

## 2 · Deployment modes — what obligations switch on when

| Mode | Description | Who is the "operator" | Obligation level |
|------|-------------|----------------------|------------------|
| **A — Local-first** (today) | User clones repo, runs `python -m backend.server`, uses own API key | The user themselves | Minimal: ship honest docs, safe defaults, and the Terms page as a template. Personal-use processing of one's own data is outside PIPEDA/GDPR scope. |
| **B — Hosted demo** | Maintainer's Vercel deployment, open to visitors, generation rate-limited or BYOK | Maintainer | Terms + privacy notice binding; AUP enforcement; R3/R4 hardening; basic retention + deletion; age statement. |
| **C — Multi-user service** | Accounts, stored user content server-side, possibly payment | Maintainer (as a business) | Full PIPEDA program; Quebec Law 25 if serving Quebec; GDPR if targeting EU; EU AI Act Art. 50 transparency; breach-response plan; DSAR workflows. |

Most items below are tagged with the mode at which they become necessary.

---

## 3 · Canada

### 3.1 PIPEDA (federal — applies to commercial activity) — Mode B/C

Mapping the ten fair-information principles to concrete tasks:

1. **Accountability** — name a privacy contact (solo project: the maintainer; publish the email — done in Terms §15).
2. **Identifying purposes** — Terms §7 data-flow table states why each datum is processed. Keep it current with features.
3. **Consent** — Mode B: uploading = implied consent for the stated processing, but add an explicit checkbox at the upload/taste-profile surfaces ("my images will be sent to Google's AI APIs for analysis"). Mode C: granular consent records.
4. **Limiting collection** — already strong: no accounts, no analytics, no cookies. Keep it that way as the default posture.
5. **Limiting use/disclosure/retention** — define a hosted-instance retention window (suggest: generated artifacts 30 days, then purge) **[decide]**; never repurpose uploads.
6. **Accuracy** — low exposure (no decisions made about people).
7. **Safeguards** — R3/R4 hardening; HTTPS only; dependency audit cadence.
8. **Openness** — Terms page is live; link it from every surface footer (hub + about done; add to ChatRoom UI when it ships publicly).
9. **Individual access** — reuse existing `/api/list-outputs`, `/api/get-output`, `/api/delete-output` endpoints as the DSAR mechanism; document the email path for everything else.
10. **Challenging compliance** — Terms §7 names the OPC as the complaint avenue.

**Breach reporting:** PIPEDA requires reporting breaches posing a "real risk of significant harm" to the OPC and affected individuals, and keeping breach records. Write a one-page incident playbook (Mode B).

### 3.2 Quebec — Law 25 — Mode C (or Mode B if meaningfully serving Quebec)

- Privacy officer designation (defaults to the person with highest authority — the maintainer; publish title + contact).
- **Privacy impact assessment required before communicating personal info outside Quebec** — uploads go to Google (US): a short written PIA covering that transfer.
- Transparency for automated processing: the taste profile is automated analysis of personal info — disclose it plainly (Terms §7 note exists; Quebec wants it explicit at collection time).
- **French language:** Quebec's Charter of the French Language (Bill 96) expects commercial publications serving Quebec in French. A French version of the Terms + key UI strings is the eventual cost of Mode C in Quebec. **[counsel]**

### 3.3 AIDA / federal AI law — monitor only

The Artificial Intelligence and Data Act died with Bill C-27 at prorogation (January 2025). As of mid-2026 Canada has **no enacted AI-specific statute**. Two actions:
- **Adopt Canada's Voluntary Code of Conduct on Advanced Generative AI** (ISED, 2023) as the project's public posture — its commitments (safety, fairness, transparency, human oversight, accountability) map almost one-to-one onto §1's actions and cost nothing. Add a line to the README when done.
- Watch for a successor bill; revisit this section if one is tabled.

### 3.4 Other Canadian items

- **AODA / accessibility (Ontario):** statutory duty likely doesn't attach to a solo non-commercial project, but treat WCAG 2.1 AA as the target anyway (§7.6) — this session's contrast fixes were a start.
- **CASL:** only relevant if the project ever sends marketing email. It doesn't. Leave a tripwire note: any future newsletter = CASL consent rules first.

---

## 4 · GDPR (EU/EEA/UK users) — Mode B/C only if targeting EU

- **Applicability:** GDPR bites via Art. 3(2) when you *offer services to* people in the EU. A global-reachable free demo is a gray zone; explicitly targeting (EU languages, EU marketing) is clear-cut. Mode A self-hosting by an EU user makes *them* the controller of their own data — not the maintainer.
- **Roles:** hosted mode → maintainer = controller; Google = processor **only on the paid Gemini API tier**. The free tier permits Google to use inputs for service improvement — **any hosted instance handling other people's content should run on the paid tier with the Google data-processing terms in place.** This is the single most consequential GDPR decision in the stack.
- **Lawful bases:** consent for uploads + taste-profile synthesis; legitimate interest for security logs and abuse prevention.
- **Profiling / DPIA:** taste profiles = profiling (Art. 4(4)) but not Art. 22 automated *decision-making* (no legal or similarly significant effect — it tunes art tools). Still: run a short DPIA before Mode C because profiling + AI + cross-border transfer is exactly the DPIA trigger profile. **[counsel]**
- **International transfers:** Google is certified under the EU-US Data Privacy Framework and offers SCCs; reference whichever applies in the privacy notice.
- **Data subject rights:** access/erasure via the existing output endpoints + email; portability is easy (everything is JSON; the taste profile even has an export button).
- **Children:** the 18+ gate (Terms §2) keeps the Art. 8 child-consent machinery out of scope.
- **Records of processing (Art. 30):** one-page table; the Terms §7 data-flow table is 80% of it already.

---

## 5 · EU AI Act — Mode B/C with EU exposure

The Suite is a **deployer/integrator** of general-purpose AI accessed via API — not a provider of a GPAI model, and nothing it does lands in Annex III high-risk categories or Art. 5 prohibited practices (no social scoring, no biometric categorization, no emotion recognition in work/education).

What does apply — **Art. 50 transparency** (obligations applying from August 2026):

- Users must know they're interacting with AI → inherent in the product; no action.
- **Synthetic-content marking:** AI-generated image/video/audio should be marked machine-readably. The Suite's PNG prompt-metadata embedding is a real head start; the proper standard is **C2PA Content Credentials** — roadmap item: emit C2PA manifests on generated media (Google's APIs increasingly attach SynthID; don't strip it).
- **Deepfake disclosure:** deployers generating/manipulating likeness of real people/places/events must disclose the artificial origin. Combined with R1: the AUP prohibition + a visible "AI-generated" label option on display output covers the realistic uses of this tool.

---

## 6 · Pass-through obligations (Google Generative AI)

The whole generation stack inherits Google's terms; the Terms page now incorporates the Prohibited Use Policy by reference. Operational consequences:

- 18+ age requirement (mirrored in Terms §2).
- No safety-filter circumvention (already project policy; keep it that way — including in system prompts).
- Free vs paid tier data-use difference (§4) — paid tier for any hosted instance.
- Watch Google's terms-change announcements; they cascade into the Terms page.

---

## 7 · Ethics beyond the law

1. **Likeness & consent.** Covered as R1/AUP. Add the consent checkbox at upload surfaces in Mode B.
2. **Living-artist style mimicry.** Policy decision to make explicitly: *shipped templates and presets avoid "in the style of [living artist]" targets; users remain free in their own prompts.* Audit the ~60 shipped templates for named-artist style targets once **[small task]**.
3. **Profiling sensitivity.** The taste profile's value is being "uncomfortably accurate" about *you*. Keep the three design guards: first-person only, local storage, no scoring/ranking of third parties. Never add "profile someone else's portfolio" as a feature without revisiting this whole section.
4. **Agent autonomy.** Agents converse and fetch read-only context; they cannot post, email, buy, or publish. Keep that boundary. Any future outbound tool (posting to social, sending email) needs a human-approval step per action — this is the voluntary-code "human oversight" commitment in practice.
5. **Provenance.** Keep metadata embedding on by default; add strip-on-export as user choice (R5); adopt C2PA when practical (§5).
6. **Accessibility.** Target WCAG 2.1 AA: contrast (partially done this session), full keyboard operability (D-pad already keyboard-first), screen-reader labels on icon buttons (several are emoji-only — audit), `prefers-reduced-motion` support in the glitcher/display surfaces.
7. **Security posture.** SSRF guards (R3), env-only keys in hosted mode (R4), HTTPS, rate limiting, `pip-audit`/`npm audit` in CI (a lint workflow already exists in `.github/workflows` — extend it).
8. **Compute footprint.** One honest line: batch generation defaults are conservative; don't add "generate 1000 variations" buttons without a confirm step. Mostly a cost guard; partly an environmental one.

---

## 8 · Phased checklist

### Phase 0 — now (Mode A, costs ~a day total)
- [x] Terms & Privacy draft published (`/terms/`), linked from hub + about footers
- [x] Risk self-assessment written down (this doc)
- [ ] Resolve MIT vs CC BY-NC license conflict (footer ↔ LICENSE ↔ README) **[decision]**
- [ ] Template audit: no living-artist style targets in shipped templates **(S)**
- [ ] "Strip metadata" option on image download/export **(S)**
- [ ] README: add Voluntary Code of Conduct adoption note + link to this roadmap **(S)**

### Phase 1 — before a public hosted demo (Mode B)
- [ ] Legal review of Terms (province placeholder in §14, liability cap, AUP) **[counsel]**
- [ ] Switch hosted generation to paid Gemini tier + Google data-processing terms **(S, recurring cost)**
- [x] SSRF hardening on `synth_fetch` (private-IP + redirect-hop validation, 10s timeout, 2 MB cap — `workflow-engine/urlGuard.js`); `ANALYZE_URL` gets a scheme/private-literal pre-check (Gemini's urlContext does the actual fetching from Google's egress, so it was never an SSRF vector against the operator's LAN). *Known limitation: classic DNS-rebinding isn't fully closed without a custom connection agent — documented in urlGuard.js.* ✅ 2026-06-12
- [x] Hosted mode: env-var-only API key — `POST /api/config` returns 403 for ALL mutations when `SYNTH_HOSTED=1`/Vercel; the settings panel hides the key input and renders read-only. ✅ 2026-06-12
- [x] Upload-consent notice (images → Google) — capture-phase interceptor covers every upload surface (`upload-consent.js`); once per browser locally, once per session when hosted. ✅ 2026-06-12
- [x] Retention purge — hourly task deletes artifacts older than `RETENTION_DAYS` (default 30) from outputs + feedback store; hosted-only (`backend/services/retention.py`). ✅ 2026-06-12
- [ ] Abuse-report path tested end-to-end (email in Terms §15) **(S)** — `/api/feedback` + GitHub issue form shipped; the email path still needs a live test.
- [x] Rate limiting on generation endpoints — per-IP sliding window (default 30 req/5 min, env-tunable), hosted-only, 429 + Retry-After. ✅ 2026-06-12
- [ ] Incident/breach playbook (1 page: detect → assess RROSH → notify OPC/individuals → record) **(S)**

### Phase 1 addendum — backend-aware guardrail tiers (shipped 2026-06-12)

Guardrail strictness now follows the backend, which mirrors how the law
actually allocates responsibility:

| Tier | What runs | Guardrails |
|------|-----------|------------|
| `google` (default) | Google GenAI APIs | Google's safety filters + Prohibited Use Policy (contractual). Operators adjust Google's `safety_settings` thresholds **within what the API permits** via the Backend & Safety panel — settings pass through verbatim; Google's rejections surface honestly. |
| `local` | OpenAI-compatible endpoint on the user's own hardware (Ollama, LM Studio) | **No app-imposed content filters** — personal use of one's own compute (GDPR household exemption; PIPEDA non-commercial). The Terms §6 illegal-content floor applies regardless. The provider client sends no safety parameters by construction (tested). |

Mixed-mode v1: the tier governs **text** generation only; image/video/music
and multimodal calls remain Google-only. Hosted instances are pinned to
`google`, ignore client-supplied safety settings (anonymous visitors can't
loosen thresholds on the operator's key — this also closed a pre-existing
hole where any client could send `BLOCK_NONE` per-request), and reject all
config mutations. Safety blocks now raise a typed error end-to-end
(`SafetyBlockedError` → structured 422 → "Report wrongly blocked" UI with a
prefilled GitHub issue and a local `/api/feedback` JSONL store — prompts are
never auto-included in reports).

### Phase 2 — before multi-user / commercial (Mode C)
- [ ] PIPEDA program formalized (consent records, DSAR workflow on existing endpoints) **(M)**
- [ ] Quebec: PIA for the Google transfer; French Terms + key UI **[counsel]** **(L)**
- [ ] GDPR (if EU targeting): records of processing, DPIA for taste profiling, DPF/SCC reference in notice **[counsel]** **(M)**
- [ ] EU AI Act Art. 50: C2PA manifests on generated media; visible AI-label option on display/output surfaces **(M)**
- [ ] Per-user BYOK held in session only **(M)**
- [ ] Accessibility audit to WCAG 2.1 AA **(M)**

---

## 9 · Open questions for counsel

1. Governing-law province for Terms §14 (Ontario assumed).
2. Whether the liability cap and AUP enforcement language hold up for a free service in Canadian consumer-law context.
3. Quebec exposure threshold: at what point does a free hosted demo "carry on an enterprise" in Quebec for Law 25/Bill 96 purposes?
4. GDPR Art. 3(2) exposure of a globally reachable free demo with no EU targeting.
5. License split (MIT code / CC BY-NC content) — cleanest implementation.

## 10 · Watchlist

- Canadian federal AI bill (AIDA successor) — none enacted as of 2026-06.
- EU AI Act guidance + harmonized standards for Art. 50 marking (C2PA adoption curve).
- Google Gemini API terms changes (data-use tiers, age, prohibited uses).
- Ontario / federal privacy reform (Bill C-27's PIPEDA replacement also died; a successor would supersede §3.1).
