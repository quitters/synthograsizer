// COPPER BARS -- glowing horizontal bands weaving over each other, named for
// the Amiga's copper chip, which changed colours mid-scanline to draw them for
// free. Here each bar is a gradient, and bars are painted back to front by the
// phase of their bounce so they appear to pass behind one another.
const S = room.state;
const W = frame.width, H = frame.height;
const dt = Math.min(frame.dt, 0.1);

const PALETTES = {
  amiga:  ['#ff2b2b', '#ff8a00', '#ffe600', '#39e639', '#00e5ff', '#2f6bff', '#a64dff', '#ff3dcf'],
  sunset: ['#ff2e88', '#ff6a3d', '#ffb347', '#ffd166', '#c86bfa'],
  ice:    ['#0a2a6b', '#1f6fe0', '#5ec8ff', '#c9f3ff'],
  rgb:    ['#ff2424', '#24ff5a', '#2458ff'],
  gold:   ['#7a3d00', '#c98a1a', '#ffd35c', '#fff2b8'],
};
const colours = PALETTES[getVar('palette') ?? 'amiga'] ?? PALETTES.amiga;
const count = Math.round(getVar('bar_count') ?? 7);
const orientation = getVar('orientation') ?? 'horizontal';
S.t = (S.t ?? 0) + dt * (getVar('bounce') ?? 0.8) * (1 + audio.bass * 0.5);

// Background with faint scanlines, as on the CRT these were built for.
ctx.save();
ctx.fillStyle = '#05030c';
ctx.fillRect(0, 0, W, H);
if (!S.lines) {
  const c = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(4, 4)
    : Object.assign(document.createElement('canvas'), { width: 4, height: 4 });
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255, 255, 255, 0.05)';
  g.fillRect(0, 0, 4, 1);
  S.lines = ctx.createPattern(c, 'repeat');
}
if (S.lines) { ctx.fillStyle = S.lines; ctx.fillRect(0, 0, W, H); }

function drawBars(vertical) {
  const span = vertical ? W : H;
  const thick = (getVar('bar_height') ?? 36) * span / 400;
  const amp = span * 0.32 * (1 + audio.bass * 0.3);
  const bars = [];
  for (let i = 0; i < count; i++) {
    const phase = S.t * 1.7 + (i / count) * Math.PI * 2 * 0.85 + (vertical ? 1.3 : 0);
    bars.push({ pos: span / 2 + Math.sin(phase) * amp, depth: Math.cos(phase), colour: colours[i % colours.length] });
  }
  bars.sort((a, b) => a.depth - b.depth);   // bars at the back first
  for (const bar of bars) {
    const h = thick * (0.75 + 0.25 * (bar.depth + 1) / 2);
    const a = bar.pos - h / 2, b = bar.pos + h / 2;
    const grad = vertical ? ctx.createLinearGradient(a, 0, b, 0) : ctx.createLinearGradient(0, a, 0, b);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(0.3, bar.colour);
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(0.7, bar.colour);
    grad.addColorStop(1, '#000000');
    ctx.globalAlpha = 0.55 + 0.45 * (bar.depth + 1) / 2;
    ctx.fillStyle = grad;
    if (vertical) ctx.fillRect(a, 0, h, H);
    else ctx.fillRect(0, a, W, h);
  }
  ctx.globalAlpha = 1;
}

if (orientation === 'vertical') drawBars(true);
else if (orientation === 'woven') {
  drawBars(false);
  ctx.globalCompositeOperation = 'lighter';
  drawBars(true);
} else drawBars(false);
ctx.restore();
