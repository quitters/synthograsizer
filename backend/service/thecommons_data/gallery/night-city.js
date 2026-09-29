// NIGHT CITY -- rebuilt from the Synthograsizer template "urban-skyline".
// The original read the whole screen back with get() every frame for its
// reflection, redrew about a thousand windows one by one, and never actually
// moved. Here the sky and two layers of buildings are painted once into
// offscreen strips; each frame they scroll at different speeds, a handful
// of windows flicker in place, and the harbour mirrors the city the way
// demos did: the scene copied back upside down in 4-pixel strips, each
// nudged sideways by a sine. Everyone in the room has a window lit in
// their own colour.
const S = room.state;
const W = Math.floor(frame.width), H = Math.floor(frame.height);
const dt = Math.min(frame.dt, 0.1);
const unit = Math.min(W, H) / 540;

const SKIES = {   // sky top, sky bottom, far blocks, near blocks, windows, water
  twilight: ['#2a1a4a', '#7a4474', '#2c2a48', '#15152a', '#ffd27a', '#120d22', true],
  midnight: ['#03081a', '#1a2750', '#151b33', '#090d1b', '#a8d4ff', '#030716', true],
  neon: ['#10001c', '#48004e', '#211033', '#0e0818', '#ff4fd8', '#0a0212', true],
  dawn: ['#f08a5a', '#ffd6a8', '#5c4a5c', '#2e2632', '#fff0b0', '#382836', false],
  sunset: ['#ff6a3a', '#7a2a5a', '#4a2a40', '#24141e', '#ffc070', '#2a1020', false],
};
const DENSITY = { sparse: 1.6, medium: 1, dense: 0.66 };

const timeName = getVar('time') ?? 'twilight';
const sky = SKIES[timeName] ?? SKIES.twilight;
const weather = getVar('weather') ?? 'clear';
const skyline = getVar('skyline') ?? 'medium';
const drift = getVar('drift') ?? 0.5;
const ripple = getVar('ripple') ?? 0.4;
const horizon = Math.round(H * 0.66);
const stripW = W * 2;

function canvas(w, h) {
  return typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
}

// Buildings along a strip twice the screen's width, so it can wrap. Windows
// are remembered, so they can flicker, and so each person can have one.
function buildings(target, far) {
  const g = target.getContext('2d');
  g.clearRect(0, 0, stripW, horizon);
  const gap = (far ? 46 : 34) * unit * (DENSITY[skyline] ?? 1);
  const wins = [];
  for (let x = 0; x < stripW - gap * 0.5;) {
    const w = gap * (0.7 + Math.random() * 0.9);
    const h = horizon * (far ? 0.18 + Math.random() * 0.3 : 0.14 + Math.random() * Math.random() * 0.55);
    const top = horizon - h;
    g.fillStyle = sky[far ? 2 : 3];
    g.fillRect(x, top, w, h);
    if (!far && Math.random() < 0.3) g.fillRect(x + w * 0.45, top - 22 * unit, 2 * unit, 22 * unit);   // an antenna
    const ww = 3.5 * unit, wh = 5 * unit, sx = 9 * unit, sy = 12 * unit;
    for (let y = top + 8 * unit; y < horizon - wh * 2; y += sy) {
      for (let wx = x + 5 * unit; wx < x + w - ww - 3 * unit; wx += sx) {
        wins.push(wx, y, ww, wh);
        if (Math.random() < 0.62) {
          g.globalAlpha = far ? 0.45 : 0.9;
          g.fillStyle = sky[4];
          g.fillRect(wx, y, ww, wh);
          g.globalAlpha = 1;
        }
      }
    }
    x += w + Math.random() * 4 * unit;
  }
  return new Float32Array(wins);
}

const key = [timeName, weather, skyline, W, H].join('|');
if (S.key !== key) {
  S.key = key;
  S.scene = canvas(W, horizon);
  S.sky = canvas(W, horizon);
  const g = S.sky.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, sky[0]);
  grad.addColorStop(1, sky[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, horizon);
  if (sky[6] && weather !== 'foggy' && weather !== 'rainy') {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 140; i++) {
      g.globalAlpha = 0.25 + Math.random() * 0.6;
      const s = (0.6 + Math.random() * 1.6) * unit;
      g.fillRect(Math.random() * W, Math.random() * horizon * 0.7, s, s);
    }
    // A crescent: a bright disc with a sky-coloured one laid over it.
    g.globalAlpha = 1;
    const mx = W * 0.78, my = horizon * 0.22, mr = 26 * unit;
    g.fillStyle = '#f4f0dc';
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.fillStyle = sky[0];
    g.beginPath(); g.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.9, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  S.far = canvas(stripW, horizon); S.near = canvas(stripW, horizon);
  S.farWins = buildings(S.far, true);
  S.nearWins = buildings(S.near, false);
  S.scrollFar = S.scrollFar ?? 0; S.scrollNear = S.scrollNear ?? 0;
  S.twinkle = new Float32Array(60);
  for (let i = 0; i < 60; i += 3) { S.twinkle[i] = Math.random() * W; S.twinkle[i + 1] = Math.random() * horizon * 0.6; S.twinkle[i + 2] = Math.random() * 6.28; }
  S.rain = new Float32Array(360);
  for (let i = 0; i < 360; i += 2) { S.rain[i] = Math.random() * W; S.rain[i + 1] = Math.random() * H; }
}
S.t = (S.t ?? 0) + dt;
S.scrollFar = (S.scrollFar + dt * drift * W * 0.012) % stripW;
S.scrollNear = (S.scrollNear + dt * drift * W * 0.04) % stripW;

// A few windows change each frame, painted straight into the strips -- and
// on the beat, a whole handful light up at once.
const flips = audio.beat ? 14 : 2;
for (let k = 0; k < flips; k++) {
  const far = Math.random() < 0.35, wins = far ? S.farWins : S.nearWins;
  if (!wins.length) continue;
  const i = Math.floor(Math.random() * (wins.length / 4)) * 4;
  const g = (far ? S.far : S.near).getContext('2d');
  const on = audio.beat || Math.random() < 0.55;
  g.fillStyle = on ? sky[4] : sky[far ? 2 : 3];
  g.globalAlpha = on ? (far ? 0.45 : 0.9) : 1;
  g.fillRect(wins[i], wins[i + 1], wins[i + 2], wins[i + 3]);
  g.globalAlpha = 1;
}

// Compose the city above the waterline.
const sc = S.scene.getContext('2d');
sc.globalAlpha = 1;
sc.drawImage(S.sky, 0, 0);
for (const [strip, scroll] of [[S.far, S.scrollFar], [S.near, S.scrollNear]]) {
  const x = -Math.floor(scroll);
  sc.drawImage(strip, x, 0);
  sc.drawImage(strip, x + stripW, 0);
}
// Everyone in the room has a window in their own colour.
const wins = S.nearWins, n = wins.length / 4;
for (const p of (room.people || []).slice(0, 48)) {
  let h = 0;
  for (let c = 0; c < p.id.length; c++) h = (h * 31 + p.id.charCodeAt(c)) >>> 0;
  if (!n) break;
  const i = (h % n) * 4;
  let x = wins[i] - S.scrollNear;
  if (x < -wins[i + 2]) x += stripW;
  if (x > W) continue;
  sc.fillStyle = `hsl(${p.hue} 90% 64%)`;
  sc.fillRect(x - unit, wins[i + 1] - unit, wins[i + 2] + 2 * unit, wins[i + 3] + 2 * unit);
}
// Twinkling stars, on clear nights.
if (sky[6] && weather !== 'foggy' && weather !== 'rainy') {
  sc.fillStyle = '#ffffff';
  for (let i = 0; i < S.twinkle.length; i += 3) {
    sc.globalAlpha = 0.5 + 0.5 * Math.sin(S.t * 2 + S.twinkle[i + 2]);
    sc.fillRect(S.twinkle[i], S.twinkle[i + 1], 2 * unit, 2 * unit);
  }
  sc.globalAlpha = 1;
}

ctx.save();
ctx.drawImage(S.scene, 0, 0);
// The harbour: the city again, upside down, in rippling 4px strips.
ctx.fillStyle = sky[5];
ctx.fillRect(0, horizon, W, H - horizon);
const band = Math.max(2, Math.round(4 * unit / 2));
const amp = (4 + ripple * 26) * unit * (1 + audio.bass * 0.5);
ctx.globalAlpha = 0.6;
for (let y = horizon; y < H; y += band) {
  const depth = (y - horizon) / (H - horizon);
  const src = horizon - (y - horizon) - band;
  if (src < 0) break;
  const off = Math.sin(y * 0.09 / unit + S.t * 2.4) * amp * depth;
  ctx.drawImage(S.scene, 0, src, W, band, off, y, W, band);
}
ctx.globalAlpha = 1;
if (weather === 'foggy') {
  const fog = ctx.createLinearGradient(0, horizon * 0.55, 0, H);
  fog.addColorStop(0, 'rgba(200, 200, 215, 0)');
  fog.addColorStop(0.5, 'rgba(200, 200, 215, 0.35)');
  fog.addColorStop(1, 'rgba(200, 200, 215, 0.1)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, W, H);
}
if (weather === 'rainy') {
  // A fixed pool of drops, all one path.
  const fall = H * 1.4 * dt, slant = W * 0.08 * dt;
  ctx.strokeStyle = 'rgba(190, 205, 230, 0.35)';
  ctx.lineWidth = unit;
  ctx.beginPath();
  for (let i = 0; i < S.rain.length; i += 2) {
    S.rain[i] = (S.rain[i] + slant + W) % W;
    S.rain[i + 1] += fall;
    if (S.rain[i + 1] > H) { S.rain[i + 1] -= H; S.rain[i] = Math.random() * W; }
    ctx.moveTo(S.rain[i], S.rain[i + 1]);
    ctx.lineTo(S.rain[i] - 4 * unit, S.rain[i + 1] - 16 * unit);
  }
  ctx.stroke();
}
ctx.restore();
