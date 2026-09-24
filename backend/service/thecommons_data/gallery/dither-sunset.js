const resChoice = getVar('resolution') || 'chunky_160x90';
let W = 160, H = 90;
if (resChoice === 'crisp_240x135') { W = 240; H = 135; }
else if (resChoice === 'blocky_120x68') { W = 120; H = 68; }

if (!room.state.bayer4) {
  const b2 = [0, 2, 3, 1];
  room.state.bayer2 = new Float32Array(b2.map(v => (v + 0.5) / 4));
  const b4 = [
    0,  8,  2, 10,
    12, 4, 14,  6,
    3, 11,  1,  9,
    15, 7, 13,  5
  ];
  room.state.bayer4 = new Float32Array(b4.map(v => (v + 0.5) / 16));
  const b8 = new Float32Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const qx = x >> 2;
      const qy = y >> 2;
      const shift = qy === 0 ? (qx === 0 ? 0 : 2) : (qx === 0 ? 3 : 1);
      b8[y * 8 + x] = (4 * b4[(y % 4) * 4 + (x % 4)] + shift + 0.5) / 64;
    }
  }
  room.state.bayer8 = b8;
}

if (!room.state.buf || room.state.w !== W || room.state.h !== H) {
  room.state.buf = new OffscreenCanvas(W, H);
  room.state.bctx = room.state.buf.getContext('2d');
  room.state.img = room.state.bctx.createImageData(W, H);
  room.state.u32 = new Uint32Array(room.state.img.data.buffer);
  room.state.w = W;
  room.state.h = H;
}

const pack = (r, g, b) => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
const PALETTES = {
  amber_dusk: [pack(16, 12, 34), pack(150, 42, 60), pack(235, 140, 40), pack(255, 245, 185)],
  synth_sunset: [pack(18, 10, 44), pack(140, 25, 115), pack(245, 95, 80), pack(255, 235, 130)],
  cga_glow: [pack(10, 10, 20), pack(0, 168, 172), pack(200, 48, 148), pack(250, 250, 250)],
  gameboy_retro: [pack(15, 56, 15), pack(48, 98, 48), pack(139, 172, 15), pack(180, 215, 30)]
};

const palKey = getVar('palette') || 'amber_dusk';
const pal = PALETTES[palKey] || PALETTES.amber_dusk;

const bayerChoice = getVar('bayer_size') || 'bayer_4x4';
let bayer = room.state.bayer4;
let bayerMask = 3;
let bayerDim = 4;
if (bayerChoice === 'bayer_8x8') {
  bayer = room.state.bayer8;
  bayerMask = 7;
  bayerDim = 8;
} else if (bayerChoice === 'bayer_2x2') {
  bayer = room.state.bayer2;
  bayerMask = 1;
  bayerDim = 2;
}

const sunSpeed = getVar('sun_speed') ?? 0.8;
const cloudCover = getVar('cloud_cover') ?? 3;
const waterRipple = getVar('water_ripple') ?? 3;

const u32 = room.state.u32;
const horizonY = Math.floor(H * 0.58);
const sunCycle = frame.t * sunSpeed * 0.18;
const sunElev = Math.sin(sunCycle);
const sunY = horizonY + sunElev * (H * 0.34);
const sunX = W * 0.5 + Math.cos(sunCycle * 0.6) * (W * 0.22);
const sunRadius = (H * 0.11) * (1.0 + audio.bass * 0.35);
const skyDarkness = Math.max(0, Math.min(1, (sunElev + 0.25) * 0.85));
const sunVis = Math.max(0, 1.0 - Math.max(0, sunElev - 0.2) * 2.2);
const cThresh = 1.35 - cloudCover * 0.18;
const beatPulse = audio.beat ? 0.8 : 0.0;

for (let y = 0; y < H; y++) {
  const rowOff = y * W;
  const bayerRow = (y & bayerMask) * bayerDim;
  const isSky = y < horizonY;
  const dy = isSky ? (horizonY - y) : (y - horizonY);
  const pNorm = dy / (isSky ? horizonY : (H - horizonY));

  for (let x = 0; x < W; x++) {
    let lum = 0;
    if (isSky) {
      const ny = y / horizonY;
      const baseSky = Math.pow(ny, 2.2) * 1.5 * (1.0 - skyDarkness * 0.65) + (1.0 - ny) * (0.35 - skyDarkness * 0.28);
      const dist = Math.hypot(x - sunX, y - sunY);
      let sunGlow = 0;
      if (dist < sunRadius) {
        sunGlow = 2.6 * (1.0 - (dist / sunRadius) * 0.28);
      } else {
        const falloff = (sunRadius / (dist + 0.001));
        sunGlow = Math.pow(falloff, 1.35) * (1.0 + audio.bass * 0.9);
      }
      const cX = x * 0.045 + frame.t * 0.07;
      const cY = y * 0.09;
      const cNoise = Math.sin(cX) * 0.55 + Math.cos(cX * 2.1 + cY) * 0.32 + Math.sin(cX * 0.55 - y * 0.14) * 0.2;
      const cMask = Math.max(0, (cNoise - cThresh) * 2.2);
      lum = (baseSky + sunGlow) * (1.0 - Math.min(0.85, cMask)) + cMask * (sunGlow * 0.45 + 0.35 + audio.mid * 0.45);
      if (skyDarkness > 0.4 && ((x * 9301 + y * 49297 + 233280) % 697) === 0) {
        lum += 1.8 * skyDarkness;
      }
    } else {
      let waterLum = 0.18 + pNorm * 0.32 * (1.0 - skyDarkness * 0.5);
      const refWidth = (3.5 + dy * 0.8) * (1.0 + audio.bass * 0.55);
      const distRefX = Math.abs(x - sunX);
      if (distRefX < refWidth * 2.4 && sunVis > 0) {
        const freqY = 16.0 / (dy + 1.2);
        const r1 = Math.sin(x * 0.32 + freqY + frame.t * 3.8 * waterRipple + beatPulse);
        const r2 = Math.cos(x * 0.17 - dy * 0.28 + frame.t * 2.2);
        const shimmer = Math.max(0, (r1 + r2) * 0.5);
        const envelope = Math.max(0, 1.0 - distRefX / refWidth);
        waterLum += envelope * envelope * (1.9 + audio.bass * 0.9) * shimmer * sunVis;
      }
      const wave = Math.sin(x * 0.16 + dy * 0.55 - frame.t * 2.2 * waterRipple);
      if (wave > 0.72) waterLum += 0.26 * (1.0 - pNorm * 0.45) * (audio.treble * 0.7 + 0.4);
      lum = waterLum;
    }

    if (lum < 0) lum = 0;
    else if (lum > 2.999) lum = 2.999;

    const base = lum | 0;
    const frac = lum - base;
    const thresh = bayer[bayerRow + (x & bayerMask)];
    const colIdx = frac > thresh ? (base < 3 ? base + 1 : 3) : base;
    u32[rowOff + x] = pal[colIdx];
  }
}

const people = room.people || [];
const birdCount = Math.max(people.length, 3);
const maxBirds = Math.min(birdCount, 24);
for (let i = 0; i < maxBirds; i++) {
  const p = people[i];
  const h = p ? (p.hue || 0) : (i * 115);
  const speed = 7 + (h % 6);
  const bx = Math.round(((h * 4.1 + i * 49 + frame.t * speed) % (W + 28)) - 14);
  const by = Math.round(horizonY * 0.18 + ((h * 9) % Math.floor(horizonY * 0.55)) + Math.sin(frame.t * 3.2 + i * 1.7) * 2.5);
  const flap = Math.sin(frame.t * 9 + i * 1.8) > 0 ? -1 : 0;
  const birdCol = pal[0];
  if (by >= 2 && by < H - 2 && bx >= 2 && bx < W - 2) {
    u32[by * W + bx] = birdCol;
    u32[(by + flap) * W + (bx - 1)] = birdCol;
    u32[(by + flap - 1) * W + (bx - 2)] = birdCol;
    u32[(by + flap) * W + (bx + 1)] = birdCol;
    u32[(by + flap - 1) * W + (bx + 2)] = birdCol;
  }
}

room.state.bctx.putImageData(room.state.img, 0, 0);

ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(room.state.buf, 0, 0, frame.width, frame.height);
ctx.restore();