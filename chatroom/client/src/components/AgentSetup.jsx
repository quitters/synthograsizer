import React, { useState, useEffect } from 'react';
import { AgentCard } from './AgentCard';

const API_BASE = '/chatroom/api';

export function AgentSetup({ agents, onAddAgent, onRemoveAgent, onAvatarChange, onStartChat, onOpenTemplates, disabled }) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  // Model / deliberation options come from the server so the registry stays
  // in one place (server/config/models.js).
  const [modelOptions, setModelOptions] = useState(null);
  const [model, setModel] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState('');
  // Empty unless the server is in function-calling mode — a tool tier means
  // nothing on the tag path, so the selector stays hidden there.
  const [toolTier, setToolTier] = useState('');
  // Voice used when the session is rendered to audio. Left blank so the
  // server assigns a distinct default by roster position.
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/agents/models`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        setModelOptions(data);
        setModel(data.defaultModel);
        setThinkingLevel(data.defaultThinkingLevel);
        if (data.toolTiers?.length) setToolTier(data.defaultToolTier);
      })
      .catch(() => { /* selectors stay hidden; server defaults apply */ });

    fetch(`${API_BASE}/chat/voices`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data?.voices) setVoices(data.voices); })
      .catch(() => { /* picker stays hidden; server assigns a default */ });

    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bio.trim()) return;

    // Try to extract name from first line if not provided
    let agentName = name.trim();
    if (!agentName) {
      const firstLine = bio.split('\n')[0];
      const match = firstLine.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
      if (match) {
        agentName = match[1];
      }
    }

    await onAddAgent(agentName, bio.trim(), {
      model,
      thinkingLevel,
      ...(toolTier ? { tools: toolTier } : {}),
      // Omitted when blank so the server picks a distinct default.
      ...(voice ? { voice } : {}),
    });
    setVoice('');
    setName('');
    setBio('');
    // Leave model/thinkingLevel as-is — adding a panel of similar agents is
    // the common case, and re-picking each time is tedious.
  };

  const canStart = agents.length >= 2;

  return (
    <div className="agent-setup">
      <div className="section-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h2>Agent Setup ({agents.length})</h2>
        <span className="toggle">{isExpanded ? '−' : '+'}</span>
      </div>

      {isExpanded && (
        <>
          <div className="agents-list">
            {agents.length === 0 ? (
              <div className="empty-message">
                <p>No agents added yet. Add at least 2 agents to start.</p>
                {onOpenTemplates && (
                  <button
                    className="btn btn-secondary"
                    onClick={onOpenTemplates}
                    style={{ marginTop: '0.75rem' }}
                  >
                    📋 Browse Templates
                  </button>
                )}
              </div>
            ) : (
              agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onRemove={onRemoveAgent}
                  onAvatarChange={onAvatarChange}
                  showRemove={!disabled}
                />
              ))
            )}
          </div>

          {!disabled && (
            <form onSubmit={handleSubmit} className="add-agent-form">
              <input
                type="text"
                placeholder="Agent name (optional - will parse from bio)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="agent-name-input"
              />
              <textarea
                placeholder="Paste the agent bio here...

Example:
John Smith - Role Title
EXPERTISE: Description of expertise...
LENS: Their perspective...
STYLE: How they communicate..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="agent-bio-input"
                rows={8}
              />
              {(modelOptions || voices.length > 0) && (
                <div className="agent-model-row">
                  {modelOptions && (<>
                  <label className="agent-model-field">
                    <span className="agent-model-label">Model</span>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      title={modelOptions.models.find(m => m.id === model)?.blurb || ''}
                    >
                      {modelOptions.models.map(m => (
                        <option key={m.id} value={m.id} title={m.blurb}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="agent-model-field">
                    <span className="agent-model-label">Deliberation</span>
                    <select
                      value={thinkingLevel}
                      onChange={(e) => setThinkingLevel(e.target.value)}
                      title="How much reasoning the model does before answering. Thinking is billed as output — keep it low for conversational personas."
                    >
                      {modelOptions.thinkingLevels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </label>
                  {modelOptions.toolTiers?.length > 0 && (
                    <label className="agent-model-field">
                      <span className="agent-model-label">Tools</span>
                      <select
                        value={toolTier}
                        onChange={(e) => setToolTier(e.target.value)}
                        title={modelOptions.toolTiers.find(t => t.id === toolTier)?.blurb || ''}
                      >
                        {modelOptions.toolTiers.map(t => (
                          <option key={t.id} value={t.id} title={t.blurb}>{t.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  </>)}
                  {voices.length > 0 && (
                    <label className="agent-model-field">
                      <span className="agent-model-label">Voice</span>
                      <select
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        title="Used when the session is rendered to audio"
                      >
                        <option value="">Auto</option>
                        {voices.map(v => (
                          <option key={v.id} value={v.id}>{v.id} — {v.style}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
              <div className="form-actions">
                <button
                  type="submit"
                  disabled={!bio.trim()}
                  className="btn btn-secondary"
                >
                  Add Agent
                </button>
                <button
                  type="button"
                  onClick={onStartChat}
                  disabled={!canStart}
                  className="btn btn-primary"
                >
                  {canStart ? 'Configure & Start Chat' : `Need ${2 - agents.length} more agent(s)`}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
