// Creator desk for one room. Ported from TheCommons' client/admin/admin.js:
// the job-following loop, the reload-safe request ID, and the draft/job
// persistence are all the original's, which already solved the hard parts
// (a paid call must survive a reload without ever firing twice).
//
// What changed for the hosted, multi-room version: every endpoint is scoped
// to a room id, and the shared ADMIN_PASSWORD login is gone entirely — the
// suite's Google session plus a server-side ownership check on every request
// is the only thing that opens this desk.

import { mountGallery } from './gallery.js';
import { applySkin, mountPanel } from './panel.js';

const roomId = new URLSearchParams(location.search).get('room');

const deskTools = document.getElementById('deskTools');
const deskUnavailable = document.getElementById('deskUnavailable');
const unavailableTitle = document.getElementById('unavailableTitle');
const unavailableHelp = document.getElementById('unavailableHelp');
const promptSend = document.getElementById('promptSend');
const promptStatus = document.getElementById('promptStatus');
const promptInput = document.getElementById('promptInput');
const undoPiece = document.getElementById('undoPiece');
const modeOptions = document.getElementById('modeOptions');
const interactiveInput = document.getElementById('interactiveInput');
const presetSelect = document.getElementById('presetSelect');
const loadPreset = document.getElementById('loadPreset');
const savePreset = document.getElementById('savePreset');
const presetStatus = document.getElementById('presetStatus');
const galleryStatus = document.getElementById('galleryStatus');

let usable = false;
let remixing = false;
let canvas = null;
let gallery = null;
let loadingGallery = false;

const api = (path) => `/api/thecommons/rooms/${encodeURIComponent(roomId)}${path}`;
const mode = () => document.querySelector('input[name="mode"]:checked').value;
// Picks which system prompt the generator uses. The creator chooses, so
// routing needs no classifier call — and an ambient piece is never told that
// action buttons exist, which is what stops one appearing on a moiré study.
const interactive = () => interactiveInput.checked;

// Draft and in-flight job are remembered per room, so two rooms open in two
// tabs can't inherit each other's prompt or reattach to each other's job.
const draftKey = `commons-desk-draft-${roomId}`;
const jobKey = `commons-desk-job-${roomId}`;
const modeKey = `commons-desk-mode-${roomId}`;
const interactiveKey = `commons-desk-interactive-${roomId}`;

function remember(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {}
}
function recalled(key) { try { return localStorage.getItem(key); } catch { return null; } }

function updateControls() {
  promptSend.disabled = !usable || remixing || (mode() === 'remix' && !canvas?.sketchId);
  modeOptions.disabled = remixing;
  interactiveInput.disabled = remixing;
  undoPiece.disabled = !usable || remixing || !canvas?.canUndo;
  loadPreset.disabled = !usable || remixing || !presetSelect.value;
  savePreset.disabled = !usable || remixing;
  gallery?.setEnabled(usable && !remixing && !loadingGallery);
  promptSend.textContent = remixing ? 'Composing…' : mode() === 'remix' ? 'Remix this piece ↗' : 'Create a new piece ↗';
}

function showUnavailable(title, help) {
  usable = false;
  deskTools.hidden = true;
  deskUnavailable.hidden = false;
  unavailableTitle.textContent = title;
  unavailableHelp.textContent = help;
  updateControls();
}

function renderRoom(room) {
  document.getElementById('roomTitle').textContent = room.name || 'Creator desk';
  document.getElementById('currentPiece').textContent = room.sketchName
    ? `On the wall: ${room.sketchName}`
    : 'Nothing on the wall yet — make the first piece below.';
  const joinUrl = `${location.origin}/thecommons/join/${encodeURIComponent(room.joinCode)}`;
  document.getElementById('joinQr').src = `/api/thecommons/qr/${encodeURIComponent(room.joinCode)}`;
  document.getElementById('joinUrl').textContent = joinUrl.replace(/^https?:\/\//, '');
  document.getElementById('wallLink').href = `/thecommons/display/${encodeURIComponent(room.joinCode)}`;
  gallery?.markLive(room.gallerySlug);
  renderPhonePreview(room.panel);
}

// The phones' panel for whatever is on the wall, drawn by the same renderer
// the phones use. It is data only -- controls and a panel spec, never code --
// so it is as safe on this signed-in page as on an anonymous phone. It sends
// nothing: every control works locally so a host can try the feel of it.
let previewedPanel;
function renderPhonePreview(panel) {
  const frame = document.getElementById('phonePreview');
  if (!panel || panel.id === previewedPanel) return;
  previewedPanel = panel.id;
  const root = document.createElement('div');
  root.className = 'phone-panel';
  frame.replaceChildren(root);
  const mounted = mountPanel(root, panel, {});
  applySkin(frame, mounted.spec);
  for (const name of mounted.names()) mounted.setControl(name, { visible: true, enabled: true, sharing: '' });
}

// Loading a gallery piece is an ordinary preset load: owner-checked, undoable
// with "Undo last change", and never charged. That's why it needs no confirm.
async function pickFromGallery(piece, button) {
  if (!usable || remixing || loadingGallery) return;
  loadingGallery = true;
  updateControls();
  button.textContent = 'Putting it up…';
  galleryStatus.dataset.error = 'false';
  try {
    const response = await fetch(api('/presets/load'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId: piece.presetId }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      galleryStatus.textContent = `On the wall: ${piece.name}. “Undo last change” brings back what was there.`;
    } else {
      galleryStatus.dataset.error = 'true';
      galleryStatus.textContent = typeof result.detail === 'string' ? result.detail : 'Couldn’t put that on the wall.';
    }
  } catch {
    galleryStatus.dataset.error = 'true';
    galleryStatus.textContent = 'Couldn’t reach the server. Try again.';
  } finally {
    loadingGallery = false;
    button.textContent = 'Put it on the wall';
    await refreshRoom();
  }
}

let galleryStarted = false;
async function startGallery() {
  // boot() can run twice (auth-ready plus an already-known session), and
  // `gallery` is only set after an await, so guard on the attempt itself.
  if (galleryStarted) return;
  galleryStarted = true;
  try {
    gallery = await mountGallery(document.getElementById('gallery'), { onPick: pickFromGallery });
    gallery.markLive(canvas?.gallerySlug);
    updateControls();
  } catch {
    galleryStatus.textContent = 'Couldn’t load the collection. Reload to try again.';
  }
}

async function refreshRoom() {
  if (!roomId) { showUnavailable('No room selected', 'Pick a room from your list to open its desk.'); return false; }
  try {
    const response = await fetch(api(''));
    if (response.status === 401) {
      showUnavailable('Sign in to open this desk',
        'Only the room’s owner can steer it. Use the sign-in button at the top right.');
      return false;
    }
    if (response.status === 404) {
      showUnavailable('Room not found',
        'This room either doesn’t exist or isn’t yours. Check your rooms list.');
      return false;
    }
    if (!response.ok) return false;
    canvas = await response.json();
    usable = true;
    deskUnavailable.hidden = true;
    deskTools.hidden = false;
    renderRoom(canvas);
    updateControls();
    return true;
  } catch {
    promptStatus.textContent = 'Couldn’t reach the server. Reload to reconnect.';
    return false;
  }
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 2000));

function requestId() {
  // randomUUID requires a secure context; keep the original's manual v4 so
  // this still works over plain HTTP on a LAN.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function followJob(request) {
  remixing = true;
  remember(jobKey, JSON.stringify(request));
  promptStatus.textContent = 'Starting. Your idea is saved.';
  promptStatus.dataset.error = 'false';
  updateControls();
  let jobId = request.jobId || null;
  try {
    while (true) {
      let response;
      let job;
      try {
        // Reusing the same request ID after a reload or a lost response
        // returns the EXISTING job — the server never starts a second paid
        // call for it, and never reserves a second charge.
        response = jobId
          ? await fetch(api(`/jobs/${jobId}`), { signal: AbortSignal.timeout(10_000) })
          : await fetch('/api/thecommons/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: Number(roomId), prompt: request.prompt, requestId: request.id,
              mode: request.mode || 'create', baseSketchId: request.baseSketchId,
              interactive: !!request.interactive,
            }),
            signal: AbortSignal.timeout(10_000),
          });
        job = await response.json();
      } catch {
        promptStatus.textContent = 'Reconnecting. Your prompt is saved; the server keeps working.';
        await pause();
        continue;
      }

      if (response.status === 401 || response.status === 404) {
        remember(jobKey, null);
        await refreshRoom();
        break;
      }
      if (response.status === 402) {
        // auth.js already toasts the out-of-credits message.
        promptStatus.textContent = 'Out of credits — nothing was generated and nothing was charged.';
        promptStatus.dataset.error = 'true';
        remember(jobKey, null);
        break;
      }
      if (!response.ok) {
        const detail = job?.detail;
        promptStatus.textContent = response.status === 409
          ? (detail?.error || detail || 'Something is already generating in this room. Your idea is saved — try again when it finishes.')
          : 'Couldn’t start this piece. Your idea is saved — try again.';
        promptStatus.dataset.error = 'true';
        remember(jobKey, null);
        break;
      }

      const current = job.job || job;   // POST wraps in {job}, GET returns it bare
      jobId = current.id;
      remember(jobKey, JSON.stringify({ ...request, jobId }));

      if (current.status === 'generating') {
        promptStatus.textContent = 'Composing the next piece. Your prompt is saved — you can reload and come back.';
        await pause();
        continue;
      }

      remember(jobKey, null);
      if (current.status === 'completed' || current.status === 'fallback') {
        const sketch = current.sketch || {};
        promptStatus.textContent = current.status === 'fallback'
          ? `Showing ${sketch.name} from the library instead. The requested piece couldn’t finish; your idea is saved to try again.`
          : `${current.applied ? 'On the wall' : 'Saved'}: ${sketch.name}.`;
      } else {
        promptStatus.textContent = current.error || 'That piece was interrupted. Your idea is saved — try again.';
        promptStatus.dataset.error = 'true';
      }
      break;
    }
  } finally {
    remixing = false;
    updateControls();
    await refreshRoom();
    await refreshPresets();
    window.SynthAuth?.refreshCredits?.();
  }
}

document.getElementById('promptForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt || remixing || !usable) return;
  remember(draftKey, promptInput.value);
  followJob({ id: requestId(), prompt, mode: mode(), interactive: interactive(),
              baseSketchId: canvas?.sketchId });
});

async function refreshPresets() {
  if (!usable) return;
  try {
    const response = await fetch(api('/presets'));
    if (!response.ok) return;
    const { presets } = await response.json();
    const selected = presetSelect.value;
    presetSelect.replaceChildren(new Option('Choose a piece…', ''));
    const groups = new Map();
    for (const preset of presets) {
      if (preset.id.startsWith('gallery-')) continue;   // shown, live, in the collection above
      if (!groups.has(preset.kind)) {
        const group = document.createElement('optgroup');
        group.label = preset.kind;
        groups.set(preset.kind, group);
        presetSelect.append(group);
      }
      const stamp = preset.savedAt
        ? new Date(preset.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      groups.get(preset.kind).append(new Option(stamp ? `${preset.name} · ${stamp}` : preset.name, preset.id));
    }
    presetSelect.value = selected;
    updateControls();
  } catch {
    presetStatus.textContent = 'Couldn’t load the library. Reload to reconnect.';
  }
}

presetSelect.addEventListener('change', updateControls);

loadPreset.addEventListener('click', async () => {
  loadPreset.disabled = true;
  try {
    const response = await fetch(api('/presets/load'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId: presetSelect.value }),
    });
    const result = await response.json();
    presetStatus.textContent = response.ok
      ? `On the wall: ${result.name}.`
      : (result.detail || 'Couldn’t put that on the wall.');
  } catch {
    presetStatus.textContent = 'Couldn’t load this piece. Try again.';
  }
  await refreshRoom();
});

savePreset.addEventListener('click', async () => {
  savePreset.disabled = true;
  try {
    const response = await fetch(api('/presets'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: document.getElementById('presetName').value || null }),
    });
    presetStatus.textContent = response.ok
      ? 'Saved to this room’s library, including the current settings.'
      : 'Couldn’t save this look. Try again.';
  } catch {
    presetStatus.textContent = 'Couldn’t save this look. Try again.';
  }
  await refreshPresets();
  updateControls();
});

undoPiece.addEventListener('click', async () => {
  undoPiece.disabled = true;
  try {
    const response = await fetch(api('/undo'), { method: 'POST' });
    const result = await response.json();
    promptStatus.textContent = response.ok
      ? `Restored ${result.name}, including its previous settings.`
      : (result.detail || 'Couldn’t restore the previous piece.');
    promptStatus.dataset.error = String(!response.ok);
  } catch {
    promptStatus.textContent = 'Couldn’t restore the previous piece. Try again.';
  }
  await refreshRoom();
});

modeOptions.addEventListener('change', () => {
  remember(modeKey, mode());
  updateControls();
});

interactiveInput.addEventListener('change', () => remember(interactiveKey, interactive() ? '1' : '0'));

promptInput.value = recalled(draftKey) || '';
if (recalled(modeKey) === 'create') document.querySelector('input[value="create"]').checked = true;
if (recalled(interactiveKey) === '1') interactiveInput.checked = true;
promptInput.addEventListener('input', () => remember(draftKey, promptInput.value));

function resumeJob() {
  try {
    const pending = JSON.parse(recalled(jobKey));
    if (pending?.id && typeof pending.prompt === 'string') followJob(pending);
  } catch { remember(jobKey, null); }
}

async function boot() {
  if (!(await refreshRoom())) return;
  startGallery();
  await refreshPresets();
  if (!remixing) resumeJob();
}

addEventListener('synth:auth-ready', boot);
if (window.SynthAuth?.me) boot();
