const GW = 240;
const GH = 135;
const GW_MUL = GW / frame.width;
const GH_MUL = GH / frame.height;

const palettes = {
  raw_terracotta: {
    bg: 'rgba(26, 22, 20, 0.03)',
    clear: '#1a1614',
    colors: ['#d96b43', '#e8a858', '#9e6d50', '#d8c2a7', '#5f634f']
  },
  parchment_ink: {
    bg: 'rgba(242, 237, 226, 0.03)',
    clear: '#f2ede2',
    colors: ['#2b2623', '#684d3c', '#8a5c3c', '#a28362', '#4b4841']
  },
  mineral_slate: {
    bg: 'rgba(18, 23, 25, 0.03)',
    clear: '#121719',
    colors: ['#4d888a', '#c8a469', '#8e5449', '#d0d4cb', '#697f6c']
  }
};

const palKey = getVar('palette') ?? 'raw_terracotta';
const pal = palettes[palKey] ?? palettes.raw_terracotta;
const scale = getVar('field_scale') ?? 0.003;
const drift = getVar('flow_speed') ?? 0.4;
const targetTracers = Math.min(400, Math.floor(getVar('stroke_density') ?? 250));
const decay = Math.floor(getVar('decay_rate') ?? 2);

room.state.grid ??= new Uint8Array(GW * GH);
room.state.tracers ??= [];
room.state.lastPal ??= palKey;

const grid = room.state.grid;
const tracers = room.state.tracers;

ctx.save();

if (!room.state.init || room.state.lastPal !== palKey) {
  room.state.init = true;
  room.state.lastPal = palKey;
  grid.fill(0);
  ctx.fillStyle = pal.clear;
  ctx.fillRect(0, 0, frame.width, frame.height);
  tracers.length = 0;
  for (let i = 0; i < 400; i++) {
    tracers.push({
      x: Math.random() * frame.width,
      y: Math.random() * frame.height,
      life: Math.floor(Math.random() * 80),
      col: Math.floor(Math.random() * pal.colors.length),
      w: 1.2 + Math.random() * 1.8
    });
  }
} else {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, frame.width, frame.height);
}

for (let i = 0; i < 32400; i++) {
  if (grid[i] > 0) {
    grid[i] = grid[i] > decay ? grid[i] - decay : 0;
  }
}

const bassBoost = audio.bass * 1.8;
const tFlow = frame.t * drift;
const stepDist = 3.0 + bassBoost * 1.5;

ctx.lineCap = 'round';

for (let i = 0; i < targetTracers; i++) {
  const p = tracers[i];
  if (!p) continue;

  if (p.life <= 0) {
    let rx = Math.random() * frame.width;
    let ry = Math.random() * frame.height;
    let gx = Math.floor(rx * GW_MUL);
    let gy = Math.floor(ry * GH_MUL);
    let tries = 0;
    while (tries < 3 && (gx < 2 || gx >= GW - 2 || gy < 2 || gy >= GH - 2 || grid[gy * GW + gx] > 30)) {
      rx = Math.random() * frame.width;
      ry = Math.random() * frame.height;
      gx = Math.floor(rx * GW_MUL);
      gy = Math.floor(ry * GH_MUL);
      tries++;
    }
    p.x = rx;
    p.y = ry;
    p.life = 35 + Math.floor(Math.random() * 85);
    p.w = 1.0 + Math.random() * 1.8 + audio.treble * 1.2;
    if (room.people && room.people.length > 0 && Math.random() < 0.25) {
      const person = room.people[Math.floor(Math.random() * room.people.length)];
      p.colorStr = `hsl(${person.hue}, 38%, 52%)`;
    } else {
      p.colorStr = pal.colors[Math.floor(Math.random() * pal.colors.length)];
    }
    continue;
  }

  const x = p.x;
  const y = p.y;

  const n1 = Math.sin(x * scale + tFlow) * 2.2;
  const n2 = Math.cos(y * scale - tFlow * 0.7) * 2.2;
  const n3 = Math.sin((x + y) * scale * 0.8 + bassBoost) * 1.4;
  const angle = n1 + n2 + n3;

  const nx = x + Math.cos(angle) * stepDist;
  const ny = y + Math.sin(angle) * stepDist;

  const gx = Math.floor(nx * GW_MUL);
  const gy = Math.floor(ny * GH_MUL);

  if (gx < 2 || gx >= GW - 2 || gy < 2 || gy >= GH - 2) {
    p.life = 0;
    continue;
  }

  const idx = gy * GW + gx;
  if (grid[idx] > 20) {
    p.life = 0;
    continue;
  }

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(nx, ny);
  ctx.strokeStyle = p.colorStr;
  ctx.lineWidth = p.w;
  ctx.stroke();

  grid[idx] = 255;
  grid[idx - 1] = Math.max(grid[idx - 1], 180);
  grid[idx + 1] = Math.max(grid[idx + 1], 180);
  grid[idx - GW] = Math.max(grid[idx - GW], 180);
  grid[idx + GW] = Math.max(grid[idx + GW], 180);

  p.x = nx;
  p.y = ny;
  p.life--;
}

ctx.restore();