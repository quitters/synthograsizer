# Chat Room — Gemini API Modernization Plan

_Written 2026-09-11. Audited against `@google/genai` 2.10.0 (installed) and the live docs at
https://ai.google.dev/gemini-api/docs._

---

## 0. Status correction: the chat room is already on the Interactions API

The brief for this plan was "the chat room was built on a much older version of the Gemini API."
That is no longer true. Commit `d0c8cfd` (2026-07-02, _"feat(chatroom): full pivot to the Gemini
Interactions API"_) moved the three server services off `generateContent`:

| File | Surface used today |
|---|---|
| `server/services/gemini.js:483` | `genAI.interactions.create({ ..., stream: true, store: false })` |
| `server/services/tools.js:26` | `genAI.interactions.create({ tools: [{type:'google_search'}, {type:'url_context'}] })` |
| `server/services/imageGen.js:68` | `genAI.interactions.create({ input: [{type:'image'...}] })` |

I verified the request/response shapes against the installed SDK's type definitions and against the
published breaking-changes list, and the code is on the **current** schema, not the pre-May-2026 one:

- Snake-case top-level fields (`system_instruction`, `generation_config`, `response_format`) —
  matches `CreateModelInteraction` in `node_modules/@google/genai/dist/genai.d.ts:2374`.
- Streaming events are `step.start` / `step.delta` / `interaction.completed` — these are the
  post-May-2026 names (the old ones were `content.start` / `content.delta` / `interaction.complete`).
- Grounding sources are read from inline `url_citation` annotations, not the retired
  `groundingMetadata` blob.
- Truncation is keyed on `status === 'incomplete'`, the Interactions equivalent of `MAX_TOKENS`.

**So this is not a "migrate off the old API" job.** The real work is three different things, and
it's worth being precise about them because they have very different costs:

1. **Stale constants** — model IDs that have since gone stable or been superseded, and a token
   meter that was always an approximation and no longer needs to be (§1). Hours.
2. **An architecture that predates function calling** — every tool in the room is a regex over the
   model's prose. This is the single largest source of the room's known failure modes (§2). Days.
3. **Capabilities that did not exist when this was designed** — File Search, code execution,
   multi-speaker TTS, Deep Research, managed agents, structured output (§4). Weeks, à la carte.

---

## 1. Stale constants and cheap corrections

> **Status: done (2026-09-11).** Everything in §1 has shipped — see CHANGELOG 1.2.0.
> The tables below are kept as the record of what was wrong and why it changed.
> One deviation from the plan as written: the Python backend's flash models
> (`MODEL_FAST`, `MODEL_TEMPLATE_GEN_FAST`, `MODEL_DEMO`) were also moved from
> `gemini-3.6-flash` to `gemini-3.8-flash`, which this section had left alone.

### 1.1 Model IDs

The suite pins `gemini-3.1-pro-preview` for text and `gemini-3-pro-image-preview` for image work.
Current state of the model catalogue:

| Where | Pinned now | Status today | Recommendation |
|---|---|---|---|
| `chatroom/server/services/gemini.js:7` | `gemini-3.1-pro-preview` | Still exists, still **preview** | Keep as the "smart" tier; add a Flash default |
| `chatroom/server/services/tools.js:13` | `gemini-3.1-pro-preview` | ditto | Drop to `gemini-3.5-flash-lite` — this model only reformats search results |
| `chatroom/server/services/imageGen.js:5` | `gemini-3-pro-image-preview` | Superseded; stable is `gemini-3-pro-image` | See 1.2 — this one is also the *wrong kind of model* |
| `backend/config.py:47` | `gemini-3.1-flash-image-preview` | Now GA as `gemini-3.1-flash-image` | Rename |
| `backend/config.py:48` | `gemini-3-pro-image-preview` | Now GA as `gemini-3-pro-image` | Rename |

The stable text line has moved well past 3.1: `gemini-3.8-flash`, `gemini-3.7-flash`,
`gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite` are all GA. Pricing per 1M tokens
(paid tier, promotional rates through 2026-12-31):

| Model | Input | Output |
|---|---|---|
| `gemini-3.1-pro-preview` | $2.00 (≤200k) / $4.00 | $12.00 / $18.00 |
| `gemini-3.8-flash` | $0.75 | $3.75 |
| `gemini-3.5-flash-lite` | $0.30 | $2.50 |

A five-agent room running 40 turns on 3.1 Pro costs roughly **5× the same room on 3.8 Flash**. The
room is mostly conversational turn-taking; it does not need Pro for every speaker.

**Action:** introduce a per-agent `model` field (the agent schema already carries `bio`, `color`,
`avatar` — this sits next to them), defaulting to `gemini-3.8-flash`, with `gemini-3.1-pro-preview`
opt-in for a designated "architect"/"critic" persona. `chat.js` already accepts a session-level
`model` override, so this is a widening of an existing concept, not a new one.

**Also:** the chat room hard-codes model IDs in three files while the Python side centralises them
in `backend/config.py`. Add `chatroom/server/config/models.js` and import from it everywhere. Preview
model churn is the reason — 3.1 Pro is still preview and will be renamed when it goes GA.

### 1.2 `analyzeImage` is calling an image-*generation* model

`imageGen.js:68` sends an image and a text question to `gemini-3-pro-image-preview` and reads
`output_text`. Nano Banana Pro is an image *output* model; image *understanding* is a job for a
standard multimodal text model. Point `analyzeImage` at `gemini-3.8-flash` — cheaper, faster, and
actually the documented path for image understanding.

### 1.3 The token meter is guessing, and it's guessing the wrong half

`server/utils/tokenCounter.js` is `Math.ceil(text.length / 4)`. Two problems:

- It only ever measures **output** text. The orchestrator's `tokenLimit` budget (default 100k) is
  therefore blind to input cost, which in this app is the dominant term — see §3.
- The real numbers are now returned on every response. `interaction.usage` carries
  `total_input_tokens`, `total_output_tokens`, `total_thought_tokens`, `total_cached_tokens`,
  `total_tool_use_tokens`, `total_tokens`.

**Action:** have `generateAgentResponse` yield `finalInteraction.usage` on its `complete` event and
accumulate real usage in the orchestrator. `TokenMeter.jsx` gains an honest breakdown, and
`total_cached_tokens` becomes the instrument you need for §3. Keep `countTokens()` only for
pre-flight estimates.

### 1.4 Thinking is on by default and nobody asked for it

No `thinking_level` is set anywhere, so every turn runs at each model's default (medium for the
3.x Flash line) and bills thinking tokens for small talk. `generation_config` accepts:

```js
generation_config: {
  temperature: 1.0,
  thinking_level: 'low',          // 'minimal' | 'low' | 'medium' | 'high'
  thinking_summaries: 'auto',     // optional: surfaces reasoning as thought steps
  max_output_tokens: 8192,
}
```

**Action:** `thinking_level: 'low'` as the room default, `'high'` for agents flagged as
analytical. Expose it in `AgentSetup.jsx` as a three-position "deliberation" control.

While you're there: `max_output_tokens: 8192` is a **hard cap on thinking + output combined**. Part
of the truncation-and-continuation machinery in `gemini.js` (`MAX_CONTINUATION_ATTEMPTS`, the
`status === 'incomplete'` loop) is self-inflicted by a budget that thinking eats into first. Raising
the cap and lowering `thinking_level` should make that loop fire much less often.

### 1.5 Thought summaries are being thrown away

`gemini.js` correctly guards against leaking thought text into the transcript
(`currentStepType !== 'thought'`). With `thinking_summaries: 'auto'` those steps become a feature
rather than a hazard: route them to a collapsible "reasoning" disclosure under the message instead
of dropping them. The delta types to watch for are `thought_summary` and `thought_signature`.

---

## 2. The main event: retire tag-parsing in favour of function calling

> **Status: shipped behind `TOOL_MODE=functions`, off by default (2026-09-11).**
> The media slice is done — `generate_image`, `compose_image`, `write_artifact`,
> plus the `google_search` / `url_context` built-ins. The SYNTH_*/workflow
> family is still tag-only.
>
> Two things the plan under-specified, resolved during implementation:
> - **The continuation is stateless.** `previous_interaction_id` would have
>   meant `store: true`, which is the §3 decision and not Phase 2's to make.
>   The documented stateless path — echoing prior steps back in `input` as a
>   Step array — keeps `store: false` and carries thought signatures, at the
>   cost of re-sending the history each round. §3 can swap it.
> - **Tool results can carry images.** `function_result.result` accepts image
>   content, so the generated image goes back to the model, not just its ID.
>   That is a bigger win than the plan claimed: the agent critiques the actual
>   picture. It is also the main cost of the stateless echo, hence the
>   `MAX_INLINE_RESULT_IMAGES` cap.
>
> Not yet validated against the live API — no key was available. Everything
> below is the design record.

### 2.1 What the room does now

Every tool in the chat room is a **regex over the model's prose, executed after the turn is over**:

```
agent writes "[IMAGE: a fox in snow]"
  → orchestrator.js:1005  parseImageRequests(fullResponse)
  → generateImage(...)
  → stripImageTags(fullResponse)          // scrub the tag out of the displayed text
  → result is described in the NEXT turn's transcript for the NEXT agent
```

There are eight parser families doing this: `parseImageRequests`, `parseRemixRequests`,
`parseToolRequests`, `parseSynthRequests`, `parseWorkflowRequests`, `parseSynthStyleRequests`,
`parseWorkflowTemplateRequests`, `parseArtifactTags`. Plus `detectArtifactHallucination()` at
`orchestrator.js:1759`, which exists solely because agents describe code changes in prose instead of
emitting the tag, and the system prompt has to shout about it in all-caps.

The failure modes this causes are all visible in the code as workarounds:

| Symptom | Workaround in the codebase |
|---|---|
| Agent narrates a code change instead of emitting `[ARTIFACT:]` | `detectArtifactHallucination()`, plus a 6-line all-caps warning in the prompt |
| Agent pastes an image UUID into an `[IMAGE:]` prompt as prose | A dedicated "CRITICAL — referencing prior images" prompt section |
| Agent emits malformed workflow JSON | `workflow_parse_error` broadcast path |
| Agent can't see whether its own tool call worked | `pendingWorkflowOutcomes` / `_drainWorkflowOutcomes()`, which injects last turn's results as a `[SYSTEM NOTE]` |
| Tool syntax must be taught in-prompt | ~2.5k tokens of static tag documentation resent to every agent on every turn |

The last two are the substantive ones. **An agent cannot see the result of its own tool call within
its own turn.** It generates, the server executes afterwards, and the outcome reaches the *next*
speaker as transcript text. That is the pre-function-calling world, and it is what "built on a much
older version of the API" actually means here.

### 2.2 What it becomes

The Interactions API surfaces tool calls as first-class steps. The loop is:

```js
// 1. declare tools alongside the turn
let interaction = await genAI.interactions.create({
  model, system_instruction, input: blocks, stream: true, store: false,
  tools: toolsForAgent(agent),
  generation_config: { tool_choice: 'validated', thinking_level: 'low' },
});

// 2. the model emits function_call steps; status becomes 'requires_action'
for (const step of interaction.steps) {
  if (step.type !== 'function_call') continue;
  const result = await dispatch(step.name, step.arguments);

  // 3. feed the result back — the SAME turn continues
  interaction = await genAI.interactions.create({
    model,
    previous_interaction_id: interaction.id,
    input: [{
      type: 'function_result',
      call_id: step.id,
      name: step.name,
      result: [{ type: 'text', text: JSON.stringify(result) }],
    }],
  });
}
```

Consequences, in order of how much they matter:

1. **Agents react to real results, in-turn.** "I generated it, and it came out too dark — let me
   compose from it" becomes possible in one message. `pendingWorkflowOutcomes` stops being the only
   feedback channel.
2. **Arguments are schema-validated by the API.** `parseWorkflowRequests` hand-parses a JSON blob
   out of a bracket tag; a `submit_workflow` function declaration with a real JSON Schema for
   `steps[]` makes malformed workflows a model-side constraint instead of a runtime error path.
3. **Image IDs stop being prose.** `compose_image(reference_ids: string[], prompt: string)` has a
   typed array parameter. The entire "NEVER paste an image ID into a prompt" prompt section deletes.
4. **The tag documentation leaves the system prompt.** Tool schemas are sent as `tools`, which the
   API bills separately (`total_tool_use_tokens`) and — importantly — which you can vary per agent
   without rewriting the persona prompt.
5. **No more tag stripping.** `stripImageTags` / `stripToolTags` / `stripSynthTags` /
   `stripWorkflowTags` / `stripArtifactTags` all disappear, along with the class of bug where a
   legitimate `[bracketed aside]` in an agent's writing gets eaten by a parser.

### 2.3 Tool inventory: tag → declaration

| Today's tag | Becomes | Notes |
|---|---|---|
| `[IMAGE:]`, `[GENERATE_IMAGE:]`, `[CREATE_IMAGE:]`, `[VISUALIZE:]` | `function generate_image(prompt, aspect_ratio?)` | Four aliases collapse to one declaration |
| `[COMPOSE_FROM:]`, `[REMIX:]`, `[ITERATE:]`, `[VARIATION:]`, `[INCLUDE_IMAGE:]` | `function compose_image(reference_ids: string[], prompt)` | Five aliases → one; typed ID array |
| `[SEARCH:]`, `[WEB_SEARCH:]`, `[GOOGLE:]` | built-in `{ type: 'google_search' }` | Already used inside `tools.js`; hoist it to the agent turn so the agent grounds *itself* |
| `[ANALYZE_URL:]`, `[URL:]`, `[FETCH:]`, `[READ_URL:]` | built-in `{ type: 'url_context' }` | Keep `assertPlausiblePublicUrl` as defence-in-depth on anything you log |
| `[RESEARCH:]`, `[DEEP_SEARCH:]` | Deep Research agent — see §4.5 | Currently just search+url in one call; the real agent is a different tier |
| `[SYNTH_IMAGE:]` … `[SYNTH_ANALYZE:]` | `function synth_*(...)` per verb | Pipe-separated `key=value` parsing dies; these become typed params |
| `[SYNTH_STYLE:]` | `function generate_styled_image(subject, style_id)` | `style_id` becomes an `enum` in the schema, populated from `getCategories()` — the model can no longer invent a preset name |
| `[WORKFLOW_TEMPLATE:]` | `function run_workflow_template(template_id, params)` | `template_id` likewise an enum |
| `[WORKFLOW:]`, `[WORKFLOW_STATUS:]`, `[WORKFLOW_CANCEL:]` | `function submit_workflow(definition)` + two more | Schema'd `definition`; kills `workflow_parse_error` |
| `[ARTIFACT: f]…[/ARTIFACT]` | `function write_artifact(filename, content, summary)` | Deletes `detectArtifactHallucination` and `stripCodeFences` |
| `[CONSENSUS REACHED]` | `function signal_consensus(reason)` | See §4.4 — structured, not string-matched |

Two constraints from the docs to design around:

- **Tool count.** Google's guidance is 10–20 active tools maximum. The list above is ~18 if you
  ship everything at once, and that's before `google_search` + `url_context` + `file_search`. So
  **tier the tools per agent role** rather than handing every persona the full arsenal. A "writer"
  persona gets `generate_image`, `compose_image`, `google_search`. A "builder" gets
  `write_artifact`, `code_execution`. This also lets you drop `buildSystemPrompt`'s
  `synthAvailable` branch — availability becomes a matter of which declarations you include.
- **`tool_choice` must be `validated`.** When built-in tools are combined with custom function
  declarations, `auto` mode is not supported; `validated` is required, and only Gemini 3 models
  support the combination at all. (`ToolChoiceType` in the SDK: `"auto" | "any" | "none" | "validated"`.)

### 2.4 Migration safety

- Keep every `parse*` / `strip*` function behind a `TOOL_MODE=tags|functions` env flag for one
  release. They are also needed to replay saved sessions from `data/`, whose transcripts contain
  raw tags.
- ~~There is currently **no test coverage for `gemini.js`**.~~ **Done (Phase 1, CHANGELOG 1.3.0).**
  `npm test` replays recorded SSE fixtures through `generateAgentResponse`. Extend
  `tests/fixtures/` with a `function_call` / `function_result` sequence as the first step of
  Phase 2 — write the fixture before the dispatcher, so the new event handling has a target to
  satisfy. The existing suite is the regression net for everything the rewrite must *not* change.
- **Thought signatures.** Gemini 3 returns an encrypted `signature` on thought steps, and the
  tool-context `id`/`signature` fields on tool steps are what preserve reasoning continuity across
  a function-call round trip. The SDK handles these automatically **when you chain with
  `previous_interaction_id`**. If you stay fully stateless you must echo the prior steps back
  yourself, signatures intact. This is a strong argument for §3.

---

## 3. Stateful interactions and caching (the cost story)

### 3.1 What it costs today

Every turn, for every agent, the server sends:

- the full system prompt — persona + ~2.5k tokens of static tool documentation + the style preset
  list + the workflow template list, **plus the complete current content of every shared artifact**
  (`gemini.js`, `CURRENT ARTIFACT STATE`), and
- the conversation transcript (last 15 messages verbatim, older ones crudely summarised by taking
  the first 80 characters of each), and
- on early turns, every uploaded session file as inline base64.

With `store: false` there is no server-side state, so none of that is ever cached. In a five-agent,
forty-turn room with a 400-line `sketch.js` in play, the artifact alone is re-sent ~200 times.

### 3.2 What's available

Interactions supports **implicit caching only** — explicit cache objects are a `generateContent`
feature and are not available here. Implicit caching keys off `previous_interaction_id` in stateful
conversations. Minimum prefix to be cacheable: **4,096 tokens** for the 3.x Flash line and 3.1 Pro.
Cached input on 3.8/3.7 Flash bills at $0.075/1M vs $0.75/1M — a 10× reduction on the cached
portion. You can confirm hits by reading `usage.total_cached_tokens`.

### 3.3 The design problem, and the shape of the answer

A chat room is N agents sharing **one** transcript, but `previous_interaction_id` chains are
**per-conversation**. The natural mapping is one chain per agent:

```
orchestrator.agentChains = { [agentId]: lastInteractionId }

// agent's turn:
create({
  model, tools, system_instruction,          // re-sent every turn — these are interaction-scoped
  previous_interaction_id: agentChains[agent.id],
  input: messagesSince(agent.lastSpokeAt),   // only what's new to THIS agent
})
```

Each agent's chain accumulates its own history server-side; you send only the deltas — the other
agents' messages since that agent last spoke. This is strictly less data than today and the cached
prefix grows monotonically.

Note the scoping rule from the docs: **only conversation history persists across a chain.** `tools`,
`system_instruction`, and `generation_config` are interaction-scoped and must be re-sent every turn
regardless. So the system prompt is not saved by chaining — but it *is* the stable prefix that
caching rewards, which leads to:

> **Measured 2026-09-12 — this section was too optimistic.** After reordering, the prefix
> genuinely shared across agents is **~2,518 tokens** with the Synthograsizer backend up
> (~338 with it down, ~62 in function mode where the tag vocabulary is suppressed). The
> implicit-caching minimum is **4,096**, so reordering *on its own does not reach it*.
> What crosses the threshold is the accumulated chain history once
> `previous_interaction_id` is on. Reordering is free and a precondition, but chaining is
> the thing that buys the caching. Watch `usage.total_cached_tokens` to confirm.

**Prompt reordering (do this regardless of which state model you pick).** Put the invariant material
first and the volatile material last:

```
[stable]   tool docs → style presets → workflow templates → agent persona → goal
[volatile] artifact state → transcript → generated-image context
```

Today `buildSystemPrompt` appends artifact contents *after* the stable block, which is correct
ordering already; the transcript and image blocks are separate `input` parts, also fine. The main
reordering win is moving the per-agent persona *after* the shared tool documentation, so all five
agents share one cacheable prefix instead of five near-identical ones that diverge at byte 40.

### 3.4 The `store` decision is yours to make, and it's a privacy decision

`chatroom/.env.example` currently advertises `store=false` — _"nothing is retained server-side at
Google"_ — as a feature. Stateful chaining means `store=true`, which means Google retains the
interaction for **55 days on the paid tier / 1 day on free** (configurable to 7/14/28/55 in AI
Studio), deletable via `interactions.delete(id)`.

I'd recommend making it a config switch rather than a silent change:

```
# GEMINI_STORE_INTERACTIONS=false   # stateless, no caching, nothing retained at Google
# GEMINI_STORE_INTERACTIONS=true    # server-side chaining + implicit caching; 55-day retention
```

…with `orchestrator.reset()` firing `interactions.delete()` over the session's chain IDs when
stateful mode is on, so "reset the room" still means something. Default: ship `false` to match the
existing promise, and let the operator opt in. But if the room is used heavily, `true` is where the
cost savings live, and it's a material difference.

### 3.5 What this deletes

- The sliding-window summariser in `buildConversationPrompt` (the "first 80 characters of each older
  message" approach is lossy in a way that visibly degrades long sessions).
- Most of the `MAX_CONTINUATION_ATTEMPTS` truncation machinery.
- The `includeMedia = messages.length <= 2` heuristic and its "reference file(s) were provided at
  session start" reminder hack.

---

## 4. New capabilities worth adding

Ranked by (impact ÷ effort) for this specific app.

### 4.1 File Search — session media and cross-session memory  ★ highest value

> **Status: session media shipped behind `FILE_SEARCH=true` (2026-09-12), see
> CHANGELOG 1.6.0. Cross-session memory deliberately NOT built** — it changes what
> a "session" means in the product, which is open question 4 below and yours to answer.
> The store plumbing it would need (create / index / destroy / orphan-sweep) is already
> in `server/services/fileSearch.js`, so it is a small addition once you decide.
>
> One design note from implementation: images stay inline rather than being indexed.
> File Search would hand back retrieved *text about* a reference image, and an agent
> asked to critique one needs to see it.

The room currently handles uploaded files by base64-inlining images/PDFs and pasting the first 5,000
characters of text files into turn one, then never again. File Search replaces that with real RAG:

```js
const store = await ai.fileSearchStores.create({
  config: { displayName: `chatroom-${sessionId}`, embeddingModel: 'models/gemini-embedding-2' }
});
await ai.fileSearchStores.uploadToFileSearchStore({
  file: path, fileSearchStoreName: store.name,
  config: { chunkingConfig: { whiteSpaceConfig: { maxTokensPerChunk: 200, maxOverlapTokens: 20 } } }
});

// then, per agent turn:
tools: [{ type: 'file_search', file_search_store_names: [store.name], top_k: 5 }]
```

Why it fits here:

- **It removes the base64 round-trip entirely** for reference material — the exact pattern worth
  avoiding. Files go up once; turns carry retrieved chunks, not whole documents.
- 100 MB per document, 1 GB free tier / 10 GB tier 1. Indexing bills at embedding rates
  ($0.20/1M text), storage is free, query embeddings are free, retrieved chunks bill as normal
  context. For a room with a 40-page PDF, this is dramatically cheaper than inlining.
- Citations come back as annotations on the text block — same shape the search path already parses
  in `extractSources()`, including page numbers for PDFs.
- **The bigger idea: persistent room memory.** `MemoryViewer.jsx` and
  `orchestrator.buildMemoryItems()` currently reconstruct "memory" by string-slicing the transcript.
  Index each finished session's transcript into a long-lived store and give returning agents a
  `file_search` tool over it. That turns the agent studio from per-session to persistent — agents
  that remember what the room decided three sessions ago.

Lifecycle caveat: stores persist until deleted. You need a reaper (delete per-session stores on
`reset()`, keep the long-term memory store) or you will quietly fill the project quota.

### 4.2 Code execution — let agents verify before they ship  ★ high value, trivial effort

`tools: [{ type: 'code_execution' }]`. Python only, 30-second ceiling, no custom packages, but
numpy/pandas/matplotlib/sklearn are available and matplotlib output comes back as inline images.

For this app it's the difference between an agent asserting "this will run at 60fps with 5,000
particles" and an agent checking. It also gives the room a legitimate charting path
(`code_execution_call` / `code_execution_result` steps carry the code and its output separately, so
you can render them as a distinct message type).

**It does not replace the artifact panel.** The docs are explicit: code execution "can't return
other artifacts like media files," and it's Python, while the room's artifacts are JS/HTML/GLSL.
Ship it as a verification tool, not an execution backend.

### 4.3 Multi-speaker TTS — give the room voices  ★ the most on-brand feature available

> **Status: shipped 2026-09-12 (CHANGELOG 1.8.0), and actually verified against the
> live API — 7 seconds of real audio, valid RIFF at 24 kHz mono 16-bit.**
>
> **The code below is wrong in one important way.** Multi-speaker TTS accepts at most
> **two** speakers per request, so "a chunk can carry several speakers" does not hold
> for a room with four agents. What shipped instead: one single-speaker request per
> contiguous same-speaker run, with the PCM concatenated. That scales to any cast size
> and gives exact per-agent voice control; the cost is cross-speaker prosody, because
> the model never hears the previous line.

This is a *chat room* with named personas, distinct colours, and avatars. It should be listenable.

```js
const interaction = await client.interactions.create({
  model: 'gemini-3.1-flash-tts-preview',
  input: transcriptChunk,                       // "Ada: ...\nBoris: ..."
  response_format: { type: 'audio' },
  generation_config: {
    speech_config: [
      { speaker: 'Ada',   voice: 'Kore' },
      { speaker: 'Boris', voice: 'Puck' },
    ],
  },
});
// interaction.output_audio.data → base64 PCM
```

Thirty voices available (Kore/firm, Puck/upbeat, Charon/informative, Enceladus/breathy,
Achernar/soft, …). Implementation notes:

- Add `voice` to the agent schema next to `avatar` and `color`; `AgentAvatarEditor.jsx` grows a
  voice picker with preview.
- 32k context limit and quality drift on long outputs → chunk by scene/turn-group, not whole
  session. Multi-speaker config takes a list, so a chunk can carry several speakers.
- Output is base64 PCM (24kHz) — wrap as WAV server-side before handing to the client.
- $20/1M audio output tokens; audio is ~32 tokens/second, so ≈ $2.30 per hour of speech. Gate it
  behind an explicit "render audio" action rather than doing it live.
- `export.js` already builds session bundles via JSZip — the audio drops into that as `.wav` files
  plus a manifest.

### 4.4 Structured output for the orchestrator's own decisions  ★ high value, low effort

> **Status: shipped behind `SMART_ORCHESTRATION=true` (2026-09-12), CHANGELOG 1.7.0 —
> but NOT as written below.** This section says "replace each with a cheap call." Doing
> that would have thrown away behaviour the current code earned the hard way: the
> fairness floor that stops one agent dominating, the cooldown that stops an agent
> closing the room right after the user typed, and the consensus quorum. Those are
> *policy*, and a model should not get a vote on them.
>
> What shipped: the judge chooses only between candidates the heuristics already
> accept, is not consulted at all when the fairness floor forced the pick, and a
> consensus verdict must clear 0.75 confidence *and* win the same quorum an explicit
> marker would. Every failure path falls back to the heuristic. `isConversationWindingDown`
> was left alone — it is a sign-off detector, not a judgement call.

Three orchestrator behaviours are currently regex-and-heuristic over prose, and all three are the
kind of thing that goes subtly wrong:

- `selectDynamic()` (`orchestrator.js:659`) — who speaks next
- `checkForCompletion()` (`orchestrator.js:791`) — string-matching `[CONSENSUS REACHED]`
- `isConversationWindingDown()` (`orchestrator.js:891`)

Replace each with a cheap `gemini-3.5-flash-lite` call using `response_format`:

```js
response_format: {
  type: 'text',
  mime_type: 'application/json',
  schema: {
    type: 'object',
    properties: {
      next_speaker_id: { type: 'string', enum: agentIds },
      reason:          { type: 'string' },
      confidence:      { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['next_speaker_id', 'reason'],
  },
}
```

At $0.30/1M input this is nearly free, the `enum` makes an invalid speaker structurally impossible,
and `reason` gives the UI something to show ("Boris next — he was addressed by name"). Same pattern
for consensus: a schema with `{ consensus: boolean, votes: string[], rationale: string }` beats
counting occurrences of a magic string across a sliding turn window.

### 4.5 Deep Research agent — replace the hand-rolled `[RESEARCH:]`

Today `[RESEARCH:]` is `google_search` + `url_context` in a single call (`tools.js`, `research()`).
The real thing is a managed agent:

```js
const interaction = await client.interactions.create({
  agent: 'deep-research-preview-04-2026',       // or deep-research-max-preview-04-2026
  input: topic,
  background: true,
  agent_config: { thinking_summaries: 'auto', visualization: 'auto', collaborative_planning: false },
});
```

It fits the room's existing shape unusually well: **the workflow engine already has a
submit-now/surface-later channel.** `_wrapBroadcastForWorkflow()` and `pendingWorkflowOutcomes` were
built exactly for "this runs in the background while the conversation continues, and the result gets
injected to whoever speaks next." A Deep Research task plugs into that with no new UI concept.

Cost discipline required: **$1–3 per task** (≈80 searches, 250k tokens), $3–7 for Max. This must be
opt-in per session with a hard per-session cap, not a tool the model can reach for freely. Tasks run
for minutes, so `background: true` is mandatory; poll `interactions.get(id)` or resume the stream
with `last_event_id` after the 600-second connection timeout.

### 4.6 Grounded image generation

`gemini-3.1-flash-image` supports Google Search grounding including image search:

```js
tools: [{ type: 'google_search', search_types: ['web_search', 'image_search'] }]
```

Real reference images for style and subject rather than the model's recollection. Also worth noting
for the image path generally: 3.1 Flash Image accepts up to **10 object images + 4 character
consistency images + 3 style references**, which is a much richer composition interface than the
current single-reference `generateImageWithReferences`. Character-consistency slots in particular
would let a room maintain a recurring character across a whole storyboard — directly useful to the
`memory_visualization` and `cinematic_short` workflow templates.

Resolution and aspect ratio move into `response_format` now:
`{ type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '2K' }`.

### 4.7 Live API — a voice seat in the room  ★ big, phase it last

`gemini-3.1-flash-live-preview` over WebSocket: 16kHz PCM in, 24kHz PCM out, barge-in interruption,
70 languages, function calling and Google Search inside the session. Ephemeral tokens exist
specifically so a browser client can connect without holding the API key.

This is the most exciting thing on the list and also the largest lift — a WebSocket transport
alongside the existing SSE one, an audio capture/playback pipeline in the React client, and a
turn-taking negotiation between the live human and the autonomous agent loop. Worth prototyping as
"one live agent + a human, with the rest of the room in text" before attempting the full thing.

### 4.8 Managed agents (Antigravity) — the exploratory one

`antigravity-preview-05-2026` provisions a Linux sandbox (Ubuntu, Python 3.12, Node 22, outbound
network with optional allowlist) per agent, persisting 7 days. An agent can genuinely build and run
the artifact rather than emitting a file blob and hoping.

This is the logical end state for "agent studio," and it is also 100k–3M tokens per interaction and
public preview. Treat as a spike, not a roadmap item. Up to 1,000 managed agents per account, so the
"one persistent sandbox per saved persona" model is at least numerically feasible.

### 4.9 Explicitly not available / not worth it

- **Batch API** — not supported in the Interactions API. Don't plan around it.
- **Explicit context caching** — `generateContent`-only. Implicit caching via chaining is the path.
- **Custom safety settings** — unsupported in Interactions.
- **Remote MCP on Gemini 3** — the SDK exposes an `mcp_server` tool type, but the Interactions docs
  note remote MCP is not supported for Gemini 3. Verify before building on it.
- **Computer use** (preview) and **Maps grounding** — real, but no obvious fit for this room.

---

## 5. Compliance and correctness items found along the way

1. **Google Search display requirements.** The `google_search_result` step returns
   `search_suggestions` as an HTML snippet, and the Grounding-with-Google-Search terms require it to
   be rendered. `tools.js` reads annotations and search queries but discards `search_suggestions`,
   and the client never renders it. Worth reading the current ToS text and, if it still requires
   display, adding it to `ChatMessage.jsx`'s source chips.
2. **Search billing changed shape.** On Gemini 3.x, grounding bills **per search query the model
   executes**, not per prompt — multiple queries in one call are multiple billable units, at $14 per
   1,000 after the free 5,000/month. An autonomous agent loop with an unrestricted search tool can
   run that up quickly. Add a per-session search counter alongside the token meter.
3. **`countTokens` is on the wrong client surface.** The pre-flight counter is
   `client.models.countTokens({ model, contents })` — still the `models` namespace, not
   `interactions`. Fine, but don't expect a symmetrical API.

---

## 6. Suggested phasing

| Phase | Scope | Effort | Risk |
|---|---|---|---|
| ~~**0**~~ | ~~Model IDs → central config; `analyzeImage` off the image model; real `usage` accounting; `thinking_level`; raise `max_output_tokens`~~ **— done 2026-09-11, see CHANGELOG 1.2.0** | ~half a day | Low. No architecture change, immediate cost win |
| ~~**1**~~ | ~~Fixture tests for the stream parser in `gemini.js`~~ **— done 2026-09-11, see CHANGELOG 1.3.0** | ~half a day | None — prerequisite for everything below |
| ~~**2**~~ | ~~Function calling behind `TOOL_MODE=functions`; start with the five media tools; keep regex parsers as fallback~~ **— shipped 2026-09-11 (off by default), see CHANGELOG 1.4.0** | 2–3 days | Medium. Biggest behavioural change; **still needs a real session to evaluate** |
| ~~**3**~~ | ~~Stateful chains + implicit caching; per-agent `previous_interaction_id`; prompt reordering; delete the summariser~~ **— shipped 2026-09-12 (off by default), see CHANGELOG 1.5.0** | 2–3 days | Medium. Gated behind `GEMINI_STORE_INTERACTIONS`; **the privacy call is still yours to make** |
| ~~**4**~~ | ~~File Search for session media~~ **— shipped 2026-09-12 (off by default), see CHANGELOG 1.6.0.** Cross-session memory store **not** built — see open question 4 | 2–3 days | Low-medium. Watch store lifecycle/quota |
| ~~**5**~~ | ~~Structured output for speaker selection + consensus; code execution tool~~ **— shipped 2026-09-12 (off by default), see CHANGELOG 1.7.0.** Augments the heuristics rather than replacing them | 1–2 days | Low |
| ~~**6**~~ | ~~Per-agent voices + multi-speaker TTS session export~~ **— shipped 2026-09-12, CHANGELOG 1.8.0. Verified against the live API.** Per-run single-speaker, not multi-speaker (caps at 2) | 2–3 days | Low. Self-contained, high delight |
| **7** | Deep Research agent on the existing background-workflow channel | 1–2 days | Low code risk, **real cost risk** — needs caps |
| **8** | Spikes: Live API voice seat; Antigravity managed agents | open-ended | High |

Phases 0 and 1 are worth doing regardless of whether anything else happens: they're cheap, they
reduce spend immediately, and phase 1 is the safety net for all the rest.

---

## 7. Open questions

1. **`store: true` or not?** The privacy promise in `.env.example` is currently load-bearing for how
   the hosted tier is described. Caching is a real saving, but this is a product call, not a
   technical default.
2. **Is the artifact panel staying JS/HTML-first?** If so, code execution is verification-only and
   managed agents are the only route to "the agent actually runs the thing."
3. **What's the monthly ceiling on this room?** Deep Research at $1–3/task and grounded search at
   $14/1,000 queries change the design (hard caps vs. soft warnings) depending on the answer.
4. **Cross-session agent memory — wanted, or scope creep?** File Search makes it cheap enough to be
   tempting, but it changes what a "session" means in the product.
