ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;

const motifKey = getVar('motif') ?? 'rising_sun';
const lightKey = getVar('stadium_lighting') ?? 'floodlit_night';
const waveKey = getVar('wave_style') ?? 'classic_sweep';
const flipSpeed = getVar('flip_speed') ?? 1.5;
const flashbulbs = getVar('flashbulbs') ?? true;

// Init persistent state buffers
if (!room.state.init) {
  room.state.init = true;
  room.state.cols = 72;
  room.state.rows = 38;
  room.state.flashes = [];
  room.state.prevBeat = false;
  room.state.paletteBuffer = new Uint32Array(room.state.cols * room.state.rows);
}

const COLS = room.state.cols;
const ROWS = room.state.rows;
const totalSeats = COLS * ROWS;

// Background fill
let skyTop = '#020308';
let skyBottom = '#080d1a';
let pitchGlow = 'rgba(20, 60, 30, 0.4)';
let floodColor = 'rgba(230, 245, 255, 0.08)';

if (lightKey === 'golden_dusk') {
  skyTop = '#0b0816';
  skyBottom = '#38161e';
  pitchGlow = 'rgba(80, 50, 20, 0.4)';
  floodColor = 'rgba(255, 220, 160, 0.12)';
} else if (lightKey === 'ultraviolet_party') {
  skyTop = '#05010a';
  skyBottom = '#130424';
  pitchGlow = 'rgba(40, 10, 80, 0.45)';
  floodColor = 'rgba(180, 120, 255, 0.1)';
}

const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, skyTop);
bgGrad.addColorStop(0.7, skyBottom);
bgGrad.addColorStop(1, '#010204');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Motif color generator helper (fast integer RGB packed in hex)
function getMotifColor(c, r, time) {
  const u = c / (COLS - 1);
  const v = r / (ROWS - 1);
  const cx = u - 0.5;
  const cy = v - 0.5;
  const dist = Math.sqrt(cx * cx + cy * cy);
  const angle = Math.atan2(cy, cx);

  if (motifKey === 'rising_sun') {
    const rays = Math.sin(angle * 12 + time * 0.4);
    if (dist < 0.22) return '#ff2222';
    return rays > 0.0 ? '#ffcc00' : '#d01020';
  } else if (motifKey === 'national_tricolor') {
    // Dynamic curved flag bands with audio ripple
    const wave = Math.sin(u * 6 - time * 2) * 0.06;
    const pos = v + wave;
    if (pos < 0.33) return '#0055a5';
    if (pos < 0.66) return '#ffffff';
    return '#ed2939';
  } else if (motifKey === 'cyber_crest') {
    const dRing = Math.abs(dist - 0.32);
    const oct = Math.abs(Math.cos(angle * 4)) * 0.15;
    if (dist < 0.12) return '#00ffcc';
    if (dRing < 0.05 + oct) return '#ff007f';
    return (c + r) % 2 === 0 ? '#111f38' : '#0a1020';
  } else {
    // neon_skull / mask
    const eyeL = Math.hypot(cx + 0.14, cy + 0.05);
    const eyeR = Math.hypot(cx - 0.14, cy + 0.05);
    if (eyeL < 0.08 || eyeR < 0.08) return '#050508';
    if (dist < 0.38 && cy < 0.2) return '#e0e8ff';
    if (Math.abs(cx) < 0.18 && cy >= 0.2 && cy < 0.38) return (c % 2 === 0) ? '#ffffff' : '#050508';
    return '#1c0828';
  }
}

// Architectural stadium perspective setup
const standTop = H * 0.12;
const standBottom = H * 0.88;
const standWTop = W * 0.82;
const standWBot = W * 0.98;
const centerX = W * 0.5;

// Compute wave travel phase
let wavePhase = 0;
if (waveKey === 'classic_sweep') {
  wavePhase = (t * flipSpeed * 0.8) % 1.0;
} else if (waveKey === 'double_helix') {
  wavePhase = (t * flipSpeed * 0.5) % 1.0;
} else {
  wavePhase = (t * 2.0 + audio.bass * 2.0) % 1.0;
}

// Audio beat flashbulb spawner
if (flashbulbs) {
  if (audio.beat && !room.state.prevBeat) {
    for (let i = 0; i < 14; i++) {
      room.state.flashes.push({
        c: Math.floor(Math.random() * COLS),
        r: Math.floor(Math.random() * ROWS),
        life: 1.0
      });
    }
  }
  // Random ambient flashbulbs in grandstand
  if (Math.random() < 0.35 + audio.treble * 0.5) {
    room.state.flashes.push({
      c: Math.floor(Math.random() * COLS),
      r: Math.floor(Math.random() * ROWS),
      life: 0.7 + Math.random() * 0.3
    });
  }
  if (room.state.flashes.length > 90) {
    room.state.flashes.splice(0, room.state.flashes.length - 90);
  }
}
room.state.prevBeat = audio.beat;

// Stadium Roof Gantries & Overhead Floodlights
ctx.lineWidth = 2;
ctx.strokeStyle = 'rgba(80, 110, 150, 0.3)';
ctx.beginPath();
ctx.moveTo(0, standTop * 0.7);
ctx.lineTo(W, standTop * 0.7);
ctx.moveTo(0, standTop * 0.9);
ctx.lineTo(W, standTop * 0.9);
for (let gx = 0; gx < W; gx += W / 16) {
  ctx.moveTo(gx, standTop * 0.6);
  ctx.lineTo(gx + 20, standTop * 0.95);
}
ctx.stroke();

// Giant overhead atmospheric flood cones
const floodPoints = [W * 0.15, W * 0.38, W * 0.62, W * 0.85];
for (let i = 0; i < floodPoints.length; i++) {
  const fx = floodPoints[i];
  const beam = ctx.createRadialGradient(fx, standTop * 0.7, 5, fx, standTop * 2.5, W * 0.35);
  beam.addColorStop(0, floodColor);
  beam.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(fx - 40, standTop * 0.7);
  ctx.lineTo(fx + 40, standTop * 0.7);
  ctx.lineTo(fx + (fx - centerX) * 0.8 + 120, H);
  ctx.lineTo(fx + (fx - centerX) * 0.8 - 120, H);
  ctx.closePath();
  ctx.fill();
}

// Render Seats & Flipping Cards
// Iterate row by row (back to front for proper tier overlap)
const tierCount = 3;
const rowsPerTier = Math.floor(ROWS / tierCount);

for (let r = 0; r < ROWS; r++) {
  const rowProgress = r / (ROWS - 1); // 0 (top/back) to 1 (front/bottom)
  // Exponential vertical perspective
  const yP = Math.pow(rowProgress, 1.35);
  const y = standTop + yP * (standBottom - standTop);
  const nextYP = Math.pow((r + 1) / (ROWS - 1), 1.35);
  const nextY = standTop + nextYP * (standBottom - standTop);
  const rowH = Math.max(2.5, (nextY - y) * 0.82);

  // Row width expands towards camera
  const rowW = standWTop + rowProgress * (standWBot - standWTop);
  const rowLeft = centerX - rowW * 0.5;
  const seatPitch = rowW / COLS;

  // Tier balcony divider shadow
  const isTierBorder = (r % rowsPerTier === 0 && r > 0);
  if (isTierBorder) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(rowLeft - 10, y - 4, rowW + 20, 5);
    ctx.fillStyle = 'rgba(180, 200, 230, 0.18)';
    ctx.fillRect(rowLeft - 10, y - 2, rowW + 20, 1.5);
  }

  for (let c = 0; c < COLS; c++) {
    const colNorm = c / COLS;
    const x = rowLeft + c * seatPitch;
    const cardW = Math.max(1.8, seatPitch * 0.84);

    // Wave & flip dynamics calculation
    let waveDist = 0;
    if (waveKey === 'classic_sweep') {
      waveDist = (colNorm - wavePhase + 1.0) % 1.0;
    } else if (waveKey === 'double_helix') {
      const helix = Math.sin(rowProgress * Math.PI * 2 + t * 2) * 0.25;
      waveDist = ((colNorm + helix) - wavePhase + 1.0) % 1.0;
    } else {
      // concentric ring audio blast
      const u = colNorm - 0.5;
      const v = rowProgress - 0.5;
      const rad = Math.sqrt(u * u + v * v);
      waveDist = (rad * 1.5 - wavePhase + 1.0) % 1.0;
    }

    // Flip wave excitation window (0 to 1)
    const inWave = waveDist < 0.18;
    const waveEnvelope = inWave ? Math.sin((waveDist / 0.18) * Math.PI) : 0;

    // Lift height for Mexican wave
    const seatLift = waveEnvelope * (rowH * 2.2 + audio.bass * 8);

    // Card 3D flipping angle: rotates around horizontal axis
    // Cards flip when wave passes and periodically with music
    const flipCycle = Math.sin(t * flipSpeed + c * 0.08 + r * 0.04);
    let flipAngle = waveEnvelope * Math.PI;
    if (!inWave) {
      flipAngle = (flipCycle > 0.94) ? (flipCycle - 0.94) / 0.06 * Math.PI : 0;
    }

    const cosFlip = Math.cos(flipAngle);
    const absCos = Math.abs(cosFlip);
    const cardH = Math.max(1.0, rowH * absCos);

    // Determine color: front motif color vs card back (crowd uniform/silver backing)
    let cardColor = getMotifColor(c, r, t);
    if (cosFlip < 0) {
      // Back of card facing camera during flip
      cardColor = '#1a2232';
    }

    // Darken distant seats for atmospheric depth
    const depthFade = 0.5 + rowProgress * 0.5;

    // Draw card seat
    ctx.fillStyle = cardColor;
    ctx.globalAlpha = depthFade;
    const drawY = y - seatLift + (rowH - cardH) * 0.5;
    ctx.fillRect(x, drawY, cardW, cardH);

    // Specular glint along flip crest
    if (absCos < 0.35 && inWave) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = (1.0 - absCos / 0.35) * 0.85;
      ctx.fillRect(x, drawY + cardH * 0.3, cardW, Math.max(1, cardH * 0.4));
    }
  }
}
ctx.globalAlpha = 1.0;

// Render active flashbulbs
if (flashbulbs && room.state.flashes.length > 0) {
  for (let i = room.state.flashes.length - 1; i >= 0; i--) {
    const fl = room.state.flashes[i];
    fl.life -= frame.dt * 4.2;
    if (fl.life <= 0) {
      room.state.flashes.splice(i, 1);
      continue;
    }
    const rP = fl.r / (ROWS - 1);
    const yP = Math.pow(rP, 1.35);
    const fy = standTop + yP * (standBottom - standTop);
    const rW = standWTop + rP * (standWBot - standWTop);
    const fx = centerX - rW * 0.5 + (fl.c / COLS) * rW;
    const radius = (2.5 + (1.0 - fl.life) * 6) * (0.8 + rP * 0.6);

    ctx.save();
    ctx.globalAlpha = fl.life;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(fx, fy, radius, 0, Math.PI * 2);
    ctx.fill();
    // Mini cross flare on strong bursts
    if (fl.life > 0.5) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx - radius * 2.5, fy);
      ctx.lineTo(fx + radius * 2.5, fy);
      ctx.moveTo(fx, fy - radius * 2.5);
      ctx.lineTo(fx, fy + radius * 2.5);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Room People VIP ribbon along the front stadium parapet
const peopleCount = room.people ? room.people.length : 0;
if (peopleCount > 0) {
  const parapetY = standBottom + 4;
  const parapetH = 14;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.9)';
  ctx.fillRect(W * 0.02, parapetY, W * 0.96, parapetH);

  const segW = (W * 0.96) / peopleCount;
  for (let p = 0; p < peopleCount; p++) {
    const person = room.people[p];
    const px = W * 0.02 + p * segW;
    ctx.fillStyle = 'hsl(' + (person.hue ?? 200) + ', 85%, 55%)';
    ctx.fillRect(px + 1, parapetY + 2, segW - 2, parapetH - 4);
  }
}

// Foreground pitch boundary & rich atmospheric dark pitch rim
const pitch = ctx.createLinearGradient(0, standBottom, 0, H);
pitch.addColorStop(0, '#060a08');
pitch.addColorStop(0.3, '#0b160e');
pitch.addColorStop(1, '#020403');
ctx.fillStyle = pitch;
ctx.fillRect(0, standBottom + 2, W, H - standBottom);

// Pitch glow line (perimeter LED hoardings reflecting off turf)
const ledGrad = ctx.createLinearGradient(0, 0, W, 0);
ledGrad.addColorStop(0, 'rgba(0, 200, 255, 0.3)');
ledGrad.addColorStop(0.5, 'rgba(255, 50, 150, 0.4)');
ledGrad.addColorStop(1, 'rgba(0, 255, 180, 0.3)');
ctx.fillStyle = ledGrad;
ctx.fillRect(centerX - standWBot * 0.5, standBottom, standWBot, 3);

// Stadium floodlight halo bloom
ctx.save();
ctx.globalCompositeOperation = 'screen';
for (let i = 0; i < floodPoints.length; i++) {
  const fx = floodPoints[i];
  const halo = ctx.createRadialGradient(fx, standTop * 0.7, 0, fx, standTop * 0.7, 60);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  halo.addColorStop(0.3, floodColor);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(fx, standTop * 0.7, 60, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

ctx.restore();