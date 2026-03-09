import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEventSource } from './hooks/useEventSource';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts, getShortcutKey } from './hooks/useKeyboardShortcuts';
import { AgentSetup } from './components/AgentSetup';
import { ChatRoom } from './components/ChatRoom';
import { Controls } from './components/Controls';
import { TokenMeter } from './components/TokenMeter';
import { GoalHeader } from './components/GoalHeader';
import { Toolbar } from './components/Toolbar';
import { MessageSearch } from './components/MessageSearch';
import { RemixModal } from './components/RemixModal';
import { SettingsPanel } from './components/SettingsPanel';
import { TemplateBrowser } from './components/TemplateBrowser';
import { CommandPalette, useCommands } from './components/CommandPalette';
import { MemoryViewer } from './components/MemoryViewer';
import {
  exportAsMarkdown,
  exportAsJSON,
  downloadFile,
  saveSession
} from './utils/export';

const API_BASE = '/chatroom/api';
const AUTO_SAVE_KEY = 'chatroom_autosave';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

function App() {
  // State
  const [agents, setAgents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [tokenLimit, setTokenLimit] = useState(100000);
  const [turnCount, setTurnCount] = useState(0);
  const [error, setError] = useState(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [startModalState, setStartModalState] = useState(null); // Persisted modal form state
  const [currentGoal, setCurrentGoal] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [remixImage, setRemixImage] = useState(null);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true);
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [suggestedGoals, setSuggestedGoals] = useState([]);
  const [conversationSpeed, setConversationSpeed] = useState(1500); // ms between turns
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showMemoryViewer, setShowMemoryViewer] = useState(false);

  const chatRoomRef = useRef(null);
  const autoSaveTimerRef = useRef(null);

  // Theme
  const { theme, toggleTheme } = useTheme();

  // SSE Connection
  const { isConnected, on } = useEventSource(`${API_BASE}/chat/stream`);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      // Don't request immediately, wait for user interaction
    }
  }, []);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  const showNotification = (title, body) => {
    if (notificationsEnabled && document.hidden) {
      new Notification(title, { body, icon: '/vite.svg' });
    }
  };

  // Auto-save functionality
  useEffect(() => {
    // Load auto-saved session on mount
    const autoSaved = localStorage.getItem(AUTO_SAVE_KEY);
    if (autoSaved) {
      try {
        const data = JSON.parse(autoSaved);
        if (data.messages?.length > 0 || data.agents?.length > 0) {
          // Show recovery option
          const recover = window.confirm(
            `Found auto-saved session from ${new Date(data.savedAt).toLocaleString()}. Restore it?`
          );
          if (recover) {
            loadAutoSavedSession(data);
          } else {
            localStorage.removeItem(AUTO_SAVE_KEY);
          }
        }
      } catch (e) {
        console.error('Failed to parse auto-save:', e);
      }
    }
  }, []);

  // Auto-save timer
  useEffect(() => {
    if (messages.length > 0 || agents.length > 0) {
      autoSaveTimerRef.current = setInterval(() => {
        const data = {
          agents,
          messages,
          goal: currentGoal,
          tokenCount,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(data));
        console.log('Auto-saved session');
      }, AUTO_SAVE_INTERVAL);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [messages, agents, currentGoal, tokenCount]);

  const loadAutoSavedSession = async (data) => {
    if (data.agents) {
      for (const agent of data.agents) {
        await addAgent(agent.name, agent.bio);
      }
    }
    if (data.messages) setMessages(data.messages);
    if (data.goal) setCurrentGoal(data.goal);
    if (data.tokenCount) setTokenCount(data.tokenCount);
    localStorage.removeItem(AUTO_SAVE_KEY);
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onToggleChat: () => {
      if (isRunning) {
        stopChat();
      } else if (agents.length >= 2) {
        setShowStartModal(true);
      }
    },
    onSave: () => setShowSaveModal(true),
    onExport: () => {
      if (messages.length > 0) {
        const md = exportAsMarkdown(messages, agents, currentGoal, { tokenCount });
        downloadFile(md, `chat-${new Date().toISOString().split('T')[0]}.md`, 'text/markdown');
      }
    },
    onFocusSearch: () => setShowSearch(true),
    onToggleSidebar: () => setSidebarCollapsed(prev => !prev),
    onEscape: () => {
      setShowSearch(false);
      setShowStartModal(false);
      setShowSaveModal(false);
      setShowTemplateBrowser(false);
      setShowCommandPalette(false);
    }
  });

  // Command palette shortcut (Ctrl+P)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Set up SSE event handlers
  useEffect(() => {
    on('connected', (data) => {
      console.log('Connected to SSE:', data);
    });

    on('state', (state) => {
      setIsRunning(state.isRunning);
      setIsPaused(state.isPaused);
      setTokenCount(state.tokenCount);
      setTokenLimit(state.tokenLimit);
      setTurnCount(state.turnCount);
      if (state.goal) {
        setCurrentGoal(state.goal);
      }
      if (state.agents && state.agents.length > 0) {
        setAgents(prev => prev.length === 0 ? state.agents : prev);
      }
    });

    on('session_start', (data) => {
      setIsRunning(true);
      setIsPaused(false);
      setMessages([]);
      setStreamingMessage('');
      setTokenCount(0);
      setTurnCount(0);
      setTokenLimit(data.tokenLimit);
      if (data.goal) {
        setCurrentGoal(data.goal);
      }
    });

    on('session_end', (data) => {
      setIsRunning(false);
      setIsPaused(false);
      setStreamingMessage('');
      setCurrentSpeaker(null);
      console.log('Session ended:', data.reason);

      // Browser notification
      if (data.reason === 'consensus_reached') {
        showNotification('Chat Complete', 'The agents have reached consensus!');
      } else if (data.reason === 'token_limit_reached') {
        showNotification('Chat Complete', 'Token limit reached.');
      }
    });

    on('session_paused', () => setIsPaused(true));
    on('session_resumed', () => setIsPaused(false));

    on('agent_start', (data) => {
      setCurrentSpeaker({
        agentId: data.agentId,
        agentName: data.agentName,
        color: agents.find(a => a.id === data.agentId)?.color
      });
      setStreamingMessage('');
      setTurnCount(data.turnNumber);
    });

    on('chunk', (data) => {
      setStreamingMessage(prev => prev + data.text);
    });

    on('agent_complete', (data) => {
      setMessages(prev => [...prev, data.message]);
      setStreamingMessage('');
      setCurrentSpeaker(null);
      setTokenCount(data.totalTokens);
      setTurnCount(data.turnCount);
    });

    on('message', (message) => {
      setMessages(prev => [...prev, message]);
      setTokenCount(prev => prev + (message.tokenCount || 0));
    });

    on('error', (data) => {
      console.error('Stream error:', data);
      setError(data.error);
    });

    on('tool_executing', (data) => {
      console.log('Tool executing:', data.type, data.query);
    });

    on('tool_result', (data) => {
      console.log('Tool result:', data.result);
    });

    on('tool_error', (data) => {
      console.error('Tool error:', data.error);
    });

    // Branch events
    on('branch_created', (data) => {
      console.log('Branch created:', data.name);
    });

    on('branch_restored', (data) => {
      console.log('Branch restored:', data.name);
      fetchHistory();
    });

    on('conversation_rewound', (data) => {
      console.log('Conversation rewound to message', data.toIndex);
      fetchHistory();
    });

    on('speaking_order_changed', (data) => {
      console.log('Speaking order changed to:', data.mode);
    });
  }, [on, agents, notificationsEnabled]);

  // Fetch conversation history
  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/history`);
      const data = await res.json();
      setMessages(data.history || []);
      const stateRes = await fetch(`${API_BASE}/chat/state`);
      const stateData = await stateRes.json();
      setTokenCount(stateData.tokenCount || 0);
      setTurnCount(stateData.turnCount || 0);
      if (stateData.goal) {
        setCurrentGoal(stateData.goal);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  // Fetch initial agents on mount
  useEffect(() => {
    fetchAgents();
  }, []);

  // API Functions
  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API_BASE}/agents`);
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  const addAgent = async (name, bio) => {
    try {
      const res = await fetch(`${API_BASE}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bio })
      });
      const data = await res.json();
      if (data.agent) {
        setAgents(prev => [...prev, data.agent]);
        return data.agent;
      }
    } catch (err) {
      console.error('Failed to add agent:', err);
      setError(err.message);
    }
  };

  const removeAgent = async (agentId) => {
    try {
      await fetch(`${API_BASE}/agents/${agentId}`, { method: 'DELETE' });
      setAgents(prev => prev.filter(a => a.id !== agentId));
    } catch (err) {
      console.error('Failed to remove agent:', err);
    }
  };

  const updateAgentAvatar = (agentId, avatar) => {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, avatar } : a
    ));
  };

  // Load agents from template
  const loadAgents = async (newAgents, sessionOrGoals = null) => {
    // Clear existing agents first
    for (const agent of agents) {
      await fetch(`${API_BASE}/agents/${agent.id}`, { method: 'DELETE' });
    }
    setAgents([]);

    // Add new agents
    for (const agent of newAgents) {
      await addAgent(agent.name, agent.bio);
    }

    // If it's an array, it's suggested goals
    if (Array.isArray(sessionOrGoals)) {
      setSuggestedGoals(sessionOrGoals);
    }
    // If it's an object with messages, it's a full session
    else if (sessionOrGoals?.messages) {
      setMessages(sessionOrGoals.messages || []);
      setCurrentGoal(sessionOrGoals.goal || '');
      setTokenCount(sessionOrGoals.tokenCount || 0);
    }
  };

  // Quick start with agents and goal
  const quickStart = async (newAgents, goal) => {
    await loadAgents(newAgents);
    setCurrentGoal(goal);
    // Small delay to ensure agents are loaded
    setTimeout(() => {
      startChat(goal, tokenLimit);
    }, 500);
  };

  const startChat = async (goal, limit, uploadedFiles = []) => {
    try {
      setError(null);
      setCurrentGoal(goal);
      setSuggestedGoals([]); // Clear suggested goals
      setStartModalState(null); // Clear persisted modal state for fresh next session

      // Clear previous session media, then upload new files if any
      await fetch(`${API_BASE}/chat/session-media/clear`, { method: 'POST' });

      if (uploadedFiles.length > 0) {
        const mediaRes = await fetch(`${API_BASE}/chat/session-media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: uploadedFiles.map(f => ({
              name: f.name,
              mimeType: f.mimeType,
              data: f.data,
            }))
          })
        });
        if (!mediaRes.ok) {
          const mediaErr = await mediaRes.json();
          setError(mediaErr.error || 'Failed to upload media');
          return;
        }
      }

      // Start the chat (media is already set up)
      const res = await fetch(`${API_BASE}/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, tokenLimit: limit })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
      }
    } catch (err) {
      console.error('Failed to start chat:', err);
      setError(err.message);
    }
  };

  const stopChat = async () => {
    try {
      await fetch(`${API_BASE}/chat/stop`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to stop chat:', err);
    }
  };

  const pauseChat = async () => {
    try {
      await fetch(`${API_BASE}/chat/pause`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to pause chat:', err);
    }
  };

  const resumeChat = async () => {
    try {
      await fetch(`${API_BASE}/chat/resume`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to resume chat:', err);
    }
  };

  const injectMessage = async (content) => {
    try {
      await fetch(`${API_BASE}/chat/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, senderName: 'User' })
      });
    } catch (err) {
      console.error('Failed to inject message:', err);
    }
  };

  const resetAll = async () => {
    try {
      await fetch(`${API_BASE}/chat/reset`, { method: 'POST' });
      setAgents([]);
      setMessages([]);
      setStreamingMessage('');
      setCurrentSpeaker(null);
      setIsRunning(false);
      setIsPaused(false);
      setTokenCount(0);
      setTurnCount(0);
      setError(null);
      setCurrentGoal('');
      setSuggestedGoals([]);
      localStorage.removeItem(AUTO_SAVE_KEY);
    } catch (err) {
      console.error('Failed to reset:', err);
    }
  };

  const clearAll = () => {
    if (isRunning) {
      stopChat();
    }
    resetAll();
  };

  const jumpToMessage = (index) => {
    chatRoomRef.current?.scrollToMessage(index);
  };

  const getStatus = () => {
    if (!isRunning) return agents.length > 0 ? 'stopped' : 'idle';
    if (isPaused) return 'paused';
    return 'running';
  };

  // Command palette commands
  const commands = useCommands({
    isRunning,
    isPaused,
    agents,
    messages,
    onStartChat: () => setShowStartModal(true),
    onStopChat: stopChat,
    onPauseChat: pauseChat,
    onResumeChat: resumeChat,
    onReset: resetAll,
    onOpenTemplates: () => setShowTemplateBrowser(true),
    onOpenSearch: () => setShowSearch(true),
    onOpenSettings: () => setRightSidebarCollapsed(false),
    onOpenMemory: () => setShowMemoryViewer(true),
    onToggleTheme: toggleTheme,
    onExportMarkdown: () => {
      if (messages.length > 0) {
        const md = exportAsMarkdown(messages, agents, currentGoal, { tokenCount });
        downloadFile(md, `chat-${new Date().toISOString().split('T')[0]}.md`, 'text/markdown');
      }
    },
    onExportJSON: () => {
      if (messages.length > 0) {
        const json = exportAsJSON(messages, agents, currentGoal, { tokenCount });
        downloadFile(json, `chat-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
      }
    },
    onSaveSession: () => setShowSaveModal(true),
    onToggleSidebar: () => setSidebarCollapsed(prev => !prev)
  });

  const handleCommandExecute = (command) => {
    if (command.action) {
      command.action();
    }
  };

  return (
    <div className="app" data-theme={theme}>
      <header className="app-header">
        <h1>Agent Chat Room</h1>

        <Toolbar
          agents={agents}
          messages={messages}
          goal={currentGoal}
          tokenCount={tokenCount}
          isRunning={isRunning}
          onLoadAgents={loadAgents}
          onClearAll={clearAll}
          onOpenTemplates={() => setShowTemplateBrowser(true)}
        />

        <div className="header-right">
          <button
            className="icon-btn"
            onClick={() => setShowCommandPalette(true)}
            title="Command Palette (Ctrl+P)"
          >
            ⌘
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowSearch(true)}
            title={`Search (${getShortcutKey('search')})`}
          >
            🔍
          </button>
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {agents.length > 0 && (
            <button
              className="icon-btn"
              onClick={() => setShowMemoryViewer(true)}
              title="View agent memory"
            >
              🧠
            </button>
          )}
          {!notificationsEnabled && (
            <button
              className="icon-btn"
              onClick={requestNotificationPermission}
              title="Enable notifications"
            >
              🔔
            </button>
          )}
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      <div className="app-layout">
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(prev => !prev)}
            title={`Toggle sidebar (${getShortcutKey('toggleSidebar')})`}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
          {!sidebarCollapsed && (
            <AgentSetup
              agents={agents}
              onAddAgent={addAgent}
              onRemoveAgent={removeAgent}
              onAvatarChange={updateAgentAvatar}
              onStartChat={() => setShowStartModal(true)}
              onOpenTemplates={() => setShowTemplateBrowser(true)}
              disabled={isRunning}
            />
          )}
        </aside>

        <main className="main-content">
          <GoalHeader goal={currentGoal} isRunning={isRunning} />

          <TokenMeter
            tokenCount={tokenCount}
            tokenLimit={tokenLimit}
            turnCount={turnCount}
            status={getStatus()}
          />

          {/* Typing Indicator */}
          {currentSpeaker && (
            <div className="typing-indicator">
              <div
                className="typing-avatar"
                style={{ backgroundColor: currentSpeaker.color || '#666' }}
              >
                {currentSpeaker.agentName?.split(' ').map(n => n[0]).join('')}
              </div>
              <span className="typing-name">{currentSpeaker.agentName}</span>
              <span className="typing-text">is typing</span>
              <span className="typing-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
            </div>
          )}

          <ChatRoom
            ref={chatRoomRef}
            messages={messages}
            streamingMessage={streamingMessage}
            currentSpeaker={currentSpeaker}
            onRemixImage={(image) => setRemixImage(image)}
          />

          <Controls
            isRunning={isRunning}
            isPaused={isPaused}
            onStart={startChat}
            onStop={stopChat}
            onPause={pauseChat}
            onResume={resumeChat}
            onInject={injectMessage}
            onReset={resetAll}
            disabled={agents.length < 2}
            suggestedGoals={suggestedGoals}
            onSelectGoal={(goal) => {
              setCurrentGoal(goal);
              startChat(goal, tokenLimit);
            }}
            hasMessages={messages.length > 0}
          />
        </main>

        <aside className={`right-sidebar ${rightSidebarCollapsed ? 'collapsed' : ''}`}>
          <button
            className="sidebar-toggle"
            onClick={() => setRightSidebarCollapsed(prev => !prev)}
            title="Toggle settings panel"
          >
            {rightSidebarCollapsed ? '⚙️' : '→'}
          </button>
          {!rightSidebarCollapsed && (
            <SettingsPanel
              agents={agents}
              isRunning={isRunning}
              onBranchRestored={fetchHistory}
            />
          )}
        </aside>
      </div>

      {/* Search */}
      <MessageSearch
        messages={messages}
        isVisible={showSearch}
        onClose={() => setShowSearch(false)}
        onJumpToMessage={jumpToMessage}
      />

      {/* Template Browser */}
      <TemplateBrowser
        isOpen={showTemplateBrowser}
        onClose={() => setShowTemplateBrowser(false)}
        onLoadTemplate={loadAgents}
        onQuickStart={quickStart}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={commands}
        onExecute={handleCommandExecute}
      />

      {/* Memory Viewer */}
      <MemoryViewer
        agents={agents}
        messages={messages}
        isOpen={showMemoryViewer}
        onClose={() => setShowMemoryViewer(false)}
      />

      {/* Start Modal */}
      {showStartModal && (
        <StartModal
          onClose={() => setShowStartModal(false)}
          onStart={(goal, limit, files) => {
            startChat(goal, limit, files);
            setShowStartModal(false);
          }}
          suggestedGoals={suggestedGoals}
          persistedState={startModalState}
          onStateChange={setStartModalState}
        />
      )}

      {/* Quick Save Modal */}
      {showSaveModal && (
        <QuickSaveModal
          onClose={() => setShowSaveModal(false)}
          onSave={(name) => {
            const key = `session_${Date.now()}`;
            saveSession(key, {
              name,
              goal: currentGoal,
              agents,
              messages,
              tokenCount
            });
            setShowSaveModal(false);
          }}
        />
      )}

      {/* Remix Modal */}
      {remixImage && (
        <RemixModal
          referenceImage={remixImage}
          onClose={() => setRemixImage(null)}
          onImageGenerated={(newImage) => {
            console.log('New image generated:', newImage.id);
          }}
        />
      )}

      {/* Keyboard shortcuts help */}
      <div className="shortcuts-hint">
        <span>⌘P Command</span>
        <span>{getShortcutKey('toggleChat')} Start/Stop</span>
        <span>{getShortcutKey('search')} Search</span>
      </div>
    </div>
  );
}

const MAX_SESSION_FILES = 14;
const VISUAL_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
const ACCEPTED_MIME_TYPES = [
  ...VISUAL_MIME_TYPES,
  'application/json',
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/xml',
  'application/pdf',
  'text/css',
  'text/javascript',
  'application/javascript',
  'video/mp4',
  'video/webm',
];

function StartModal({ onClose, onStart, suggestedGoals = [], persistedState, onStateChange }) {
  const [goal, setGoal] = useState(persistedState?.goal ?? '');
  const [tokenLimit, setTokenLimit] = useState(persistedState?.tokenLimit ?? 100000);
  const [uploadedFiles, setUploadedFiles] = useState(persistedState?.uploadedFiles ?? []); // { id, name, mimeType, data, preview }
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const mouseDownOnOverlay = useRef(false);

  // Persist state changes back to parent so it survives modal close/reopen
  useEffect(() => {
    onStateChange?.({ goal, tokenLimit, uploadedFiles });
  }, [goal, tokenLimit, uploadedFiles]);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const remaining = MAX_SESSION_FILES - uploadedFiles.length;
    if (remaining <= 0) return;

    const filesToProcess = files.slice(0, remaining);
    setUploading(true);

    const newFiles = [];
    for (const file of filesToProcess) {
      // Check MIME type
      if (!ACCEPTED_MIME_TYPES.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('text/')) {
        console.warn(`Skipping unsupported file type: ${file.type} (${file.name})`);
        continue;
      }

      // Check file size (max 20MB per file)
      if (file.size > 20 * 1024 * 1024) {
        console.warn(`Skipping file too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }

      try {
        const base64 = await readFileAsBase64(file);
        const preview = VISUAL_MIME_TYPES.includes(file.type)
          ? `data:${file.type};base64,${base64}`
          : null;

        newFiles.push({
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type,
          data: base64,
          preview,
          size: file.size,
        });
      } catch (err) {
        console.error(`Failed to read file: ${file.name}`, err);
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
    setUploading(false);
    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return '\u{1F5BC}';
    if (mimeType === 'application/json') return '\u{1F4CB}';
    if (mimeType === 'application/pdf') return '\u{1F4C4}';
    if (mimeType.startsWith('video/')) return '\u{1F3AC}';
    if (mimeType.startsWith('text/')) return '\u{1F4DD}';
    return '\u{1F4CE}';
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { mouseDownOnOverlay.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => {
        if (mouseDownOnOverlay.current && e.target === e.currentTarget) onClose();
        mouseDownOnOverlay.current = false;
      }}
    >
      <div className="modal start-modal" onMouseDown={() => { mouseDownOnOverlay.current = false; }}>
        <button className="close-btn" onClick={onClose}>&times;</button>
        <h3>Configure Chat Session</h3>

        {/* Suggested Goals */}
        {suggestedGoals.length > 0 && (
          <div className="suggested-goals">
            <label>Suggested Goals</label>
            <div className="goal-chips">
              {suggestedGoals.map((g, i) => (
                <button
                  key={i}
                  className={`goal-chip ${goal === g ? 'selected' : ''}`}
                  onClick={() => setGoal(g)}
                >
                  {g.length > 60 ? g.slice(0, 60) + '...' : g}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Shared Goal</label>
          <textarea
            placeholder="What should the agents work toward?

Example: Brainstorm and develop a comprehensive pitch for an innovative mobile app that solves a real problem for young professionals."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={5}
            autoFocus
          />
        </div>

        {/* Media Upload Section */}
        <div className="form-group">
          <label>Reference Media <span className="help-text" style={{ marginLeft: '0.5rem' }}>({uploadedFiles.length}/{MAX_SESSION_FILES})</span></label>
          <div className="media-upload-area">
            {uploadedFiles.length > 0 && (
              <div className="uploaded-files-grid">
                {uploadedFiles.map(file => (
                  <div key={file.id} className="uploaded-file-item" title={file.name}>
                    {file.preview ? (
                      <img src={file.preview} alt={file.name} className="file-thumbnail" />
                    ) : (
                      <div className="file-icon-placeholder">
                        <span className="file-type-icon">{getFileIcon(file.mimeType)}</span>
                        <span className="file-ext">{file.name.split('.').pop()?.toUpperCase()}</span>
                      </div>
                    )}
                    <div className="file-info">
                      <span className="file-name">{file.name.length > 20 ? file.name.slice(0, 18) + '...' : file.name}</span>
                      <span className="file-size">{formatFileSize(file.size)}</span>
                    </div>
                    <button
                      className="file-remove-btn"
                      onClick={() => removeFile(file.id)}
                      title="Remove file"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploadedFiles.length < MAX_SESSION_FILES && (
              <button
                className="media-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Processing...' : `+ Add Files`}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_MIME_TYPES.join(',')}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <span className="help-text">
              Images, JSON, text, PDF, or video for agents to reference, analyze, or remix
            </span>
          </div>
        </div>

        <div className="form-group">
          <label>Token Limit</label>
          <input
            type="number"
            value={tokenLimit}
            onChange={(e) => setTokenLimit(parseInt(e.target.value) || 100000)}
            min={1000}
            max={1000000}
          />
          <span className="help-text">
            ~{Math.round(tokenLimit / 750)} pages of conversation
          </span>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onStart(goal, tokenLimit, uploadedFiles)}
            disabled={!goal.trim()}
          >
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Read a File object as base64 string (without the data URL prefix)
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function QuickSaveModal({ onClose, onSave }) {
  const [name, setName] = useState('');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal save-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>
        <h3>Save Session</h3>
        <input
          type="text"
          placeholder="Session name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name)}
          autoFocus
        />
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onSave(name)}
            disabled={!name.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
