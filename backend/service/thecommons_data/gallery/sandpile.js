ctx.save();

const GRID = 175;
const MID = (GRID >> 1);
const TOTAL = GRID * GRID;

// 1. One-time setup of fixed buffers in room.state
if (!room.state.grid || room.state.grid.length !== TOTAL) {
  room.state.grid = new Int32Array(TOTAL);
  room.state.next = new Int32Array(TOTAL);
  room.state.offscreen = new OffscreenCanvas(GRID, GRID);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(GRID, GRID);
  room.state.buf32 = new Uint32Array(room.state.imgData.data.buffer);
  room.state.avalanches = 0;
  room.state.flash = 0;
  // Seed initial stable heap
  room.state.grid[MID * GRID + MID] = 4000;
}

const g = room.state.grid;
const nxt = room.state.next;

// 2. Handle interactive triggers
for (const ev of room.events) {
  if (ev.name === 'clear_pile') {
    g.fill(0);
    g[MID * GRID + MID] = 2000;
    room.state.flash = 1.0;
  } else if (ev.name === 'drop_handful') {
    const p = room.people ? room.people.find(x => x.id === ev.participantId) : null;
    const bonus = 4000;
    if (p && p.hue !== undefined) {
      const ang = (p.hue / 180) * Math.PI;
      const rad = 18;
      const ox = Math.max(2, Math.min(GRID - 3, Math.round(MID + Math.cos(ang) * rad)));
      const oy = Math.max(2, Math.min(GRID - 3, Math.round(MID + Math.sin(ang) * rad)));
      g[oy * GRID + ox] += bonus;
    } else {
      g[MID * GRID + MID] += bonus;
    }
    room.state.flash = Math.min(1.0, room.state.flash + 0.4);
  }
}

// 3. Audio & knob controls
const dropRate = getVar('drop_rate') ?? 96;
const zoom = getVar('zoom') ?? 1.0;
const paletteName = getVar('palette') ?? 'zenith';
const symName = getVar('symmetry') ?? 'center';
const audioMode = getVar('audio_react') ?? 'avalanche';
const renderStyle = getVar('render_style') ?? 'crisp';

// Continuous grain drops
let dropAmount = dropRate;
if (audioMode === 'avalanche') {
  dropAmount += Math.floor((audio.bass || 0) * 320);
  if (audio.beat) dropAmount += 240;
}

if (symName === 'cross') {
  const d4 = Math.max(1, dropAmount >> 2);
  const o = 12;
  g[MID * GRID + MID] += d4;
  g[MID * GRID + (MID - o)] += d4;
  g[MID * GRID + (MID + o)] += d4;
  g[(MID - o) * GRID + MID] += d4;
  g[(MID + o) * GRID + MID] += d4;
} else if (symName === 'star') {
  const d8 = Math.max(1, dropAmount >> 3);
  const o = 14;
  g[MID * GRID + MID] += d8 * 2;
  g[(MID - o) * GRID + (MID - o)] += d8;
  g[(MID - o) * GRID + (MID + o)] += d8;
  g[(MID + o) * GRID + (MID - o)] += d8;
  g[(MID + o) * GRID + (MID + o)] += d8;
} else {
  g[MID * GRID + MID] += dropAmount;
}

// 4. Abelian Toppling Steps (Demoscene fixed iterations loop)
const TOpple_PASSES = 12;
let totalToppled = 0;
for (let pass = 0; pass < TOpple_PASSES; pass++) {
  let toppledInPass = 0;
  nxt.set(g);
  for (let y = 1; y < GRID - 1; y++) {
    const row = y * GRID;
    for (let x = 1; x < GRID - 1; x++) {
      const idx = row + x;
      const h = g[idx];
      if (h >= 4) {
        const topple = (h >> 2);
        const loss = topple << 2;
        nxt[idx] -= loss;
        nxt[idx - 1] += topple;
        nxt[idx + 1] += topple;
        nxt[idx - GRID] += topple;
        nxt[idx + GRID] += topple;
        toppledInPass += topple;
      }
    }
  }
  g.set(nxt);
  totalToppled += toppledInPass;
  if (toppledInPass === 0) break;
}

room.state.avalanches = (room.state.avalanches * 0.9) + (totalToppled * 0.001);
room.state.flash *= 0.92;

// 5. Palette Lookups (Little-endian ABGR 32-bit packed colors)
const PALETTES = {
  zenith: [0xFF180A06, 0xFF743B14, 0xFFDF9E21, 0xFFFBF4E8],
  ember:  [0xFF080608, 0xFF142484, 0xFF2278E6, 0xFF6BF8FD],
  veril:  [0xFF081208, 0xFF285418, 0xFF4EDB4E, 0xFFBEFFD0],
  amethyst:[0xFF140818, 0xFF4D1C68, 0xFF9E4ED8, 0xFFF2D8FB]
};
const lut = PALETTES[paletteName] ?? PALETTES.zenith;

// 6. Draw Sandpile into 32-bit Pixel Buffer
const buf = room.state.buf32;
const isFaceted = (renderStyle === 'faceted');
let ptr = 0;
for (let y = 0; y < GRID; y++) {
  for (let x = 0; x < GRID; x++) {
    const h = g[ptr];
    let col = lut[h < 4 ? h : 3];
    if (isFaceted && h === 3 && (x ^ y) & 1) {
      // Darken facet checker subtly
      col = (col & 0xFEFEFEFE) >>> 1 | 0xFF000000;
    }
    buf[ptr++] = col;
  }
}
room.state.offCtx.putImageData(room.state.imgData, 0, 0);

// 7. Background & Global Compositing
const W = frame.width;
const H = frame.height;
ctx.fillStyle = '#05060a';
ctx.fillRect(0, 0, W, H);

// Audio beat scale and pulse
let pulseScale = 1.0;
if (audioMode === 'pulse') {
  pulseScale += (audio.bass || 0) * 0.12;
  if (audio.beat) pulseScale += 0.05;
}

// 8. Render Mandala centered on canvas
ctx.save();
ctx.translate(W * 0.5, H * 0.5);
const baseSize = Math.min(W, H) * 0.88 * zoom * pulseScale;
ctx.scale(baseSize / GRID, baseSize / GRID);

if (renderStyle === 'crisp') {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(room.state.offscreen, -MID, -MID);
} else if (renderStyle === 'glow') {
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(room.state.offscreen, -MID, -MID);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.4 + (audio.treble || 0) * 0.4;
  ctx.filter = 'blur(6px)';
  ctx.drawImage(room.state.offscreen, -MID, -MID);
  ctx.filter = 'none';
} else {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(room.state.offscreen, -MID, -MID);
}
ctx.restore();

// 9. Outer Audio Reactive Halo / Mandala Accents
if (audioMode === 'halo' || room.state.flash > 0.05) {
  ctx.save();
  ctx.translate(W * 0.5, H * 0.5);
  const haloR = (baseSize * 0.52);
  const rings = 4;
  for (let r = 0; r < rings; r++) {
    const rad = haloR + r * 14 + (audio.mid || 0) * 20;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 235, 200, ${(0.15 - r * 0.03) + room.state.flash * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 12 + r * 4]);
    ctx.stroke();
  }
  ctx.restore();
}

// 10. Presence indicators: connect room participants around the perimeter
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.translate(W * 0.5, H * 0.5);
  const orbit = (baseSize * 0.5) + 36;
  const count = room.people.length;
  for (let i = 0; i < count; i++) {
    const p = room.people[i];
    const ang = ((p.hue || (i * (360 / count))) / 180) * Math.PI + (frame.t * 0.2);
    const px = Math.cos(ang) * orbit;
    const py = Math.sin(ang) * orbit;
    ctx.beginPath();
    ctx.arc(px, py, 4 + (audio.bass || 0) * 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.hue || 40}, 90%, 65%)`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fill();
  }
  ctx.restore();
}

// Flash on triggers
if (room.state.flash > 0.02) {
  ctx.fillStyle = `rgba(255, 255, 255, ${room.state.flash * 0.25})`;
  ctx.fillRect(0, 0, W, H);
}

ctx.restore();