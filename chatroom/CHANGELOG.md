# Changelog

All notable changes to the Agent Chat Room project are documented in this file.

## [1.5.0] - 2026-09

Phase 3 of `MODERNIZATION_PLAN.md` — stateful chains and prompt ordering.
**Stateful mode is off by default.** Set `GEMINI_STORE_INTERACTIONS=true` to
opt in; it is a privacy trade, not a tuning knob.

### Added
- **Per-agent server-side chains.** With `GEMINI_STORE_INTERACTIONS=true`,
  each agent continues its own conversation via `previous_interaction_id` and
  a turn sends only the messages that agent has not seen — not the whole
  windowed transcript. This is the only route to implicit caching: explicit
  cache objects are a `generateContent` feature and are unavailable here.
  - `buildDeltaPrompt` renders just the new messages. When a chain is active
    the lossy sliding-window summariser is bypassed entirely — the server
    holds the real history rather than an 80-character-per-message gist.
  - Tool turns chain too: in stateful mode a function-result round sends only
    the results instead of echoing the whole step history, which is where the
    Phase 2 inline result images stop being re-paid for every round.
  - Only a `completed` interaction is chainable; chaining from one still
    in progress is a documented 400, so a truncated or failed turn drops the
    chain and the next turn re-sends the full transcript.
- **Chain cleanup.** `reset()`, `start()`, branch restore, rewind, and agent
  removal all delete the affected stored interactions via
  `interactions.delete()`. Resetting the room has to mean something even when
  the history lives on Google's side.
- `stateful` is exposed on session state so the UI can say which mode it is in.
- `tests/stateful-session.test.js` (13 tests, 69 total) covering the stateless
  default, delta prompts, chainability rules, and cleanup.

### Changed
- **System prompt reordered stable-first** (unconditional, both tool modes):
  room-shared tool documentation, presets and templates now precede the
  per-agent persona, which precedes the volatile artifact state. Previously
  the persona led, so five agents produced five prompts that diverged at
  roughly byte 40 and shared no cacheable prefix.
- `renderMessages` extracted so the full-transcript and delta prompts cannot
  drift apart.

### Measured, and a correction to the plan
`MODERNIZATION_PLAN.md` §3.3 implied the reordering would be enough to reach
the caching threshold. Measured on this machine, it is not:

| | shared prefix |
|---|---|
| tag mode, Synthograsizer backend down | ~338 tokens |
| tag mode, backend up (SYNTH tools + presets + templates) | ~2,518 tokens |
| function mode (tag vocabulary suppressed) | ~62 tokens |

Implicit caching needs **4,096** tokens on the 3.x Flash line, so reordering
alone does not cross it. The threshold is crossed by the accumulated chain
history once `previous_interaction_id` is on — which makes chaining, not
reordering, the thing that actually buys the caching. Reordering is still
worth having (it is free, and it is a precondition), but on its own it buys
nothing. `usage.total_cached_tokens` in the token meter is the instrument;
it should be non-zero in stateful mode and will stay at zero without it.

## [1.4.0] - 2026-09

Phase 2 of `MODERNIZATION_PLAN.md` — real function calling, behind a flag.
**Off by default.** Set `TOOL_MODE=functions` to opt in; `tags` remains the
default until the new path has been exercised against the live API.

### Added
- **Function-calling tool layer.** Agents emit `function_call` steps; the
  server executes them mid-turn and hands back `function_result` blocks, so an
  agent reacts to what actually happened *inside its own message*. Under the
  tag path a tool result only ever reached the NEXT speaker as transcript
  text — that one-turn lag is the thing Phase 2 exists to remove.
  - Generated images are returned to the model as image content, not just an
    ID. An agent can now critique the picture it made rather than the prompt
    it wrote. Capped per turn by `MAX_INLINE_RESULT_IMAGES`.
  - Continuation is **stateless**: prior steps are echoed back in `input` as a
    Step array, so `store` stays `false` and the privacy posture is unchanged.
    Echoing the model's own thought steps verbatim is what preserves thought
    signatures across a tool round.
  - `tool_choice: 'validated'` is set whenever tools are present — the API
    does not support `auto` for built-ins combined with custom functions.
- `server/config/tools.js` — `TOOL_MODE`, round/call caps, and tool tiers.
  Tools are handed out per agent role (`none`/`research`/`visual`/`builder`/
  `full`) rather than all at once, per Google's 10–20 active tool guidance.
  Agents carry a `tools` tier, settable via the agents API and the setup form.
- `server/services/toolDefinitions.js` — JSON-Schema declarations for
  `generate_image`, `compose_image`, `write_artifact`, plus the `google_search`
  and `url_context` built-ins.
- `server/services/toolDispatch.js` — executes calls and owns the app-side
  consequences (media storage, broadcasts, vision window). Tool failures are
  reported *to the model* with `is_error`, so an agent that knows generation
  failed can say so instead of inventing success. A bad `compose_image` ID
  comes back with the real recent IDs attached so the model can retry.
- `tests/function-calling.test.js` (15 tests) and three tool fixtures,
  covering the round trip, the stateless echo, argument assembly from
  `arguments_delta` when `interaction.completed` omits `steps`, usage across
  rounds, and both runaway caps.

### Changed
- In function mode the bracket-tag vocabulary is suppressed from the system
  prompt and the tag parsers are fed an empty string. Teaching both dialects
  at once invites the model to mix them, and it stops a legitimate
  `[bracketed aside]` being eaten by a parser.
- `detectArtifactHallucination` counts a successful `write_artifact` call as
  having saved, so real tool-based edits are no longer flagged as phantom.
- Messages carry `toolCalls`; the transcript renders them for later speakers
  and `ChatMessage` shows them as chips.

### Known limitations
- Text truncation inside a tool turn is not chased with a continuation prompt
  the way the tag path does it — the turn ends with `wasTruncated` set.
- The SYNTH_*/workflow family is still tag-only. It is the largest part of the
  inventory and depends on the Python backend; it moves in a later slice.

## [1.3.0] - 2026-09

Phase 1 of `MODERNIZATION_PLAN.md` — the test safety net that has to exist
before the Phase 2 tool-layer rewrite.

### Added
- **Stream-parser regression suite** (`npm test`, via `node --test` — no new
  dependency). `tests/gemini-stream.test.js` replays recorded Interactions SSE
  sequences from `tests/fixtures/` through `generateAgentResponse` and pins the
  event contract the orchestrator consumes: chunk ordering, thought-leak
  filtering, usage mapping and summation, truncation/continuation (including
  the give-up boundary), name-prefix cleanup, both error paths, and the
  retry-without-thinking / retry-without-PDF fallbacks.
- `tests/agent-config.test.js` — model registry invariants (notably: no
  retired `-image-preview` alias can creep back in, and image *understanding*
  can't be pointed at an image *generation* model), model/thinking-level
  precedence, and the orchestrator's usage accumulator.
- `initializeGemini(apiKey, client?)` takes an optional pre-built client, so
  tests can inject a fake instead of reaching the network.

### Fixed
- **Thought filtering leaked past the end of a thought step.** `currentStepType`
  was set on `step.start` but never cleared, so a text delta arriving after
  `step.stop` and before the next `step.start` was still classified as
  reasoning and silently dropped — losing part of the agent's actual reply.
  Now cleared on `step.stop`.
- One more retired image model: `workflow-engine/synthClient.js` hard-coded
  `gemini-3.1-flash-image-preview` in `generateImage()`, which is the path the
  chat room's `[IMAGE:]` tag actually takes. Now defaults to the GA
  `gemini-3.1-flash-image` and accepts an `options.model` override.

## [1.2.0] - 2026-09

Phase 0 of `MODERNIZATION_PLAN.md` — model hygiene and honest cost reporting.
No architectural change; the tag-parsing tool layer is untouched.

### Added
- `server/config/models.js` — single source of truth for model IDs, the
  per-agent model choices, thinking levels, and output caps. Model IDs were
  previously hard-coded across `gemini.js`, `tools.js` and `imageGen.js`.
- **Per-agent model and deliberation level.** Agents carry `model` and
  `thinkingLevel`; both are settable on `POST /api/agents` and
  `PATCH /api/agents/:idOrName`, and selectable in the add-agent form.
  `GET /api/agents/models` serves the available options.
- **Real token accounting.** `interaction.usage` (input / output / thought /
  cached / tool-use) is now captured per turn, accumulated per run, exposed on
  session state and `agent_complete`, and broken out in the token meter.
  Cached-token share is shown so caching work has a baseline to measure.

### Changed
- Default agent model is now `gemini-3.8-flash` (was `gemini-3.1-pro-preview`):
  $0.75/$3.75 per 1M vs $2.00/$12.00, for turns that are mostly conversational.
  3.1 Pro remains available as an opt-in per-agent tier.
- Tool model (search / URL context) dropped to `gemini-3.5-flash-lite` — its
  only job is running a grounded call and summarising the result.
- `analyzeImage` now uses `gemini-3.8-flash`. It was pointed at Nano Banana
  Pro, an image-*output* model, and reading `output_text` off it.
- `thinking_level` is now set explicitly (default `low`) instead of inheriting
  each model's default of `medium`. Thinking bills as output.
- `max_output_tokens` raised 8192 → 16384. The cap covers thinking *and*
  output combined, and thinking is spent first, so the old value was
  truncating ordinary turns into the continuation path.
- Token meter now labels the budget counter "Generated" and shows the real
  usage breakdown beneath it. The budget still counts produced tokens only, so
  existing `tokenLimit` values keep their calibration.

### Fixed
- Retired image model IDs. `gemini-3.1-flash-image-preview` and
  `gemini-3-pro-image-preview` had a published shutdown date of 2026-06-25 and
  were still pinned in `backend/config.py`, `backend/services/image_gen.py`
  (as a function default), `chatroom/server/services/imageGen.js`, and the
  `scripts/film_factory/costs.py` rate table — where a stale key silently fell
  through to the default estimate. All now use the GA IDs.

## [1.1.0] - 2026-07

### Changed
- **Migrated to the Gemini Interactions API** (`@google/genai` ^2.3.0, replacing
  the deprecated `@google/generative-ai` 0.21). All server calls
  (`gemini.js`, `tools.js`, `imageGen.js`) now use `interactions.create`.
- Every call is stateless (`store: false`) — no server-side retention at Google.
- Truncation detection now keys on `interaction.status === 'incomplete'`
  (was `finishReason === 'MAX_TOKENS'`); auto-continuation behavior unchanged.
- Search/URL tools declare `{ type: 'google_search' }` / `{ type: 'url_context' }`;
  source extraction reads inline `url_citation` annotations (replacing
  `groundingMetadata`). Tool model is now plain `gemini-3.1-pro-preview`.
- PDFs attach as Interactions `document` blocks; thinking summaries are
  filtered from the streamed chat output.

## [1.0.0] - 2025-02

### Added

#### Core Features
- Multi-agent conversation system with autonomous turn-taking
- Real-time message streaming via Server-Sent Events (SSE)
- Agent creation with customizable names and biographies
- Shared goal system to guide conversations
- Token counting and configurable limits
- Automatic consensus detection and conversation completion

#### Agent Capabilities
- **Image Generation**: `[IMAGE: prompt]` syntax using Gemini Image Pro
- **Image Remixing**: `[REMIX: imageId | changes]` for iterating on images
- **Web Search**: `[SEARCH: query]` for real-time information
- **URL Analysis**: `[URL: url]` for webpage content extraction
- **Research Mode**: `[RESEARCH: topic]` for deep multi-source research

#### Speaking Order System
- **Dynamic Mode**: AI-driven selection based on context and expertise
- **Round-Robin Mode**: Fixed turn order for all agents
- **Priority Mode**: Weighted selection with per-agent priority settings
- **Random Mode**: Random speaker selection

#### Chat Branching
- Create named branch points to save conversation state
- Restore branches to explore alternative directions
- Rewind conversation to any message index
- Delete and rename branch points
- Full state preservation (messages, agents, settings)

#### User Interface
- React-based frontend with Vite build system
- Dark and light theme support with persistence
- Collapsible left sidebar for agent management
- Collapsible right sidebar for settings panel
- Real-time token meter and turn counter
- Goal header display
- Message search with full-text matching

#### Export & Import
- Export as Markdown with metadata
- Export as JSON for full data preservation
- Save/load conversation sessions to localStorage
- Download all generated media as ZIP file
- Agent template system (Tech Startup, Creative Writers)

#### Quality of Life
- Keyboard shortcuts for common actions
- User message injection during conversations
- Pause/resume functionality
- Automatic scroll to latest messages
- Image modal with zoom and download options
- RemixModal for user-initiated image generation

### Technical Details

#### Backend Stack
- Node.js with Express.js
- Google Generative AI SDK (@google/generative-ai)
- UUID for unique identifiers
- CORS for cross-origin support
- dotenv for environment configuration

#### Frontend Stack
- React 18 with functional components and hooks
- Vite for fast development and building
- JSZip for client-side ZIP creation
- CSS Variables for theming
- Custom hooks (useEventSource, useTheme, useKeyboardShortcuts)

#### API Endpoints
- `/api/agents` - Agent CRUD operations
- `/api/chat/stream` - SSE endpoint for real-time updates
- `/api/chat/start|stop|pause|resume` - Conversation control
- `/api/chat/inject` - User message injection
- `/api/chat/speaking-order` - Speaking order configuration
- `/api/chat/branches` - Branch point management
- `/api/chat/media` - Generated media access

### Known Issues
- Empty message responses may occasionally occur with API rate limiting
- Large conversations may experience performance degradation
- Branch restoration while conversation is running may cause issues

### Dependencies
```json
{
  "@google/generative-ai": "^0.21.0",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.21.0",
  "uuid": "^10.0.0",
  "concurrently": "^9.0.1" (dev)
}
```

---

## Development Notes

### Architecture Decisions

1. **Singleton Orchestrator**: Chosen for simplicity in single-server deployment. For scaling, this would need to be refactored to use shared state.

2. **SSE over WebSocket**: SSE was chosen because the primary data flow is server-to-client. WebSocket would add complexity for bidirectional communication that isn't needed.

3. **In-Memory Storage**: For rapid development. Production deployment should migrate to persistent storage.

4. **Generator Functions**: Used for streaming responses to minimize memory usage with large conversations.

### Future Roadmap

- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] User authentication and sessions
- [ ] Video generation support
- [ ] Agent-to-agent private messaging
- [ ] Conversation analytics dashboard
- [ ] Plugin system for custom tools
- [ ] Multi-room support
- [ ] Webhook integrations

### Contributing

See README.md for contribution guidelines.
