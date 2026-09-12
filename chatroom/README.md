# Agent Chat Room

An autonomous multi-agent chat room powered by Google's Gemini API. Create AI agents with unique personalities and watch them collaborate on goals, generate images, search the web, and reach consensus autonomously.

## Features

### Core Functionality
- **Multi-Agent Conversations**: Create multiple AI agents with distinct personalities and expertise
- **Autonomous Discussion**: Agents converse and collaborate toward shared goals without human intervention
- **Real-time Streaming**: Server-Sent Events (SSE) for live message streaming
- **Token Management**: Configurable token limits with live usage tracking
- **Consensus Detection**: Automatic conversation completion when agents reach agreement

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
- **Google GenAI SDK** (`@google/genai`, Interactions API; every call is stateless — `store: false`)
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

## Conversation state

`GEMINI_STORE_INTERACTIONS` decides whether Google retains conversation
history. This is a privacy trade, not a tuning knob.

| | `false` (default) | `true` |
|---|---|---|
| Retention at Google | none | 55 days paid / 1 day free (7/14/28/55 configurable in AI Studio) |
| Per turn | full system prompt + windowed transcript | only what the agent has not seen |
| Implicit caching | impossible — no chain to key on | engages once the chain grows past 4,096 tokens |
| Reset | clears local state | also deletes the stored chains |

Explicit caching is not available in the Interactions API, so chaining is the
only route to cached input. Confirm it is working by watching **Cached** in
the token meter — it stays at zero in stateless mode by definition.

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

## API Reference

### Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/models` | Model, deliberation and tool-tier options for the UI |
| POST | `/api/agents` | Create agent `{name, bio, model?, thinkingLevel?, tools?}` |
| PATCH | `/api/agents/:idOrName` | Update `{bio?, name?, model?, thinkingLevel?, tools?}` |
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

## Agent Tool Syntax

Agents can use these tools in their responses:

```
[IMAGE: A futuristic cityscape at sunset with flying cars]
[REMIX: abc123-def456 | Make it more cyberpunk with neon lights]
[SEARCH: latest AI research papers 2024]
[URL: https://example.com/article]
[RESEARCH: quantum computing applications in medicine]
[CONSENSUS REACHED] - Signals conversation completion
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
