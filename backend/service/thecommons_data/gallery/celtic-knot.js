ctx.save();
const W = frame.width;
const H = frame.height;

// --- Configuration & Variables ---
const paletteName = getVar('palette') ?? 'Book of Kells';
const knotScale = Math.floor(getVar('knot_scale') ?? 10);
const baseBandW = getVar('band_width') ?? 18;
const orientMode = getVar('orientation') ?? 'Diagonal';
const mutateMode = getVar('mutation_rate') ?? 'Rhythmic Pulse';
const shimmer = getVar('shimmer') ?? 0.5;
const innerStyle = getVar('inner_line') ?? 'Double Thread';

const PALETTES = {
  'Book of Kells': { bg: '#060a08', border: '#030604', bandA: '#c89632', bandB: '#1a6642', core: '#fce8a6', glow: '#34d399' },
  'Highland Bronze': { bg: '#0a0806', border: '#050302', bandA: '#b86a28', bandB: '#607238', core: '#fed7aa', glow: '#f97316' },
  'Silver & Lapis': { bg: '#050712', border: '#020308', bandA: '#94a3b8', bandB: '#1d4ed8', core: '#f8fafc', glow: '#38bdf8' },
  'Obsidian Gold': { bg: '#050505', border: '#000000', bandA: '#eab308', bandB: '#374151', core: '#fef08a', glow: '#fbbf24' }
};
const pal = PALETTES[paletteName] ?? PALETTES['Book of Kells'];

const MUTATE_INTERVALS = {
  'Gentle Drift': 4.0,
  'Rhythmic Pulse': 1.6,
  'Kinetic Swarm': 0.7
};
const mutatePeriod = MUTATE_INTERVALS[mutateMode] ?? 1.6;

// Grid dimensions: even counts for closed boundary arches
const cols = knotScale;
const rows = Math.max(4, Math.floor(knotScale * 0.65) * 2);
const totalCells = cols * rows;

// Persistent demoscene state
room.state.cells ??= new Uint8Array(256);
room.state.lastMutate ??= 0;
room.state.spinAngle ??= 0;
room.state.beatCooldown ??= 0;

// Trigger symmetrical re-knotting
room.state.beatCooldown = Math.max(0, (room.state.beatCooldown ?? 0) - frame.dt);
const shouldMutate = (frame.t - room.state.lastMutate > mutatePeriod) || (audio.beat && room.state.beatCooldown <= 0);

if (shouldMutate) {
  room.state.lastMutate = frame.t;
  room.state.beatCooldown = 0.35;
  // Mutate 1 to 3 symmetrical coordinate pairs
  const halfC = cols >> 1;
  const halfR = rows >> 1;
  const pickCount = audio.beat ? 3 : 1;
  for (let k = 0; k < pickCount; k++) {
    const sc = Math.floor(Math.random() * halfC);
    const sr = Math.floor(Math.random() * halfR);
    // 0: N-S over, 1: W-E over, 2: Bend NE/WS, 3: Bend NW/ES
    const roll = Math.random();
    let type;
    if (roll < 0.35) {
      type = ((sc + sr) % 2 === 0) ? 0 : 1; // canonical cross
    } else if (roll < 0.70) {
      type = 2;
    } else {
      type = 3;
    }
    // Bilateral 4-fold symmetry update
    const c2 = cols - 1 - sc;
    const r2 = rows - 1 - sr;
    const typeH = (type >= 2) ? (type === 2 ? 3 : 2) : type;
    const typeV = (type >= 2) ? (type === 2 ? 3 : 2) : type;
    const typeHV = type;

    room.state.cells[sr * cols + sc] = type;
    room.state.cells[sr * cols + c2] = typeH;
    room.state.cells[r2 * cols + sc] = typeV;
    room.state.cells[r2 * cols + c2] = typeHV;
  }
}

// --- Canvas Background ---
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Subtle background vignette
const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, W * 0.75);
vig.addColorStop(0, 'rgba(255,255,255,0.02)');
vig.addColorStop(1, 'rgba(0,0,0,0.85)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

// Coordinate mapping & orientation
ctx.save();
ctx.translate(W * 0.5, H * 0.5);

if (orientMode === 'Diagonal') {
  ctx.rotate(Math.PI * 0.25);
} else if (orientMode === 'Slow Spin') {
  room.state.spinAngle += frame.dt * 0.08;
  ctx.rotate(room.state.spinAngle);
}

// Dynamic ribbon dimensions reacting to bass
const bassBoost = 1.0 + (audio.bass ?? 0) * 0.22;
const bandW = baseBandW * bassBoost;
const outlineW = bandW + 6;
const gapW = outlineW + 6;

// Cell geometry
const cellSize = Math.min(W, H) / (Math.max(cols, rows) * 1.05);
const gridW = cols * cellSize;
const gridH = rows * cellSize;
const startX = -gridW * 0.5;
const startY = -gridH * 0.5;
const r = cellSize * 0.5;

// Precomputed strand paths
function drawBend(cx, cy, type) {
  if (type === 2) {
    ctx.beginPath();
    ctx.arc(cx + r, cy - r, r, Math.PI * 0.5, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - r, cy + r, r, Math.PI * 1.5, 0);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx - r, cy - r, r, 0, Math.PI * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r, cy + r, r, Math.PI, Math.PI * 1.5);
    ctx.stroke();
  }
}

function drawLineNS(cx, cy) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
}

function drawLineWE(cx, cy) {
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
}

// Draw closed outer boundary arches
function drawBoundaries() {
  // Top arches (pairing c with c+1)
  for (let c = 0; c < cols; c += 2) {
    const arcX = startX + (c + 1) * cellSize;
    const arcY = startY;
    ctx.beginPath();
    ctx.arc(arcX, arcY, r, Math.PI, 0);
    ctx.stroke();
  }
  // Bottom arches
  for (let c = 0; c < cols; c += 2) {
    const arcX = startX + (c + 1) * cellSize;
    const arcY = startY + gridH;
    ctx.beginPath();
    ctx.arc(arcX, arcY, r, 0, Math.PI);
    ctx.stroke();
  }
  // Left arches
  for (let row = 0; row < rows; row += 2) {
    const arcX = startX;
    const arcY = startY + (row + 1) * cellSize;
    ctx.beginPath();
    ctx.arc(arcX, arcY, r, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
  }
  // Right arches
  for (let row = 0; row < rows; row += 2) {
    const arcX = startX + gridW;
    const arcY = startY + (row + 1) * cellSize;
    ctx.beginPath();
    ctx.arc(arcX, arcY, r, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();
  }
}

// Setup stroke cap
ctx.lineCap = 'butt';
ctx.lineJoin = 'round';

// Color lookup helper
const shimmerPhase = (frame.t * 2.0 + (audio.treble ?? 0) * 4.0);
function getBandColor(idx, isPassOver) {
  const wave = Math.sin(shimmerPhase + idx * 0.15) * shimmer;
  return (idx % 2 === 0) ? pal.bandA : pal.bandB;
}

// --- PASS 1: Base outlines and Under-Strands ---
// 1A. Dark Under-Border
ctx.strokeStyle = pal.border;
ctx.lineWidth = outlineW;
drawBoundaries();
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const idx = y * cols + x;
    const type = room.state.cells[idx] ?? (((x + y) % 2 === 0) ? 0 : 1);
    const cx = startX + x * cellSize + r;
    const cy = startY + y * cellSize + r;
    if (type >= 2) {
      drawBend(cx, cy, type);
    } else if (type === 0) {
      drawLineWE(cx, cy); // under strand
    } else {
      drawLineNS(cx, cy); // under strand
    }
  }
}

// 1B. Under-Strand Ribbon Fill
ctx.lineWidth = bandW;
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const idx = y * cols + x;
    const type = room.state.cells[idx] ?? (((x + y) % 2 === 0) ? 0 : 1);
    const cx = startX + x * cellSize + r;
    const cy = startY + y * cellSize + r;
    ctx.strokeStyle = getBandColor(x + y, false);
    if (type >= 2) {
      drawBend(cx, cy, type);
    } else if (type === 0) {
      drawLineWE(cx, cy);
    } else {
      drawLineNS(cx, cy);
    }
  }
}
ctx.strokeStyle = pal.bandA;
drawBoundaries();

// --- PASS 2: Over-Strands with Clearance Cut ---
// 2A. Background Clearance Cut (creates the interlace gap under overpass)
ctx.strokeStyle = pal.bg;
ctx.lineWidth = gapW;
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const idx = y * cols + x;
    const type = room.state.cells[idx] ?? (((x + y) % 2 === 0) ? 0 : 1);
    if (type < 2) {
      const cx = startX + x * cellSize + r;
      const cy = startY + y * cellSize + r;
      if (type === 0) {
        drawLineNS(cx, cy);
      } else {
        drawLineWE(cx, cy);
      }
    }
  }
}

// 2B. Over-Strand Dark Outlines
ctx.strokeStyle = pal.border;
ctx.lineWidth = outlineW;
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const idx = y * cols + x;
    const type = room.state.cells[idx] ?? (((x + y) % 2 === 0) ? 0 : 1);
    if (type < 2) {
      const cx = startX + x * cellSize + r;
      const cy = startY + y * cellSize + r;
      if (type === 0) {
        drawLineNS(cx, cy);
      } else {
        drawLineWE(cx, cy);
      }
    }
  }
}

// 2C. Over-Strand Ribbon Fill
ctx.lineWidth = bandW;
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const idx = y * cols + x;
    const type = room.state.cells[idx] ?? (((x + y) % 2 === 0) ? 0 : 1);
    if (type < 2) {
      const cx = startX + x * cellSize + r;
      const cy = startY + y * cellSize + r;
      ctx.strokeStyle = getBandColor(x + y, true);
      if (type === 0) {
        drawLineNS(cx, cy);
      } else {
        drawLineWE(cx, cy);
      }
    }
  }
}

// --- PASS 3: Internal Ribbon Incisions / Illumination ---
if (innerStyle !== 'Solid Ribbon') {
  ctx.lineWidth = (innerStyle === 'Glowing Core') ? bandW * 0.35 : 2;
  ctx.strokeStyle = (innerStyle === 'Glowing Core') ? pal.glow : pal.core;
  if (innerStyle === 'Glowing Core') {
    ctx.globalAlpha = 0.6 + 0.3 * (audio.mid ?? 0);
  }
  drawBoundaries();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const type = room.state.cells[idx] ?? (((x + y) % 2 === 0) ? 0 : 1);
      const cx = startX + x * cellSize + r;
      const cy = startY + y * cellSize + r;
      if (type >= 2) {
        drawBend(cx, cy, type);
      } else {
        // In both directions for a continuous incised thread
        drawLineWE(cx, cy);
        drawLineNS(cx, cy);
      }
    }
  }
  ctx.globalAlpha = 1.0;
}

// Connected people represented as Celtic gemstone beads along crossings
if (room.people && room.people.length > 0) {
  const pCount = room.people.length;
  for (let i = 0; i < pCount; i++) {
    const person = room.people[i];
    const cellX = (i * 3) % cols;
    const cellY = (i * 2 + 1) % rows;
    const bx = startX + cellX * cellSize + r;
    const by = startY + cellY * cellSize + r;
    const beadRadius = Math.max(3, bandW * 0.28);
    ctx.beginPath();
    ctx.arc(bx, by, beadRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = pal.border;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by, beadRadius, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${person.hue}, 85%, 60%)`;
    ctx.fill();
  }
}

ctx.restore();
ctx.restore();