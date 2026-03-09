import React, { useState, useRef, useEffect } from 'react';

export function GoalHeader({ goal, isRunning }) {
  const [showModal, setShowModal] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const headerRef = useRef(null);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newHeight = Math.max(40, Math.min(200, e.clientY - headerRef.current.getBoundingClientRect().top));
      setHeaderHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(goal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!goal) return null;

  return (
    <>
      <div
        ref={headerRef}
        className="goal-header"
        style={{ height: headerHeight }}
        onClick={() => setShowModal(true)}
      >
        <div className="goal-label">
          <span className="goal-icon">🎯</span>
          <span>Session Goal</span>
          {isRunning && <span className="running-badge">Active</span>}
        </div>
        <div className="goal-preview">
          {goal}
        </div>
        <div className="goal-hint">Click to view full prompt</div>
        <div
          className="resize-handle"
          onMouseDown={handleMouseDown}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="resize-dots">⋯</span>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal goal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Session Goal / Initial Prompt</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <div className="goal-content">
              <pre>{goal}</pre>
            </div>
            <div className="modal-actions">
              <button
                className={`btn ${copied ? 'btn-success' : 'btn-secondary'}`}
                onClick={handleCopy}
              >
                {copied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
              <button className="btn btn-primary" onClick={() => setShowModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
