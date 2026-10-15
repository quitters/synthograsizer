const paletteKey = getVar('palette') || 'persian_agate';
const styleKey = getVar('pattern_style') || 'nonpareil';
const tinePitch = getVar('comb_density') ?? 32;
const viscosity = getVar('ink_viscosity') ?? 1.0;
const audioReact = getVar('audio_reactivity') ?? 1.2;

const PALETTES = {
  persian_agate: ['#1c1b22', '#2a4d69', '#3b8686', '#79cbb8', '#e09f3e', '#9e2a2b', '#f4f1de'],
  suminagashi:   ['#0f1115', '#252830', '#4a4e5a', '#8b939c', '#d3d6dc', '#9b2226', '#f8f9fa'],
  malachite:     ['#0b1d16', '#14453d', '#1f6e5b', '#399e82', '#6bcfad', '#c8963e', '#e9f5ed'],
  venetian_silk: ['#1a0921', '#3b1845', '#7a2858', '#b83b5e', '#f08a5d', '#eeecda', '#438a9a']
};
const colors = PALETTES[paletteKey] || PALETTES.persian_agate;

// Simulation constants
const NUM_LINES = 108;
const PTS_PER_LINE = 140;
const TOTAL_PTS = NUM_LINES * PTS_PER_LINE;

// Preallocate fixed-size buffers in room.state
if (!room.state.init || room.state.lineCount !== NUM_LINES) {
  room.state.init = true;
  room.state.lineCount = NUM_LINES;
  room.state.x = new Float32Array(TOTAL_PTS);
  room.state.y = new Float32Array(TOTAL_PTS);
  room.state.origY = new Float32Array(NUM_LINES);
  room.state.actionTimer = 0;
  room.state.actionStep = 0;
  room.state.lastBeatTime = 0;

  // Initialize pristine horizontal ink bands
  for (let l = 0; l < NUM_LINES; l++) {
    const ny = (l + 0.5) / NUM_LINES;
    room.state.origY[l] = ny;
    for (let p = 0; p < PTS_PER_LINE; p++) {
      const idx = l * PTS_PER_LINE + p;
      room.state.x[idx] = p / (PTS_PER_LINE - 1);
      room.state.y[idx] = ny;
    }
  }
}

const X = room.state.x;
const Y = room.state.y;

// Mathematical Marbling Operator: Radial Drop (Lu et al.)
// Displaces coordinates outward preserving volume
function applyDrop(cx, cy, radius) {
  const r2 = radius * radius;
  for (let i = 0; i < TOTAL_PTS; i++) {
    const dx = X[i] - cx;
    const dy = Y[i] - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1e-7) {
      const factor = Math.sqrt(1 + r2 / d2);
      X[i] = cx + dx * factor;
      Y[i] = cy + dy * factor;
    }
  }
}

// Mathematical Marbling Operator: Tine Comb Stroke
// Displaces bath along dirX, dirY shaped by distance to tine lines
function applyComb(pitch, dirX, dirY, strength, alternate) {
  const normalX = -dirY;
  const normalY = dirX;
  const halfPitch = pitch * 0.5;
  for (let i = 0; i < TOTAL_PTS; i++) {
    const proj = X[i] * normalX + Y[i] * normalY;
    let cell = Math.floor(proj / pitch);
    let offset = proj - (cell * pitch + halfPitch);
    let d = offset / halfPitch; // -1 to 1 across tooth span
    let falloff = 0.5 * (1 + Math.cos(d * Math.PI));
    if (alternate && (cell % 2 !== 0)) falloff = -falloff;
    X[i] += dirX * strength * falloff;
    Y[i] += dirY * strength * falloff;
  }
}

// Re-center and gently relax bath edges to remain framed
function relaxBounds() {
  const damping = 0.9992;
  for (let i = 0; i < TOTAL_PTS; i++) {
    X[i] = (X[i] - 0.5) * damping + 0.5;
    Y[i] = (Y[i] - 0.5) * damping + 0.5;
  }
}
relaxBounds();

// Timed and audio-driven Ebru transformations
room.state.actionTimer += frame.dt * viscosity;
const isBeat = audio.beat && (frame.t - room.state.lastBeatTime > 0.35);
if (isBeat) {
  room.state.lastBeatTime = frame.t;
  const bx = 0.2 + 0.6 * ((frame.t * 0.37) % 1);
  const by = 0.2 + 0.6 * ((frame.t * 0.53) % 1);
  const dropSize = (0.04 + audio.bass * 0.08) * audioReact;
  applyDrop(bx, by, dropSize);
}

// Routine combing sequences based on chosen pattern style
if (room.state.actionTimer > 1.8) {
  room.state.actionTimer = 0;
  const step = room.state.actionStep++;
  const pNorm = tinePitch / 800;

  if (styleKey === 'gelgit') {
    // Gelgit: alternating vertical comb back and forth
    const dir = (step % 2 === 0) ? 1 : -1;
    applyComb(pNorm * 1.5, 0, dir, 0.06 * dir, true);
  } else if (styleKey === 'nonpareil') {
    // Nonpareil: Gelgit foundation followed by fine perpendicular combing
    if (step % 4 < 2) {
      applyComb(pNorm * 2.0, 0, 1, 0.045, true);
    } else {
      applyComb(pNorm * 0.75, 1, 0, 0.035, false);
    }
  } else {
    // Bouquet / Peacock: wavy serpentine tine pass
    const angle = (step * 0.78);
    applyComb(pNorm * 1.6, Math.cos(angle), Math.sin(angle), 0.05, true);
    applyDrop(0.5 + 0.2 * Math.cos(angle * 2), 0.5 + 0.2 * Math.sin(angle * 2), 0.04);
  }

  // Periodic drop insertion at connected people's assigned coordinates
  if (room.people && room.people.length > 0) {
    const p = room.people[step % room.people.length];
    const px = ((p.hue * 11) % 79) / 80 + 0.1;
    const py = ((p.hue * 23) % 73) / 80 + 0.1;
    applyDrop(px, py, 0.035 * audioReact);
  }
}

// Subtle ongoing audio shear
if (audio.mid > 0.4) {
  const micro = (audio.mid - 0.4) * 0.003 * audioReact;
  for (let i = 0; i < TOTAL_PTS; i++) {
    X[i] += Math.sin(Y[i] * 18.0 + frame.t) * micro;
  }
}

// Render marbling ribbons
ctx.save();
ctx.fillStyle = colors[0];
ctx.fillRect(0, 0, frame.width, frame.height);

const w = frame.width;
const h = frame.height;
const numColors = colors.length;

for (let l = 0; l < NUM_LINES - 1; l++) {
  const colIndex = 1 + (l % (numColors - 1));
  ctx.fillStyle = colors[colIndex];
  ctx.beginPath();

  // Forward along current line
  const startIdxA = l * PTS_PER_LINE;
  ctx.moveTo(X[startIdxA] * w, Y[startIdxA] * h);
  for (let p = 1; p < PTS_PER_LINE; p++) {
    ctx.lineTo(X[startIdxA + p] * w, Y[startIdxA + p] * h);
  }

  // Backward along next line to close the ribbon polygon
  const startIdxB = (l + 1) * PTS_PER_LINE;
  for (let p = PTS_PER_LINE - 1; p >= 0; p--) {
    ctx.lineTo(X[startIdxB + p] * w, Y[startIdxB + p] * h);
  }
  ctx.closePath();
  ctx.fill();
}

// Soft specular varnish overlay for fluid bath sheen
const gradient = ctx.createLinearGradient(0, 0, w, h);
gradient.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
gradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, w, h);

// Subtle frame trim
ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
ctx.lineWidth = 2;
ctx.strokeRect(12, 12, w - 24, h - 24);

ctx.restore();