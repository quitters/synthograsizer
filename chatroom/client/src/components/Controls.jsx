import React, { useState } from 'react';

export function Controls({
  isRunning,
  isPaused,
  onStart,
  onStop,
  onPause,
  onResume,
  onInject,
  onReset,
  disabled,
  suggestedGoals = [],
  onSelectGoal,
  hasMessages = false
}) {
  const [goal, setGoal] = useState('');
  const [tokenLimit, setTokenLimit] = useState(100000);
  const [injectMessage, setInjectMessage] = useState('');
  const [showStartModal, setShowStartModal] = useState(false);

  const handleStart = () => {
    if (!goal.trim()) return;
    onStart(goal.trim(), tokenLimit);
    setShowStartModal(false);
  };

  const handleInject = (e) => {
    e.preventDefault();
    if (!injectMessage.trim()) return;
    onInject(injectMessage.trim());
    setInjectMessage('');
  };

  return (
    <div className="controls">
      {/* Start Modal */}
      {showStartModal && (
        <div className="modal-overlay" onClick={() => setShowStartModal(false)}>
          <div className="modal start-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowStartModal(false)}>&times;</button>
            <h3>Start Chat Session</h3>

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
                      type="button"
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
              />
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
                Conversation will stop when this limit is reached (~{Math.round(tokenLimit / 750)} pages of text)
              </span>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowStartModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStart}
                disabled={!goal.trim()}
              >
                Start Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Controls */}
      <div className="control-buttons">
        {!isRunning ? (
          <>
            <button
              className="btn btn-primary"
              onClick={() => setShowStartModal(true)}
              disabled={disabled}
            >
              Start Chat
            </button>
            <button
              className="btn btn-danger"
              onClick={onReset}
              title="Reset everything"
            >
              Reset All
            </button>
          </>
        ) : (
          <>
            {isPaused ? (
              <button className="btn btn-primary" onClick={onResume}>
                Resume
              </button>
            ) : (
              <button className="btn btn-warning" onClick={onPause}>
                Pause
              </button>
            )}
            <button className="btn btn-danger" onClick={onStop}>
              Stop
            </button>
          </>
        )}
      </div>

      {/* Message Injection - show when running OR when there are messages (post-consensus) */}
      {(isRunning || hasMessages) && (
        <form onSubmit={handleInject} className="inject-form">
          <input
            type="text"
            placeholder={isRunning
              ? "Inject a message to guide the conversation..."
              : "Inject a message to continue..."
            }
            value={injectMessage}
            onChange={(e) => setInjectMessage(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={!injectMessage.trim()}
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}

export function StartModal({ onClose, onStart }) {
  const [goal, setGoal] = useState('');
  const [tokenLimit, setTokenLimit] = useState(100000);

  const handleStart = () => {
    if (!goal.trim()) return;
    onStart(goal.trim(), tokenLimit);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Configure Chat Session</h3>
        <div className="form-group">
          <label>Shared Goal</label>
          <textarea
            placeholder="What should the agents work toward?"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
            autoFocus
          />
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
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={!goal.trim()}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
