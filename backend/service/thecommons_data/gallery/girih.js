ctx.save();

const W = frame.width;
const H = frame.height;
const S = getVar('pattern_scale') ?? 120;
const ribbonW = (getVar('interlace_depth') ?? 14) * (1 + (audio?.bass ?? 0) * 0.25);
const traceSpeed = getVar('trace_speed') ?? 0.8;
const geomMode = getVar('geometry_order') ?? 'octagrams';
const style = getVar('strap_style') ?? 'lapis_gold';

const PALETTES = {
  lapis_gold: {
    bg: '#050b18',
    bgTile: '#0a1733',
    ribbonBorder: '#1c1507',
    strapCore: '#ffd15c',
    strapEdge: '#b8860b',
    jewel: '#2575fc',
    shimmer: '#fff4cc'
  },
  emerald_copper: {
    bg: '#04130d',
    bgTile: '#08251b',
    ribbonBorder: '#150904',
    strapCore: '#f39c6b',
    strapEdge: '#b25329',
    jewel: '#00e676',
    shimmer: '#ffe8db'
  },
  obsidian_gilded: {
    bg: '#09090b',
    bgTile: '#151518',
    ribbonBorder: '#000000',
    strapCore: '#f5d77f',
    strapEdge: '#9e7d3b',
    jewel: '#d4af37',
    shimmer: '#ffffff'
  },
  cobalt_silver: {
    bg: '#070c1d',
    bgTile: '#0e1838',
    ribbonBorder: '#050811',
    strapCore: '#e2e8f0',
    strapEdge: '#94a3b8',
    jewel: '#38bdf8',
    shimmer: '#ffffff'
  }
};
const pal = PALETTES[style] ?? PALETTES.lapis_gold;

// Init persistent LUT / reusable buffers in room.state
room.state.lut ??= {
  cos: new Float32Array(16),
  sin: new Float32Array(16),
  inited: false
};
if (!room.state.lut.inited) {
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    room.state.lut.cos[i] = Math.cos(a);
    room.state.lut.sin[i] = Math.sin(a);
  }
  room.state.lut.inited = true;
}

// Deep textured background
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Radial ambient vignette
const cx = W * 0.5;
const cy = H * 0.5;
const bgGrad = ctx.createRadialGradient(cx, cy, S * 0.5, cx, cy, Math.max(W, H) * 0.7);
bgGrad.addColorStop(0, pal.bgTile);
bgGrad.addColorStop(1, pal.bg);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Geometry setup for 8-fold Girih tile unit
const rInner = S * (geomMode === 'rosettes' ? 0.38 : (geomMode === 'star_polygon' ? 0.32 : 0.28));
const rOuter = S * (geomMode === 'rosettes' ? 0.58 : (geomMode === 'star_polygon' ? 0.68 : 0.52));
const audioBoost = (audio?.mid ?? 0) * 0.15;
const dynamicR = rOuter * (1 + audioBoost);

// Grid bounds
const cols = Math.ceil(W / S) + 2;
const rows = Math.ceil(H / S) + 2;
const startX = -S + ((W % S) * 0.5);
const startY = -S + ((H % S) * 0.5);

// Tracing line progress [0..1] with continuous seamless loop
const traceCycle = (frame.t * traceSpeed) % (Math.PI * 2);
const traceDashLen = S * 3.14;
const dashOffset = -frame.t * traceSpeed * 80;

// Pass 1: Draw dark strap ribbon borders
ctx.lineCap = 'butt';
ctx.lineJoin = 'miter';
ctx.miterLimit = 3;

function renderNetwork(isStrapPass, strokeW, strokeCol) {
  ctx.lineWidth = strokeW;
  ctx.strokeStyle = strokeCol;
  ctx.beginPath();

  for (let gy = 0; gy < rows; gy++) {
    const py = startY + gy * S;
    for (let gx = 0; gx < cols; gx++) {
      const px = startX + gx * S;
      const parity = (gx + gy) & 1;
      const rotOffset = parity ? 1 : 0;

      // Draw 8 interlacing star segments radiating through the unit
      for (let k = 0; k < 8; k++) {
        const idxA = (k * 2 + rotOffset) & 15;
        const idxB = (k * 2 + rotOffset + 3) & 15;

        const x1 = px + room.state.lut.cos[idxA] * rInner;
        const y1 = py + room.state.lut.sin[idxA] * rInner;
        const x2 = px + room.state.lut.cos[idxB] * dynamicR;
        const y2 = py + room.state.lut.sin[idxB] * dynamicR;

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }

      // Cross-connect to adjacent tile points (girih strap continuation)
      if (gx < cols - 1) {
        const nx = px + S;
        ctx.moveTo(px + dynamicR, py);
        ctx.lineTo(nx - dynamicR, py);
      }
      if (gy < rows - 1) {
        const ny = py + S;
        ctx.moveTo(px, py + dynamicR);
        ctx.lineTo(px, ny - dynamicR);
      }
    }
  }
  ctx.stroke();
}

// 1. Black ribbon trenches (borders)
renderNetwork(false, ribbonW + 3, pal.ribbonBorder);

// 2. Gold/Lapis strap cores
ctx.setLineDash([traceDashLen * 0.75, traceDashLen * 0.25]);
ctx.lineDashOffset = dashOffset;
renderNetwork(true, ribbonW - 2, pal.strapCore);
ctx.setLineDash([]);

// 3. Central golden highlight filament
renderNetwork(true, Math.max(2, ribbonW * 0.22), pal.shimmer);

// Pass 4: Demoscene Over-and-Under Weave
// At each star vertex and crossing, redraw the 'over' ribbon segment cleanly
const overSegmentLen = ribbonW * 1.4;
for (let gy = 0; gy < rows; gy++) {
  const py = startY + gy * S;
  for (let gx = 0; gx < cols; gx++) {
    const px = startX + gx * S;
    const parity = (gx + gy) & 1;

    for (let k = 0; k < 8; k++) {
      // Alternate which spoke crosses over
      if ((k + parity) % 2 === 0) continue;

      const idx = (k * 2 + (parity ? 1 : 0)) & 15;
      const midR = (rInner + dynamicR) * 0.52;
      const mx = px + room.state.lut.cos[idx] * midR;
      const my = py + room.state.lut.sin[idx] * midR;
      const dx = room.state.lut.cos[idx] * (overSegmentLen * 0.5);
      const dy = room.state.lut.sin[idx] * (overSegmentLen * 0.5);

      // Over-pass trench cut
      ctx.lineWidth = ribbonW + 3;
      ctx.strokeStyle = pal.ribbonBorder;
      ctx.beginPath();
      ctx.moveTo(mx - dx, my - dy);
      ctx.lineTo(mx + dx, my + dy);
      ctx.stroke();

      // Over-pass core
      ctx.lineWidth = ribbonW - 2;
      ctx.strokeStyle = pal.strapCore;
      ctx.beginPath();
      ctx.moveTo(mx - dx, my - dy);
      ctx.lineTo(mx + dx, my + dy);
      ctx.stroke();

      // Over-pass central glimmer
      ctx.lineWidth = Math.max(2, ribbonW * 0.22);
      ctx.strokeStyle = pal.shimmer;
      ctx.beginPath();
      ctx.moveTo(mx - dx * 0.8, my - dy * 0.8);
      ctx.lineTo(mx + dx * 0.8, my + dy * 0.8);
      ctx.stroke();
    }
  }
}

// Pass 5: Star Rosette Central Medallions with connected room people colors
const personCount = room.people ? room.people.length : 0;
const beatPulse = audio?.beat ? 1.35 : 1.0;

let pIdx = 0;
for (let gy = 0; gy < rows; gy++) {
  const py = startY + gy * S;
  for (let gx = 0; gx < cols; gx++) {
    const px = startX + gx * S;
    const person = personCount > 0 ? room.people[pIdx % personCount] : null;
    pIdx++;

    const centerRadius = (ribbonW * 0.55) * beatPulse;

    // Lapis center polygon / jewel
    ctx.fillStyle = person ? `hsl(${person.hue}, 85%, 55%)` : pal.jewel;
    ctx.beginPath();
    ctx.arc(px, py, centerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Gilded jewel rim
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.strapCore;
    ctx.stroke();

    // Micro highlight glint reacting to treble
    const trebleGlint = (audio?.treble ?? 0) * 3.5;
    if (trebleGlint > 0.8) {
      ctx.fillStyle = pal.shimmer;
      ctx.beginPath();
      ctx.arc(px - centerRadius * 0.3, py - centerRadius * 0.3, Math.max(1, centerRadius * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

ctx.restore();