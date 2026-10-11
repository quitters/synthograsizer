/* Landing page: the Commons illustration.
 *
 * One tiny stage that cycles through the three surfaces of a Commons room:
 *   1. the wall    (the piece, big, with a join code)
 *   2. a phone     (a few controls each; turn one and the wall answers)
 *   3. the desk    (the host's side: invite, who is steering, remix)
 *
 * It is an illustration, not the product: a single ribbon canvas (~4.6k line segments a frame,
 * capped at 30 fps) is shared by all three views, and three numbers (shape, colour, motion) drive
 * it. Those are moved by a quiet autopilot standing in for the other people in the room; touch
 * the phone's sliders and you take over for a few seconds. Nothing here talks to a server. */
(() => {
  'use strict';

  const root = document.getElementById('cd');
  const canvas = document.getElementById('commons-art');
  if (!root || !canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const VIEWS = ['wall', 'phone', 'desk'];
  const TITLES = { wall: 'THE WALL', phone: 'YOUR PHONE', desk: 'THE DESK' };
  const CAPTIONS = {
    wall: 'The piece runs on any screen. A code in the corner lets people scan in.',
    phone: 'Everyone gets a few controls. Turn one and the wall answers.',
    desk: 'The host picks the piece, invites people, and can remix it from a prompt.',
  };
  const titleEl = document.getElementById('cd-title');
  const captionEl = document.getElementById('cd-caption');
  const tabs = [...root.querySelectorAll('.cd-tab')];
  const playBtn = document.getElementById('cd-play');

  /* ── Shared state: three numbers, 0..1 ──────────────────────────── */

  const value = { shape: .42, color: .08, motion: .5 };
  const holdUntil = { color: 0, motion: 0 };   // the visitor's hand is on this slider until then
  const sliders = {
    shape: document.getElementById('cd-shape'),
    color: document.getElementById('cd-color'),
    motion: document.getElementById('cd-motion'),
  };
  const bars = {
    shape: document.getElementById('cd-bar-shape'),
    color: document.getElementById('cd-bar-color'),
    motion: document.getElementById('cd-bar-motion'),
  };
  const lastEl = document.getElementById('cd-last');

  // The other people in the room, as a gentle drift. Shape is always A's; colour and motion are B's
  // until the visitor reaches for them.
  const drift = t => ({
    shape: .5 + .4 * Math.sin(t * .23),
    color: .5 + .5 * Math.sin(t * .19 - 1.4),
    motion: .55 + .38 * Math.sin(t * .31 + 2),
  });

  /* ── The ribbons ────────────────────────────────────────────────── */

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  // Four palettes of three, drawn from the page (sage, ochre, teal, clay), lifted to read on dark.
  const PALETTES = [
    ['#9fbd86', '#d8a068', '#6fb3a8'],
    ['#e0924f', '#f2c08f', '#b9694a'],
    ['#6fb3a8', '#8fb0d8', '#b7d4a0'],
    ['#d8c17a', '#9fbd86', '#e0a56f'],
  ].map(p => p.map(hex));

  function colours(c) {
    const pos = Math.min(.999, Math.max(0, c)) * (PALETTES.length - 1);
    const i = Math.floor(pos), f = pos - i;
    return PALETTES[i].map((rgb, g) => rgb.map((v, k) => Math.round(v + (PALETTES[i + 1][g][k] - v) * f)));
  }

  const W = canvas.width, H = canvas.height;
  const LINES = 24, STEPS = 64;
  const ctx = canvas.getContext('2d');
  let phase = 0;

  function drawWall() {
    ctx.fillStyle = '#10150f';
    ctx.fillRect(0, 0, W, H);
    const freq = .8 + value.shape * 1.5;           // how many waves cross the wall
    const amp = .34 - value.shape * .1;            // and how tall they stand
    const spread = .2 + value.shape * .06;         // how far the ribbon fans out
    const cols = colours(value.color);
    ctx.lineWidth = 1.1;
    for (let g = 0; g < 3; g++) {
      ctx.beginPath();
      for (let line = 0; line < LINES; line++) {
        for (let s = 0; s <= STEPS; s++) {
          const t = s / STEPS;
          const env = Math.sin(t * Math.PI);
          const x = W * (.08 + .84 * t);
          const y = H * .52 + Math.sin(t * Math.PI * 2 * freq + g * .9 + line * .045 + phase) * H * amp * env
            + (line - LINES / 2) * H * spread / LINES;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = `rgba(${cols[g][0]},${cols[g][1]},${cols[g][2]},.72)`;
      ctx.stroke();
    }
  }

  /* ── QR-ish tiles: a seeded pattern, so it looks like a code without being one ── */

  document.querySelectorAll('[data-qr]').forEach(svg => {
    const N = 11;
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    // Three 3x3 finder rings (centre left empty), the rest noise.
    const corners = [[0, 0], [N - 3, 0], [0, N - 3]];
    let d = '';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = corners.find(([cx, cy]) => x >= cx && x < cx + 3 && y >= cy && y < cy + 3);
      const on = c ? !(x === c[0] + 1 && y === c[1] + 1) : rnd() > .52;
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
    svg.setAttribute('viewBox', `0 0 ${N} ${N}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.innerHTML = `<path d="${d}"/>`;
  });

  /* ── Frame loop ─────────────────────────────────────────────────── */

  let visible = true, raf = 0, last = 0, clock = 0, lastLog = 0;
  const snapshot = { ...value };

  function applyDom() {
    for (const k of ['shape', 'color', 'motion']) {
      if (document.activeElement !== sliders[k]) sliders[k].value = Math.round(value[k] * 100);
      bars[k].style.width = `${Math.round(value[k] * 100)}%`;
    }
  }

  function step(dt) {
    const now = performance.now();
    clock += dt;
    const target = drift(clock);
    for (const k of ['shape', 'color', 'motion']) {
      if (k !== 'shape' && now < holdUntil[k]) continue;     // the visitor is holding this one
      value[k] += (target[k] - value[k]) * Math.min(1, dt * 1.4);
    }
    phase += dt * (.05 + value.motion * 1.5);

    if (now - lastLog > 1400) {   // the desk's "who did what" line
      let name = null, delta = .1;
      for (const k of ['shape', 'color', 'motion']) {
        const d = Math.abs(value[k] - snapshot[k]);
        if (d > delta) { name = k; delta = d; }
      }
      if (name) {
        const who = name === 'shape' ? 'A' : (now < holdUntil[name] ? 'You' : 'B');
        lastEl.textContent = `${who} ${name === 'shape' ? 'moved' : 'turned'} ${name[0].toUpperCase()}${name.slice(1)}`;
        Object.assign(snapshot, value);
      }
      lastLog = now;
    }
  }

  function frame(ts) {
    raf = 0;
    if (!visible || document.hidden || reduceMotion.matches) return;
    raf = requestAnimationFrame(frame);
    if (ts - last < 33) return;                  // ~30 fps is plenty for slow ribbons
    const dt = Math.min(.1, (ts - last) / 1000 || .033);
    last = ts;
    step(dt);
    drawWall();
    applyDom();
  }
  const wake = () => { if (!raf && visible && !document.hidden && !reduceMotion.matches) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  // Reduced motion: no autopilot and no animation. The wall redraws only when someone moves a slider.
  function still() { drawWall(); applyDom(); }

  /* ── The visitor's hands on the phone ───────────────────────────── */

  for (const k of ['color', 'motion']) {
    sliders[k].addEventListener('input', () => {
      value[k] = sliders[k].value / 100;
      holdUntil[k] = performance.now() + 7000;
      stopCycling();
      if (reduceMotion.matches) still();
    });
  }

  /* ── Views and the auto-cycle ───────────────────────────────────── */

  let cycling = !reduceMotion.matches;
  let userPaused = false;

  function setView(view) {
    root.dataset.view = view;
    titleEl.textContent = TITLES[view];
    captionEl.textContent = CAPTIONS[view];
    tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.view === view)));
    // Restart the active tab's progress bar from empty.
    root.classList.remove('cd-restart');
    void root.offsetWidth;
    root.classList.add('cd-restart');
    if (reduceMotion.matches) still();
  }

  function syncPlayState() {
    root.dataset.cycling = String(cycling && !userPaused);
    playBtn.textContent = cycling && !userPaused ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', cycling && !userPaused ? 'Pause the tour' : 'Play the tour');
  }
  function stopCycling() { if (cycling) { cycling = false; syncPlayState(); } }

  tabs.forEach(tab => tab.addEventListener('click', () => { stopCycling(); setView(tab.dataset.view); }));
  playBtn.addEventListener('click', () => {
    if (!cycling) { cycling = true; userPaused = false; } else userPaused = !userPaused;
    syncPlayState();
  });
  // The progress bar's animation ending is what moves the tour on, so pausing it pauses the tour.
  root.addEventListener('animationend', event => {
    if (event.animationName !== 'cd-progress' || !cycling || userPaused) return;
    setView(VIEWS[(VIEWS.indexOf(root.dataset.view) + 1) % VIEWS.length]);
  });
  // Hovering or focusing inside the stage holds it still, so nobody loses a slider mid-turn.
  const hold = on => root.classList.toggle('cd-held', on);
  root.addEventListener('pointerenter', () => hold(true));
  root.addEventListener('pointerleave', () => hold(false));
  root.addEventListener('focusin', () => hold(true));
  root.addEventListener('focusout', () => hold(false));

  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    root.classList.toggle('cd-offscreen', !visible);
    wake();
  }, { threshold: .1 }).observe(root);
  document.addEventListener('visibilitychange', wake);
  reduceMotion.addEventListener('change', () => {
    cycling = !reduceMotion.matches; userPaused = false; syncPlayState();
    if (reduceMotion.matches) still(); else wake();
  });

  syncPlayState();
  setView('wall');
  drawWall();
  applyDom();
  wake();
})();
