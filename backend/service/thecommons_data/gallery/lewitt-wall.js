ctx.save();

const paletteKey = getVar('palette') || 'gallery_chalk';
const flowKey = getVar('drafting_order') || 'sequential';
const density = getVar('instruction_density') ?? 40;
const speedMult = getVar('draw_speed') ?? 1.5;
const lineWeight = getVar('line_weight') ?? 1.5;

const PALETTES = {
  gallery_chalk: { bg: '#f4efe6', primary: '#211e1c', secondary: '#9b3d2d', tertiary: '#33506d', quaternary: '#c48b3c' },
  linocut_ink:   { bg: '#faf7f2', primary: '#181b24', secondary: '#d13a29', tertiary: '#245a58', quaternary: '#e07a1e' },
  blueprint:     { bg: '#102538', primary: '#f0f5fa', secondary: '#4fc1e8', tertiary: '#95d2f2', quaternary: '#e8ecef' },
  monochrome:    { bg: '#f5f5f3', primary: '#1c1c1c', secondary: '#444444', tertiary: '#767676', quaternary: '#a8a8a8' }
};
const pal = PALETTES[paletteKey] || PALETTES.gallery_chalk;

// Init persistent state
room.state.time ??= 0;
room.state.cycle ??= 0;
room.state.wipeAlpha ??= 0;
room.state.curDensity ??= 0;
room.state.rays ??= [];
room.state.arcs ??= [];
room.state.grids ??= [];

// Rebuild instructions when density changes
if (room.state.curDensity !== density) {
  room.state.curDensity = density;
  room.state.rays.length = 0;
  room.state.arcs.length = 0;
  room.state.grids.length = 0;

  // 1. Center rays (angles 0 to 2*PI)
  const rayCount = density * 2;
  for (let i = 0; i < rayCount; i++) {
    room.state.rays.push((i / rayCount) * Math.PI * 2);
  }

  // 2. Corner concentric arcs (corner 0:TL, 1:TR, 2:BR, 3:BL)
  const arcCountPerCorner = Math.floor(density / 2);
  for (let c = 0; c < 4; c++) {
    for (let i = 1; i <= arcCountPerCorner; i++) {
      room.state.arcs.push({ corner: c, rFrac: i / arcCountPerCorner });
    }
  }

  // 3. 4-directional grids (0:horiz, 1:vert, 2:+45, 3:-45)
  const gridLines = Math.floor(density * 0.75);
  for (let d = 0; d < 4; d++) {
    for (let i = 1; i <= gridLines; i++) {
      room.state.grids.push({ dir: d, frac: i / (gridLines + 1) });
    }
  }
}

const dt = Math.min(frame.dt || 0.016, 0.05);
room.state.time += dt * speedMult;

// Cycle duration: 28 seconds draft, 4 seconds hold, 2 seconds wipe
const CYCLE_LEN = 30;
const cycleProgress = (room.state.time % CYCLE_LEN) / CYCLE_LEN;
const drawProgress = Math.min(1, cycleProgress / 0.82);
const isWiping = cycleProgress > 0.88;

if (isWiping) {
  room.state.wipeAlpha = Math.min(1, room.state.wipeAlpha + dt * 2.5);
} else {
  room.state.wipeAlpha = Math.max(0, room.state.wipeAlpha - dt * 3.0);
}

const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const cy = h * 0.5;
const diag = Math.hypot(w, h);

// Solid background
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, w, h);

// Room audience subtle corner tint integration
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 8);
  for (let i = 0; i < pCount; i++) {
    const hue = room.people[i].hue ?? (i * 45);
    ctx.save();
    ctx.fillStyle = `hsla(${hue}, 40%, 65%, 0.035)`;
    ctx.beginPath();
    const px = (i % 2) * w;
    const py = (Math.floor(i / 2) % 2) * h;
    ctx.arc(px, py, 260 + (i * 20), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Audio dynamics on pen pressure
const pressure = lineWeight * (1 + (audio.bass || 0) * 0.85);
const microJitter = (audio.level || 0) * 1.5;

ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// Determine progression fractions per system based on drafting flow
let rayProg = 0;
let arcProg = 0;
let gridProg = 0;

if (flowKey === 'sequential') {
  gridProg = Math.min(1, Math.max(0, drawProgress / 0.35));
  arcProg  = Math.min(1, Math.max(0, (drawProgress - 0.3) / 0.35));
  rayProg  = Math.min(1, Math.max(0, (drawProgress - 0.6) / 0.4));
} else if (flowKey === 'counterpoint') {
  arcProg  = Math.min(1, drawProgress / 0.65);
  rayProg  = Math.min(1, Math.max(0, (drawProgress - 0.25) / 0.75));
  gridProg = Math.min(1, Math.max(0, (drawProgress - 0.45) / 0.55));
} else {
  // composite
  gridProg = drawProgress;
  arcProg  = Math.min(1, drawProgress * 1.05);
  rayProg  = Math.min(1, drawProgress * 1.1);
}

// --- SYSTEM 1: 4-Directional Grids ---
if (gridProg > 0) {
  ctx.strokeStyle = pal.tertiary;
  ctx.lineWidth = pressure * 0.75;
  ctx.globalAlpha = 0.5 + (audio.mid || 0) * 0.35;
  const totalGrids = room.state.grids.length;
  const visibleCount = Math.floor(totalGrids * gridProg);

  ctx.beginPath();
  for (let i = 0; i < visibleCount; i++) {
    const g = room.state.grids[i];
    if (g.dir === 0) {
      // Horizontal
      const y = g.frac * h;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    } else if (g.dir === 1) {
      // Vertical
      const x = g.frac * w;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    } else if (g.dir === 2) {
      // Diagonal 45 deg
      const span = w + h;
      const offset = g.frac * span;
      ctx.moveTo(offset - h, h);
      ctx.lineTo(offset, 0);
    } else {
      // Diagonal 135 deg
      const span = w + h;
      const offset = (g.frac * span) - h;
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + h, h);
    }
  }
  ctx.stroke();
}

// --- SYSTEM 2: Arcs from the 4 Corners ---
if (arcProg > 0) {
  ctx.strokeStyle = pal.secondary;
  ctx.lineWidth = pressure * 1.1;
  ctx.globalAlpha = 0.75;
  const totalArcs = room.state.arcs.length;
  const visibleArcs = Math.floor(totalArcs * arcProg);
  const maxR = diag * 0.95;

  const corners = [
    { x: 0, y: 0, start: 0, end: Math.PI * 0.5 },
    { x: w, y: 0, start: Math.PI * 0.5, end: Math.PI },
    { x: w, y: h, start: Math.PI, end: Math.PI * 1.5 },
    { x: 0, y: h, start: Math.PI * 1.5, end: Math.PI * 2 }
  ];

  ctx.beginPath();
  for (let i = 0; i < visibleArcs; i++) {
    const arc = room.state.arcs[i];
    const c = corners[arc.corner];
    const r = arc.rFrac * maxR;
    ctx.moveTo(c.x + Math.cos(c.start) * r, c.y + Math.sin(c.start) * r);
    ctx.arc(c.x, c.y, r, c.start, c.end);
  }
  ctx.stroke();
}

// --- SYSTEM 3: Lines from the Center ---
if (rayProg > 0) {
  ctx.strokeStyle = pal.primary;
  ctx.lineWidth = pressure * 1.25;
  ctx.globalAlpha = 0.9;
  const totalRays = room.state.rays.length;
  const visibleRays = Math.floor(totalRays * rayProg);
  const rayReach = (diag * 0.55) * Math.min(1, rayProg * 1.1);

  ctx.beginPath();
  for (let i = 0; i < visibleRays; i++) {
    const angle = room.state.rays[i];
    const jx = microJitter > 0 ? (Math.sin(angle * 7 + frame.t * 3) * microJitter) : 0;
    const jy = microJitter > 0 ? (Math.cos(angle * 5 + frame.t * 3) * microJitter) : 0;
    const endX = cx + Math.cos(angle) * rayReach + jx;
    const endY = cy + Math.sin(angle) * rayReach + jy;
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
  }
  ctx.stroke();

  // Center compass point
  ctx.fillStyle = pal.secondary;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5 + (audio.bass || 0) * 3, 0, Math.PI * 2);
  ctx.fill();
}

// Sol LeWitt caption legend in bottom margin
ctx.save();
ctx.globalAlpha = 0.45;
ctx.fillStyle = pal.primary;
ctx.font = '11px monospace';
ctx.fillText('LEWITT: CENTER RAYS, CORNER ARCS, 4-WAY GRIDS / WALL DRAWING', 24, h - 20);
ctx.fillText(`PHASE: ${(drawProgress * 100).toFixed(0)}%`, w - 110, h - 20);
ctx.restore();

// Gentle eraser veil transitioning between cycles
if (room.state.wipeAlpha > 0) {
  ctx.save();
  ctx.fillStyle = pal.bg;
  ctx.globalAlpha = room.state.wipeAlpha;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

ctx.restore();