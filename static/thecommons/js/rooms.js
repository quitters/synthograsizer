// Room list and creation. Sign-in is handled entirely by the suite's shared
// auth.js (the account pill renders into #synth-account-slot); this page only
// reacts to whether a session exists.

const signedOut = document.getElementById('signedOut');
const roomTools = document.getElementById('roomTools');
const roomList = document.getElementById('roomList');
const roomsStatus = document.getElementById('roomsStatus');
const createStatus = document.getElementById('createStatus');
const createForm = document.getElementById('createForm');
const createButton = document.getElementById('createRoom');
const roomName = document.getElementById('roomName');

function setSignedIn(value) {
  signedOut.hidden = value;
  roomTools.hidden = !value;
  if (value) refreshRooms();
}

function roomCard(room) {
  const item = document.createElement('li');
  item.className = 'room';

  const head = document.createElement('div');
  head.className = 'room-head';
  const title = document.createElement('h3');
  title.textContent = room.name || 'Untitled room';
  const when = document.createElement('span');
  when.className = 'eyebrow';
  when.textContent = room.createdAt
    ? new Date(room.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  head.append(title, when);

  const actions = document.createElement('div');
  actions.className = 'room-actions';
  const desk = document.createElement('a');
  desk.className = 'primary-button';
  desk.href = `/thecommons/desk/?room=${encodeURIComponent(room.id)}`;
  desk.textContent = 'Open creator desk';
  const display = document.createElement('a');
  display.className = 'quiet-button';
  display.href = `/thecommons/display/${encodeURIComponent(room.joinCode)}`;
  display.target = '_blank';
  display.rel = 'noopener';
  display.textContent = 'Open the wall ↗';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'quiet-button danger-button';
  remove.textContent = 'Delete room';
  remove.addEventListener('click', () => deleteRoom(room, item, remove));
  actions.append(desk, display, remove);

  const qr = document.createElement('img');
  qr.className = 'room-qr';
  qr.alt = `QR code to join ${room.name || 'this room'}`;
  qr.src = `/api/thecommons/qr/${encodeURIComponent(room.joinCode)}`;

  const body = document.createElement('div');
  body.className = 'room-body';
  const text = document.createElement('div');
  const hint = document.createElement('p');
  hint.className = 'section-help';
  hint.textContent = 'Put the wall on a screen, then let people scan this to take a control.';
  text.append(hint, actions);
  body.append(text, qr);

  item.append(head, body);
  return item;
}

async function deleteRoom(room, card, button) {
  const label = room.name ? `“${room.name}”` : 'this room';
  // Name the consequences rather than asking a bare "are you sure?". Saved
  // looks live in the room's job history, so deleting takes them with it, and
  // the join link stops working for anyone holding it or mid-session.
  if (!confirm(
    `Delete ${label}?\n\n`
    + 'This is permanent. Its canvas, its saved looks, and its history are removed, '
    + 'and the join link and QR stop working for anyone still in the room.\n\n'
    + 'Credits you have already spent are not affected.')) return;

  button.disabled = true;
  button.textContent = 'Deleting…';
  try {
    const response = await fetch(`/api/thecommons/rooms/${encodeURIComponent(room.id)}`,
                                 { method: 'DELETE' });
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok && response.status !== 404) {
      roomsStatus.hidden = false;
      roomsStatus.textContent = 'Couldn’t delete that room. Try again.';
      button.disabled = false;
      button.textContent = 'Delete room';
      return;
    }
    // 404 means it is already gone — someone deleted it in another tab. The
    // end state the person wanted is the end state they have, so treat it as
    // success rather than showing an error for a room that no longer exists.
    card.remove();
    if (!roomList.children.length) {
      roomsStatus.hidden = false;
      roomsStatus.textContent =
        'No rooms yet. Make one above — it takes a second and costs nothing until you generate.';
    }
  } catch {
    roomsStatus.hidden = false;
    roomsStatus.textContent = 'Couldn’t reach the server. Try again.';
    button.disabled = false;
    button.textContent = 'Delete room';
  }
}

async function refreshRooms() {
  try {
    const response = await fetch('/api/me/thecommons/rooms');
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok) { roomsStatus.textContent = 'Couldn’t load your rooms. Reload to try again.'; return; }
    const { rooms } = await response.json();
    roomList.replaceChildren(...rooms.map(roomCard));
    roomsStatus.textContent = rooms.length
      ? ''
      : 'No rooms yet. Make one above — it takes a second and costs nothing until you generate.';
    roomsStatus.hidden = rooms.length > 0;
  } catch {
    roomsStatus.hidden = false;
    roomsStatus.textContent = 'Couldn’t reach the server. Reload to reconnect.';
  }
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  createButton.disabled = true;
  createStatus.textContent = 'Making your room…';
  try {
    const response = await fetch('/api/thecommons/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roomName.value.trim() || null }),
    });
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok) { createStatus.textContent = 'Couldn’t make the room. Try again.'; return; }
    const room = await response.json();
    roomName.value = '';
    createStatus.textContent = '';
    // Straight to the desk: making a room and then hunting for it in a list
    // is a pointless extra step when there's only ever one thing you want next.
    location.href = `/thecommons/desk/?room=${encodeURIComponent(room.id)}`;
  } catch {
    createStatus.textContent = 'Couldn’t reach the server. Try again.';
  } finally {
    createButton.disabled = false;
  }
});

// auth.js fires this once it knows whether there's a session; detail is the
// /api/me payload, or undefined when signed out (or on a local install).
addEventListener('synth:auth-ready', (event) => setSignedIn(!!event.detail));
if (window.SynthAuth?.me) setSignedIn(true);
