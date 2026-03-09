import React, { useState } from 'react';
import { AgentCard } from './AgentCard';

export function AgentSetup({ agents, onAddAgent, onRemoveAgent, onAvatarChange, onStartChat, onOpenTemplates, disabled }) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

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

    await onAddAgent(agentName, bio.trim());
    setName('');
    setBio('');
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
