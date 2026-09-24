ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.05);
const beat = audio.beat;
const bass = audio.bass || 0;
const treble = audio.treble || 0;

const palettes = {
  tokyo_neon: {
    sky: [10, 12, 24],
    lights: ['#ff2a6d', '#05d9e8', '#f9c80e', '#7928ca', '#ff0055', '#4361ee'],
    glassTint: 'rgba(12, 14, 28, '
  },
  midnight_blue: {
    sky: [4, 8, 18],
    lights: ['#00b4d8', '#90e0ef', '#caf0f8', '#0077b6', '#48cae4', '#ffffff'],
    glassTint: 'rgba(5, 12, 25, '
  },
  amber_dusk: {
    sky: [20, 10, 8],
    lights: ['#ffaa00', '#ff5400', '#ffbd00', '#e07a5f', '#f4a261', '#ffd166'],
    glassTint: 'rgba(25, 14, 10, '
  },
  cyber_rain: {
    sky: [6, 16, 14],
    lights: ['#00ff87', '#60efff', '#00f5d4', '#0be881', '#05c46b', '#dff9fb'],
    glassTint: 'rgba(6, 20, 18, '
  }
};
const activePalette = palettes[getVar('city_mood')] || palettes.tokyo_neon;
const targetDropCount = getVar('rain_intensity') ?? 70;
const windDeg = getVar('wind_angle') ?? 2;
const wind = Math.tan(windDeg * Math.PI / 180);

const steamModes = { clear: 0.18, steamy: 0.42, frosted: 0.65 };
const steamAlpha = steamModes[getVar('glass_condensation')] ?? steamModes.steamy;

const BG_W = 480;
const BG_H = 270;
if (!room.state.bgCanvas) {
  room.state.bgCanvas = new OffscreenCanvas(BG_W, BG_H);
  room.state.bgCtx = room.state.bgCanvas.getContext('2d');
}
const bgCtx = room.state.bgCtx;

if (!room.state.cityLights) {
  room.state.cityLights = [];
  for (let i = 0; i < 45; i++) {
    room.state.cityLights.push({
      x: Math.random() * BG_W,
      y: BG_H * 0.25 + Math.random() * (BG_H * 0.7),
      r: 8 + Math.random() * 26,
      drift: 0.2 + Math.random() * 0.8,
      colorIdx: i,
      pulseSpeed: 0.5 + Math.random() * 2
    });
  }
}

if (!room.state.drops) {
  room.state.drops = [];
  for (let i = 0; i < 150; i++) {
    room.state.drops.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 2.5 + Math.random() * 4,
      vy: 0,
      slip: 0,
      active: i < targetDropCount,
      trailTimer: 0
    });
  }
}

for (let i = 0; i < room.state.drops.length; i++) {
  room.state.drops[i].active = i < targetDropCount;
}

if (!room.state.trailCanvas) {
  room.state.trailCanvas = new OffscreenCanvas(Math.floor(W * 0.5), Math.floor(H * 0.5));
  room.state.trailCtx = room.state.trailCanvas.getContext('2d');
  room.state.trailCtx.fillStyle = '#000000';
  room.state.trailCtx.fillRect(0, 0, room.state.trailCanvas.width, room.state.trailCanvas.height);
}
const trailCanvas = room.state.trailCanvas;
const trailCtx = room.state.trailCtx;
const tScaleX = trailCanvas.width / W;
const tScaleY = trailCanvas.height / H;

trailCtx.save();
trailCtx.fillStyle = 'rgba(0, 0, 0, 0.012)';
trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
trailCtx.restore();

const [skyR, skyG, skyB] = activePalette.sky;
bgCtx.fillStyle = `rgb(${skyR}, ${skyG}, ${skyB})`;
bgCtx.fillRect(0, 0, BG_W, BG_H);

bgCtx.save();
bgCtx.globalCompositeOperation = 'screen';
const lights = room.state.cityLights;
const lightColors = activePalette.lights;
const numLights = lights.length;

for (let i = 0; i < numLights; i++) {
  const l = lights[i];
  const lx = (l.x + Math.sin(t * 0.2 * l.drift + i) * 6 + BG_W) % BG_W;
  const ly = l.y + Math.cos(t * 0.15 * l.drift + i) * 3;
  const beatBump = beat ? 1.35 : 1.0;
  const pulse = (0.75 + 0.25 * Math.sin(t * l.pulseSpeed + i)) * (1 + bass * 0.6) * beatBump;
  const lr = l.r * pulse;
  const col = lightColors[l.colorIdx % lightColors.length];

  const g = bgCtx.createRadialGradient(lx, ly, lr * 0.1, lx, ly, lr);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, col);
  g.addColorStop(0.8, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  bgCtx.fillStyle = g;
  bgCtx.beginPath();
  bgCtx.arc(lx, ly, lr, 0, Math.PI * 2);
  bgCtx.fill();
}

if (room.people && room.people.length > 0) {
  for (let pIdx = 0; pIdx < room.people.length; pIdx++) {
    const p = room.people[pIdx];
    const px = ((pIdx + 1) * (BG_W / (room.people.length + 1)) + Math.sin(t * 0.3 + pIdx) * 10) % BG_W;
    const py = BG_H * 0.6 + Math.cos(t * 0.25 + pIdx) * 18;
    const pr = 18 + 8 * Math.sin(t + pIdx);
    const g = bgCtx.createRadialGradient(px, py, 2, px, py, pr);
    g.addColorStop(0, `hsla(${p.hue}, 100%, 80%, 1)`);
    g.addColorStop(0.5, `hsla(${p.hue}, 90%, 55%, 0.8)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    bgCtx.fillStyle = g;
    bgCtx.beginPath();
    bgCtx.arc(px, py, pr, 0, Math.PI * 2);
    bgCtx.fill();
  }
}
bgCtx.restore();

ctx.drawImage(room.state.bgCanvas, 0, 0, W, H);

ctx.save();
ctx.globalCompositeOperation = 'screen';
ctx.globalAlpha = 0.25 + bass * 0.15;
ctx.filter = 'blur(16px)';
ctx.drawImage(room.state.bgCanvas, 0, 0, W, H);
ctx.restore();

ctx.fillStyle = activePalette.glassTint + steamAlpha + ')';
ctx.fillRect(0, 0, W, H);

ctx.save();
ctx.globalCompositeOperation = 'screen';
ctx.globalAlpha = 0.55;
ctx.drawImage(trailCanvas, 0, 0, W, H);
ctx.restore();

const drops = room.state.drops;
const activeCount = Math.min(targetDropCount, drops.length);

for (let i = 0; i < activeCount; i++) {
  const d = drops[i];
  if (!d.active) continue;

  const threshold = 5.2 - (d.r * 0.35);
  if (beat) d.slip += 0.35 * (d.r / 4);
  if (treble > 0.45 && Math.random() < 0.1) d.slip += 0.2;

  d.slip += (d.r > threshold ? 0.05 : -0.012);
  if (d.slip < 0) d.slip = 0;

  if (d.slip > 0.1) {
    d.vy += (d.r * 2.8 + bass * 15) * dt;
    d.vy = Math.min(d.vy, 450);
  } else {
    d.vy *= 0.82;
  }

  const prevX = d.x;
  const prevY = d.y;

  d.y += d.vy * dt;
  d.x += d.vy * dt * wind * 0.6;

  if (d.vy > 25) {
    trailCtx.beginPath();
    trailCtx.strokeStyle = 'rgba(210, 235, 255, 0.4)';
    trailCtx.lineWidth = Math.max(1, d.r * tScaleX * 0.65);
    trailCtx.lineCap = 'round';
    trailCtx.moveTo(prevX * tScaleX, prevY * tScaleY);
    trailCtx.lineTo(d.x * tScaleX, d.y * tScaleY);
    trailCtx.stroke();

    d.r = Math.max(1.8, d.r - 0.0035 * d.vy * dt);
  }

  if (d.y - d.r > H || d.x < -30 || d.x > W + 30) {
    d.y = -d.r - Math.random() * 40;
    d.x = Math.random() * W;
    d.r = 2.5 + Math.random() * 4.5;
    d.vy = 0;
    d.slip = 0;
  }

  for (let j = i + 1; j < activeCount; j++) {
    const other = drops[j];
    if (!other.active) continue;
    const dx = other.x - d.x;
    const dy = other.y - d.y;
    const distSq = dx * dx + dy * dy;
    const touchDist = d.r + other.r;
    if (distSq < touchDist * touchDist) {
      const newArea = d.r * d.r + other.r * other.r;
      d.r = Math.min(18, Math.sqrt(newArea));
      d.slip += 0.45;
      d.vy += other.vy * 0.5;
      other.y = -other.r - Math.random() * 60;
      other.x = Math.random() * W;
      other.r = 2.2 + Math.random() * 3.5;
      other.vy = 0;
      other.slip = 0;
    }
  }
}

for (let i = 0; i < activeCount; i++) {
  const d = drops[i];
  if (!d.active) continue;

  const sx = (d.x / W) * (BG_W - 20) + 10;
  const sy = (d.y / H) * (BG_H - 20) + 10;
  const sw = Math.max(8, d.r * 2.8);
  const sh = Math.max(8, d.r * 2.8);

  ctx.save();
  ctx.beginPath();
  const stretch = Math.min(1.4, 1 + d.vy * 0.0018);
  ctx.ellipse(d.x, d.y, d.r, d.r * stretch, 0, 0, Math.PI * 2);
  ctx.clip();

  ctx.drawImage(
    room.state.bgCanvas,
    Math.max(0, sx - sw * 0.5),
    Math.max(0, sy - sh * 0.5),
    sw,
    sh,
    d.x - d.r,
    d.y + d.r * stretch,
    d.r * 2,
    -d.r * 2 * stretch
  );

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(10, 10, 20, 0.65)';
  ctx.lineWidth = 1.4;
  ctx.arc(d.x, d.y, d.r * 0.95, -0.4 * Math.PI, 0.6 * Math.PI);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.1;
  ctx.arc(d.x, d.y, d.r * 0.88, 0.7 * Math.PI, 1.4 * Math.PI);
  ctx.stroke();

  ctx.restore();

  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.arc(d.x - d.r * 0.35, d.y - d.r * 0.35 * stretch, Math.max(0.9, d.r * 0.18), 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();