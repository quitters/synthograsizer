/* Landing-page demo: a miniature of the real Synthograsizer loop.
 *
 * One template (a sentence with named slots), one knob per slot, and two outputs
 * driven by the same values: the assembled prompt, and a live sketch.
 *
 * Based on templates/murmuration.json: the same variables and values, and a plain-canvas
 * port of its p5 sketch, so nothing here needs p5, a backend call, or an account.
 * Two deliberate differences from the live template:
 *   - the sentence opens "A swarm with…" rather than naming a murmuration;
 *   - the Bioluminescence options keep the original's structure (two pale, four glowing)
 *     but are recoloured and renamed to the landing page's palette.
 * The live app's template is unchanged. */
(() => {
  'use strict';

  const root = document.getElementById('rig');
  const canvas = document.getElementById('rig-canvas');
  if (!root || !canvas) return;

  const VARS = [
    { name: 'flock_density', label: 'Flock Mass', tone: 'ochre', start: 2,
      values: ['drifting mist', 'compact cluster', 'surging river', 'dense smoke', 'swarming vortex', 'black hole'] },
    { name: 'predator_fury', label: 'Predator Drive', tone: 'teal', start: 2,
      values: ['lazy circling', 'curious stalker', 'slicing passes', 'relentless dive', 'frenzied raptor', 'shattering bolt'] },
    { name: 'aerial_current', label: 'Atmosphere', tone: 'blue', start: 1,
      values: ['still dusk', 'gentle thermals', 'crosswind gust', 'choppy gale', 'whirling squall', 'tornadic shear'] },
    { name: 'plumage_glow', label: 'Glow', tone: 'clay', start: 3,
      values: ['ink silhouettes', 'sage shimmer', 'dusk embers', 'moss light', 'tidal teal', 'marigold flare'] },
    { name: 'wing_geometry', label: 'Formation', tone: 'olive', start: 2,
      values: ['soft grains', 'needle strokes', 'chevron darts', 'filament ribbons', 'faceted prisms', 'shards of glass'] },
  ];
  // The template sentence. Text between slots is plain; each slot is a variable above.
  const TEMPLATE = ['A swarm with ', 'flock_density', ', driven by a ', 'predator_fury', ' through ',
    'aerial_current', ', glowing like ', 'plumage_glow', ' made of ', 'wing_geometry', '.'];

  const state = {};
  VARS.forEach(v => { state[v.name] = v.start; });
  const byName = Object.fromEntries(VARS.map(v => [v.name, v]));
  const valueOf = name => byName[name].values[state[name]];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const promptEl = document.getElementById('rig-prompt');
  const knobsEl = document.getElementById('rig-knobs');
  const announce = document.getElementById('rig-status');
  const chips = {};
  const knobs = {};
  let announceTimer = 0;

  /* ── Sentence + knobs ───────────────────────────────────────────── */

  function buildPrompt() {
    promptEl.textContent = '';
    TEMPLATE.forEach(part => {
      if (!byName[part]) { promptEl.append(part); return; }
      const v = byName[part];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `rig-chip tone-${v.tone}`;
      chip.addEventListener('click', event => step(v.name, event.shiftKey ? -1 : 1, true));
      chips[v.name] = chip;
      promptEl.append(chip);
    });
  }

  const SVG = 'http://www.w3.org/2000/svg';
  const polar = (angle, r) => [32 + r * Math.sin(angle), 32 - r * Math.cos(angle)];
  const SWEEP = 270 * Math.PI / 180; // knob travel, centred on straight up

  function buildKnob(v) {
    const wrap = document.createElement('div');
    wrap.className = `rig-knob tone-${v.tone}`;

    const dial = document.createElement('div');
    dial.className = 'rig-dial';
    dial.tabIndex = 0;
    dial.setAttribute('role', 'slider');
    dial.setAttribute('aria-label', v.label);
    dial.setAttribute('aria-valuemin', '0');
    dial.setAttribute('aria-valuemax', String(v.values.length - 1));
    dial.setAttribute('aria-orientation', 'vertical');

    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    // One notch per value, like the notched knobs in the app.
    v.values.forEach((_, i) => {
      const a = (i / (v.values.length - 1) - .5) * SWEEP;
      const [x1, y1] = polar(a, 25);
      const [x2, y2] = polar(a, 29.5);
      const tick = document.createElementNS(SVG, 'line');
      tick.setAttribute('x1', x1); tick.setAttribute('y1', y1);
      tick.setAttribute('x2', x2); tick.setAttribute('y2', y2);
      tick.setAttribute('class', 'rig-tick');
      svg.append(tick);
    });
    const body = document.createElementNS(SVG, 'circle');
    body.setAttribute('cx', 32); body.setAttribute('cy', 32); body.setAttribute('r', 21);
    body.setAttribute('class', 'rig-body');
    svg.append(body);
    const pointer = document.createElementNS(SVG, 'g');
    pointer.setAttribute('class', 'rig-pointer');
    const mark = document.createElementNS(SVG, 'line');
    mark.setAttribute('x1', 32); mark.setAttribute('y1', 14.5);
    mark.setAttribute('x2', 32); mark.setAttribute('y2', 24);
    mark.setAttribute('class', 'rig-mark');
    pointer.append(mark);
    svg.append(pointer);
    dial.append(svg);

    const readout = document.createElement('output');
    readout.className = 'rig-readout';
    const label = document.createElement('span');
    label.className = 'rig-label-text';
    label.textContent = v.label;
    wrap.append(dial, readout, label);
    knobsEl.append(wrap);
    knobs[v.name] = { wrap, dial, pointer, readout, ticks: svg.querySelectorAll('.rig-tick') };

    // Click to step forward; drag up/down to turn; arrow keys when focused.
    let startY = 0, startIndex = 0, dragged = false;
    dial.addEventListener('pointerdown', event => {
      startY = event.clientY; startIndex = state[v.name]; dragged = false;
      dial.setPointerCapture(event.pointerId);
    });
    dial.addEventListener('pointermove', event => {
      if (!dial.hasPointerCapture(event.pointerId)) return;
      const dy = startY - event.clientY;
      if (Math.abs(dy) > 6) dragged = true;
      if (!dragged) return;
      const target = Math.max(0, Math.min(v.values.length - 1, startIndex + Math.round(dy / 16)));
      if (target !== state[v.name]) set(v.name, target, true);
    });
    dial.addEventListener('pointerup', event => {
      if (dial.hasPointerCapture(event.pointerId)) dial.releasePointerCapture(event.pointerId);
      if (!dragged) step(v.name, 1, true);
    });
    dial.addEventListener('keydown', event => {
      const delta = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key];
      if (delta) { event.preventDefault(); set(v.name, Math.max(0, Math.min(v.values.length - 1, state[v.name] + delta)), true); }
      else if (event.key === 'Home') { event.preventDefault(); set(v.name, 0, true); }
      else if (event.key === 'End') { event.preventDefault(); set(v.name, v.values.length - 1, true); }
    });
  }

  function render() {
    VARS.forEach(v => {
      const i = state[v.name];
      const text = v.values[i];
      const chip = chips[v.name];
      chip.textContent = text;
      chip.setAttribute('aria-label', `${v.label}: ${text}. Activate to try the next value.`);
      const k = knobs[v.name];
      const angle = (i / (v.values.length - 1) - .5) * 270;
      k.pointer.style.transform = `rotate(${angle}deg)`;
      k.readout.textContent = text;
      k.dial.setAttribute('aria-valuenow', String(i));
      k.dial.setAttribute('aria-valuetext', `${text}, ${i + 1} of ${v.values.length}`);
      k.ticks.forEach((tick, t) => tick.classList.toggle('on', t === i));
    });
    canvas.setAttribute('aria-label', `A live generative sketch driven by the template above. ${promptText()}`);
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { announce.textContent = promptText(); }, 500);
  }

  const promptText = () => TEMPLATE.map(p => byName[p] ? valueOf(p) : p).join('');

  function flash(name) {
    [chips[name], knobs[name].wrap].forEach(el => {
      el.classList.remove('bump');
      void el.offsetWidth; // restart the animation
      el.classList.add('bump');
    });
  }

  function set(name, index, fromUser) {
    if (state[name] === index) return;
    state[name] = index;
    if (fromUser) flash(name);
    render();
    onChange(name);
  }
  function step(name, dir, fromUser) {
    const n = byName[name].values.length;
    set(name, (state[name] + dir + n) % n, fromUser);
  }

  document.getElementById('remix').addEventListener('click', () => {
    VARS.forEach(v => {
      const n = v.values.length;
      // Always move every knob, so each press visibly does something.
      state[v.name] = (state[v.name] + 1 + Math.floor(Math.random() * (n - 1))) % n;
      flash(v.name);
    });
    render();
    onChange('plumage_glow');
  });

  /* ── The sketch (port of the Murmuration template) ──────────────── */

  const DENSITY = [600, 800, 1000, 1200, 1500, 1800];
  const PREDATOR = [
    { speed: 3, radius: 60, scatter: .5 }, { speed: 4, radius: 90, scatter: 1 },
    { speed: 6, radius: 120, scatter: 1.5 }, { speed: 8, radius: 150, scatter: 2.5 },
    { speed: 11, radius: 200, scatter: 4 }, { speed: 15, radius: 300, scatter: 6 },
  ];
  const CURRENT = [
    { force: .01, twitch: 0 }, { force: .05, twitch: .05 }, { force: .1, twitch: .1 },
    { force: .2, twitch: .2 }, { force: .4, twitch: .5 }, { force: .8, twitch: .9 },
  ];
  // bg: rgb of the sky. trail: how much of the previous frame is wiped (255 = all of it).
  // The first two sit on pale paper, the rest on deep green and teal, apart from the last,
  // which paints marigold on cream and lets it build up.
  const GLOW = [
    { bg: [244, 241, 230], trail: 255, fg: '#213f35', ring: '#a35c33' },
    { bg: [223, 230, 214], trail: 190, fg: '#4a6b52', ring: '#284f3e' },
    { bg: [22, 35, 29], trail: 90, fg: '#e0924f', ring: '#f2c08f' },
    { bg: [15, 26, 22], trail: 40, fg: '#a9c995', ring: '#e0a56f' },
    { bg: [12, 27, 30], trail: 20, fg: '#6fc2b4', ring: '#e8b07a' },
    { bg: [250, 244, 228], trail: 46, fg: '#d88751', ring: '#8f4d2b' },   // a faster fade than the dark ones: light skies stall on a pink cast otherwise
  ];
  const SHAPES = ['grain', 'needle', 'chevron', 'ribbon', 'prism', 'shard'];

  const W = 800, CELL = 40, COLS = W / CELL, MAX = 1800;
  let H = 340, scale = 1, ctx = null;
  let boids = [], rows = 9, gridHeads = null;
  const gridNext = new Int16Array(MAX);
  const predator = { x: 400, y: 170, vx: 0, vy: 0 };
  let pointer = null;     // the cursor, in sketch coordinates, while it is over the canvas
  let frame = 0;

  // Cheap smooth value noise, 0..1, for the predator's wandering. Stands in for p5's noise().
  const hash = x => {
    let n = (x * 374761393) | 0;
    n = (n ^ (n >>> 13)) * 1274126177 | 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  function noise1(x) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return hash(i) * (1 - u) + hash(i + 1) * u;
  }

  function seedBoids() {
    boids = Array.from({ length: MAX }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: Math.random() * 4 - 2, vy: Math.random() * 4 - 2,
    }));
  }

  function paintSky(alpha) {
    const [r, g, b] = GLOW[state.plumage_glow].bg;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    scale = box.width / W;
    H = box.height / scale;               // keep the sketch 800 wide; the sky is as tall as the frame
    rows = Math.ceil(H / CELL);
    gridHeads = new Int16Array(COLS * rows);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    ctx = canvas.getContext('2d');
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
    seedBoids();
    paintSky(1);
    if (reduceMotion.matches) settle();
  }

  function draw() {
    const active = Math.round(DENSITY[state.flock_density] * H / W);   // same density at any frame height
    const pred = PREDATOR[state.predator_fury];
    const cur = CURRENT[state.aerial_current];
    const glow = GLOW[state.plumage_glow];
    const shape = SHAPES[state.wing_geometry];

    paintSky(glow.trail / 255);

    // The hawk follows the cursor, or wanders on its own.
    const tx = pointer ? pointer.x : noise1(frame * .01) * W;
    const ty = pointer ? pointer.y : noise1(frame * .01 + 100) * H;
    const pdx = tx - predator.x, pdy = ty - predator.y;
    const plen = Math.hypot(pdx, pdy) || 1;
    predator.vx = (predator.vx + pdx / plen * .5) * .95;
    predator.vy = (predator.vy + pdy / plen * .5) * .95;
    const pspd = Math.hypot(predator.vx, predator.vy) || 1;
    if (pspd > pred.speed) { predator.vx = predator.vx / pspd * pred.speed; predator.vy = predator.vy / pspd * pred.speed; }
    predator.x += predator.vx; predator.y += predator.vy;
    if (predator.x < 0) predator.x = W;
    if (predator.x > W) predator.x = 0;
    if (predator.y < 0) predator.y = H;
    if (predator.y > H) predator.y = 0;

    gridHeads.fill(-1);
    for (let i = 0; i < active; i++) {
      const b = boids[i];
      const cx = Math.max(0, Math.min(COLS - 1, Math.floor(b.x / CELL)));
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(b.y / CELL)));
      const idx = cx + cy * COLS;
      gridNext[i] = gridHeads[idx];
      gridHeads[idx] = i;
    }

    ctx.beginPath();
    ctx.strokeStyle = glow.fg;
    ctx.fillStyle = glow.fg;
    ctx.lineWidth = 1.5;
    const twitchPhase = frame * .5;

    for (let i = 0; i < active; i++) {
      const b = boids[i];
      const cx = Math.max(0, Math.min(COLS - 1, Math.floor(b.x / CELL)));
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(b.y / CELL)));
      let alignX = 0, alignY = 0, sepX = 0, sepY = 0, cohX = 0, cohY = 0, count = 0;

      for (let y = Math.max(0, cy - 1); y <= Math.min(rows - 1, cy + 1); y++) {
        for (let x = Math.max(0, cx - 1); x <= Math.min(COLS - 1, cx + 1); x++) {
          let j = gridHeads[x + y * COLS];
          while (j !== -1) {
            if (j !== i) {
              const o = boids[j];
              const dx = b.x - o.x, dy = b.y - o.y;
              const dsq = dx * dx + dy * dy;
              if (dsq < 1600) {
                alignX += o.vx; alignY += o.vy;
                cohX += o.x; cohY += o.y;
                if (dsq < 400 && dsq > 0) { sepX += dx / dsq; sepY += dy / dsq; }
                count++;
              }
            }
            j = gridNext[j];
          }
        }
      }

      if (count > 0) {
        alignX /= count; alignY /= count; cohX /= count; cohY /= count;
        b.vx += (alignX - b.vx) * .05 + (cohX - b.x) * .005 + sepX * 2;
        b.vy += (alignY - b.vy) * .05 + (cohY - b.y) * .005 + sepY * 2;
      }

      const fx = b.x - predator.x, fy = b.y - predator.y;
      const fd = Math.hypot(fx, fy) || .001;
      if (fd < pred.radius) {
        b.vx += fx / fd * pred.scatter;
        b.vy += fy / fd * pred.scatter;
      }

      b.vx += Math.sin(b.y * .01 + frame * .02) * cur.force;
      if (cur.twitch > 0 && Math.random() < .1) {
        b.vx += Math.sin(twitchPhase + b.x) * cur.twitch;
        b.vy += Math.cos(twitchPhase + b.y) * cur.twitch;
      }

      const margin = 50, turn = .5;
      if (b.x < margin) b.vx += turn;
      if (b.x > W - margin) b.vx -= turn;
      if (b.y < margin) b.vy += turn;
      if (b.y > H - margin) b.vy -= turn;

      const speed = Math.hypot(b.vx, b.vy) || 1;
      if (speed > 4) { b.vx = b.vx / speed * 4; b.vy = b.vy / speed * 4; }
      b.x += b.vx; b.y += b.vy;

      const dir = Math.atan2(b.vy, b.vx), size = 4;
      if (shape === 'grain') {
        ctx.moveTo(b.x, b.y);
        ctx.rect(b.x - 1.5, b.y - 1.5, 3, 3);
      } else if (shape === 'needle') {
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 2, b.y - b.vy * 2);
      } else if (shape === 'chevron') {
        ctx.moveTo(b.x + Math.cos(dir) * size, b.y + Math.sin(dir) * size);
        ctx.lineTo(b.x + Math.cos(dir + 2.5) * size, b.y + Math.sin(dir + 2.5) * size);
        ctx.lineTo(b.x + Math.cos(dir - 2.5) * size, b.y + Math.sin(dir - 2.5) * size);
      } else if (shape === 'ribbon') {
        ctx.moveTo(b.x, b.y);
        ctx.bezierCurveTo(b.x - b.vx * 2, b.y - b.vy * 2 + 5, b.x - b.vx * 4, b.y - b.vy * 4 - 5, b.x - b.vx * 5, b.y - b.vy * 5);
      } else if (shape === 'prism') {
        ctx.moveTo(b.x - size, b.y - size);
        ctx.lineTo(b.x + size, b.y - size);
        ctx.lineTo(b.x, b.y + size);
        ctx.lineTo(b.x - size, b.y - size);
      } else {
        ctx.moveTo(b.x + Math.cos(dir) * size * 1.5, b.y + Math.sin(dir) * size * 1.5);
        ctx.lineTo(b.x + Math.cos(dir + 2) * size * .5, b.y + Math.sin(dir + 2) * size * .5);
        ctx.lineTo(b.x + Math.cos(dir - 2) * size * .5, b.y + Math.sin(dir - 2) * size * .5);
      }
    }
    if (shape === 'grain') ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = glow.ring;
    ctx.arc(predator.x, predator.y, 6, 0, Math.PI * 2);
    ctx.fill();
    frame++;
  }

  canvas.addEventListener('pointermove', event => {
    const box = canvas.getBoundingClientRect();
    pointer = { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
  });
  canvas.addEventListener('pointerleave', () => { pointer = null; });

  /* ── Run loop: only while visible; a still frame for reduced motion ── */

  let visible = true, raf = 0;
  function loop() {
    raf = 0;
    if (!visible || document.hidden || reduceMotion.matches || !ctx) return;
    draw();
    raf = requestAnimationFrame(loop);
  }
  function wake() { if (!raf) raf = requestAnimationFrame(loop); }

  // Reduced motion: no animation. Run the sketch forward silently and show the result.
  function settle() {
    if (!ctx) return;
    paintSky(1);
    for (let i = 0; i < 90; i++) draw();
  }

  function onChange(name) {
    if (ctx && name === 'plumage_glow') paintSky(1);   // new sky straight away, not a slow fade
    if (reduceMotion.matches) settle(); else wake();
  }

  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; wake(); }, { threshold: .05 }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) settle(); else wake(); });
  new ResizeObserver(() => { resize(); wake(); }).observe(canvas.parentElement);

  buildPrompt();
  VARS.forEach(buildKnob);
  render();
  resize();
  wake();
})();
