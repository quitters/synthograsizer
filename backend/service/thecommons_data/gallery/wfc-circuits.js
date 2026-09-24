const paletteChoice = getVar('pcb_palette') ?? 'cyber_green';
const speedChoice = getVar('collapse_speed') ?? 'overclocked';
const traceStyle = getVar('trace_style') ?? 'clean_bus';
const pulseDensity = getVar('pulse_density') ?? 4;

const PALETTES = {
  cyber_green: { bg: '#03140a', board: '#072414', trace: '#00ff88', pad: '#43ffaf', chip: '#020b05', glow: 'rgba(0, 255, 136, 0.45)' },
  deep_navy:   { bg: '#020817', board: '#071630', trace: '#00d0ff', pad: '#7be3ff', chip: '#010913', glow: 'rgba(0, 208, 255, 0.45)' },
  matte_black: { bg: '#080808', board: '#121212', trace: '#ff8800', pad: '#ffbb44', chip: '#040404', glow: 'rgba(255, 136, 0, 0.45)' },
  amber_gold:  { bg: '#140c02', board: '#241606', trace: '#ffd000', pad: '#fff280', chip: '#0d0701', glow: 'rgba(255, 208, 0, 0.45)' }
};
const pal = PALETTES[paletteChoice] ?? PALETTES.cyber_green;

const STEPS_PER_FRAME = {
  methodical: 2,
  overclocked: 5,
  quantum_burst: 12
}[speedChoice] ?? 5;

const COLS = 24;
const ROWS = 14;
const TOTAL = COLS * ROWS;
const FULL_MASK = 0xFFFF;

// Precalculated tile socket lookups (N, E, S, W in bit 3,2,1,0)
// Socket 0 = closed/open air, 1 = trace
// Direction offsets: 0:N (-COLS), 1:E (+1), 2:S (+COLS), 3:W (-1)
if (!room.state.init) {
  room.state.init = true;
  room.state.masks = new Uint16Array(TOTAL);
  room.state.collapsed = new Int16Array(TOTAL); // -1 if uncollapsed, 0..15 if collapsed
  room.state.collapseOrder = new Float32Array(TOTAL); // timestamp of collapse for fade-in
  room.state.queue = new Int32Array(TOTAL);
  room.state.pulses = [];
  room.state.stage = 'collapsing'; // 'collapsing' | 'stable' | 'dissolving'
  room.state.stageTime = 0;
  room.state.cycle = 0;
  
  // Weight bias for chips/empty to give rich microcircuit structure
  const w = new Float32Array(16);
  for (let i = 0; i < 16; i++) {
    const edges = ((i >> 3) & 1) + ((i >> 2) & 1) + ((i >> 1) & 1) + (i & 1);
    w[i] = edges === 0 ? 0.35 : (edges === 4 ? 0.8 : 1.2);
  }
  room.state.tileWeights = w;
}

const masks = room.state.masks;
const collapsed = room.state.collapsed;
const collapseOrder = room.state.collapseOrder;

function resetWFC() {
  for (let i = 0; i < TOTAL; i++) {
    masks[i] = FULL_MASK;
    collapsed[i] = -1;
    collapseOrder[i] = -1;
  }
  // Seed center with IC Chip (tile 15: [1,1,1,1])
  const mid = (Math.floor(ROWS / 2) * COLS) + Math.floor(COLS / 2);
  collapseCell(mid, 15, 0);
  propagate(mid);
  room.state.stage = 'collapsing';
  room.state.stageTime = frame.t;
  room.state.cycle++;
}

function popcount(n) {
  let c = 0;
  while (n > 0) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

function collapseCell(idx, tileIdx, time) {
  masks[idx] = 1 << tileIdx;
  collapsed[idx] = tileIdx;
  collapseOrder[idx] = time;
}

function propagate(startIdx) {
  let qHead = 0;
  let qTail = 0;
  room.state.queue[qTail++] = startIdx;
  
  while (qHead < qTail) {
    const curr = room.state.queue[qHead++];
    const cx = curr % COLS;
    const cy = (curr / COLS) | 0;
    const cMask = masks[curr];
    
    for (let d = 0; d < 4; d++) {
      let nx = cx, ny = cy, nIdx = -1;
      if (d === 0 && cy > 0) { ny = cy - 1; nIdx = curr - COLS; }
      else if (d === 1 && cx < COLS - 1) { nx = cx + 1; nIdx = curr + 1; }
      else if (d === 2 && cy < ROWS - 1) { ny = cy + 1; nIdx = curr + COLS; }
      else if (d === 3 && cx > 0) { nx = cx - 1; nIdx = curr - 1; }
      if (nIdx === -1) continue;
      
      const opp = (d + 2) % 4;
      // Compute allowed socket values coming from curr towards neighbor
      let allowsZero = false;
      let allowsOne = false;
      for (let t = 0; t < 16; t++) {
        if ((cMask & (1 << t)) !== 0) {
          if (((t >> (3 - d)) & 1) === 1) allowsOne = true;
          else allowsZero = true;
        }
      }
      
      let validMask = 0;
      const nMask = masks[nIdx];
      for (let t = 0; t < 16; t++) {
        if ((nMask & (1 << t)) !== 0) {
          const socket = (t >> (3 - opp)) & 1;
          if ((socket === 1 && allowsOne) || (socket === 0 && allowsZero)) {
            validMask |= (1 << t);
          }
        }
      }
      
      if (validMask !== nMask) {
        masks[nIdx] = validMask;
        if (qTail < TOTAL - 1) room.state.queue[qTail++] = nIdx;
      }
    }
  }
}

// Check if initial reset needed
if (collapsed[0] === 0 && collapsed[1] === 0 && room.state.cycle === 0) {
  resetWFC();
}

// State Machine: Collapsing -> Stable -> Dissolving -> Reset
const elapsedInStage = frame.t - room.state.stageTime;

if (room.state.stage === 'collapsing') {
  let steps = STEPS_PER_FRAME;
  if (audio.beat) steps *= 2;
  
  for (let s = 0; s < steps; s++) {
    let minEntropy = 999;
    let bestIdx = -1;
    // Pick uncollapsed cell with minimum entropy > 1 (add small jitter to prevent banding)
    for (let i = 0; i < TOTAL; i++) {
      if (collapsed[i] === -1) {
        const count = popcount(masks[i]);
        if (count > 0 && count < minEntropy) {
          minEntropy = count;
          bestIdx = i;
        }
      }
    }
    
    if (bestIdx === -1 || minEntropy === 999) {
      room.state.stage = 'stable';
      room.state.stageTime = frame.t;
      break;
    } else {
      // Pick a tile weighted from available candidates
      const m = masks[bestIdx];
      const candidates = [];
      for (let t = 0; t < 16; t++) {
        if ((m & (1 << t)) !== 0) candidates.push(t);
      }
      const chosen = candidates[(Math.random() * candidates.length) | 0];
      collapseCell(bestIdx, chosen, frame.t);
      propagate(bestIdx);
    }
  }
} else if (room.state.stage === 'stable') {
  if (elapsedInStage > 6.0 || (elapsedInStage > 3.0 && audio.bass > 0.65)) {
    room.state.stage = 'dissolving';
    room.state.stageTime = frame.t;
  }
} else if (room.state.stage === 'dissolving') {
  if (elapsedInStage > 1.4) {
    resetWFC();
  }
}

// Spawn active electrical pulses along connected traces
const maxPulses = pulseDensity * 10;
if (room.state.pulses.length < maxPulses && Math.random() < 0.35 + audio.treble * 0.4) {
  const rx = (Math.random() * COLS) | 0;
  const ry = (Math.random() * ROWS) | 0;
  const rIdx = ry * COLS + rx;
  if (collapsed[rIdx] > 0) {
    room.state.pulses.push({
      x: rx + 0.5,
      y: ry + 0.5,
      dir: (Math.random() * 4) | 0,
      life: 1.0,
      hue: room.people.length > 0 ? room.people[room.state.pulses.length % room.people.length].hue : 140
    });
  }
}

// Render pass
ctx.save();
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const cellW = frame.width / COLS;
const cellH = frame.height / ROWS;
const halfW = cellW * 0.5;
const halfH = cellH * 0.5;
const traceW = Math.max(2, (traceStyle === 'high_voltage' ? 6 : (traceStyle === 'dense_microchip' ? 2.5 : 4)) + audio.bass * 2);

// Board background subtle grid
ctx.strokeStyle = pal.board;
ctx.lineWidth = 1;
for (let x = 0; x <= COLS; x++) {
  ctx.beginPath();
  ctx.moveTo(x * cellW, 0);
  ctx.lineTo(x * cellW, frame.height);
  ctx.stroke();
}
for (let y = 0; y <= ROWS; y++) {
  ctx.beginPath();
  ctx.moveTo(0, y * cellH);
  ctx.lineTo(frame.width, y * cellH);
  ctx.stroke();
}

// Dissolve wipe progress
const dissolveProgress = room.state.stage === 'dissolving' ? Math.min(1.0, elapsedInStage / 1.2) : 0;

// Draw collapsed tiles
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const idx = y * COLS + x;
    const tile = collapsed[idx];
    const cx = x * cellW + halfW;
    const cy = y * cellH + halfH;
    
    // Entropy cloud for uncollapsed cells
    if (tile === -1) {
      const count = popcount(masks[idx]);
      const alpha = 0.08 + (1 - count / 16) * 0.2 + audio.mid * 0.08;
      ctx.fillStyle = pal.glow;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x * cellW + 3, y * cellH + 3, cellW - 6, cellH - 6);
      ctx.globalAlpha = 1.0;
      continue;
    }
    
    // Dissolve calculation: cells dissolve with diagonal sweep + noise
    if (dissolveProgress > 0) {
      const delay = (x / COLS + y / ROWS) * 0.5;
      if (dissolveProgress > delay) {
        const fade = 1.0 - Math.min(1.0, (dissolveProgress - delay) * 3);
        if (fade <= 0.01) continue;
        ctx.globalAlpha = fade;
      }
    }
    
    // Tile Sockets
    const n = (tile >> 3) & 1;
    const e = (tile >> 2) & 1;
    const s = (tile >> 1) & 1;
    const w = tile & 1;
    const degree = n + e + s + w;
    
    // Chip body if 4-way or 0-way with dense style
    if (degree === 4 || (degree === 0 && traceStyle === 'dense_microchip')) {
      ctx.fillStyle = pal.chip;
      ctx.fillRect(cx - halfW * 0.55, cy - halfH * 0.55, cellW * 0.55, cellH * 0.55);
      ctx.strokeStyle = pal.pad;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - halfW * 0.55, cy - halfH * 0.55, cellW * 0.55, cellH * 0.55);
      
      // IC notch / status LED
      ctx.fillStyle = audio.beat ? '#ffffff' : pal.trace;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5 + audio.bass * 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (degree === 1) {
      // Solder pad at termination
      ctx.fillStyle = pal.pad;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.chip;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw Traces
    if (degree > 0) {
      ctx.strokeStyle = pal.trace;
      ctx.lineWidth = traceW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (n) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - halfH); }
      if (e) { ctx.moveTo(cx, cy); ctx.lineTo(cx + halfW, cy); }
      if (s) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + halfH); }
      if (w) { ctx.moveTo(cx, cy); ctx.lineTo(cx - halfW, cy); }
      ctx.stroke();
      
      // Soft circuit glow
      ctx.strokeStyle = pal.glow;
      ctx.lineWidth = traceW + 4;
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1.0;
  }
}

// Update and draw live signal pulses
ctx.shadowBlur = 12;
for (let i = room.state.pulses.length - 1; i >= 0; i--) {
  const p = room.state.pulses[i];
  const px = (p.x * cellW);
  const py = (p.y * cellH);
  
  ctx.fillStyle = `hsl(${p.hue}, 100%, 75%)`;
  ctx.shadowColor = ctx.fillStyle;
  ctx.beginPath();
  ctx.arc(px, py, 3.5 + audio.mid * 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Move along grid
  const speed = 0.08 * (1.0 + audio.treble * 1.5);
  if (p.dir === 0) p.y -= speed;
  else if (p.dir === 1) p.x += speed;
  else if (p.dir === 2) p.y += speed;
  else if (p.dir === 3) p.x -= speed;
  
  // Turn on cell intersection
  const curCellX = Math.floor(p.x);
  const curCellY = Math.floor(p.y);
  if (curCellX >= 0 && curCellX < COLS && curCellY >= 0 && curCellY < ROWS) {
    const t = collapsed[curCellY * COLS + curCellX];
    if (t > 0 && Math.random() < 0.1) {
      const validDirs = [];
      if ((t >> 3) & 1) validDirs.push(0);
      if ((t >> 2) & 1) validDirs.push(1);
      if ((t >> 1) & 1) validDirs.push(2);
      if (t & 1) validDirs.push(3);
      if (validDirs.length > 0) {
        p.dir = validDirs[(Math.random() * validDirs.length) | 0];
      }
    }
  }
  
  p.life -= 0.015;
  if (p.life <= 0 || p.x < 0 || p.x >= COLS || p.y < 0 || p.y >= ROWS) {
    room.state.pulses.splice(i, 1);
  }
}
ctx.shadowBlur = 0;

// CRT scanline overlay
ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
for (let y = 0; y < frame.height; y += 4) {
  ctx.fillRect(0, y, frame.width, 1.5);
}

ctx.restore();