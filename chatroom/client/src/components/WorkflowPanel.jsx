import React, { useState, useCallback } from 'react';

const API_BASE = '/chatroom/api';

// ─── Step status icons & colours ─────────────────────────────────────────────

const STATUS_META = {
  pending:  { icon: '○', label: 'Pending',   color: '#666' },
  running:  { icon: '◉', label: 'Running',   color: '#f0a500' },
  complete: { icon: '●', label: 'Complete',  color: '#4caf50' },
  failed:   { icon: '✕', label: 'Failed',    color: '#e94560' },
};

const WORKFLOW_STATUS_META = {
  running:   { label: 'Running',   color: '#f0a500', bg: 'rgba(240,165,0,0.12)' },
  complete:  { label: 'Complete',  color: '#4caf50', bg: 'rgba(76,175,80,0.12)' },
  failed:    { label: 'Failed',    color: '#e94560', bg: 'rgba(233,69,96,0.12)' },
  cancelled: { label: 'Cancelled', color: '#888',    bg: 'rgba(136,136,136,0.10)' },
};

// Truncate a step type for compact display: "synth_image" → "image"
const shortType = (type) => type?.replace(/^synth_/, '') ?? type;

// ─── Single workflow card ─────────────────────────────────────────────────────

function WorkflowCard({ workflow, onCancel, onRetry, onResume }) {
  const [expanded, setExpanded] = useState(false);
  const sm = WORKFLOW_STATUS_META[workflow.status] ?? WORKFLOW_STATUS_META.running;

  const doneCount  = workflow.steps?.filter(s => s.status === 'complete').length ?? 0;
  const totalCount = workflow.steps?.length ?? 0;
  const failCount  = workflow.steps?.filter(s => s.status === 'failed').length ?? 0;

  const elapsed = workflow.startedAt
    ? workflow.completedAt
      ? Math.round((new Date(workflow.completedAt) - new Date(workflow.startedAt)) / 1000)
      : Math.round((Date.now() - new Date(workflow.startedAt)) / 1000)
    : null;

  return (
    <div className="workflow-card" style={{ borderLeftColor: sm.color, background: sm.bg }}>
      {/* Header row */}
      <div className="workflow-card-header" onClick={() => setExpanded(e => !e)}>
        <span className="workflow-card-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="workflow-card-name" title={workflow.name}>{workflow.name}</span>
        <span className="workflow-card-badge" style={{ color: sm.color }}>{sm.label}</span>
        {elapsed !== null && (
          <span className="workflow-card-elapsed">{elapsed}s</span>
        )}
        <span className="workflow-card-progress">{doneCount}/{totalCount}</span>
      </div>

      {/* Step progress bar */}
      <div className="workflow-progress-bar">
        {(workflow.steps ?? []).map(step => {
          const s = STATUS_META[step.status] ?? STATUS_META.pending;
          return (
            <div
              key={step.id}
              className="workflow-step-pip"
              title={`${step.id} (${shortType(step.type)}) — ${s.label}${step.error ? ': ' + step.error : ''}`}
              style={{ background: s.color }}
            />
          );
        })}
      </div>

      {/* Expanded step list */}
      {expanded && (
        <div className="workflow-step-list">
          {(workflow.steps ?? []).map(step => {
            const s = STATUS_META[step.status] ?? STATUS_META.pending;
            return (
              <div key={step.id} className="workflow-step-row">
                <span className="workflow-step-icon" style={{ color: s.color }}>{s.icon}</span>
                <span className="workflow-step-id">{step.id}</span>
                <span className="workflow-step-type">{shortType(step.type)}</span>
                {step.error && (
                  <span className="workflow-step-error" title={step.error}>⚠ {step.error.slice(0, 60)}</span>
                )}
                {step.summary?.mediaId && (
                  <span className="workflow-step-mediaid" title={step.summary.mediaId}>
                    📎 {step.summary.mediaId.slice(0, 8)}…
                  </span>
                )}
              </div>
            );
          })}

          {/* Action buttons */}
          <div className="workflow-card-actions">
            {workflow.status === 'running' && (
              <button
                className="workflow-btn workflow-btn-cancel"
                onClick={() => onCancel(workflow.id)}
              >
                Cancel
              </button>
            )}
            {(workflow.status === 'failed') && (
              <>
                <button
                  className="workflow-btn workflow-btn-retry"
                  onClick={() => onRetry(workflow.id)}
                  title="Retry failed steps (in-memory)"
                >
                  Retry
                </button>
                <button
                  className="workflow-btn workflow-btn-resume"
                  onClick={() => onResume(workflow.id)}
                  title="Resume from saved checkpoint"
                >
                  Resume from checkpoint
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WorkflowPanel ────────────────────────────────────────────────────────────

/**
 * Props:
 *   workflows  {Map<id, workflowState>}  — live workflow states from App.jsx
 *   onClearAll {Function}                — clear completed/failed workflows from view
 */
export function WorkflowPanel({ workflows, onClearAll }) {
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError]         = useState(null);

  const workflowList = [...(workflows?.values() ?? [])].sort(
    (a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')
  );

  const activeCount = workflowList.filter(w => w.status === 'running').length;

  const handleCancel = useCallback(async (id) => {
    try {
      await fetch(`${API_BASE}/workflows/active/${id}/cancel`, { method: 'POST' });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleRetry = useCallback(async (id) => {
    try {
      setError(null);
      await fetch(`${API_BASE}/workflows/active/${id}/retry`, { method: 'POST' });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleResume = useCallback(async (id) => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/workflows/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: id }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  if (workflowList.length === 0) return null;

  return (
    <div className={`workflow-panel ${collapsed ? 'workflow-panel-collapsed' : ''}`}>
      {/* Panel header */}
      <div className="workflow-panel-header" onClick={() => setCollapsed(c => !c)}>
        <span className="workflow-panel-title">
          ⚡ Workflows
          {activeCount > 0 && (
            <span className="workflow-panel-badge">{activeCount} running</span>
          )}
        </span>
        <div className="workflow-panel-header-actions" onClick={e => e.stopPropagation()}>
          {workflowList.some(w => w.status !== 'running') && (
            <button
              className="workflow-btn workflow-btn-clear"
              onClick={onClearAll}
              title="Clear completed and failed workflows"
            >
              Clear
            </button>
          )}
          <span className="workflow-panel-chevron">{collapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="workflow-panel-body">
          {error && (
            <div className="workflow-panel-error">
              {error}
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}
          {workflowList.map(wf => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onCancel={handleCancel}
              onRetry={handleRetry}
              onResume={handleResume}
            />
          ))}
        </div>
      )}
    </div>
  );
}
