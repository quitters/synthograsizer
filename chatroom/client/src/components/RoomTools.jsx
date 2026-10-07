import React, { useState, useEffect, useRef } from 'react';

const API_BASE = '/chatroom/api';

const post = (path, body) => fetch(`${API_BASE}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

/**
 * "Done when": checks the server runs before it lets the session end (one per line), and an independent critic
 * that scores pictures it alone can see. The same settings the Agent Studio has.
 */
export function DoneWhenSettings({ isRunning }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const [results, setResults] = useState([]);
  const [critic, setCritic] = useState({ enabled: false, referenceId: '', criteria: '', minScore: 6 });

  useEffect(() => {
    (async () => {
      try {
        const dw = await (await fetch(`${API_BASE}/chat/done-when`)).json();
        setText(dw.text || '');
        describe(dw);
        const c = await (await fetch(`${API_BASE}/chat/critic`)).json();
        setCritic({ enabled: !!c.enabled, referenceId: c.referenceId || '', criteria: c.criteria || '', minScore: c.minScore || 6 });
      } catch (err) {
        console.error('Failed to fetch room tool settings:', err);
      }
    })();
  }, []);

  const describe = (dw) => {
    const n = (dw.criteria || []).length;
    setFailed(false);
    setStatus(n ? `${n} check${n === 1 ? '' : 's'}; the room ends anyway after ${dw.maxBlocks || '∞'} refusals` : 'No checks: the lead or the vote decides.');
  };

  const save = async () => {
    const res = await post('/chat/done-when', { text });
    const json = await res.json();
    if (!res.ok) { setFailed(true); setStatus((json.errors || [json.error]).join(' · ')); return false; }
    describe(json);
    return true;
  };

  const check = async () => {
    if (!(await save())) return;
    const res = await post('/chat/done-when/check');
    const json = await res.json();
    setResults(json.results || []);
    if (json.note) setStatus(json.note);
  };

  const updateCritic = async (patch) => {
    const next = { ...critic, ...patch };
    setCritic(next);
    await post('/chat/critic', { enabled: next.enabled, referenceId: next.referenceId.trim() || null, criteria: next.criteria.trim(), minScore: next.minScore });
  };

  return (
    <div className="consensus-settings">
      <h4>Done when</h4>
      <p className="help-text">
        The server will not let the session end until every line passes (lead or vote alike). It runs the checks itself each time anyone tries to end, and when an artifact is saved, and tells the room what failed.
      </p>
      <div className="setting-group">
        <textarea
          rows={4}
          spellCheck={false}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          placeholder={'artifact: engine.json\nregex: /FINAL/ in last_message\njson: engine.json {"type":"object","required":["promptTemplate"]}\nurl: http://localhost:8000/api/health 200'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          disabled={isRunning}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <button type="button" onClick={check}>Check now</button>
          <span className="help-text" style={{ color: failed ? '#c62828' : undefined }}>{status}</span>
        </div>
        {results.map((r, i) => (
          <div key={i} className="help-text">
            <span style={{ color: r.passed ? '#2e7d32' : '#c62828' }}>{r.passed ? '✓' : '✗'}</span> {r.label}
            {!r.passed && <div style={{ marginLeft: 14 }}>{r.detail}</div>}
          </div>
        ))}
      </div>

      <h4>Independent critic</h4>
      <p className="help-text">
        Scores pictures 1 to 10 seeing only the pictures, never the conversation, so it cannot be talked into agreeing. Agents can ask with [CRITIC: picture id]; with a reference set, pictures the agents make are scored automatically.
      </p>
      <label className="toggle-setting">
        <input type="checkbox" checked={critic.enabled} onChange={(e) => updateCritic({ enabled: e.target.checked })} />
        <span>Use the critic</span>
      </label>
      {critic.enabled && (
        <>
          <div className="setting-group">
            <label>Reference picture (an attached file's name)</label>
            <input type="text" value={critic.referenceId} onChange={(e) => setCritic({ ...critic, referenceId: e.target.value })} onBlur={() => updateCritic({})} placeholder="sheet.png" />
          </div>
          <div className="setting-group">
            <label>What must stay the same</label>
            <input type="text" value={critic.criteria} onChange={(e) => setCritic({ ...critic, criteria: e.target.value })} onBlur={() => updateCritic({})} placeholder="face, braid, coat" />
          </div>
          <div className="setting-group">
            <label>Bar (below this, do not accept)</label>
            <input type="number" min="1" max="10" value={critic.minScore} onChange={(e) => updateCritic({ minScore: parseInt(e.target.value, 10) || 6 })} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Sessions saved on this computer as they happened, and loading a session file (what the Agent Studio's export button writes).
 */
export function SavedSessions({ isRunning }) {
  const [saved, setSaved] = useState({ enabled: false, sessions: [] });
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);

  const refresh = async () => {
    try { setSaved(await (await fetch(`${API_BASE}/chat/saved`)).json()); } catch (err) { console.error(err); }
  };
  useEffect(() => { refresh(); }, []);

  const loaded = async (res) => {
    const json = await res.json();
    if (!res.ok) { setMessage(json.error || `HTTP ${res.status}`); return; }
    window.location.reload();        // the page reads agents, goal and history from the server on load
  };

  const reopen = async (id) => {
    if (isRunning) { setMessage('A session is running. Stop it first.'); return; }
    if (!confirm('Replace the conversation on screen with this one?')) return;
    await loaded(await post(`/chat/saved/${encodeURIComponent(id)}/reopen`));
  };

  const download = (id) => { window.location.href = `${API_BASE}/chat/saved/${encodeURIComponent(id)}/download`; };

  const remove = async (id) => {
    if (!confirm('Delete this saved session? This cannot be undone.')) return;
    await fetch(`${API_BASE}/chat/saved/${encodeURIComponent(id)}`, { method: 'DELETE' });
    refresh();
  };

  const loadFile = async (file) => {
    if (!file) return;
    if (isRunning) { setMessage('A session is running. Stop it first.'); return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch { setMessage('That file is not JSON.'); return; }
    await loaded(await post('/chat/import', data));
  };

  return (
    <div className="consensus-settings">
      <h4>Saved sessions</h4>
      <p className="help-text">
        {saved.enabled
          ? `Every conversation is saved on this computer as it happens (kept ${saved.retentionDays ? `${saved.retentionDays} days` : 'until deleted'}), so closing the tab or restarting the server does not lose it.`
          : (saved.reason || 'Saving to disk is off on this server.')}
      </p>
      <div className="setting-group">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={isRunning}>Load a session file…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
        {message && <p className="help-text" style={{ color: '#c62828' }}>{message}</p>}
      </div>
      {saved.enabled && saved.sessions.length === 0 && <p className="help-text">Nothing saved yet.</p>}
      {saved.sessions.map(s => (
        <div key={s.id} className="setting-group" style={{ borderBottom: '1px solid #eee', paddingBottom: 8 }}>
          <strong>{(s.goal || '(no goal)').slice(0, 100)}</strong>
          <p className="help-text">
            {new Date(s.startedAt).toLocaleString()} · {s.messageCount} messages · {(s.agents || []).slice(0, 4).join(', ')}
            {s.endedAt ? ` · ${s.endReason || 'ended'}` : ' · not closed (interrupted)'}
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => reopen(s.id)} disabled={isRunning}>Reopen</button>
            <button type="button" onClick={() => download(s.id)}>Download</button>
            <button type="button" onClick={() => remove(s.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
