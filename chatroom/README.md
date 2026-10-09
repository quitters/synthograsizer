# Agent Chat Room

An autonomous multi-agent chat room powered by Google's Gemini API. Create AI agents with unique personalities and watch them collaborate on goals, generate images, search the web, and reach consensus autonomously.

## Features

### Core Functionality
- **Multi-Agent Conversations**: Create multiple AI agents with distinct personalities and expertise
- **Autonomous Discussion**: Agents converse and collaborate toward shared goals without human intervention
- **Real-time Streaming**: Server-Sent Events (SSE) for live message streaming
- **Token Management**: Configurable token limits with live usage tracking
- **Consensus Detection**: Automatic conversation completion when agents reach agreement
- **A lead agent ends the session (the default)**: only the lead's own `[CONSENSUS REACHED]` / `[END SESSION]` ends a group chat (reason `lead_closed`); the other agents' markers are recommendations the lead is shown. The lead is the first agent unless you name one (Settings → Consensus → "Who ends the session", or `leadAgent` in `POST /api/chat/consensus-settings`). Agreeable agents echoing each other used to close sessions early. `closeBy: "vote"` restores the old quorum vote; solo chats always use it.
- **Limits** (same settings, default off): `minTurns` — nothing ends the session before that turn; `maxTurns` — the session ends after that many turns whatever the agents say (`turn_limit_reached`), with a warning in the last round

### Agent Capabilities
- **Image Generation**: Agents can generate images using `[IMAGE: prompt]` syntax (Gemini Image Pro)
- **Image Remixing**: Iterate on generated images with `[REMIX: imageId | changes]`
- **Web Search**: Real-time web search with `[SEARCH: query]`
- **URL Analysis**: Fetch and analyze web content with `[URL: url]`
- **Research Mode**: Deep research combining multiple sources with `[RESEARCH: topic]`

### Speaking Order Control
- **Dynamic** (default): AI-driven selection based on context, expertise, and direct addressing
- **Round-Robin**: Agents take turns in a fixed order
- **Priority**: Higher priority agents speak more often (configurable per-agent)
- **Random**: Random speaker selection

### Chat Branching
- Save conversation state at any point as a "branch"
- Restore branches to explore alternative directions
- Rewind conversation to any message
- Compare different conversation paths

### Quality of Life
- **Agent Templates**: Pre-built agent configurations (Tech Startup Panel, Creative Writers, etc.)
- **Session Save/Load**: Export and import full conversation sessions
- **Export Options**: Markdown, JSON, and media ZIP exports
- **Dark/Light Themes**: Toggle between color schemes
- **Keyboard Shortcuts**: Quick actions for common operations
- **Message Search**: Full-text search through conversation history
- **Collapsible Sidebars**: Maximize chat viewing area

## Tech Stack

### Backend
- **Node.js** with Express.js
- **Google GenAI SDK** (`@google/genai`, Interactions API; conversation history is retained server-side by default — see Conversation state)
- **Server-Sent Events** for real-time streaming
- **UUID** for unique identifiers

### Frontend
- **React 18** with Vite
- **Custom Hooks** for SSE, themes, and keyboard shortcuts
- **JSZip** for media export
- **CSS Variables** for theming

## Project Structure

```
ChatRoom/
├── server/
│   ├── index.js              # Express server entry point
│   ├── routes/
│   │   ├── agents.js         # Agent CRUD endpoints
│   │   └── chat.js           # Chat control, streaming, branching endpoints
│   ├── services/
│   │   ├── gemini.js         # Gemini API integration & system prompts
│   │   ├── orchestrator.js   # Conversation loop, speaker selection, branching
│   │   ├── imageGen.js       # Image generation & remix handling
│   │   ├── mediaStore.js     # Singleton for tracking generated media
│   │   └── tools.js          # Web search, URL fetch, research tools
│   └── utils/
│       └── tokenCounter.js   # Token estimation utilities
├── client/
│   ├── src/
│   │   ├── App.jsx           # Main application component
│   │   ├── main.jsx          # React entry point
│   │   ├── components/
│   │   │   ├── AgentCard.jsx     # Individual agent display
│   │   │   ├── AgentSetup.jsx    # Agent creation panel
│   │   │   ├── ChatMessage.jsx   # Message display with images
│   │   │   ├── ChatRoom.jsx      # Message list container
│   │   │   ├── Controls.jsx      # Start/stop/pause controls
│   │   │   ├── GoalHeader.jsx    # Current goal display
│   │   │   ├── MessageSearch.jsx # Search overlay
│   │   │   ├── RemixModal.jsx    # Image remix interface
│   │   │   ├── SettingsPanel.jsx # Speaking order & branching UI
│   │   │   ├── TokenMeter.jsx    # Token usage display
│   │   │   └── Toolbar.jsx       # Export, templates, save/load
│   │   ├── hooks/
│   │   │   ├── useEventSource.js     # SSE connection management
│   │   │   ├── useKeyboardShortcuts.js # Keyboard handling
│   │   │   └── useTheme.js           # Theme persistence
│   │   ├── utils/
│   │   │   ├── agentTemplates.js # Pre-built agent configurations
│   │   │   └── export.js         # Export formatting utilities
│   │   └── styles/
│   │       └── App.css           # All application styles
│   └── vite.config.js        # Vite configuration with proxy
├── package.json              # Root dependencies
└── .env                      # Environment variables (create this)
```

## Installation

### Prerequisites
- Node.js 20+
- Google Gemini API key with access to:
  - `gemini-3.8-flash` (default agent turns, image understanding)
  - `gemini-3.5-flash-lite` (search / URL-context tool calls)
  - `gemini-3.1-pro-preview` (optional per-agent "deliberate" tier)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd ChatRoom
```

2. Install dependencies:
```bash
npm run install-all
```

3. Create environment file:
```bash
# Create .env in root directory
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

4. Start development servers:
```bash
npm run dev
```

5. Open http://localhost:5173 in your browser

## Tool modes

Agents reach tools one of two ways, selected by `TOOL_MODE`:

| Mode | How it works |
|---|---|
| `tags` (default) | The agent writes `[IMAGE: a fox in snow]` in prose. The server regex-parses it after the turn ends, so the result reaches the **next** speaker as transcript text. |
| `functions` | The agent emits a real function call. The server runs it mid-turn and hands the result back — including the generated image itself — so the agent reacts to what it actually made inside its own message. |

`functions` is the intended destination but has not yet been exercised against
the live API. In that mode each agent gets a **tool tier** (`none`, `research`,
`visual`, `builder`, `full`) rather than the whole inventory, keeping the
active set inside Google's 10–20 tool guidance. Tiers live in
`server/config/tools.js`; declarations in `server/services/toolDefinitions.js`.

## Voices and session audio

Every agent has a `voice`, defaulting by roster position so a new room
already sounds like distinct people. 30 voices are available; pick one per
agent in the setup form, or leave it on Auto.

**Export → 🔊 Render as Audio** reads the whole transcript aloud and
downloads a single WAV. It is an explicit action rather than automatic:
audio bills at roughly $2.30 per hour of speech, and a long session takes
minutes to render.

Each contiguous run by one speaker is a separate single-speaker request,
concatenated afterwards — multi-speaker TTS caps at two voices, which is no
use to a room with four agents.

## Reference documents

With `FILE_SEARCH=true`, uploaded documents are indexed once into a
per-session File Search store and queried by the built-in `file_search` tool.
Without it, a PDF is base64-inlined for the first couple of turns and then
invisible, and a text file is truncated at 5,000 characters.

Images are not indexed either way — an agent asked about a reference image
needs to see it, not retrieve text about it.

Stores are deleted on reset. If a crash leaves one behind (the quota is
project-wide), `GET /api/chat/file-search/orphans` lists them and `DELETE` on
the same path clears them.

### Cross-session memory

`CROSS_SESSION_MEMORY=true` (on top of `FILE_SEARCH=true`) archives each
finished session into a long-lived store and lets agents in **later**
sessions search it. Ask a returning room what it decided last time and it
can actually look.

**Memory is per visitor** (see *Rooms*): each visitor's room has its own store, named
`chatroom-longterm-memory-<room id>`, so one visitor's agents can never search, list or
wipe another's past conversations. It follows the browser's `cr_sid` cookie, so clearing
cookies starts a fresh memory (the old store stays in the project until you delete it).
A store from before rooms existed, named plain `chatroom-longterm-memory`, belongs to no
visitor and is no longer searched.

The memory store survives resets and restarts by design — it is found by
display name, not a local file — and the orphan sweeper skips it. Sessions
under 4 messages are not archived. `GET /api/chat/memory` lists what the
caller's room remembers; `DELETE /api/chat/memory` forgets all of it. Each
visitor's store counts against the project's File Search quota.

## Conversation state

`GEMINI_STORE_INTERACTIONS` decides whether Google retains conversation
history. This is a privacy trade, not a tuning knob.

| | `true` (**default**) | `false` |
|---|---|---|
| Retention at Google | 55 days paid / 1 day free (7/14/28/55 configurable in AI Studio) | none |
| Per turn | only what the agent has not seen | full system prompt + windowed transcript |
| Implicit caching | engages once the chain grows past 4,096 tokens | impossible — no chain to key on |
| Reset | deletes the stored chains | clears local state only |

Explicit caching is not available in the Interactions API, so chaining is the
only route to cached input. Confirm it is working by watching **Cached** in
the token meter — it stays at zero when retention is off, by definition.

Set `GEMINI_STORE_INTERACTIONS=false` to opt out. Resetting the room deletes
the session's stored chains either way.

## Testing

```bash
npm test          # node --test tests/
npm run test:watch
```

No API key or network access is needed. The stream-parser suite replays
recorded Interactions SSE sequences from `tests/fixtures/` through a fake
client, pinning the event contract the orchestrator consumes: chunk ordering,
thought-leak filtering, usage accounting, truncation/continuation, and the
retry fallbacks. `tests/fixtures/README.md` explains the event shapes and how
to record a real one.

## Rooms: one per visitor

Every browser gets its own chat room: its own agents, conversation, live stream, generated media, shared files (artifacts), and workflow runs and traces. Nothing is shared between visitors, so one person starting, stopping or resetting a chat never affects another's.

- A room is found by the `cr_sid` cookie (an unguessable 128-bit id; `HttpOnly`, `SameSite=Lax`, set for the whole origin). A browser without one is issued one on its first request and starts with an empty room; a cookie that is not an id this server issued is ignored. Every page of the suite that uses the chat room API (Agent Studio, the trace viewer, the workflow runner) shares the cookie, so they share the room.
- Rooms live in memory only. A room nobody has used is dropped after 10 minutes, one with a conversation after 6 hours without activity, and the oldest idle rooms go first above 200. A room with a running chat or an open browser tab is never dropped. Restarting the server clears every room.
- The first request a new browser makes may be the event stream; the server then sends the cookie and closes the stream, and the browser reconnects a moment later. `backend/routers/system.py` forwards `Set-Cookie` for this.
- Also per room: the long-term memory store, the judge's token usage, and the File Search store for a session. `DELETE /api/chat/file-search/orphans` sweeps the whole project but never deletes a store any live room is using.
- Not isolated: the saved workflow library (`/api/workflows` list, get, save, delete) is shared on disk. Workflow checkpoints and traces written before rooms existed belong to no room and are not listed.

## Long conversations: the rolling summary

Each agent turn sends the last 15 messages in full. Older messages used to be cut to their first 80 characters, which kept a topic's name and lost what was decided, who disagreed and what was still open. Now a fast model (`gemini-3.8-flash`, override with `CHATROOM_SUMMARY_MODEL`) keeps running notes on everything older.

- Once 6 or more messages have aged out of the window, they are folded into the notes in the background, a few at a time (at most 30 per call). The call never blocks or fails a turn; if it fails, the one-line notes are used a little longer and it is tried again after the next message.
- The notes are capped at about 3,000 characters, attribute by name, keep decisions, positions, concrete details and open questions, and mark earlier open questions as resolved when they are.
- They describe a specific run of messages and are dropped the moment those change: rewinding, restoring a branch or resetting discards them, and they are rebuilt from the messages that remain.
- `GET /api/chat/state` reports `summarizedMessages`, and a `summary_updated` event is sent on the stream whenever the notes grow.
- Cost: roughly one small flash call per 6 messages once a conversation passes 20 messages.
- Not used when `GEMINI_STORE_INTERACTIONS` is on (the default): there the server keeps each agent's real history, so no notes are built or sent. They are for stateless turns (`GEMINI_STORE_INTERACTIONS=false`) and for an agent's first turn.

## Reference files: what agents see

Files uploaded to a session (up to 14) are re-sent with every agent turn, so what is attached is budgeted (`server/services/mediaContext.js`):

| Kind | When an agent sees it |
|---|---|
| Images | Every turn: the 8 newest, within about 6 MB of base64 |
| Text, JSON, CSV, Markdown... | Every turn, inline: up to 8,000 characters each and 30,000 across all files (a longer file says how long it was) |
| Video and PDF | In the opening turns and for the turns right after they are added (one per agent, plus one, so each agent gets a look). They are heavy in tokens and bytes, so after that they are only listed |
| Other types | Listed by name |

On a chained turn (see *Conversation state*) the agent's server-side history already holds every file it was shown, so only files added since it last spoke are sent. Documents indexed into File Search are never sent inline. Anything not attached on a turn is still listed with the reason, and an image can still be remixed by ID. Before this, reference files were shown only while the chat had two messages or fewer: after that an agent was told the file names and nothing else, so an uploaded notes file or reference image was invisible for the rest of the session and a file added mid-conversation was never shown at all.

## Saved sessions

A room lives in the server's memory, so closing the tab or restarting the server used to lose the conversation. Now every message is appended to disk the moment it is said:
`chatroom/data/rooms/<room id>/<session>/` holds `session.json` (the goal, the agents with their bios, the settings, how and when it ended), `transcript.jsonl`, `media/`, `uploads/` and `artifacts/` (the latest version
of each file, and every version under `.versions/`). **On for a local install; off on a hosted instance** (`SYNTH_HOSTED=1`) unless `CHATROOM_AUTOSAVE=1`; `CHATROOM_AUTOSAVE=0` turns it off anywhere. Sessions are deleted after
`CHATROOM_AUTOSAVE_DAYS` (default 30; 0 keeps them), `CHATROOM_DATA_DIR` moves the folder, and `chatroom/data/rooms/` is git-ignored. A room only ever sees its own folder (the folder name is the room's secret id).
The Agent Studio's 🗂 button lists them (reopen, download, delete); a reopened session keeps writing into its own folder, and the next message from the user carries on exactly as after a session ends.
`POST /api/chat/import` loads a session file: the one the Studio's Export button writes (`{goal, mode, agents, messages, artifacts}`), or a saved session downloaded from `GET /api/chat/saved/:id/download`. Import works even where saving is off.

## Done when: a machine-checked end

A lead agent stops premature endings but is not a verifier: in one experiment the room's only failure was an agent who wrote "the checks are complete, six variables, twelve values each" about a block with a wrong count, and the lead
believed it. Models cannot count to twelve. `POST /api/chat/done-when` (or `doneWhen` on `/start`, or the Studio's Settings) sets checks the **server** runs every time anyone tries to end, lead or vote, and on each new artifact version:

```
artifact: engine.json                                   the artifact exists and is not empty
regex: /FINAL ANSWER/i in last_message                  (or any_message, or artifact:<name>)
json: engine.json {"type":"object","required":["promptTemplate"],"properties":{"variables":{"type":"array","minItems":6,"maxItems":6}}}
url: http://localhost:8000/api/health 200               an address that answers
```

`json:` takes `type`, `required`, `properties`, `items`, `minItems`/`maxItems`, `uniqueItems`, `minLength`/`maxLength`, `pattern`, `enum`, `const`, `minimum`/`maximum` and `additionalProperties: false`, and says what is wrong in words an
agent can act on (`$.variables[0].values: 11 items, needs exactly 12`). A failed check refuses the ending: a Producer note lists what passes and what fails, the ending in progress is cleared, and the room carries on; a new artifact
version is judged the same way, announced when the verdict changes. Every agent is told the checks. A check nobody can pass would loop until the token limit, so after 8 refusals (`maxBlocks`; 0 = never) the room ends anyway with the reason
`done_check_unmet`. Turn and token limits are never held back by the checks.

## The independent critic

Alone, even the smallest model scored a photograph that had drifted into a painting 2 to 3 out of 10, against about 9 for good frames; in a room, the supervisor said MATCH to it. The weakness is social. The critic is a blind scoring
call (`services/judge.js`, `critiqueImage`) that sees only the pictures (a reference or a description, and the candidate), never the conversation, and answers 1 to 10 (a MATCH/RETAKE checklist made every model reject nearly everything; the
score discriminates). `POST /api/chat/critic` turns it on (`referenceId` is an attached file's name or a picture id, `criteria` what must stay the same, `minScore` the bar, `maxCalls` the budget). Agents ask with
`[CRITIC: <picture id> | reference=<id> | criteria=...]` (or the `critique_image` function); with a reference set, pictures an agent makes are scored automatically and the room is told in one note. `POST /api/chat/critic/score` scores one now.

## Showing the room, and rendering

Crews that could see what their code drew fixed a pond made of moire, a stained glass of flat primaries and a chain that was confetti; without a picture the same crews shipped them. `POST /api/chat/show {images, caption, sender}` puts pictures in the
conversation as a note (and in the vision window, so the next speaker is shown them). Agents ask to see what they wrote with `[RENDER: engine.json | draws=3]` (or `render_artifact`): an image-prompt template is drawn a few times with random
values; an instrument (`.json` with `p5Code`) or a page (`.html`, `.js`) is rendered by a browser attached to the room. The Agent Studio opens the event stream with `?renders=1`, receives `render_request`, draws the thing in a hidden frame and
answers `POST /api/chat/render-result`; the standalone chat page does not render. `POST /api/chat/render` does it on the host's request. Limits: 4 draws per render, 12 renders per session.

## Agent companies: the safety layer

A **company** is a set of department rooms under one policy (`server/company/`, `/api/company`). The safety layer is the foundation the rest of the company tool is built on; the full design,
what each defence covers, and the red-team method and results are in [docs/COMPANY_SAFETY_LAYER.md](../docs/COMPANY_SAFETY_LAYER.md). In short:

- **Fixed rules every agent gets**: a humanist mission (editable), six hard limits no setting can lower, two stages (drafting is permissive; anything that leaves the room is stricter and needs a person), honesty about being an AI. They lead the
  system prompt and close it; the character sheet and goal are fenced and are told they cannot outrank it.
- **An independent screen** reads each turn, and each tool request that carries words, before it is shown, saved or acted on. If it cannot run, nothing is passed. The model service's own refusals are final for the turn.
- **Nothing is published without the owner**: agents can only `propose_publish`; the queue snapshots the work, screens it at the publishing stage, waits for the owner's approval, and exports it labelled AI-generated. A block is final.
- **Secure instances**: a company is created paused; caps on agents, turns, tokens, spend and strikes; every agent starts with no tools and a company with the research tools; companies and their memory are isolated; no secrets in prompts.
- **Requests tighten, never loosen**: the operator's policy (environment on a hosted instance, a local file or environment elsewhere) is the ceiling.

A company's room is reached with `X-Room-Id: <roomId>` (or `?room=` for the event stream) on the ordinary `/api/agents` and `/api/chat` endpoints, and only by the visitor who owns the company. A room that belongs to no company behaves exactly as before.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/company/schema` | JSON Schemas for every control, what is fixed, the dials, the endpoints |
| GET | `/api/company/operator` | What the operator allows (the defaults nothing can loosen) |
| POST / GET | `/api/company`, `/api/company/:id` | Create (paused) / read; the answer shows what was asked, what applies and what was clamped |
| PATCH / DELETE | `/api/company/:id` | Name, mission, mandate, ceilings, tools / delete everything |
| POST | `/api/company/:id/go`, `/pause` | Let it run / stop it. Nothing runs, spends or publishes until `go` |
| POST | `/api/company/:id/rooms` | Add a department with its own isolated room |
| GET | `/api/company/:id/audit` | What the layer did: decisions, never content |
| POST / GET | `/api/company/:id/publish` | Offer work / the queue |
| POST | `/api/company/:id/publish/:item/approve`, `/reject`, `/rescreen` | The owner decides (a block cannot be approved or re-screened) |
| GET | `/api/company/:id/publish/:item/export` | The approved work with its AI-generated label |

Events a company's room adds: `message_withheld`, `provider_refusal`, `safety_pause`, `safety_notice`, `publish_proposed`. Operator settings: `COMPANY_DRAFTING_THEMES`, `COMPANY_PUBLISHING_AUDIENCE`, `COMPANY_MAX_AGENTS`, `COMPANY_MAX_TURNS`,
`COMPANY_TOKEN_LIMIT`, `COMPANY_SPEND_LIMIT_USD`, `COMPANY_MAX_SCREEN_STRIKES`, `COMPANY_MAX_PENDING`, `COMPANY_TOOLS`, `COMPANY_SCREEN_MODEL`, `COMPANY_SCREEN_DRAFTS=0` (local only), `COMPANY_OPERATOR_POLICY` (a policy file; ignored when hosted).
`npm run test:redteam` runs the live red team (see [redteam/README.md](redteam/README.md)).

## Agent companies: people, a shared space, and the console

Describe a company in a sentence and get one: a proposal (a name, a mission, rooms with a first assignment each, who is in them), then the people written (from the roster where they fit), then the company, **created paused**. Open the owner's
console at **`http://localhost:3001/company/`** (the chat server serves it; run it with `npm run server`, which passes `--experimental-sqlite` for the roster on Node 22.12; 22.13+ does not need the flag). Everything the page does is also an API with a JSON Schema
(`GET /api/company/schema`). Design, costs, what it does not do: [docs/COMPANY_CREATION_FLOW.md](../docs/COMPANY_CREATION_FLOW.md); what it adds to the safety story: "People, a shared space and a console" in the safety doc.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/company/flow/options` | Sizes, ways to organise, archetypes, what a room can make, what can be fixed, the limits and a rough price per person |
| POST / GET | `/api/company/flow`, `/api/company/flow/:id` | Propose a company from a prompt (nothing is created; about a cent) / read the proposal, where each field came from, who is cast, what has been spent |
| PATCH | `/api/company/flow/:id` | Edit the proposal: what you change is yours, and a re-fill never overwrites it |
| POST | `/api/company/flow/:id/replan`, `/cast`, `/cancel`, `/create` | Fill the blanks again / write the people (background; this is where the money goes) / stop / create the company (paused) |
| POST / GET | `/api/company/:id/run/:department/start`, `/brief`, `/close-out` | Start a room with the brief and checks written for it / read them / have each person write down what they remember |
| GET / POST / PATCH / DELETE | `/api/company/roster`, `/api/company/:id/people` | The library of invented people; who works at a company, their seats, and what each remembers (the owner can read, correct and delete it) |
| GET / POST / PUT / PATCH / DELETE | `/api/company/:id/hall/...` | The Hall: mailboxes, forums, the shared workspace, the board, working agreements (the owner reads everything and approves agreements) |

Operator settings: `COMPANY_FLOW=0` (off), `COMPANY_FLOW_MAX_PEOPLE` (32), `COMPANY_FLOW_MAX_SPEND_USD` (8), `COMPANY_HALL=0`, `COMPANY_MAX_MESSAGES`, `COMPANY_MAX_WORKSPACE_WRITES`, `COMPANY_OWNER_AUTH` (`off`, `key` or `google`; see below), `COMPANY_OWNER_SESSION_DAYS` (30), and for Google `COMPANY_GOOGLE_CLIENT_ID`, `COMPANY_GOOGLE_CLIENT_SECRET`, `COMPANY_PUBLIC_URL` and `COMPANY_OWNER_EMAILS`.

**Owner sign-in.** By default the owner of a company is whoever holds a visitor cookie: fine for one person in one browser, and a lost cookie leaves companies on disk that nobody can open. `COMPANY_OWNER_AUTH=key` makes the owner whoever has an owner key (made at the first start, `<data>/owner/owner.key`; only its hash is kept): for a machine you work on. `COMPANY_OWNER_AUTH=google` makes it a Google account from your list (`COMPANY_OWNER_EMAILS`), signed in by the server's own OAuth flow (`COMPANY_GOOGLE_CLIENT_ID`, `COMPANY_GOOGLE_CLIENT_SECRET`, `COMPANY_PUBLIC_URL`; it lets nobody in until all are set): for the website. Either way a session is an HttpOnly, SameSite=Strict cookie that lasts `COMPANY_OWNER_SESSION_DAYS` (30) and ends on sign-out, any browser that has signed in reaches the same companies, the others get 401, and a plain chat room still belongs to the visitor cookie. `npm run owner -- status | init [--owner-id <id>] | rotate | adopt --from <id> [--to <id> | --to-email <address>] [--apply]` brings existing data under the account (a dry run unless `--apply`, with a backup first; stop the server). Setup, the Google client, and limits: [OWNER_SIGN_IN.md](../docs/OWNER_SIGN_IN.md); design: [COMPANY_SAFETY_LAYER.md](../docs/COMPANY_SAFETY_LAYER.md).

## API Reference

### Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/models` | Model, deliberation and tool-tier options for the UI |
| POST | `/api/agents` | Create agent `{name, bio, model?, thinkingLevel?, tools?, voice?}` |
| PATCH | `/api/agents/:idOrName` | Update `{bio?, name?, model?, thinkingLevel?, tools?, voice?}` |
| DELETE | `/api/agents/:id` | Remove agent |

### Chat Control Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/stream` | SSE stream for real-time updates |
| GET | `/api/chat/state` | Current session state |
| GET | `/api/chat/history` | Message history |
| POST | `/api/chat/start` | Start chat `{goal, tokenLimit}` |
| POST | `/api/chat/stop` | Stop chat |
| POST | `/api/chat/pause` | Pause chat |
| POST | `/api/chat/resume` | Resume chat |
| POST | `/api/chat/inject` | Inject user message `{content, senderName}` |
| POST | `/api/chat/reset` | Reset everything |
| GET, POST | `/api/chat/done-when` | The checks the room must pass before it may end `{text}` or `{criteria}`, `maxBlocks?` |
| POST | `/api/chat/done-when/check` | Run the checks now |
| GET, POST | `/api/chat/critic` | The independent critic's settings |
| POST | `/api/chat/critic/score` | Score a picture now `{imageId, referenceId?, criteria?, post?}` |
| POST | `/api/chat/show` | Show the room pictures `{images: [{dataUrl}], caption?, sender?}` |
| POST | `/api/chat/render` | Render an artifact for the room `{artifact, draws?}` |
| POST | `/api/chat/render-result` | A browser's answer to a `render_request` |
| GET | `/api/chat/saved` | Saved sessions for this room (and whether saving is on) |
| GET | `/api/chat/saved/:id/download` | A saved session as a Studio session file |
| POST | `/api/chat/saved/:id/reopen` | Put a saved session back in the room |
| DELETE | `/api/chat/saved/:id`, `/api/chat/saved` | Delete one, or all |
| POST | `/api/chat/import` | Load a session file into the room |

### Speaking Order Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/speaking-order` | Get current settings |
| POST | `/api/chat/speaking-order` | Set mode `{mode}` |
| POST | `/api/chat/speaking-order/priority` | Set agent priority `{agentId, priority}` |

### Branching Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/branches` | List branch points |
| POST | `/api/chat/branches` | Create branch `{name}` |
| POST | `/api/chat/branches/:id/restore` | Restore branch |
| DELETE | `/api/chat/branches/:id` | Delete branch |
| PATCH | `/api/chat/branches/:id` | Rename branch `{name}` |
| POST | `/api/chat/rewind` | Rewind to message `{messageIndex}` |

### Media Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/media` | List all generated media |
| GET | `/api/chat/media/:id` | Get specific media item |
| GET | `/api/chat/media/export` | Get media for ZIP export |
| POST | `/api/chat/generate-image` | User image generation `{prompt, referenceIds}` |

## SSE Events

The `/api/chat/stream` endpoint emits these events:

| Event | Data | Description |
|-------|------|-------------|
| `connected` | `{message}` | Initial connection |
| `state` | State object | Current session state |
| `session_start` | `{goal, tokenLimit, agents}` | Chat started |
| `session_end` | `{reason, totalTokens, turnCount}` | Chat ended |
| `session_paused` | `{}` | Chat paused |
| `session_resumed` | `{}` | Chat resumed |
| `agent_start` | `{agentId, agentName, turnNumber}` | Agent speaking |
| `chunk` | `{agentId, text}` | Streaming text chunk |
| `agent_complete` | `{agentId, message, totalTokens}` | Agent finished |
| `message` | Message object | User message injected |
| `image_generating` | `{agentId, prompt}` | Image generation started |
| `image_generated` | `{agentId, imageId, prompt}` | Image completed |
| `tool_executing` | `{agentId, type, query}` | Tool in progress |
| `tool_result` | `{agentId, result}` | Tool completed |
| `branch_created` | `{id, name, messageIndex}` | Branch saved |
| `branch_restored` | `{id, name, messageCount}` | Branch restored |
| `speaking_order_changed` | `{mode}` | Speaking order updated |
| `session_restored` | `{source, archiveId, goal, mode, messageCount, agents}` | A saved session or a file was loaded |
| `done_check` | `{passed, results, blocks, attempted?, candidate?}` | The done-when checks ran |
| `critic_score` | `{imageId, referenceId, score, differs, minScore, below, source}` | The critic scored a picture |
| `render_request` | `{requestId, kind, filename, content, p5Code?, samples?}` | The server wants a browser to render an artifact |

## Agent Tool Syntax

Agents can use these tools in their responses:

```
[IMAGE: A futuristic cityscape at sunset with flying cars]
[REMIX: abc123-def456 | Make it more cyberpunk with neon lights]
[SEARCH: latest AI research papers 2024]
[URL: https://example.com/article]
[RESEARCH: quantum computing applications in medicine]
[CONSENSUS REACHED] - Signals conversation completion
[CRITIC: image-id | reference=sheet.png | criteria=same coat and braid]   (when the critic is on)
[RENDER: engine.json | draws=3]   (shows the room what an artifact looks like)
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Enter` | Start/Stop chat |
| `Ctrl/Cmd + S` | Save session |
| `Ctrl/Cmd + E` | Export as Markdown |
| `Ctrl/Cmd + K` | Open search |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Escape` | Close modals |

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `PORT` | Server port (default: 3001) | No |
| `CHATROOM_AUTOSAVE` | `1` saves conversations to disk even when hosted, `0` never (default: on locally, off when `SYNTH_HOSTED=1`) | No |
| `CHATROOM_AUTOSAVE_DAYS` | Days a saved session is kept (default 30; 0 keeps them) | No |
| `CHATROOM_DATA_DIR` | Where saved sessions go (default `chatroom/data`) | No |
| `SYNTH_KEEP_AWAKE` | `0` stops the server asking the OS not to sleep while a session runs | No |

### Agent Templates

Pre-built templates in `client/src/utils/agentTemplates.js`:
- **Tech Startup Panel**: CEO, CTO, CMO, CFO, Advisor
- **Creative Writers Room**: Novelist, Poet, Screenwriter, Editor
- **Custom**: Create your own agents

## Development

### Adding New Tools

1. Add parser in `server/services/tools.js`:
```javascript
export function parseToolRequests(text) {
  // Add pattern for your tool
  const myToolPattern = /\[MYTOOL:\s*(.+?)\]/gi;
  // ...
}
```

2. Add executor:
```javascript
async function executeMyTool(query) {
  // Implementation
  return { type: 'mytool', data: result };
}
```

3. Update system prompt in `server/services/gemini.js`

### Adding Speaking Order Modes

1. Add mode to `orchestrator.js`:
```javascript
setSpeakingOrder(mode) {
  const validModes = ['dynamic', 'round-robin', 'priority', 'random', 'mymode'];
  // ...
}
```

2. Implement selection method:
```javascript
selectMyMode() {
  // Your selection logic
  return selectedAgent;
}
```

3. Add to switch in `selectNextSpeaker()`

### Modifying System Prompts

Edit `server/services/gemini.js`:
- `buildSystemPrompt()` - Main agent instructions
- `buildConversationTranscript()` - How history is formatted

## Troubleshooting

### Empty Agent Responses
- Check Gemini API quota
- Verify API key permissions
- Check console for rate limiting

### Images Not Generating
- Ensure API key has image generation access
- Check for content policy violations in prompts

### SSE Connection Drops
- Browser may have idle timeout
- Check network stability
- Refresh page to reconnect

### Branching Not Working
- Pause chat before creating branches
- Check browser console for errors

## License

MIT License - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Acknowledgments

- Google Gemini API for AI capabilities
- React and Vite for frontend tooling
- Express.js for backend framework
