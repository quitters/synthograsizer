# Interactions stream fixtures

Each `*.json` file is a recorded (or recorded-shape) sequence of Server-Sent
Events from `interactions.create({ stream: true })`, as the `@google/genai`
SDK yields them. The tests replay these through `generateAgentResponse` so the
stream parser can be refactored without a live API key.

## Event shapes

These match the post-May-2026 Interactions schema — the names changed then
(`content.delta` → `step.delta`, `interaction.complete` →
`interaction.completed`), so a fixture using the old names is testing nothing.

| `event_type` | Carries |
|---|---|
| `interaction.created` | `interaction` (id, status) |
| `step.start` | `step` — `{ type: 'model_output' \| 'thought' \| ... }` |
| `step.delta` | `delta` — `{ type: 'text', text }`, `{ type: 'thought_summary', ... }` |
| `step.stop` | — |
| `interaction.completed` | `interaction` — including `status` and `usage` |
| `error` | `error.message` |

`interaction.status` is `completed` on a normal finish and `incomplete` when
the response hit `max_output_tokens` — the latter is what drives the
continuation loop.

`usage` uses the API's snake_case field names (`total_input_tokens`,
`total_output_tokens`, `total_thought_tokens`, `total_cached_tokens`,
`total_tool_use_tokens`, `total_tokens`), verified against the `Usage` type in
`@google/genai` 2.10.0.

## Recording a real one

With a valid `GEMINI_API_KEY`, log every event out of the stream loop in
`gemini.js` as JSON and paste the array here. Strip anything identifying —
these files are committed.
