/**
 * The owner's console.
 * ────────────────────
 * A page for the person who owns the companies: describe one in a sentence and read the proposal, edit what you like, write the people, create it; then go,
 * start a room, read what comes out, approve or reject it, read and correct what people remember. Every button here is an API call
 * (GET /api/company/schema lists them), so anything a person does here an agent can do too.
 *
 * Everything this page shows was written by a model or by someone else, so it is only ever put on the page as TEXT (see h(): it has no way to set HTML).
 * The server also sends a policy that lets no script but this file run.
 */

const app = document.getElementById('app');
const toasts = document.getElementById('toasts');

// ── small things ────────────────────────────────────────────────────────────

/** Build an element. Strings and numbers become text nodes; there is deliberately no way to pass HTML. */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open') el[k] = v;
    else if (k === 'style') el.style.cssText = String(v);                // (set through the style object: the page's policy refuses a style ATTRIBUTE)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** Put children into an element, leaving out null, undefined and false (replaceChildren would print them). */
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false).map(k => (k instanceof Node ? k : document.createTextNode(String(k)))));
}

const money = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;
const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };
const clock = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function toast(message, kind = '', code = '') {
  const el = h('div', { class: `toast ${kind}` }, message, code ? h('div', { class: 'code' }, code) : null);
  toasts.append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 9000 : 4500);
}

class ApiError extends Error {
  constructor(message, status, code, field) { super(message); this.status = status; this.code = code; this.field = field; }
}

/** One API call. JSON in, JSON out; a refusal comes back as an ApiError carrying the server's own words. */
async function api(method, path, body) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(json?.error || `${method} ${path} answered ${res.status}`, res.status, json?.code, json?.field);
  return json;
}

function fail(err) {
  if (err instanceof ApiError) toast(err.message, 'bad', [err.code, err.field].filter(Boolean).join(' · '));
  else { console.error(err); toast('Something went wrong in the page. See the browser console.', 'bad'); }
}

/** Run an action, show its failure, and say what happened if it worked. */
async function attempt(fn, okMessage) {
  try { const r = await fn(); if (okMessage) toast(okMessage, 'ok'); return r; } catch (e) { fail(e); return null; }
}

function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);
const STATE_KIND = { paused: 'warn', active: 'ok', proposed: 'accent', casting: 'accent', cast: 'ok', creating: 'accent', created: 'ok', failed: 'bad', cancelled: '' };
const STATE_WORD = { active: 'running', proposed: 'proposal', casting: 'writing people', cast: 'people ready', creating: 'creating', created: 'created', failed: 'stopped', cancelled: 'cancelled', paused: 'paused' };
const stateBadge = (s) => badge(STATE_WORD[s] || s, STATE_KIND[s] || '');

// ── routing ─────────────────────────────────────────────────────────────────

let cleanups = [];
const onLeave = (fn) => cleanups.push(fn);
let optionsCache = null;
const options = async () => (optionsCache ||= await api('GET', '/api/company/flow/options'));

function mark(nav) {
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('on', a.dataset.nav === nav);
}

async function route() {
  for (const fn of cleanups.splice(0)) { try { fn(); } catch { /* a timer that is already gone */ } }
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);
  try {
    if (!parts.length) { mark('home'); await homeView(); }
    else if (parts[0] === 'new') { mark('new'); await newView(); }
    else if (parts[0] === 'flow' && parts[1]) { mark('new'); await flowView(parts[1]); }
    else if (parts[0] === 'company' && parts[1]) { mark('home'); await companyView(parts[1], parts[2] || 'rooms'); }
    else if (parts[0] === 'roster') { mark('roster'); await rosterView(parts[1] || null); }
    else fill(app, h('div', { class: 'empty' }, h('h2', {}, 'Nothing here'), h('a', { href: '#/' }, 'Back to your companies')));
  } catch (e) {
    fail(e);
    fill(app, h('div', { class: 'empty' }, h('h2', {}, e instanceof ApiError && e.status === 404 ? 'Not found' : 'That did not load'), h('p', {}, e.message), h('a', { href: '#/' }, 'Back to your companies')));
  }
}
window.addEventListener('hashchange', route);

/** An input that saves when you leave it, not on every keystroke. */
function field(label, el, hint) {
  return h('label', {}, label, el, hint ? h('span', { class: 'hint' }, hint) : null);
}

// ── your companies ──────────────────────────────────────────────────────────

async function homeView() {
  const [{ companies }, { flows }] = await Promise.all([api('GET', '/api/company'), api('GET', '/api/company/flow')]);
  const open = flows.filter(f => f.state !== 'created');
  const header = h('div', { class: 'head' }, h('h1', {}, 'Your companies'), h('span', { class: 'grow' }), h('a', { class: 'btn primary', href: '#/new' }, 'New company'));
  const flowCards = open.length ? h('section', {}, h('h2', {}, 'Being set up'), h('div', { class: 'cols' }, open.map(f => h('a', { class: 'card', href: `#/flow/${f.id}`, style: 'color:inherit;text-decoration:none' },
    h('div', { class: 'row' }, h('h3', {}, f.name || 'Untitled'), stateBadge(f.state)),
    h('p', { class: 'sub' }, f.prompt),
    h('div', { class: 'row small muted' }, plural(f.people, 'person', 'people'), ' · ', `${f.ready} ready`, ' · ', `spent ${money(f.spentUsd)}`))))) : null;
  if (!companies.length) {
    fill(app, header, flowCards, h('div', { class: 'empty' }, h('h2', {}, 'No company yet'), h('p', {}, 'Describe one in a sentence. You will read a proposal before anything is made, and what is made starts out paused.'), h('a', { class: 'btn primary', href: '#/new' }, 'Describe a company')));
    return;
  }
  const cards = companies.map(c => {
    const toggle = h('button', { onclick: async () => { await attempt(() => api('POST', `/api/company/${c.id}/${c.state === 'active' ? 'pause' : 'go'}`, {}), c.state === 'active' ? 'Paused.' : 'Running. Nothing starts until you start a room.'); homeView(); } }, c.state === 'active' ? 'Pause' : 'Go');
    const people = h('span', {}, '…');
    api('GET', `/api/company/${c.id}/people`).then(r => { people.textContent = plural(r.employees.length, 'person', 'people'); }).catch(() => { people.textContent = ''; });
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('h3', {}, h('a', { href: `#/company/${c.id}` }, c.name)), stateBadge(c.state)),
      h('p', { class: 'sub' }, plural(c.departments.length, 'room'), ' · ', people, c.plan ? ' · made from a prompt' : ''),
      c.plan ? h('ul', { class: 'plain small muted' }, c.plan.departments.map(d => h('li', {}, `${d.name}: makes ${d.makes}`))) : null,
      h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/company/${c.id}` }, 'Open'), toggle));
  });
  fill(app, header, h('div', { class: 'cols' }, cards), flowCards ? h('div', { style: 'margin-top:2rem' }, flowCards) : null);
}

// ── describe a company ──────────────────────────────────────────────────────

async function newView() {
  const o = await options();
  if (!o.enabled) { fill(app, h('div', { class: 'empty' }, h('h2', {}, 'The creation flow is switched off'), h('p', {}, 'The operator of this server has turned it off. You can still build a company by hand through the API.'))); return; }
  const prompt = h('textarea', { id: 'prompt', maxlength: String(o.limits.maxPromptChars), placeholder: 'A studio that makes alpine snow-safety posters and the image templates to draw them.', rows: '5', required: true });
  const count = h('span', { class: 'hint' }, `0 / ${o.limits.maxPromptChars}`);
  prompt.addEventListener('input', () => { count.textContent = `${prompt.value.length} / ${o.limits.maxPromptChars}`; });
  const size = h('select', {}, h('option', { value: '' }, 'Let the model choose the smallest that fits'), o.sizes.map(s => h('option', { value: s.id, disabled: !s.allowed }, `${s.label}${s.allowed ? '' : ' (more than this server allows)'}`)));
  const style = h('select', {}, h('option', { value: '' }, 'Let the model choose'), o.styles.map(s => h('option', { value: s.id }, `${s.id}: ${s.text}`)));
  const people = h('input', { type: 'number', min: '1', max: '96', placeholder: 'leave empty' });
  const budget = h('input', { type: 'number', min: '0', step: '0.5', placeholder: `up to ${money(o.limits.maxSpendUsd)}` });
  const name = h('input', { type: 'text', maxlength: '80', placeholder: 'leave empty to have one made up' });
  const mission = h('textarea', { rows: '4', placeholder: 'Leave empty for the default: dignity, consent, honesty, care for the audience, creative freedom with accountability.' });
  const reuse = h('input', { type: 'checkbox', checked: true });
  const locks = h('textarea', { rows: '8', class: 'mono', placeholder: '{ "departments": [ { "name": "Print Room", "positions": [ { "title": "Producer", "lead": true } ] } ] }' });
  const submit = h('button', { class: 'primary', type: 'submit' }, 'Propose a company');
  const doAll = h('button', { type: 'button', title: 'Propose it, write its people and create it without stopping. It still starts paused.', onclick: () => { if (!prompt.value.trim()) { toast('Say what the company is for.', 'bad'); return; } send(true); } }, 'Do it all, paused');

  const send = async (auto) => {
    const body = { prompt: prompt.value.trim() };
    const fixed = {};
    if (size.value) body.size = size.value;
    if (style.value) body.style = style.value;
    if (name.value.trim()) fixed.name = name.value.trim();
    if (mission.value.trim()) fixed.mission = mission.value.trim();
    if (people.value) fixed.people = Number(people.value);
    if (locks.value.trim()) {
      try { Object.assign(fixed, JSON.parse(locks.value)); } catch { toast('The JSON in "Fix more yourself" is not valid JSON.', 'bad'); return; }
    }
    if (Object.keys(fixed).length) body.locks = fixed;
    if (budget.value !== '') body.budgetUsd = Number(budget.value);
    if (!reuse.checked) body.reuse = false;
    if (auto) {
      const cap = budget.value !== '' ? Math.min(Number(budget.value), o.limits.maxSpendUsd) : o.limits.maxSpendUsd;
      if (!confirm(`Propose the company, write all of its people and create it, without stopping for you? Each new person costs about ${money(o.estimate.perPersonUsd)} (a company of twelve, about ${money(12 * o.estimate.perPersonUsd)}); it stops at ${money(cap)}. People already in the roster who fit are used first. The company is created paused: nothing runs until you say go.`)) return;
      body.auto = true;
    }
    for (const b of [submit, doAll]) b.disabled = true;
    submit.textContent = 'Proposing…';
    const r = await attempt(() => api('POST', '/api/company/flow', body));
    for (const b of [submit, doAll]) b.disabled = false;
    submit.textContent = 'Propose a company';
    if (r) location.hash = `#/flow/${r.flow.id}`;
  };
  const form = h('form', { class: 'stack', onsubmit: (ev) => { ev.preventDefault(); if (!prompt.value.trim()) { toast('Say what the company is for.', 'bad'); return; } send(false); } },
  h('section', { class: 'card stack' },
    h('div', {}, h('h2', {}, 'What is the company for?'), h('p', { class: 'muted' }, 'A sentence or two: what it makes, and for whom. You will read a proposal before anything is made, and what is made starts out paused. Proposing costs about a cent.')),
    field('Describe it', prompt), h('div', { class: 'row' }, count)),
  h('details', {}, h('summary', {}, 'Choose more yourself (optional)'),
    h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Anything you fix here is yours: the model will not change it. Anything you leave empty is filled in for you.'),
      h('div', { class: 'cols' }, field('Size', size), field('How the rooms are organised', style), field('Exactly how many people', people), field('Most this may spend, in dollars', budget, `The server allows at most ${money(o.limits.maxSpendUsd)}.`), field('Company name', name)),
      field('Mission', mission),
      h('label', { class: 'inline' }, reuse, 'Take people from the roster where they fit (they cost nothing). Untick to write everyone new.'),
      field('Fix more yourself (JSON)', locks, 'The same shape as "locks" in the API: rooms, positions, people. GET /api/company/schema describes it.'))),
  h('div', { class: 'row' }, submit, doAll, h('span', { class: 'hint' }, `It writes at most ${o.limits.maxPeople} people per company; each new person costs about ${money(o.estimate.perPersonUsd)}.`)));
  fill(app, h('div', { class: 'head' }, h('h1', {}, 'New company')), form);
  prompt.focus();
}

// ── a proposal ──────────────────────────────────────────────────────────────

const PROV_WORD = { user: 'you', ai: 'AI', default: 'default' };
const prov = (flow, path) => { const who = flow.plan.provenance[path]; return who ? h('span', { class: `prov ${who}`, title: who === 'user' ? 'You fixed this: nothing will change it.' : who === 'ai' ? 'The model wrote this. Edit it and it is yours.' : 'A default. Edit it and it is yours.' }, PROV_WORD[who]) : null; };

async function flowView(id) {
  const opts = await options();
  let flow = (await api('GET', `/api/company/flow/${id}`)).flow;
  let candidates = null;                                                // the ready people in the roster, loaded when first wanted
  let timer = null;
  const root = h('div', { class: 'stack' });
  fill(app, root);
  onLeave(() => clearTimeout(timer));

  const setFlow = (f) => { flow = f; draw(); poll(); };
  const run = async (fn, ok) => { const r = await attempt(fn, ok); if (r?.flow) setFlow(r.flow); return r; };
  const patch = (body, ok) => run(() => api('PATCH', `/api/company/flow/${id}`, body), ok);

  function poll() {
    clearTimeout(timer);
    if (!['casting', 'creating'].includes(flow.state)) return;
    timer = setTimeout(async () => {
      try { const r = await api('GET', `/api/company/flow/${id}`); flow = r.flow; draw(); } catch (e) { fail(e); return; }
      poll();
    }, 1500);
  }

  async function loadCandidates() {
    if (candidates) return candidates;
    try { candidates = (await api('GET', '/api/company/roster?status=ready&limit=200')).candidates; } catch { candidates = []; }
    return candidates;
  }

  const archetypeSelect = (value, onchange) => h('select', { onchange: (e) => onchange(e.target.value) },
    opts.archetypes.map(a => h('option', { value: a.id, selected: a.id === value }, `${a.name.replace(/^The /, '')} (${a.roles[0]})`)));

  function positionRow(room, pos) {
    const entry = flow.cast.people[pos.key];
    const editable = ['proposed', 'cast', 'failed'].includes(flow.state);
    const title = h('input', { type: 'text', value: pos.title, maxlength: '80', disabled: !editable, 'aria-label': 'Job title' });
    title.addEventListener('change', () => { if (title.value.trim() && title.value !== pos.title) patch({ departments: [{ key: room.key, positions: [{ key: pos.key, title: title.value.trim() }] }] }); else title.value = pos.title; });
    const arch = archetypeSelect(pos.archetype, (v) => patch({ departments: [{ key: room.key, positions: [{ key: pos.key, archetype: v }] }] }));
    arch.disabled = !editable;
    const lead = h('input', { type: 'radio', name: `lead-${room.key}`, checked: pos.lead, disabled: !editable || pos.lead, onchange: () => patch({ departments: [{ key: room.key, positions: [{ key: pos.key, lead: true }] }] }) });
    const rev = h('input', { type: 'checkbox', checked: pos.reviewer, disabled: !editable, onchange: (e) => patch({ departments: [{ key: room.key, positions: [{ key: pos.key, reviewer: e.target.checked }] }] }) });
    const pin = h('select', { 'aria-label': 'Choose someone from the roster', disabled: !editable, onfocus: async () => { await loadCandidates(); fillPin(); }, onchange: (e) => patch({ departments: [{ key: room.key, positions: [{ key: pos.key, candidateId: e.target.value || null }] }] }) });
    const fillPin = () => {
      fill(pin, h('option', { value: '' }, pos.candidateId ? 'Stop using the chosen person' : 'Best fit, or write someone new'),
        ...(candidates || []).map(c => h('option', { value: c.id, selected: c.id === pos.candidateId }, `${c.name} (${c.role})`)));
      if (pos.candidateId && !(candidates || []).some(c => c.id === pos.candidateId)) pin.append(h('option', { value: pos.candidateId, selected: true }, 'Chosen from the roster'));
    };
    fillPin();
    const remove = h('button', { class: 'quiet danger', disabled: !editable || room.positions.length < 2, title: 'Remove this position', onclick: () => patch({ departments: [{ key: room.key, positions: [{ key: pos.key, remove: true }] }] }) }, 'Remove');
    return h('div', { class: 'pos' },
      h('div', {}, field('Job', title)), h('div', {}, field('Kind of person', arch)),
      h('div', { class: 'flags' }, h('label', { class: 'inline' }, lead, 'Leads'), h('label', { class: 'inline' }, rev, 'Objects')),
      personCell(entry, pos),
      h('div', { class: 'stack', style: 'gap:.3rem' }, pin, remove));
  }

  function personCell(entry, pos) {
    if (!entry) return h('div', { class: 'who muted' }, pos.candidateId ? 'chosen from the roster; not checked yet' : 'not written yet');
    if (entry.status === 'writing') return h('div', { class: 'who' }, h('em', {}, 'writing…'));
    if (entry.status === 'pending') return h('div', { class: 'who muted' }, 'waiting');
    if (entry.status === 'failed' || entry.status === 'draft') return h('div', { class: 'who' }, entry.name ? h('strong', {}, entry.name) : null, badge(entry.status === 'draft' ? 'draft' : 'needs attention', 'bad'), h('div', { class: 'err small' }, entry.error));
    const source = { new: 'written for this company', roster: 'already in the roster', pinned: 'chosen by you' }[entry.source] || entry.source;
    return h('div', { class: 'who' },
      h('a', { href: `#/roster/${entry.candidateId}` }, h('strong', {}, entry.name)),
      h('div', { class: 'small muted' }, source, entry.measuredType ? ` · answers as ${entry.measuredType}${entry.intendedType && entry.intendedType !== entry.measuredType ? ` (cast ${entry.intendedType})` : ''}` : ''),
      h('div', { class: 'row', style: 'gap:.3rem' }, entry.screened ? badge('screened', 'ok') : badge('not screened', 'warn'), entry.advice ? badge(`${plural(entry.advice, 'note')} from the reviewer`, 'warn') : null, entry.drifted ? badge('drifted from the cast', 'warn') : null));
  }

  function needsSelect(room, editable) {
    return h('select', { disabled: !editable, 'aria-label': 'The room this one starts from', onchange: (e) => patch({ departments: [{ key: room.key, needs: e.target.value || null }] }) },
      h('option', { value: '', selected: !room.needs }, 'Nothing: it starts alone'),
      flow.plan.departments.filter(d => d.key !== room.key).map(d => h('option', { value: d.key, selected: room.needs === d.key }, `${d.name}'s ${d.deliverable?.file || 'file'}`)));
  }

  function roomCard(room) {
    const editable = ['proposed', 'cast', 'failed'].includes(flow.state);
    const name = h('input', { type: 'text', value: room.name, maxlength: '80', disabled: !editable, 'aria-label': 'Room name' });
    name.addEventListener('change', () => { if (name.value.trim() && name.value !== room.name) patch({ departments: [{ key: room.key, name: name.value.trim() }] }); else name.value = room.name; });
    const purpose = h('input', { type: 'text', value: room.purpose || '', maxlength: '300', disabled: !editable, 'aria-label': 'What the room is for' });
    purpose.addEventListener('change', () => patch({ departments: [{ key: room.key, purpose: purpose.value }] }));
    const assignment = h('textarea', { rows: '4', maxlength: '1500', disabled: !editable, 'aria-label': 'The first assignment' }, room.assignment || '');
    assignment.addEventListener('change', () => patch({ departments: [{ key: room.key, assignment: assignment.value }] }));
    const kind = h('select', { disabled: !editable, onchange: (e) => patch({ departments: [{ key: room.key, deliverable: { kind: e.target.value } }] }) }, h('option', { value: 'engine', selected: room.deliverable?.kind === 'engine' }, 'An image-prompt engine (JSON)'), h('option', { value: 'document', selected: room.deliverable?.kind === 'document' }, 'A written piece (Markdown)'));
    const file = h('input', { type: 'text', value: room.deliverable?.file || '', maxlength: '70', disabled: !editable, 'aria-label': 'File name' });
    file.addEventListener('change', () => patch({ departments: [{ key: room.key, deliverable: { kind: room.deliverable?.kind || 'document', file: file.value.trim() } }] }));
    const newTitle = h('input', { type: 'text', placeholder: 'Job title', maxlength: '80', 'aria-label': 'New position title' });
    const newArch = archetypeSelect('storyteller', () => {});
    const add = h('button', { disabled: !editable, onclick: () => { if (newTitle.value.trim()) patch({ departments: [{ key: room.key, positions: [{ title: newTitle.value.trim(), archetype: newArch.value }] }] }); } }, 'Add a person');
    return h('section', { class: 'card stack' },
      h('div', { class: 'row' }, h('div', { style: 'flex:1;min-width:220px' }, field('Room', name)), prov(flow, `departments.${room.key}.name`), h('span', { class: 'grow' }),
        h('button', { class: 'quiet danger', disabled: !editable || flow.plan.departments.length < 2, onclick: () => { if (confirm(`Remove the room "${room.name}" and its ${plural(room.positions.length, 'position')}?`)) patch({ departments: [{ key: room.key, remove: true }] }); } }, 'Remove the room')),
      field('What it is for', purpose),
      h('div', { class: 'cols' }, field('What it makes', kind), field('File', file, 'An engine is a .json file; a piece is a .md file.')),
      field('Starts from', needsSelect(room, editable), 'Rooms work separately and meet in the company\'s shared workspace. A room that starts from another waits for that room\'s finished file.'),
      h('div', {}, h('div', { class: 'row' }, h('span', { class: 'hint' }, 'First assignment'), prov(flow, `departments.${room.key}.assignment`)), assignment),
      h('div', {}, h('h3', {}, plural(room.positions.length, 'person', 'people')), room.positions.map(p => positionRow(room, p)),
        h('div', { class: 'row', style: 'margin-top:.6rem' }, newTitle, newArch, add)));
  }

  function draw() {
    const plan = flow.plan;
    const editable = ['proposed', 'cast', 'failed'].includes(flow.state);
    const total = flow.estimate.people;
    const name = h('input', { type: 'text', value: plan.company.name, maxlength: '80', disabled: !editable, 'aria-label': 'Company name', style: 'font-size:1.4rem;font-weight:650' });
    name.addEventListener('change', () => { if (name.value.trim() && name.value !== plan.company.name) patch({ company: { name: name.value.trim() } }); else name.value = plan.company.name; });
    const purpose = h('textarea', { rows: '2', maxlength: '400', disabled: !editable, 'aria-label': 'What the company is for' }, plan.company.purpose);
    purpose.addEventListener('change', () => { if (purpose.value.trim()) patch({ company: { purpose: purpose.value.trim() } }); });
    const mission = h('textarea', { rows: '10', maxlength: '2000', disabled: !editable }, plan.company.mission);
    mission.addEventListener('change', () => { if (mission.value.trim()) patch({ company: { mission: mission.value.trim() } }); });
    const houseRules = h('textarea', { rows: '8', maxlength: '2000', disabled: !editable }, plan.company.houseRules);
    houseRules.addEventListener('change', () => patch({ company: { houseRules: houseRules.value } }));

    // what happens next
    const actions = [];
    if (flow.next === 'cast') actions.push(h('button', { class: 'primary', onclick: () => {
      const e = flow.estimate;
      if (confirm(`Write ${plural(e.open, 'person', 'people')}? This is where the money goes: about ${money(e.upToUsd)} at most, and ${money(flow.settings.limitUsd - flow.spend.usd)} is the most it may spend. People already in the roster who fit are used first and cost nothing. You can cancel at any time.`)) run(() => api('POST', `/api/company/flow/${id}/cast`, {}));
    } }, `Write the people (up to ${money(flow.estimate.upToUsd)})`));
    if (flow.next === 'create') actions.push(h('button', { class: 'primary', onclick: async () => {
      const r = await attempt(() => api('POST', `/api/company/flow/${id}/create`, {}));
      if (r) { toast(`${r.company.name} was created, paused.`, 'ok'); location.hash = `#/company/${r.company.id}`; }
    } }, 'Create the company (it starts paused)'));
    if (flow.next === 'wait') actions.push(h('button', { onclick: () => run(() => api('POST', `/api/company/flow/${id}/cancel`, {})) }, 'Cancel'));
    if (flow.state === 'created' && flow.created) actions.push(h('a', { class: 'btn primary', href: `#/company/${flow.created.companyId}` }, 'Open the company'));
    if (editable) actions.push(h('button', { title: 'Ask the model to fill in what you have not fixed. Nothing you fixed changes, and nobody already written is renamed.', onclick: () => run(() => api('POST', `/api/company/flow/${id}/replan`, {}), 'Filled in again.') }, 'Fill the blanks again'));

    const problems = flow.problems.length && editable ? h('div', { class: 'card warn' }, h('h3', {}, 'To fix before the company can be created'), h('ul', { class: 'plain' }, flow.problems.map(p => h('li', {}, p)))) : null;
    const warnings = plan.warnings?.length ? h('div', { class: 'card' }, h('h3', {}, 'Worth knowing'), h('ul', { class: 'plain small muted' }, plan.warnings.map(p => h('li', {}, p)))) : null;
    const failed = flow.state === 'failed' && flow.error ? h('div', { class: 'card bad' }, h('h3', {}, 'It stopped'), h('p', {}, flow.error), h('p', { class: 'small muted' }, 'What was finished is kept. Fix the cause, or raise the allowance, and run the step again.')) : null;
    const created = flow.state === 'created' && flow.created ? h('div', { class: 'card ok' }, h('h3', {}, 'The company exists'), h('p', {}, 'It is paused: nothing runs, spends or publishes until you say go.'), h('a', { class: 'btn', href: `#/company/${flow.created.companyId}` }, 'Open it')) : null;

    const report = flow.cast.report ? h('details', {}, h('summary', {}, `How varied the people are (${flow.cast.report.met} of ${flow.cast.report.total} aims met)`),
      flow.cast.report.targets.map(t => h('div', { class: `target ${t.met ? '' : 'miss'}` }, h('span', { class: 'dot' }), h('div', {}, t.text, h('span', { class: 'muted' }, ` — ${t.detail}`))))) : null;
    const progress = h('details', { open: ['casting', 'creating'].includes(flow.state) }, h('summary', {}, 'What has happened'),
      h('div', { class: 'log' }, flow.progress.map(p => h('div', {}, h('time', {}, clock(p.at)), p.text))));

    const spendPct = Math.min(100, (flow.spend.usd / Math.max(flow.settings.limitUsd, 0.0001)) * 100);
    const head = h('div', { class: 'head' },
      h('div', { class: 'stack', style: 'gap:.3rem;flex:1;min-width:260px' }, name,
        h('div', { class: 'row' }, stateBadge(flow.state), prov(flow, 'company.name'),
          h('span', { class: 'muted small' }, `${plural(total, 'person', 'people')} in ${plural(plan.departments.length, 'room')} · ${flow.estimate.ready} ready`),
          h('span', { class: 'muted small' }, `spent ${money(flow.spend.usd)} of ${money(flow.settings.limitUsd)}`), h('span', { class: 'meter', title: 'Spent of the allowance' }, h('i', { style: `width:${spendPct}%` })))),
      h('div', { class: 'row' }, actions));

    fill(root, head, created, failed, problems, warnings,
      h('p', { class: 'muted small' }, h('strong', {}, 'You asked: '), flow.prompt),
      h('section', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', {}, 'The company'), prov(flow, 'company.purpose')), field('What it is for', purpose),
        h('details', {}, h('summary', {}, 'Its mission and house rules'), h('div', { class: 'stack' },
          h('div', {}, h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Mission'), prov(flow, 'company.mission')), mission),
          h('div', {}, h('div', { class: 'row' }, h('span', { class: 'hint' }, 'House rules: how the people carry themselves at work'), prov(flow, 'company.houseRules')), houseRules),
          h('p', { class: 'muted small' }, 'The safety limits are not here because nothing you or a model writes can change them: they are fixed, and the same for every company.')))),
      plan.departments.map(roomCard),
      editable ? addRoomForm() : null,
      report, progress,
      h('div', { class: 'row', style: 'margin-top:1rem' }, h('button', { class: 'quiet danger', disabled: ['casting', 'creating'].includes(flow.state), onclick: async () => { if (confirm('Delete this proposal? The people already written stay in the roster, and a company it made stays.')) { const r = await attempt(() => api('DELETE', `/api/company/flow/${id}`)); if (r) location.hash = '#/'; } } }, 'Delete this proposal')));
  }

  function addRoomForm() {
    const name = h('input', { type: 'text', placeholder: 'Room name', maxlength: '80', 'aria-label': 'New room name' });
    const title = h('input', { type: 'text', placeholder: 'First job (they lead it)', maxlength: '80', 'aria-label': 'First job in the new room' });
    const arch = archetypeSelect('steward', () => {});
    return h('details', {}, h('summary', {}, 'Add a room'), h('div', { class: 'row' }, name, title, arch, h('button', { onclick: () => { if (name.value.trim() && title.value.trim()) patch({ departments: [{ name: name.value.trim(), positions: [{ title: title.value.trim(), archetype: arch.value, lead: true }] }] }); } }, 'Add the room')),
      h('p', { class: 'muted small' }, 'A room starts with one person. Add the rest once it exists. Then "Fill the blanks again" writes its purpose and first assignment.'));
  }

  draw();
  poll();
}

// ── one company ─────────────────────────────────────────────────────────────

async function companyView(id, tab) {
  const { company } = await api('GET', `/api/company/${id}`);
  const tabs = [['rooms', 'Rooms'], ['people', 'People'], ['work', 'Work to decide'], ['hall', 'The Hall'], ['record', 'Record']];
  const toggle = h('button', { class: company.state === 'active' ? '' : 'primary', onclick: async () => {
    await attempt(() => api('POST', `/api/company/${id}/${company.state === 'active' ? 'pause' : 'go'}`, {}), company.state === 'active' ? 'Paused. Rooms that were running have stopped.' : 'Running. Nothing starts until you start a room.');
    companyView(id, tab);
  } }, company.state === 'active' ? 'Pause' : 'Go');
  const head = h('div', { class: 'head' }, h('div', {}, h('h1', {}, company.name), h('div', { class: 'row' }, stateBadge(company.state), h('span', { class: 'muted small' }, `made ${when(company.createdAt)}`), company.plan ? h('a', { class: 'small', href: `#/flow/${company.plan.flowId}` }, 'the proposal it came from') : null)),
    h('span', { class: 'grow' }), h('div', { class: 'row' }, toggle, h('button', { class: 'quiet danger', onclick: async () => { if (confirm(`Delete "${company.name}", its people's memories of it, its Hall, its queue and its saved sessions? This cannot be undone. The people stay in the roster.`)) { const r = await attempt(() => api('DELETE', `/api/company/${id}`), 'Deleted.'); if (r) location.hash = '#/'; } } }, 'Delete')));
  const bar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([key, label]) => h('button', { role: 'tab', class: key === tab ? 'on' : '', onclick: () => { location.hash = `#/company/${id}/${key}`; } }, label)));
  const body = h('div', { class: 'stack' });
  fill(app, head, bar, body);
  const panels = { rooms: roomsPanel, people: peoplePanel, work: workPanel, hall: hallPanel, record: recordPanel };
  await (panels[tab] || roomsPanel)(body, company);
}

async function roomsPanel(body, company) {
  const running = company.state === 'active';
  // a room that starts from another room's file can start only once that file is in the workspace
  const links = new Map();
  await Promise.all((company.plan?.departments || []).filter(d => d.needs).map(async (d) => {
    try { links.set(d.id, (await api('GET', `/api/company/${company.id}/run/${d.id}/brief`)).needs); } catch { /* the room still shows; starting says why not */ }
  }));
  const notice = running ? null : h('div', { class: 'card warn' }, h('strong', {}, 'This company is paused. '), 'Say Go (top right) to let it run. A room starts only when you start it.');
  const eff = company.effective;
  const settings = h('details', {}, h('summary', {}, 'The limits that apply to this company'), h('div', { class: 'cols' },
    h('div', {}, h('h3', {}, 'Ceilings'), h('ul', { class: 'plain small' }, Object.entries(eff.ceilings).map(([k, v]) => h('li', {}, h('span', { class: 'muted' }, `${k}: `), String(v))))),
    h('div', {}, h('h3', {}, 'Tools its people may be given'), h('p', { class: 'small' }, eff.tools.join(', ') || 'none'), h('h3', {}, 'How strict'), h('ul', { class: 'plain small' }, h('li', {}, 'drafting themes: ', eff.mandate.drafting?.themes), h('li', {}, 'publishing audience: ', eff.mandate.publishing?.audience))),
    h('div', {}, h('h3', {}, 'The Hall'), h('p', { class: 'small' }, Object.entries(eff.collaboration).map(([k, v]) => `${k}: ${v ? 'open' : 'closed'}`).join(' · ')))),
    company.clamped && Object.values(company.clamped).some(v => v?.length) ? h('p', { class: 'small muted' }, 'This server\'s operator holds some of what was asked tighter than asked.') : null,
    h('p', { class: 'small muted' }, 'The hard limits and the publishing floor are the same for every company and cannot be set.'));
  const mission = h('details', {}, h('summary', {}, 'Mission and house rules'), h('pre', { class: 'text' }, company.mission), company.houseRules ? h('pre', { class: 'text' }, company.houseRules) : null);

  const rooms = company.departments.map(d => {
    const planned = company.plan?.departments.find(x => x.id === d.id);
    const out = h('div', { class: 'stack' });
    const brief = h('div', { class: 'stack' });
    const card = h('section', { class: 'card stack' },
      h('div', { class: 'row' }, h('h3', {}, d.name), planned ? badge(`makes ${planned.makes}`, 'accent') : badge('built by hand'), h('span', { class: 'grow' }), h('span', { class: 'hint mono', title: 'Send this as X-Room-Id to use the room through the API' }, `room ${d.roomId.slice(0, 8)}…`)),
      planned ? h('p', { class: 'sub' }, `Led by ${planned.lead}${planned.reviewers.length ? `; ${planned.reviewers.join(' and ')} ${planned.reviewers.length === 1 ? 'reviews' : 'review'} every saved version` : ''}. ${plural(planned.checks, 'check')} must pass before it may close.`) : h('p', { class: 'sub' }, 'This room has no brief from the creation flow; start it from the chat room.'),
      planned?.needs ? h('div', { class: `card tight ${links.get(d.id)?.ready ? 'ok' : 'warn'}` }, `Starts from ${planned.needs.name}'s ${planned.needs.file}: ${links.get(d.id)?.ready ? 'it is in the shared workspace.' : `not in the shared workspace yet. Start ${planned.needs.name} first; it shares the file when it is done.`}`) : null,
      h('div', { class: 'row' },
        planned ? h('button', { onclick: async () => {
          if (brief.childElementCount) { fill(brief); return; }
          const b = await attempt(() => api('GET', `/api/company/${company.id}/run/${d.id}/brief`));
          if (b) fill(brief, h('p', { class: 'small muted' }, `${b.goalChars} characters. This is what every person in the room is told at the start.`), h('pre', { class: 'text' }, b.goal), h('h4', {}, 'It may close only when'), h('ul', { class: 'plain small' }, b.checks.map(c => h('li', {}, c.label || c.type))));
        } }, 'Read the brief') : null,
        planned ? h('button', { class: 'primary', disabled: !running || (links.get(d.id) && !links.get(d.id).ready), title: !running ? 'The company is paused' : links.get(d.id) && !links.get(d.id).ready ? `${links.get(d.id).name} has to finish first` : '', onclick: async () => {
          if (!confirm(`Start ${d.name}? The people begin talking and the room spends (at most ${money(eff.ceilings.spendLimitUsd)}) until it closes or you stop it.`)) return;
          const r = await attempt(() => api('POST', `/api/company/${company.id}/run/${d.id}/start`, {}));
          if (r) fill(out, h('div', { class: 'card ok' }, h('strong', {}, 'Started. '), `${plural(r.people.length, 'person', 'people')} are talking; ${r.lead} will close it when ${plural(r.checks, 'check')} pass. Watch it in the chat room with the room id above, and come back to close it out afterwards.`));
        } }, 'Start the room') : null,
        h('button', { onclick: async () => {
          if (!confirm(`Close out ${d.name}? Each person who spoke writes down what they remember of the session (about ${money(0.03 * 6)} in all). Their notes are checked against what the server saw.`)) return;
          const r = await attempt(() => api('POST', `/api/company/${company.id}/run/${d.id}/close-out`, {}));
          if (r) fill(out, h('div', { class: 'card' }, h('h3', {}, `Memory written (${r.session})`), r.flagged.length ? h('div', { class: 'card warn' }, h('strong', {}, `${plural(r.flagged.length, 'note')} contradicted by the record, kept and not handed back: `), r.flagged.map(f => h('div', { class: 'small' }, `${f.name}: ${f.note}`))) : h('p', { class: 'small muted' }, 'Nothing contradicted the record.'),
            r.people.map(p => h('div', { class: 'small' }, h('strong', {}, p.name), p.skipped ? ` (${p.skipped})` : `: ${plural(p.entries.length, 'note')}`))));
        } }, 'Close out the session')),
      brief, out);
    return card;
  });
  fill(body, notice, rooms.length ? rooms : h('div', { class: 'empty' }, 'No rooms yet.'), mission, settings);
}

async function peoplePanel(body, company) {
  const { employees, seats } = await api('GET', `/api/company/${company.id}/people`);
  if (!employees.length) { fill(body, h('div', { class: 'empty' }, h('h2', {}, 'No one works here yet'), h('p', {}, 'Hire from the roster through the API, or create a company from a prompt.'))); return; }
  const deptName = (id) => company.departments.find(d => d.id === id)?.name || 'a task team';
  const cards = employees.map(e => {
    const mine = seats.filter(s => s.employeeId === e.id);
    const memory = h('div', { class: 'stack' });
    const load = async () => {
      const r = await attempt(() => api('GET', `/api/company/${company.id}/people/${e.id}/memory`));
      if (!r) return;
      const note = h('textarea', { rows: '2', maxlength: '1200', placeholder: 'Add something they should remember next session' });
      fill(memory, r.memory.length ? r.memory.map(m => h('div', { class: 'card tight' },
        h('div', { class: 'row' }, badge(m.kind), badge(m.verified, m.verified === 'contradicted' ? 'bad' : m.verified === 'confirmed' ? 'ok' : ''), m.source === 'owner' ? badge('yours', 'accent') : null, m.session ? h('span', { class: 'hint' }, m.session) : null, h('span', { class: 'grow' }),
          m.verified === 'contradicted' ? null : h('button', { class: 'quiet', title: 'It does not match what happened: stop handing it back', onclick: async () => { await attempt(() => api('PATCH', `/api/company/${company.id}/people/${e.id}/memory/${m.id}`, { verified: 'contradicted' })); load(); } }, 'Mark wrong'),
          h('button', { class: 'quiet danger', onclick: async () => { if (confirm('Delete this memory? It is deleted: nothing keeps a copy.')) { await attempt(() => api('DELETE', `/api/company/${company.id}/people/${e.id}/memory/${m.id}`)); load(); } } }, 'Delete')),
        h('p', { style: 'margin:.3rem 0 0' }, m.text), m.note ? h('p', { class: 'small', style: 'color:var(--bad);margin:.2rem 0 0' }, m.note) : null)) : h('p', { class: 'small muted' }, 'Nothing remembered yet.'),
        h('div', { class: 'row' }, note, h('button', { onclick: async () => { if (note.value.trim()) { await attempt(() => api('POST', `/api/company/${company.id}/people/${e.id}/memory`, { text: note.value.trim() }), 'Added.'); load(); } } }, 'Add a note')));
    };
    return h('section', { class: 'card stack' },
      h('div', { class: 'row' }, h('h3', {}, e.name), h('span', { class: 'muted' }, e.title), e.leftAt ? badge('left', 'warn') : null, h('span', { class: 'grow' }), h('a', { class: 'small', href: `#/roster/${e.candidateId}` }, 'Read the sheet')),
      h('div', { class: 'small muted' }, mine.map(s => `${s.position} in ${deptName(s.departmentId)}${s.isLead ? ' (leads)' : ''}${s.reviewerOf ? ` (reviews ${s.reviewerOf})` : ''} · tools: ${s.tier}`).join(' | '), ` · ${plural(e.sessions, 'session')} here`),
      h('details', { ontoggle: (ev) => { if (ev.target.open && !memory.childElementCount) load(); } }, h('summary', {}, 'What they remember of this company'), memory));
  });
  fill(body, h('div', { class: 'cols' }, cards));
}

async function workPanel(body, company) {
  const { proposals } = await api('GET', `/api/company/${company.id}/publish`);
  if (!proposals.length) { fill(body, h('div', { class: 'empty' }, h('h2', {}, 'Nothing to decide'), h('p', {}, 'When a room offers work for publication it waits here. Nothing leaves the company until you approve it.'))); return; }
  const kind = { pending: 'warn', unavailable: 'warn', approved: 'ok', rejected: '', blocked: 'bad', superseded: '' };
  const cards = [...proposals].reverse().map(p => {
    const detail = h('div', { class: 'stack' });
    const waiting = ['pending', 'unavailable'].includes(p.status);
    return h('section', { class: 'card stack' },
      h('div', { class: 'row' }, h('h3', {}, p.title), badge(p.status, kind[p.status] || ''), p.screen ? badge(`screen: ${p.screen.verdict}`, p.screen.verdict === 'pass' ? 'ok' : 'bad') : null, h('span', { class: 'grow' }), h('span', { class: 'hint' }, `${p.kind} · ${p.by} · ${when(p.createdAt)}`)),
      p.note ? h('p', { class: 'sub' }, p.note) : null,
      p.rejectedBecause ? h('p', { class: 'small muted' }, `Rejected: ${p.rejectedBecause}`) : null,
      p.screen?.findings?.length ? h('ul', { class: 'plain small' }, p.screen.findings.map(f => h('li', {}, `${f.rule}: ${f.why}`))) : null,
      h('div', { class: 'row' },
        h('button', { onclick: async () => {
          if (detail.childElementCount) { fill(detail); return; }
          const r = await attempt(() => api('GET', `/api/company/${company.id}/publish/${p.id}`));
          if (!r) return;
          const c = r.proposal.content;
          fill(detail, c.encoding === 'base64' ? h('img', { src: `data:${c.mimeType};base64,${c.data}`, alt: p.title, style: 'max-width:100%;border-radius:8px' }) : h('pre', { class: 'text' }, c.data));
        } }, 'Read the work'),
        waiting ? h('button', { class: 'primary', disabled: p.screen?.verdict === 'block', onclick: async () => { if (confirm(`Approve "${p.title}"? It will be marked as AI-generated. Approving does not publish it anywhere; it makes it exportable.`)) { await attempt(() => api('POST', `/api/company/${company.id}/publish/${p.id}/approve`, {}), 'Approved.'); workPanel(body, company); } } }, 'Approve') : null,
        waiting ? h('button', { onclick: async () => { const reason = prompt('Why not? (optional)'); if (reason === null) return; await attempt(() => api('POST', `/api/company/${company.id}/publish/${p.id}/reject`, { reason }), 'Rejected.'); workPanel(body, company); } }, 'Reject') : null,
        p.status === 'approved' ? h('button', { onclick: async () => { const r = await attempt(() => api('GET', `/api/company/${company.id}/publish/${p.id}/export`)); if (r) download(`${(p.filename || p.title).replace(/[^\w.-]+/g, '_')}.export.json`, JSON.stringify(r, null, 2)); } }, 'Export (labelled AI-generated)') : null),
      detail);
  });
  fill(body, cards);
}

async function hallPanel(body, company) {
  let hall;
  try { hall = (await api('GET', `/api/company/${company.id}/hall`)).hall; } catch (e) {
    fill(body, h('div', { class: 'empty' }, h('h2', {}, 'The Hall is not available'), h('p', {}, e.message))); return;
  }
  const norms = hall.norms.filter(n => n.status === 'proposed');
  const decide = async (n, verb) => { await attempt(() => api('POST', `/api/company/${company.id}/hall/norms/${n.id}/${verb}`, {}), verb === 'approve' ? 'Approved: it joins everyone\'s fixed layer.' : 'Rejected.'); hallPanel(body, company); };
  fill(body, 
    norms.length ? h('section', { class: 'card warn stack' }, h('h3', {}, 'Working agreements waiting for you'), h('p', { class: 'small muted' }, 'People can propose how the company should work. Nothing takes effect until you approve it.'), norms.map(n => h('div', { class: 'card tight' }, h('p', { style: 'margin:0' }, n.text), n.why ? h('p', { class: 'small muted', style: 'margin:.2rem 0' }, `Why: ${n.why}`) : null, h('div', { class: 'row' }, h('span', { class: 'hint' }, `proposed by ${n.proposedBy.name}`), h('span', { class: 'grow' }), h('button', { class: 'primary', onclick: () => decide(n, 'approve') }, 'Approve'), h('button', { onclick: () => decide(n, 'reject') }, 'Reject'))))) : null,
    h('div', { class: 'cols' },
      h('section', { class: 'card' }, h('h3', {}, 'Mailboxes'), h('ul', { class: 'plain small' }, hall.people.map(p => h('li', {}, h('strong', {}, p.name), h('span', { class: 'muted' }, ` — ${p.mail.unread} unread, ${p.mail.total} in all`))))),
      h('section', { class: 'card' }, h('h3', {}, 'Forums'), hall.channels.length ? h('ul', { class: 'plain small' }, hall.channels.map(c => h('li', {}, h('strong', {}, `#${c.slug}`), h('span', { class: 'muted' }, ` — ${c.purpose || c.title}`)))) : h('p', { class: 'small muted' }, 'None yet.')),
      h('section', { class: 'card' }, h('h3', {}, 'Shared files'), hall.files.length ? h('ul', { class: 'plain small' }, hall.files.map(f => h('li', {}, h('strong', {}, f.path), h('span', { class: 'muted' }, ` — ${f.locked ? 'locked, ' : ''}version ${f.version}, ${f.bytes} bytes`)))) : h('p', { class: 'small muted' }, 'None yet.')),
      h('section', { class: 'card' }, h('h3', {}, 'The board'), hall.tasks.length ? h('ul', { class: 'plain small' }, hall.tasks.map(t => h('li', {}, h('strong', {}, t.title), h('span', { class: 'muted' }, ` — ${t.status}${t.lead ? `, led by ${t.lead.name}` : ''}`)))) : h('p', { class: 'small muted' }, 'No tasks.'))),
    h('p', { class: 'small muted' }, 'You can read everything the people write to each other: there is no private channel. Writing to them is the API (POST /api/company/:id/hall/mail).'));
}

async function recordPanel(body, company) {
  const { entries } = await api('GET', `/api/company/${company.id}/audit?limit=200`);
  if (!entries.length) { fill(body, h('div', { class: 'empty' }, 'Nothing has happened yet.')); return; }
  fill(body, h('p', { class: 'muted small' }, 'What the safety layer did: decisions, never the content of what was said.'), h('div', { class: 'card tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'What'), h('th', {}, 'Details'))),
    h('tbody', {}, [...entries].reverse().map(e => { const { ts, type, ...rest } = e; return h('tr', {}, h('td', { class: 'small muted' }, when(ts)), h('td', {}, type), h('td', { class: 'small muted mono' }, Object.entries(rest).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('  '))); })))));
}

// ── the roster ──────────────────────────────────────────────────────────────

async function rosterView(selected) {
  const status = h('select', { 'aria-label': 'Status' }, ['', 'ready', 'draft', 'retired'].map(s => h('option', { value: s }, s || 'any status')));
  const q = h('input', { type: 'search', placeholder: 'Search name, job, country, kind', 'aria-label': 'Search' });
  const list = h('div', { class: 'card tablewrap' });
  const detail = h('div', { class: 'stack' });
  const load = async () => {
    const r = await attempt(() => api('GET', `/api/company/roster?limit=200${status.value ? `&status=${status.value}` : ''}${q.value ? `&q=${encodeURIComponent(q.value)}` : ''}`));
    if (!r) return;
    fill(list, r.candidates.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Name', 'Job', 'Kind', 'Type', 'Born', 'Status', 'Works at'].map(t => h('th', {}, t)))),
      h('tbody', {}, r.candidates.map(c => h('tr', { style: 'cursor:pointer', onclick: () => { location.hash = `#/roster/${c.id}`; } },
        h('td', {}, h('a', { href: `#/roster/${c.id}` }, c.name)), h('td', {}, c.role), h('td', { class: 'small' }, c.archetype), h('td', { class: 'small' }, c.measuredType || c.intendedType || ''),
        h('td', { class: 'small' }, [c.birth?.city, c.birth?.country].filter(Boolean).join(', ')), h('td', {}, badge(c.status, c.status === 'ready' ? 'ok' : c.status === 'draft' ? 'warn' : '')), h('td', { class: 'small muted' }, c.employed ? plural(c.employed, 'company', 'companies') : ''))))) :
      h('div', { class: 'empty' }, h('h2', {}, 'No one in the roster yet'), h('p', {}, 'People are added when a company is created from a prompt, or when you import one.')));
  };
  status.addEventListener('change', load);
  let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  onLeave(() => clearTimeout(t));

  const importArea = h('textarea', { rows: '6', class: 'mono', placeholder: 'Paste an Agent Profile (the Composer\'s JSON).' });
  const importer = h('details', {}, h('summary', {}, 'Import a person'), h('div', { class: 'stack' }, importArea, h('div', { class: 'row' }, h('button', { onclick: async () => {
    let profile; try { profile = JSON.parse(importArea.value); } catch { toast('That is not valid JSON.', 'bad'); return; }
    const r = await attempt(() => api('POST', '/api/company/roster', { profile }), 'Imported as a draft. Read the sheet, then mark them ready.');
    if (r) { importArea.value = ''; location.hash = `#/roster/${r.candidate.id}`; }
  } }, 'Import as a draft'), h('span', { class: 'hint' }, 'The company\'s safety screen reads a sheet again before the person takes a seat in any company.'))));

  fill(app, h('div', { class: 'head' }, h('h1', {}, 'The roster'), h('span', { class: 'muted' }, 'Your library of invented people. Each works at a company with their own memory of it.')), h('div', { class: 'row' }, status, q), list, importer, detail);
  await load();
  if (selected) await showCandidate(selected, detail, load);
}

async function showCandidate(id, detail, reload) {
  const [{ candidate: c }, { bio }] = await Promise.all([api('GET', `/api/company/roster/${id}`), api('GET', `/api/company/roster/${id}/bio`)]);
  const set = async (status) => { await attempt(() => api('PATCH', `/api/company/roster/${id}`, { status }), `Marked ${status}.`); reload(); showCandidate(id, detail, reload); };
  const advice = c.checks?.review?.advice || [];
  fill(detail, h('section', { class: 'card stack' },
    h('div', { class: 'row' }, h('h2', {}, c.name), badge(c.status, c.status === 'ready' ? 'ok' : 'warn'), h('span', { class: 'muted' }, c.role), h('span', { class: 'grow' }),
      c.status !== 'ready' ? h('button', { class: 'primary', onclick: () => set('ready') }, 'Mark ready') : h('button', { onclick: () => set('draft') }, 'Back to draft'),
      c.status !== 'retired' ? h('button', { onclick: () => set('retired') }, 'Retire') : null,
      h('button', { onclick: async () => { const r = await attempt(() => api('GET', `/api/company/roster/${id}/export`)); if (r) download(`${c.name.replace(/[^\w.-]+/g, '_')}.profile.json`, JSON.stringify(r, null, 2)); } }, 'Export'),
      h('button', { class: 'danger', onclick: async () => { if (confirm(`Delete ${c.name} from the roster?`)) { const r = await attempt(() => api('DELETE', `/api/company/roster/${id}`), 'Deleted.'); if (r) location.hash = '#/roster'; } } }, 'Delete')),
    h('div', { class: 'small muted' }, `${c.archetype} · cast ${c.intendedType || '?'}${c.measuredType ? `, answered as ${c.measuredType}` : ''} · tools: ${c.tier} · ${c.model || 'default model'} · written by ${c.writtenBy || 'hand'}`),
    c.checks?.screen ? h('div', { class: 'row' }, badge(`screen: ${c.checks.screen.verdict}`, c.checks.screen.ok ? 'ok' : 'bad'), c.checks.quizDrift?.drifted ? badge(`drifted from the cast: ${c.checks.quizDrift.measured} instead of ${c.checks.quizDrift.intended}`, 'warn') : null) : null,
    advice.length ? h('div', { class: 'card warn' }, h('h3', {}, 'What the blind reviewer noticed (advice, not a verdict)'), h('ul', { class: 'plain small' }, advice.map(a => h('li', {}, h('strong', {}, `${a.kind}: `), a.text)))) : null,
    h('details', { open: true }, h('summary', {}, 'The sheet, as the room reads it'), h('pre', { class: 'text' }, bio))));
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

route();
