# Architecture Documentation

This document provides in-depth technical details for developers working on the Agent Chat Room project.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (React)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  App.jsx │ │Components│ │  Hooks   │ │     Utils        │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │
│       │            │            │                 │             │
│       └────────────┴────────────┴─────────────────┘             │
│                            │                                     │
│                     SSE + REST API                               │
└────────────────────────────┼────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                         Server (Express)                         │
│                            │                                     │
│  ┌─────────────────────────┴─────────────────────────────────┐  │
│  │                      Routes Layer                          │  │
│  │  ┌─────────────┐              ┌─────────────────────────┐ │  │
│  │  │ agents.js   │              │       chat.js           │ │  │
│  │  │ CRUD agents │              │ Stream, Control, Branch │ │  │
│  │  └─────────────┘              └───────────┬─────────────┘ │  │
│  └───────────────────────────────────────────┼───────────────┘  │
│                                              │                   │
│  ┌───────────────────────────────────────────┴───────────────┐  │
│  │                    Services Layer                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│  │
│  │  │ gemini.js   │  │imageGen.js  │  │     tools.js        ││  │
│  │  │ Text/Prompt │  │ Image Gen   │  │ Search/URL/Research ││  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘│  │
│  │         │                │                     │           │  │
│  │  ┌──────┴────────────────┴─────────────────────┴──────────┐│  │
│  │  │                  orchestrator.js                        ││  │
│  │  │  Conversation Loop, Speaker Selection, Branching        ││  │
│  │  └────────────────────────────────────────────────────────┘│  │
│  │                              │                              │  │
│  │  ┌───────────────────────────┴───────────────────────────┐ │  │
│  │  │                   mediaStore.js                        │ │  │
│  │  │               Singleton Media Registry                 │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                             │
                    Google Gemini API
```

## Core Components

### 1. Orchestrator (`server/services/orchestrator.js`)

The orchestrator is a singleton class that manages the entire conversation lifecycle.

#### State Properties

```javascript
{
  agents: [],           // Array of agent objects
  messages: [],         // Conversation history
  goal: '',            // Current conversation goal
  tokenLimit: 100000,  // Max tokens before auto-stop
  tokenCount: 0,       // Current token usage
  turnCount: 0,        // Number of agent turns
  isRunning: false,    // Conversation active flag
  isPaused: false,     // Pause state
  lastSpeakerId: null, // Prevent same speaker twice
  sseClients: Set,     // Connected SSE clients
  completionReason: null,

  // Speaking order
  speakingOrder: 'dynamic',     // Mode: dynamic|round-robin|priority|random
  speakingPriorities: {},       // {agentId: priority} for priority mode

  // Branching
  branchPoints: [],             // Saved conversation states
  currentBranchId: null         // Currently active branch
}
```

#### Conversation Loop

```javascript
async runConversationLoop() {
  while (isRunning && !isPaused) {
    // 1. Check token limit
    if (tokenCount >= tokenLimit) stop('token_limit_reached');

    // 2. Select next speaker
    const speaker = selectNextSpeaker();

    // 3. Generate response with streaming
    for await (const event of generateAgentResponse(...)) {
      broadcast('chunk', { text: event.text });
    }

    // 4. Parse and execute image requests
    const imageRequests = parseImageRequests(response);
    const remixRequests = parseRemixRequests(response);

    // 5. Parse and execute tool requests
    const toolRequests = parseToolRequests(response);

    // 6. Create message object
    const message = { id, agentId, content, images, toolResults, ... };

    // 7. Check for completion
    if (checkForCompletion(content)) stop('consensus_reached');

    // 8. Delay for readability
    await delay(1500);
  }
}
```

#### Speaker Selection Strategies

**Dynamic Mode** (default):
1. Check for direct address (`@AgentName` or `Name,`)
2. Let moderator speak every 3-4 turns
3. Match expertise to conversation context
4. Weighted random favoring those who haven't spoken recently

**Round-Robin Mode**:
```javascript
selectRoundRobin() {
  const lastIndex = agents.findIndex(a => a.id === lastSpeakerId);
  return agents[(lastIndex + 1) % agents.length];
}
```

**Priority Mode**:
```javascript
selectByPriority() {
  // Weighted random based on priority values
  const totalPriority = agents.reduce((sum, a) =>
    sum + (speakingPriorities[a.id] || 1), 0);
  let random = Math.random() * totalPriority;
  // Select based on accumulated weights
}
```

#### Branching System

Branches save complete conversation state:

```javascript
createBranchPoint(name) {
  return {
    id: uuid(),
    name: name,
    messageIndex: messages.length,
    createdAt: timestamp,
    state: {
      messages: deepCopy(messages),
      tokenCount,
      turnCount,
      lastSpeakerId,
      goal,
      agents: deepCopy(agents),
      speakingOrder,
      speakingPriorities
    }
  };
}
```

### 2. Gemini Service (`server/services/gemini.js`)

Handles all LLM interactions with Google's Gemini API.

#### Model Configuration

```javascript
// Text generation
const textModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.9,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 2048,
  },
});

// Image generation
const imageModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-preview-image-generation',
  generationConfig: {
    responseModalities: ['Text', 'Image'],
  },
});
```

#### System Prompt Structure

```javascript
function buildSystemPrompt(agent, allAgents, goal) {
  return `
    You are ${agent.name}.
    ${agent.bio}

    CONVERSATION GOAL: ${goal}

    OTHER PARTICIPANTS:
    ${allAgents.map(a => `- ${a.name}: ${a.bio}`).join('\n')}

    TOOLS AVAILABLE:
    [IMAGE: prompt] - Generate images
    [REMIX: id | changes] - Modify existing images
    [SEARCH: query] - Web search
    [URL: url] - Analyze webpage
    [RESEARCH: topic] - Deep research

    GUIDELINES:
    - Stay in character
    - Build on others' ideas
    - Use @Name to address someone
    - Use tools when helpful
    - Use [CONSENSUS REACHED] when goal is complete
  `;
}
```

#### Streaming Response Generator

```javascript
async function* generateAgentResponse(agent, allAgents, messages, goal) {
  const chat = textModel.startChat({
    history: buildChatHistory(messages),
    systemInstruction: buildSystemPrompt(agent, allAgents, goal),
  });

  const response = await chat.sendMessageStream(
    buildConversationTranscript(messages)
  );

  for await (const chunk of response.stream) {
    yield { type: 'chunk', text: chunk.text() };
  }

  yield {
    type: 'complete',
    fullResponse: cleanResponse(accumulated),
    tokenCount: estimateTokens(accumulated)
  };
}
```

### 3. Image Generation (`server/services/imageGen.js`)

#### Basic Generation

```javascript
async function generateImage(prompt) {
  const result = await imageModel.generateContent({
    contents: [{ parts: [{ text: prompt }] }],
  });

  // Extract image from response
  for (const part of response.parts) {
    if (part.inlineData) {
      return {
        imageData: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
        text: textParts.join('')
      };
    }
  }
}
```

#### Reference-Based Generation (Remix)

```javascript
async function generateImageWithReferences(prompt, referenceImages) {
  const parts = [];

  // Add reference images first
  for (const ref of referenceImages) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.imageData  // base64
      }
    });
  }

  // Add enhanced prompt
  parts.push({
    text: `Using the provided reference image(s) as style and
           content guidance, create: ${prompt}`
  });

  return await imageModel.generateContent({ contents: [{ parts }] });
}
```

#### Tag Parsing

```javascript
function parseImageRequests(text) {
  const pattern = /\[IMAGE:\s*(.+?)\]/gi;
  const requests = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    requests.push({ prompt: match[1].trim() });
  }
  return requests;
}

function parseRemixRequests(text) {
  const patterns = [
    /\[REMIX:\s*([a-f0-9-]+)\s*\|\s*(.+?)\]/gi,
    /\[ITERATE:\s*([a-f0-9-]+)\s*\|\s*(.+?)\]/gi,
    /\[VARIATION:\s*([a-f0-9-]+)\s*\|\s*(.+?)\]/gi,
  ];
  // Parse and return {referenceImageId, prompt}
}
```

### 4. Tools Service (`server/services/tools.js`)

#### Tool Types

| Tool | Pattern | Handler |
|------|---------|---------|
| Search | `[SEARCH: query]` | `executeWebSearch()` |
| URL | `[URL: url]` | `executeUrlFetch()` |
| Research | `[RESEARCH: topic]` | `executeResearch()` |

#### Web Search Implementation

```javascript
async function executeWebSearch(query) {
  // Uses Gemini's grounding with Google Search
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }],
  });

  const result = await model.generateContent(query);

  // Extract search results from grounding metadata
  return {
    type: 'search',
    query,
    results: formatSearchResults(result)
  };
}
```

### 5. Media Store (`server/services/mediaStore.js`)

Singleton pattern for tracking all generated media.

```javascript
class MediaStore {
  constructor() {
    this.media = new Map();
  }

  add({ id, type, data, mimeType, prompt, agentId, agentName, referenceIds }) {
    this.media.set(id, {
      id, type, data, mimeType, prompt,
      agentId, agentName, referenceIds,
      createdAt: new Date().toISOString()
    });
  }

  get(id) { return this.media.get(id); }

  getAll() { return Array.from(this.media.values()); }

  exportForZip() {
    return this.getAll().map(m => ({
      id: m.id,
      filename: `${m.id}.${m.mimeType.split('/')[1]}`,
      data: m.data,
      mimeType: m.mimeType,
      prompt: m.prompt
    }));
  }

  clear() { this.media.clear(); }
}

export const mediaStore = new MediaStore();
```

## Frontend Architecture

### Component Hierarchy

```
App.jsx
├── Toolbar (export, templates, save/load)
├── MessageSearch (modal overlay)
├── RemixModal (image remix interface)
├── Sidebar (left)
│   └── AgentSetup
│       └── AgentCard[]
├── Main Content
│   ├── GoalHeader
│   ├── TokenMeter
│   ├── ChatRoom
│   │   └── ChatMessage[]
│   └── Controls
└── Right Sidebar
    └── SettingsPanel (speaking order, branches)
```

### Custom Hooks

#### useEventSource

```javascript
export function useEventSource(url) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSource = useRef(null);
  const listeners = useRef(new Map());

  useEffect(() => {
    eventSource.current = new EventSource(url);

    eventSource.current.onopen = () => setIsConnected(true);
    eventSource.current.onerror = () => setIsConnected(false);

    return () => eventSource.current?.close();
  }, [url]);

  const on = useCallback((event, callback) => {
    listeners.current.set(event, callback);
    eventSource.current?.addEventListener(event, (e) => {
      callback(JSON.parse(e.data));
    });
  }, []);

  return { isConnected, on };
}
```

#### useTheme

```javascript
export function useTheme() {
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('theme') || 'dark'
  );

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return { theme, toggleTheme };
}
```

### State Management

The application uses React's built-in state management:

```javascript
// App.jsx main state
const [agents, setAgents] = useState([]);
const [messages, setMessages] = useState([]);
const [streamingMessage, setStreamingMessage] = useState('');
const [currentSpeaker, setCurrentSpeaker] = useState(null);
const [isRunning, setIsRunning] = useState(false);
const [isPaused, setIsPaused] = useState(false);
const [tokenCount, setTokenCount] = useState(0);
// ... more state
```

State updates are triggered by SSE events:

```javascript
on('agent_complete', (data) => {
  setMessages(prev => [...prev, data.message]);
  setStreamingMessage('');
  setCurrentSpeaker(null);
  setTokenCount(data.totalTokens);
});
```

## Data Flow

### Starting a Conversation

```
User clicks "Start"
    │
    ▼
POST /api/chat/start {goal, tokenLimit}
    │
    ▼
orchestrator.start(goal, tokenLimit)
    │
    ▼
broadcast('session_start', {...})
    │
    ▼
runConversationLoop() [async]
    │
    ├──► selectNextSpeaker()
    │
    ├──► generateAgentResponse() [streaming]
    │       │
    │       └──► broadcast('chunk', {text})
    │
    ├──► parseImageRequests() / parseRemixRequests()
    │       │
    │       └──► generateImage() / generateImageWithReferences()
    │
    ├──► parseToolRequests()
    │       │
    │       └──► executeToolRequests()
    │
    ├──► messages.push(message)
    │
    ├──► broadcast('agent_complete', {message})
    │
    └──► checkForCompletion()
            │
            └──► stop('consensus_reached') if complete
```

### Creating a Branch

```
User clicks "Create Branch"
    │
    ▼
POST /api/chat/branches {name}
    │
    ▼
orchestrator.createBranchPoint(name)
    │
    ├──► Deep copy current state
    │
    ├──► branchPoints.push(branchPoint)
    │
    └──► broadcast('branch_created', {...})
```

### Restoring a Branch

```
User clicks "Restore"
    │
    ▼
POST /api/chat/branches/:id/restore
    │
    ▼
orchestrator.restoreBranch(id)
    │
    ├──► Stop current conversation
    │
    ├──► Restore all state from branch
    │
    ├──► broadcast('branch_restored', {...})
    │
    └──► Client fetchHistory()
```

## Error Handling

### Backend

```javascript
// Conversation loop error handling
try {
  // ... generate response
} catch (error) {
  console.error('Error in conversation loop:', error);
  broadcast('error', { agentId: speaker.id, error: error.message });
  await delay(2000);  // Continue despite errors
}
```

### Frontend

```javascript
on('error', (data) => {
  console.error('Stream error:', data);
  setError(data.error);
});

// Error banner with dismiss
{error && (
  <div className="error-banner">
    <span>{error}</span>
    <button onClick={() => setError(null)}>&times;</button>
  </div>
)}
```

## Performance Considerations

### Token Counting

Approximate estimation (no external library):

```javascript
export function countTokens(text) {
  if (!text) return 0;
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}
```

### Message Streaming

Uses generator functions for memory efficiency:

```javascript
async function* generateAgentResponse(...) {
  for await (const chunk of response.stream) {
    yield { type: 'chunk', text: chunk.text() };
  }
}
```

### SSE Client Management

```javascript
addClient(res) {
  this.sseClients.add(res);
  return () => this.sseClients.delete(res);  // Cleanup function
}

broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of this.sseClients) {
    client.write(message);
  }
}
```

## Testing Considerations

### Manual Testing Checklist

1. **Agent Management**
   - Create agents with various bios
   - Delete agents
   - Load templates

2. **Conversation Flow**
   - Start with 2+ agents
   - Verify streaming works
   - Test pause/resume
   - Test user message injection
   - Verify consensus detection

3. **Image Generation**
   - Test [IMAGE:] syntax
   - Test [REMIX:] with valid ID
   - Verify media store tracking
   - Test ZIP export

4. **Speaking Order**
   - Test all 4 modes
   - Verify priority sliders work
   - Check mode persists across turns

5. **Branching**
   - Create branch while paused
   - Restore branch
   - Delete branch
   - Verify message history restored

6. **Export/Import**
   - Export as Markdown
   - Export as JSON
   - Save session
   - Load session
   - Download media ZIP

## Future Considerations

### Potential Improvements

1. **Database Integration**: Replace in-memory storage with PostgreSQL/MongoDB
2. **Authentication**: Add user accounts and session persistence
3. **WebSocket**: Consider WebSocket for bidirectional communication
4. **Rate Limiting**: Implement proper rate limiting for API calls
5. **Caching**: Add Redis for caching frequently accessed data
6. **Testing**: Add Jest/Vitest unit and integration tests
7. **TypeScript**: Consider migrating for better type safety
8. **Docker**: Add containerization for easier deployment

### Scaling Considerations

- Multiple orchestrator instances would require shared state (Redis/database)
- SSE clients should be tracked per-session, not globally
- Media store should use cloud storage (S3, GCS) for production
