import React, { useState } from 'react';
import { AgentAvatarEditor } from './AgentAvatarEditor';

export function AgentCard({ agent, onRemove, onAvatarChange, showRemove = true }) {
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleAvatarChange = (agentId, avatar) => {
    if (onAvatarChange) {
      onAvatarChange(agentId, avatar);
    }
  };

  return (
    <>
      <div className="agent-card" style={{ borderLeftColor: agent.color }}>
        <div className="agent-card-header">
          <div
            className="agent-avatar"
            style={{ backgroundColor: agent.color }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setShowAvatarEditor(true)}
            title="Click to edit avatar"
          >
            {agent.avatar ? (
              <img
                src={`data:${agent.avatar.mimeType};base64,${agent.avatar.imageData}`}
                alt={agent.name}
                className="avatar-image"
              />
            ) : (
              <span className="avatar-initials">
                {agent.name.split(' ').map(n => n[0]).join('')}
              </span>
            )}
            {isHovered && (
              <div className="avatar-edit-overlay">
                <span>✎</span>
              </div>
            )}
          </div>
          <div className="agent-info">
            <h4>{agent.name}</h4>
            {/* Only shown when this agent overrides the room's model or runs
                above the default deliberation — the badge marks the exception,
                not the norm. */}
            {(agent.model || (agent.thinkingLevel && agent.thinkingLevel !== 'low')) && (
              <span
                className="agent-model-badge"
                title={`Model: ${agent.model || 'room default'} · Deliberation: ${agent.thinkingLevel || 'low'}`}
              >
                {/* "gemini-3.8-flash" → "3.8-flash" — the prefix is noise here */}
                {agent.model && agent.model.replace(/^gemini-/, '')}
                {agent.thinkingLevel && agent.thinkingLevel !== 'low' &&
                  `${agent.model ? ' · ' : ''}${agent.thinkingLevel}`}
              </span>
            )}
            {agent.bio && (
              <p className="agent-preview">
                {agent.bio.substring(0, 100)}...
              </p>
            )}
          </div>
          {showRemove && (
            <button
              className="remove-btn"
              onClick={() => onRemove(agent.id)}
              title="Remove agent"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {showAvatarEditor && (
        <AgentAvatarEditor
          agent={agent}
          onAvatarChange={handleAvatarChange}
          onClose={() => setShowAvatarEditor(false)}
        />
      )}
    </>
  );
}
