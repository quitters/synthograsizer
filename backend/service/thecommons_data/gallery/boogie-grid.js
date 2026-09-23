ctx.save();

const speedMult = getVar('traffic_speed') ?? 1.5;
const targetCars = Math.floor(getVar('traffic_density') ?? 50);
const paletteKey = getVar('palette_mode') || 'broadway';
const pulseKey = getVar('pulse_style') || 'syncopated';
const complexity = getVar('grid_complexity') || 'classic';

const PALETTES = {
  broadway: {
    bg: '#f6f3e8',
    road: '#fac921',
    blocks: ['#d62828', '#003049', '#242424', '#fdf0d5', '#e63946'],
    flash: '#ffffff'
  },
  neon_night: {
    bg: '#0c0f1d',
    road: '#ffd13b',
    blocks: ['#ff0055', '#00f0ff', '#8b00ff', '#1f293d', '#ffffff'],
    flash: '#ffed4a'
  },
  monochrome: {
    bg: '#edeade',
    road: '#e5b820',
    blocks: ['#111111', '#444444', '#888888', '#f8f8f8', '#222222'],
    flash: '#ffffff'
  }
};
const pal = PALETTES[paletteKey] ?? PALETTES.broadway;

// Initialize or rebuild grid structure when complexity changes
const S = room.state;
if (!S.initialized || S.lastComplexity !== complexity) {
  S.initialized = true;
  S.lastComplexity = complexity;

  // Deterministic fractional grid coordinates
  const vFracs = complexity === 'classic'
    ? [0.06, 0.16, 0.28, 0.38, 0.52, 0.65, 0.77, 0.88, 0.95]
    : complexity === 'dense'
    ? [0.05, 0.12, 0.20, 0.28, 0.36, 0.45, 0.54, 0.63, 0.71, 0.80, 0.88, 0.95]
    : [0.04, 0.09, 0.15, 0.21, 0.27, 0.33, 0.40, 0.47, 0.53, 0.60, 0.66, 0.73, 0.80, 0.86, 0.92, 0.96];

  const hFracs = complexity === 'classic'
    ? [0.08, 0.18, 0.30, 0.44, 0.56, 0.68, 0.80, 0.92]
    : complexity === 'dense'
    ? [0.06, 0.14, 0.22, 0.31, 0.40, 0.50, 0.60, 0.69, 0.78, 0.87, 0.94]
    : [0.05, 0.11, 0.17, 0.24, 0.31, 0.38, 0.46, 0.53, 0.61, 0.68, 0.75, 0.82, 0.89, 0.95];

  S.vStreets = vFracs;
  S.hStreets = hFracs;

  // Precompute intersections
  const inters = [];
  for (let i = 0; i < vFracs.length; i++) {
    for (let j = 0; j < hFracs.length; j++) {
      inters.push({ vi: i, hi: j, flash: 0, cIdx: (i + j * 3) % 5 });
    }
  }
  S.inters = inters;

  // Fixed traffic buffer (100 cars max)
  S.cars = [];
  for (let k = 0; k < 100; k++) {
    const isH = (k % 2 === 0);
    const stList = isH ? hFracs : vFracs;
    S.cars.push({
      isH,
      street: k % stList.length,
      p: (k * 0.137) % 1,
      speed: 0.08 + (k % 7) * 0.035,
      len: 0.02 + (k % 3) * 0.012,
      colorIdx: k % 5
    });
  }
}

// Background fill
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const W = frame.width;
const H = frame.height;
const roadW = Math.max(12, Math.min(W, H) * (complexity === 'frenetic' ? 0.016 : 0.022));

// Trigger flashes on intersections when audio beat / bass hits
const beatHit = audio.beat || audio.bass > 0.65;
const flashDecay = 1.0 - Math.min(1.0, frame.dt * 4.5);
for (let i = 0; i < S.inters.length; i++) {
  const it = S.inters[i];
  if (beatHit && ((i * 7 + Math.floor(frame.t * 3)) % 11 < 3)) {
    it.flash = pulseKey === 'strobe' ? 1.0 : (pulseKey === 'smooth' ? 0.6 : 0.85);
    it.cIdx = (it.cIdx + 1) % pal.blocks.length;
  } else {
    it.flash *= flashDecay;
  }
}

// 1. Draw yellow road grid
ctx.fillStyle = pal.road;
for (let i = 0; i < S.vStreets.length; i++) {
  const x = Math.round(S.vStreets[i] * W - roadW * 0.5);
  ctx.fillRect(x, 0, roadW, H);
}
for (let j = 0; j < S.hStreets.length; j++) {
  const y = Math.round(S.hStreets[j] * H - roadW * 0.5);
  ctx.fillRect(0, y, W, roadW);
}

// 2. Draw static Mondrian mosaic markers along streets for rhythmic texture
const blockStep = roadW * 1.35;
const stepMod = complexity === 'frenetic' ? 5 : 3;
ctx.fillStyle = pal.blocks[0];
for (let i = 0; i < S.vStreets.length; i++) {
  const x = Math.round(S.vStreets[i] * W - roadW * 0.5);
  for (let k = 0; k < 6; k++) {
    const y = Math.round(((i * 0.17 + k * 0.19) % 1) * H);
    ctx.fillStyle = pal.blocks[(i + k) % pal.blocks.length];
    ctx.fillRect(x, y, roadW, blockStep);
  }
}

// 3. Update & draw moving traffic units along lanes
const audioBoost = 1.0 + (audio.mid + audio.bass) * 0.8;
const dtMove = frame.dt * speedMult * audioBoost;
const activeCars = Math.min(targetCars, S.cars.length);
const numPeople = room.people ? room.people.length : 0;

for (let k = 0; k < activeCars; k++) {
  const car = S.cars[k];
  car.p = (car.p + car.speed * dtMove) % 1.0;

  // Color assignment: adopt person's hue if present, else De Stijl palette
  if (numPeople > 0 && k < numPeople) {
    ctx.fillStyle = `hsl(${room.people[k].hue}, 85%, 50%)`;
  } else {
    ctx.fillStyle = pal.blocks[car.colorIdx];
  }

  if (car.isH) {
    const stIdx = car.street % S.hStreets.length;
    const y = Math.round(S.hStreets[stIdx] * H - roadW * 0.5);
    const x = Math.round(car.p * W);
    const len = Math.round(car.len * W + roadW);
    ctx.fillRect(x, y, len, roadW);
  } else {
    const stIdx = car.street % S.vStreets.length;
    const x = Math.round(S.vStreets[stIdx] * W - roadW * 0.5);
    const y = Math.round(car.p * H);
    const len = Math.round(car.len * H + roadW);
    ctx.fillRect(x, y, roadW, len);
  }
}

// 4. Draw intersections & beat flash squares
for (let i = 0; i < S.inters.length; i++) {
  const it = S.inters[i];
  const cx = Math.round(S.vStreets[it.vi] * W - roadW * 0.5);
  const cy = Math.round(S.hStreets[it.hi] * H - roadW * 0.5);

  if (it.flash > 0.05) {
    // Flashing active crossing
    ctx.fillStyle = (it.flash > 0.5) ? pal.flash : pal.blocks[it.cIdx];
    ctx.fillRect(cx - 2, cy - 2, roadW + 4, roadW + 4);
  } else {
    // Default syncopated block at crossing
    if ((it.vi + it.hi) % 2 === 0) {
      ctx.fillStyle = pal.blocks[it.cIdx];
      ctx.fillRect(cx, cy, roadW, roadW);
    }
  }
}

// Subtle De Stijl frame border
ctx.lineWidth = Math.round(roadW * 0.8);
ctx.strokeStyle = pal.road;
ctx.strokeRect(0, 0, W, H);

ctx.restore();