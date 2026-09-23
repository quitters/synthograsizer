ctx.save();

const W = frame.width;
const H = frame.height;

// --- VARIABLES ---
const warps = Math.floor(getVar('thread_count') ?? 64);
const speed = getVar('weave_speed') ?? 20;
const glow = getVar('shuttle_glow') ?? 0.5;
const patType = getVar('pattern_type') || 'Damask Floral';
const palType = getVar('palette') || 'Silk & Gold';

const PALETTES = {
  'Silk & Gold': {
    bg: '#0c0a08',
    wood: '#2d1a0e',
    brass: '#c9933b',
    warpBase: [215, 175, 75],
    weftBase: [90, 20, 25],
    warpHi: [255, 230, 150],
    weftHi: [170, 45, 55],
    beam: '#150d08'
  },
  'Indigo & Silver': {
    bg: '#060b14',
    wood: '#111d2e',
    brass: '#8faed9',
    warpBase: [175, 200, 230],
    weftBase: [18, 42, 85],
    warpHi: [240, 248, 255],
    weftHi: [40, 95, 175],
    beam: '#0a101b'
  },
  'Madder & Linen': {
    bg: '#0f0a0a',
    wood: '#2b1414',
    brass: '#bd724e',
    warpBase: [210, 195, 170],
    weftBase: [135, 32, 36],
    warpHi: [245, 235, 220],
    weftHi: [205, 55, 60],
    beam: '#180c0c'
  },
  'Cyber Damask': {
    bg: '#05050f',
    wood: '#101026',
    brass: '#00ffd5',
    warpBase: [0, 230, 200],
    weftBase: [180, 0, 120],
    warpHi: [120, 255, 240],
    weftHi: [255, 60, 200],
    beam: '#090918'
  }
};
const pal = PALETTES[palType] || PALETTES['Silk & Gold'];

// --- PERSISTENT STATE ---
room.state.totalRows ??= 80;
const TOTAL_ROWS = room.state.totalRows;

// Motif bit evaluation: 1 = warp-faced satin, 0 = weft-faced satin
const evalMotif = (gx, gy, type) => {
  const x = gx % 32;
  const y = gy % 32;
  const cx = x - 16;
  const cy = y - 16;
  const d = Math.sqrt(cx * cx + cy * cy);
  if (type === 'Houndstooth') {
    const hx = gx % 16;
    const hy = gy % 16;
    return (hx < 8 && hy < 8) || (hx >= 8 && hy >= 8 && (hx - 8 + hy - 8 < 8)) ? 1 : 0;
  } else if (type === 'Medallion') {
    const ring = Math.floor(d * 1.5) % 4;
    const star = Math.abs(Math.sin(Math.atan2(cy, cx) * 4));
    return (ring === 0 || (d < 14 && star > 0.45)) ? 1 : 0;
  } else if (type === 'Labyrinth') {
    return ((gx ^ gy) & 7) < 3 || ((gx * 3 + gy * 5) % 11 < 4) ? 1 : 0;
  } else {
    // Damask Floral
    const petal = Math.sin(Math.atan2(cy, cx) * 6 + d * 0.25);
    const core = d < 5 ? 1 : 0;
    const leaves = Math.sin(gx * 0.4) * Math.cos(gy * 0.4) > 0.2 ? 1 : 0;
    return ((d < 13 && petal > 0.1) || core || leaves) ? 1 : 0;
  };
};

// Jacquard 5-shaft satin weave binder
const isWarpOver = (x, y, motif) => {
  const satin = (x * 2 + y * 3) % 5 === 0;
  return motif ? (satin ? 0 : 1) : (satin ? 1 : 0);
};

room.state.rowProgress ??= 0;
room.state.cutTimer ??= 0;
room.state.motifOffset ??= 0;

// Advance weave simulation
const dt = Math.min(frame.dt || 0.016, 0.05);
const beatBump = audio.beat ? 1.6 : 1.0;
const rowsToAdvance = dt * speed * (0.85 + audio.mid * 0.4) * beatBump;

if (room.state.cutTimer > 0) {
  room.state.cutTimer -= dt;
  if (room.state.cutTimer <= 0) {
    room.state.cutTimer = 0;
    room.state.rowProgress = 0;
    room.state.motifOffset += 17;
  }
} else {
  room.state.rowProgress += rowsToAdvance;
  if (room.state.rowProgress >= TOTAL_ROWS) {
    room.state.cutTimer = 1.6; // Scissors cut pause & drop
  }
}

const curRow = Math.min(Math.floor(room.state.rowProgress), TOTAL_ROWS);
const shuttleT = (room.state.rowProgress % 1);
const shuttleDir = (curRow % 2 === 0) ? 1 : -1;
const shuttleXNorm = shuttleDir === 1 ? shuttleT : 1 - shuttleT;

// --- LOOM GEOMETRY ---
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

const loomW = Math.min(W * 0.76, 1100);
const loomL = (W - loomW) * 0.5;
const loomR = loomL + loomW;
const loomTop = H * 0.08;
const loomBottom = H * 0.88;
const clothH = loomBottom - loomTop;
const stepY = clothH / TOTAL_ROWS;
const stepX = loomW / warps;

// Wooden Loom Frame
ctx.fillStyle = pal.beam;
ctx.fillRect(loomL - 32, loomTop - 24, loomW + 64, 20);
ctx.fillRect(loomL - 32, loomBottom + 6, loomW + 64, 24);
ctx.fillStyle = pal.wood;
ctx.fillRect(loomL - 40, loomTop - 28, 22, clothH + 60);
ctx.fillRect(loomR + 18, loomTop - 28, 22, clothH + 60);

// Brass Tension Pegs & Reed guides
ctx.fillStyle = pal.brass;
for (let i = 0; i < 9; i++) {
  const py = loomTop + (clothH * i) / 8;
  ctx.fillRect(loomL - 46, py - 3, 10, 6);
  ctx.fillRect(loomR + 36, py - 3, 10, 6);
}

// Cloth Fall / Cut Transition
const isCutting = room.state.cutTimer > 0;
const dropOffset = isCutting ? Math.pow((1.6 - room.state.cutTimer) / 1.6, 2) * (H * 0.7) : 0;
const clothAlpha = isCutting ? Math.max(0, room.state.cutTimer / 1.6) : 1;

// Warp tension bass ripple
const tension = Math.sin(frame.t * 8) * (audio.bass * 2.5);

// --- DRAW WOVEN CLOTH & WARP THREADS ---
ctx.save();
if (isCutting) {
  ctx.globalAlpha = clothAlpha;
  ctx.translate(0, dropOffset);
}

// Pre-render cloth cells
const renderedRows = isCutting ? TOTAL_ROWS : curRow;
for (let ry = 0; ry < renderedRows; ry++) {
  const y = loomBottom - (ry + 1) * stepY;
  const weftGlow = (audio.treble * 40) | 0;
  const wR = Math.min(255, pal.weftBase[0] + weftGlow);
  const wG = Math.min(255, pal.weftBase[1] + weftGlow);
  const wB = Math.min(255, pal.weftBase[2] + weftGlow);

  for (let rx = 0; rx < warps; rx++) {
    const x = loomL + rx * stepX;
    const motif = evalMotif(rx, ry + room.state.motifOffset, patType);
    const over = isWarpOver(rx, ry, motif);

    if (over) {
      // Warp on top (vertical silk sheen)
      const sheen = (rx % 3 === 0) ? 35 : 0;
      const r = Math.min(255, pal.warpHi[0] + sheen);
      const g = Math.min(255, pal.warpHi[1] + sheen);
      const b = Math.min(255, pal.warpHi[2] + sheen);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + 0.5, y, stepX - 1, stepY + 0.5);
    } else {
      // Weft on top (horizontal velvet/matte sheen)
      ctx.fillStyle = `rgb(${wR},${wG},${wB})`;
      ctx.fillRect(x, y + 0.5, stepX, stepY - 1);
    }
  }
}

// Room attendees: dye accents on vertical selvedge threads
if (room.people && room.people.length > 0) {
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const colIdx = (p * 7) % warps;
    const px = loomL + colIdx * stepX;
    ctx.fillStyle = `hsla(${person.hue}, 85%, 65%, 0.4)`;
    ctx.fillRect(px, loomTop, stepX * 0.75, renderedRows * stepY);
  }
}

ctx.restore();

// --- UNWOVEN WARP THREADS (Loom Heddles & Harness) ---
const activeY = loomBottom - curRow * stepY;
ctx.lineWidth = Math.max(1, stepX * 0.45);
for (let rx = 0; rx < warps; rx++) {
  const x = loomL + rx * stepX + stepX * 0.5;
  const motif = evalMotif(rx, curRow + room.state.motifOffset, patType);
  const harnessUp = isWarpOver(rx, curRow, motif);
  const xWobble = tension * Math.sin(rx * 0.5 + frame.t * 6);

  // Differentiate raised warp (heddle lifted) vs lowered warp (shed)
  if (harnessUp) {
    ctx.strokeStyle = `rgb(${pal.warpHi[0]},${pal.warpHi[1]},${pal.warpHi[2]})`;
  } else {
    ctx.strokeStyle = `rgba(${pal.warpBase[0]},${pal.warpBase[1]},${pal.warpBase[2]}, 0.35)`;
  }
  ctx.beginPath();
  ctx.moveTo(x + xWobble, loomTop);
  ctx.lineTo(x, activeY);
  ctx.stroke();
}

// --- SHUTTLE & BEATER (Active Row) ---
if (!isCutting) {
  const sx = loomL + shuttleXNorm * loomW;
  const sy = activeY;

  // Shuttle yarn tail line
  ctx.strokeStyle = `rgba(${pal.weftHi[0]}, ${pal.weftHi[1]}, ${pal.weftHi[2]}, 0.85)`;
  ctx.lineWidth = Math.max(1.5, stepY * 0.7);
  ctx.beginPath();
  if (shuttleDir === 1) {
    ctx.moveTo(loomL, sy);
    ctx.lineTo(sx, sy);
  } else {
    ctx.moveTo(loomR, sy);
    ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  // Shuttle body (tapered wooden/brass boat)
  const sLen = 42;
  const sH = Math.max(6, stepY * 1.5);
  ctx.save();
  ctx.translate(sx, sy);
  if (shuttleDir === -1) ctx.scale(-1, 1);

  // Glow aura
  if (glow > 0) {
    const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, sLen * glow * 1.5);
    aura.addColorStop(0, `rgba(${pal.brass === '#00ffd5' ? '0,255,213' : '255,215,120'}, ${0.4 * glow})`);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(-sLen, -sLen, sLen * 2, sLen * 2);
  }

  // Shuttle hull
  ctx.fillStyle = '#1c0f08';
  ctx.beginPath();
  ctx.moveTo(-sLen * 0.5, 0);
  ctx.quadraticCurveTo(0, -sH, sLen * 0.5, 0);
  ctx.quadraticCurveTo(0, sH, -sLen * 0.5, 0);
  ctx.fill();

  // Pirn / Bobbin inside shuttle
  ctx.fillStyle = `rgb(${pal.weftHi[0]}, ${pal.weftHi[1]}, ${pal.weftHi[2]})`;
  ctx.fillRect(-sLen * 0.2, -sH * 0.35, sLen * 0.4, sH * 0.7);
  // Brass tip
  ctx.fillStyle = pal.brass;
  ctx.beginPath();
  ctx.arc(sLen * 0.45, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Reed / Beater bar slamming against the fell
  const beatPhase = Math.sin(shuttleT * Math.PI);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(loomL, activeY - 3, loomW, 6);
}

// --- CUTTING SCISSORS OVERLAY ---
if (isCutting) {
  const cutProgress = 1 - room.state.cutTimer / 1.6;
  const cutX = loomL + cutProgress * loomW;
  ctx.save();
  ctx.strokeStyle = pal.brass;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cutX - 16, loomBottom - 16);
  ctx.lineTo(cutX + 16, loomBottom + 16);
  ctx.moveTo(cutX - 16, loomBottom + 16);
  ctx.lineTo(cutX + 16, loomBottom - 16);
  ctx.stroke();
  ctx.restore();
}

// Header / Loom Status Plaque
ctx.fillStyle = pal.brass;
ctx.font = '11px monospace';
ctx.letterSpacing = '2px';
const rowDisp = String(curRow).padStart(3, '0');
ctx.fillText(`JACQUARD LOOM  •  CARD #${rowDisp}  •  ${patType.toUpperCase()}`, loomL, loomTop - 34);
ctx.fillText(`${warps} WARP  •  ${(speed).toFixed(0)} PICK/S`, loomR - 160, loomTop - 34);

ctx.restore();