// FIRE -- the demo fire: seed random heat along the bottom, then every cell
// becomes the cooled average of the cells beneath it, so heat climbs and dies.
// It only works because the heat buffer PERSISTS between frames in room.state.
// Stoking is shared: anyone can fan the flames, and the sparks that fly are in
// the colour of whoever did.
const S = room.state;
const W = frame.width, H = frame.height;

const RES = { classic: 320, chunky: 160, fine: 480 };
const bw = Math.max(16, Math.min(RES[getVar('resolution')] ?? 320, Math.floor(W)));
const bh = Math.max(9, Math.round(bw * H / W));
if (S.bw !== bw || S.bh !== bh) {
  S.buf = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(bw, bh)
    : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
  S.bctx = S.buf.getContext('2d');
  S.img = S.bctx.createImageData(bw, bh);
  S.px = new Uint32Array(S.img.data.buffer);
  S.heat = new Uint8Array(bw * (bh + 2));   // two hidden rows of fuel at the bottom
  S.bw = bw; S.bh = bh;
}
if (!S.noise) {
  // A precomputed noise table: far cheaper than Math.random() per cell.
  S.noise = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) S.noise[i] = (Math.random() * 256) | 0;
  S.n = 0;
}

const PALETTES = {
  'classic fire': [[0, 0, 0, 0], [0.25, 110, 0, 0], [0.45, 230, 50, 0], [0.65, 255, 160, 0], [0.85, 255, 240, 90], [1, 255, 255, 255]],
  'blue flame':   [[0, 0, 0, 0], [0.3, 0, 0, 110], [0.55, 20, 80, 255], [0.8, 120, 220, 255], [1, 255, 255, 255]],
  toxic:          [[0, 0, 0, 0], [0.3, 0, 70, 0], [0.55, 60, 200, 0], [0.8, 200, 255, 40], [1, 255, 255, 220]],
  magma:          [[0, 0, 0, 0], [0.3, 70, 0, 90], [0.55, 200, 0, 40], [0.8, 255, 120, 0], [1, 255, 230, 120]],
  ghost:          [[0, 0, 0, 0], [0.4, 0, 40, 50], [0.7, 80, 200, 200], [1, 230, 255, 255]],
};
const palName = getVar('palette') ?? 'classic fire';
if (S.palKey !== palName) {
  const stops = PALETTES[palName] ?? PALETTES['classic fire'];
  S.pal = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    let k = 0;
    while (k < stops.length - 2 && p > stops[k + 1][0]) k++;
    const a = stops[k], b = stops[k + 1];
    const f = Math.min(1, Math.max(0, (p - a[0]) / ((b[0] - a[0]) || 1)));
    S.pal[i] = (0xff000000 | ((a[3] + (b[3] - a[3]) * f) << 16)
      | ((a[2] + (b[2] - a[2]) * f) << 8) | (a[1] + (b[1] - a[1]) * f)) >>> 0;
  }
  S.palKey = palName;
}

const hb = bh + 2, heat = S.heat, noise = S.noise;
S.flare = S.flare ?? 0;
S.sparks ??= [];
for (const e of room.events) {
  if (e.name !== 'stoke') continue;
  const who = room.people.find((p) => p.id === e.participantId);
  const hue = who ? who.hue : Math.random() * 360;
  // Each person stokes their own patch of the fire, placed by their hue.
  const col = Math.max(4, Math.min(bw - 5, Math.round((hue / 360) * bw)));
  const half = Math.max(3, (bw * 0.05) | 0);
  for (let y = hb - 10; y < hb - 2; y++) {
    for (let x = col - half; x <= col + half; x++) if (x > 0 && x < bw - 1) heat[y * bw + x] = 255;
  }
  S.flare = Math.min(2, S.flare + 0.7);
  for (let i = 0; i < 24 && S.sparks.length < 300; i++) {
    S.sparks.push({ x: col / bw, y: 0.92, vx: (Math.random() - 0.5) * 0.25, vy: -0.4 - Math.random() * 0.5,
                    life: 1, hue });
  }
}
if (audio.beat) S.flare = Math.min(2, S.flare + 0.25);

const fuel = Math.min(1, (getVar('fuel') ?? 0.75) + S.flare * 0.2);
const height = Math.min(1.3, (getVar('flame_height') ?? 0.6) + S.flare * 0.15);
const decay = 255 / (height * bh);
const di = decay | 0, df = ((decay - di) * 255) | 0;
const wind = getVar('wind') ?? 0;
const windByte = Math.abs(wind) * 255, windDir = wind < 0 ? -1 : 1;

function step() {
  let n = S.n;
  // Seed the two hidden rows with fresh fuel.
  for (let r = hb - 2; r < hb; r++) {
    const row = r * bw;
    for (let x = 0; x < bw; x++) heat[row + x] = noise[(n++) & 4095] < fuel * 255 ? 255 : noise[(n++) & 4095] >> 2;
  }
  // Every cell becomes the cooled average of the cells below it.
  for (let y = 0; y < hb - 2; y++) {
    const row = y * bw, r1 = row + bw, r2 = r1 + bw;
    const shift = noise[(n++) & 4095] < windByte ? windDir : 0;
    for (let x = 0; x < bw; x++) {
      let sx = x - shift;
      if (sx < 1) sx = 1; else if (sx > bw - 2) sx = bw - 2;
      const v = ((heat[r1 + sx - 1] + heat[r1 + sx] + heat[r1 + sx + 1] + heat[r2 + sx]) >> 2)
        - di - (noise[(n++) & 4095] < df ? 1 : 0);
      heat[row + x] = v > 0 ? v : 0;
    }
  }
  S.n = n & 4095;
}

// Step at a fixed 60Hz so a 144Hz wall doesn't burn twice as fast.
S.acc = (S.acc ?? 0) + Math.min(frame.dt, 0.1);
let steps = 0;
while (S.acc >= 1 / 60 && steps < 4) { step(); S.acc -= 1 / 60; steps++; }
if (S.acc > 0.1) S.acc = 0;
S.flare = Math.max(0, S.flare - Math.min(frame.dt, 0.1) * 0.8);

const px = S.px, pal = S.pal, visible = bw * bh;
for (let i = 0; i < visible; i++) px[i] = pal[heat[i]];
S.bctx.putImageData(S.img, 0, 0);
ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.buf, 0, 0, W, H);

// Sparks from whoever stoked, drifting with the wind.
const dt = Math.min(frame.dt, 0.1);
const size = Math.max(2, Math.min(W, H) / 150);
S.sparks = S.sparks.filter((s) => (s.life -= dt * 0.9) > 0);
for (const s of S.sparks) {
  s.vx += wind * dt * 0.3;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  ctx.globalAlpha = s.life;
  ctx.fillStyle = `hsl(${s.hue}, 100%, 65%)`;
  ctx.fillRect(s.x * W, s.y * H, size, size);
}
ctx.restore();
