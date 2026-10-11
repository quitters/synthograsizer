# Handoff: laptop to desktop

Written 2026-09-29 at the end of a long laptop session, to start the first desktop chat. Not tracked
by git; delete it once the desktop is set up and the decisions below are made.

## Start here

Open Claude Code in `C:\Users\Alexander\Projects\synthograsizer-suite` on the desktop and paste:

> Read HANDOFF.md in the repo root. Walk me through the setup checklist first and check each item
> yourself where you can, then summarise the decisions waiting on me.

## 1. Setup checklist

**Before copying, on the laptop:**
- [ ] Remove the last old worktree (its work is saved as commit `bb58552`):
  `git worktree remove "C:\Users\Alexander\Projects\synthograsizer-suite\.claude\worktrees\dreamy-dubinsky-2a7eb9"`
  (if you forget, the same command works on the desktop when the paths match).
- [ ] `git worktree list` shows only the main folder.

**Copy these three, to the same paths** (tools and memory rely on `C:\Users\Alexander\...`):
- [ ] `C:\Users\Alexander\Projects\synthograsizer-suite` (includes the keys; see below)
- [ ] `C:\Users\Alexander\Projects\commons-sketchbook` (not a git repo; batches, tools, page builder)
- [ ] `C:\Users\Alexander\.claude\projects\C--Users-Alexander-Projects-synthograsizer-suite` (Claude's
      memory notes and past sessions)

If the desktop's Windows user is not `Alexander`, tell Claude the new path: the Sketchbook tools
(`tools/generate.py`, `tools/evaluate.py`) and the memory folder name depend on it.

**On the desktop:**
- [ ] Python 3.13, Node 24, git, GitHub CLI installed
- [ ] `pip install -r requirements.txt` (includes `mini-racer` for the sketch compile check and `pillow`)
- [ ] `gh auth login`, and git `user.name` / `user.email` set
- [ ] Keys present (gitignored, so they come only with the copy): `ai_studio_config.json` and
      `backend\ai_studio_config.json` (Gemini key), `chatroom\.env`
- [ ] `python -m pytest -q` passes (754 on the laptop at `8e7204a`)
- [ ] `git fetch` shows main level with `origin/main`

**Keeping the two machines in sync** (discussed, not yet set up):
- Code: git with GitHub as the hub. Push before leaving a machine, pull when arriving.
- Local branches without GitHub: share the laptop's Projects folder on the network, then on the desktop
  `git remote add laptop //LAPTOP-NAME/Projects/synthograsizer-suite` and `git fetch laptop`
  (fetch only, never push into the other machine's checkout).
- Everything else (`commons-sketchbook`, `DemoVideos` once moved out of the repo, keys, Claude's memory):
  Syncthing over the local network. Never point Syncthing or OneDrive at a git folder.

## 2. Where things stand

`main` is `8e7204a`, level with GitHub (`quitters/synthograsizer`), with PRs #1 to #12 merged. Recent work
now in main:
- **FlowMounds** (#7): its colour controls work, more of it is controllable, and the room can reroll it.
- **100 Scenes** (#8): 100 generated pieces in the desk library; generated pieces now arrive with their
  own gallery listing (section, blurb, look tags, readable name).
- **Room images** (#9 to #12): the room owner uploads images on the desk ("Your images"), pieces get them
  as `room.images`, rooms without uploads use three sample images, and the generator can be asked for
  pieces that use them. Design record: `docs/commons-room-images-plan.md`.

Never run against real Postgres and GCS (all checks used the app on in-memory stand-ins), so **watch
the first deploy**. Uploads need `SYNTH_GCS_BUCKET` set; without it rooms fall back to the samples.

The only untracked thing in the folder is `DemoVideos/` (100 MB, yours).

## 3. Decisions waiting on you

### Work that is not in main
Each should go in as its own PR with tests, not a direct merge.

| Branch | Where it lives | What it is |
|---|---|---|
| `chatroom/gemini-modernization-phases-0-1` | GitHub, never a PR | 15 commits: chatroom phases 0 to 8 (function calling, file search, per-agent voices, Deep Research, Live API, cross-session memory) plus Commons pricing and grounding. PR #1 deliberately left it out; likely conflicts with main now. |
| `fix/glitcher-selection-and-tidy` | GitHub, never a PR | 3 commits: delete three unused Glitcher modules, fix the Studio's selection controls, add a focus mode. |
| `commons/generative-panels` (`9e7609a`) | **this repo only** | Six old Synthograsizer templates remastered as wall pieces: Attractors, Mandala, Night City, Op Art, Oscilloscope, Subdivisions. Written for the gallery's old format, so each needs porting. |
| `claude/dreamy-dubinsky-2a7eb9` (`bb58552`) | **this repo only** | Typed reference slots for image generation (object, character and style references). Unreviewed; based on PR #3's merge. |

`commons/stage-2-room-isolation` (local only) holds older copies of the chatroom phases; nothing new.
The two **this repo only** branches exist nowhere else: push them to GitHub for a backup if wanted.

### What goes into the desk library
Sorted on the Commons Sketchbook page (below) as Yes / No / Unsorted. As of 2026-09-29:
- **Lightworks:** 20 Yes, Claude's shortlist (reasons in `commons-sketchbook/lightworks/shortlist.md`),
  43 unsorted. Trim it by pressing No.
- **Trial 1:** 7 Yes, your own picks from 2026-09-24, all running: Celestial Fireworks Symphony,
  Thunderstorm Plasma, Titan Tug of War and Bioluminescent Turing Reef (Flash), Bauhaus Beat Slide,
  Abyssal Interference and Generative Invaders: Boss Edition (Pro). These were made with the early v1
  prompt, so check them as carefully as the rest when promoting.
- **Play:** nothing sorted yet.
- **Uploads:** cannot join the library by design (library pieces never use room images).

## 4. The Commons Sketchbook

`C:\Users\Alexander\Projects\commons-sketchbook`, published as the private page
<https://claude.ai/artifact/8KxJXc18iqEvUKymXXpCLs>, which runs every sketch live. Its README has the
details; the short version:

| Batch | Scenes | Sketches | Cost | Notes |
|---|---|---|---|---|
| 100 Scenes | 100 | | | all imported into the library (#8) |
| Lightworks | 63 | 233 | $10.59 | public light art, phenomena, crowd pieces; 14 weakest re-run at high thinking |
| Uploads | 40 | 126 | $5.47 | pieces using `room.images` |
| Play | 62 | 248 | $12.62 | party games for phones; Claude chose which attempt each scene shows |
| Trials 1 to 3 | | | | early model comparisons |

- Generate: `python tools/generate.py <batch> --prompts <batch>/prompts.py --attempt N [--thinking high] [--images]`
  (spends money; key read from the suite's `ai_studio_config.json`). Check: `python tools/evaluate.py <batch>`.
  Rebuild the page: `python tools/build_gallery.py`, then Claude republishes it to the same URL.
- Sorting is stored in the page's database, collection `picks`: one document per sketch,
  `verdict: "yes" | "no"`; a document with no verdict (older picks) counts as Yes. A record's `review`
  field is different: Claude's note on which attempt a scene shows.
- **The page is 14.3 MB of a 16 MB limit.** Slim it (drop the trials, or split a batch into its own page)
  before adding another batch.
- Parked themes for the next batches are in `themes.md`: Rituals of light, Title sequences and graphic
  design, Machines and instruments, Science made spectacular (start at high thinking), Materials and craft.

## 5. Suggested next steps

1. Finish sorting Lightworks, Play and anything else, then tell Claude "promote the Yes pieces".
   Claude runs `scripts/commons_promote.py` per piece, reads each file in full, fixes names and sections
   (Lightworks predates #8's fixes: about a third are filed under Demo scene, several have snake_case
   names, and the fountain show is named after a casino), runs `tests/test_thecommons_gallery.py`, and
   opens a PR.
2. Decide which of the unmerged branches go into main.
3. Playtest three or four Play games in a room with real phones; so far only simulated players have
   played them.
4. Slim the Sketchbook page, then run the next theme.

## 6. Notes for Claude

- **Terminals:** the user's terminal is PowerShell. Commands for them to run must be PowerShell (a bash
  `for` loop failed there). Claude's own Bash tool is Git Bash.
- **Deleting folders:** auto mode blocks folder and worktree deletion as irreversible. Check first for
  uncommitted work (two worktrees held some), commit it to its branch, then give the user the command.
- **Stacked PRs:** retarget each dependent PR with `gh pr edit N --base main` before deleting its base
  branch; deleting the base through the API closed #9 once.
- **Judging pieces:** always at 1920x1080. Many pieces size things in fixed pixels and look fine small
  but sparse on a real wall. Contact sheets and timing come from rendering in the browser pane.
- **Batches:** give each theme its own CRAFT line (a shared one pulls every piece to one look). Medium
  thinking is enough for games (Play: medium and high came out even); subtle phenomena need high.
- **Room images decisions (the user's, not open questions):** stored in GCS, per room only, owner-only
  uploads with no automated moderation, default images for testing, library pieces never use images.
- **Tool quirks:** `gh --template` / `--jq` quoting breaks in PowerShell, so run gh through Bash. Python
  heredocs with Windows paths break on backslash escapes; write a script file instead.
- Claude's memory folder has the same facts in `unmerged-work.md`, `commons-batch-themes.md` and
  `commons-room-images.md`.
