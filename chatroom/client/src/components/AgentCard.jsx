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
