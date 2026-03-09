# Changelog

All notable changes to the Agent Chat Room project are documented in this file.

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
