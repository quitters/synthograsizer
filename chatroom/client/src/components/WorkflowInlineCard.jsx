import React, { useState, useEffect } from 'react';
import { STEP_GLYPHS, STATUS_COLORS } from '../data/workflowData';

const API_BASE = '/chatroom/api';

/** Friendly labels for raw engine status strings */
const STATUS_LABEL = {
  pending:   'pending',
  running:   'running',
  complete:  'done',
  success:   'done',
  failed:    'failed',
  cancelled: 'cancelled',
};

// ─── StepOutputPanel ──────────────────────────────────────────────────────────

function StepOutputPanel({ step }) {
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(false);

  const result = step.result;
  const mediaId = result?.mediaId;
  const mediaType = result?.mediaType;

  useEffect(() => {
    if (!mediaId) return;
    setLoading(true);
    fetch(`${API_BASE}/chat/media/${mediaId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setMedia(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [mediaId]);

  if (!result || Object.keys(result).length === 0) return <div className="wic-output-empty">Step completed — no output to display.</div>;

  if (mediaType === 'image' || media?.type === 'image') {
    const src = media?.data ? `data:${media.mimeType || 'image/png'};base64,${media.data}` : null;
    return (
      <div className="wic-output">
        {loading && <span className="wic-output-loading">Loading…</span>}
        {src && <img className="wic-output-img" src={src} alt={step.id} />}
      </div>
    );
  }

  if (mediaType === 'video' || media?.type === 'video') {
    const src = media?.data ? `data:${media.mimeType || 'video/mp4'};base64,${media.data}` : null;
    return (
      <div className="wic-output">
        {loading && <span className="wic-output-loading">Loading…</span>}
        {src && <video className="wic-output-video" controls><source src={src} type={media.mimeType || 'video/mp4'} /></video>}
      </div>
    );
  }

  const textContent =
    result.text ||
    result.description ||
    result.narrative ||
    result.template?.promptTemplate ||
    (result.template ? JSON.stringify(result.template, null, 2) : null) ||
    JSON.stringify(result, null, 2);

  return (
    <div className="wic-output">
      <pre className="wic-output-text">{textContent}</pre>
    </div>
  );
}

// ─── WorkflowInlineCard ───────────────────────────────────────────────────────

export function WorkflowInlineCard({ workflow }) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [openStep, setOpenStep] = useState(null);

  const status = workflow?.status ?? 'pending';
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  const steps = workflow?.steps ?? [];
  const doneCount    = steps.filter(s => s.status === 'complete' || s.status === 'success').length;
  const runningCount = steps.filter(s => s.status === 'running').length;
  const failedCount  = steps.filter(s => s.status === 'failed').length;
  const totalCount   = steps.length;

  useEffect(() => {
    if (!workflow?.startedAt || workflow?.completedAt) return;
    const tick = () => setElapsed(Math.round((Date.now() - new Date(workflow.startedAt)) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [workflow?.startedAt, workflow?.completedAt]);

  useEffect(() => {
    if (status === 'failed') setExpanded(true);
  }, [status]);

  const displayElapsed = workflow?.completedAt
    ? Math.round((new Date(workflow.completedAt) - new Date(workflow.startedAt)) / 1000)
    : elapsed;

  const handleCancel = async () => {
    try {
      setActionError(null);
      await fetch(`${API_BASE}/workflows/active/${workflow.id}/cancel`, { method: 'POST' });
    } catch (e) { setActionError(e.message); }
  };

  const handleRetry = async () => {
    try {
      setActionError(null);
      const res = await fetch(`${API_BASE}/workflows/active/${workflow.id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e) { setActionError(e.message); }
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
    } catch (e) { setActionError(e.message); }
  };

  const toggleStep = (stepId) => setOpenStep(prev => prev === stepId ? null : stepId);

  if (!workflow) return null;

  return (
    <div className={`wic wic-${status}`}>
      <div className="wic-gutter">
        <div className="wic-icon" style={{ color: sc, borderColor: sc }}>⚡</div>
      </div>

      <div className="wic-body">
        <div className="wic-header" onClick={() => setExpanded(e => !e)}>
          <span className="wic-name">{workflow.name ?? 'Workflow'}</span>
          <span className="wic-status-text" style={{ color: sc }}>{STATUS_LABEL[status] ?? status}</span>
          {workflow.startedAt && <span className="wic-elapsed">{displayElapsed}s</span>}
          {totalCount > 0 && (
            <span className="wic-step-count">
              {doneCount}/{totalCount}
              {runningCount > 0 && <span className="wic-count-running"> · {runningCount} running</span>}
              {failedCount > 0 && <span className="wic-count-failed"> · {failedCount} failed</span>}
            </span>
          )}
          <span className="wic-chevron">{expanded ? '▾' : '▸'}</span>
        </div>

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
                  title={`${step.id} · ${step.type}${step.status ? ' · ' + (STATUS_LABEL[step.status] ?? step.status) : ''}${step.error ? '\n' + step.error : ''}`}
                  onClick={() => { setExpanded(true); toggleStep(step.id); }}
                >
                  <span className="wic-pip-glyph">{glyph}</span>
                  {step.loopProgress && <span className="wic-pip-loop">{step.loopProgress}</span>}
                </div>
              );
            })}
          </div>
        )}

        {expanded && (
          <div className="wic-detail">
            {steps.map((step) => {
              const glyph = STEP_GLYPHS[step.type] ?? '◈';
              const stepColor = STATUS_COLORS[step.status ?? 'pending'];
              const isOpen = openStep === step.id;
              const isFailed = step.status === 'failed';
              const isDone = step.status === 'complete' || step.status === 'success';
              const canView = isDone && step.result;
              const isStreaming = step.status === 'running' && step.liveText;

              return (
                <div key={step.id} className="wic-step-block">
                  <div
                    className={`wic-step-row${isDone || isFailed || isStreaming ? ' wic-step-row-clickable' : ''}`}
                    onClick={() => (isDone || isFailed || isStreaming) && toggleStep(step.id)}
                  >
                    <span className="wic-step-glyph" style={{ color: stepColor }}>{glyph}</span>
                    <span className="wic-step-id">{step.id}</span>
                    <span className="wic-step-type">{step.type?.replace(/^synth_/, '') ?? step.type}</span>
                    <span className="wic-step-status" style={{ color: stepColor }}>{STATUS_LABEL[step.status] ?? step.status ?? '—'}</span>
                    {step.loopProgress && <span className="wic-step-loop">↻ {step.loopProgress}</span>}
                    {step.error && (
                      <span className="wic-step-error" title={step.error}>⚠ {step.error.slice(0, 80)}</span>
                    )}
                    <span className="wic-step-actions">
                      {(isDone || isFailed || isStreaming) && (
                        <span className="wic-step-expand-hint" style={{ color: stepColor }}>
                          {isOpen ? '▴' : '▾'}
                        </span>
                      )}
                    </span>
                  </div>

                  {isOpen && (
                    <div className="wic-step-output">
                      {isStreaming
                        ? <div className="wic-output wic-output-streaming">
                            <pre className="wic-output-text">{step.liveText}<span className="wic-cursor">▋</span></pre>
                          </div>
                        : canView
                          ? <StepOutputPanel step={step} />
                          : isFailed
                            ? <div className="wic-output-empty">{step.error ? `Error: ${step.error}` : 'Step failed with no error details.'}</div>
                            : isDone
                              ? <StepOutputPanel step={step} />
                              : <div className="wic-output-empty">No output yet.</div>
                      }
                    </div>
                  )}
                </div>
              );
            })}

            {actionError && <div className="wic-action-error">⚠ {actionError}</div>}

            <div className="wic-actions">
              {status === 'running' && (
                <button className="wic-btn wic-btn-cancel" onClick={handleCancel}>✕ Cancel</button>
              )}
              {status === 'failed' && (
                <>
                  <button className="wic-btn wic-btn-retry" onClick={handleRetry} title="Retry failed steps in memory">↺ Retry</button>
                  <button className="wic-btn wic-btn-resume" onClick={handleResume} title="Resume from saved checkpoint">↩ Resume</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
