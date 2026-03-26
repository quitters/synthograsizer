import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = '/chatroom/api';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── SaveForm ────────────────────────────────────────────────────────────────

function SaveForm({ onSave }) {
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [json, setJson]         = useState('');
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    let definition;
    try {
      definition = JSON.parse(json);
      if (!Array.isArray(definition.steps)) throw new Error('definition must have a steps array');
    } catch (err) {
      setError(`Invalid JSON: ${err.message}`);
      return;
    }

    setSaving(true);
    try {
      await onSave({ ...definition, name: name || definition.name || 'Unnamed' }, { description: desc });
      setName(''); setDesc(''); setJson('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="wl-save-form" onSubmit={handleSubmit}>
      <h3 className="wl-section-title">Save a Workflow</h3>
      <div className="wl-save-row">
        <input
          className="wl-input"
          placeholder="Workflow name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="wl-input"
          placeholder="Description (optional)"
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
      </div>
      <textarea
        className="wl-textarea"
        placeholder={'Paste workflow JSON here…\n{\n  "name": "My Workflow",\n  "steps": [...]\n}'}
        value={json}
        onChange={e => setJson(e.target.value)}
        rows={6}
        spellCheck={false}
      />
      {error && <div className="wl-error">{error}</div>}
      <button className="wl-btn wl-btn-primary" type="submit" disabled={!json.trim() || saving}>
        {saving ? 'Saving…' : 'Save to Library'}
      </button>
    </form>
  );
}

// ─── WorkflowRow ─────────────────────────────────────────────────────────────

function WorkflowRow({ entry, onRun, onDelete, onViewJson }) {
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    try { await onRun(entry.id); }
    finally { setRunning(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    setDeleting(true);
    try { await onDelete(entry.id); }
    finally { setDeleting(false); }
  };

  return (
    <div className="wl-row">
      <div className="wl-row-info">
        <span className="wl-row-name">{entry.name}</span>
        {entry.description && (
          <span className="wl-row-desc">{entry.description}</span>
        )}
        <span className="wl-row-meta">
          {entry.stepCount} step{entry.stepCount !== 1 ? 's' : ''} · saved {formatDate(entry.savedAt)}
        </span>
      </div>
      <div className="wl-row-actions">
        <button
          className="wl-btn wl-btn-sm"
          onClick={() => onViewJson(entry.id)}
          title="View JSON"
        >
          { }
        </button>
        <button
          className="wl-btn wl-btn-sm wl-btn-run"
          onClick={handleRun}
          disabled={running}
          title="Run this workflow"
        >
          {running ? '…' : '▶ Run'}
        </button>
        <button
          className="wl-btn wl-btn-sm wl-btn-danger"
          onClick={handleDelete}
          disabled={deleting}
          title="Delete"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

// ─── CheckpointRow ───────────────────────────────────────────────────────────

function CheckpointRow({ cp, onResume, onDelete }) {
  const [resuming, setResuming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleResume = async () => {
    setResuming(true);
    try { await onResume(cp.workflowId); }
    finally { setResuming(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete checkpoint for "${cp.name}"?`)) return;
    setDeleting(true);
    try { await onDelete(cp.workflowId); }
    finally { setDeleting(false); }
  };

  return (
    <div className="wl-row wl-row-checkpoint">
      <div className="wl-row-info">
        <span className="wl-row-name">{cp.name}</span>
        <span className="wl-row-meta">
          {cp.completedSteps} completed · {cp.failedSteps} failed · saved {formatDate(cp.savedAt)}
        </span>
        <span className="wl-row-id" title={cp.workflowId}>{cp.workflowId.slice(0, 8)}…</span>
      </div>
      <div className="wl-row-actions">
        <button
          className="wl-btn wl-btn-sm wl-btn-resume"
          onClick={handleResume}
          disabled={resuming}
          title="Resume from checkpoint"
        >
          {resuming ? '…' : '↩ Resume'}
        </button>
        <button
          className="wl-btn wl-btn-sm wl-btn-danger"
          onClick={handleDelete}
          disabled={deleting}
          title="Delete checkpoint"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

// ─── JsonViewer ──────────────────────────────────────────────────────────────

function JsonViewer({ entryId, onClose }) {
  const [json, setJson] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/workflows/${entryId}`)
      .then(r => r.json())
      .then(data => setJson(JSON.stringify(data.definition, null, 2)));
  }, [entryId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="wl-json-viewer">
      <div className="wl-json-header">
        <span>Workflow JSON</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="wl-btn wl-btn-sm" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button className="wl-btn wl-btn-sm" onClick={onClose}>✕</button>
        </div>
      </div>
      <pre className="wl-json-pre">{json ?? 'Loading…'}</pre>
    </div>
  );
}

// ─── WorkflowLibraryModal ────────────────────────────────────────────────────

export function WorkflowLibraryModal({ isOpen, onClose, onWorkflowStarted }) {
  const [tab, setTab]               = useState('library'); // 'library' | 'checkpoints' | 'save'
  const [entries, setEntries]       = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [viewingId, setViewingId]   = useState(null);

  const fetchLibrary = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [libRes, cpRes] = await Promise.all([
        fetch(`${API_BASE}/workflows`),
        fetch(`${API_BASE}/workflows/checkpoints`),
      ]);
      setEntries(await libRes.json());
      setCheckpoints(await cpRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchLibrary();
  }, [isOpen, fetchLibrary]);

  const handleRun = async (savedId) => {
    const res = await fetch(`${API_BASE}/workflows/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    onWorkflowStarted?.(data.workflowId);
    onClose();
  };

  const handleDelete = async (id) => {
    await fetch(`${API_BASE}/workflows/${id}`, { method: 'DELETE' });
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleSave = async (definition, meta) => {
    const res = await fetch(`${API_BASE}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definition, meta }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchLibrary();
    setTab('library');
  };

  const handleResume = async (workflowId) => {
    const res = await fetch(`${API_BASE}/workflows/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    onWorkflowStarted?.(data.workflowId);
    onClose();
  };

  const handleDeleteCheckpoint = async (workflowId) => {
    await fetch(`${API_BASE}/workflows/checkpoints/${workflowId}`, { method: 'DELETE' });
    setCheckpoints(prev => prev.filter(c => c.workflowId !== workflowId));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="wl-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>

        <div className="wl-header">
          <h2>Workflow Library</h2>
          <p className="wl-subtitle">Save, manage, and run your creative pipelines</p>
        </div>

        <div className="wl-tabs">
          {[
            { id: 'library',     label: `Library (${entries.length})` },
            { id: 'checkpoints', label: `Checkpoints (${checkpoints.length})` },
            { id: 'save',        label: '+ Save New' },
          ].map(t => (
            <button
              key={t.id}
              className={`wl-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => { setTab(t.id); setViewingId(null); }}
            >
              {t.label}
            </button>
          ))}
          <button className="wl-refresh" onClick={fetchLibrary} title="Refresh">↻</button>
        </div>

        {error && <div className="wl-error wl-error-global">{error}</div>}

        <div className="wl-body">
          {loading && <div className="wl-loading">Loading…</div>}

          {/* JSON viewer overlay */}
          {viewingId && (
            <JsonViewer entryId={viewingId} onClose={() => setViewingId(null)} />
          )}

          {/* Library tab */}
          {!viewingId && tab === 'library' && !loading && (
            entries.length === 0
              ? <div className="wl-empty">No saved workflows yet. Use the "+ Save New" tab to add one.</div>
              : entries.map(entry => (
                  <WorkflowRow
                    key={entry.id}
                    entry={entry}
                    onRun={handleRun}
                    onDelete={handleDelete}
                    onViewJson={setViewingId}
                  />
                ))
          )}

          {/* Checkpoints tab */}
          {!viewingId && tab === 'checkpoints' && !loading && (
            checkpoints.length === 0
              ? <div className="wl-empty">No resumable checkpoints. Failed workflows save their progress here automatically.</div>
              : checkpoints.map(cp => (
                  <CheckpointRow
                    key={cp.workflowId}
                    cp={cp}
                    onResume={handleResume}
                    onDelete={handleDeleteCheckpoint}
                  />
                ))
          )}

          {/* Save tab */}
          {!viewingId && tab === 'save' && (
            <SaveForm onSave={handleSave} />
          )}
        </div>
      </div>
    </div>
  );
}
