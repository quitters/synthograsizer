# Agent companies: the creation flow

*Built on the safety layer ([COMPANY_SAFETY_LAYER.md](COMPANY_SAFETY_LAYER.md)); nothing here loosens any of it. Code: `chatroom/server/company/flow/` (the flow, the roster, casting, writing), `chatroom/server/company/hall/` (the Hall), `chatroom/server/routes/flow.js`, and the owner's console at `chatroom/server/public/company/`.*

**One sentence:** describe a company in a sentence; read the proposal; write its people; create it. It is created **paused**, and nothing runs, spends or publishes until its owner says go and starts a room.

## What a person does, and what an agent can do

| | A person | The same, as an API |
|---|---|---|
| **Level 0** | Type a sentence at `/company`. A company is *proposed*: a name and purpose, a mission, rooms (departments) each with a first assignment, positions in each room. Costs about a cent. Nothing exists yet. | `POST /api/company/flow { prompt }` |
| **Level 1** | Edit the proposal in place: names, assignments, titles, who leads, who objects, add or remove a person or a room, choose someone from the roster for a position. Whatever you change is yours; "Fill the blanks again" never touches it. | `PATCH /api/company/flow/:id` |
| **Level 2** | Fix everything yourself up front: every room, every position, facts about a person (birth year, country, name...), the exact headcount, the tools the company is granted, a mission of your own. | `POST /api/company/flow { prompt, locks }` |
| **Cast** | "Write the people". Runs in the background; shows what it has spent against its allowance; can be cancelled. | `POST .../cast`, then poll `GET .../:id` |
| **Create** | "Create the company (it starts paused)". All or nothing. | `POST .../create` |
| **Do it all** | "Do it all, paused": propose, write the people and create the company without stopping ("if the user stops after the first prompt, the company is still completed"). It stops at the first thing a person has to decide (a position nobody could be found or written for, an allowance reached, a safety setting that does not fit) and leaves the proposal, with everyone written so far. | `POST /api/company/flow { prompt, auto: true }` |
| **Run** | Go. Start a room: it is given the brief, the checks and the way of closing that were written for it. After a session: close out (each person writes down what they remember). Approve or reject what a room offers. | `POST /:id/go`, `POST /:id/run/:dept/start`, `.../close-out`, `.../publish/:item/approve` |

Every control a person has is also a documented API with a JSON Schema (`GET /api/company/schema`), so an agent can do what a person can, and no more: there is no way, in either, to start a company running from a prompt, to approve a publication, or to change a hard limit.

## The split

Code decides what must be true. The model writes what is a matter of words.

| Code | Model |
|---|---|
| How big: the owner's size, headcount or list of rooms, else one small call that picks among four fixed layouts | The company's name and purpose; each room's name, purpose and first assignment; what it makes; each position's title |
| One lead a room; someone whose job is to object in any room of three or more; someone in each room who can save files | The seed of each person (a name, three sentences, "the one thing only they know") and their sheet |
| Which person is born where and when, raised by whom, with what setback, how they disagree (drawn from tables, scored against diversity targets) | The writing around those facts |
| Every safety setting, every ceiling, who may approve anything | Nothing here. It is not in any schema the model sees. |
| What the owner fixed, laid back over whatever the model says | |

Every field of a proposal carries its **provenance**: `user` (you fixed it), `ai`, or `default`. The console shows it beside each field. A re-fill writes only fields that are not yours, and not the title of anyone already written.

## The proposal

**Sizes** (our own simplified layouts, kept as data; "modelled on" names only, no claim about any company's real structure): `desk` one room of 6; `small` two rooms, 12; `medium` four rooms, 19; `large` six rooms, 32. **Ways to organise:** `studio` (small teams led by a producer and a director: Nintendo), `product` (a lead, an engineer and a designer per product: Microsoft, Google), `functional` (departments by function: Apple), `live` (a running service: Jagex). A room holds at most 8, a company at most 12 rooms and (by the operator's setting) 32 people.

**What a room makes first:** an `engine` (an image-prompt template for the Synthograsizer: a sentence with placeholders and exactly N variables of M weighted values, checked by the server each time it is saved) or a `document` (a Markdown piece). Each kind writes its own "done when" checks (below).

**Rooms that build on another room's file.** Rooms are separate: a room's files are its own. The Hall's shared workspace is where they meet. A room can *start from* one other room's finished file (`needs`); the room that makes the file is told to write the complete final to the workspace and mail the next lead; the room that starts from it is told where the file is, to read it first, and not to invent it. It cannot be started until the file is there (the owner can put it there by hand). Rooms cannot wait on each other in a circle.

**What you can fix** (`locks`): `name`, `purpose`, `mission`, `houseRules`, `mandate`, `ceilings`, `tools`, `collaboration`, `size`, `style`, `people`, and `departments` (each with `name`, `purpose`, `assignment`, `deliverable`, `needs`, and `positions` with `title`, `archetype`, `lead`, `reviewer`, `tier`, `candidateId`, and `locked` facts about the person: `name`, `bornYear`, `pronoun`, `birthplace`, `culture`, `temperament`, `workingStyle`, `dissent`, `intendedType`, `tier`, `model`, `thinking`, `skills`). A mandate or ceiling can only be tightened: the operator's policy still has the last word, as everywhere.

The owner's request and the model's proposal both go through the company's own screen (drafting stage) before anything is built from them.

## The people

**Casting is mostly a table**, so code does it: eleven archetypes (steward, director, storyteller, craftsman, archivist, contrarian, machinist, editor, scout, analyst, facilitator: what a position needs from a person, the narrowest tool tier that does it, how they disagree, what they are typically blind to), attribute tables with a "do not default to" list for stereotyped trades, and a seeded sampler that keeps the best of up to thirty draws against eleven diversity targets (countries, parts of the world, ages, pronouns, a dissenter in every room of three, temperaments, working styles, intended types, at most half holding any tool, two models). The report is shown after the draw and again on the finished people.

**People already in the roster come first**: "fill each position with the best-fit candidate by querying the table". A person who fits costs nothing. A position the owner named a person for (`candidateId`) is theirs; so is a fact they fixed (a name that is in the roster is that person; a birth year is a person written to it). The same person at two companies is two employees with separate memories.

**Writing a person** (`writer.js`), per person: a seed on the fast model; one sheet on the strong model, told the facts that were drawn, what the rest of the team already used (names, habit verbs, signature phrases, touchstones, voice openers) and what has been learned about this archetype; **code checks** (placeholders, structure, dates against the birth year, first person, personality labels, trades the draw did not give, words three people share), sent back to the writer with the problem in words up to twice; a **blind review** by a model that has not seen the brief (a real person named, or a famous name, sends it back once; everything else is *advice* shown beside the sheet, because the reviewer never reaches zero: thirteen stereotype findings on the first read of the pilot, thirteen different ones after eleven were fixed); the **company's own screen** under that company's mandate; and the **quiz**.

**The screen at the door**: every person's sheet is read by the company's own independent screen, under that company's mandate, before they take a seat in it, whoever wrote it and whenever (in the flow, and at `POST /people`). A sheet it blocks is a draft, a 422 with the reason, an entry in the audit log, and no seat. Changing the mandate sends everyone back to be read again.

**The quiz is a drift detector, not a measurement.** Twenty original questions in the shape of four preference pairs (the framework Jung's *Psychological Types*, 1921, described and the Myers-Briggs Type Indicator popularised: [The Myers & Briggs Foundation](https://www.myersbriggs.org/)), about life outside work, both answers made equally attractive, shuffled per person, answered in character, scored in code. None of the wording is taken from the MBTI or any other instrument; the result is a four-letter label for preferences in a simulation, not an MBTI result and not an assessment of anyone; it is never shown as one. Asked at work, four of six pilot people came out the same type; with an "off the clock" section in each sheet, five different. So it flags a person who has drifted from the casting (two letters or more), and is not a gate for diversity. (Psychology Today's autism test, which the plan names as a reference for which dimensions of cognitive style exist, is not used: it is never given to a user and never used to put a diagnosis on a person or an agent.)

**What fails.** A sheet that fails its checks is tried once more with a different draw; one that fails again stays a draft, with its reasons, in the roster, and is never hired. A model that declines a person (the model service's own refusal) is final for that position: it is not retried or reworded; change the position and cast again. A flow that reaches its allowance stops and keeps everyone it finished; raise the allowance and it goes on where it stopped, writing only who is missing. The roster holds at most 200 people.

## The company that comes out

Created in one step, all or nothing (a failure takes back the company, its people and its Hall; a company found half built after a restart is taken apart):

- **The company**, paused, with the mission and house rules, and a tool grant worked out from what its people's tiers need (checked against the operator's before anything is made).
- **The people**, hired room by room, the lead first and everyone reporting to them; whoever is the reviewer of a file is marked as such; each person's three settings (tempo, candor, push) are set by code from how they disagree, and drawn again within that band after every session.
- **The Hall**: the channels, a locked handbook (how the company works, and its rooms), a welcome for each person, a task for each room.
- **A brief for each room**, *assembled, not trimmed*: what the file is and its exact shape; who does what; how to work (the first draw before anyone discusses anything; each person says what they see; the reviewer says what is wrong; the lead picks at most two changes at a time and closes only when the checks pass); how it meets other rooms; what "done" is made of; the rules. The parts that must be there are never cut: the pilot's hand-cut brief lost the line that said what shape the file had to be, and the server refused the file three times. Only the assignment (the model's part) is cut, at a sentence, to fit the room's 4,000 characters; if the fixed parts alone do not fit it says so and refuses.
- **Checks the server runs** before it lets the room end (`doneWhen`): the file is a valid engine (the real schema, not one a person imagines), the picture was drawn from the *latest* save and looked at, the reviewer has spoken since the last save, the work has been offered for a person to decide, the file was shared (and read) where another room needs it. The lead alone closes; others say in a sentence what they checked. After a save, the reviewer speaks next.

## Running it

The company must be running (**Go**) and the room started by its owner. A room that starts from another room's file waits for it. After a session, **close out**: each person who spoke writes what they remember, *given the record first* (pictures drawn, files saved, what was offered and what was decided, from the server's own ledger), and then each claim is checked against the record: one it contradicts is kept, flagged, shown to the owner with the reason, and **not handed back**. (After the pilot's second day the lead wrote that the team had "approved publishing". Nothing had been proposed.) The owner can read, correct and delete every memory.

Every message in a room, every Hall message and every memory that reaches a model is fenced, labelled as information and not instruction, and read by the independent screen before it is written. There is no private channel: the owner can read everything the people write to each other.

## The owner's console (`/company`)

Plain files served by the chat server, with a policy that lets no script run but its own file. It shows text that models and other people wrote, so its one builder (`h()`) has no way to pass markup and a test fails if the file ever gains `innerHTML`, `eval` or the like. Views: **companies** (go, pause); **new company** (the prompt, and "choose more yourself"); **the proposal** (every field with where it came from, editable; the people, with who they are, whether the reviewer had notes, whether they drifted, whether they were screened; the diversity report; what it has spent against the allowance; a running log); **a company** (rooms: read the brief, start, close out; people and what each remembers; work to decide; the Hall; the record); **the roster** (browse, read a sheet as the room reads it, mark ready, retire, delete, import).

## Operator settings

| Setting | Default | |
|---|---|---|
| `COMPANY_FLOW=0` | on | switch the whole flow off |
| `COMPANY_FLOW_MAX_PEOPLE` | 32 | people in one company (1 to 200) |
| `COMPANY_FLOW_MAX_SPEND_USD` | 8 | the most one flow may spend writing people (the owner's `budgetUsd` can only lower it) |
| `COMPANY_HALL=0` | on | close the Hall for every company |
| `COMPANY_MAX_MESSAGES`, `COMPANY_MAX_WORKSPACE_WRITES` | 30, 20 | most messages and workspace writes one person makes in a session |

The roster and the Hall use `node:sqlite`: Node 22.12 needs `--experimental-sqlite` (`npm run server` and `npm test` pass it), 22.13+ does not. Without it the roster answers 503 and rooms work exactly as before. The database (`company.sqlite`, next to the company folders) is created only when something needs it, and every statement filters by owner.

## Cost

Writing a person costs about $0.07 (the seed on the fast model, the sheet on the strong one, the blind review and the quiz); the console's estimate is $0.10 a person, to leave room for second tries. Measured in the first live run: twelve people in two rooms, $0.81 and about seven minutes (six at a time in each room, one after another), with the proposal included; the pilot's six people, written by hand with edits, three quiz runs and memory summaries, came to $1.13. The proposal is a cent or two. Reading the sheets costs more than writing them, and is not in these figures. A room's own session is separate, bounded by the company's ceilings (default: 200 turns and $10 a session; the flow asks for at most 8 turns a person and 60 a room). The console shows an estimate before casting ("up to $X"; people who fit are taken from the roster for nothing) and the spend against the allowance as it goes.

## Tests

`npm test` in `chatroom/` (CI runs it on every pull request): the planner and its edits, locks and provenance; casting and its diversity guarantees; the writer pipeline and each check; the quiz; the brief and its limits; the flow end to end with a stand-in for the model (cast, create, reuse, pinned people, the allowance, cancel, restart, rollback, the screen at the door, rooms that start from other rooms); the flow over HTTP; the console's headers and its inability to set markup; the roster, the Hall and its tools; memory and its claim check. The model-shaped steps are exercised live in the run recorded in `synthograsizer-atelier/runs/2026-10-08-company-flow/`.

## What this does not do

- It does not run companies by itself: a room starts when its owner starts it (there is no scheduler), and the owner decides what leaves.
- A sheet is a model's writing. The blind review is advice, not a gate; the screen reads for harm, not for taste. A person still reads the sheets they care about.
- The quiz is a label for a simulation, not an assessment. It is not given to anyone, and not used on a person.
- The roster is only as private as the machine it is on. Nothing here has been through the hosted privacy review (`HANDOFF_SERVICE_LAUNCH.md`), and the chat server is not deployed.
- The owner is the visitor cookie. The console makes it easy to act as the owner, so on anything shared the sign-in in the service plan comes first.
- The cost figures are round numbers from small runs.
