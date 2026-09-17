// Generic controls for either sketch contract. Display labels may replace
// underscores, but the original values always travel over the relay.
import { defaultValue, numericValue } from './parameters.js';
import { resolveWsOrigin } from './ws-origin.js';

// Served from /thecommons/join/{joinCode} — the URL the room's QR encodes.
const joinCode = location.pathname.split('/').filter(Boolean).pop();

// Storage keys are room-scoped: one phone can hold a seat in two different
// rooms without either one inheriting the other's table name or session.
let table = new URLSearchParams(location.search).get('table');
const tableKey = `commons-table-${joinCode}`;
if (!table) {
  try { table = sessionStorage.getItem(tableKey); } catch {}
  table ||= `table-${Math.random().toString(36).slice(2, 6)}`;
  try { sessionStorage.setItem(tableKey, table); } catch {}
}
document.getElementById('tableName').textContent = `Table / ${table}`;
const sessionKey = `commons-session-${joinCode}-${table}`;
let session = '';
try { session = sessionStorage.getItem(sessionKey) || ''; } catch {}
const ws = new WebSocket(`${await resolveWsOrigin()}/ws/thecommons/${encodeURIComponent(joinCode)}`
  + `?role=station&table=${encodeURIComponent(table)}&session=${encodeURIComponent(session)}`);
const knobsEl = document.getElementById('knobs');
const connection = document.getElementById('connection');


const selected = new Map();
const rows = new Map();
const sliders = new Map();
const pending = new Map();
let sendTimer;
const controlHint = document.getElementById('controlHint');

let hintTimer;
let participantId;
let owners = {};
const groups = new Map();
// Controls declared share:"all" belong to everyone, so the relay never assigns
// them and they never appear in `owners`. The station can tell on its own,
// because it already receives the whole sketch -- no protocol change needed.
const sharedAll = new Set();

function ownsControl(name) {
  return sharedAll.has(name) || !!owners[name]?.some((person) => person.id === participantId);
}

function updateOwnership(next = owners) {
  owners = next;
  let count = 0;
  for (const [name, group] of groups) {
    const mine = ownsControl(name);
    group.hidden = !mine;
    for (const input of group.querySelectorAll('input, button')) input.disabled = !mine || ws.readyState !== WebSocket.OPEN;
    if (!mine) pending.delete(name);
    if (mine) count++;
    group.querySelector('.control-sharing').textContent = sharedAll.has(name)
      ? 'Everyone in the room can use this'
      : mine && owners[name].length > 1
        ? `Shared with ${owners[name].length - 1} ${owners[name].length === 2 ? 'other person' : 'others'} · each turn holds for 4s` : 'Your control';
  }
  document.getElementById('allocationStatus').textContent = count
    ? `${count} ${count === 1 ? 'control is' : 'controls are'} yours. Others steer the rest of the canvas.`
    : 'You’re in the room. Waiting for a control to become available.';
}

function selectValue(name, value) {
  selected.set(name, value);
  const slider = sliders.get(name);
  if (slider) {
    slider.input.value = value;
    slider.output.value = String(value);
    slider.input.style.setProperty('--position', `${100 * (value - slider.min) / (slider.max - slider.min)}%`);
    return;
  }
  for (const button of rows.get(name)?.children || []) {
    const active = button.dataset.value === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function flushSliders() {
  clearTimeout(sendTimer);
  sendTimer = null;
  if (ws.readyState === WebSocket.OPEN) {
    for (const [varName, value] of pending) ws.send(JSON.stringify({ type: 'var', varName, value }));
  }
  pending.clear();
}

function updateConnection() {
  const live = ws.readyState === WebSocket.OPEN;
  connection.textContent = live ? 'Connected' : 'Disconnected · reload to rejoin';
  connection.dataset.state = live ? 'live' : 'offline';
  updateOwnership();
  if (!live) { clearTimeout(sendTimer); sendTimer = null; pending.clear(); }

}

const TRIGGER_MIN_MS = 150;
const lastFired = new Map();

function fireTrigger(name, button) {
  if (!ownsControl(name) || ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  // Be kind to the relay's per-participant budget: a mashing finger shouldn't
  // spend its own allowance and start silently getting dropped.
  if (now - (lastFired.get(name) ?? -Infinity) < TRIGGER_MIN_MS) return;
  lastFired.set(name, now);
  ws.send(JSON.stringify({ type: 'trigger', varName: name }));
  // The wall may be across the room, so confirm the tap locally too.
  button.classList.remove('fired');
  void button.offsetWidth;  // restart the animation rather than skip it
  button.classList.add('fired');
}

function render(sketch, values = {}, nextOwners = owners) {
  if (!sketch) return;
  document.getElementById('sketchName').textContent = sketch.name;
  knobsEl.replaceChildren();
  selected.clear();
  rows.clear();
  groups.clear();
  sliders.clear();
  pending.clear();
  sharedAll.clear();
  lastFired.clear();
  clearTimeout(sendTimer);
  sendTimer = null;
  clearTimeout(hintTimer);
  controlHint.textContent = 'Your controls are assigned automatically as people join the room.';
  for (const v of sketch.variables || []) {
    if (v.share === 'all') sharedAll.add(v.name);
    if (v.type !== 'trigger') selected.set(v.name, values[v.name] ?? defaultValue(v));
    const wrap = document.createElement('fieldset');
    wrap.className = 'knob';
    groups.set(v.name, wrap);
    const label = document.createElement('legend');
    label.textContent = v.label || v.name.replaceAll('_', ' ');
    label.id = `label-${knobsEl.children.length}`;
    wrap.appendChild(label);
    const sharing = document.createElement('p');
    sharing.className = 'control-sharing';
    wrap.appendChild(sharing);
    if (v.type === 'trigger') {
      // A momentary action, not a value: it sends an event and changes nothing
      // locally. The piece on the wall decides what it means.
      const holder = document.createElement('div');
      holder.className = 'trigger-control';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'trigger';
      btn.textContent = v.label || v.name.replaceAll('_', ' ');
      btn.addEventListener('click', () => fireTrigger(v.name, btn));
      holder.appendChild(btn);
      wrap.appendChild(holder);
      knobsEl.appendChild(wrap);
      continue;
    }
    if (v.type === 'number') {
      const controls = document.createElement('div');
      controls.className = 'numeric-control';
      const output = document.createElement('output');
      output.className = 'numeric-value';
      output.setAttribute('aria-live', 'off');
      const input = document.createElement('input');
      input.type = 'range';
      input.id = `range-${knobsEl.children.length}`;
      input.min = v.min;
      input.max = v.max;
      input.step = v.step;
      input.setAttribute('aria-labelledby', label.id);
      output.htmlFor = input.id;
      const bounds = document.createElement('div');
      bounds.className = 'range-bounds';
      for (const text of [String(v.min), `Step ${v.step}`, String(v.max)]) {
        const part = document.createElement('span');
        part.textContent = text;
        bounds.appendChild(part);
      }
      sliders.set(v.name, { input, output, min: v.min, max: v.max });
      selectValue(v.name, selected.get(v.name));
      input.addEventListener('input', () => {
        const value = numericValue(v, input.valueAsNumber);
        if (value === null || !ownsControl(v.name) || ws.readyState !== WebSocket.OPEN) return;
        selectValue(v.name, value);
        pending.set(v.name, value);
        // Coalesce a drag to ~30 updates/sec. Release and keyboard changes
        // flush the final value so every table lands on the same setting.
        if (!sendTimer) sendTimer = setTimeout(flushSliders, 33);
      });
      input.addEventListener('change', flushSliders);
      controls.append(output, input, bounds);
      wrap.appendChild(controls);
      knobsEl.appendChild(wrap);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'values';
    rows.set(v.name, row);
    for (const val of v.values || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.value = val.text;
      btn.textContent = val.text.replaceAll('_', ' ');
      btn.classList.toggle('active', selected.get(v.name) === val.text);
      btn.setAttribute('aria-pressed', String(selected.get(v.name) === val.text));
      btn.onclick = () => {
        if (!ownsControl(v.name) || ws.readyState !== WebSocket.OPEN) return;
        // Preserve focus and touch feedback instead of rebuilding every knob.
        selectValue(v.name, val.text);
        ws.send(JSON.stringify({ type: 'var', varName: v.name, value: val.text }));
      };
      row.appendChild(btn);
    }
    wrap.appendChild(row);
    knobsEl.appendChild(wrap);
  }
  updateOwnership(nextOwners);
  updateConnection();
}
let everOpened = false;
ws.onopen = () => { everOpened = true; updateConnection(); };
ws.onerror = updateConnection;
ws.onclose = (event) => {
  // A socket that never opened means the handshake itself was rejected --
  // which is how an unknown or closed room actually presents. The relay
  // closes those BEFORE accepting, and a pre-accept close can't carry a
  // close code to the browser (there's no connection to send a frame over),
  // so the code arrives as a bare 1006 and checking for 4404 alone would
  // never have fired. Reloading can't fix either case.
  if (!everOpened || event.code === 4404) {
    document.getElementById('sketchName').textContent = 'This room isn’t open';
    document.getElementById('allocationStatus').textContent =
      'The link may have expired, or the room was closed. Ask whoever invited you for a fresh one.';
    controlHint.textContent = '';
    knobsEl.replaceChildren();
    connection.textContent = 'Not connected';
    connection.dataset.state = 'offline';
    return;
  }
  updateConnection();
};
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'welcome') {
    participantId = msg.participantId;
    // The room's own colour for this person. A piece that draws per-participant
    // uses the same hue, so you can pick your own mark out on a crowded wall.
    if (typeof msg.hue === 'number') {
      document.documentElement.style.setProperty('--mine', `hsl(${msg.hue} 72% 62%)`);
    }
    try { sessionStorage.setItem(sessionKey, msg.session); } catch {}
  }
  if (msg.type === 'welcome' || msg.type === 'sketch') render(msg.sketch, msg.values, msg.owners);
  if (msg.type === 'ownership') updateOwnership(msg.owners);
  if (msg.type === 'var' || msg.type === 'not_owner' || msg.type === 'held') {
    // Do not rewind a drag to an earlier echo while a newer value is queued.
    if (msg.type !== 'var' || !pending.has(msg.varName)) selectValue(msg.varName, msg.value);
    if (msg.type === 'held') pending.delete(msg.varName);
    if (msg.type === 'not_owner') { pending.delete(msg.varName); updateOwnership(msg.owners); }
    clearTimeout(hintTimer);
    controlHint.textContent = msg.type === 'not_owner'
      ? 'This control now belongs to another participant. Your assigned controls are shown below.'
      : msg.type === 'held' ? `Table ${msg.table} is taking a turn on this shared control. Try again in a moment.`
      : msg.participantId === participantId ? 'Your turn is on the wall.' : 'Another participant changed the canvas.';
    hintTimer = setTimeout(() => {
      controlHint.textContent = 'Your controls are assigned automatically as people join the room.';
    }, 4000);
  }
};
