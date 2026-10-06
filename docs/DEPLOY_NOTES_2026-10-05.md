# Deploy notes — `main` @ `3bb2e34` (2026-10-05)

Prepared for the next Cloud Run release. The commands are in [DEPLOY_CLOUDRUN.md](DEPLOY_CLOUDRUN.md); this page says **what is in the release, what to decide first, and what to check afterwards**.

**In one paragraph.** What is live is `main` as it stood on 2026-09-23. `main` is now 62 commits ahead (576 files, about two thirds of them gallery and archive data). The release is mostly additive: the Commons gets room images, 100 more pieces, six remastered pieces and pictures on its library cards; Glitcher gets its selection fix and a focus mode; image generation accepts typed references. There is **one schema migration** (v5, one new table), **no new required environment variable** and **no dependency change**. The chat room and the archive pieces are inert on the hosted service.

## 1. Before you deploy

1. **Upgrade the Google Cloud billing account (blocking, deadline 2026-10-16).** The Free Trial lasts 90 days from sign-up. When it ends, every resource in the project is **stopped** and stored data is marked for deletion. There is a 30-day grace period in which upgrading can recover the resources; after that they are permanently deleted. To upgrade, open the **Welcome** page in the Cloud Console, click **Activate** in the toolbar and confirm. Unused trial credit stays usable but must still be spent inside the original 90 days. Do this *before* the deploy, so that a stopped Cloud SQL instance cannot be mistaken for a bad release. ([Google: what happens when the trial ends](https://docs.cloud.google.com/free/docs/free-cloud-features).) Only the account owner can do this.
2. **Decide about room-image uploads, because they go live with this deploy.** Uploads return 503 only when `SYNTH_GCS_BUCKET` is unset, and production already sets it for *My creations*; there is no separate switch. What the Terms say today: the acceptable-use clause already tells people to upload only content they own or may use, and not to upload identifiable people without consent. What they do not say: the data table in Terms §7 lists *saved creations* as the only stored media, so room images (uploaded by users, kept until the room or account is deleted, shown on a shared screen, with no automated moderation) are not described there. Options: ship as is and add a §7 row in the next Terms revision `[counsel]`; add the row first; or add a flag that keeps uploads off until the Terms catch up (a small code change, not in this release).
3. **Write down the current revision** so you have a rollback target: `gcloud run services describe synthograsizer --region northamerica-northeast1 --format='value(status.traffic[0].revisionName)'`.
4. **Deploy from Cloud Shell on `quittersarts@`, from a fresh clone of `main`**, as the runbook says. Never from a working tree.

## 2. What is in the release

Live matches `main` at **`55d8254`** (PR #6) or **`144914b`** (PR #7). Every changed static file I could fetch from the run.app URL (46 of 48) is byte-identical to either commit, and none matches #8 onward. The two commits differ only in files that check cannot see. Use `55d8254` as `<last-deployed-sha>` in the runbook's step 0b; it is the conservative choice.

| Area | What changes on the hosted service | PRs |
|---|---|---|
| **Commons: room images** | The room owner uploads images on the desk ("Your images": up to 12 per room, 15 MB and 40 megapixels each, re-encoded to WebP at most 1920 px on the long edge). Pieces on the wall receive them as `room.images`; with none uploaded they get three default images; the host can ask the generator for a piece that uses them. Stored at `users/{owner}/rooms/{room}/{id}.webp` in the existing bucket and counted against the same per-user quota as *My creations*. New endpoints under `/api/thecommons/rooms/{id}/images`. | #9, #10, #11, #12 |
| **Commons: more pieces** | 100 Scenes imported into the gallery; generated pieces arrive with a section, blurb, look tags and a readable name; six remastered pieces (Attractors, Mandala, Night City, Op Art, Oscilloscope, Subdivisions); FlowMounds takes its own colours; the control cap on phones goes from 16 to 24; library cards get pictures. | #7, #8, #15 |
| **Commons: archive pieces** | **Inert.** The loader returns nothing unless `SYNTH_COMMONS_ARCHIVE_ORIGIN` is set (checked: 0 pieces unset, 164 with it set). The 164 metadata files do ship in the image. Do **not** set the variable until the licence decisions in [COMPLIANCE_ROADMAP.md](COMPLIANCE_ROADMAP.md) §8b are made. | #17 |
| **Glitcher** | The Studio selection controls do what they say; focus mode (`F`); three dead modules removed. | #13 |
| **Image generation** | References can be typed `object`, `character` or `style`; untyped references behave as before. Grounded generation can use image search; the free tier still clamps search off (`routers/generation.py`). | #14 |
| **Models and prices** | Every non-Pro text constant (`MODEL_FAST`, `MODEL_DEMO`, `MODEL_TEMPLATE_GEN_FAST` and the rest) is now `gemini-3.8-flash`, still **1 credit**; it was `gemini-3.6-flash` at 1. A Commons sketch is priced by its workload (5 credits a call) instead of by model id. See §4. | #16 |
| **Chat room** | Local installs only. The hosted service serves the page but its API answers `503 chatroom_unavailable`, as today. The page itself is a rebuilt client. | #16, #18–#22 |

**Infrastructure.** One migration: `SCHEMA_VERSION` 4 → 5 adds `commons_room_images` (`CREATE TABLE IF NOT EXISTS`, applied on boot, additive, so rolling the code back is safe). No change to `requirements.txt` or the `Dockerfile`. The backend changed, so runbook §2 must rebuild the image.

## 3. Checks already run (2026-10-05, on `3bb2e34`)

- Python tests: 817 passed. Chat room: 297 passed. Glitcher: 11 passed.
- `scripts/check_model_ids.py` against Google's real model list: all 7 configured ids are served (`gemini-3.8-flash`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`, `veo-3.1-generate-preview`, `lyria-realtime-exp`).
- Archive pieces confirmed inert with the variable unset (above).
- **Not run:** anything against real Postgres or GCS. Room images have only ever run on in-memory stand-ins, so **the first deploy is their first real test**; B2 below is the part to do carefully.

## 4. Cost check on the model change

Four typical light prompts (variations, a template as JSON, a short analysis, a chat turn), each sent once to each model with default settings, priced at the standard rate ($1.50 in / $7.50 out per 1M tokens), counting thinking tokens as output:

| Prompt | 3.6 Flash | 3.8 Flash |
|---|---|---|
| variations | $0.0084 (884 thinking tokens) | $0.0080 (864) |
| template as JSON | $0.0206 (1,417) | $0.0220 (1,446) |
| short analysis | $0.0101 (1,236) | $0.0084 (986) |
| chat turn | $0.0143 (1,134) | $0.0117 (916) |
| **mean per call** | **$0.0134** | **$0.0125** |

- **The model swap is cost-neutral.** 3.8 Flash was about 7% cheaper per call in this sample. It was slower on all four (roughly 10% to 85%), so expect text calls to feel slower, especially template generation.
- **Thinking is the cost, and 1 credit ($0.01) is below the real cost of a typical light call at the standard rate.** Each call used about 900 to 1,450 thinking tokens, even for trivial prompts, which was 50% to 90% of its output-side cost. The same is true on the model that is live now, so this is not new risk, but the free tier is 300 of these a month. Setting a low `thinking_level` on the 1-credit actions (the Commons panel call already does) is the lever; measure before changing it.
- These are 8 calls with default settings through the generateContent API, not through the app's own Interactions path: indicative, not a benchmark. The daily breaker (`SYNTH_DAILY_BUDGET_USD`, default $25) is the backstop either way.

## 5. Deploy and smoke

Run runbook §2, then §2b, then §2c. A correct deploy leaves three revisions about 15 seconds apart. Then:

**A. The runbook's own checklist ([§4](DEPLOY_CLOUDRUN.md))**

- [ ] Step 0: `SYNTH_PUBLIC_ORIGINS` and `SYNTH_GCS_BUCKET` survived (`describe` is the authority, not the probe).
- [ ] Step 0b: the running image contains this release. Paste the appendix list literally, with `<last-deployed-sha>` = `55d8254`.
- [ ] The boot log shows `service db ready (schema v5)`; `SELECT version FROM schema_version` returns 5.
- [ ] Steps 1 to 3, 6 and 7 as written. Steps **4** (admin ∞ and Veo end to end) and **5** (data download, account delete, fresh 300 on re-signup, on a throwaway account) have never been run; do them in this pass.

**B. New in this release**

- [ ] **B1 Library.** The Commons desk loads; the 100 Scenes and the remastered pieces appear in their sections; library cards show pictures (no broken images); **no** "Creative Commons Generative Art" section appears (archive is off).
- [ ] **B2 Room images (first real run).** Create a room. The desk shows "Your images" with the three defaults. Upload a 1 to 3 MB JPEG: it appears, re-encoded. Reorder two images; delete one. Generate a piece with "Use this room's images" and put it on the wall: it shows the uploaded image. A non-image file is refused (415). The storage meter moves. Open the wall on a second device and confirm the images load there. Delete the test account and check `gcloud storage ls gs://synthograsizer-app-user-content/users/<id>/` is empty (this extends step 7).
- [ ] **B3 Phones.** Join a room from a real phone and play one piece. (Play games have so far only had simulated players.)
- [ ] **B4 Credits.** A fast text call (template generation) costs 1; a Pro chat turn costs 5; a generated Commons piece costs 5 per model call. A forced failure refunds. Over the first day, compare credits charged with the cost per call in `/api/admin/stats`; the open question is §4.
- [ ] **B5 Image generation.** One image on each tier (fast, NB2, HQ) works; one with a single reference image works. (Typed references are API-only; untyped must be unchanged.)
- [ ] **B6 Glitcher.** `/glitcher/` loads; import an image; add an effect; draw a rectangle selection and confirm the effect stays inside it; `F` hides the panels and `Esc` brings them back.
- [ ] **B7 Chat room.** `/chatroom/` renders; any action answers `chatroom_unavailable`; nothing tries to reach `localhost:3001`.
- [ ] **B8 Logs.** No raw 5xx details, no prompt text, no stack traces from the new routes, no warnings about the archive.

## 6. Rollback

Shift traffic back to the revision you wrote down:

```bash
gcloud run services update-traffic synthograsizer --region northamerica-northeast1 --to-revisions=<previous-revision>=100
```

The v5 table and any uploaded images stay behind; the old code ignores them and a later deploy picks them up. If the Vercel proxy misbehaves, test against the run.app URL directly (runbook §2d).

## 7. Follow-ups found while preparing this

- Terms §7 row for room images (above) `[counsel]`.
- A low `thinking_level` on the 1-credit actions, after measuring (§4).
- Schedule `scripts/check_model_ids.py` (item 0b in [HANDOFF_SERVICE_LAUNCH.md](HANDOFF_SERVICE_LAUNCH.md)); it has now been run once by hand against the real model list.
- [HANDOFF_SERVICE_LAUNCH.md](HANDOFF_SERVICE_LAUNCH.md) "Next steps" item 0 still says live is `synthograsizer-00047-87m` and that the 2026-09-22 model fix is undeployed; the served files already contain that fix. Update it with the revision and SHA after this deploy.

## Appendix: static files changed since `55d8254` (runbook step 0b)

```bash
cd ~/synthograsizer   # the fresh clone of main
RUN=https://synthograsizer-679278101913.northamerica-northeast1.run.app
for f in \
  static/chatroom/assets/index-I5qxZp4U.js \
  static/chatroom/assets/index-P1ATXxEM.css \
  static/chatroom/index.html \
  static/glitcher/classic.html \
  static/glitcher/index.html \
  static/glitcher/main.js \
  static/glitcher/selection/selection-engine.js \
  static/glitcher/styles/light-workspace.css \
  static/glitcher/tests/selection-controls.test.mjs \
  static/glitcher/ui/chain-bridge.js \
  static/glitcher/ui/enhanced-selection-ui.js \
  static/glitcher/ui/light-workspace.js \
  static/glitcher/v2.html \
  static/synthograsizer/changelog.html \
  static/thecommons/css/desk.css \
  static/thecommons/css/display.css \
  static/thecommons/desk/index.html \
  static/thecommons/display/index.html \
  static/thecommons/img/defaults/README.md \
  static/thecommons/img/defaults/emblem.webp \
  static/thecommons/img/defaults/fox.webp \
  static/thecommons/img/defaults/harbour.webp \
  static/thecommons/img/library/builtin-0.jpg \
  static/thecommons/img/library/builtin-1.jpg \
  static/thecommons/img/library/inherited-big-bang.jpg \
  static/thecommons/img/library/inherited-botanical-growth.jpg \
  static/thecommons/img/library/inherited-cellular-tapestry.jpg \
  static/thecommons/img/library/inherited-circuit-poem.jpg \
  static/thecommons/img/library/inherited-crystal-growth.jpg \
  static/thecommons/img/library/inherited-digital-fidget.jpg \
  static/thecommons/img/library/inherited-face-generator-full.jpg \
  static/thecommons/img/library/inherited-flow-field.jpg \
  static/thecommons/img/library/inherited-gobstoppers.jpg \
  static/thecommons/img/library/inherited-harmonic-waves.jpg \
  static/thecommons/img/library/inherited-hollywood_squares.jpg \
  static/thecommons/img/library/inherited-layered-echo.jpg \
  static/thecommons/img/library/inherited-lissajous-lab.jpg \
  static/thecommons/img/library/inherited-matrix-rain.jpg \
  static/thecommons/img/library/inherited-moire-waves.jpg \
  static/thecommons/img/library/inherited-origami-tiles.jpg \
  static/thecommons/img/library/inherited-particle-nebula.jpg \
  static/thecommons/img/library/inherited-quantum-pairs.jpg \
  static/thecommons/img/library/inherited-recursive-subdivisions.jpg \
  static/thecommons/img/library/inherited-sacred-geometry.jpg \
  static/thecommons/img/library/inherited-signalchain-Bouncing_Squish_Blob.jpg \
  static/thecommons/img/library/inherited-signalchain-CRT_Phosphor_Blobs.jpg \
  static/thecommons/img/library/inherited-spring-physics-v2.jpg \
  static/thecommons/img/library/inherited-strange-attractors.jpg \
  static/thecommons/img/library/inherited-synesthetic_singularity.jpg \
  static/thecommons/img/library/inherited-time-crystals.jpg \
  static/thecommons/img/library/inherited-urban-skyline.jpg \
  static/thecommons/js/desk.js \
  static/thecommons/js/display.js \
  static/thecommons/js/library.js \
  static/thecommons/js/room-images-desk.js \
  static/thecommons/js/room-images.js; do
  [ -f "$f" ] || { echo "NO LOCAL FILE  $f   <- wrong directory, NOT a stale image"; continue; }
  curl -s -m 40 "$RUN${f#static}" | tr -d '\r' | diff -q - <(tr -d '\r' < "$f") >/dev/null \
    && echo "MATCH  $f" || echo "STALE  $f"
done
```
