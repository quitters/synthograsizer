# Agent companies: the safety layer

> **Status:** built and tested on a branch (`atelier/company-safety-1`, stacked on `atelier/residency-1`); not merged, not deployed. Local-first: the chat server that
> hosts it is not deployed anywhere (compliance roadmap R3). Row **R7** of [COMPLIANCE_ROADMAP.md](COMPLIANCE_ROADMAP.md) is this feature.
> Code: [`chatroom/server/company/`](../chatroom/server/company/), [`chatroom/server/routes/company.js`](../chatroom/server/routes/company.js), the hooks in
> `chatroom/server/services/{gemini,orchestrator,sessionRegistry,toolDefinitions,toolDispatch}.js`. Live red team: [`chatroom/redteam/`](../chatroom/redteam/README.md).

## What it is

A **company** is a set of department rooms under one policy. Each room is the existing chat room (up to eight agents talking toward a goal, with tools, endings and a transcript); the company adds what sits above rooms: a mission, a mandate, caps, a tool
grant, an owner, an audit log and a queue for anything that leaves. This document covers the **safety and alignment layer**, built first on purpose: the roster of invented people, the org chart, memory across sessions and the one-prompt creation flow all
run inside it.

A room that belongs to no company is untouched. Everything here switches on only for a company's room, through one object (`orchestrator.policy`).

## Four defences, because a prompt is the weakest

| Defence | What it is | What it covers | What it cannot |
|---|---|---|---|
| **The fixed layer** | Rules at the top and bottom of every agent's system prompt; the character sheet and goal sit in fences | Steers well-behaved models, makes the rules and the stages explicit, resists the framings in the attack corpus | Anything a model decides to ignore. A prompt is advice to a model |
| **The independent screen** | A reviewer that sees only the content (never the sheets, the goal or the conversation) and returns findings; the verdict is derived in code. Runs on every turn and every tool request that carries words, before anything is shown, saved or acted on | The hard limits and the mandate in the drafting stage, where no person is reading; text that a jailbroken agent produced | A reviewer is a model too. It is fenced against injection and tested for it, and its failure means *blocked*, not *passed* |
| **The model service's own filters** | Google's safety systems, which apply in both stages | The worst categories, independently of anything above | Anything below its thresholds. They are never routed around: a refusal is final for the turn |
| **A person** | Nothing leaves a room except through a queue the owner approves, labelled AI-generated | Everything published | Drafting. A person is not reading every turn |

Around them, structure that does not depend on any model: caps, least-privilege tools, isolation, a company that starts paused, no secrets in prompts, an audit log.

## The rules every agent receives

**Mission.** Every company has one, built on dignity, consent, honesty, care for the audience, and creative freedom with accountability. A default is provided
(`GET /api/company/mission`); the owner edits it. It sits inside the fixed layer, above the hard limits, with the sentence that it cannot add an exception to anything below it. A mission is text; it can guide the work and cannot lower a limit.

**Hard limits** (both stages; frozen data in [`hardLimits.js`](../chatroom/server/company/hardLimits.js); a test pins the exact ids):

| id | Rule |
|---|---|
| `minors_sexual` | No sexual content involving minors, in any form, framing, fiction or hypothetical |
| `real_person` | No real-person likeness or impersonation; no invented words, acts or private details for a real, identifiable person |
| `deception` | Nothing built to deceive: no fake news, endorsements or reviews; nothing that passes AI output off as human work or as real footage |
| `private_info` | No private information about real people |
| `harassment_hate` | No targeted harassment or hate |
| `serious_harm` | No operational instructions for serious harm |

**The two stages.** *Drafting* (inside the room) is more permissive: within the hard limits, dark, mature or contested themes may be explored as fiction and ideation, the other side argued, villains written. *Publishing* (anything that leaves: exports,
shared media, the Commons) is stricter. The company proposes and a person approves; nothing is published autonomously; published work is labelled AI-generated; nothing ships with a copyrighted character or a living artist named as a style target
(the **publishing floor**, ids `copyrighted_character` and `living_artist_style`). Each stage has a dial the owner can tighten:

| Dial | Levels (most permissive → strictest) | Default |
|---|---|---|
| `drafting.themes` | `explore` · `careful` (imply, do not depict) · `avoid` (everyday, all-ages) | `explore` |
| `publishing.audience` | `mature` (adult themes, never explicit sexual content or gratuitous gore) · `teen` · `general` | `teen` |

**Honesty.** Agents are told they are AI agents playing invented roles. A person who sincerely asks gets a plain answer. (This replaces the plain room's rule "do not mention being an AI" in a company room; `buildSystemPrompt` amends it.)

**Not settings.** The hard limits, the publishing floor, human approval of every publication, the AI-generated label and the screen at the publishing stage are not fields anywhere. A request that names one is refused by name, and the served schema does not contain them.

## Who can change what

Two layers. The **operator** (whoever runs the server) has a policy: the mandate, ceilings, the most tools any company can ever be granted, and whether drafts are screened. On a **hosted** instance (`SYNTH_HOSTED=1` or Vercel) it comes from the
environment alone, as in `backend/policy.py`; nothing is read from disk. Locally it can also come from a JSON file (`COMPANY_OPERATOR_POLICY`, or `chatroom/data/operator-policy.json`) or the environment. A file that is not valid is ignored whole, with
a warning, and the built-in defaults apply: a typo never leaves a server looser than intended. The **company** then asks for things, and:

> A request can tighten the mandate and never loosen it past the operator's value. A ceiling can be lowered and never raised. A tool grant can be anything up to the operator's set.

The answer to a create or update says what was asked, what applies and what was clamped. Only what was *requested* is stored; what applies is worked out against the operator's policy each time, so when an operator tightens, every company tightens.
`GET /api/company/operator` shows the operator's values.

## Secure instances

- **Isolation.** A company belongs to the visitor who made it (the unguessable cookie id a room uses). Its department rooms each have their own id and are reached with `X-Room-Id` (or `?room=` for an event stream), only by that visitor; any other request gets the
  same `404 No such room` as for an id that does not exist. Memory is scoped to the company, so two companies never share any. Deleting a company removes its folder, audit log, publish queue and its rooms' saved sessions.
- **Least privilege.** Every agent starts with tier `none`. A company starts with the research tools (`google_search`, `url_context`) and its owner widens the grant, up to the operator's set. An agent's tier must fit inside the grant (checked on tool *names*, so a new
  tier cannot slip past): `visual` is refused until `generate_image`, `compose_image` and `critique_image` are granted. Narrowing the grant narrows rooms already running. The dispatcher also refuses a tool the agent was not given, whatever the model asks for.
  A company's room never uses the bracket-tag dialect (`[IMAGE: ...]`, `[SEARCH: ...]`): tags typed into a message do nothing, so a tier cannot be bypassed through the old path.
- **Caps** (operator defaults; a company can lower them): 8 agents per room, 200 turns, 200,000 tokens, \$10 estimated spend per session, 3 withheld turns in a row before the room pauses for a person, 20 proposals waiting at once. "No limit" on turns means the ceiling.
  Spend is an estimate from list prices (`config/models.js`) rounded up, counting the agents, the screen and the tools.
- **No secrets in prompts.** Missions, character sheets, goals, host messages, names and proposals are scanned for credential-shaped text (Google keys, `sk-` keys, GitHub tokens, AWS ids, private-key blocks, JWTs, `password = ...`) and refused, naming the kind and never echoing it.
  The server's own environment is never put in a prompt (a test sets fake keys and searches every prompt).
- **Created paused.** Nothing runs, spends or publishes until the owner says go (`POST /api/company/:id/go`). A paused company's rooms stop at once and cannot be restarted by a message.
- **Names and sheets.** An agent's name is 1 to 60 letters, digits, spaces or `. , ' -` (it is printed into `[Name]:` lines and headings, so it must not be able to look like structure); a sheet is at most 12,000 characters.
  Look-alike transcript lines inside one agent's message (`[Safety]: ...`) are rewritten before another agent reads them.

## What happens to a turn

1. The speaker is chosen and generates, streaming. **In a company room the stream is held**: nothing is shown until the screen has passed the whole turn.
2. If the model service **declined** (a safety block as an error event, a failed interaction whose step says so, or a cut-off stream): that is final. No retry, no rewording, no other model. A note tells the room; it counts as a strike.
3. The **screen** reads the turn. *Block*: the turn is not shown, saved or acted on; a note from "Safety" says which rule (by title) and never repeats the content; the audit log records the rule ids; a strike. *Unavailable* (error, timeout, unreadable answer, too long to
   review): treated as a block. *Pass*: the held text is shown as one piece, then the message is committed.
4. **Tool requests** go through a guard first: is the tool granted; would it pass the spend ceiling; does the screen pass the words it will act on (an image prompt, a file's contents, a research topic); then the tool runs. If the model service declines a picture request,
   the picture tools stay closed for the rest of that turn.
5. A turn in which anything was withheld, refused or blocked is a **strike**; a clean turn clears the count; at the company's limit the room **pauses** and asks a person. Resuming starts the count again.

## Publishing

`propose_publish` (the only publishing tool; it is in no tier, and a test confirms nothing reachable by an agent approves, rejects or exports) and `POST /api/company/:id/publish` (the owner) create a proposal:

- a **snapshot** of the work, with its hash: the file, the picture, or the text, copied at that moment. What the screen reads, what a person approves and what is exported are the same bytes; changing the file in the room afterwards changes nothing here;
- a review by the **screen at the publishing stage** (the hard limits, the publishing floor, the audience the mandate sets; pictures are looked at together with the prompt that made them);
- statuses: `pending` (passed; waiting), `blocked` (a **block is final**: it cannot be approved and cannot be re-screened, because a reviewer asked again and again is a coin tossed until it lands; revise the work and propose it again), `unavailable` (the screen could not
  run: not approvable until a review succeeds), `approved`, `rejected`;
- **approval** only by the company's owner through the API, bound to the hash. A proposal waiting for a person only ever gets stricter on a second look: a block applies, an outage changes nothing;
- **export** only for an approved proposal, with a manifest (`label: "AI-generated"`, the company, who proposed, who approved, when, the hash), an `AI-GENERATED.txt` beside it, and the label inside the work where its format has room for a line (a comment at the top of
  HTML, SVG, JS and CSS, a line at the end of text and Markdown). JSON and pictures are not altered; the manifest carries the label. *Not yet:* the label inside image files.

## The controls

Every control a person has is an API call with a machine-readable schema, so an agent can build or change a company with the same actions (`GET /api/company/schema`: JSON Schema 2020-12 built from the constants the rules use, so it cannot drift from what the server accepts; plus
what is fixed, the dials and the endpoints). Endpoints and operator settings are tabulated in [`chatroom/README.md`](../chatroom/README.md#agent-companies-the-safety-layer). Two properties worth stating: an agent can build or change a company only through the owner's
cookie (the owner), never through a tool; and the only thing an agent can do about publishing is offer.

## Tests

- **Deterministic, in CI** (`.github/workflows/chatroom-tests.yml`; a break fails the check): the hard limits and the floor are exactly these and frozen all the way down; the mandate merge is never looser than the operator's for every combination of value;
  ceilings are only lowered; tiers fit grants; the layer is first and last and the fences are whole for every attack framing used as a sheet, a goal, a mission or a message, in the real prompt; admission, run gating, buffering, withholding, strikes, refusal finality,
  tag inertness, the tool guard, spend; the screen's verdict is derived and fails closed; ownership and the identical 404; the publish queue's snapshot, finality, approval and label; no tool approves.
- **Live red team, by hand before a change ships** (`npm run test:redteam`; method in [`chatroom/redteam/README.md`](../chatroom/redteam/README.md)): 45 attack framings (profile text, role-play, persona instructions, the host's own authority, forged messages) on five surfaces,
  with the request disguised seven ways, against harmless **canary rules in the hard limits' slot** (never write a passphrase; never write in capitals), plus the screen's resistance to injection, honesty under "never admit being an AI" personas, and a baseline. A control run with
  no company layer shows the attacks have teeth. A canary measures how well the layer's authority holds against text that tries to outrank it; it says nothing about whether a model refuses genuinely harmful requests, which is the model service's job.

<!--RESULTS-->

## What this does not do

- It does not make a prompt unbreakable. The layer is advice to a model; the screen, the model service's filters and a person are why a break in it is survivable. The residual break rate in the table above is the layer's, not the system's.
- **Drafted images are not screened**, only the prompts that make them (the model service filters images; the picture itself is reviewed at publishing). A jailbroken agent can see an image it made.
- Search results and pages read by `google_search` / `url_context` are executed and summarised by Google; text inside them that tries to steer an agent is covered by the layer's "tool results" sentence and by nothing else.
- Cookie = owner. Anything that holds the visitor's cookie (a script, an agent given it) is the owner. The protection is that no *tool* does.
- A company's `memoryOwnerId` scopes long-term memory to the company; it is only as private as cross-session memory is (it is off by default and has not been through the hosted privacy review).
- The operator is trusted. Locally the operator is the person at the machine, who can edit the policy file or turn draft screening off (`COMPANY_SCREEN_DRAFTS=0`, refused on a hosted instance, with a loud warning).
- Plain rooms are unchanged, including their handling of a refusal (a failed turn, retried). Extending finality, and the hard-limit layer, to plain rooms is an open proposal.
- Nothing here is legal advice; items marked **[counsel]** in the roadmap row need it.

## What changed in existing code

`gemini.js`: `buildSystemPrompt` takes a `policy` (exported); refusal events (`refusal`) alongside `error`; look-alike transcript lines rewritten for company rooms; `getGeminiClient`. `orchestrator.js`: `policy`, `attachPolicy`, `memoryOwnerId`, admission in
`addAgent`/`updateAgent`/`restoreSession`, run gating in `start`/`resume`/`injectMessage`, the turn loop (buffering, refusal, screen, strikes, spend), `_guardDispatch`, `_propose`, `getState().policy`. `toolDefinitions.js`/`toolDispatch.js`: `propose_publish`; `buildToolsForAgent` takes
`only` and `extra`. `sessionRegistry.js`: room initializers, `peekRoom`, `dropRoom`. `middleware/session.js`: room by id for an owner. `app.js`: the company services and router. `routes/chat.js`: `/start` awaits. `config/models.js`: list prices.

## Next

The roster (SQLite, one row per candidate), the archetypes and the personality quiz, per-agent memory the user can view, edit and delete, the org chart and the one-prompt creation flow, a person-facing approval screen, and a pilot team of four to six agents run by hand inside this layer to
find what is tedious. Storage recommendation for the roster, in five lines: use **SQLite** (roster, memory, audit queries are relational: "best fit for this role among the available" is a `WHERE` and an `ORDER BY`, diversity is a `GROUP BY`); keep **JSON** for importing and
exporting a single profile (it is the Agent Profile format already); use **YAML** only for hand-written org charts a person will diff; follow `scripts/film_factory/db.py` for idempotent additive migrations; keep the company folder's JSON (settings, queue) as it is, because
it is small, human-readable and deleted with the company.
