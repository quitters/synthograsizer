// CRACKTRO -- the crack intro: starfield, copper bars, a bouncing chrome logo
// and a sine scroller. The scroller greets the ACTUAL people in the room, the
// way groups sent greetings to each other; anyone can shout out, and their
// message jumps the queue in their own colour.
//
// The scroller is a stream, not a looping string: characters leave on the
// left, new ones are appended on the right, and shouts are appended before the
// next line of the greeting. That's why someone joining mid-scroll never makes
// the text jump.
const S = room.state;
const W = frame.width, H = frame.height;
const dt = Math.min(frame.dt, 0.1);
const t = frame.t;

const clean = (s) => String(s ?? '').replace(/^table-/i, '').toUpperCase().slice(0, 24);

// Shouts jump the queue. Bounded, so a room mashing the button can't grow it forever.
S.shouts ??= [];
for (const e of room.events) {
  if (e.name !== 'shout') continue;
  const who = room.people.find((p) => p.id === e.participantId);
  const text = ` *** ${clean(e.table) || 'SOMEONE'} SAYS HI! *** `;
  if (S.shouts.length < 240) for (const c of text) S.shouts.push({ c, hue: who ? who.hue : 55 });
}

ctx.save();

// 1. Starfield: three layers of parallax.
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, W, H);
S.stars ??= Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), l: (Math.random() * 3) | 0 }));
const starSize = Math.max(1, Math.min(W, H) / 360);
for (let layer = 0; layer < 3; layer++) {
  ctx.fillStyle = ['#555566', '#9999aa', '#ffffff'][layer];
  ctx.beginPath();
  for (const s of S.stars) {
    if (s.l !== layer) continue;
    s.x -= dt * (0.03 + layer * 0.06);
    if (s.x < 0) { s.x += 1; s.y = Math.random(); }
    ctx.rect(s.x * W, s.y * H, starSize * (layer + 1) * 0.7, starSize * (layer + 1) * 0.7);
  }
  ctx.fill();
}

// 2. Copper bars in the band behind the logo.
const BARS = {
  amiga:  ['#ff2b2b', '#ffe600', '#00e5ff', '#a64dff', '#39e639'],
  sunset: ['#ff2e88', '#ff6a3d', '#ffd166', '#c86bfa'],
  ice:    ['#1f6fe0', '#5ec8ff', '#c9f3ff', '#0a2a6b'],
};
const barColours = BARS[getVar('bars') ?? 'amiga'] ?? BARS.amiga;
const bandMid = H * 0.33, bandAmp = H * 0.16, barH = H * 0.05;
const bars = barColours.map((colour, i) => {
  const ph = t * 1.6 + i * 0.9;
  return { y: bandMid + Math.sin(ph) * bandAmp, depth: Math.cos(ph), colour };
}).sort((a, b) => a.depth - b.depth);
for (const bar of bars) {
  const g = ctx.createLinearGradient(0, bar.y - barH / 2, 0, bar.y + barH / 2);
  g.addColorStop(0, '#000000');
  g.addColorStop(0.3, bar.colour);
  g.addColorStop(0.5, '#ffffff');
  g.addColorStop(0.7, bar.colour);
  g.addColorStop(1, '#000000');
  ctx.globalAlpha = 0.5 + 0.5 * (bar.depth + 1) / 2;
  ctx.fillStyle = g;
  ctx.fillRect(0, bar.y - barH / 2, W, barH);
}
ctx.globalAlpha = 1;

// 3. The logo: each letter bobs on its own phase of one sine.
const LOGO = 'THE COMMONS';
const logoSize = Math.max(10, Math.round(Math.min(W * 0.1, H * 0.19)));
const logoFont = `900 ${logoSize}px Impact, "Arial Black", sans-serif`;
ctx.font = logoFont;
ctx.textBaseline = 'middle';
ctx.textAlign = 'left';
if (S.logoFont !== logoFont) {
  S.logoX = [];
  let x = 0;
  for (const ch of LOGO) { S.logoX.push(x); x += ctx.measureText(ch).width; }
  S.logoW = x;
  S.logoFont = logoFont;
}
const logoY = H * 0.33 + Math.sin(t * 1.3) * H * 0.03;
const logoLeft = (W - S.logoW) / 2;
const style = getVar('logo_style') ?? 'chrome';
let metal = null;
if (style !== 'rainbow') {
  metal = ctx.createLinearGradient(0, logoY - logoSize / 2, 0, logoY + logoSize / 2);
  const stops = style === 'gold'
    ? ['#fff6c0', '#f5b700', '#6b3a00', '#ffd24a', '#fff6c0']
    : ['#ffffff', '#9ad0ff', '#12305a', '#cfeaff', '#ffffff'];
  [0, 0.45, 0.5, 0.72, 1].forEach((p, i) => metal.addColorStop(p, stops[i]));
}
for (let i = 0; i < LOGO.length; i++) {
  const ch = LOGO[i];
  if (ch === ' ') continue;
  const x = logoLeft + S.logoX[i];
  const y = logoY + Math.sin(t * 2.2 + i * 0.45) * logoSize * 0.12;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillText(ch, x + logoSize * 0.05, y + logoSize * 0.05);
  ctx.fillStyle = metal ?? `hsl(${(i * 32 + t * 120) % 360}, 100%, 62%)`;
  ctx.fillText(ch, x, y);
}

// 4. The sine scroller.
const fs = Math.max(8, Math.round(H * 0.085));
const font = `bold ${fs}px "Courier New", Courier, monospace`;
ctx.font = font;
if (S.font !== font) { S.cw = ctx.measureText('M').width || fs * 0.6; S.font = font; }
const cw = S.cw;
S.line ??= [];
S.queue ??= [];
S.x ??= W;

function greeting() {
  const names = room.people.map((p) => clean(p.table)).filter(Boolean);
  const greets = names.length
    ? `GREETINGS TO ${names.join(', ')} ... `
    : 'GREETINGS TO EVERYONE WHO SCANS THE CODE ... ';
  return `WELCOME TO THE COMMONS ... ${greets}GRAB A PHONE, TAKE A CONTROL, SHAPE THE WALL ... `
    + 'ONE CANVAS, MANY HANDS ...        ';
}

S.x -= (getVar('scroll_speed') ?? 1.6) * dt * fs * 4.5;
while (S.line.length && S.x + cw < 0) { S.line.shift(); S.x += cw; }
while (S.x + S.line.length * cw < W + cw) {
  if (S.shouts.length) S.line.push(S.shouts.shift());
  else {
    if (!S.queue.length) for (const c of greeting()) S.queue.push({ c, hue: null });
    S.line.push(S.queue.shift());
  }
}

const baseY = H * 0.8;
const amp = (getVar('wave_height') ?? 0.5) * H * 0.07;
for (let i = 0; i < S.line.length; i++) {
  const x = S.x + i * cw;
  if (x < -cw || x > W) continue;
  const ch = S.line[i];
  const y = baseY + Math.sin((x / W) * 12 + t * 3) * amp;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillText(ch.c, x + 2, y + 2);
  ctx.fillStyle = ch.hue === null
    ? `hsl(${((x / W) * 300 + t * 90) % 360}, 100%, 66%)`
    : `hsl(${ch.hue}, 100%, 72%)`;
  ctx.fillText(ch.c, x, y);
}

ctx.restore();
