const W = 320;
const H = 180;
const PIXEL_COUNT = W * H;

// 1. Initialise persistent offscreen structures in room.state
if (!room.state.init || room.state.W !== W) {
  room.state.W = W;
  room.state.H = H;
  room.state.offCanvas = new OffscreenCanvas(W, H);
  room.state.offCtx = room.state.offCanvas.getContext('2d', { willReadFrequently: false });
  room.state.imgData = room.state.offCtx.createImageData(W, H);
  room.state.pixels = new Uint32Array(room.state.imgData.data.buffer);
  room.state.acc = new Float32Array(PIXEL_COUNT * 4); // R, G, B, Density
  room.state.px = 0.1;
  room.state.py = 0.1;
  room.state.init = true;
}

const offCanvas = room.state.offCanvas;
const offCtx = room.state.offCtx;
const imgData = room.state.imgData;
const pixels = room.state.pixels;
const acc = room.state.acc;

// 2. Read knobs and audio
const speed = getVar('speed') ?? 0.6;
const exposure = getVar('exposure') ?? 1.4;
const decayVal = getVar('decay') ?? 0.88;
const palName = getVar('palette') ?? 'nebula';
const varMode = getVar('variation_mix') ?? 'swirl_dominant';
const symName = getVar('symmetry') ?? 'none';

const bass = audio.bass ?? 0;
const treble = audio.treble ?? 0;
const beatBoost = audio.beat ? 1.3 : 1.0;

// Palettes (R, G, B per transform: 3 transforms)
const palettes = {
  nebula: [
    [0.95, 0.25, 0.65],
    [0.20, 0.60, 1.00],
    [0.90, 0.70, 0.15]
  ],
  solar_flare: [
    [1.00, 0.18, 0.05],
    [1.00, 0.65, 0.10],
    [1.00, 0.95, 0.40]
  ],
  electric_abyss: [
    [0.00, 0.85, 0.95],
    [0.10, 0.30, 0.98],
    [0.85, 0.15, 0.90]
  ],
  amethyst: [
    [0.72, 0.18, 0.92],
    [0.40, 0.10, 0.80],
    [0.95, 0.60, 0.95]
  ],
  emerald_veil: [
    [0.10, 0.95, 0.55],
    [0.05, 0.55, 0.75],
    [0.85, 0.95, 0.30]
  ]
};
const pal = palettes[palName] ?? palettes.nebula;

// Mix weighting for nonlinear variations
const varMixes = {
  swirl_dominant:   { lin: 0.15, swirl: 0.60, spher: 0.15, sin: 0.10 },
  spherical_core:   { lin: 0.10, swirl: 0.20, spher: 0.60, sin: 0.10 },
  sinusoidal_weave: { lin: 0.15, swirl: 0.15, spher: 0.10, sin: 0.60 },
  balanced_chaos:   { lin: 0.25, swirl: 0.25, spher: 0.25, sin: 0.25 }
};
const vm = varMixes[varMode] ?? varMixes.swirl_dominant;

// Symmetry fold factors
const symFolds = { none: 1, bilateral: 2, radial_3: 3, radial_5: 5 };
const folds = symFolds[symName] ?? 1;

// Dynamic morphing parameters driven by time and audio
const t = frame.t * speed * 0.4;
const bMod = bass * 0.35;
const t1 = t + bMod;
const t2 = t * 1.31 - bMod * 0.5;
const t3 = t * 0.77 + treble * 0.25;

// Three affine transforms [a, b, c, d, e, f]
const c1 = Math.cos(t1), s1 = Math.sin(t1);
const c2 = Math.cos(t2), s2 = Math.sin(t2);
const c3 = Math.cos(t3), s3 = Math.sin(t3);

const A = [
  {
    a: 0.74 * c1, b: -0.68 * s1, c: 0.42 * Math.sin(t2 * 0.6),
    d: 0.68 * s1, e:  0.74 * c1, f: 0.35 * Math.cos(t1 * 0.5)
  },
  {
    a: 0.65 * c2, b:  0.55 * s2, c: -0.48 * Math.cos(t3 * 0.8),
    d: -0.55 * s2, e: 0.65 * c2, f: 0.22 * Math.sin(t3 * 0.5)
  },
  {
    a: 0.52 * c3, b: -0.48 * s3, c: 0.15 * Math.sin(t1 * 1.2),
    d: 0.48 * s3, e:  0.52 * c3, f: -0.38 * Math.cos(t2 * 0.9)
  }
];

// 3. Fast decay of persistent accumulation buffer
const decay = Math.min(0.97, Math.max(0.60, decayVal));
for (let i = 0; i < PIXEL_COUNT * 4; i += 4) {
  acc[i]     *= decay;
  acc[i + 1] *= decay;
  acc[i + 2] *= decay;
  acc[i + 3] *= decay;
}

// 4. Chaos game iteration loop (fixed count for steady 60fps)
let x = room.state.px;
let y = room.state.py;
const ITERS = 22000;
const halfW = W * 0.5;
const halfH = H * 0.5;
const scale = Math.min(halfW, halfH) * 0.68 * (1.0 + bass * 0.15);

for (let i = 0; i < ITERS; i++) {
  // Pick transform (pseudo-random via fast linear congruential or Math.random)
  const rIdx = (Math.random() * 3) | 0;
  const tf = A[rIdx];
  const col = pal[rIdx];

  // Affine step
  const nx = tf.a * x + tf.b * y + tf.c;
  const ny = tf.d * x + tf.e * y + tf.f;

  // Nonlinear variations
  const r2 = nx * nx + ny * ny + 1e-6;
  const r = Math.sqrt(r2);

  // Swirl variation
  const sinR2 = Math.sin(r2);
  const cosR2 = Math.cos(r2);
  const swX = nx * sinR2 - ny * cosR2;
  const swY = nx * cosR2 + ny * sinR2;

  // Spherical variation
  const spX = nx / r2;
  const spY = ny / r2;

  // Sinusoidal variation
  const snX = Math.sin(nx);
  const snY = Math.sin(ny);

  // Blended position
  x = vm.lin * nx + vm.swirl * swX + vm.spher * spX + vm.sin * snX;
  y = vm.lin * ny + vm.swirl * swY + vm.spher * spY + vm.sin * snY;

  // Skip warm-up steps in initial frame
  if (i < 20) continue;

  // Optional fold symmetry
  for (let s = 0; s < folds; s++) {
    let px = x;
    let py = y;
    if (s > 0) {
      if (folds === 2) {
        px = -px;
      } else {
        const ang = (Math.PI * 2 * s) / folds;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const rx = px * ca - py * sa;
        const ry = px * sa + py * ca;
        px = rx;
        py = ry;
      }
    }

    const scrX = (halfW + px * scale) | 0;
    const scrY = (halfH + py * scale) | 0;

    if (scrX >= 0 && scrX < W && scrY >= 0 && scrY < H) {
      const idx = (scrY * W + scrX) << 2;
      acc[idx]     += col[0];
      acc[idx + 1] += col[1];
      acc[idx + 2] += col[2];
      acc[idx + 3] += 1.0;
    }
  }
}
room.state.px = x;
room.state.py = y;

// 5. Tone mapping with logarithmic density into 32-bit pixel buffer
const expFactor = exposure * 0.45 * beatBoost;
for (let i = 0, p = 0; i < PIXEL_COUNT; i++, p += 4) {
  const dens = acc[p + 3];
  if (dens <= 0.005) {
    pixels[i] = 0xff040306; // Deep cosmic violet background
    continue;
  }

  // Logarithmic tone response
  const alpha = Math.log1p(dens * expFactor) / (0.85 + Math.log1p(dens * expFactor));
  const invDens = 1.0 / dens;

  let r = (acc[p]     * invDens) * alpha * 255;
  let g = (acc[p + 1] * invDens) * alpha * 255;
  let b = (acc[p + 2] * invDens) * alpha * 255;

  // Bloom tinting towards core white at high density
  if (alpha > 0.7) {
    const highlight = (alpha - 0.7) * 3.33;
    r += (255 - r) * highlight * 0.5;
    g += (255 - g) * highlight * 0.5;
    b += (255 - b) * highlight * 0.5;
  }

  const ir = r > 255 ? 255 : (r < 0 ? 0 : r | 0);
  const ig = g > 255 ? 255 : (g < 0 ? 0 : g | 0);
  const ib = b > 255 ? 255 : (b < 0 ? 0 : b | 0);

  pixels[i] = (255 << 24) | (ib << 16) | (ig << 8) | ir;
}

// 6. Blit offscreen buffer smoothly to canvas
offCtx.putImageData(imgData, 0, 0);

ctx.save();
ctx.fillStyle = '#050308';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.drawImage(offCanvas, 0, 0, frame.width, frame.height);

// 7. Subtle room people integration: orbital stars modulated by their hues
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const centerX = frame.width * 0.5;
  const centerY = frame.height * 0.5;
  const baseRadius = Math.min(centerX, centerY) * 0.88;

  for (let i = 0; i < room.people.length; i++) {
    const person = room.people[i];
    const orbitSpeed = 0.2 + (i % 5) * 0.05;
    const angle = frame.t * orbitSpeed + (i * Math.PI * 2) / room.people.length;
    const dist = baseRadius * (0.65 + 0.25 * Math.sin(frame.t * 0.5 + i));
    const px = centerX + Math.cos(angle) * dist;
    const py = centerY + Math.sin(angle) * dist;
    const pSize = 3.5 + bass * 4.0;

    const hue = person.hue ?? 200;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, pSize * 3.0);
    glow.addColorStop(0, `hsla(${hue}, 100%, 75%, 0.8)`);
    glow.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, pSize * 3.0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

ctx.restore();