// The library on the creator desk: everything a host can put on the wall, in
// one place -- the ready-made pieces, this room's own saved looks and the
// pieces it generated, the built-ins and the inherited p5 library.
//
// Two card kinds, and the difference between them is the trust boundary.
//
// TRUST BOUNDARY. This is the only place the desk -- a signed-in page, where
// same-origin code can make authenticated requests -- executes sketch code. It
// only ever runs what /api/thecommons/gallery returns, which the server limits
// to pieces read in full and shipped in the repo, and those get a live card.
// Everything else in the library is a *listed* card: a name, a few tags and a
// button. The desk is never handed its code and never runs it. Saved looks and
// generated pieces belong on the wall, not here.
//
// A collection of twenty is a list you read; sixty is one you search. So the
// browse view keeps the sections, and the moment a host types or picks a tag
// it collapses into one grid of results -- filtering should look like
// filtering, not like the same page with holes in it.
import { defaultValue } from './parameters.js';
import { clampFrameDt, compileNative, resetContext } from './sketch-runtime.js';

const THUMB_W = 320;
const THUMB_H = 180;
// Previews draw a 720p wall scaled down, not a tiny canvas. Generated pieces
// size things in absolute pixels (150px drops, 100px margins); drawn straight
// into a thumbnail those fill the frame or fold over themselves. 720p because
// it's the most common projector at the kind of event this is for. At this
// scale a 320-wide chunky-pixel piece also lands exactly one pixel per pixel.
const VIRTUAL_W = 1280;
const VIRTUAL_H = 720;
const FPS = 30;

// A pretend room, so pieces that draw the crowd have a crowd to draw. Twelve,
// because a smaller pretend room made every presence piece look sparse -- a
// constellation of five people is five dots -- and no event is that small.
// Hues step by the golden angle so neighbours never look alike.
const PREVIEW_PEOPLE = ['ALICE', 'BOB', 'CARA', 'DEV', 'EMI', 'FIN', 'GUS', 'HANA', 'IKE', 'JUN', 'KAI', 'LEO']
  .map((table, i) => ({ id: `preview-${i}`, table, hue: Math.round((i * 137.5) % 360) }));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// What the desk calls the things only it knows about. The ready-made pieces
// carry their own tags from the server; these are the rest of the library.
const PRESET_KINDS = {
  'Saved looks': { tag: 'saved', blurb: 'A look you saved from this room.' },
  'Generated pieces': { tag: 'made', blurb: 'Made in this room, from a prompt.' },
  'Built-in pieces': { tag: 'builtin', blurb: 'One of the two pieces every room starts with.' },
  'Inherited library': { tag: 'inherited', blurb: 'From the older p5 library this project grew out of.' },
};

// ── previews ────────────────────────────────────────────────────────────────
// A steady 120bpm pulse stands in for the wall's microphone, so audio-reactive
// pieces show how they move with music.
function previewAudio(t) {
  const phase = (t * 2) % 1;
  const bass = 0.3 + 0.45 * Math.exp(-phase * 5);
  return { level: 0.35 + 0.1 * Math.sin(t), bass, mid: 0.3, treble: 0.25, beat: phase < 1 / FPS * 2 };
}

function makePreview(piece, canvas) {
  const ctx = canvas.getContext('2d');
  const { sketch } = piece;
  const values = {};
  for (const v of sketch.variables) if (v.type !== 'trigger') values[v.name] = defaultValue(v);
  const getVar = (name) => values[name] ?? null;
  const triggers = sketch.variables.filter((v) => v.type === 'trigger');
  const room = { state: {}, events: [], people: PREVIEW_PEOPLE };
  let draw;
  try { draw = compileNative(sketch.code); } catch { return null; }

  // Everyone-taps actions fire often, from a rotating pretend person, so the
  // preview shows what phones will actually do. One-person actions are the
  // decisive ones -- clear the board, the grand finale -- so they fire rarely;
  // firing them as often would wipe the board the moment anything landed.
  const everyone = triggers.filter((v) => v.share === 'all');
  const onePerson = triggers.filter((v) => v.share !== 'all');
  let t = 0, nextEveryone = 1.2, nextOne = 7, who = 0, failures = 0;
  return {
    broken: false,
    step(dt) {
      t += dt;
      room.events = [];
      const fire = (list) => {
        const person = PREVIEW_PEOPLE[who];
        for (const trigger of list) {
          room.events.push({ name: trigger.name, participantId: person.id, table: person.table, t });
        }
        who = (who + 1) % PREVIEW_PEOPLE.length;
      };
      if (everyone.length && t >= nextEveryone) { fire(everyone); nextEveryone = t + 1.4; }
      if (onePerson.length && t >= nextOne) { fire(onePerson); nextOne = t + 11; }
      resetContext(ctx);
      ctx.setTransform(canvas.width / VIRTUAL_W, 0, 0, canvas.height / VIRTUAL_H, 0, 0);
      try {
        draw(ctx, { t, dt, width: VIRTUAL_W, height: VIRTUAL_H }, getVar, previewAudio(t), room);
        failures = 0;
      } catch {
        if (++failures > 30) this.broken = true;   // a piece that keeps throwing stops being previewed
      }
    },
  };
}

/**
 * A card for something the desk may not run: two bands of colour drawn from
 * the entry's own name, so a wall of saved looks is still something you can
 * tell apart at a glance. Deliberately abstract -- it is a label, not a
 * thumbnail, and pretending to be a preview of a piece nobody has run would
 * be a small lie every time.
 */
function poster(canvas, name, hue) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = `hsl(${hue} 32% 16%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `hsl(${(hue + i * 26) % 360} ${28 + i * 7}% ${22 + i * 9}%)`;
    const y = (i / 5) * h * 1.4 - h * 0.2;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w * 2, y - h * 0.22);
    ctx.lineTo(w * 2, y + h * 0.16);
    ctx.lineTo(-w, y + h * 0.36);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 22px "Hanken Grotesk", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 22), w / 2, h / 2);
}

const hueOf = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 360;
};

// ── cards ───────────────────────────────────────────────────────────────────
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function tagList(entry, labels) {
  const list = el('ul', 'library-chips');
  for (const id of entry.tags) {
    const label = labels.get(id);
    if (label) list.append(el('li', 'library-chip', label));
  }
  return list;
}

function buildCard(entry, labels, onPick) {
  const card = el('li', `gallery-card${entry.piece ? '' : ' is-listed'}`);
  card.dataset.slug = entry.id;

  const screen = el('div', 'gallery-screen');
  const canvas = el('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  canvas.setAttribute('aria-hidden', 'true');
  const live = el('span', 'gallery-live', 'On the wall');
  live.hidden = true;
  const broken = el('span', 'gallery-broken', 'Preview unavailable');
  broken.hidden = true;
  screen.append(canvas, live, broken);
  if (!entry.piece) poster(canvas, entry.name, hueOf(entry.id));

  const body = el('div', 'gallery-body');
  body.append(el('h4', '', entry.name));
  if (entry.blurb) body.append(el('p', 'gallery-blurb', entry.blurb));
  if (entry.lineage) body.append(el('p', 'gallery-lineage', entry.lineage));
  body.append(tagList(entry, labels));

  if (entry.piece) {
    // Say plainly what the room will be able to do, so a host picks for the
    // crowd they have. Derived server-side from the piece itself.
    const claims = el('ul', 'gallery-tags');
    for (const v of entry.piece.sketch.variables.filter((x) => x.type === 'trigger' && x.access !== 'host')) {
      claims.append(el('li', 'tag-action', `${v.share === 'all' ? 'Everyone taps' : 'One person taps'}: ${v.label}`));
    }
    if (entry.piece.usesPeople) claims.append(el('li', 'tag-people', 'Knows who’s here'));
    if (entry.piece.panel) claims.append(el('li', 'tag-panel', `Phone panel: ${entry.piece.panel}`));
    if (claims.children.length) body.append(claims);

    const room = entry.piece.sketch.variables.filter((v) => v.type !== 'trigger' && v.access !== 'host');
    const host = entry.piece.sketch.variables.filter((v) => v.access === 'host');
    body.append(el('p', 'gallery-controls', `Phones steer: ${room.map((v) => v.label).join(' · ')}`));
    if (host.length) {
      body.append(el('p', 'gallery-controls', `Yours alone: ${host.map((v) => v.label).join(' · ')}`));
    }

    // Generated pieces show the one prompt that made them: the most direct way
    // to show a host what they could make themselves.
    if (entry.piece.prompt) {
      const details = el('details', 'gallery-prompt');
      details.append(el('summary', '', 'The prompt that made it'), el('p', '', `“${entry.piece.prompt}”`));
      body.append(details);
    }
  } else if (entry.savedAt) {
    body.append(el('p', 'gallery-controls', `Saved ${entry.savedAt}`));
  }

  const button = el('button', 'quiet-button gallery-pick', 'Put it on the wall');
  button.type = 'button';
  button.setAttribute('aria-label', `Put ${entry.name} on the wall`);
  button.addEventListener('click', () => onPick(entry, button));
  body.append(button);

  card.append(screen, body);
  return { entry, card, canvas, live, broken, button, preview: null, hover: false };
}

function sectionBlock(id, title, intro, cards) {
  const block = el('section', 'gallery-section');
  const heading = el('h3', 'gallery-section-title', title);
  heading.id = `library-${id}`;
  block.setAttribute('aria-labelledby', heading.id);
  const grid = el('ul', 'gallery-grid');
  grid.append(...cards.map((c) => c.card));
  block.append(heading);
  if (intro) block.append(el('p', 'gallery-section-intro', intro));
  block.append(grid);
  return block;
}

// ── the library ─────────────────────────────────────────────────────────────
export async function mountLibrary({ root, search, tagBar, count, onPick }) {
  const response = await fetch('/api/thecommons/gallery');
  if (!response.ok) throw new Error(`library unavailable (${response.status})`);
  const { sections = [], tagGroups = [], pieces } = await response.json();

  const labels = new Map();
  for (const group of tagGroups) for (const tag of group.tags) labels.set(tag.id, tag.label);

  let cards = [];
  let liveSlug = null;
  let enabled = true;
  const chosen = new Map();          // group id -> Set of tag ids
  let terms = [];

  // ── what the library holds ────────────────────────────────────────────────
  const fromPiece = (piece) => ({
    id: piece.slug,
    presetId: piece.presetId,
    name: piece.name,
    blurb: piece.blurb,
    lineage: piece.lineage,
    tags: piece.tags || [],
    section: piece.section,
    piece,
    // Everything a host can see on the card, so searching for what they read
    // there finds it: the words, the tags, the controls, and the actions the
    // room gets -- "everyone taps" is a phrase people look for.
    haystack: [piece.name, piece.blurb, piece.lineage, piece.prompt,
               ...(piece.tags || []).map((t) => labels.get(t) || t),
               ...piece.sketch.variables.map((v) => v.label),
               ...piece.sketch.variables.filter((v) => v.type === 'trigger')
                 .map((v) => (v.share === 'all' ? 'everyone taps' : 'one person taps')),
              ].join(' ').toLowerCase(),
  });

  const fromPreset = (preset) => {
    const kind = PRESET_KINDS[preset.kind] || { tag: 'saved', blurb: preset.kind };
    const savedAt = preset.savedAt
      ? new Date(preset.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    return {
      id: preset.id,
      presetId: preset.id,
      name: preset.name || 'Untitled',
      blurb: kind.blurb,
      tags: [kind.tag],
      section: kind.tag,
      savedAt,
      haystack: [preset.name, preset.kind, kind.blurb].join(' ').toLowerCase(),
    };
  };

  // ── filtering ─────────────────────────────────────────────────────────────
  // Within a group the chips are alternatives, across groups they narrow:
  // "demo scene or party game, and calm" is what picking three chips means.
  function matches(entry) {
    // Every word typed has to start a word in the entry. Plain `includes`
    // looked fine until "ink" matched "linked", "thinking" and half the
    // collection -- a search that answers with things you didn't mean is
    // worse than no search, because now you distrust the next answer too.
    if (terms.length && !terms.every((term) => term.test(entry.haystack))) return false;
    for (const [, wanted] of chosen) {
      if (!wanted.size) continue;
      if (!entry.tags.some((tag) => wanted.has(tag))) return false;
    }
    return true;
  }

  const filtering = () => terms.length > 0 || [...chosen.values()].some((set) => set.size);

  function render() {
    const shown = cards.filter((c) => matches(c.entry));
    for (const c of cards) c.card.hidden = !shown.includes(c);

    if (filtering()) {
      root.replaceChildren(sectionBlock('results', shown.length ? 'Matching pieces' : 'Nothing matches', '', shown));
    } else {
      const blocks = [];
      for (const s of sections) {
        const mine = cards.filter((c) => c.entry.section === s.id);
        if (mine.length) blocks.push(sectionBlock(s.id, s.title, s.intro, mine));
      }
      for (const [kindName, kind] of Object.entries(PRESET_KINDS)) {
        const mine = cards.filter((c) => c.entry.section === kind.tag);
        if (mine.length) blocks.push(sectionBlock(kind.tag, kindName, '', mine));
      }
      const placed = new Set(blocks.flatMap((b) => [...b.querySelectorAll('.gallery-card')]));
      const strays = cards.filter((c) => !placed.has(c.card));
      if (strays.length) blocks.push(sectionBlock('more', 'More pieces', '', strays));
      root.replaceChildren(...blocks);
    }

    count.replaceChildren(filtering()
      ? `${shown.length} of ${cards.length} pieces match.`
      : `${cards.length} pieces. Search, or pick a tag to narrow it down.`);
    if (filtering()) count.append(clearAll);
    markLive(liveSlug);
    setEnabled(enabled);
  }

  const clearAll = el('button', 'quiet-button library-clear', 'Show everything');
  clearAll.type = 'button';
  clearAll.addEventListener('click', () => {
    search.value = '';
    terms = [];
    chosen.clear();
    for (const chip of tagBar.querySelectorAll('.library-tag')) {
      chip.classList.remove('is-on');
      chip.setAttribute('aria-pressed', 'false');
    }
    render();
    search.focus();
  });

  // ── the chips ─────────────────────────────────────────────────────────────
  function buildTagBar() {
    tagBar.replaceChildren(...tagGroups.map((group) => {
      const block = el('div', 'library-group');
      block.append(el('p', 'library-group-title', group.title));
      const list = el('div', 'library-group-chips');
      for (const tag of group.tags) {
        const chip = el('button', 'library-tag', tag.label);
        chip.type = 'button';
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', () => {
          const wanted = chosen.get(group.id) || new Set();
          if (wanted.has(tag.id)) wanted.delete(tag.id); else wanted.add(tag.id);
          chosen.set(group.id, wanted);
          chip.setAttribute('aria-pressed', String(wanted.has(tag.id)));
          chip.classList.toggle('is-on', wanted.has(tag.id));
          render();
        });
        list.append(chip);
      }
      block.append(list);
      return block;
    }));
  }

  const escaped = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  search.addEventListener('input', () => {
    terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
      .map((term) => new RegExp(`(^|[^a-z0-9])${escaped(term)}`));
    render();
  });

  function markLive(slug) {
    liveSlug = slug;
    for (const c of cards) {
      const isLive = Boolean(slug) && c.entry.id === slug;
      c.card.classList.toggle('is-live', isLive);
      c.live.hidden = !isLive;
    }
  }

  function setEnabled(value) {
    enabled = value;
    for (const c of cards) c.button.disabled = !value;
  }

  // ── the previews, for the cards that have one ─────────────────────────────
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = cards.find((c) => c.card === entry.target);
      if (!card) continue;
      if (entry.isIntersecting) visible.add(card); else visible.delete(card);
    }
  }, { rootMargin: '120px' });

  function watch(card) {
    observer.observe(card.card);
    // With reduced motion, previews hold still until someone points at them.
    card.card.addEventListener('pointerenter', () => { card.hover = true; });
    card.card.addEventListener('pointerleave', () => { card.hover = false; });
    card.card.addEventListener('focusin', () => { card.hover = true; });
    card.card.addEventListener('focusout', () => { card.hover = false; });
  }

  function ensure(c) {
    if (!c.entry.piece) return null;
    if (c.preview || c.broken.hidden === false) return c.preview;
    c.preview = makePreview(c.entry.piece, c.canvas);
    if (!c.preview) { c.broken.hidden = false; return null; }
    // Run the first couple of seconds up front: a fire with no heat yet, or a
    // starfield with no trails, isn't what the piece actually looks like. But
    // stop early if that costs real time -- a piece that paints itself over
    // several seconds would otherwise freeze the desk the moment its card
    // scrolls into view, which is a worse first impression than a bare canvas.
    const until = performance.now() + 120;
    for (let i = 0; i < FPS * 2 && !c.preview.broken; i++) {
      c.preview.step(1 / FPS);
      if (performance.now() > until) break;
    }
    return c.preview;
  }

  let last = performance.now(), acc = 0;
  function tick(now) {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    if (acc >= 1 / FPS) {
      const dt = acc;
      acc = 0;
      for (const c of visible) {
        if (c.card.hidden) continue;
        const preview = ensure(c);
        if (!preview) continue;
        if (preview.broken) { c.broken.hidden = false; continue; }
        if (reducedMotion.matches && !c.hover) continue;
        preview.step(clampFrameDt(dt));
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ── first paint ───────────────────────────────────────────────────────────
  cards = pieces.map((piece) => buildCard(fromPiece(piece), labels, onPick));
  cards.forEach(watch);
  buildTagBar();
  render();

  return {
    markLive(slug) { markLive(slug); },
    setEnabled(value) { setEnabled(value); },
    /** The room's own pieces, from the presets list. Replaces the last lot. */
    setPresets(presets) {
      const kept = cards.filter((c) => c.entry.piece);
      const listed = presets.map((preset) => buildCard(fromPreset(preset), labels, onPick));
      listed.forEach(watch);
      cards = [...kept, ...listed];
      render();
    },
  };
}
