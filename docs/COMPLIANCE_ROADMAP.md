# Compliance & Ethics Roadmap — Synthograsizer Suite

> **Status:** working draft v0.1 · 2026-06-11 · R3 row updated 2026-07-24
> **What this is:** an honest self-assessment of where the Suite touches regulated or ethically sensitive territory, and a phased plan toward compliance in Canada, the EU (GDPR + AI Act), and good practice generally.
> **What this is not:** legal advice. This document was drafted with AI assistance and structured for review by a lawyer. Items marked **[counsel]** need professional confirmation.
>
> ⚠ **Currency warning — the body of this document still reads as though the Suite is
> local-only.** It was written 2026-06-11; `synthograsizer.com` launched 2026-07-19 with Google
> accounts, a credit ledger, and (since 07-20) user media stored server-side in GCS. **That is
> Mode C, not Mode A**, and phrases below like "today the Suite is local-first with no accounts
> and no analytics" (§1) and "Maintainer's Vercel deployment" (§2, Mode B) describe a world that
> no longer exists — it's Cloud Run in Montréal. What actually shipped for Mode C (DSAR
> export/delete, retention janitor, rate limits, breach playbook, Terms v0.3) is recorded in
> [HANDOFF_SERVICE_LAUNCH.md](HANDOFF_SERVICE_LAUNCH.md) and
> [INCIDENT_PLAYBOOK.md](INCIDENT_PLAYBOOK.md), not here. **A full reconciliation pass against
> the live service is owed, and should be bundled with the pending counsel review of Terms v0.3**
> — until then, treat §2–§6 as the original plan rather than a description of the running
> service. The R1–R6 risk rows are still the right frame; only R3 has been re-verified against
> what is actually deployed.

---

## 1 · Honest risk assessment

The Suite is a creative instrument — a structured front-end over Google's generative AI APIs. Nothing in it is *designed* to test safety boundaries: it does not train models, does not attempt to bypass or weaken provider safety filters (generation errors from Google's filters are surfaced to the user as failures, not retried around), does not scrape at scale, does not autonomously publish anything, and does not do surveillance, scoring, or decision-making about people.

That said, seven areas deserve eyes-open handling:

| # | Area | Why it's sensitive | Current state | Action |
|---|------|--------------------|---------------|--------|
| R1 | **Person-image transformation** (Smart Transform, template remix with reference images, multi-image extraction) | Any image-to-image tool is deepfake-*adjacent*: a user could feed in a real person's photo and transform them. | Google's API-side safety filters apply; no face-targeting features; no attempt to bypass filters. | AUP now prohibits non-consensual likeness use (Terms §6). For a hosted instance: add upload consent checkbox + abuse-report contact. Longer-term: visible "AI-generated" labeling option for display output. |
| R2 | **Taste profiling** | The taste-profile feature deliberately builds a psychological/aesthetic profile of a person from their work, quiz answers, and prompt corpus. Under GDPR this is *profiling* (Art. 4(4)); under PIPEDA it is personal information. Fine when you profile **yourself** on your own machine; a different thing entirely if hosted for others or pointed at someone else. | First-person by design; stored locally (localStorage + operator disk); never shared or used to score/rank. | Terms §7 now states first-person-only intent. Hosted mode: explicit consent screen before synthesis, retention limit, one-click delete (delete endpoints already exist). GDPR mode: DPIA before launch **[counsel]**. |
| R3 | **Autonomous agent web tools** (`[SEARCH]`, `[ANALYZE_URL]`, `[RESEARCH]`, workflow `synth_fetch`) | Server-side fetch of model-chosen or user-supplied URLs = SSRF risk on a hosted box (internal network probing), plus scraping/ToS concerns. Agents act in a loop without a human approving each fetch. | **Split as of 2026-07-24.** The ChatRoom agent tools (`[SEARCH]`, `[ANALYZE_URL]`, `[RESEARCH]`) are still local-only — ChatRoom's Node backend isn't deployed. Workflows now run on hosted, but **client-side in the user's browser** (`33fc6a5`), which removes rather than relocates the SSRF surface: the fetch is issued by the user's own browser with `credentials:'omit'`, reaches only what that user could reach by typing the URL, and carries no server credentials. Nothing is fetched by Cloud Run. Belt: none of the 16 hosted workflow templates uses a `synth_fetch` step, and the browser shim keeps the 10s timeout + 2MB cap. Tools remain read-only. | Unchanged for the ChatRoom tools: block private/link-local ranges + redirects, timeouts, size caps, robots.txt, per-session rate limits **before** that backend is ever hosted. For workflows, the live obligation is different — **keep `synth_fetch` out of shipped hosted templates**, and re-open this row if a hosted UI ever lets a user author an arbitrary `synth_fetch` URL, or if any workflow step is ever moved back server-side. ⚠ The vendored `workflowEngine.js`'s inline comment at the `synth_fetch` case still describes the **Node** guard (private-IP + per-redirect validation); the browser shim deliberately implements only scheme/timeout/size. The reasoning is in `static/synthograsizer/js/workflow-engine/urlGuard.js`'s header — the stale comment is left in place only to keep the vendored copy diffable against source. |
| R4 | **API key handling** | `/api/config` saves the Google key to plaintext `ai_studio_config.json`. Fine for a solo local install; on a shared host, one user's key would serve everyone, and a server compromise leaks it. | Gitignored; env-var (`GOOGLE_API_KEY`) already supported; Vercel uses env config. | Hosted mode: env-var only — disable the key-save endpoint (`VERCEL` guard already skips writes; make it explicit policy). Multi-user mode: per-user BYOK held in session only, never written to disk. |
| R5 | **Prompt metadata in shared images** | Generated PNGs embed the full generation prompt (provenance feature). Good for reproducibility and AI-content transparency — but users sharing a PNG also share their prompt, which can itself be personal. | Documented now (Terms §5). | Add a "strip metadata" export option next to download actions. Keep embedding ON by default — it's the right transparency default. |
| R6 | **Videorama — unattended batch video synthesis** (`backend/routers/videorama.py`, `scripts/film_factory/`) | Generates hundreds of AI video clips per run with **no human review per clip**, including formats designed to *look* authentic — news remotes, CCTV/dashcam, corporate training, documentary. This is exactly the synthetic/deepfake-adjacent territory the EU AI Act Art. 50 and Canada's Voluntary Code single out. | Three independent mitigations, not one: (1) the Brief Writer (`backend/services/videorama_brief.py`) hard-codes adults-only / no real people-names-brands / no readable text on every generated brief, plus an **unreality rail** for "realistic" registers that forces every clip to be obviously impossible and bans plausibly-real events, so output can never pass as real footage of a real occurrence; (2) a `likeness_check` endpoint screens generated character sheets against real public figures before mass rendering (built after an NB2 sheet drew a recognizable celebrity likeness); (3) the feature is **local-only by construction** — every mutating endpoint 403s when `is_hosted()` is true, so it cannot run on a hosted/Vercel instance at all today, full stop. | Keep the hosted-gate as a hard requirement (not just today's default) if Videorama is ever considered for a hosted surface — do not soften R6 to R3's "harden before hosting" pattern. Open question worth checking before wide distribution of exported reels: does Veo's SynthID watermark survive `tapeify.py`'s ffmpeg re-encoding (VHS/CCTV/etc. signal-path degradation)? If not, the visible "AI-generated" labeling option in R1's action item becomes load-bearing for Videorama exports specifically. Extend the living-artist-style-target audit (§7.2) to the Brief Writer's system prompts. |
| R7 | **Agent companies — teams of AI agents running unattended** (`chatroom/server/company/`, `/api/company`; design and evidence in [COMPANY_SAFETY_LAYER.md](COMPANY_SAFETY_LAYER.md)) | A set of agents talks in a loop with no one reading each turn. By design they may write dark or mature fiction while drafting; they can make pictures, search the web and offer work for publication. Their character sheets are free text that lands in the system prompt (a persona is an injection point), so the same tools could be aimed at a real person's likeness or private data, or at passing AI output off as human. A hosted instance would also let anonymous visitors spend the operator's key. | **Local-first; the chat server is not deployed (R3).** The foundation is built. *Prompt layer:* a fixed system layer (mission, six hard limits, two stages, honesty) the character sheet is told it cannot outrank, sheet and goal fenced, look-alike transcript lines rewritten. *Independent screen:* a reviewer that sees only the content judges every turn and every tool request that carries words **before** anything is shown, saved or acted on; if it cannot run, the turn is withheld. *Model service:* its refusals apply in both stages and are final for the turn (never retried, reworded or sent elsewhere; plain rooms treat a decline the same way). *People:* nothing leaves a room except through a queue — snapshot, publishing-stage screen, the owner's approval, a labelled export (the label is in a manifest, a note beside the work, and inside the file: a line in text and code, and XMP metadata with the IPTC `trainedAlgorithmicMedia` digital-source value in a PNG or JPEG, so it survives being copied out of its folder; WebP and GIF carry it in the manifest only); no tool can approve; a block is final. *Structure:* operator policy that a request can only tighten (hosted: environment only; it includes which models agents may run on, `COMPANY_MODELS`), caps on agents, turns, tokens, spend and strikes, every agent starts with no tools and a company with the research tools, companies and their memory isolated from each other, no secrets in prompts, an audit log of decisions without content, created paused. *Tests:* deterministic suite in CI (fails the build on a break) plus a live red team with harmless canary rules in the hard limits' slot (`npm run test:redteam`; first full run: the layer's rules were broken in 8 of 2,700 attack cases, 0.2% to 0.4% per model, all in the lowest-stakes canary, against 5.6% on the weakest model with no layer; the passphrase canary was never broken; the live run exits 1 on any break, so that run is a baseline and not a pass; details in the design doc). | Before any hosted use: R3 hardening for the chat server; credit metering through the ledger; the privacy review of saved sessions, company folders and the audit log (PIPEDA/Law 25, `HANDOFF_SERVICE_LAUNCH.md`). Build a person-facing approval screen. Decide whether drafted images are screened (today only the prompt is, and the picture at publishing). Put the AI-generated label inside image files (exports carry it in a manifest and a note beside the work). Re-run the red team on any change to the layer, the screen, the tool guard or the prompt builder and when a model is added; do not add an auto-approve setting. **[counsel]** EU AI Act Art. 50 labelling of published synthetic media; Canada's Voluntary Code. |
| R8 | **Agent companies: invented people, a roster, and a shared space where agents write to each other** (`chatroom/server/company/flow/`, `company/hall/`, the owner's console `server/public/company/`; [COMPANY_CREATION_FLOW.md](COMPANY_CREATION_FLOW.md), and "People, a shared space and a console" in [COMPANY_SAFETY_LAYER.md](COMPANY_SAFETY_LAYER.md)) | (1) A flow writes *invented people* with histories (a birthplace, a family, a culture) and keeps them: they can resemble a real person, or lean on a stereotype of an origin or a profession; a "personality type" on a simulated person can be mistaken for an assessment of a real one. (2) A roster and per-person memory are personal-data-shaped even when fictional: whoever builds a company can fill them with a real person's details, and they sit on disk. (3) Agents that write to each other are a new injection path: what one agent writes reaches another as input (the red team's Hall surface, mail only, held 270 of 270 on three models in one run each; forum, workspace and board entry points are untested). (4) A console that shows text models wrote is a cross-site-scripting surface; and the owner is a visitor cookie, so a lost cookie orphans companies and a shared machine gives them to whoever holds it (`COMPANY_OWNER_AUTH=key` makes the owner an account that signs in with a key, for a machine you work on; `=google` a Google account from an operator's list, for the website: `docs/OWNER_SIGN_IN.md`). (5) The flow spends the operator's key before there is a room to put a ceiling on. | *People:* facts are drawn from tables with a "do not default to" list, not invented by the model; a blind reviewer sends a sheet back if it names a real person or a famous name and otherwise gives the owner advice with the detail quoted; the company's own independent screen reads every sheet under that company's mandate before a seat is taken (in the flow and at hire); the quiz is original, about preferences, a drift detector for the simulation and never an assessment of anyone (the Myers-Briggs framework is named, with its link, as what the four pairs follow, and nothing is taken from it; the autism test the plan names is never given or used). *Roster and memory:* every statement filters by owner; no memory crosses a company; the owner can read, correct and delete every memory, and deleting a company deletes its people's memories of it; what a person writes about a session is checked against the record, and a claim it contradicts is kept, flagged and not handed back. *The Hall:* text is fenced with the reader's own nonce, labelled as information and read by the independent screen before it is written; the sender is stamped by the server; messages are typed and capped; the owner reads everything; a working agreement needs the owner. The red team has a Hall surface (the attack arrives as a colleague's mail, read with the real tool in a real turn). *Console:* a policy that lets no other script run, a builder that cannot set markup, and tests that fail if either changes. *Spend:* the flow has its own allowance (the operator's cap, which an owner can only lower). | Before any hosted use: the privacy review (PIPEDA / Law 25) of the roster, memory and Hall mail as personal-data-shaped stores; a sign-in for the owner (the cookie is the owner, and the console makes acting as the owner easy); decide whether importing a profile is allowed at all when hosted (the screen reads it, but an owner could still build a company out of real people's details); run the Hall red team on every model and on repeat; **[counsel]** whether a simulated personality label needs a disclaimer in a hosted product, and whether invented people with histories fall under any rule about synthetic personas. |

**Boundary verdict:** nothing here falls into the bad-actor category the Anthropic/Wired story is about, and nothing requires a feature to be removed. R1–R6 are the standard obligations of *any* generative-AI tool the moment it serves people other than its author. The single highest-leverage fact: **today the Suite is local-first with no accounts and no analytics** — the heavy obligations switch on only when a hosted instance serves other people. Videorama (R6) is the sharpest illustration of that line: it's the feature that would look worst hosted, and it's the one hard-blocked from hosting entirely.

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
- **Deepfake disclosure:** deployers generating/manipulating likeness of real people/places/events must disclose the artificial origin. Combined with R1: the AUP prohibition + a visible "AI-generated" label option on display output covers the realistic uses of this tool. R6 (Videorama) is the concrete case this bullet was written for — its own unreality rail already keeps output from being mistaken for real footage of a real event, which is the harm this article targets; the watermark-survival question in R6's Action column is the remaining gap.

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
- [ ] Verify Veo's SynthID watermark survives `scripts/film_factory/tapeify.py`'s ffmpeg re-encoding on at least one exported reel per signal preset (R6) **(S)**

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
- [ ] EU AI Act Art. 50: C2PA manifests on generated media; visible AI-label option on display/output surfaces **(M)** *(partly: an agent company's exported PNG and JPEG files carry an XMP packet with the IPTC `trainedAlgorithmicMedia` digital-source value, see R7; the generation endpoints' images do not, and nothing is signed, so C2PA is still open)*
- [ ] Per-user BYOK held in session only **(M)**
- [ ] Accessibility audit to WCAG 2.1 AA **(M)**
- [ ] Treaty layer (§8b): counsel confirms mapping; resolve the six Commons archive licence decisions before `SYNTH_COMMONS_ARCHIVE_ORIGIN` is set in production **[counsel]** **(M)**
- [ ] Illegal-content floor stated for the `local` tier; DMCA agent + takedown procedure; hosted reporting path **(S)**

---

## 8b · Treaty layer (added 2026-10-03)

**Goal (the maintainer's):** be internationally compliant with the rigorous standards set out by legal treaties.

Treaties bind states, not operators. The working method is: for each treaty, name the national laws that implement it in the places the service reaches, then map those laws to a Suite feature and a checklist item. Treaty status and article numbers below are from memory of the instruments, **not verified against the treaty texts or current ratification lists — [counsel] to confirm before anything here is relied on.**

| Treaty | What it asks of an operator, in practice | Implementing law (examples) | Suite feature | Status |
|---|---|---|---|---|
| Berne Convention; WIPO Copyright Treaty; TRIPS | Respect authors' economic and moral rights (attribution, integrity); no formalities needed for protection | Canada Copyright Act (moral rights s.14.1, 28.2); EU InfoSoc; US Title 17 (moral rights narrow); CC licence terms as the contractual layer | Commons archive pieces (164 works by other artists) | Credit, licence link, change notice and non-commercial rule enforced in `thecommons_archive.py`. **Gaps: see audit below.** |
| CoE Convention 108+ (data protection); ICCPR Art. 17; UDHR Art. 12 | Lawful basis, purpose limitation, data-subject rights, safeguards on transfers | PIPEDA, Quebec Law 25, GDPR, UK GDPR | Accounts, credit ledger, GCS media, taste profile | DSAR export/delete, retention janitor, breach playbook shipped (see HANDOFF_SERVICE_LAUNCH.md). Counsel review of Terms v0.3 pending. |
| CoE Framework Convention on AI (opened 2024) | Transparency, accountability, non-discrimination, remedies for AI-system harms | Not yet domestic law in most signatories; EU AI Act Art. 50 is the nearest concrete obligation | Generated media marking; R1, R2, R6 | C2PA and visible AI-label still open (Phase 2). **Check which jurisdictions have ratified.** |
| Budapest Convention; Optional Protocol to the CRC on sale of children / child sexual exploitation | Illegal-content floor, preservation and reporting channels, no CSAM | Criminal Code (Canada) s.163.1 and the federal mandatory-reporting Act for internet service providers; EU CSA rules; 18 USC 2258A (US) | Terms §6 floor; `local` tier applies no app filters | **Open:** state the floor explicitly for the local tier; document a reporting path for hosted. |
| CRPD Art. 9 (accessibility) | Accessible information and ICT | AODA, EN 301 549 / European Accessibility Act, Section 508 | All surfaces | WCAG 2.1 AA audit still open (Phase 2). |
| (Jurisdiction-specific, not treaty) US DMCA 512, COPPA; UK Online Safety Act | Notice-and-takedown agent; under-13 data; illegal-content duties for user-to-user services | | Commons desk uploads, 18+ gate | Designated-agent registration and a takedown procedure not yet written. |

### Commons archive licence audit

`python scripts/commons_license_audit.py` (read-only; `--markdown` for a table). As of 2026-10-03, 164 pieces:

| Licence | Pieces | Flag |
|---|---|---|
| CC BY-NC 4.0 | 133 | none |
| CC BY-NC-SA 4.0 | 21 | share-alike; 1 (`artblocks-thread`) has its version assumed |
| CC BY 4.0 | 7 | 2 have no version in the artist's recorded text (the loader normalised to 4.0); 1 recorded text is a long sentence |
| CC BY-SA 4.0 | 1 | share-alike; version assumed |
| CC BY-NC 2.0 | 1 | pre-4.0 (`artblocks-sunset-from-the-bluffs`) |
| CC0 1.0 | 1 | public domain; credit still shown |

Decisions this raises (all **[counsel]**):
1. **Share-alike (22 pieces).** The wall adds controls to the artist's code, an adaptation. Does the adapted layer have to be offered under the same licence, and does the wall say so? Cheapest safe option: hold these 22 back from any public venue until decided.
2. **Assumed versions (4 pieces).** "CC BY" with no version was read as 4.0. Confirm each with the artist or the platform record, or drop to the unlisted set.
3. **Pre-4.0 and moral rights.** CC 2.0 predates the licence wording about moral rights. Where integrity rights are inalienable (Canada, France, Germany), a controls-added adaptation that leaves the code otherwise unchanged is probably low risk, but this is the case Berne Art. 6bis exists for.
4. **Free-text licence (1 piece, `artblocks-stations`).** Read the artist's sentence and decide whether it is a CC licence or a bespoke grant.
5. **Non-commercial rule vs the hosted service.** The code already refuses these pieces in anything paid; check the credit ledger and Terms still describe that accurately now that the service charges credits.
6. **Takedown path.** Any artist can ask for removal; there is no documented process. Add one before the archive is turned on in production.

## 9 · Open questions for counsel

1. Governing-law province for Terms §14 (Ontario assumed).
2. Whether the liability cap and AUP enforcement language hold up for a free service in Canadian consumer-law context.
3. Quebec exposure threshold: at what point does a free hosted demo "carry on an enterprise" in Quebec for Law 25/Bill 96 purposes?
4. GDPR Art. 3(2) exposure of a globally reachable free demo with no EU targeting.
5. License split (MIT code / CC BY-NC content) — cleanest implementation.
6. Treaty layer (§8b): confirm the treaty-to-statute mapping and ratification status for each jurisdiction the service reaches.
7. Commons archive: the six decisions listed under §8b's licence audit.

## 10 · Watchlist

- Canadian federal AI bill (AIDA successor) — none enacted as of 2026-06.
- EU AI Act guidance + harmonized standards for Art. 50 marking (C2PA adoption curve).
- Google Gemini API terms changes (data-use tiers, age, prohibited uses).
- Ontario / federal privacy reform (Bill C-27's PIPEDA replacement also died; a successor would supersede §3.1).
