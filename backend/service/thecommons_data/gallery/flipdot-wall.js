ctx.save();

const COLS = 52;
const ROWS = 28;
const TOTAL = COLS * ROWS;

// Allocate persistent state buffers once
room.state.angles ??= new Float32Array(TOTAL);
room.state.targets ??= new Float32Array(TOTAL);
room.state.jitters ??= new Float32Array(TOTAL).map(() => (Math.random() - 0.5) * 2);
room.state.clackEnergy ??= 0;
room.state.lastBeat ??= 0;

const angles = room.state.angles;
const targets = room.state.targets;
const jitters = room.state.jitters;

// Theme lookup table
const PALETTES = {
  'Fluo Yellow': { on: '#eaff00', onEdge: '#b8cc00', glow: 'rgba(234, 255, 0, 0.22)', rim: '#fffb91' },
  'Transit Amber': { on: '#ff9d00', onEdge: '#c97200', glow: 'rgba(255, 157, 0, 0.25)', rim: '#ffd47d' },
  'Cyber Mint': { on: '#00ffbf', onEdge: '#00b887', glow: 'rgba(0, 255, 191, 0.22)', rim: '#a3ffe6' },
  'Hot Coral': { on: '#ff2e63', onEdge: '#ba1741', glow: 'rgba(255, 46, 99, 0.25)', rim: '#ffa8be' },
  'Paper White': { on: '#f0f4f8', onEdge: '#a9b7c6', glow: 'rgba(240, 244, 248, 0.18)', rim: '#ffffff' }
};

const curPalette = PALETTES[getVar('palette')] ?? PALETTES['Fluo Yellow'];
const pattern = getVar('pattern_mode') ?? 'Kinetic Waves';
const axis = getVar('flip_axis') ?? 'Diagonal';
const flipSpeed = (getVar('flip_speed') ?? 12) * Math.min(0.05, frame.dt || 0.016);
const jitterAmp = (getVar('mechanical_jitter') ?? 0.3) * 0.35;
const showGlow = getVar('dot_glow') ?? true;

// Board dimensions
const marginX = frame.width * 0.04;
const marginY = frame.height * 0.06;
const boardW = frame.width - marginX * 2;
const boardH = frame.height - marginY * 2;
const cellW = boardW / COLS;
const cellH = boardH / ROWS;
const discR = Math.min(cellW, cellH) * 0.44;

// Background chassis (deep charcoal industrial matte)
ctx.fillStyle = '#060709';
ctx.fillRect(0, 0, frame.width, frame.height);

// Board casing
ctx.fillStyle = '#0e1117';
ctx.beginPath();
ctx.roundRect(marginX - 10, marginY - 10, boardW + 20, boardH + 20, 8);
ctx.fill();
ctx.strokeStyle = '#1e2430';
ctx.lineWidth = 2;
ctx.stroke();

// Audio triggers
const bass = audio.bass ?? 0;
const beat = audio.beat;
if (beat && frame.t - room.state.lastBeat > 0.12) {
  room.state.clackEnergy = Math.min(room.state.clackEnergy + 0.6 + bass * 0.4, 2.0);
  room.state.lastBeat = frame.t;
}
room.state.clackEnergy *= 0.88;

// People magnetic nodes
const people = room.people ?? [];
const pCount = Math.min(people.length, 12);

// Compute binary target pattern
const time = frame.t * 1.3;
for (let y = 0; y < ROWS; y++) {
  const ny = y / (ROWS - 1) - 0.5;
  for (let x = 0; x < COLS; x++) {
    const idx = y * COLS + x;
    const nx = x / (COLS - 1) - 0.5;
    let val = 0;

    if (pattern === 'Kinetic Waves') {
      const d = Math.hypot(nx, ny * 1.5);
      const w1 = Math.sin(d * 14 - time * 2.5 + bass * 3.0);
      const w2 = Math.cos(nx * 10 + ny * 6 + time * 1.2);
      val = (w1 + w2 * 0.7) > 0.1 ? 1 : 0;
    } else if (pattern === 'Morphing Glyphs') {
      const phase = Math.floor(time * 0.4) % 3;
      const d = Math.hypot(nx * 1.4, ny * 1.4);
      if (phase === 0) {
        // Concentric diamond boxes
        const box = Math.max(Math.abs(nx * 1.3), Math.abs(ny * 1.3));
        val = (Math.sin(box * 20 - time * 2) > 0.2) ? 1 : 0;
      } else if (phase === 1) {
        // Expanding rings
        val = (Math.sin(d * 18 - time * 3) > 0.15) ? 1 : 0;
      } else {
        // Stigmergic crosshairs
        const cross = Math.min(Math.abs(nx), Math.abs(ny));
        val = (cross < 0.08 || d < 0.28 || Math.sin((nx + ny) * 12 + time * 2) > 0.5) ? 1 : 0;
      }
    } else if (pattern === 'Audio Equalizer') {
      const colNorm = x / COLS;
      const barH = (0.15 + (Math.sin(colNorm * 9 + time * 2) * 0.35 + 0.4) * (0.4 + bass * 0.8) + (audio.mid ?? 0.2) * 0.3);
      const revY = (ROWS - 1 - y) / ROWS;
      val = (revY <= barH) ? 1 : 0;
    } else if (pattern === 'Radar Scan') {
      const angle = Math.atan2(ny, nx) + Math.PI;
      const sweep = (time * 2.4) % (Math.PI * 2);
      let diff = (sweep - angle + Math.PI * 4) % (Math.PI * 2);
      val = (diff < 1.0 || Math.abs(Math.hypot(nx * 2, ny * 2) - 0.6) < 0.06) ? 1 : 0;
    } else if (pattern === 'Vortex') {
      const r = Math.hypot(nx, ny) + 0.001;
      const theta = Math.atan2(ny, nx);
      const spiral = Math.sin(theta * 3 - Math.log(r) * 5 + time * 3.5);
      val = spiral > 0.05 ? 1 : 0;
    }

    // People presence imprint
    for (let p = 0; p < pCount; p++) {
      const person = people[p];
      const px = ((person.hue * 13) % 40) / 40 - 0.5;
      const py = (((person.hue * 29) + p * 31) % 24) / 24 - 0.5;
      const pd = Math.hypot(nx - px, ny - py);
      if (pd < 0.12) {
        val = 1;
      }
    }

    targets[idx] = val;
  }
}

// Update dot angles with mechanical step response
let flippedCount = 0;
for (let i = 0; i < TOTAL; i++) {
  const targetAngle = targets[i] * Math.PI;
  let diff = targetAngle - angles[i];
  const jitter = jitters[i] * jitterAmp;
  const step = (flipSpeed + jitter * 0.04);
  
  if (Math.abs(diff) > 0.01) {
    angles[i] += Math.sign(diff) * Math.min(Math.abs(diff), step);
  } else {
    angles[i] = targetAngle;
  }
  if (angles[i] > 1.2) flippedCount++;
}

// Large diffuse background glow if dots are predominantly lit
if (showGlow && flippedCount > 50) {
  const glowAlpha = Math.min(0.35, (flippedCount / TOTAL) * 0.45 + (bass * 0.15));
  const grad = ctx.createRadialGradient(frame.width * 0.5, frame.height * 0.5, 50, frame.width * 0.5, frame.height * 0.5, frame.width * 0.6);
  grad.addColorStop(0, curPalette.glow.replace(/\d?\.?\d+\)$/, `${glowAlpha})`));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(marginX, marginY, boardW, boardH);
}

// Axis-specific squish vectors
const isDiag = axis === 'Diagonal';
const isVert = axis === 'Vertical';

// Precomputed constants for flip geometry
const OFF_BASE = '#11141a';
const OFF_RIM = '#232936';
const PIN_COLOR = '#05070a';

// Render physical flip-dot grid
for (let y = 0; y < ROWS; y++) {
  const cy = marginY + (y + 0.5) * cellH;
  const rowOffset = y * COLS;

  for (let x = 0; x < COLS; x++) {
    const cx = marginX + (x + 0.5) * cellW;
    const idx = rowOffset + x;
    const a = angles[idx];

    // Recessed dark socket background
    ctx.fillStyle = '#080a0e';
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fill();

    // Subtle mounting pin / shadow in cavity
    ctx.fillStyle = '#030406';
    ctx.fillRect(cx - discR * 0.9, cy - 1, discR * 1.8, 2);

    // 3D rotation projection factor [-1 .. +1]
    // a = 0 (Off, black face), a = PI (On, fluorescent face)
    const cosA = Math.cos(a);
    const isFront = cosA < 0; // Rotated towards bright face
    const scaleAlongAxis = Math.abs(cosA);

    ctx.save();
    ctx.translate(cx, cy);
    if (isDiag) {
      ctx.rotate(Math.PI * 0.25);
    } else if (isVert) {
      ctx.rotate(Math.PI * 0.5);
    }

    // Mechanical edge thickness when disc is mid-flip
    if (scaleAlongAxis < 0.9) {
      const edgeH = (1 - scaleAlongAxis) * discR * 0.35;
      ctx.fillStyle = isFront ? curPalette.onEdge : '#1b2029';
      ctx.beginPath();
      ctx.ellipse(0, cosA * discR * 0.15, discR * 0.96, Math.max(1, discR * scaleAlongAxis + edgeH), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Disc face
    ctx.beginPath();
    ctx.ellipse(0, 0, discR * 0.96, Math.max(0.6, discR * scaleAlongAxis), 0, 0, Math.PI * 2);
    
    if (isFront) {
      // Lit yellow/neon side
      ctx.fillStyle = curPalette.on;
      ctx.fill();
      
      // Fine specular disc bevel highlight
      if (scaleAlongAxis > 0.4) {
        ctx.strokeStyle = curPalette.rim;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    } else {
      // Dark matte charcoal side
      ctx.fillStyle = OFF_BASE;
      ctx.fill();
      ctx.strokeStyle = OFF_RIM;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Center pivot axle rivet
    ctx.fillStyle = PIN_COLOR;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(2.2, discR * 0.18), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// Frame border brass rivets & status LED
ctx.fillStyle = '#1c222c';
for (let i = 0; i <= COLS; i += 8) {
  const rx = marginX + (i / COLS) * boardW;
  ctx.beginPath();
  ctx.arc(rx, marginY - 5, 2, 0, Math.PI * 2);
  ctx.arc(rx, marginY + boardH + 5, 2, 0, Math.PI * 2);
  ctx.fill();
}

// Mechanical solenoids active indicator LED
const ledActive = room.state.clackEnergy > 0.2;
ctx.fillStyle = ledActive ? '#ff2a2a' : '#3d0a0a';
ctx.beginPath();
ctx.arc(marginX + 8, marginY - 4, 2.5, 0, Math.PI * 2);
ctx.fill();

ctx.restore();