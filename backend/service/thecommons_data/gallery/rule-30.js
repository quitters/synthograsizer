ctx.save();
const COLS = 192;
const ROWS = 120;

room.state.grid ??= Array.from({ length: ROWS }, () => new Uint8Array(COLS));
room.state.head ??= 0;
room.state.rowTimer ??= 0;
room.state.ruleTimer ??= 0;
room.state.ruleIdx ??= 0;
room.state.activeRule ??= 30;
room.state.init ??= false;

if (!room.state.init) {
  const row0 = room.state.grid[0];
  row0.fill(0);
  row0[COLS >> 1] = 1;
  if (room.people && room.people.length > 0) {
    for (let i = 0; i < room.people.length; i++) {
      const col = Math.floor(((i + 1) / (room.people.length + 1)) * COLS);
      row0[col % COLS] = 1;
    }
  }
  room.state.init = true;
}

const rulePacks = {
  curated_trio: [30, 90, 110],
  fractal: [90, 60, 102, 126],
  chaotic: [30, 45, 73, 105],
  complex: [110, 54, 124, 137],
  rule_30: [30],
  rule_90: [90],
  rule_110: [110]
};
const currentPack = rulePacks[getVar('rule_pack')] ?? rulePacks.curated_trio;

const palettes = {
  amber_crt: { bg: '#0d0905', off: '#24170a', on: '#ff9d00', glow: '#ffe082' },
  phosphor_green: { bg: '#020d05', off: '#0b2612', on: '#22e65d', glow: '#a8ffca' },
  cyber_magenta: { bg: '#0d0314', off: '#2b0938', on: '#ff1493', glow: '#00e5ff' },
  blueprint_ice: { bg: '#030f1c', off: '#0c2742', on: '#38bdf8', glow: '#e0f2fe' },
  monochrome_chalk: { bg: '#0c0d10', off: '#20222a', on: '#e2e8f0', glow: '#ffffff' }
};
const pal = palettes[getVar('palette')] ?? palettes.amber_crt;

const cellSize = getVar('cell_size') ?? 14;
const scrollSpeed = getVar('scroll_speed') ?? 30;
const roundness = Math.min(getVar('cell_roundness') ?? 3, cellSize * 0.45);
const glitchMode = getVar('audio_glitch') ?? 'subtle_pulse';

room.state.ruleTimer += frame.dt;
let switchTime = 10.0;
if (glitchMode === 'rule_hop' && audio.beat) {
  room.state.ruleTimer += 4.0;
}
if (room.state.ruleTimer >= switchTime) {
  room.state.ruleTimer = 0;
  room.state.ruleIdx = (room.state.ruleIdx + 1) % currentPack.length;
}
room.state.activeRule = currentPack[room.state.ruleIdx % currentPack.length];

const effectiveSpeed = scrollSpeed * (1.0 + (glitchMode === 'subtle_pulse' ? audio.bass * 0.6 : 0.0));
room.state.rowTimer += frame.dt * effectiveSpeed;

while (room.state.rowTimer >= 1.0) {
  room.state.rowTimer -= 1.0;
  const prevRow = room.state.grid[room.state.head];
  room.state.head = (room.state.head + 1) % ROWS;
  const nextRow = room.state.grid[room.state.head];
  const rule = room.state.activeRule;

  for (let c = 0; c < COLS; c++) {
    const left = c === 0 ? prevRow[COLS - 1] : prevRow[c - 1];
    const center = prevRow[c];
    const right = c === COLS - 1 ? prevRow[0] : prevRow[c + 1];
    const pat = (left << 2) | (center << 1) | right;
    nextRow[c] = (rule >> pat) & 1;
  }

  if (glitchMode === 'mutation' && audio.mid > 0.5) {
    const mutCol = Math.floor((Math.sin(frame.t * 31.7) * 0.5 + 0.5) * COLS);
    nextRow[mutCol] ^= 1;
  }
  if (glitchMode === 'invert_beat' && audio.beat) {
    const slice = Math.floor(COLS * 0.15);
    const start = Math.floor((frame.t * 50) % (COLS - slice));
    for (let k = 0; k < slice; k++) nextRow[start + k] ^= 1;
  }
}

ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const visibleCols = Math.min(COLS, Math.ceil(frame.width / cellSize) + 1);
const visibleRows = Math.min(ROWS, Math.ceil(frame.height / cellSize) + 1);
const startCol = Math.max(0, Math.floor((COLS - visibleCols) * 0.5));
const pad = 1;
const drawSize = Math.max(1, cellSize - pad * 2);
const bassScale = 1.0 + (glitchMode === 'subtle_pulse' ? audio.bass * 0.18 : 0);

const subRow = room.state.rowTimer * cellSize;
const originY = frame.height - subRow;

ctx.fillStyle = pal.off;
for (let r = 0; r < visibleRows; r++) {
  const rowIdx = (room.state.head - r + ROWS) % ROWS;
  const row = room.state.grid[rowIdx];
  const y = originY - r * cellSize;
  if (y < -cellSize || y > frame.height) continue;

  for (let c = 0; c < visibleCols; c++) {
    const colIdx = startCol + c;
    if (colIdx >= COLS) break;
    if (row[colIdx] === 0) {
      const x = c * cellSize + pad;
      if (roundness > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y + pad, drawSize, drawSize, roundness);
        ctx.fill();
      } else {
        ctx.fillRect(x, y + pad, drawSize, drawSize);
      }
    }
  }
}

ctx.fillStyle = audio.beat ? pal.glow : pal.on;
ctx.shadowColor = pal.on;
ctx.shadowBlur = audio.bass > 0.4 ? 10 * audio.bass : 0;

for (let r = 0; r < visibleRows; r++) {
  const rowIdx = (room.state.head - r + ROWS) % ROWS;
  const row = room.state.grid[rowIdx];
  const y = originY - r * cellSize;
  if (y < -cellSize || y > frame.height) continue;

  for (let c = 0; c < visibleCols; c++) {
    const colIdx = startCol + c;
    if (colIdx >= COLS) break;
    if (row[colIdx] === 1) {
      const x = c * cellSize + pad;
      const sz = drawSize * bassScale;
      const offset = (drawSize - sz) * 0.5;
      if (roundness > 0) {
        ctx.beginPath();
        ctx.roundRect(x + offset, y + pad + offset, sz, sz, roundness);
        ctx.fill();
      } else {
        ctx.fillRect(x + offset, y + pad + offset, sz, sz);
      }
    }
  }
}

ctx.shadowBlur = 0;
ctx.fillStyle = pal.glow;
ctx.font = '600 13px monospace';
ctx.textBaseline = 'top';
ctx.fillText(`RULE ${room.state.activeRule.toString().padStart(3, '0')} // AUDIO: ${Math.round(audio.level * 100)}%`, 24, 20);

if (room.people && room.people.length > 0) {
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const px = ((i + 1) / (room.people.length + 1)) * frame.width;
    ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, 0.8)`;
    ctx.fillRect(px - 3, frame.height - 6, 6, 4);
  }
}

ctx.restore();