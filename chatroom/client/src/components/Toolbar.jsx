import React, { useState, useRef } from 'react';
import {
  exportAsMarkdown,
  exportAsJSON,
  exportAgentConfigs,
  parseAgentConfigs,
  downloadFile,
  saveSession,
  loadSession,
  listSavedSessions,
  deleteSession,
  exportMediaAsZip
} from '../utils/export';
import { listTemplates, getTemplate } from '../utils/agentTemplates';

export function Toolbar({
  agents,
  messages,
  goal,
  tokenCount,
  isRunning,
  onLoadAgents,
  onClearAll,
  onOpenTemplates
}) {
  const [showMenu, setShowMenu] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [savedSessions, setSavedSessions] = useState([]);
  const [isExportingMedia, setIsExportingMedia] = useState(false);
  const fileInputRef = useRef(null);

  // Count images in messages
  const imageCount = messages.reduce((count, msg) =>
    count + (msg.images?.length || 0), 0);

  const handleExportMarkdown = () => {
    const md = exportAsMarkdown(messages, agents, goal, { tokenCount });
    const filename = `chat-${new Date().toISOString().split('T')[0]}.md`;
    downloadFile(md, filename, 'text/markdown');
    setShowMenu(null);
  };

  const handleExportJSON = () => {
    const json = exportAsJSON(messages, agents, goal, { tokenCount });
    const filename = `chat-${new Date().toISOString().split('T')[0]}.json`;
    downloadFile(json, filename, 'application/json');
    setShowMenu(null);
  };

  const handleExportAgents = () => {
    const json = exportAgentConfigs(agents);
    const filename = `agents-${new Date().toISOString().split('T')[0]}.json`;
    downloadFile(json, filename, 'application/json');
    setShowMenu(null);
  };

  const handleExportMedia = async () => {
    if (imageCount === 0) {
      alert('No media to export');
      return;
    }

    setIsExportingMedia(true);
    setShowMenu(null);

    try {
      const result = await exportMediaAsZip(messages, 'chatroom');
      console.log(`Exported ${result.imageCount} images`);
    } catch (err) {
      console.error('Media export failed:', err);
      alert(`Failed to export media: ${err.message}`);
    } finally {
      setIsExportingMedia(false);
    }
  };

  const handleImportAgents = () => {
    fileInputRef.current?.click();
    setShowMenu(null);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const agents = parseAgentConfigs(text);
      onLoadAgents(agents);
    } catch (err) {
      alert(`Failed to import agents: ${err.message}`);
    }

    e.target.value = '';
  };

  const handleSaveSession = () => {
    if (!sessionName.trim()) {
      alert('Please enter a session name');
      return;
    }

    const key = `session_${Date.now()}`;
    const success = saveSession(key, {
      name: sessionName,
      goal,
      agents,
      messages,
      tokenCount
    });

    if (success) {
      setShowSaveModal(false);
      setSessionName('');
      alert('Session saved!');
    } else {
      alert('Failed to save session');
    }
  };

  const handleOpenLoadModal = () => {
    setSavedSessions(listSavedSessions());
    setShowLoadModal(true);
    setShowMenu(null);
  };

  const handleLoadSession = (key) => {
    const session = loadSession(key);
    if (session) {
      onLoadAgents(session.agents || [], session);
      setShowLoadModal(false);
    }
  };

  const handleDeleteSession = (key) => {
    if (confirm('Delete this session?')) {
      deleteSession(key);
      setSavedSessions(listSavedSessions());
    }
  };

  const handleLoadTemplate = (templateKey) => {
    const template = getTemplate(templateKey);
    if (template) {
      onLoadAgents(template.agents);
      setShowTemplatesModal(false);
    }
  };

  const templates = listTemplates();

  return (
    <div className="toolbar">
      {/* Export Menu */}
      <div className="toolbar-dropdown">
        <button
          className="toolbar-btn"
          onClick={() => setShowMenu(showMenu === 'export' ? null : 'export')}
          disabled={messages.length === 0}
        >
          Export
        </button>
        {showMenu === 'export' && (
          <div className="dropdown-menu">
            <button onClick={handleExportMarkdown}>
              Export as Markdown
            </button>
            <button onClick={handleExportJSON}>
              Export as JSON
            </button>
            <hr />
            <button onClick={handleExportMedia} disabled={imageCount === 0 || isExportingMedia}>
              {isExportingMedia ? 'Exporting...' : `Download All Media (${imageCount})`}
            </button>
            <hr />
            <button onClick={handleExportAgents} disabled={agents.length === 0}>
              Export Agent Configs
            </button>
          </div>
        )}
      </div>

      {/* Session Menu */}
      <div className="toolbar-dropdown">
        <button
          className="toolbar-btn"
          onClick={() => setShowMenu(showMenu === 'session' ? null : 'session')}
        >
          Session
        </button>
        {showMenu === 'session' && (
          <div className="dropdown-menu">
            <button
              onClick={() => {
                setShowSaveModal(true);
                setShowMenu(null);
              }}
              disabled={agents.length === 0}
            >
              Save Session
            </button>
            <button onClick={handleOpenLoadModal}>
              Load Session
            </button>
            <hr />
            <button onClick={() => { onClearAll(); setShowMenu(null); }}>
              New Session
            </button>
          </div>
        )}
      </div>

      {/* Agents Menu */}
      <div className="toolbar-dropdown">
        <button
          className="toolbar-btn"
          onClick={() => setShowMenu(showMenu === 'agents' ? null : 'agents')}
          disabled={isRunning}
        >
          Agents
        </button>
        {showMenu === 'agents' && (
          <div className="dropdown-menu">
            <button onClick={() => {
              setShowMenu(null);
              if (onOpenTemplates) {
                onOpenTemplates();
              } else {
                setShowTemplatesModal(true);
              }
            }}>
              Load Template
            </button>
            <button onClick={handleImportAgents}>
              Import from File
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Click outside to close */}
      {showMenu && (
        <div className="dropdown-backdrop" onClick={() => setShowMenu(null)} />
      )}

      {/* Save Session Modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal save-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowSaveModal(false)}>
              &times;
            </button>
            <h3>Save Session</h3>
            <input
              type="text"
              placeholder="Session name..."
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveSession()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveSession}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Session Modal */}
      {showLoadModal && (
        <div className="modal-overlay" onClick={() => setShowLoadModal(false)}>
          <div className="modal load-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowLoadModal(false)}>
              &times;
            </button>
            <h3>Load Session</h3>
            {savedSessions.length === 0 ? (
              <p className="empty-state">No saved sessions</p>
            ) : (
              <div className="session-list">
                {savedSessions.map(session => (
                  <div key={session.key} className="session-item">
                    <div className="session-info">
                      <strong>{session.name}</strong>
                      <span className="session-meta">
                        {session.messageCount} messages • {new Date(session.savedAt).toLocaleDateString()}
                      </span>
                      {session.goal && (
                        <span className="session-goal">{session.goal.slice(0, 50)}...</span>
                      )}
                    </div>
                    <div className="session-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleLoadSession(session.key)}
                      >
                        Load
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteSession(session.key)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplatesModal && (
        <div className="modal-overlay" onClick={() => setShowTemplatesModal(false)}>
          <div className="modal templates-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowTemplatesModal(false)}>
              &times;
            </button>
            <h3>Agent Templates</h3>
            <div className="template-list">
              {templates.map(template => (
                <div key={template.key} className="template-item">
                  <div className="template-info">
                    <strong>{template.name}</strong>
                    <span className="template-meta">{template.agentCount} agents</span>
                    <span className="template-desc">{template.description}</span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleLoadTemplate(template.key)}
                  >
                    Use
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
