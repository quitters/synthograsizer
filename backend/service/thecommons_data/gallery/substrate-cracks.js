ctx.save();

const PALETTES = {
  'Drying Mud': {
    bg: '#181410',
    faint: 'rgba(24, 20, 16, 0.02)',
    crack: '#e8ded2',
    crackGlow: '#fff8f0',
    sand: 'rgba(196, 172, 142, ',
    accent: '#d97d41'
  },
  'Obsidian Gold': {
    bg: '#0c0d11',
    faint: 'rgba(12, 13, 17, 0.02)',
    crack: '#ffd97d',
    crackGlow: '#fff3cc',
    sand: 'rgba(212, 175, 55, ',
    accent: '#fca311'
  },
  'Blueprint Slate': {
    bg: '#08111e',
    faint: 'rgba(8, 17, 30, 0.02)',
    crack: '#a8d8ea',
    crackGlow: '#e0f7fa',
    sand: 'rgba(110, 172, 218, ',
    accent: '#48cae4'
  },
  'Burnt Terracotta': {
    bg: '#1a0c0a',
    faint: 'rgba(26, 12, 10, 0.02)',
    crack: '#f4a261',
    crackGlow: '#ffe3d1',
    sand: 'rgba(226, 115, 83, ',
    accent: '#e76f51'
  }
};

const palChoice = getVar('palette') ?? 'Drying Mud';
const pal = PALETTES[palChoice] ?? PALETTES['Drying Mud'];
const scaleChoice = getVar('grid_scale') ?? 'Medium';
const cellSizes = { 'Fine': 10, 'Medium': 16, 'Coarse': 24 };
const cellSize = cellSizes[scaleChoice] ?? 16;
const speedSteps = Math.max(1, Math.min(5, getVar('growth_speed') ?? 2));
const sandSpread = Math.max(8, Math.min(40, getVar('sand_spread') ?? 20));
const branchProb = (Math.max(1, Math.min(5, getVar('branch_rate') ?? 3)) * 0.009);

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 }
];

// Initialize permanent buffers & lookup tables
if (!room.state.init || room.state.w !== frame.width || room.state.h !== frame.height || room.state.lastScale !== cellSize) {
  room.state.w = frame.width;
  room.state.h = frame.height;
  room.state.lastScale = cellSize;
  room.state.gw = Math.floor(frame.width / cellSize) + 1;
  room.state.gh = Math.floor(frame.height / cellSize) + 1;
  room.state.grid = new Uint8Array(room.state.gw * room.state.gh);
  
  room.state.canvas = new OffscreenCanvas(frame.width, frame.height);
  room.state.bctx = room.state.canvas.getContext('2d');
  room.state.bctx.fillStyle = pal.bg;
  room.state.bctx.fillRect(0, 0, frame.width, frame.height);
  
  // Precalculated pseudo-random table to avoid GC & Math.random in loops
  room.state.lutSize = 2048;
  room.state.lut = new Float32Array(room.state.lutSize);
  for (let i = 0; i < room.state.lutSize; i++) {
    room.state.lut[i] = Math.random();
  }
  room.state.lutIdx = 0;
  room.state.heads = [];
  room.state.init = true;
}

const bctx = room.state.bctx;
const gw = room.state.gw;
const gh = room.state.gh;
const grid = room.state.grid;
const lut = room.state.lut;
const lutMask = room.state.lutSize - 1;
let lptr = room.state.lutIdx;

// Slow sedimentary burial cycle: very faint bleed of background
if (frame.t % 0.1 < frame.dt) {
  bctx.fillStyle = pal.faint;
  bctx.fillRect(0, 0, frame.width, frame.height);
}

// Spawn crack seed helper
function spawnSeed(gx, gy, dir, side, tint) {
  if (gx <= 1 || gx >= gw - 2 || gy <= 1 || gy >= gh - 2) return;
  const idx = gy * gw + gx;
  grid[idx] = 1;
  room.state.heads.push({
    gx,
    gy,
    dir,
    side,
    tint: tint ?? pal.crack,
    life: Math.floor(60 + lut[(lptr++) & lutMask] * 180)
  });
  if (room.state.heads.length > 96) room.state.heads.shift();
}

// Keep crack population sustained
if (room.state.heads.length < 6) {
  const edge = Math.floor(lut[(lptr++) & lutMask] * 4);
  let sx = 2, sy = 2, sdir = 0;
  if (edge === 0) { sx = 2; sy = Math.floor(lut[(lptr++) & lutMask] * (gh - 4)) + 2; sdir = 0; }
  else if (edge === 1) { sx = Math.floor(lut[(lptr++) & lutMask] * (gw - 4)) + 2; sy = 2; sdir = 1; }
  else if (edge === 2) { sx = gw - 3; sy = Math.floor(lut[(lptr++) & lutMask] * (gh - 4)) + 2; sdir = 2; }
  else { sx = Math.floor(lut[(lptr++) & lutMask] * (gw - 4)) + 2; sy = gh - 3; sdir = 3; }
  const sside = lut[(lptr++) & lutMask] > 0.5 ? 1 : -1;
  spawnSeed(sx, sy, sdir, sside, pal.crack);
}

// Interactive hook: room people seed cracks along grid coordinates
if (room.people && room.people.length > 0 && Math.random() < 0.05) {
  const p = room.people[Math.floor(Math.random() * room.people.length)];
  const pgx = Math.floor(((p.hue % 100) / 100) * (gw - 10)) + 5;
  const pgy = Math.floor((((p.hue * 7) % 100) / 100) * (gh - 10)) + 5;
  spawnSeed(pgx, pgy, Math.floor(Math.random() * 4), Math.random() > 0.5 ? 1 : -1, `hsl(${p.hue}, 80%, 65%)`);
}

// Audio beat surge: trigger immediate orthogonal branching on active cracks
const beatSplits = audio.beat ? 3 : 1;

// Simulation step for crack heads
for (let step = 0; step < speedSteps; step++) {
  for (let i = room.state.heads.length - 1; i >= 0; i--) {
    const h = room.state.heads[i];
    h.life--;

    const d = DIRS[h.dir];
    const ngx = h.gx + d.dx;
    const ngy = h.gy + d.dy;

    // Boundary collision
    if (ngx < 1 || ngx >= gw - 1 || ngy < 1 || ngy >= gh - 1) {
      room.state.heads.splice(i, 1);
      continue;
    }

    const nIdx = ngy * gw + ngx;
    // Crack hits an existing crack: T-junction, terminate
    if (grid[nIdx] === 1) {
      room.state.heads.splice(i, 1);
      continue;
    }

    // Advance crack
    grid[nIdx] = 1;
    const x0 = h.gx * cellSize;
    const y0 = h.gy * cellSize;
    const x1 = ngx * cellSize;
    const y1 = ngy * cellSize;

    // Draw primary tectonic crack line
    bctx.beginPath();
    bctx.moveTo(x0, y0);
    bctx.lineTo(x1, y1);
    bctx.strokeStyle = h.tint;
    bctx.lineWidth = 1.6 + audio.bass * 1.5;
    bctx.stroke();

    // Soft granular sand shading along perpendicular side
    // Normal vector orthogonal to direction
    const nx = -d.dy * h.side;
    const ny = d.dx * h.side;
    const grains = 6 + Math.floor(audio.treble * 8);

    for (let g = 0; g < grains; g++) {
      // Linear interpolation along crack segment
      const t = lut[(lptr++) & lutMask];
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      
      // Quadratic falloff concentrates sand near the fissure wall
      const r = lut[(lptr++) & lutMask];
      const dist = (r * r) * (sandSpread * (1 + audio.mid * 0.5));
      const sx = px + nx * dist + (lut[(lptr++) & lutMask] - 0.5) * 2;
      const sy = py + ny * dist + (lut[(lptr++) & lutMask] - 0.5) * 2;
      const alpha = (1 - (dist / sandSpread)) * 0.28;

      if (alpha > 0.02) {
        bctx.fillStyle = `${pal.sand}${alpha.toFixed(3)})`;
        bctx.fillRect(sx, sy, 1.4, 1.4);
      }
    }

    h.gx = ngx;
    h.gy = ngy;

    // Natural branching or audio-driven perpendicular cleave
    const shouldBranch = (lut[(lptr++) & lutMask] < (branchProb * beatSplits)) && room.state.heads.length < 80;
    if (shouldBranch) {
      const turn = lut[(lptr++) & lutMask] > 0.5 ? 1 : 3;
      const newDir = (h.dir + turn) % 4;
      const newSide = -h.side;
      spawnSeed(h.gx, h.gy, newDir, newSide, h.tint);
    }

    if (h.life <= 0) {
      room.state.heads.splice(i, 1);
    }
  }
}

room.state.lutIdx = lptr;

// Blit the accumulated sedimentary surface to canvas
ctx.drawImage(room.state.canvas, 0, 0);

// Draw live hot fissure tips with soft ambient glow
ctx.save();
for (let i = 0; i < room.state.heads.length; i++) {
  const h = room.state.heads[i];
  const kx = h.gx * cellSize;
  const ky = h.gy * cellSize;
  
  ctx.beginPath();
  ctx.arc(kx, ky, 2.5 + audio.level * 2, 0, Math.PI * 2);
  ctx.fillStyle = pal.crackGlow;
  ctx.shadowColor = pal.accent;
  ctx.shadowBlur = 8 + audio.bass * 12;
  ctx.fill();
}
ctx.restore();

ctx.restore();