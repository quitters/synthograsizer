ctx.save();

const styleKey = getVar('pattern_style') ?? 'damask_floral';
const palKey = getVar('palette_theme') ?? 'indigo_gold';
const warpCount = Math.floor(getVar('thread_density') ?? 80);
const speedMul = getVar('shuttle_speed') ?? 1.5;
const tension = getVar('tension') ?? 1.0;

const PALETTES = {
  indigo_gold:      { bg: '#080c18', warp: '#e5b842', weft: '#183a6e', acc: '#ffd875', wood: '#3b2314', reed: '#a8a8a8' },
  obsidian_crimson: { bg: '#0b0709', warp: '#d42c44', weft: '#1e1418', acc: '#ff6b81', wood: '#29181b', reed: '#c49a9a' },
  raw_linen:        { bg: '#141210', warp: '#dfd7ca', weft: '#5c544a', acc: '#f7f4ee', wood: '#4a3b32', reed: '#9e968c' },
  neon_synth:       { bg: '#05030a', warp: '#00f0ff', weft: '#ff0077', acc: '#ffff00', wood: '#18122b', reed: '#00ffaa' }
};
const pal = PALETTES[palKey] ?? PALETTES.indigo_gold;

// Allocate persistent simulation state once
const MAX_WARP = 128;
const MAX_ROWS = 160;
room.state.grid ??= new Uint8Array(MAX_WARP * MAX_ROWS);
room.state.heddles ??= new Float32Array(MAX_WARP);
room.state.shuttleX ??= 0;
room.state.shuttleDir ??= 1;
room.state.activeRow ??= 0;
room.state.rowTimer ??= 0;
room.state.cutAnim ??= 0;
room.state.clothDrop ??= 0;
room.state.reedBevel ??= 0;
room.state.cycleCount ??= 0;

const st = room.state;

// Jacquard card evaluator (pure bit synthesis, zero allocations)
function evalJacquard(col, row, style, seed) {
  const x = col - warpCount * 0.5;
  const y = row - MAX_ROWS * 0.5;
  if (style === 'damask_floral') {
    const r = Math.hypot(x, y * 0.8);
    const a = Math.atan2(y, x) * 4;
    const wave = Math.sin(r * 0.28 + a) + Math.cos(col * 0.2) * 0.5;
    return (wave > 0.15 ? 1 : 0) ^ ((col + row) & 1);
  } else if (style === 'geometric_twill') {
    const twill = (col + row * 2) % 6 < 3 ? 1 : 0;
    const plaid = ((col & 16) ^ (row & 16)) ? 1 : 0;
    return twill ^ plaid;
  } else if (style === 'heraldic_rosette') {
    const r = Math.hypot(x, y);
    const ring = Math.sin(r * 0.35 + seed) > 0 ? 1 : 0;
    const cross = (Math.abs(x) < 4 || Math.abs(y) < 4) ? 1 : 0;
    return (ring ^ cross) ^ ((col ^ row) & 1);
  } else {
    // cyber_fractal
    const v = ((col * 3) ^ (row * 5) ^ (seed * 17)) & 31;
    return v > 14 ? 1 : 0;
  }
}

// Loom layout dimensions
const W = frame.width;
const H = frame.height;
const loomMarginX = W * 0.12;
const loomWidth = W - loomMarginX * 2;
const dx = loomWidth / (warpCount - 1);
const fellY = H * 0.44;     // Where reed beats thread into the cloth
const heddleY = H * 0.16;   // Upper harness/card area
const rollerY = H * 0.94;   // Cloth take-up beam
const clothH = rollerY - fellY;
const rowSpacing = clothH / MAX_ROWS;

// Audio & shuttle step dynamics
const stepRate = (speedMul * (1.2 + audio.mid * 1.5) + (audio.bass > 0.6 ? 1.0 : 0)) * 28;
st.rowTimer += frame.dt * stepRate;

// Advance weft line by line
while (st.rowTimer >= 1.0 && st.cutAnim <= 0) {
  st.rowTimer -= 1.0;
  const r = st.activeRow;
  const seed = st.cycleCount & 7;
  for (let c = 0; c < warpCount; c++) {
    st.grid[r * MAX_WARP + c] = evalJacquard(c, r, styleKey, seed);
  }
  st.activeRow++;
  st.shuttleDir *= -1;
  st.reedBevel = 1.0; // Trigger reed beater impact

  // Cloth complete -> trigger cut-off cycle
  if (st.activeRow >= MAX_ROWS) {
    st.cutAnim = 1.0;
  }
}

// Handle fabric cutoff / drop animation
if (st.cutAnim > 0) {
  st.clothDrop += frame.dt * 450;
  st.cutAnim -= frame.dt * 0.8;
  if (st.cutAnim <= 0) {
    st.cutAnim = 0;
    st.clothDrop = 0;
    st.activeRow = 0;
    st.cycleCount++;
    st.grid.fill(0);
  }
}

// Reed rebound
st.reedBevel = Math.max(0, st.reedBevel - frame.dt * 8.0);
const reedY = fellY - st.reedBevel * 18 * tension;

// Background: wooden loom chamber and ambient darkness
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Loom side frames and crossbeams
ctx.fillStyle = pal.wood;
ctx.fillRect(loomMarginX - 28, 0, 24, H);
ctx.fillRect(W - loomMarginX + 4, 0, 24, H);
ctx.fillRect(loomMarginX - 32, heddleY - 20, loomWidth + 64, 14);
ctx.fillRect(loomMarginX - 32, fellY - 24, loomWidth + 64, 8);
ctx.fillRect(loomMarginX - 32, rollerY + 4, loomWidth + 64, 20);

// Update shuttle flight
const targetShuttleX = st.shuttleDir > 0 ? (W - loomMarginX) : loomMarginX;
st.shuttleX += (targetShuttleX - st.shuttleX) * Math.min(1, frame.dt * speedMul * 12);

// 1. WOVEN CLOTH REGION (Rendered row by row)
ctx.save();
// Clip to cloth fell down to roller
ctx.beginPath();
ctx.rect(loomMarginX - 6, fellY - 2, loomWidth + 12, clothH + 12);
ctx.clip();

const dropOffset = st.clothDrop;
const rowsToDraw = Math.min(st.activeRow, MAX_ROWS);

for (let r = 0; r < rowsToDraw; r++) {
  const rowY = fellY + (rowsToDraw - 1 - r) * rowSpacing + dropOffset;
  if (rowY > rollerY + 40) continue;

  const rowIdx = r * MAX_WARP;
  for (let c = 0; c < warpCount; c++) {
    const isWarpUp = st.grid[rowIdx + c] === 1;
    const cellX = loomMarginX + c * dx;

    // Over/Under interlacing shading
    if (isWarpUp) {
      ctx.fillStyle = pal.warp;
      ctx.fillRect(cellX - dx * 0.45, rowY - rowSpacing * 0.5, dx * 0.9, rowSpacing * 0.95);
      // Warp specular highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(cellX - dx * 0.15, rowY - rowSpacing * 0.5, dx * 0.3, rowSpacing * 0.95);
    } else {
      ctx.fillStyle = pal.weft;
      ctx.fillRect(cellX - dx * 0.5, rowY - rowSpacing * 0.4, dx, rowSpacing * 0.8);
      // Weft thread shadow in the pit
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(cellX - dx * 0.5, rowY - rowSpacing * 0.4, dx * 0.25, rowSpacing * 0.8);
    }
  }
}

// Cut-off slice effect with shears sparks
if (st.cutAnim > 0) {
  const cutY = fellY + dropOffset * 0.3;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(loomMarginX - 10, cutY);
  ctx.lineTo(W - loomMarginX + 10, cutY);
  ctx.stroke();
  ctx.setLineDash([]);
}
ctx.restore();

// 2. WARP THREADS & HEDDLE SHED (Upper loom section)
// Interpolate heddle harness lifting heights
const activeR = Math.max(0, st.activeRow - 1) * MAX_WARP;
for (let c = 0; c < warpCount; c++) {
  const targetHeddle = st.grid[activeR + c] === 1 ? 1 : -1;
  st.heddles[c] += (targetHeddle - st.heddles[c]) * Math.min(1, frame.dt * 18);
}

// Draw warp threads descending through heddle eyes to the fell
const roomAudBass = audio.bass * 6 * tension;
for (let c = 0; c < warpCount; c++) {
  const x = loomMarginX + c * dx;
  const shedLift = st.heddles[c] * 16 * tension;
  const bassVibe = Math.sin(frame.t * 30 + c * 0.5) * roomAudBass;

  // Thread color subtly tintable by connected audience member
  let threadCol = pal.warp;
  if (room.people && room.people.length > 0) {
    const person = room.people[c % room.people.length];
    if (person && c % 6 === 0) {
      threadCol = `hsl(${person.hue}, 80%, 65%)`;
    }
  }

  ctx.strokeStyle = threadCol;
  ctx.lineWidth = Math.max(1, dx * 0.32);
  ctx.beginPath();
  ctx.moveTo(x + bassVibe, 0);
  ctx.lineTo(x + shedLift * 0.4, heddleY);
  ctx.lineTo(x, fellY);
  ctx.stroke();

  // Heddle eyelet (heddle wire needle)
  ctx.fillStyle = pal.reed;
  ctx.fillRect(x + shedLift * 0.4 - 2, heddleY - 3, 4, 6);
}

// 3. JACQUARD PUNCH CARDS (Top decorative mechanism)
ctx.fillStyle = '#1e1a17';
ctx.fillRect(loomMarginX + 20, 10, loomWidth - 40, 24);
ctx.fillStyle = pal.acc;
const cardSpacing = loomWidth / 32;
for (let i = 0; i < 32; i++) {
  const cx = loomMarginX + 30 + i * cardSpacing;
  const cy = 22 + Math.sin(frame.t * 4 + i) * 2;
  const holeBit = evalJacquard(i * 3, (st.activeRow >> 2), styleKey, st.cycleCount & 7);
  if (holeBit) {
    ctx.fillRect(cx, cy, 5, 8);
  }
}

// 4. REED BEATER (Vertical comb slamming down onto fell)
ctx.fillStyle = pal.reed;
ctx.fillRect(loomMarginX - 8, reedY - 8, loomWidth + 16, 6);
ctx.strokeStyle = 'rgba(255,255,255,0.2)';
ctx.lineWidth = 1;
for (let c = 0; c < warpCount; c += 2) {
  const rx = loomMarginX + c * dx;
  ctx.beginPath();
  ctx.moveTo(rx, reedY - 8);
  ctx.lineTo(rx, reedY + 8);
  ctx.stroke();
}

// 5. FLYING SHUTTLE (darting across weft shed)
const shutY = fellY - 14 - st.reedBevel * 12;
const shutW = 34;
const shutH = 10;

// Shuttle body
ctx.fillStyle = '#f0a830';
ctx.beginPath();
ctx.moveTo(st.shuttleX - shutW * 0.5 * st.shuttleDir, shutY);
ctx.lineTo(st.shuttleX + shutW * 0.5 * st.shuttleDir, shutY - shutH * 0.5);
ctx.lineTo(st.shuttleX + shutW * 0.7 * st.shuttleDir, shutY);
ctx.lineTo(st.shuttleX + shutW * 0.5 * st.shuttleDir, shutY + shutH * 0.5);
ctx.closePath();
ctx.fill();

// Shuttle pirn (thread spool in center)
ctx.fillStyle = pal.weft;
ctx.fillRect(st.shuttleX - 6, shutY - 2.5, 12, 5);

// Trailing weft yarn
ctx.strokeStyle = pal.weft;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(st.shuttleX - 10 * st.shuttleDir, shutY);
ctx.lineTo(st.shuttleDir > 0 ? loomMarginX : (W - loomMarginX), fellY);
ctx.stroke();

// 6. BOTTOM CLOTH ROLLER (Take-up cylinder)
const rollerGrad = ctx.createLinearGradient(0, rollerY - 12, 0, rollerY + 24);
rollerGrad.addColorStop(0, '#111');
rollerGrad.addColorStop(0.5, '#44342a');
rollerGrad.addColorStop(1, '#080808');
ctx.fillStyle = rollerGrad;
ctx.fillRect(loomMarginX - 14, rollerY - 10, loomWidth + 28, 26);

// Metallic ratchets on roller ends
ctx.fillStyle = '#8f7d6b';
ctx.beginPath();
ctx.arc(loomMarginX - 14, rollerY + 3, 14, 0, Math.PI * 2);
ctx.arc(W - loomMarginX + 14, rollerY + 3, 14, 0, Math.PI * 2);
ctx.fill();

ctx.restore();