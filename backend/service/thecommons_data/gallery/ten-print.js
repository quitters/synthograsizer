ctx.save();

const palettes = {
  c64_classic:  { bg: '#3a3277', maze: '#a4a2f7', border: '#5044aa', cur: '#ffffff' },
  vic20_cyan:   { bg: '#0e2428', maze: '#5be4d4', border: '#1c4a52', cur: '#a5fff5' },
  amber_crt:    { bg: '#1c1002', maze: '#ffaa1a', border: '#382006', cur: '#ffdd77' },
  matrix_green: { bg: '#031406', maze: '#3bf06f', border: '#0a3010', cur: '#a0ffbe' }
};

const palKey = getVar('palette_theme');
const pal = palettes[palKey] ?? palettes.c64_classic;
const size = getVar('cell_size') ?? 24;
const baseRate = getVar('type_rate') ?? 16;
const biasMode = getVar('maze_bias') ?? 'classic_rnd';
const crtStyle = getVar('crt_style') ?? 'subtle_scanlines';

// Frame and grid boundaries
const margin = Math.max(16, Math.floor(size * 1.4));
const playW = Math.max(size * 4, frame.width - margin * 2);
const playH = Math.max(size * 4, frame.height - margin * 2);
const cols = Math.floor(playW / size);
const rows = Math.floor(playH / size);
const gridLeft = margin + Math.floor((playW - cols * size) * 0.5);
const gridTop = margin + Math.floor((playH - rows * size) * 0.5);

// Precomputed LUT for fast deterministic weave patterns
room.state.lut ??= new Float32Array(512);
if (room.state.lut[0] === 0) {
  for (let i = 0; i < 512; i++) {
    room.state.lut[i] = Math.sin(i * 0.123) * 0.5 + 0.5;
  }
}

// Grid buffer initialization & resize handling
if (!room.state.grid || room.state.cols !== cols || room.state.rows !== rows) {
  room.state.cols = cols;
  room.state.rows = rows;
  room.state.grid = new Uint8Array(cols * rows);
  room.state.headX = 0;
  room.state.headY = 0;
}

const grid = room.state.grid;
const dtNorm = Math.min(2, (frame.dt || 0.016) * 60);
const speedBoost = 1 + (audio.beat ? 2.5 : 0) + audio.level * 1.5;
const printCount = Math.min(128, Math.max(1, Math.round(baseRate * speedBoost * dtNorm)));

// Hot typing loop: write characters and scroll upwards when screen wraps
for (let i = 0; i < printCount; i++) {
  let val = 1;
  if (biasMode === 'classic_rnd') {
    val = Math.random() < 0.5 ? 1 : 2;
  } else if (biasMode === 'bass_skew') {
    val = Math.random() < (0.2 + audio.bass * 0.6) ? 1 : 2;
  } else if (biasMode === 'perlin_weave') {
    const lutIdx = (room.state.headX * 7 + room.state.headY * 13 + Math.floor(frame.t * 10)) & 511;
    val = room.state.lut[lutIdx] > 0.48 ? 1 : 2;
  } else {
    val = ((room.state.headX + room.state.headY) % 4 < 2) ? 1 : 2;
  }

  grid[room.state.headY * cols + room.state.headX] = val;
  room.state.headX++;

  if (room.state.headX >= cols) {
    room.state.headX = 0;
    room.state.headY++;
    if (room.state.headY >= rows) {
      grid.copyWithin(0, cols, cols * rows);
      grid.fill(0, cols * (rows - 1), cols * rows);
      room.state.headY = rows - 1;
    }
  }
}

// Outer border & inner terminal background
ctx.fillStyle = pal.border;
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.fillStyle = pal.bg;
ctx.fillRect(gridLeft - 3, gridTop - 3, cols * size + 6, rows * size + 6);

// Retro header prompt
ctx.fillStyle = pal.maze;
ctx.font = `${Math.max(10, Math.min(13, margin * 0.55))}px monospace`;
ctx.fillText('10 PRINT CHR$(205.5+RND(1)); : GOTO 10', gridLeft, Math.max(14, gridTop - 8));

// Draw all slashes in a single batched stroke
ctx.lineWidth = Math.max(1.5, Math.round(size * 0.14 + audio.bass * 2.2));
ctx.lineCap = 'square';
ctx.strokeStyle = pal.maze;

if (crtStyle === 'phosphor_bloom') {
  ctx.shadowColor = pal.maze;
  ctx.shadowBlur = 6 + audio.bass * 12;
}

ctx.beginPath();
for (let y = 0; y < rows; y++) {
  const cy = gridTop + y * size;
  const rOff = y * cols;
  for (let x = 0; x < cols; x++) {
    const cell = grid[rOff + x];
    if (cell === 1) {
      ctx.moveTo(gridLeft + x * size, cy + size);
      ctx.lineTo(gridLeft + x * size + size, cy);
    } else if (cell === 2) {
      ctx.moveTo(gridLeft + x * size, cy);
      ctx.lineTo(gridLeft + x * size + size, cy + size);
    }
  }
}
ctx.stroke();

ctx.shadowBlur = 0;

// People avatars wandering corridors
if (room.people && room.people.length > 0) {
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const px = ((p * 17 + Math.floor(frame.t * 3)) % cols);
    const py = ((p * 11 + Math.floor(frame.t * 1.5)) % rows);
    ctx.fillStyle = `hsla(${person.hue}, 90%, 65%, 0.8)`;
    ctx.fillRect(gridLeft + px * size + size * 0.3, gridTop + py * size + size * 0.3, size * 0.4, size * 0.4);
  }
}

// Blinking terminal block cursor
const cursorBlink = ((frame.t * 3.2) % 1) > 0.45 || audio.beat;
if (cursorBlink) {
  ctx.fillStyle = pal.cur;
  ctx.fillRect(gridLeft + room.state.headX * size, gridTop + room.state.headY * size, size, size);
}

// CRT scanlines overlay
if (crtStyle === 'subtle_scanlines') {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let sy = 0; sy < frame.height; sy += 4) {
    ctx.fillRect(0, sy, frame.width, 1.5);
  }
}

ctx.restore();