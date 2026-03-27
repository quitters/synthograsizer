import React, { useState, useEffect } from 'react';
import { STEP_GLYPHS, STATUS_COLORS } from '../data/workflowData';

const API_BASE = '/chatroom/api';

// ─── WorkflowInlineCard ───────────────────────────────────────────────────────
// Rendered inline in the message stream when a workflow is submitted.
// Auto-expands on failure, shows live elapsed time while running.

export function WorkflowInlineCard({ workflow }) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [actionError, setActionError] = useState(null);

  const status = workflow?.status ?? 'pending';
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  const steps = workflow?.steps ?? [];
  const doneCount = steps.filter(s => s.status === 'complete').length;
  const totalCount = steps.length;

  // Live elapsed counter while running
  useEffect(() => {
    if (!workflow?.startedAt || workflow?.completedAt) return;
    const tick = () =>
      setElapsed(Math.round((Date.now() - new Date(workflow.startedAt)) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [workflow?.startedAt, workflow?.completedAt]);

  // Auto-expand on failure so the error is visible
  useEffect(() => {
    if (status === 'failed') setExpanded(true);
  }, [status]);

  const displayElapsed = workflow?.completedAt
    ? Math.round(
        (new Date(workflow.completedAt) - new Date(workflow.startedAt)) / 1000
      )
    : elapsed;

  const handleCancel = async () => {
    try {
      setActionError(null);
      await fetch(`${API_BASE}/workflows/active/${workflow.id}/cancel`, {
        method: 'POST',
      });
    } catch (e) {
      setActionError(e.message);
    }
  };

  const handleRetry = async () => {
    try {
      setActionError(null);
      const res = await fetch(
        `${API_BASE}/workflows/active/${workflow.id}/retry`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e) {
      setActionError(e.message);
    }
  };

  const handleResume = async () => {
    try {
      setActionError(null);
      const res = await fetch(`${API_BASE}/workflows/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: workflow.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e) {
      setActionError(e.message);
    }
  };

  if (!workflow) return null;

  return (
    <div className={`wic wic-${status}`}>
      {/* Left-gutter icon mirrors the agent avatar area */}
      <div className="wic-gutter">
        <div className="wic-icon" style={{ color: sc, borderColor: sc }}>
          ⚡
        </div>
      </div>

      <div className="wic-body">
        {/* Header row — click to expand/collapse */}
        <div className="wic-header" onClick={() => setExpanded((e) => !e)}>
          <span className="wic-name">{workflow.name ?? 'Workflow'}</span>
          <span className="wic-status-text" style={{ color: sc }}>
            {status}
          </span>
          {workflow.startedAt && (
            <span className="wic-elapsed">{displayElapsed}s</span>
          )}
          {totalCount > 0 && (
            <span className="wic-step-count">
              {doneCount}/{totalCount}
            </span>
          )}
          <span className="wic-chevron">{expanded ? '▾' : '▸'}</span>
        </div>

        {/* Pip row — one glyph per step, coloured by status */}
        {steps.length > 0 && (
          <div className="wic-pip-row">
            {steps.map((step) => {
              const glyph = STEP_GLYPHS[step.type] ?? '◈';
              const pc = STATUS_COLORS[step.status ?? 'pending'];
              return (
                <div
                  key={step.id}
                  className={`wic-pip wic-pip-${step.status ?? 'pending'}`}
                  style={{ color: pc, borderColor: pc }}
                  title={`${step.id} · ${step.type}${step.status ? ' · ' + step.status : ''}${step.error ? '\n' + step.error : ''}`}
                >
                  <span className="wic-pip-glyph">{glyph}</span>
                  {step.loopProgress && (
                    <span className="wic-pip-loop">{step.loopProgress}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Expanded step-by-step detail */}
        {expanded && (
          <div className="wic-detail">
            {steps.map((step) => {
              const glyph = STEP_GLYPHS[step.type] ?? '◈';
              const stepColor = STATUS_COLORS[step.status ?? 'pending'];
              return (
                <div key={step.id} className="wic-step-row">
                  <span
                    className="wic-step-glyph"
                    style={{ color: stepColor }}
                  >
                    {glyph}
                  </span>
                  <span className="wic-step-id">{step.id}</span>
                  <span className="wic-step-type">
                    {step.type?.replace(/^synth_/, '') ?? step.type}
                  </span>
                  <span
                    className="wic-step-status"
                    style={{ color: stepColor }}
                  >
                    {step.status ?? '—'}
                  </span>
                  {step.loopProgress && (
                    <span className="wic-step-loop">↻ {step.loopProgress}</span>
                  )}
                  {step.error && (
                    <span
                      className="wic-step-error"
                      title={step.error}
                    >
                      ⚠ {step.error.slice(0, 80)}
                    </span>
                  )}
                </div>
              );
            })}

            {actionError && (
              <div className="wic-action-error">⚠ {actionError}</div>
            )}

            <div className="wic-actions">
              {status === 'running' && (
                <button
                  className="wic-btn wic-btn-cancel"
                  onClick={handleCancel}
                >
                  ✕ Cancel
                </button>
              )}
              {status === 'failed' && (
                <>
                  <button
                    className="wic-btn wic-btn-retry"
                    onClick={handleRetry}
                    title="Retry failed steps in memory"
                  >
                    ↺ Retry
                  </button>
                  <button
                    className="wic-btn wic-btn-resume"
                    onClick={handleResume}
                    title="Resume from saved checkpoint"
                  >
                    ↩ Resume
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
