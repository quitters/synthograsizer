const { useState, useEffect, useMemo, useCallback, useRef } = React;

/* ── Sample seed data ── */
const SEED_PROFILES = [
  {
    id: 'p_chaos',
    name: 'Chaos Muse',
    icon: '🎭',
    color: '#b86880',
    category: 'imagegen',
    description: 'Surrealist provocateur who smashes incompatible concepts together.',
    bioTemplate: 'You are {{agent_name}}, a {{role}} in the field of {{domain}}. You specialize in {{specialty}} and your approach is {{approach}}. {{behavior_rules}} You always {{signature_action}}.',
    variables: [
      { name: 'role', feature_name: 'Role', valueIdx: 0, values: [
        { text: 'surrealist provocateur', weight: 3 },
        { text: 'Dadaist performance artist', weight: 2 },
        { text: 'abstract expressionist', weight: 1 },
      ]},
      { name: 'domain', feature_name: 'Domain', valueIdx: 1, values: [
        { text: 'visual art', weight: 2 },
        { text: 'image synthesis', weight: 3 },
        { text: 'collage', weight: 1 },
      ]},
      { name: 'specialty', feature_name: 'Specialty', valueIdx: 0, values: [
        { text: 'paradoxical compositions', weight: 3 },
        { text: 'unexpected color pairings', weight: 2 },
        { text: 'biomechanical hybrids', weight: 2 },
      ]},
      { name: 'approach', feature_name: 'Approach', valueIdx: 0, values: [
        { text: 'smashing incompatible concepts', weight: 3 },
        { text: 'finding beauty in visual paradoxes', weight: 2 },
        { text: 'treating every prompt as manifesto', weight: 1 },
      ]},
    ],
    anchors: {
      agent_name: 'Chaos Muse',
      behavior_rules: 'You one-up other panelists by going weirder, never safer.',
      signature_action: 'use [IMAGE:] to manifest your unhinged visions',
    },
    tags: [{ type: 'builtin', label: 'Built-in' }, { type: 'style', label: 'Surrealist' }, { type: 'role', label: 'Provocateur' }],
  },
  {
    id: 'p_critic',
    name: 'Art Critic',
    icon: '🧐',
    color: '#5a8ab8',
    category: 'discussion',
    description: 'Sharp-tongued evaluator who challenges every aesthetic choice.',
    bioTemplate: 'You are {{agent_name}}, a {{role}} obsessed with {{focus}}. You {{behavior}} and your tone is {{tone}}.',
    variables: [
      { name: 'role', feature_name: 'Role', valueIdx: 0, values: [
        { text: 'art critic', weight: 3 },
        { text: 'gallery curator', weight: 2 },
      ]},
      { name: 'focus', feature_name: 'Focus', valueIdx: 0, values: [
        { text: 'composition and tension', weight: 3 },
        { text: 'color theory', weight: 2 },
        { text: 'historical context', weight: 1 },
      ]},
      { name: 'behavior', feature_name: 'Behavior', valueIdx: 0, values: [
        { text: 'challenge assumptions sharply', weight: 3 },
        { text: 'cite obscure references', weight: 2 },
      ]},
      { name: 'tone', feature_name: 'Snark', valueIdx: 0, values: [
        { text: 'icily polite', weight: 1 },
        { text: 'dryly amused', weight: 2 },
        { text: 'witheringly dismissive', weight: 3 },
      ]},
    ],
    anchors: { agent_name: 'Art Critic' },
    tags: [{ type: 'builtin', label: 'Built-in' }, { type: 'style', label: 'Analytical' }, { type: 'role', label: 'Evaluator' }],
  },
  {
    id: 'p_arch',
    name: 'Prompt Architect',
    icon: '📐',
    color: '#5a9870',
    category: 'imagegen',
    description: 'Methodical builder of layered, reproducible image prompts.',
    bioTemplate: 'You are {{agent_name}}. You construct prompts using {{methodology}} with attention to {{aspect}}.',
    variables: [
      { name: 'methodology', feature_name: 'Method', valueIdx: 0, values: [
        { text: 'layered subject/style/lens grammar', weight: 3 },
        { text: 'reverse-engineering reference images', weight: 2 },
      ]},
      { name: 'aspect', feature_name: 'Aspect', valueIdx: 1, values: [
        { text: 'lighting and atmosphere', weight: 3 },
        { text: 'camera and lens specifications', weight: 3 },
        { text: 'historical art-movement cues', weight: 2 },
      ]},
    ],
    anchors: { agent_name: 'Prompt Architect' },
    tags: [{ type: 'builtin', label: 'Built-in' }, { type: 'role', label: 'Architect' }, { type: 'style', label: 'Methodical' }],
  },
  {
    id: 'p_punk',
    name: 'Cyberpunk Hacker',
    icon: '🕶',
    color: '#8868a8',
    category: 'roleplay',
    description: 'Cynical netrunner who quotes obscure poetry between exploits.',
    bioTemplate: 'You are {{agent_name}}, a {{role}} from {{world}}. You speak in {{cadence}} and reference {{influence}}.',
    variables: [
      { name: 'role', feature_name: 'Role', valueIdx: 0, values: [
        { text: 'rogue netrunner', weight: 3 },
        { text: 'corporate ICEbreaker', weight: 2 },
      ]},
      { name: 'world', feature_name: 'Setting', valueIdx: 0, values: [
        { text: 'Night City 2087', weight: 2 },
        { text: 'a flooded Hong Kong', weight: 2 },
      ]},
      { name: 'cadence', feature_name: 'Cadence', valueIdx: 0, values: [
        { text: 'clipped, jargon-heavy bursts', weight: 3 },
        { text: 'languid fragments', weight: 2 },
      ]},
      { name: 'influence', feature_name: 'Quotes', valueIdx: 0, values: [
        { text: 'Tang dynasty poets', weight: 2 },
        { text: 'beat generation', weight: 2 },
        { text: 'Soviet futurists', weight: 1 },
      ]},
    ],
    anchors: { agent_name: 'Razor' },
    tags: [{ type: 'builtin', label: 'Built-in' }, { type: 'style', label: 'Cyberpunk' }, { type: 'role', label: 'Infiltrator' }],
  },
  {
    id: 'p_zen',
    name: 'Zen Editor',
    icon: '🍃',
    color: '#5a9870',
    category: 'discussion',
    description: 'Patient simplifier who removes everything inessential.',
    bioTemplate: 'You are {{agent_name}}. You {{behavior}}. You speak {{tone}}.',
    variables: [
      { name: 'behavior', feature_name: 'Behavior', valueIdx: 0, values: [
        { text: 'cut what is not essential', weight: 3 },
        { text: 'reframe in fewer words', weight: 2 },
      ]},
      { name: 'tone', feature_name: 'Tone', valueIdx: 0, values: [
        { text: 'slowly, with long pauses', weight: 2 },
        { text: 'gently, almost whispering', weight: 2 },
      ]},
    ],
    anchors: { agent_name: 'Zen Editor' },
    tags: [{ type: 'builtin', label: 'Built-in' }, { type: 'style', label: 'Minimalist' }, { type: 'role', label: 'Editor' }],
  },
  {
    id: 'p_devil',
    name: "Devil's Advocate",
    icon: '😈',
    color: '#c07040',
    category: 'discussion',
    description: 'Relentless contrarian. Strongest opposing case to whatever was just said.',
    bioTemplate: 'You are {{agent_name}}. You always {{stance}} regardless of {{constraint}}.',
    variables: [
      { name: 'stance', feature_name: 'Stance', valueIdx: 0, values: [
        { text: 'argue the opposite of consensus', weight: 3 },
        { text: 'find the strongest counter-case', weight: 3 },
      ]},
      { name: 'constraint', feature_name: 'Bypass', valueIdx: 0, values: [
        { text: 'social pressure', weight: 2 },
        { text: 'your own prior takes', weight: 2 },
      ]},
    ],
    anchors: { agent_name: "Devil's Advocate" },
    tags: [{ type: 'builtin', label: 'Built-in' }, { type: 'style', label: 'Contrarian' }, { type: 'role', label: 'Stress-test' }],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Profiles', icon: '◆' },
  { id: 'mine', label: 'My Profiles', icon: '★' },
  { id: 'imagegen', label: 'Image Gen', icon: '🖼️' },
  { id: 'creative', label: 'Creative', icon: '🎨' },
  { id: 'writing', label: 'Writing', icon: '✍️' },
  { id: 'business', label: 'Business', icon: '💼' },
  { id: 'tech', label: 'Tech', icon: '💻' },
  { id: 'gaming', label: 'Gaming', icon: '🎮' },
  { id: 'education', label: 'Education', icon: '📚' },
  { id: 'science', label: 'Science', icon: '🔬' },
  { id: 'philosophy', label: 'Philosophy', icon: '🤔' },
  { id: 'social', label: 'Social', icon: '🌍' },
  { id: 'discussion', label: 'Discussion', icon: '💬' },
  { id: 'roleplay', label: 'Role-play', icon: '🎭' },
  { id: 'utility', label: 'Utility', icon: '🔧' },
  { id: 'builtin', label: 'Built-in', icon: '◌' },
];

/* ── Helpers ── */
const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;
function tokensIn(template) {
  const out = []; let m;
  while ((m = PLACEHOLDER_RE.exec(template)) !== null) out.push(m[1]);
  return [...new Set(out)];
}
function classify(tokens, profile) {
  const anchorKeys = Object.keys(profile.anchors || {});
  const varNames = (profile.variables || []).map(v => v.name);
  return tokens.map(t => ({
    name: t,
    kind: anchorKeys.includes(t) ? 'anchor' : (varNames.includes(t) ? 'var' : 'pending'),
  }));
}
function resolveBio(profile, sessionAnchors = {}) {
  const anchors = { ...(profile.anchors || {}), ...sessionAnchors };
  return profile.bioTemplate.replace(PLACEHOLDER_RE, (full, key) => {
    if (anchors[key] != null) return anchors[key];
    const v = (profile.variables || []).find(x => x.name === key);
    if (v && v.values[v.valueIdx]) return v.values[v.valueIdx].text;
    return `{{${key}}}`;
  });
}

/* Splits a bio template into typed segments for safe JSX rendering.
   Avoids dangerouslySetInnerHTML by returning text/anchor/var/pending objects. */
function buildBioSegments(template, anchors, variables) {
  const segments = [];
  const re = /\{\{(\w+)\}\}/g;
  let last = 0, m;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) segments.push({ kind: 'text', text: template.slice(last, m.index) });
    const key = m[1];
    const aVal = (anchors || {})[key];
    const v = (variables || []).find(vv => vv.name === key);
    if (aVal != null) segments.push({ kind: 'anchor', key, anchorVal: aVal });
    else if (v)       segments.push({ kind: 'var', key, featureName: v.feature_name, resolvedText: v.values[v.valueIdx]?.text ?? '' });
    else              segments.push({ kind: 'pending', key });
    last = m.index + m[0].length;
  }
  if (last < template.length) segments.push({ kind: 'text', text: template.slice(last) });
  return segments;
}

/* ── Knob component ── */
function KnobSVG({ valueIdx, total, size = 48, color = '#c07040' }) {
  const minA = -135, maxA = 135;
  const a = total <= 1 ? 0 : minA + (valueIdx / (total - 1)) * (maxA - minA);
  const r = size / 2, cx = r, cy = r;
  const rad = (a - 90) * Math.PI / 180;
  const dotR = r * 0.7;
  const dx = cx + Math.cos(rad) * dotR, dy = cy + Math.sin(rad) * dotR;
  const arc = (s, e, rad) => {
    const sa = (s - 90) * Math.PI / 180, ea = (e - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(sa) * rad, y1 = cy + Math.sin(sa) * rad;
    const x2 = cx + Math.cos(ea) * rad, y2 = cy + Math.sin(ea) * rad;
    const lg = e - s > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${rad} ${rad} 0 ${lg} 1 ${x2} ${y2}`;
  };
  return (
    <svg className="knob-svg" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <path d={arc(minA, maxA, r - 3)} stroke="#c4bcac" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d={arc(minA, a, r - 3)} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={r - 7} fill="#e0d8ca" stroke="#7a6e5e" strokeWidth="1.5"/>
      <circle cx={cx} cy={cy} r={r - 11} fill="#d4ccbe"/>
      <line x1={cx} y1={cy} x2={dx} y2={dy} stroke="#2e2418" strokeWidth="2" strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r="2" fill="#2e2418"/>
    </svg>
  );
}

/* ── Draggable knob ──────────────────────────────────────────────────────────
   Wraps KnobSVG with pointer-event interactivity.
     - Click             → next valueIdx (wraps around)
     - Vertical drag     → step through valueIdx (12px per step, up = increase)
     - Keyboard (focused)→ ↑/→ next, ↓/← prev, Home first, End last
   The post-drag click is suppressed so dragging doesn't accidentally also bump
   the value via the click handler. */
function DraggableKnob({ valueIdx, total, color, size = 48, onChange, ariaLabel }) {
  const draggedRef = React.useRef(false);

  const setIdx = (next) => {
    if (typeof onChange !== 'function' || total <= 1) return;
    const clamped = Math.max(0, Math.min(total - 1, next));
    if (clamped !== valueIdx) onChange(clamped);
  };

  const handleClick = (e) => {
    if (draggedRef.current) {
      // The just-finished drag should NOT also count as a click.
      draggedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (total <= 1) return;
    // Stop propagation so the click doesn't bubble to a parent row that has
    // its own onClick (e.g. the Session channel-knob lock toggle).
    e.stopPropagation();
    setIdx((valueIdx + 1) % total);
  };

  const handlePointerDown = (e) => {
    if (total <= 1) return;
    e.preventDefault();
    const startY   = e.clientY;
    const startIdx = valueIdx;
    const STEP_PX  = 12;
    let moved = false;

    const onMove = (ev) => {
      const dy = startY - ev.clientY; // up = positive
      if (Math.abs(dy) > 3) moved = true;
      const delta = Math.round(dy / STEP_PX);
      setIdx(startIdx + delta);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
      window.removeEventListener('pointercancel', onUp);
      if (moved) draggedRef.current = true;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleKeyDown = (e) => {
    if (total <= 1) return;
    if (e.key === 'ArrowUp'   || e.key === 'ArrowRight') { setIdx(valueIdx + 1); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft')  { setIdx(valueIdx - 1); e.preventDefault(); }
    if (e.key === 'Home') { setIdx(0); e.preventDefault(); }
    if (e.key === 'End')  { setIdx(total - 1); e.preventDefault(); }
  };

  const interactive = typeof onChange === 'function' && total > 1;
  return (
    <div
      role={interactive ? 'slider' : undefined}
      aria-label={ariaLabel}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? total - 1 : undefined}
      aria-valuenow={interactive ? valueIdx : undefined}
      tabIndex={interactive ? 0 : -1}
      onClick={handleClick}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      style={{
        cursor: interactive ? 'ns-resize' : 'default',
        userSelect: 'none',
        touchAction: 'none',
        outline: 'none',
        display: 'inline-block',
      }}
      title={interactive ? 'Click to step · drag vertically · arrow keys' : undefined}
    >
      <KnobSVG valueIdx={valueIdx} total={total} color={color} size={size}/>
    </div>
  );
}

/* ── Library Room ── */
function LibraryRoom({ profiles, onPick, onEdit, onSendToSession, onCreate,
                       onImport, onExport, onGenerateFromImage,
                       onRemix, onTest, onDelete }) {
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [createOpen, setCreateOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const createRef = useRef(null);
  const overflowRef = useRef(null);

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e) => {
      if (createRef.current && !createRef.current.contains(e.target)) setCreateOpen(false);
      if (overflowRef.current && !overflowRef.current.contains(e.target)) setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    let list = profiles;
    if (cat === 'mine') list = list.filter(p => p.tags.some(t => t.type === 'creator' && t.label === 'You'));
    else if (cat === 'builtin') list = list.filter(p => p.tags.some(t => t.type === 'builtin'));
    else if (cat !== 'all') list = list.filter(p => p.category === cat);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(s) ||
        p.description.toLowerCase().includes(s) ||
        p.bioTemplate.toLowerCase().includes(s) ||
        p.tags.some(t => t.label.toLowerCase().includes(s))
      );
    }
    if (sort === 'name')          list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'recent')   list = [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    else if (sort === 'category') list = [...list].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return list;
  }, [profiles, cat, search, sort]);

  return (
    <div className="lib-grid">
      <aside className="lib-side">
        <div className="hw-card lib-search-card">
          <input className="lib-search" placeholder="🔍  search profiles…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="hw-card">
          <span className="card-label"><span className="step">1</span>Browse by category</span>
          <div className="lib-side-list">
            {CATEGORIES.map(c => (
              <div key={c.id}
                   className={'lib-side-item' + (cat === c.id ? ' active' : '')}
                   onClick={() => setCat(c.id)}>
                <span style={{ width: 14 }}>{c.icon}</span>
                <span>{c.label}</span>
                <span className="count">{c.id === 'all' ? profiles.length : (c.id === 'mine' ? profiles.filter(p => p.tags.some(t => t.type === 'creator' && t.label === 'You')).length : c.id === 'builtin' ? profiles.filter(p => p.tags.some(t => t.type === 'builtin')).length : profiles.filter(p => p.category === c.id).length)}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="lib-main">
        <div className="lib-toolbar">
          <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--hw-text-dim)' }}>
            {filtered.length} profile{filtered.length === 1 ? '' : 's'} · {CATEGORIES.find(c => c.id === cat).label}
          </span>
          <span className="spacer"></span>
          <div className="lib-sort-pill">
            {['recent', 'name', 'category'].map(s => (
              <button key={s} className={sort === s ? 'active' : ''} onClick={() => setSort(s)}>{s}</button>
            ))}
          </div>
          {/* ⋯ overflow for infrequent actions */}
          <div style={{ position: 'relative' }} ref={overflowRef}>
            <button className="hw-btn tiny ghost" onClick={() => setOverflowOpen(o => !o)} title="More actions">⋯</button>
            {overflowOpen && (
              <div className="lib-popover">
                <div className="lib-pop-item" onClick={() => { onExport?.(); setOverflowOpen(false); }}>↓ Export All</div>
              </div>
            )}
          </div>
          {/* Single + Create button with path popover */}
          <div style={{ position: 'relative' }} ref={createRef}>
            <button className="hw-btn primary" onClick={() => setCreateOpen(o => !o)}>+ Create Profile</button>
            {createOpen && (
              <div className="lib-popover lib-popover-create">
                <div className="lib-pop-item" onClick={() => { onCreate?.(); setCreateOpen(false); }}>▢ Blank canvas <span className="lib-pop-hint">N</span></div>
                <div className="lib-pop-item" onClick={() => { onCreate?.(); setCreateOpen(false); }}>✎ From description <span className="lib-pop-hint">D</span></div>
                <div className="lib-pop-item" onClick={() => { onGenerateFromImage?.(); setCreateOpen(false); }}>⌷ From image <span className="lib-pop-hint">I</span></div>
                <div className="lib-pop-item" onClick={() => { onImport?.(); setCreateOpen(false); }}>↑ Import JSON <span className="lib-pop-hint">⇧I</span></div>
              </div>
            )}
          </div>
        </div>

        <div className="lib-cards">
          {filtered.map(p => (
            <ProfileCard key={p.id} profile={p}
                         onEdit={() => onEdit(p)}
                         onRemix={() => onRemix && onRemix(p)}
                         onTest={() => onTest && onTest(p)}
                         onDelete={() => onDelete && onDelete(p)}
                         onTagClick={(t) => setSearch(t)}
                         onSendToSession={() => onSendToSession(p)} />
          ))}
          {filtered.length === 0 && (
            <div className="lib-empty">
              <div className="lib-empty-icon">⌀</div>
              <div className="lib-empty-msg">
                {search
                  ? <span>No profiles match <strong>"{search}"</strong>{cat !== 'all' ? ` in ${CATEGORIES.find(c => c.id === cat)?.label || cat}` : ''}</span>
                  : <span>No profiles in <strong>{CATEGORIES.find(c => c.id === cat)?.label || cat}</strong></span>
                }
              </div>
              <div className="lib-empty-actions">
                {search && <button className="hw-btn tiny" onClick={() => setSearch('')}>⌫ Clear search</button>}
                {cat !== 'all' && <button className="hw-btn tiny" onClick={() => setCat('all')}>⊕ All Profiles</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Derive a 2-letter monogram and category gradient for a profile */
function profileMonogram(name) {
  const words = name.trim().split(/\s+/);
  return words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}
const CAT_COLORS = {
  imagegen:   ['#c87090', '#8868a8'],
  creative:   ['#e08060', '#b86880'],
  writing:    ['#5a8ab8', '#8868a8'],
  business:   ['#4a6a8a', '#3a7a98'],
  tech:       ['#5a9870', '#3a7a98'],
  gaming:     ['#c07040', '#8868a8'],
  education:  ['#c0a040', '#8a7e6e'],
  science:    ['#3a7a98', '#5a9870'],
  philosophy: ['#8868a8', '#5a8ab8'],
  social:     ['#b86880', '#e08060'],
  discussion: ['#5a8ab8', '#3a7a98'],
  roleplay:   ['#8868a8', '#c07040'],
  text:       ['#5a8ab8', '#5a9870'],
  data:       ['#c07040', '#c0a040'],
  flow:       ['#5a9870', '#5a8ab8'],
  utility:    ['#8a7e6e', '#5a5040'],
};
function catGradient(category) {
  const [a, b] = CAT_COLORS[category] || ['#8a7e6e', '#5a5040'];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function ProfileCard({ profile, onEdit, onSendToSession, onRemix, onTest, onDelete, onTagClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const previewBioSegs = useMemo(() => buildBioSegments(
    profile.bioTemplate, profile.anchors, profile.variables
  ), [profile]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const varCount = profile.variables.length;

  return (
    <div className="profile-card">
      {/* Thin color rail — replaces full strip */}
      <div className="pc-rail" style={{ background: profile.color }} />
      <div className="pc-head">
        <div className="pc-avatar pc-monogram" style={{ background: catGradient(profile.category) }}>
          {profileMonogram(profile.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="pc-name">{profile.name}</div>
          <div className="pc-cat">{profile.category}</div>
        </div>
      </div>
      <div className="pc-bio">
        {previewBioSegs.map((seg, i) => {
          if (seg.kind === 'anchor')  return <em key={i}>{seg.anchorVal}</em>;
          if (seg.kind === 'var')     return <em key={i} style={{ borderColor: 'var(--hw-amb)', color: 'var(--hw-amb)' }}>↻ {seg.featureName}</em>;
          if (seg.kind === 'pending') return <span key={i}>{`{{${seg.key}}}`}</span>;
          return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        })}
      </div>
      {varCount > 0 && (
        <div className="pc-meta">
          <div className="pc-vars">
            {profile.variables.slice(0, 4).map((v, i) => (
              <span className="knob-mini" key={i} title={v.feature_name}
                    style={{ '--rot': (-90 + (v.valueIdx / Math.max(1, v.values.length - 1)) * 180) + 'deg' }}>
              </span>
            ))}
            <span style={{ marginLeft: 4 }}>{varCount} var{varCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
      <div className="pc-actions">
        {/* ⋯ overflow for secondary actions */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button className="hw-btn tiny ghost" onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }} title="More">⋯</button>
          {menuOpen && (
            <div className="pc-menu">
              <div className="pc-menu-item" onClick={(e) => { e.stopPropagation(); onEdit?.(); setMenuOpen(false); }}>✎ Edit</div>
              <div className="pc-menu-item" onClick={(e) => { e.stopPropagation(); onRemix?.(); setMenuOpen(false); }}>⎘ Remix</div>
              <div className="pc-menu-item" onClick={(e) => { e.stopPropagation(); onTest?.(); setMenuOpen(false); }}>▷ Test</div>
              {onDelete && <div className="pc-menu-item pc-menu-danger" onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}>✕ Delete</div>}
            </div>
          )}
        </div>
        <span style={{ flex: 1 }}></span>
        <div className="pc-tags" style={{ overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {profile.tags.map((t, i) => (
            <span key={i}
                  className={'pc-tag ' + t.type}
                  onClick={(e) => { e.stopPropagation(); onTagClick && onTagClick(t.label); }}>
              {t.label}
            </span>
          ))}
        </div>
        <button className="hw-btn tiny primary" onClick={(e) => { e.stopPropagation(); onSendToSession(); }}>+ Add</button>
      </div>
    </div>
  );
}

/* ── Editor Room ── */
const GEN_INSTRUCTIONS_KEY = 'as_gen_instructions';
const DEFAULT_GEN_INSTRUCTIONS =
  'Match the tone and energy of the user\'s description precisely. Lean positive and collaborative by default — avoid gratuitous darkness or cynicism unless the description calls for it. Write variable values as concrete, vivid phrases (3–12 words) that slot naturally into the bio template.';

function EditorRoom({ profile, setProfile, onAddToSession, onBack, onGenerate, onTestSend, onSaveAs, onShowToast }) {
  const [activeVarIdx, setActiveVarIdx] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [testInput, setTestInput] = useState('');
  const [testHistory, setTestHistory] = useState([]);
  const [draggingVarIdx, setDraggingVarIdx] = useState(null);
  const [dragOverVarIdx, setDragOverVarIdx] = useState(null);
  const [generatingForVar, setGeneratingForVar] = useState(null);
  const [savedAgo, setSavedAgo] = useState('just now');
  const [lastSavedAt, setLastSavedAt] = useState(Date.now());
  const [chipMenu, setChipMenu] = useState(null);
  const [genInstructions, setGenInstructionsState] = useState(() => {
    try { return localStorage.getItem(GEN_INSTRUCTIONS_KEY) || DEFAULT_GEN_INSTRUCTIONS; } catch(_) { return DEFAULT_GEN_INSTRUCTIONS; }
  });
  const [showGenInstructions, setShowGenInstructions] = useState(false);
  const bioAreaRef = useRef(null);

  const setGenInstructions = (val) => {
    setGenInstructionsState(val);
    try { localStorage.setItem(GEN_INSTRUCTIONS_KEY, val); } catch(_) {}
  };
  const resetGenInstructions = () => setGenInstructions(DEFAULT_GEN_INSTRUCTIONS);

  // Bump the saved timestamp on every profile change. Since `setProfile` (passed
  // from App = `updateProfile`) writes through to AgentProfileStore on every call,
  // any edit here is already persisted — this is just the visual indicator.
  useEffect(() => { setLastSavedAt(Date.now()); }, [profile]);

  // Live "saved Ns ago" indicator — recomputed every 5s
  useEffect(() => {
    const update = () => {
      const dt = (Date.now() - lastSavedAt) / 1000;
      if (dt < 3)        setSavedAgo('just now');
      else if (dt < 60)  setSavedAgo(`${Math.floor(dt)}s ago`);
      else if (dt < 3600) setSavedAgo(`${Math.floor(dt / 60)}m ago`);
      else               setSavedAgo(`${Math.floor(dt / 3600)}h ago`);
    };
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  // Test history is per-profile and survives navigation via localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`composer_test_history_${profile.id}`);
      setTestHistory(stored ? JSON.parse(stored) : []);
    } catch (_) {
      setTestHistory([]);
    }
  }, [profile.id]);
  useEffect(() => {
    if (!testHistory || testHistory.length === 0) return;
    try { localStorage.setItem(
        `composer_test_history_${profile.id}`,
        JSON.stringify(testHistory.slice(-30))
      );
    } catch (_) {}
  }, [testHistory, profile.id]);

  useEffect(() => {
    if (!chipMenu) return;
    const close = () => setChipMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [chipMenu]);

  function simulateReply(prof, q) {
    const r = (prof.variables.find(v => v.name === 'role') || prof.variables[0])?.values[0]?.text || 'agent';
    return `(simulated) As a ${r}, my answer to "${q}" would dial up ${prof.variables.length} variables.`;
  }

  const tokens = useMemo(() => classify(tokensIn(profile.bioTemplate), profile), [profile]);
  const previewSegs = useMemo(() => buildBioSegments(
    profile.bioTemplate, profile.anchors, profile.variables
  ), [profile]);

  const updateVar = (idx, mut) => {
    const vs = [...profile.variables];
    vs[idx] = { ...vs[idx], ...mut };
    setProfile({ ...profile, variables: vs });
  };
  const addVar = () => {
    const n = `var${profile.variables.length + 1}`;
    setProfile({ ...profile, variables: [...profile.variables, { name: n, feature_name: 'New', valueIdx: 0, values: [{ text: 'first option', weight: 1 }] }] });
    setActiveVarIdx(profile.variables.length);
  };
  const removeVar = (idx) => {
    if (!window.confirm('Remove this variable?')) return;
    const vs = [...profile.variables];
    vs.splice(idx, 1);
    setProfile({ ...profile, variables: vs });
    if (activeVarIdx >= vs.length) setActiveVarIdx(Math.max(0, vs.length - 1));
  };
  const reorderVar = (fromIdx, toIdx) => {
    if (fromIdx == null || toIdx == null || fromIdx === toIdx) return;
    const vs = [...profile.variables];
    const [moved] = vs.splice(fromIdx, 1);
    vs.splice(toIdx, 0, moved);
    setProfile({ ...profile, variables: vs });
    setActiveVarIdx(toIdx);
  };
  // Adjust value weight by ±1, clamped 1..9
  const adjustWeight = (varIdx, valIdx, delta) => {
    const v = profile.variables[varIdx];
    if (!v) return;
    const vs = [...v.values];
    const cur = vs[valIdx].weight ?? 1;
    vs[valIdx] = { ...vs[valIdx], weight: Math.max(1, Math.min(9, cur + delta)) };
    updateVar(varIdx, { values: vs });
  };
  // Generate 4 new values for a variable via Gemini, append to existing list
  const generateValuesForVar = async (varIdx) => {
    const v = profile.variables[varIdx];
    if (!v) return;
    setGeneratingForVar(varIdx);
    try {
      const existing = (v.values || []).slice(0, 6).map(x => x.text);
      const ctx = profile.description || profile.name;
      const prompt = `Generate 4 NEW distinct values for the variable "${v.feature_name || v.name}" in the agent profile context: "${ctx}". Avoid duplicating: ${existing.join(' | ') || '(none)'}. Each value: a short phrase (3-12 words), in the same register as the existing ones. Return ONLY a JSON array of 4 strings, no other text, no code fences.`;
      const res = await fetch(`${SYNTHO_API}/api/generate/text`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = data.text || data.response || data.result || '';
      const match = text.match(/\[[\s\S]*\]/);
      const arr = match ? JSON.parse(match[0]) : [];
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('Could not parse values');
      const newValues = arr.filter(x => typeof x === 'string').map(x => ({ text: x.trim(), weight: 1 }));
      updateVar(varIdx, { values: [...v.values, ...newValues] });
      onShowToast?.(`Added ${newValues.length} value${newValues.length === 1 ? '' : 's'}`, 'ok');
    } catch (err) {
      onShowToast?.(`Generation failed: ${err.message}`, 'err');
    } finally {
      setGeneratingForVar(null);
    }
  };

  // Anchor key rename — replaces the entry while preserving relative order
  const renameAnchor = (oldKey, newKey) => {
    newKey = (newKey || '').trim();
    if (!newKey || newKey === oldKey) return;
    if (profile.anchors[newKey] !== undefined) return; // collision: silently no-op
    const next = {};
    for (const [k, v] of Object.entries(profile.anchors || {})) {
      next[k === oldKey ? newKey : k] = v;
    }
    setProfile({ ...profile, anchors: next });
  };
  const addAnchor = () => {
    const k = window.prompt('Anchor key (e.g. tone, world, signature_action):');
    if (!k) return;
    setProfile({ ...profile, anchors: { ...profile.anchors, [k]: 'value' } });
  };
  const setAnchor = (key, val) => setProfile({ ...profile, anchors: { ...profile.anchors, [key]: val } });
  const delAnchor = key => {
    const a = { ...profile.anchors }; delete a[key];
    setProfile({ ...profile, anchors: a });
  };

  // Bio area: insert {{name}} at cursor (uses ref instead of fragile querySelector)
  const insertToken = (kind, name) => {
    const ta = bioAreaRef.current;
    if (!ta) return;
    const insertion = `{{${name}}}`;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const newVal = profile.bioTemplate.slice(0, start) + insertion + profile.bioTemplate.slice(end);
    setProfile({ ...profile, bioTemplate: newVal });
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + insertion.length; }, 10);
  };

  // Click a token chip:
  //   - bound (var/anchor): insert {{name}} at cursor
  //   - unbound: ask whether to register it as a variable or anchor
  const handleChipClick = (token) => {
    if (token.kind === 'pending') {
      const choice = (window.prompt(
        `"${token.name}" is unbound. Register as:\n  v = variable (knob)\n  a = anchor (fixed text)\nor cancel:`,
        'v'
      ) || '').trim().toLowerCase();
      if (choice === 'v') {
        setProfile({
          ...profile,
          variables: [...profile.variables, {
            name: token.name, feature_name: token.name, valueIdx: 0,
            values: [{ text: 'option', weight: 1 }],
          }],
        });
        setActiveVarIdx(profile.variables.length);
      } else if (choice === 'a') {
        setProfile({ ...profile, anchors: { ...profile.anchors, [token.name]: '' } });
      }
    } else {
      insertToken(token.kind, token.name);
    }
  };

  return (
    <div className="ed-grid">

      <div className="ed-left">
        {/* AI generate-from-description bar */}
        <div className="hw-card" style={{ position: 'relative' }}>
          <div className="ai-bar">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lbl-mini">Create from description</div>
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                     placeholder='e.g. "A cheerful botanist obsessed with rare orchids"'/>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <button className="hw-btn primary" onClick={() => onGenerate && onGenerate(aiPrompt, genInstructions)}>✦ Generate</button>
              <button className="hw-btn gen-instr-toggle" onClick={() => setShowGenInstructions(v => !v)}
                      title="Edit generation instructions">
                ⚙ {showGenInstructions ? 'Hide' : 'Instructions'}
              </button>
            </div>
          </div>
          <div className="lbl-mini gen-context-hint" style={{ padding: '2px 12px 6px', color: 'var(--hw-text-label)' }}>
            ✦ sends: name · category · description · bio · variables · anchors
          </div>

          {/* Collapsible generation instructions panel */}
          {showGenInstructions && (
            <div className="gen-instr-panel">
              <div className="gen-instr-header">
                <span className="lbl-mini">Generation Instructions</span>
                <button className="hw-btn" style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={resetGenInstructions}
                        title="Restore default instructions">Reset</button>
              </div>
              <div className="gen-instr-note">
                Controls tone and style. Schema structure (JSON format, variables, anchors) is always enforced.
              </div>
              <textarea className="gen-instr-area"
                value={genInstructions}
                onChange={e => setGenInstructions(e.target.value)}
                rows={5}
                spellCheck={false}/>
            </div>
          )}

          {/* Identity row */}
          <span className="card-label"><span className="step">A</span>Identity — sent to generation</span>
          <div className={`ed-meta-row${aiPrompt.trim() ? ' gen-context-active' : ''}`} style={{ gridTemplateColumns: '60px 1fr 160px 110px' }}>
            <div className="ed-input-grp">
              <span className="lbl">Icon</span>
              <input className="ed-emoji" value={profile.icon} onChange={e => setProfile({ ...profile, icon: e.target.value })}/>
            </div>
            <div className="ed-input-grp">
              <span className="lbl">Display name (also agent name)</span>
              <input className="ed-input big" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value, anchors: { ...profile.anchors, agent_name: e.target.value } })}/>
            </div>
            <div className="ed-input-grp">
              <span className="lbl">Category</span>
              <select className="ed-input" value={profile.category} onChange={e => setProfile({ ...profile, category: e.target.value })}>
                <option value="imagegen">imagegen</option>
                <option value="discussion">discussion</option>
                <option value="roleplay">roleplay</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div className="ed-input-grp">
              <span className="lbl">Avatar tint</span>
              <input className="ed-input" type="color" value={profile.color} onChange={e => setProfile({ ...profile, color: e.target.value })} style={{ height: 30, padding: 1 }}/>
            </div>
          </div>
          <div style={{ padding: '0 12px 12px' }}>
            <span className="lbl" style={{ fontSize:9, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--hw-text-label)', display:'block', marginBottom:4 }}>One-line description</span>
            <input className="ed-input" style={{ width: '100%' }} value={profile.description} onChange={e => setProfile({ ...profile, description: e.target.value })}/>
          </div>
        </div>

        {/* Bio Template */}
        <div className={`hw-card ed-bio-card${aiPrompt.trim() ? ' gen-context-active' : ''}`} style={{ position: 'relative' }}>
          <span className="note-pin">{tokens.length} tokens · {tokens.filter(t => t.kind === 'pending').length} unbound</span>
          <span className="card-label"><span className="step">B</span>Bio Template — sent to generation</span>
          <div style={{ padding: '0 12px' }}>
            <textarea id="bio-area" ref={bioAreaRef} className="ed-bio-area"
              value={profile.bioTemplate}
              onChange={e => setProfile({ ...profile, bioTemplate: e.target.value })}/>
          </div>
          <div className="ed-bio-foot">
            <span className="hint">Use <code style={{ background: 'var(--hw-recessed)', padding: '1px 4px', borderRadius: 2 }}>{'{{name}}'}</code> for variables/anchors. Click a chip to insert · click an unbound chip to register it.</span>
            <div className="ed-bio-tokens">
              {tokens.map((t, i) => {
                if (t.kind === 'pending') {
                  return (
                    <span key={i} className="token-chip pending"
                          onClick={() => handleChipClick(t)}
                          title={`"${t.name}" is unbound — click to register`}>
                      ? {t.name}
                    </span>
                  );
                }
                const vIdx = t.kind === 'var' ? profile.variables.findIndex(v => v.name === t.name) : -1;
                return (
                  <span key={i} className={'token-chip ' + t.kind} style={{ position: 'relative' }}>
                    <span onClick={() => handleChipClick(t)} title="Click to insert at cursor">
                      {t.kind === 'var' ? '↻' : '⚓'} {t.name}
                    </span>
                    <span className="chip-caret"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setChipMenu(prev => prev?.token.name === t.name ? null : { token: t, x: rect.left, y: rect.bottom + 4, vIdx });
                          }}
                          title="More options">▾</span>
                  </span>
                );
              })}
              <span className="token-chip add" onClick={addVar} title="Add variable">+ Var</span>
              <span className="token-chip add" onClick={addAnchor} title="Add anchor">+ Anchor</span>
            </div>
          </div>
        </div>

        {/* Variables Manager */}
        <div className="hw-card">
          <span className="card-label"><span className="step">C</span>Variables — these become Knobs · drag <code style={{ fontFamily: 'inherit' }}>⋮⋮</code> to reorder</span>
          <div className="var-mgr">
            <div className="var-bank">
              {profile.variables.map((v, idx) => {
                const isDragOver = dragOverVarIdx === idx && draggingVarIdx !== idx;
                return (
                <div key={idx}
                     id={`var-row-${idx}`}
                     className={'var-row' + (idx === activeVarIdx ? ' active' : '')}
                     onClick={() => setActiveVarIdx(idx)}
                     style={{
                       opacity: draggingVarIdx === idx ? 0.4 : 1,
                       outline: isDragOver ? '2px solid var(--hw-amb)' : 'none',
                       outlineOffset: '-2px',
                     }}
                     onDragOver={(e) => {
                       if (draggingVarIdx == null) return;
                       e.preventDefault();
                       if (dragOverVarIdx !== idx) setDragOverVarIdx(idx);
                     }}
                     onDragLeave={() => setDragOverVarIdx(null)}
                     onDrop={(e) => {
                       e.preventDefault();
                       if (draggingVarIdx != null) reorderVar(draggingVarIdx, idx);
                       setDraggingVarIdx(null);
                       setDragOverVarIdx(null);
                     }}>
                  <div className="drag"
                       draggable
                       onDragStart={(e) => {
                         setDraggingVarIdx(idx);
                         // Required for drag to actually work in Firefox
                         try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) {}
                         e.dataTransfer.effectAllowed = 'move';
                       }}
                       onDragEnd={() => { setDraggingVarIdx(null); setDragOverVarIdx(null); }}
                       title="Drag to reorder"
                       style={{ cursor: 'grab' }}>⋮⋮</div>
                  <div className="var-name-col">
                    <input className="nm-input" value={v.name} onChange={e => updateVar(idx, { name: e.target.value })} placeholder="key"/>
                    <input className="feat-input" value={v.feature_name} onChange={e => updateVar(idx, { feature_name: e.target.value })} placeholder="Display label"/>
                    <span style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--hw-text-label)', textTransform: 'uppercase' }}>
                      {v.values.length} values · idx {v.valueIdx}
                    </span>
                  </div>
                  <div className="var-vals-col">
                    {v.values.map((val, vi) => (
                      <span key={vi} className="val-pill val-pill-editable"
                            style={vi === v.valueIdx ? { borderColor: 'var(--hw-amb)', background: 'var(--hw-lcd-bg)' } : {}}
                            onClick={(e) => { e.stopPropagation(); updateVar(idx, { valueIdx: vi }); }}>
                        <span>{val.text}</span>
                        <span className="val-pill-weight-ctl"
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          <button className="wt-btn"
                                  onClick={(e) => { e.stopPropagation(); adjustWeight(idx, vi, -1); }}
                                  disabled={(val.weight ?? 1) <= 1}
                                  title="Decrease weight"
                                  style={{ background:'none', border:'none', color:'var(--hw-text-dim)', cursor:'pointer', fontSize:11, padding:'0 2px', lineHeight:1 }}>−</button>
                          <span className={'wt' + ((val.weight ?? 1) >= 3 ? ' hi' : '')} title="Weight (random pick probability)">×{val.weight ?? 1}</span>
                          <button className="wt-btn"
                                  onClick={(e) => { e.stopPropagation(); adjustWeight(idx, vi, 1); }}
                                  disabled={(val.weight ?? 1) >= 9}
                                  title="Increase weight"
                                  style={{ background:'none', border:'none', color:'var(--hw-text-dim)', cursor:'pointer', fontSize:11, padding:'0 2px', lineHeight:1 }}>+</button>
                        </span>
                        <button className="x"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const vs=[...v.values]; vs.splice(vi,1);
                                  updateVar(idx, { values: vs, valueIdx: Math.min(v.valueIdx, vs.length - 1) });
                                }}
                                disabled={v.values.length <= 1}
                                title={v.values.length <= 1 ? 'A variable must have at least one value' : 'Remove value'}>×</button>
                      </span>
                    ))}
                    <span className="val-pill add" onClick={(e) => {
                      e.stopPropagation();
                      const t = window.prompt('New value text:'); if (!t) return;
                      updateVar(idx, { values: [...v.values, { text: t, weight: 1 }] });
                    }}>+ value</span>
                    <span className="val-pill add"
                          onClick={(e) => { e.stopPropagation(); generateValuesForVar(idx); }}
                          title="Ask Gemini to suggest 4 more values for this variable"
                          style={generatingForVar === idx ? { opacity: 0.5, cursor: 'wait', borderColor: 'var(--hw-amb)' } : {}}>
                      {generatingForVar === idx ? '✦ generating…' : '✦ gen values'}
                    </span>
                  </div>
                  <div className="var-row-actions">
                    <DraggableKnob
                      valueIdx={v.valueIdx}
                      total={v.values.length}
                      color="#7a6e5e"
                      size={36}
                      ariaLabel={v.feature_name || v.name}
                      onChange={(next) => updateVar(idx, { valueIdx: next })}
                    />
                    <button className="hw-btn tiny ghost" onClick={(e) => { e.stopPropagation(); removeVar(idx); }}>✕</button>
                  </div>
                </div>
                );
              })}
              <button className="hw-btn ghost" style={{ alignSelf:'flex-start' }} onClick={addVar}>+ Add Variable</button>
            </div>
          </div>
        </div>

        {/* Anchors */}
        <div className="hw-card">
          <span className="card-label"><span className="step">D</span>Anchors — fixed text constants · click a key to rename</span>
          <div className="anchor-tbl">
            {Object.entries(profile.anchors || {}).map(([k, v]) => {
              // agent_name is auto-bound to the display name above; flag it visually
              const isAutoBound = k === 'agent_name';
              return (
                <div className="anchor-row" key={k}
                     title={isAutoBound ? 'Auto-bound to the Display name above — edits there propagate here.' : undefined}>
                  <input className="akey"
                         value={k}
                         onChange={(e) => renameAnchor(k, e.target.value)}
                         disabled={isAutoBound}
                         style={isAutoBound ? { opacity: 0.7 } : {}}
                         title={isAutoBound ? 'Auto-bound — locked' : 'Click to rename this anchor'}/>
                  <input className="aval" value={v} onChange={e => setAnchor(k, e.target.value)}/>
                  {isAutoBound
                    ? <span style={{ fontSize: 11, color: 'var(--hw-blue)', padding: '0 4px' }} title="Auto-bound to display name">🔗</span>
                    : <button className="x" onClick={() => delAnchor(k)}>✕</button>}
                </div>
              );
            })}
            <button className="hw-btn ghost" style={{ alignSelf:'flex-start', marginTop:6 }} onClick={addAnchor}>+ Add Anchor</button>
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="ed-right">

        <div className="hw-card preview-card" style={{ position: 'relative' }}>
          <span className="card-label"><span className="step">P</span>Live Preview · resolved bio</span>
          <div className="pv-stack">
            <div className="pv-lcd">
              {previewSegs.map((seg, i) => {
                if (seg.kind === 'anchor')  return <span key={i} className="anchor-fill">{seg.anchorVal}</span>;
                if (seg.kind === 'var')     return <span key={i} className="var-fill">{seg.resolvedText}</span>;
                if (seg.kind === 'pending') return <span key={i} className="pending">{`{{${seg.key}}}`}</span>;
                return <React.Fragment key={i}>{seg.text}</React.Fragment>;
              })}
            </div>
          </div>
          <div className="pv-knobs">
            {profile.variables.slice(0, 6).map((v, i) => (
              <div className="knob-cell" key={i}>
                <DraggableKnob
                  valueIdx={v.valueIdx}
                  total={v.values.length}
                  color={profile.color}
                  size={48}
                  ariaLabel={v.feature_name}
                  onChange={(next) => updateVar(i, { valueIdx: next })}
                />
                <div className="knob-name">{v.feature_name}</div>
                <div className="knob-val">{v.values[v.valueIdx]?.text}</div>
              </div>
            ))}
          </div>
          <div className="pv-actions">
            <button className="hw-btn" onClick={() => {
              // Reroll: pick a random value index per variable, weighted by `weight`
              const next = profile.variables.map(v => {
                if (!v.values || v.values.length === 0) return v;
                const total = v.values.reduce((s, x) => s + (x.weight ?? 1), 0);
                let r = Math.random() * total;
                for (let idx = 0; idx < v.values.length; idx++) {
                  r -= (v.values[idx].weight ?? 1);
                  if (r <= 0) return { ...v, valueIdx: idx };
                }
                return { ...v, valueIdx: v.values.length - 1 };
              });
              setProfile({ ...profile, variables: next });
            }}>🎲 Reroll all</button>
            <button className="hw-btn" onClick={() => {
              // Copy the resolved bio (current valueIdx values + anchors substituted) to clipboard
              const resolved = profile.bioTemplate.replace(/\{\{(\w+)\}\}/g, (full, key) => {
                if (profile.anchors?.[key] != null) return profile.anchors[key];
                const v = profile.variables.find(x => x.name === key);
                if (v && v.values[v.valueIdx]) return v.values[v.valueIdx].text;
                return full;
              });
              navigator.clipboard?.writeText(resolved);
            }}>⎘ Copy bio</button>
            <span style={{ flex: 1 }}></span>
            <button className="hw-btn primary" onClick={onAddToSession}>+ Add to Session</button>
          </div>
        </div>

        <div className="hw-card test-card">
          <span className="card-label"><span className="step">T</span>Test Run · solo chat</span>
          <div style={{ padding: '6px 0' }}>
            {testHistory.length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--hw-text-label)', textAlign: 'center', padding: 12, letterSpacing: '.06em' }}>
                No test messages yet — try one below.
              </div>
            )}
            {testHistory.map((m, i) => (
              <div key={i} className={'test-bubble' + (m.who === 'You' ? ' user' : '')}
                   style={m.pending ? { opacity: 0.6, fontStyle: 'italic' } : {}}>
                <div className="who" style={m.who === 'You' ? {} : { color: profile.color }}>
                  {m.who}{m.pending ? ' · thinking' : ''}
                </div>
                <div>{m.text}</div>
              </div>
            ))}
          </div>
          <div className="test-bar">
            <input value={testInput} onChange={e => setTestInput(e.target.value)} placeholder="Ask the agent something…"/>
            <button className="hw-btn primary" onClick={async () => {
              const q = testInput.trim();
              if (!q) return;
              const userBubble = { who: 'You', text: q };
              const pendingBubble = { who: profile.name, text: '…thinking', pending: true };
              setTestHistory([...testHistory, userBubble, pendingBubble]);
              setTestInput('');
              if (onTestSend) {
                const reply = await onTestSend(profile, q);
                setTestHistory(prev => {
                  const next = [...prev];
                  // Replace the last pending bubble with the real reply
                  for (let i = next.length - 1; i >= 0; i--) {
                    if (next[i].pending) { next[i] = { who: profile.name, text: reply }; break; }
                  }
                  return next;
                });
              } else {
                // Fall back to simulated reply if no handler is wired
                setTestHistory(prev => {
                  const next = [...prev];
                  for (let i = next.length - 1; i >= 0; i--) {
                    if (next[i].pending) { next[i] = { who: profile.name, text: simulateReply(profile, q) }; break; }
                  }
                  return next;
                });
              }
            }}>↵</button>
          </div>
          <div style={{ fontSize: 9, color: 'var(--hw-text-label)', marginTop: 6, letterSpacing: '.06em' }}>
            Test resolves the bio with current knob values and pings Gemini once.
          </div>
        </div>

        <div className="hw-card" style={{ padding: '8px 12px', display:'flex', flexDirection:'column', gap:6 }}>
          <span className="card-label" style={{ padding:0 }}>Save</span>
          <div style={{ display:'flex', gap:6 }}>
            <button className="hw-btn primary" style={{ flex:1, justifyContent:'center' }}
                    onClick={() => {
                      // Every edit auto-persists via setProfile → updateProfile → AgentProfileStore.save.
                      // This button is mostly a confirmation affordance.
                      setLastSavedAt(Date.now());
                      onShowToast?.('Profile saved', 'ok');
                    }}>💾 Save Profile</button>
            <button className="hw-btn"
                    onClick={() => onSaveAs && onSaveAs()}
                    title="Save a copy of this profile under a new name">⎘ Save As…</button>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button className="hw-btn ghost" style={{ flex:1, justifyContent:'center' }} onClick={onBack}>← Back to Library</button>
          </div>
          <span style={{ fontSize: 9, color: 'var(--hw-text-label)', letterSpacing:'.06em' }}>
            Auto-saved {savedAgo} · localStorage
          </span>
        </div>
      </div>
      {chipMenu && ReactDOM.createPortal(
        <div className="chip-popover"
             style={{ position: 'fixed', left: chipMenu.x, top: chipMenu.y, zIndex: 200 }}
             onClick={e => e.stopPropagation()}>
          <div className="chip-pop-item"
               onClick={() => { insertToken(chipMenu.token.kind, chipMenu.token.name); setChipMenu(null); }}>
            ↳ Insert {`{{${chipMenu.token.name}}}`}
          </div>
          {chipMenu.token.kind === 'var' && chipMenu.vIdx >= 0 && (
            <div className="chip-pop-item"
                 onClick={() => {
                   setActiveVarIdx(chipMenu.vIdx);
                   document.getElementById(`var-row-${chipMenu.vIdx}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                   setChipMenu(null);
                 }}>
              ⤳ Jump to variable
            </div>
          )}
          {chipMenu.token.kind === 'var' && (
            <div className="chip-pop-item"
                 onClick={() => {
                   setProfile({ ...profile, anchors: { ...profile.anchors, [chipMenu.token.name]: '' } });
                   setChipMenu(null);
                 }}>
              ⊕ Promote to anchor
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Session / Ensemble Builder ── */
function SessionRoom({
  profiles, sessionAgents, setSessionAgents,
  sharedAnchors, setSharedAnchors, goal, setGoal,
  onLaunch, onEditAgent,
  resolutionMode, setResolutionMode,
  sessionName, setSessionName,
  savedSessions = [],
  onSaveSession, onLoadSession, onDeleteSession,
  sessionTemplates,
  activeTemplateKey, setActiveTemplateKey,
}) {
  const slots = 6;
  const filled = sessionAgents.length;
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [rosterDropArmed, setRosterDropArmed] = useState(false);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [showBioPreview, setShowBioPreview] = useState(false);

  // ── Quick-Start template picker state ──────────────────────────────────
  const [qsCat, setQsCat] = useState('');
  const [qsCollapsed, setQsCollapsed] = useState(false);
  const [conflictPending, setConflictPending] = useState(null); // {key, tpl, resolvedSlots}

  const tplEntries = useMemo(() => {
    if (!sessionTemplates) return [];
    return Object.entries(sessionTemplates).map(([key, tpl]) => ({ key, ...tpl }));
  }, [sessionTemplates]);

  const filteredTpls = useMemo(() => {
    if (!qsCat) return tplEntries;
    return tplEntries.filter(t => t.category === qsCat);
  }, [tplEntries, qsCat]);

  const tplCategories = useMemo(() => {
    const cats = new Set(tplEntries.map(t => t.category));
    return [{ id: '', label: 'All' }, ...Array.from(cats).map(c => ({
      id: c,
      label: (c || 'other').charAt(0).toUpperCase() + (c || 'other').slice(1),
    }))];
  }, [tplEntries]);

  // Resolve a template's agents to profile slots
  const resolveTemplateSlots = (tpl) => {
    return (tpl.agents || []).map(a => {
      const p = profiles.find(pp => pp.name === a.name);
      return p ? { profileId: p.id, overrides: {} } : null;
    }).filter(Boolean);
  };

  // Apply template slots + metadata to the session
  const applyTemplate = (key, tpl, resolvedSlots, mode) => {
    if (mode === 'replace') {
      setSessionAgents(resolvedSlots.slice(0, slots));
    } else if (mode === 'append') {
      const existing = [...sessionAgents];
      for (const slot of resolvedSlots) {
        if (existing.length >= slots) break;
        if (!existing.find(a => a.profileId === slot.profileId)) {
          existing.push(slot);
        }
      }
      setSessionAgents(existing);
    }
    setSessionName(tpl.name || 'Untitled Session');
    if (tpl.suggestedGoals && tpl.suggestedGoals.length > 0) {
      setGoal(tpl.suggestedGoals[0]);
    }
    setActiveTemplateKey(key);
    setQsCollapsed(true);
  };

  const loadTemplate = (key) => {
    const tpl = sessionTemplates?.[key];
    if (!tpl) return;
    const resolvedSlots = resolveTemplateSlots(tpl);
    if (resolvedSlots.length === 0) return;

    if (sessionAgents.length > 0) {
      // Agents already in session — ask user what to do
      setConflictPending({ key, tpl, resolvedSlots });
    } else {
      applyTemplate(key, tpl, resolvedSlots, 'replace');
    }
  };

  const handleConflict = (mode) => {
    if (conflictPending && mode !== 'cancel') {
      applyTemplate(conflictPending.key, conflictPending.tpl, conflictPending.resolvedSlots, mode);
    }
    setConflictPending(null);
  };

  // Common anchor presets a user might want to drop in
  const ANCHOR_TEMPLATES = [
    { k: 'tone',           v: 'professional but playful' },
    { k: 'output_rules',   v: 'Keep replies under 80 words. Use [IMAGE:] for visual ideas.' },
    { k: 'session_context',v: 'Multi-agent creative studio session.' },
    { k: 'audience',       v: 'a curious peer, not a beginner' },
    { k: 'forbidden',      v: 'no LLM-disclaimer language; no hedging' },
  ];

  // ── Slot mutations ─────────────────────────────────────────────────────────
  const addToSlot = (profileId, atIdx = null) => {
    if (sessionAgents.find(a => a.profileId === profileId)) return;
    if (sessionAgents.length >= slots) return;
    const next = [...sessionAgents];
    const slot = { profileId, overrides: {} };
    if (atIdx == null || atIdx >= next.length) next.push(slot);
    else next.splice(atIdx, 0, slot);
    setSessionAgents(next);
  };
  const removeSlot = (i) => {
    const copy = [...sessionAgents]; copy.splice(i, 1); setSessionAgents(copy);
  };
  const swapSlots = (a, b) => {
    if (a === b) return;
    const copy = [...sessionAgents];
    [copy[a], copy[b]] = [copy[b], copy[a]];
    setSessionAgents(copy);
  };
  const toggleLock = (i, varName) => {
    const copy = [...sessionAgents];
    const ovs = { ...(copy[i].overrides || {}) };
    if (ovs[varName] !== undefined) {
      delete ovs[varName];
    } else {
      const p = profiles.find(p => p.id === copy[i].profileId);
      const v = p.variables.find(v => v.name === varName);
      ovs[varName] = v?.values[v.valueIdx]?.text;
    }
    copy[i].overrides = ovs;
    setSessionAgents(copy);
  };
  // Channel-knob drag → set the override to the value at `newIdx`. Auto-locks.
  const setSlotOverrideByIdx = (slotIdx, varName, newIdx) => {
    const copy = [...sessionAgents];
    const p = profiles.find(p => p.id === copy[slotIdx].profileId);
    const v = p?.variables.find(x => x.name === varName);
    if (!v || !v.values[newIdx]) return;
    const ovs = { ...(copy[slotIdx].overrides || {}) };
    ovs[varName] = v.values[newIdx].text;
    copy[slotIdx].overrides = ovs;
    setSessionAgents(copy);
  };
  const rerollAgent = (slotIdx) => {
    const slot = sessionAgents[slotIdx];
    if (!slot) return;
    const p = profiles.find(pp => pp.id === slot.profileId);
    if (!p || p.variables.length === 0) return;
    const copy = [...sessionAgents];
    const ovs = { ...(copy[slotIdx].overrides || {}) };
    p.variables.forEach(v => {
      if (ovs[v.name] !== undefined || v.values.length <= 1) return;
      const totalWeight = v.values.reduce((sum, val) => sum + (val.weight || 1), 0);
      let r = Math.random() * totalWeight;
      let picked = v.values.length - 1;
      for (let i = 0; i < v.values.length; i++) {
        r -= (v.values[i].weight || 1);
        if (r <= 0) { picked = i; break; }
      }
      ovs[v.name] = v.values[picked].text;
    });
    copy[slotIdx] = { ...copy[slotIdx], overrides: ovs };
    setSessionAgents(copy);
  };

  // Effective valueIdx for a channel knob: derived from override (if any), else profile state
  const effectiveIdx = (slot, v) => {
    const lock = slot.overrides?.[v.name];
    if (lock !== undefined) {
      const idx = v.values.findIndex(val => val.text === lock);
      return idx >= 0 ? idx : v.valueIdx;
    }
    return v.valueIdx;
  };

  // ── Anchor mutations ───────────────────────────────────────────────────────
  const addAnchor = (k = '', v = '') => {
    let key = k;
    if (!key) key = window.prompt('Anchor key (e.g. tone, output_rules, audience):') || '';
    key = key.trim();
    if (!key) return;
    if (sharedAnchors[key] !== undefined) return;
    setSharedAnchors({ ...sharedAnchors, [key]: v });
  };
  const renameAnchor = (oldKey, newKey) => {
    newKey = (newKey || '').trim();
    if (!newKey || newKey === oldKey) return;
    if (sharedAnchors[newKey] !== undefined) return;
    const next = {};
    for (const [k, val] of Object.entries(sharedAnchors)) {
      next[k === oldKey ? newKey : k] = val;
    }
    setSharedAnchors(next);
  };
  const deleteAnchor = (k) => {
    const next = { ...sharedAnchors };
    delete next[k];
    setSharedAnchors(next);
  };

  // ── Drag-and-drop wiring ───────────────────────────────────────────────────
  // Use distinct mime types so we know whether the drag came from the roster
  // (a profile id) or from a channel (a slot index for reorder/remove).
  const DRAG_MIME_PROFILE = 'application/x-syntho-profile';
  const DRAG_MIME_SLOT    = 'application/x-syntho-slot';

  const onRosterDragStart = (e, profile) => {
    e.dataTransfer.setData(DRAG_MIME_PROFILE, profile.id);
    e.dataTransfer.effectAllowed = 'copy';
  };
  const onChannelDragStart = (e, slotIdx) => {
    e.dataTransfer.setData(DRAG_MIME_SLOT, String(slotIdx));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onSlotDragOver = (e, slotIdx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlot !== slotIdx) setDragOverSlot(slotIdx);
  };
  const onSlotDragLeave = () => setDragOverSlot(null);
  const onSlotDrop = (e, slotIdx) => {
    e.preventDefault();
    setDragOverSlot(null);
    const profileId = e.dataTransfer.getData(DRAG_MIME_PROFILE);
    const fromSlotStr = e.dataTransfer.getData(DRAG_MIME_SLOT);
    if (profileId) {
      // Drop a profile from roster
      if (slotIdx < sessionAgents.length) {
        // Replace existing slot's profile (preserves overrides — fresh start cleaner here)
        const copy = [...sessionAgents];
        if (!copy.find(a => a.profileId === profileId)) {
          copy[slotIdx] = { profileId, overrides: {} };
          setSessionAgents(copy);
        }
      } else {
        addToSlot(profileId, slotIdx);
      }
    } else if (fromSlotStr !== '') {
      const fromIdx = parseInt(fromSlotStr, 10);
      if (Number.isFinite(fromIdx) && fromIdx !== slotIdx) {
        if (slotIdx < sessionAgents.length) swapSlots(fromIdx, slotIdx);
        else {
          // Move to last position
          const copy = [...sessionAgents];
          const [moved] = copy.splice(fromIdx, 1);
          copy.push(moved);
          setSessionAgents(copy);
        }
      }
    }
  };
  const onRosterDragOver = (e) => {
    // Accept drops only when a slot is being dragged in (drag-back-to-roster = remove)
    const types = Array.from(e.dataTransfer.types || []);
    if (types.includes(DRAG_MIME_SLOT)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!rosterDropArmed) setRosterDropArmed(true);
    }
  };
  const onRosterDragLeave = () => setRosterDropArmed(false);
  const onRosterDrop = (e) => {
    setRosterDropArmed(false);
    const fromSlotStr = e.dataTransfer.getData(DRAG_MIME_SLOT);
    if (fromSlotStr !== '') {
      e.preventDefault();
      const fromIdx = parseInt(fromSlotStr, 10);
      if (Number.isFinite(fromIdx)) removeSlot(fromIdx);
    }
  };

  // Dynamic goal suggestions: prefer the active template's suggestedGoals,
  // then fall back to generic defaults.
  const activeTpl = activeTemplateKey && sessionTemplates?.[activeTemplateKey];
  const SUGG = (activeTpl && activeTpl.suggestedGoals && activeTpl.suggestedGoals.length > 0)
    ? activeTpl.suggestedGoals
    : [
        'Write the weirdest text-to-image prompts possible',
        'Iterate one concept through 10 evolutions',
        'Pitch a band poster, refine the visual language',
        'Argue both sides of "AI art is real art"',
      ];

  return (
    <div className="session-grid">

      {/* Roster (left) — also acts as a "drop here to remove" zone for slot drags */}
      <div className="hw-card"
           onDragOver={onRosterDragOver}
           onDragLeave={onRosterDragLeave}
           onDrop={onRosterDrop}
           style={{ position:'relative', outline: rosterDropArmed ? '2px dashed var(--hw-pink)' : 'none', outlineOffset: '-2px' }}>
        <span className="card-label">
          <span className="step">1</span>
          Roster · click or drag {rosterDropArmed ? '· drop to remove from session' : ''}
        </span>
        <div className="roster-card">
          {profiles.map(p => {
            const inSession = sessionAgents.find(a => a.profileId === p.id);
            return (
              <div key={p.id} className="roster-item"
                   draggable={!inSession}
                   onDragStart={(e) => onRosterDragStart(e, p)}
                   onClick={() => !inSession && addToSlot(p.id)}
                   style={ inSession ? { opacity: .4, cursor: 'default' } : {}}>
                <span className="dot" style={{ background: p.color }}></span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="nm">{p.icon} {p.name}</div>
                  <div className="cat">{p.category} · {p.variables.length} knobs</div>
                </div>
                {inSession ? <span style={{ fontSize: 9, color: 'var(--hw-grn)' }}>✓ in</span>
                           : <span style={{ fontSize: 14, color: 'var(--hw-text-label)' }}>+</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Channel rack (center) */}
      <div className="hw-card">
        <div className="sess-head">
          <input value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Session name (e.g. Prompt Alchemy Lab)"/>
          <div style={{ display:'flex', gap: 12, alignItems:'center', marginTop: 4, flexWrap: 'wrap' }}>
            <span className="meta">{filled} / {slots} channels</span>
            <span className="meta">·</span>
            <span className="meta">Resolution mode</span>
            <div className="res-toggle">
              <button className={resolutionMode === 'once' ? 'active' : ''}
                      onClick={() => setResolutionMode('once')}
                      title="Resolve each agent's bio once when the session starts.">
                once at start
              </button>
              <button className={resolutionMode === 'each_turn' ? 'active' : ''}
                      disabled
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                      title="Coming with hot bio-swap support — needs orchestrator changes.">
                each turn
              </button>
            </div>
            <span style={{ flex: 1 }}></span>
            {/* Saved-sessions menu */}
            <div style={{ position: 'relative' }}>
              <button className="hw-btn tiny" onClick={() => setShowLoadMenu(s => !s)}
                      title="Load a saved session preset">▾ Sessions ({savedSessions.length})</button>
              {showLoadMenu && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 20,
                  minWidth: 240, maxHeight: 280, overflowY: 'auto',
                  background: 'var(--hw-panel)', border: 'var(--hw-border)',
                  borderRadius: 3, boxShadow: 'var(--hw-shadow)',
                }}>
                  {savedSessions.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 11, color: 'var(--hw-text-dim)', textAlign: 'center' }}>
                      No saved sessions yet — use 💾 Save below.
                    </div>
                  ) : savedSessions.map(s => (
                    <div key={s.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--hw-border-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                           onClick={() => { onLoadSession && onLoadSession(s.id); setShowLoadMenu(false); }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{s.name || '(unnamed)'}</div>
                        <div style={{ fontSize: 9, color: 'var(--hw-text-dim)', letterSpacing: '.06em' }}>
                          {(s.agents || []).length} agents · {Object.keys(s.sharedAnchors || {}).length} anchors
                        </div>
                      </div>
                      <button className="hw-btn tiny ghost"
                              style={{ color: 'var(--hw-pink)' }}
                              onClick={() => onDeleteSession && onDeleteSession(s.id)}
                              title="Delete preset">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="channel-rack">
          {Array.from({ length: slots }).map((_, slotIdx) => {
            const slot = sessionAgents[slotIdx];
            const dragHL = dragOverSlot === slotIdx
              ? { outline: '2px solid var(--hw-amb)', outlineOffset: '-2px' } : {};
            if (!slot) {
              return (
                <div key={slotIdx} className="channel empty"
                     onDragOver={(e) => onSlotDragOver(e, slotIdx)}
                     onDragLeave={onSlotDragLeave}
                     onDrop={(e) => onSlotDrop(e, slotIdx)}
                     style={dragHL}>
                  <span className="add-cross">+</span>
                  <span className="add-lbl">slot {slotIdx + 1}</span>
                </div>
              );
            }
            const p = profiles.find(p => p.id === slot.profileId);
            if (!p) {
              // Profile referenced by slot is missing (deleted from store) — show a stub
              return (
                <div className="channel" key={slotIdx} style={{ opacity: 0.6 }}>
                  <div className="channel-head">
                    <span className="led" style={{ background: '#999' }}></span>
                    <span className="nm" style={{ color: 'var(--hw-pink)' }}>missing profile</span>
                    <span className="x" onClick={() => removeSlot(slotIdx)}>✕</span>
                  </div>
                  <div className="channel-num">CH {String(slotIdx + 1).padStart(2, '0')} · profileId {slot.profileId}</div>
                  <div style={{ padding: 16, fontSize: 10, color: 'var(--hw-text-dim)', textAlign: 'center' }}>
                    The referenced profile no longer exists. Remove this slot or restore the profile.
                  </div>
                </div>
              );
            }
            return (
              <div className="channel" key={slotIdx}
                   draggable
                   onDragStart={(e) => onChannelDragStart(e, slotIdx)}
                   onDragOver={(e) => onSlotDragOver(e, slotIdx)}
                   onDragLeave={onSlotDragLeave}
                   onDrop={(e) => onSlotDrop(e, slotIdx)}
                   style={dragHL}>
                <div className="channel-head">
                  <span className="led" style={{ background: p.color, boxShadow: `0 0 4px ${p.color}` }}></span>
                  <span className="nm">{p.name}</span>
                  <span className="x" onClick={() => removeSlot(slotIdx)}>✕</span>
                </div>
                <div className="channel-num">CH {String(slotIdx + 1).padStart(2, '0')} · {p.icon} · {p.category}</div>
                <div className="channel-knobs">
                  {p.variables.slice(0, 4).map((v, vi) => {
                    const locked = slot.overrides?.[v.name] !== undefined;
                    const idx = effectiveIdx(slot, v);
                    return (
                      <div key={vi} className={'channel-knob' + (locked ? ' locked' : '')}
                           onClick={() => toggleLock(slotIdx, v.name)}
                           title={locked
                             ? 'Locked at this value · click to unlock (re-randomize) · drag knob to change locked value'
                             : 'Click to lock current value · drag knob to lock at a different value'}>
                        <DraggableKnob
                          valueIdx={idx}
                          total={v.values.length}
                          color={p.color}
                          size={36}
                          ariaLabel={`${p.name} ${v.feature_name}`}
                          onChange={(newIdx) => setSlotOverrideByIdx(slotIdx, v.name, newIdx)}
                        />
                        <span className="lbl">{v.feature_name}</span>
                        <span className="val">{v.values[idx]?.text}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="channel-foot">
                  <button className="hw-btn tiny ghost" onClick={() => onEditAgent(p)}>✎ Edit</button>
                  <span style={{ flex: 1 }}></span>
                  <span style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--hw-text-dim)', textTransform: 'uppercase' }}>
                    {Object.keys(slot.overrides || {}).length} locked
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right column — Quick Start + Goal + Anchors */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Quick Start — Session Templates */}
        {tplEntries.length > 0 && (
          <div className={'hw-card qs-card' + (qsCollapsed ? ' collapsed' : '')}>
            <div className="qs-header" onClick={() => setQsCollapsed(c => !c)}>
              <span className="card-label" style={{ padding: 0 }}>
                <span className="step">⚡</span>Quick Start · Session Templates
              </span>
              <span className="qs-chevron">▾</span>
              {activeTemplateKey && qsCollapsed && (
                <span className="qs-loaded-badge">✓ {sessionTemplates?.[activeTemplateKey]?.name}</span>
              )}
            </div>
            <div className="qs-body">
              <div className="qs-cats">
                {tplCategories.map(c => (
                  <span key={c.id}
                        className={'qs-cat-pill' + (qsCat === c.id ? ' active' : '')}
                        onClick={() => setQsCat(c.id)}>{c.label}</span>
                ))}
              </div>
              <div className="qs-grid">
                {filteredTpls.map(t => (
                  <div key={t.key}
                       className={'qs-tpl' + (activeTemplateKey === t.key ? ' active' : '')}
                       onClick={() => loadTemplate(t.key)}
                       title={t.description || t.name}>
                    <div className="qs-tpl-name">{t.name}</div>
                    <div className="qs-tpl-meta">
                      <span className="qs-dot" style={{ background: CAT_COLORS[t.category]?.[0] || '#8a7e6e' }}></span>
                      <span>{t.category}</span>
                      <span>·</span>
                      <span>{(t.agents || []).length} agents</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="hw-card goal-card">
          <span className="card-label"><span className="step">2</span>Session Goal</span>
          <textarea value={goal} onChange={e => setGoal(e.target.value)} placeholder="What is this ensemble trying to do?"/>
          <div className="goal-suggestions">
            {SUGG.map((s, i) => (
              <span key={i} className="goal-sugg" onClick={() => setGoal(s)}>↑ {s}</span>
            ))}
          </div>
        </div>

        <div className="hw-card anchor-side">
          <span className="card-label"><span className="step">3</span>Shared Anchors · injected into every bio</span>
          {Object.entries(sharedAnchors).map(([k, v]) => (
            <div key={k} className="anch-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 4, padding: '6px 10px' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <input className="akey-input"
                       value={k}
                       onChange={e => renameAnchor(k, e.target.value)}
                       style={{
                         fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase',
                         color: 'var(--hw-text-label)', background: 'transparent',
                         border: 'none', borderBottom: '1px dashed transparent', padding: '2px 0',
                         fontFamily: 'var(--font-label)',
                       }}
                       onFocus={e => e.target.style.borderBottomColor = 'var(--hw-text-label)'}
                       onBlur={e => e.target.style.borderBottomColor = 'transparent'}/>
                <input className="aval"
                       value={v}
                       onChange={e => setSharedAnchors({ ...sharedAnchors, [k]: e.target.value })}/>
              </span>
              <button className="hw-btn tiny ghost"
                      style={{ color: 'var(--hw-pink)', alignSelf: 'start', marginTop: 12 }}
                      onClick={() => deleteAnchor(k)}
                      title="Delete this anchor">✕</button>
            </div>
          ))}
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="hw-btn ghost" style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => addAnchor()}>+ Add shared anchor</button>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {ANCHOR_TEMPLATES.map(t => (
                <button key={t.k} className="hw-btn tiny ghost"
                        disabled={sharedAnchors[t.k] !== undefined}
                        onClick={() => addAnchor(t.k, t.v)}
                        title={t.v}
                        style={{ fontSize: 9 }}>+ {t.k}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="hw-card launch-card">
          <span className="launch-stat"><span className="num">{filled}</span>agents</span>
          <span className="launch-stat"><span className="num">{Object.keys(sharedAnchors).length}</span>anchors</span>
          <span className="launch-stat"><span className="num">{sessionAgents.reduce((acc, a) => {
            const p = profiles.find(p => p.id === a.profileId);
            return acc + (p?.variables.length || 0);
          }, 0)}</span>knobs</span>
          <span className="grow"></span>
          <button className="hw-btn" onClick={onSaveSession} disabled={filled === 0} title="Save this session as a reusable preset">💾 Save</button>
          <button className="hw-btn" onClick={() => setShowBioPreview(true)} disabled={filled === 0} title="Preview resolved bios before launch">👁 Preview</button>
          <button className="launch-btn" onClick={onLaunch} disabled={filled === 0}>▶ Launch Session</button>
        </div>
        {showBioPreview && (
          <div className="bio-preview-overlay">
            <div className="bio-preview-panel hw-card">
              <span className="card-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>👁 Bio preview · exactly what will be posted</span>
                <button className="hw-btn tiny ghost" onClick={() => setShowBioPreview(false)}>✕</button>
              </span>
              <div className="bio-preview-list">
                {sessionAgents.map((slot, si) => {
                  const p = profiles.find(pp => pp.id === slot.profileId);
                  if (!p) return null;
                  const lp = { ...p, variables: p.variables.map(v => {
                    const lock = slot.overrides?.[v.name];
                    if (lock === undefined) return v;
                    const idx = v.values.findIndex(val => val.text === lock);
                    return idx >= 0 ? { ...v, valueIdx: idx } : v;
                  })};
                  const bio = resolveBio(lp, sharedAnchors);
                  return (
                    <div key={si} className="bio-preview-agent">
                      <div className="bio-preview-agent-head">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }}></span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>{p.name}</span>
                        <span style={{ flex: 1 }}></span>
                        <button className="hw-btn tiny" onClick={() => rerollAgent(si)} title="Re-randomize unlocked variables">🎲 reroll</button>
                      </div>
                      <div className="bio-preview-bio">{bio}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', gap: 8, borderTop: 'var(--hw-border)' }}>
                <button className="hw-btn ghost" onClick={() => setShowBioPreview(false)}>← Back</button>
                <span style={{ flex: 1 }}></span>
                <button className="launch-btn" onClick={() => { setShowBioPreview(false); onLaunch(); }}>▶ Looks good — Launch</button>
              </div>
            </div>
          </div>
        )}

        {/* Conflict resolution dialog */}
        {conflictPending && (
          <div className="conflict-overlay">
            <div className="conflict-panel">
              <div className="conf-head">Session has agents</div>
              <div className="conf-body">
                You have {sessionAgents.length} agent{sessionAgents.length !== 1 ? 's' : ''} in the current session.
                Loading <strong>{conflictPending.tpl.name}</strong> ({conflictPending.resolvedSlots.length} agents) —
                how would you like to proceed?
              </div>
              <div className="conf-actions">
                <button className="hw-btn ghost" onClick={() => handleConflict('cancel')}>Cancel</button>
                <span className="grow"></span>
                <button className="hw-btn" onClick={() => handleConflict('append')}
                        title="Add template agents to existing slots (up to 6)">+ Append</button>
                <button className="hw-btn primary" onClick={() => handleConflict('replace')}
                        title="Clear current agents and load the template">↻ Replace</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Run Room — launch staging card ────────────────────────────────────────
   Agents are already posted to the chatroom by launchSession() before this
   room is shown. This card surfaces the result and hands off to Agent Studio.
   Shown only as a fallback when window.agentStudio is not available. */
function RunRoom({ profiles, sessionAgents, sharedAnchors, goal, onBack }) {
  const agents = sessionAgents.map(a => ({
    ...a, profile: profiles.find(p => p.id === a.profileId),
  })).filter(a => a.profile);

  const openInStudio = () => {
    if (window.agentStudio && typeof window.agentStudio.openWithSession === 'function') {
      window.agentStudio.openWithSession({ goal: goal || '', fromComposer: true });
    }
  };
  const copyGoal = () => { navigator.clipboard?.writeText(goal || '').catch(() => {}); };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="hw-card">
        <span className="card-label"><span className="step">▶</span>Launch Staging</span>
        <div style={{ padding: '10px 16px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agents.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.profile.color, flexShrink: 0 }}></span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{a.profile.name}</span>
              <span style={{ flex: 1 }}></span>
              <span style={{ fontSize: 9, letterSpacing: '.1em', color: 'var(--hw-grn)', textTransform: 'uppercase' }}>✓ posted</span>
            </div>
          ))}
        </div>
        <div style={{ margin: '8px 16px', padding: '10px 12px', background: 'var(--hw-recessed)', borderRadius: 2, fontSize: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div><span style={{ color: 'var(--hw-grn)' }}>✓</span> {agents.length} agent{agents.length !== 1 ? 's' : ''} loaded into chatroom</div>
          {goal && <div><span style={{ color: 'var(--hw-grn)' }}>✓</span> Goal set · {Object.keys(sharedAnchors).length} shared anchor{Object.keys(sharedAnchors).length !== 1 ? 's' : ''} merged</div>}
        </div>
        <div style={{ padding: '10px 16px 6px', display: 'flex', gap: 8 }}>
          <button className="launch-btn" style={{ flex: 1 }} onClick={openInStudio}>▶ Open in Agent Studio</button>
        </div>
        <div style={{ padding: '4px 16px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="hw-btn ghost" onClick={onBack}>← Back to Compose</button>
          {goal && <button className="hw-btn" onClick={copyGoal}>⎘ Copy Goal</button>}
          <span style={{ flex: 1 }}></span>
          <a href="/chatroom" className="hw-btn" style={{ textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">Open Chatroom ↗</a>
        </div>
      </div>
    </div>
  );
}

/* ── Backend integration helpers ──────────────────────────────────────────── */

const SYNTHO_API   = '';                 // FastAPI is same-origin
const CHATROOM_API = '/chatroom/api';    // Reverse-proxied by FastAPI

// AgentProfileStore.loadAll() runs migrateProfileSchema on every entry, so
// profiles arriving here are already canonical v5 shape — no extra normalisation
// is needed. We keep a tiny shim in case the module hasn't finished loading.
function normalizeStoredProfile(p) {
  if (window.migrateProfileSchema) {
    return window.migrateProfileSchema(p).profile;
  }
  // Defensive fallback: ensure the fields the UI reads exist. Should rarely run.
  return {
    ...p,
    icon: p.icon || '🤖',
    color: p.color || '#7a6e5e',
    description: p.description || '',
    bioTemplate: p.bioTemplate || '',
    variables: p.variables || [],
    anchors: p.anchors || {},
    tags: normalizeTags(p.tags),
  };
}
function normalizeTags(tags) {
  return (tags || [{ type: 'creator', label: 'You' }]).map(t => ({
    ...t,
    type: t.label === 'Built-in' ? 'builtin' : (t.label === 'You' ? 'creator' : t.type),
  }));
}

// Poll briefly for the AgentProfileStore module to finish loading.
// `<script type="module">` is deferred, so it may not be ready when React first renders.
function whenStoreReady(cb, attempts = 0) {
  if (window.AgentProfileStore) return cb(window.AgentProfileStore);
  if (attempts > 30) return cb(null);
  setTimeout(() => whenStoreReady(cb, attempts + 1), 50);
}

/* ── App shell ── */
function App() {
  const [room, setRoom] = useState('library');
  const [profiles, setProfiles] = useState(SEED_PROFILES);
  const [editingId, setEditingId] = useState(null);
  const [storeReady, setStoreReady] = useState(false);
  const [sessionAgents, setSessionAgents] = useState([]);
  const [sharedAnchors, setSharedAnchors] = useState({
    session_context: 'Multi-agent creative studio session.',
    output_rules: 'Use [IMAGE:] for visual ideas. Keep replies under 80 words.',
    tone: 'professional but playful',
  });
  const [goal, setGoal] = useState('Write the weirdest text-to-image prompts possible');
  const [sessionName, setSessionName] = useState('Untitled Session');
  const [resolutionMode, setResolutionMode] = useState('once'); // 'once' | 'each_turn' (each_turn pending Phase 8)
  const [savedSessions, setSavedSessions] = useState([]);
  const [toast, setToast] = useState(null);
  const [activeTemplateKey, setActiveTemplateKey] = useState(null);
  const sessionTemplates = window.AS_AGENT_TEMPLATES_REF || null;

  // Hydrate from AgentProfileStore once the module has loaded.
  // Also run the legacy AS_AGENT_TEMPLATES migration so built-in agents from
  // Agent Studio show up as "Built-in" patches in the Library on first visit.
  useEffect(() => {
    whenStoreReady((store) => {
      if (!store) return;
      // Pull in legacy built-ins (idempotent — guarded by an internal marker)
      if (window.autoMigrateBuiltInPresets && window.AS_AGENT_TEMPLATES_REF) {
        try { window.autoMigrateBuiltInPresets(window.AS_AGENT_TEMPLATES_REF); } catch (_) {}
      }
      let stored = store.loadAll();
      if (stored.length === 0) {
        SEED_PROFILES.forEach(p => store.save(p));
        stored = store.loadAll();
      }
      setProfiles(stored.map(normalizeStoredProfile));
      setStoreReady(true);
    });
  }, []);

  // Reload from store when the window regains focus — picks up changes the user
  // made via the Agent Studio modal (which writes to the same AgentProfileStore).
  useEffect(() => {
    const onFocus = () => {
      if (window.AgentProfileStore) {
        setProfiles(window.AgentProfileStore.loadAll().map(normalizeStoredProfile));
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // External command bus — Agent Studio (and other code) can drive Composer's
  // React state via `window.dispatchEvent(new CustomEvent('composer:command', {detail: {...}}))`.
  // The friendly wrapper lives on `window.Composer` (set up at module bottom).
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail || {};
      // Always re-read the store first so external saves are visible
      let latest = profiles;
      if (window.AgentProfileStore) {
        latest = window.AgentProfileStore.loadAll().map(normalizeStoredProfile);
        setProfiles(latest);
      }
      switch (d.action) {
        case 'goToLibrary':
          setRoom('library');
          break;
        case 'goToEditor': {
          // Look up by id first, then by name as a fallback
          let target = d.profileId && latest.find(p => p.id === d.profileId);
          if (!target && d.name) target = latest.find(p => p.name === d.name);
          if (!target && d.name) {
            // Auto-create from {name, bio} if not found — useful when bridging
            // a chatroom-only agent (no profile in the store yet) into the editor.
            target = {
              id: 'p_' + Math.random().toString(36).slice(2, 8),
              name: d.name,
              icon: '🤖',
              color: '#7a6e5e',
              category: 'custom',
              description: 'Imported from Agent Studio.',
              bioTemplate: d.bio || `You are {{agent_name}}.`,
              variables: [],
              anchors: { agent_name: d.name },
              tags: [{ type: 'creator', label: 'You' }],
            };
            if (window.AgentProfileStore) window.AgentProfileStore.save(target);
            setProfiles([target, ...latest]);
          }
          if (target) {
            setEditingId(target.id);
            setRoom('editor');
          }
          break;
        }
        case 'goToSession':
          setRoom('session');
          break;
        case 'openSessionFromRecipe': {
          // d.agents: [{name, bio?}], d.goal: string
          // Map each name to an existing profile (by name); skip if not found
          const slots = (d.agents || []).map(a => {
            const p = latest.find(p => p.name === a.name);
            return p ? { profileId: p.id, overrides: {} } : null;
          }).filter(Boolean);
          if (slots.length > 0) setSessionAgents(slots);
          if (d.goal) setGoal(d.goal);
          setRoom('session');
          break;
        }
        case 'goToRoom':
          if (['library','editor','session','run'].includes(d.room)) setRoom(d.room);
          break;
      }
    };
    window.addEventListener('composer:command', handler);
    return () => window.removeEventListener('composer:command', handler);
  }, [profiles]);

  // Toast helper — fades out after 2.5s
  const showToast = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(t => (t && t.msg === msg ? null : t)), 2500);
  }, []);

  // Sync flow + room pill UI
  useEffect(() => {
    document.querySelectorAll('#room-pill button').forEach(b => {
      b.classList.toggle('active', b.dataset.room === room);
      b.onclick = () => setRoom(b.dataset.room);
    });
    // Support both the legacy .flow-step and new .flow-seg pill elements
    document.querySelectorAll('.flow-step, .flow-seg').forEach(s => {
      s.classList.toggle('active', s.dataset.room === room);
      const order = ['library','editor','session','run'];
      const cur = order.indexOf(room);
      const myI = order.indexOf(s.dataset.room);
      s.classList.toggle('done', myI < cur);
      s.onclick = () => setRoom(s.dataset.room);
    });
    document.querySelectorAll('.room').forEach(r => r.classList.toggle('active', r.id === 'room-' + room));
  }, [room]);

  const editingProfile = useMemo(() => profiles.find(p => p.id === editingId) || profiles[0], [profiles, editingId]);

  // Keyboard shortcuts. Active only when the layout-switcher's Composer mode is
  // the visible mode (so we don't hijack Studio/Perform typing). Skip when
  // focus is in any text-entry control to keep typing intact.
  useEffect(() => {
    const handler = (e) => {
      // Bail if Composer isn't currently the visible mode
      const composerActive = document.querySelector('.layout-btn[data-mode="composer"].active');
      if (!composerActive) return;

      const tag = (e.target && e.target.tagName) || '';
      const isText =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        (e.target && e.target.isContentEditable);

      // Cmd/Ctrl+S anywhere → save toast (everything auto-saves on edit)
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setToast({ msg: 'Profile saved · auto-saving is on', kind: 'ok' });
        setTimeout(() => setToast(t => (t && t.kind === 'ok' ? null : t)), 1800);
        return;
      }

      // Room hotkeys 1–4 (only when not typing)
      if (isText) return;
      const map = { '1': 'library', '2': 'editor', '3': 'session', '4': 'run' };
      const target = map[e.key];
      if (target) {
        e.preventDefault();
        if (target === 'editor' && !editingProfile) {
          setRoom('library');
        } else {
          setRoom(target);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingProfile]);

  const updateProfile = (np) => {
    setProfiles(profiles.map(p => p.id === np.id ? np : p));
    if (window.AgentProfileStore) window.AgentProfileStore.save(np);
  };
  const createNew = () => {
    const id = 'p_' + Math.random().toString(36).slice(2, 8);
    const np = {
      id, name: 'New Agent', icon: '🤖', color: '#7a6e5e', category: 'custom',
      description: 'Describe your agent in one sentence.',
      bioTemplate: 'You are {{agent_name}}, a {{role}}. Your style is {{style}}.',
      variables: [
        { name: 'role', feature_name: 'Role', valueIdx: 0, values: [{ text: 'helpful assistant', weight: 1 }] },
        { name: 'style', feature_name: 'Style', valueIdx: 0, values: [{ text: 'concise', weight: 1 }] },
      ],
      anchors: { agent_name: 'New Agent' },
      tags: [{ type: 'creator', label: 'You' }],
    };
    setProfiles([np, ...profiles]);
    if (window.AgentProfileStore) window.AgentProfileStore.save(np);
    setEditingId(id);
    setRoom('editor');
  };

  // ── Library Quick Actions ─────────────────────────────────────────────────

  // ⎘ Remix: clone the profile with a new id, marked as a remix
  const remixProfile = (p) => {
    const id = 'p_' + Math.random().toString(36).slice(2, 8);
    const remix = {
      ...p,
      id,
      name: `${p.name} (remix)`,
      tags: [{ type: 'creator', label: 'You' }, { type: 'remix', label: 'Remixed' }],
      createdAt: undefined,  // store will stamp fresh
      updatedAt: undefined,
    };
    setProfiles([remix, ...profiles]);
    if (window.AgentProfileStore) window.AgentProfileStore.save(remix);
    setEditingId(id);
    setRoom('editor');
    showToast('Profile remixed', 'ok');
  };

  // ⎘ Save As: clone the currently-editing profile under a new name + id, then
  //   open the clone in the editor. The original is left untouched.
  const saveAsProfile = (current) => {
    if (!current) return;
    const newName = (window.prompt('Save as — new profile name:', `${current.name} (copy)`) || '').trim();
    if (!newName) return;
    const id = 'p_' + Math.random().toString(36).slice(2, 8);
    const clone = {
      ...current,
      id,
      name: newName,
      anchors: { ...(current.anchors || {}), agent_name: newName },
      tags: [{ type: 'creator', label: 'You' }],
      createdAt: undefined,
      updatedAt: undefined,
    };
    setProfiles([clone, ...profiles]);
    if (window.AgentProfileStore) window.AgentProfileStore.save(clone);
    setEditingId(id);
    showToast(`Saved as "${newName}"`, 'ok');
  };

  // ▷ Test: send one message to the agent's resolved bio. Inline alert for now;
  //   a proper test popover lives in the editor's Test Run card.
  const testProfile = async (p) => {
    const q = window.prompt(`Test "${p.name}" — send one message:`, 'Hello.');
    if (!q) return;
    showToast('Asking agent…', 'ok');
    try {
      const reply = await sendTestMessage(p, q);
      // The reply may be long; show a confirmation dialog rather than a toast.
      window.alert(`${p.name} says:\n\n${reply}`);
    } catch (err) {
      showToast(`Test failed: ${err.message}`, 'err');
    }
  };

  // ✕ Delete: confirmation prompt, then drop from store and state
  const deleteProfile = (p) => {
    if (!window.confirm(`Delete profile "${p.name}"? This cannot be undone.`)) return;
    if (window.AgentProfileStore) window.AgentProfileStore.delete(p.id);
    setProfiles(profiles.filter(x => x.id !== p.id));
    showToast('Profile deleted', 'ok');
  };

  // ↑ Import JSON: pop a hidden <input type="file">, parse, save each
  const importProfilesFromJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          const incoming = Array.isArray(data) ? data : [data];
          let added = 0;
          incoming.forEach(raw => {
            if (!raw || typeof raw !== 'object') return;
            // Force a new id so we don't clobber an existing profile by accident
            const seed = { ...raw, id: 'p_' + Math.random().toString(36).slice(2, 8) };
            if (window.AgentProfileStore) window.AgentProfileStore.save(seed);
            added++;
          });
          if (window.AgentProfileStore) {
            setProfiles(window.AgentProfileStore.loadAll().map(normalizeStoredProfile));
          }
          showToast(`Imported ${added} profile${added === 1 ? '' : 's'}`, 'ok');
        } catch (err) {
          showToast(`Import failed: ${err.message}`, 'err');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // ↓ Export All: download the full library as a single JSON file
  const exportAllProfiles = () => {
    const data = window.AgentProfileStore ? window.AgentProfileStore.loadAll() : profiles;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${data.length} profile${data.length === 1 ? '' : 's'}`, 'ok');
  };

  // ✦ Generate from Image: pop file picker, analyze image to a description,
  //   then pipe that description through the agent_profile generator and save
  //   the result as a brand-new profile.
  const generateFromImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        showToast('Analyzing image…', 'ok');
        const b64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result.split(',')[1]);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        // Step 1: image → descriptive prompt
        const ar = await fetch(`${SYNTHO_API}/api/analyze/image-to-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64 }),
        });
        if (!ar.ok) throw new Error(`Analyze HTTP ${ar.status}`);
        const aData = await ar.json();
        const description = aData.prompt || aData.text || aData.description || '';
        if (!description) throw new Error('Empty analysis result');
        // Step 2: description → agent profile JSON
        showToast('Generating agent from analysis…', 'ok');
        const gr = await fetch(`${SYNTHO_API}/api/generate/template`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'agent_profile', prompt: `An agent inspired by: ${description}` }),
        });
        if (!gr.ok) throw new Error(`Generate HTTP ${gr.status}`);
        const gData = await gr.json();
        const tpl = gData.template || {};
        const id = 'p_' + Math.random().toString(36).slice(2, 8);
        const fresh = {
          id,
          name: tpl.name || 'Image Agent',
          icon: '🖼',
          color: '#5a8ab8',
          category: tpl.category || 'imagegen',
          description: tpl.description || description.slice(0, 120),
          bioTemplate: tpl.bioTemplate || '',
          variables: (tpl.variables || []).map(v => ({
            name: v.name,
            feature_name: v.feature_name || v.name,
            valueIdx: 0,
            values: (v.values || []).map(val =>
              typeof val === 'string' ? { text: val, weight: 1 } : { weight: 1, ...val }
            ),
          })),
          anchors: tpl.anchors || {},
          tags: [{ type: 'creator', label: 'You' }],
        };
        if (window.AgentProfileStore) window.AgentProfileStore.save(fresh);
        setProfiles([fresh, ...profiles]);
        setEditingId(id);
        setRoom('editor');
        showToast('Profile generated from image', 'ok');
      } catch (err) {
        showToast(`Generate-from-image failed: ${err.message}`, 'err');
      }
    };
    input.click();
  };

  // ── Wired backend handlers ────────────────────────────────────────────────

  // ✦ Generate from description: calls /api/generate/template?mode=agent_profile,
  //   merges the returned skeleton into the profile currently being edited.
  // Cache the user's taste vector for the session — extracted once from existing
  // profiles, then reused across generations. Refreshes when the profile count
  // grows by ≥3 (so as the library evolves, the vector keeps up without spamming
  // taste_vector calls on every Generate click).
  const tasteVectorRef = useRef(null);
  const tasteVectorAtCount = useRef(0);

  const fetchTasteVector = async () => {
    // Need at least 3 user-authored or remix profiles to mine meaningfully.
    // Built-in agents are excluded — they don't reflect this user's taste.
    const sample = profiles
      .filter(p => p.tags && p.tags.some(t => t.type === 'creator' || t.type === 'remix'))
      .slice(0, 8);
    if (sample.length < 3) return null;
    if (tasteVectorRef.current && Math.abs(sample.length - tasteVectorAtCount.current) < 3) {
      return tasteVectorRef.current;
    }
    try {
      const artifacts = sample.map(p => ({
        kind: 'agent_bio',
        text: p.bioTemplate || '',
        meta: { name: p.name, description: p.description, category: p.category },
      }));
      const res = await fetch(`${SYNTHO_API}/api/generate/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'taste_vector', artifacts }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      tasteVectorRef.current = data.taste_vector || null;
      tasteVectorAtCount.current = sample.length;
      return tasteVectorRef.current;
    } catch (_) {
      return null;
    }
  };

  const generateFromDescription = async (description, styleInstruction) => {
    if (!description || !description.trim()) {
      showToast('Type a description first', 'warn');
      return;
    }
    try {
      showToast('Reading your taste…', 'ok');
      const tasteVector = await fetchTasteVector();

      // Build a structured context prompt that includes the full current profile
      // so the model can edit-in-place rather than starting from scratch.
      const current = profiles.find(p => p.id === editingId) || profiles[0];
      const profileContext = current ? {
        name: current.name,
        category: current.category,
        description: current.description,
        bioTemplate: current.bioTemplate,
        variables: current.variables,
        anchors: current.anchors,
      } : null;

      let prompt = '';
      if (tasteVector) {
        prompt += `[CREATOR'S TASTE PROFILE — bias the generated agent toward this voice and aesthetic, but do not literally quote it]\n${JSON.stringify(tasteVector, null, 2)}\n\n`;
      }
      if (profileContext && profileContext.bioTemplate) {
        prompt += `[EXISTING PROFILE — edit this to match the request; regenerate fully only if the concept changes completely]\n${JSON.stringify(profileContext, null, 2)}\n\n`;
      }
      prompt += `[USER REQUEST]\n${description}`;

      showToast('Asking Gemini…', 'ok');
      const body = { mode: 'agent_profile', prompt };
      if (styleInstruction && styleInstruction.trim()) body.style_instruction = styleInstruction.trim();

      const res = await fetch(`${SYNTHO_API}/api/generate/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const tpl = data.template || {};
      // Merge into the currently-editing profile (preserves id, color, tags, icon)
      const merged = {
        ...current,
        name: tpl.name || current.name,
        category: tpl.category || current.category,
        bioTemplate: tpl.bioTemplate || current.bioTemplate,
        description: tpl.description || current.description,
        variables: (tpl.variables || []).map(v => ({
          name: v.name,
          feature_name: v.feature_name || v.name,
          valueIdx: 0,
          values: (v.values || []).map(val =>
            typeof val === 'string' ? { text: val, weight: 1 } : { weight: 1, ...val }
          ),
        })),
        anchors: tpl.anchors || current.anchors || {},
      };
      // Ensure agent_name anchor stays in sync with display name
      if (!merged.anchors.agent_name) merged.anchors.agent_name = merged.name;
      updateProfile(merged);
      showToast(tasteVector ? 'Profile generated · taste-biased' : 'Profile generated', 'ok');
    } catch (err) {
      showToast(`Generate failed: ${err.message}`, 'err');
    }
  };

  // Live knob tweak during a running session: cycles the variable's effective
  // value, writes to slot.overrides (so it sticks across reloads), recomputes
  // the resolved bio, and PATCHes the chatroom agent so the change takes effect
  // on the next turn. If the agent isn't currently in chatroom (session not
  // launched yet, or stopped), the override is still stored locally — silently
  // skips the network call.
  const liveTweakKnob = async (slotIdx, varIdx) => {
    const slot = sessionAgents[slotIdx];
    if (!slot) return;
    const p = profiles.find(p => p.id === slot.profileId);
    if (!p) return;
    const v = p.variables[varIdx];
    if (!v || !v.values || v.values.length === 0) return;

    // Effective current idx (prefer override, else the profile's valueIdx)
    const currentText = slot.overrides?.[v.name];
    const currentIdx = currentText !== undefined
      ? Math.max(0, v.values.findIndex(val => val.text === currentText))
      : v.valueIdx;
    const nextIdx = (currentIdx + 1) % v.values.length;

    // Persist the new override (session-scoped — does NOT mutate the profile)
    const copy = [...sessionAgents];
    const ovs = { ...(copy[slotIdx].overrides || {}) };
    ovs[v.name] = v.values[nextIdx].text;
    copy[slotIdx].overrides = ovs;
    setSessionAgents(copy);

    // Recompute the resolved bio with the new override applied to a synthetic profile
    const lockedProfile = {
      ...p,
      variables: p.variables.map(vv => {
        const lock = ovs[vv.name];
        if (lock === undefined) return vv;
        const idx = vv.values.findIndex(val => val.text === lock);
        return idx >= 0 ? { ...vv, valueIdx: idx } : vv;
      }),
    };
    const newBio = resolveBio(lockedProfile, sharedAnchors);

    // PATCH the live chatroom agent (no-op if not present)
    try {
      const res = await fetch(`${CHATROOM_API}/agents/${encodeURIComponent(p.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: newBio }),
      });
      if (res.ok) {
        const newText = v.values[nextIdx].text;
        showToast(`${p.name} · ${v.feature_name || v.name} → ${newText.slice(0, 40)}`, 'ok');
      }
      // 404 means agent isn't in chatroom — silently OK; the override is saved locally.
    } catch (_) { /* offline; local-only */ }
  };

  // Test Run send: resolves bio + appends user msg, then asks /api/generate/text once.
  const sendTestMessage = async (profile, userMsg) => {
    const resolved = resolveBio(profile);
    const prompt = `${resolved}\n\n---\nUser: ${userMsg}\n\nReply in character. Stay concise.`;
    try {
      const res = await fetch(`${SYNTHO_API}/api/generate/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.text || data.response || data.result || '(empty response)';
    } catch (err) {
      return `(error: ${err.message})`;
    }
  };

  // Launch Session: resolve every assigned profile against shared anchors + locks,
  //   POST each as a chatroom agent, then enter the Run room.
  const launchSession = async () => {
    if (sessionAgents.length === 0) {
      showToast('Add at least one agent', 'warn');
      return;
    }
    showToast('Loading agents into chatroom…', 'ok');
    try {
      // Optional: clear existing chatroom agents so the session is clean.
      // We skip auto-clear to avoid surprising the user; agents accumulate.
      for (const slot of sessionAgents) {
        const p = profiles.find(p => p.id === slot.profileId);
        if (!p) continue;
        // Build the agent's effective profile, applying overrides (locked values)
        const lockedProfile = {
          ...p,
          variables: p.variables.map(v => {
            const lock = slot.overrides?.[v.name];
            if (lock === undefined) return v;
            const idx = v.values.findIndex(val => val.text === lock);
            return idx >= 0 ? { ...v, valueIdx: idx } : v;
          }),
        };
        const bio = resolveBio(lockedProfile, sharedAnchors);
        const res = await fetch(`${CHATROOM_API}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: p.name, bio }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to add ${p.name}`);
        }
      }
      showToast(`Loaded ${sessionAgents.length} agent(s) into chatroom`, 'ok');

      // Hand off the live session to the Agent Studio modal — it owns the
      // streaming-chat surface, consensus tracking, transcript export, etc.
      // The Composer's own Run room (room='run') stays as a fallback for when
      // AgentStudio isn't loaded (e.g. standalone agent-composer.html page).
      if (window.agentStudio && typeof window.agentStudio.openWithSession === 'function') {
        // Switch the synthograsizer mode-switcher back to Studio so the modal
        // opens over a real synthograsizer UI rather than the empty composer mount.
        // The modal itself will float over whichever mode is active, but Studio
        // is the most useful "behind" surface and the one users return to on close.
        try { localStorage.setItem('synthograsizerMode', 'default'); } catch (_) {}
        const studioBtn = document.querySelector('.layout-btn[data-layout="default"]');
        if (studioBtn) studioBtn.click();
        // Tiny tick so the mode-switch DOM repaints before the modal slides in
        setTimeout(() => {
          window.agentStudio.openWithSession({
            goal: goal || '',
            fromComposer: true,
            composerCtx: {
              sessionName,
              sessionPresetId: activeSessionId,
              sharedAnchors,
              resolutionMode,
              // Snapshot of which profile filled which slot + the knob overrides
              // active at launch — enough to reconstruct the resolved bios later.
              slots: sessionAgents.map((slot, idx) => {
                const p = profiles.find(pp => pp.id === slot.profileId);
                return {
                  channel: idx + 1,
                  profileId: slot.profileId,
                  profileName: p?.name || null,
                  overrides: { ...(slot.overrides || {}) },
                  // Effective knob values per variable at launch (resolved text)
                  knobs: (p?.variables || []).map(v => ({
                    name: v.name,
                    feature: v.feature_name || v.name,
                    selectedText:
                      slot.overrides?.[v.name] !== undefined
                        ? slot.overrides[v.name]
                        : v.values[v.valueIdx]?.text,
                    locked: slot.overrides?.[v.name] !== undefined,
                  })),
                };
              }),
            },
          });
        }, 30);
      } else {
        setRoom('run');
      }
    } catch (err) {
      showToast(`Launch failed: ${err.message}`, 'err');
    }
  };

  // ── Session presets (server-backed) ──────────────────────────────────────

  // Active session id — set after a save or load, used to update-in-place on next save
  const [activeSessionId, setActiveSessionId] = useState(null);

  const refreshSavedSessions = useCallback(async () => {
    try {
      const res = await fetch(`${SYNTHO_API}/api/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      setSavedSessions(data.sessions || []);
    } catch (_) { /* backend offline; ignore */ }
  }, []);

  // Initial fetch + refresh whenever the Composer's Session room is opened
  useEffect(() => {
    refreshSavedSessions();
  }, [refreshSavedSessions]);
  useEffect(() => {
    if (room === 'session') refreshSavedSessions();
  }, [room, refreshSavedSessions]);

  const saveSessionPreset = async () => {
    if (!sessionAgents.length) {
      showToast('Add at least one agent before saving', 'warn');
      return;
    }
    const askName = !sessionName || sessionName === 'Untitled Session';
    const name = askName
      ? (window.prompt('Name this session:', sessionName) || '').trim()
      : sessionName;
    if (askName && !name) return;
    if (askName) setSessionName(name);

    const payload = {
      id: activeSessionId || undefined,
      name,
      agents: sessionAgents.map(a => ({ profileId: a.profileId, overrides: a.overrides || {} })),
      sharedAnchors,
      goal,
      resolutionMode,
    };
    try {
      const res = await fetch(`${SYNTHO_API}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setActiveSessionId(data.session?.id || null);
      await refreshSavedSessions();
      showToast(`Saved "${name}"`, 'ok');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'err');
    }
  };

  const loadSessionPreset = async (id) => {
    try {
      const res = await fetch(`${SYNTHO_API}/api/sessions/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const s = data.session || {};
      setSessionAgents((s.agents || []).map(a => ({ profileId: a.profileId, overrides: a.overrides || {} })));
      setSharedAnchors(s.sharedAnchors || {});
      setGoal(s.goal || '');
      setResolutionMode(s.resolutionMode || 'once');
      setSessionName(s.name || 'Untitled Session');
      setActiveSessionId(s.id || null);
      showToast(`Loaded "${s.name || 'session'}"`, 'ok');
    } catch (err) {
      showToast(`Load failed: ${err.message}`, 'err');
    }
  };

  const deleteSessionPreset = async (id) => {
    if (!window.confirm('Delete this saved session?')) return;
    try {
      const res = await fetch(`${SYNTHO_API}/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (activeSessionId === id) setActiveSessionId(null);
      await refreshSavedSessions();
      showToast('Session deleted', 'ok');
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'err');
    }
  };

  return (
    <>
      <div id="lib-mount"></div>
      <div id="ed-mount"></div>
      <div id="se-mount"></div>
      <div id="rn-mount"></div>
      {room === 'library' && (
        <LibraryPortal>
          <LibraryRoom profiles={profiles}
                       onPick={p => setEditingId(p.id)}
                       onEdit={p => { setEditingId(p.id); setRoom('editor'); }}
                       onSendToSession={p => {
                         if (!sessionAgents.find(a => a.profileId === p.id)) {
                           setSessionAgents([...sessionAgents, { profileId: p.id, overrides: {} }]);
                         }
                         setRoom('session');
                       }}
                       onCreate={createNew}
                       onImport={importProfilesFromJson}
                       onExport={exportAllProfiles}
                       onGenerateFromImage={generateFromImage}
                       onRemix={remixProfile}
                       onTest={testProfile}
                       onDelete={deleteProfile}/>
        </LibraryPortal>
      )}
      {room === 'editor' && editingProfile && (
        <EditorPortal>
          <EditorRoom profile={editingProfile}
                      setProfile={updateProfile}
                      onGenerate={generateFromDescription}
                      onTestSend={sendTestMessage}
                      onSaveAs={() => saveAsProfile(editingProfile)}
                      onShowToast={showToast}
                      onAddToSession={() => {
                        if (!sessionAgents.find(a => a.profileId === editingProfile.id)) {
                          setSessionAgents([...sessionAgents, { profileId: editingProfile.id, overrides: {} }]);
                        }
                        setRoom('session');
                      }}
                      onBack={() => setRoom('library')}/>
        </EditorPortal>
      )}
      {room === 'session' && (
        <SessionPortal>
          <SessionRoom profiles={profiles}
                       sessionAgents={sessionAgents}
                       setSessionAgents={setSessionAgents}
                       sharedAnchors={sharedAnchors}
                       setSharedAnchors={setSharedAnchors}
                       goal={goal} setGoal={setGoal}
                       sessionName={sessionName} setSessionName={setSessionName}
                       resolutionMode={resolutionMode} setResolutionMode={setResolutionMode}
                       savedSessions={savedSessions}
                       onSaveSession={saveSessionPreset}
                       onLoadSession={loadSessionPreset}
                       onDeleteSession={deleteSessionPreset}
                       onLaunch={launchSession}
                       sessionTemplates={sessionTemplates}
                       activeTemplateKey={activeTemplateKey}
                       setActiveTemplateKey={setActiveTemplateKey}
                       onEditAgent={(p) => { setEditingId(p.id); setRoom('editor'); }}/>
        </SessionPortal>
      )}
      {room === 'run' && (
        <RunPortal>
          <RunRoom profiles={profiles} sessionAgents={sessionAgents} sharedAnchors={sharedAnchors} goal={goal}
                   onBack={() => setRoom('session')}/>
        </RunPortal>
      )}
      {toast && (
        <div style={{
          position: 'fixed', top: 12, right: 12, zIndex: 100,
          padding: '8px 14px',
          background: toast.kind === 'err' ? '#b86880' : (toast.kind === 'warn' ? '#c07040' : 'var(--hw-text)'),
          color: 'var(--hw-chassis)',
          fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
          borderRadius: 2, boxShadow: 'var(--hw-shadow)', border: 'var(--hw-border)',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

// Tiny portal helpers — render each room into its dedicated div
function LibraryPortal({ children }) { return ReactDOM.createPortal(children, document.getElementById('room-library')); }
function EditorPortal({ children })  { return ReactDOM.createPortal(children, document.getElementById('room-editor')); }
function SessionPortal({ children }) { return ReactDOM.createPortal(children, document.getElementById('room-session')); }
function RunPortal({ children })     { return ReactDOM.createPortal(children, document.getElementById('room-run')); }

/* ── Error boundary ───────────────────────────────────────────────────────────
   If the Composer React tree throws, render a recovery card instead of a blank
   slate. The user can still switch back to Studio/Perform via the top-level
   layout switcher, which lives outside this React subtree. */
class ComposerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('[Composer] React tree crashed:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        maxWidth: 560, margin: '40px auto', padding: 20,
        background: 'var(--hw-panel)', border: 'var(--hw-border)',
        borderRadius: 3, boxShadow: 'var(--hw-shadow)',
        fontFamily: 'var(--font-label)', color: 'var(--hw-text)',
      }}>
        <div style={{ fontFamily: 'var(--font-brand)', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>
          Composer crashed
        </div>
        <div style={{ fontSize: 11, color: 'var(--hw-text-dim)', marginBottom: 12, lineHeight: 1.5 }}>
          The Composer's React tree threw an error and couldn't render.
          Your saved profiles and sessions are safe — they live in localStorage and on disk.
          Try switching back to Studio mode (top of page) and reloading.
        </div>
        <pre style={{
          background: 'var(--hw-lcd-bg)', padding: 10, borderRadius: 2,
          fontSize: 10, lineHeight: 1.4, overflow: 'auto', maxHeight: 160,
          color: 'var(--hw-pink)',
        }}>{String(this.state.error?.stack || this.state.error || 'unknown error')}</pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="hw-btn primary" onClick={() => location.reload()}>↻ Reload</button>
          <button className="hw-btn" onClick={() => this.setState({ error: null })}>↺ Try again</button>
          <button className="hw-btn ghost" onClick={() => {
            const btn = document.querySelector('.layout-btn[data-layout="default"]');
            if (btn) btn.click();
          }}>← Back to Studio</button>
        </div>
      </div>
    );
  }
}

// Mount target resolution (three cases, in order):
//   1. <div id="composer-react-root"> exists explicitly  → use it
//   2. #composer-mount exists                            → create the react root inside it
//      (preferred — keeps the React subtree under the @scope CSS)
//   3. neither exists (raw test harness)                 → append to <body>
// Re-entry guard: avoid mounting twice if Babel + module timing causes the script to run again.
(function mountComposerApp() {
  if (window.__composerMounted) return;
  window.__composerMounted = true;
  let target = document.getElementById('composer-react-root');
  if (!target) {
    const mount = document.getElementById('composer-mount');
    target = document.createElement('div');
    target.id = 'composer-react-root';
    (mount || document.body).appendChild(target);
  }
  ReactDOM.createRoot(target).render(
    <ComposerErrorBoundary>
      <App/>
    </ComposerErrorBoundary>
  );
})();

/* ── Public Composer API ────────────────────────────────────────────────────
   External callers (Agent Studio, navbar, recipes) drive Composer state by
   calling these helpers. Each helper:
     1. Switches the synthograsizer mode-switcher to "composer" if not already
        active (so the composer mount is visible).
     2. Dispatches a `composer:command` CustomEvent that the App's useEffect
        listener consumes to update React state on the next tick.
   This keeps React state encapsulated while still allowing imperative entry
   from non-React code. */
(function setupComposerAPI() {
  const ensureComposerMode = () => {
    const composerBtn = document.querySelector('.layout-btn[data-mode="composer"]');
    if (composerBtn && composerBtn.classList && !composerBtn.classList.contains('active')) {
      composerBtn.click();
    }
  };
  const send = (detail) => {
    ensureComposerMode();
    // Defer one tick so the mode swap finishes painting before React reacts
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('composer:command', { detail }));
    }, 30);
  };
  window.Composer = {
    /** Open the Library room (default landing page). */
    openLibrary() { send({ action: 'goToLibrary' }); },
    /** Open the Editor with a specific profile. Looks up by id first, then by name. */
    openEditor({ profileId, name, bio } = {}) {
      send({ action: 'goToEditor', profileId, name, bio });
    },
    /** Switch to the Session Builder. */
    openSession() { send({ action: 'goToSession' }); },
    /** Hop to any room directly. */
    goToRoom(room) { send({ action: 'goToRoom', room }); },
    /**
     * Bridge from a Recipes-tab preset: pre-fill the Session Builder with the
     * preset's resolved agents and goal, then open the Session room.
     * @param {object}   args
     * @param {{name:string, bio?:string}[]} args.agents - Role-resolved agents
     * @param {string}                       args.goal   - Session goal text
     */
    openSessionFromRecipe({ agents = [], goal = '' } = {}) {
      send({ action: 'openSessionFromRecipe', agents, goal });
    },
  };
})();
