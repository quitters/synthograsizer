// Generic controls for either sketch contract. Display labels may replace
// underscores, but the original values always travel over the relay.
import { mountPanel } from './panel.js';
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

let panel = null;
const pending = new Map();
let sendTimer;
const controlHint = document.getElementById('controlHint');

let hintTimer;
let participantId;
let owners = {};
// Controls declared share:"all" belong to everyone, so the relay never assigns
// them and they never appear in `owners`. The station can tell on its own,
// because it already receives the whole sketch -- no protocol change needed.
const sharedAll = new Set();

function ownsControl(name) {
  return sharedAll.has(name) || !!owners[name]?.some((person) => person.id === participantId);
}

function usable(name) {
  return ownsControl(name) && ws.readyState === WebSocket.OPEN;
}

function updateOwnership(next = owners) {
  owners = next;
  let count = 0;
  for (const name of panel?.names() || []) {
    const mine = ownsControl(name);
    if (!mine) pending.delete(name);
    if (mine) count++;
    panel.setControl(name, {
      visible: mine,
      enabled: mine && ws.readyState === WebSocket.OPEN,
      sharing: sharedAll.has(name)
        ? 'Everyone in the room can use this'
        : mine && owners[name].length > 1
          ? `Shared with ${owners[name].length - 1} ${owners[name].length === 2 ? 'other person' : 'others'} · each turn holds for 4s` : 'Your control',
    });
  }
  panel?.refreshGroups();
  document.getElementById('allocationStatus').textContent = count
    ? `${count} ${count === 1 ? 'control is' : 'controls are'} yours. Others steer the rest of the canvas.`
    : 'You’re in the room. Waiting for a control to become available.';
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

function fireTrigger(name) {
  const now = performance.now();
  // Be kind to the relay's per-participant budget: a mashing finger shouldn't
  // spend its own allowance and start silently getting dropped.
  if (now - (lastFired.get(name) ?? -Infinity) < TRIGGER_MIN_MS) return false;
  lastFired.set(name, now);
  ws.send(JSON.stringify({ type: 'trigger', varName: name }));
  return true;
}

// A dragged value is coalesced to ~30 updates/sec; a committed one (a choice,
// a released slider, a keyboard change) goes at once, so every table lands on
// the same final setting.
function sendValue(name, value, commit) {
  pending.set(name, value);
  if (commit) flushSliders();
  else if (!sendTimer) sendTimer = setTimeout(flushSliders, 33);
}

function render(sketch, values = {}, nextOwners = owners) {
  if (!sketch) return;
  document.getElementById('sketchName').textContent = sketch.name;
  pending.clear();
  sharedAll.clear();
  lastFired.clear();
  clearTimeout(sendTimer);
  sendTimer = null;
  clearTimeout(hintTimer);
  controlHint.textContent = 'Your controls are assigned automatically as people join the room.';
  for (const v of sketch.variables || []) if (v.share === 'all') sharedAll.add(v.name);
  panel = mountPanel(knobsEl, sketch, values, {
    canUse: usable,
    onVar: sendValue,
    onCommit: flushSliders,
    onTrigger: fireTrigger,
  });
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
    panel = null;
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
    if (msg.type !== 'var' || !pending.has(msg.varName)) panel?.select(msg.varName, msg.value);
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
