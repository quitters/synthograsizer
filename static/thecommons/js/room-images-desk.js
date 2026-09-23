// The desk's Images section: the owner uploads, orders and removes the images
// that pieces on the wall find in room.images. Until there are any, the room's
// pieces use the suite's samples, which this section shows, labelled.
//
// Everything goes through the owner-only routes in routers/thecommons.py; the
// server re-encodes every upload before storing it, so nothing here needs to
// judge a file beyond not sending one that is obviously too big. Phones never
// see any of this, and the wall hears about every change from the relay.

const MAX_UPLOAD_MB = 15;   // the server's cap (thecommons_images.MAX_UPLOAD_BYTES)
const CONFIRM_MS = 4000;

// The server says why it refused, as a code. A 5xx body is scrubbed to a
// correlation id in service mode, so those two are known by status alone.
const REFUSALS = {
  room_full: (d) => d?.message || 'This room is full.',
  not_an_image: (d) => d?.message || 'That file isn’t a PNG, JPEG, WebP or GIF image.',
  too_large: (d) => d?.message || `That file is over ${MAX_UPLOAD_MB} MB.`,
  too_many_pixels: (d) => d?.message || 'That image has too many pixels to put on a wall.',
  storage_quota: (d) => `You’re out of storage space (${d?.used_mb ?? '?'} of ${d?.limit_mb ?? '?'} MB used).`,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function refusal(response) {
  if (response.status === 503) return 'This deployment can’t store images, so pieces use the samples.';
  if (response.status >= 500) return 'The image couldn’t be stored. Try again.';
  const body = await response.json().catch(() => ({}));
  const detail = body.detail;
  const explain = REFUSALS[detail?.error];
  if (explain) return explain(detail);
  return typeof detail === 'string' ? detail : 'That didn’t work. Try again.';
}

/**
 * Mount the section. `api(path)` builds a room-scoped URL; `onLost()` is
 * called when the server says the room is gone or the session is, so the desk
 * can show why.
 */
export function mountImages({ root, api, onLost }) {
  const add = root.querySelector('#imagesAdd');
  const input = root.querySelector('#imagesInput');
  const grid = root.querySelector('#imagesGrid');
  const count = root.querySelector('#imagesCount');
  const note = root.querySelector('#imagesNote');
  const status = root.querySelector('#imagesStatus');

  let state = null;
  let busy = false;
  let enabled = true;

  const say = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };

  function controls() {
    const full = state && state.images.length >= state.limit;
    add.disabled = !enabled || busy || !state || !state.storageEnabled || full;
    add.hidden = !!state && !state.storageEnabled;
    for (const button of grid.querySelectorAll('button')) button.disabled = !enabled || busy;
  }

  function card(image, index, total) {
    const item = el('li', 'image-card');
    const frame = el('div', 'image-frame');
    const img = el('img');
    img.src = image.url;
    img.alt = image.sample ? `Sample image ${index + 1}` : `Image ${index + 1}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    frame.append(img);
    if (image.sample) frame.append(el('span', 'image-badge', 'Sample'));
    item.append(frame);

    const body = el('div', 'image-body');
    body.append(el('p', 'image-meta', `${index + 1} · ${image.width}×${image.height}`));
    if (!image.sample) {
      const actions = el('div', 'image-actions');
      const earlier = el('button', 'quiet-button image-move', '←');
      earlier.type = 'button';
      earlier.setAttribute('aria-label', `Move image ${index + 1} earlier`);
      earlier.dataset.move = '-1';
      earlier.hidden = index === 0;
      const later = el('button', 'quiet-button image-move', '→');
      later.type = 'button';
      later.setAttribute('aria-label', `Move image ${index + 1} later`);
      later.dataset.move = '1';
      later.hidden = index === total - 1;
      earlier.onclick = () => move(image.id, -1);
      later.onclick = () => move(image.id, 1);
      const remove = el('button', 'quiet-button image-remove', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove image ${index + 1}`);
      let armed = null;
      remove.onclick = () => {
        // Removing can't be undone, so it takes a second click. Loading a
        // piece has Undo instead; an image has nothing to undo back to.
        if (!armed) {
          remove.textContent = 'Really remove?';
          remove.classList.add('is-armed');
          armed = setTimeout(() => {
            armed = null;
            remove.textContent = 'Remove';
            remove.classList.remove('is-armed');
          }, CONFIRM_MS);
          return;
        }
        clearTimeout(armed);
        removeImage(image.id, index);
      };
      actions.append(earlier, later, remove);
      body.append(actions);
    }
    item.append(body);
    item.dataset.id = String(image.id);
    return item;
  }

  function render() {
    const uploads = state.images;
    const shown = uploads.length ? uploads : state.samples.map((s) => ({ ...s, sample: true }));
    grid.replaceChildren(...shown.map((image, i) => card(image, i, shown.length)));
    count.textContent = `${uploads.length} of ${state.limit} images · ${state.storageUsedMb} of `
      + `${state.storageLimitMb} MB of your storage used`;
    if (!state.storageEnabled) {
      note.textContent = 'This deployment can’t store images, so pieces use these samples.';
    } else if (!uploads.length) {
      note.textContent = 'Pieces use these samples until you add your own. The first image you add replaces them all.';
    } else {
      note.textContent = 'Pieces see them in this order. Removing the last one brings the samples back.';
    }
    controls();
  }

  async function refresh() {
    try {
      const response = await fetch(api('/images'));
      if (response.status === 401 || response.status === 404) { onLost?.(); return; }
      if (!response.ok) { say('Couldn’t load your images. Reload to try again.', true); return; }
      state = await response.json();
      render();
    } catch {
      say('Couldn’t reach the server. Reload to reconnect.', true);
    }
  }

  async function upload(files) {
    busy = true;
    controls();
    const added = [];
    const refused = [];
    let room = state.limit - state.images.length;
    for (const [i, file] of files.entries()) {
      if (room <= 0) { refused.push(`${file.name}: this room is full.`); continue; }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        refused.push(`${file.name}: it’s over ${MAX_UPLOAD_MB} MB.`);
        continue;
      }
      say(files.length > 1 ? `Adding ${i + 1} of ${files.length}: ${file.name}…` : `Adding ${file.name}…`);
      try {
        const form = new FormData();
        form.append('file', file, file.name);
        const response = await fetch(api('/images'), { method: 'POST', body: form });
        if (response.status === 401 || response.status === 404) { onLost?.(); break; }
        if (response.ok) { added.push(file.name); room -= 1; } else refused.push(`${file.name}: ${await refusal(response)}`);
      } catch {
        refused.push(`${file.name}: couldn’t reach the server.`);
      }
    }
    busy = false;
    await refresh();
    const done = added.length === 1 ? `Added ${added[0]}. The wall has it now.`
      : added.length ? `Added ${added.length} images. The wall has them now.` : '';
    say([done, ...refused].filter(Boolean).join(' '), refused.length > 0);
  }

  async function move(id, step) {
    const ids = state.images.map((image) => image.id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    busy = true;
    controls();
    try {
      const response = await fetch(api('/images/order'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      });
      if (response.status === 401 || response.status === 404) { onLost?.(); return; }
      if (response.ok) {
        state = await response.json();
        say('');
      } else {
        say(await refusal(response), true);
        await refresh();
      }
    } catch {
      say('Couldn’t reach the server. Try again.', true);
    } finally {
      busy = false;
      render();
      // Keep the keyboard where it was: on the same arrow of the image just
      // moved, or the other arrow when it has reached an end.
      const moved = grid.querySelector(`[data-id="${id}"]`);
      const same = moved?.querySelector(`[data-move="${step}"]`);
      (same && !same.hidden ? same : moved?.querySelector(`[data-move="${-step}"]`))?.focus();
    }
  }

  async function removeImage(id, index) {
    busy = true;
    controls();
    try {
      const response = await fetch(api(`/images/${encodeURIComponent(id)}`), { method: 'DELETE' });
      if (response.status === 401) { onLost?.(); return; }
      if (response.ok || response.status === 404) say(`Removed image ${index + 1}.`);
      else say(await refusal(response), true);
    } catch {
      say('Couldn’t reach the server. Try again.', true);
    } finally {
      busy = false;
      await refresh();
      add.focus();
    }
  }

  add.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.value = '';   // choosing the same file again should still upload it
    if (files.length && state) upload(files);
  });

  return {
    refresh,
    setEnabled(value) { enabled = value; controls(); },
  };
}
