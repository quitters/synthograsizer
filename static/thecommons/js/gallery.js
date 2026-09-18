// The demo scene gallery on the creator desk: every piece runs live in its
// card, so a host sees what they're putting on the wall rather than guessing
// from a name. Previews are real time for the same reason demos were -- a
// screenshot of a plasma tells you nothing about a plasma.
//
// TRUST BOUNDARY. This is the only place the desk -- a signed-in page, where
// same-origin code can make authenticated requests -- executes sketch code. It
// only ever runs what /api/thecommons/gallery returns, which the server limits
// to hand-written pieces shipped in the repo. Never feed it saved looks or
// generated pieces; those belong on the wall, not here.
import { defaultValue } from './parameters.js';
import { compileNative, resetContext } from './sketch-runtime.js';

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

// A pretend room, so pieces that draw the crowd have a crowd to draw.
const PREVIEW_PEOPLE = [
  { id: 'preview-a', table: 'ALICE', hue: 12 },
  { id: 'preview-b', table: 'BOB', hue: 145 },
  { id: 'preview-c', table: 'CARA', hue: 265 },
  { id: 'preview-d', table: 'DEV', hue: 48 },
  { id: 'preview-e', table: 'EMI', hue: 320 },
];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildCard(piece, onPick) {
  const card = el('li', 'gallery-card');
  card.dataset.slug = piece.slug;

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

  const body = el('div', 'gallery-body');
  body.append(el('h4', '', piece.name), el('p', 'gallery-blurb', piece.blurb), el('p', 'gallery-lineage', piece.lineage));

  // Say plainly what the room will be able to do, so a host picks for the
  // crowd they have. Derived server-side from the piece itself.
  const tags = el('ul', 'gallery-tags');
  for (const v of piece.sketch.variables.filter((x) => x.type === 'trigger')) {
    tags.append(el('li', 'tag-action', `${v.share === 'all' ? 'Everyone taps' : 'One person taps'}: ${v.label}`));
  }
  if (piece.usesPeople) tags.append(el('li', 'tag-people', 'Knows who’s here'));
  if (tags.children.length) body.append(tags);

  const controls = piece.sketch.variables.filter((v) => v.type !== 'trigger').map((v) => v.label);
  body.append(el('p', 'gallery-controls', `Phones steer: ${controls.join(' · ')}`));

  // Generated pieces show the one prompt that made them: the most direct way
  // to show a host what they could make themselves.
  if (piece.prompt) {
    const details = el('details', 'gallery-prompt');
    details.append(el('summary', '', 'The prompt that made it'), el('p', '', `“${piece.prompt}”`));
    body.append(details);
  }

  const button = el('button', 'quiet-button gallery-pick', 'Put it on the wall');
  button.type = 'button';
  button.setAttribute('aria-label', `Put ${piece.name} on the wall`);
  button.addEventListener('click', () => onPick(piece, button));
  body.append(button);

  card.append(screen, body);
  return { piece, card, canvas, live, broken, button, preview: null, hover: false, warmed: false };
}

function sectionBlock(id, title, intro, cards) {
  const block = el('section', 'gallery-section');
  const heading = el('h3', 'gallery-section-title', title);
  heading.id = `gallery-${id}`;
  block.setAttribute('aria-labelledby', heading.id);
  const grid = el('ul', 'gallery-grid');
  grid.append(...cards.map((c) => c.card));
  block.append(heading);
  if (intro) block.append(el('p', 'gallery-section-intro', intro));
  block.append(grid);
  return block;
}

export async function mountGallery(root, { onPick }) {
  const response = await fetch('/api/thecommons/gallery');
  if (!response.ok) throw new Error(`gallery unavailable (${response.status})`);
  const { sections = [], pieces } = await response.json();
  const cards = pieces.map((piece) => buildCard(piece, onPick));

  // Sections in the server's order. Anything whose section isn't listed still
  // shows, at the end, rather than silently vanishing from the desk.
  const known = new Set(sections.map((s) => s.id));
  const blocks = sections
    .map((s) => [s, cards.filter((c) => c.piece.section === s.id)])
    .filter(([, mine]) => mine.length)
    .map(([s, mine]) => sectionBlock(s.id, s.title, s.intro, mine));
  const strays = cards.filter((c) => !known.has(c.piece.section));
  if (strays.length) blocks.push(sectionBlock('more', 'More pieces', '', strays));
  root.replaceChildren(...blocks);

  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = cards.find((c) => c.card === entry.target);
      if (entry.isIntersecting) visible.add(card); else visible.delete(card);
    }
  }, { rootMargin: '120px' });

  for (const c of cards) {
    observer.observe(c.card);
    // With reduced motion, previews hold still until someone points at them.
    c.card.addEventListener('pointerenter', () => { c.hover = true; });
    c.card.addEventListener('pointerleave', () => { c.hover = false; });
    c.card.addEventListener('focusin', () => { c.hover = true; });
    c.card.addEventListener('focusout', () => { c.hover = false; });
  }

  function ensure(c) {
    if (c.preview || c.broken.hidden === false) return c.preview;
    c.preview = makePreview(c.piece, c.canvas);
    if (!c.preview) { c.broken.hidden = false; return null; }
    // Run the first couple of seconds up front: a fire with no heat yet, or a
    // starfield with no trails, isn't what the piece actually looks like.
    for (let i = 0; i < FPS * 2 && !c.preview.broken; i++) c.preview.step(1 / FPS);
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
        const preview = ensure(c);
        if (!preview) continue;
        if (preview.broken) { c.broken.hidden = false; continue; }
        if (reducedMotion.matches && !c.hover) continue;
        preview.step(Math.min(dt, 0.1));
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    markLive(slug) {
      for (const c of cards) {
        const isLive = c.piece.slug === slug;
        c.card.classList.toggle('is-live', isLive);
        c.live.hidden = !isLive;
      }
    },
    setEnabled(enabled) {
      for (const c of cards) c.button.disabled = !enabled;
    },
  };
}
