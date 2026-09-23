const W = 320;
const H = 180;

const speedMults = { relaxed: 0.5, flowing: 1.0, torrential: 2.2 };
const speedMul = speedMults[getVar('cycle_speed')] ?? 1.0;

const glowStyles = { subtle: 0.6, flickering: 1.2, roaring: 2.0 };
const torchPower = glowStyles[getVar('torch_glow')] ?? 1.2;

const paletteTheme = getVar('palette_theme') ?? 'twilight_ruins';
const skyStyle = getVar('sky_style') ?? 'starry_dusk';

// Palette ranges:
// 0..47: Static scene (rocks, cliffs, ancient stone, sky/mountain gradients)
// 48..79: Waterfall (32 colors cycling downwards)
// 80..111: Lake / pool ripple (32 colors cycling horizontally/reflective)
// 112..127: Torches & braziers (16 colors cycling/flickering)
// 128..143: Distant mist & foam

if (!room.state.init) {
  room.state.init = true;
  room.state.indices = new Uint8Array(W * H);
  room.state.offscreen = new OffscreenCanvas(W, H);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(W, H);
  room.state.buf32 = new Uint32Array(room.state.imgData.data.buffer);
  room.state.waterPhase = 0;
  room.state.lakePhase = 0;
  room.state.torchPhase = 0;

  // Generate static indexed art once
  const idx = room.state.indices;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      // Default: sky gradient (0..15)
      if (y < 90) {
        const grad = Math.floor((y / 90) * 14);
        idx[p] = grad;
      } else {
        // Default lower ground/rock
        idx[p] = 20 + Math.floor(Math.sin(x * 0.1) * 2 + (y % 4));
      }
    }
  }

  // Distant mountains (indices 16..23)
  for (let x = 0; x < W; x++) {
    const m1 = Math.floor(65 - Math.sin(x * 0.02) * 18 - Math.cos(x * 0.05) * 8);
    for (let y = m1; y < 95; y++) {
      const shade = 16 + Math.min(6, Math.floor((y - m1) * 0.4));
      idx[y * W + x] = shade;
    }
  }

  // Cliffs & Pillars framing the scene (indices 24..39)
  for (let y = 30; y < H; y++) {
    // Left cliff
    const leftWidth = Math.floor(70 + Math.sin(y * 0.08) * 12 + Math.cos(y * 0.2) * 4);
    for (let x = 0; x < leftWidth; x++) {
      const texture = (Math.sin(x * 0.4) * 2 + Math.cos(y * 0.3) * 2) | 0;
      idx[y * W + x] = Math.min(39, Math.max(24, 28 + texture + ((x > leftWidth - 6) ? -3 : 2)));
    }
    // Right cliff
    const rightWidth = Math.floor(65 + Math.cos(y * 0.07) * 10 + Math.sin(y * 0.15) * 5);
    for (let x = W - rightWidth; x < W; x++) {
      const texture = (Math.cos(x * 0.35) * 2 + Math.sin(y * 0.25) * 2) | 0;
      idx[y * W + x] = Math.min(39, Math.max(24, 28 + texture + ((x < W - rightWidth + 6) ? -3 : 2)));
    }
  }

  // Cave arch / Temple lintel at top center
  for (let y = 15; y < 45; y++) {
    for (let x = 110; x < 210; x++) {
      const archY = 25 + Math.sin(((x - 110) / 100) * Math.PI) * 12;
      if (y < archY) {
        idx[y * W + x] = 32 + ((x + y) % 3);
      }
    }
  }

  // Waterfall: spans x: 132..188, y: 35..125
  for (let y = 35; y < 125; y++) {
    const spread = (y - 35) * 0.12;
    const left = Math.floor(140 - spread + Math.sin(y * 0.2) * 1.5);
    const right = Math.floor(180 + spread + Math.cos(y * 0.2) * 1.5);
    for (let x = left; x <= right; x++) {
      // Channel flow gradient index from 48 to 79 (32 cycle length)
      const flow = (Math.floor(y * 1.2 + Math.sin(x * 0.8) * 3)) % 32;
      idx[y * W + x] = 48 + flow;
    }
  }

  // Waterfall impact mist (indices 128..143)
  for (let y = 120; y < 132; y++) {
    for (let x = 126; x < 194; x++) {
      const dx = (x - 160) / 32;
      const dy = (y - 126) / 6;
      if (dx * dx + dy * dy < 1.0) {
        const mistCycle = (Math.floor(x * 0.7 + y * 1.4)) % 16;
        idx[y * W + x] = 128 + mistCycle;
      }
    }
  }

  // Lake: y: 125..H, x: 50..270
  for (let y = 125; y < H; y++) {
    const lakeLeft = Math.max(0, Math.floor(55 - (y - 125) * 0.5));
    const lakeRight = Math.min(W - 1, Math.floor(265 + (y - 125) * 0.5));
    for (let x = lakeLeft; x <= lakeRight; x++) {
      const persp = 1 + (y - 125) * 0.08;
      const ripple = (Math.floor((x / persp) * 0.5 + Math.sin((y - 125) * 0.8) * 3)) % 32;
      idx[y * W + x] = 80 + Math.abs(ripple);
    }
  }

  // Torches on stone pillars: Left torch at (74, 90), Right torch at (246, 90)
  const torches = [
    { cx: 74, cy: 92 },
    { cx: 246, cy: 92 }
  ];
  torches.forEach(t => {
    // Brazier stone stand
    for (let dy = 0; dy < 18; dy++) {
      const w = dy < 4 ? 4 : 2;
      for (let dx = -w; dx <= w; dx++) {
        idx[(t.cy + dy) * W + (t.cx + dx)] = 36 + (dx % 2);
      }
    }
    // Flame cluster (indices 112..127)
    for (let dy = -16; dy < 0; dy++) {
      const fw = Math.max(0, Math.floor(5 + dy * 0.3));
      for (let dx = -fw; dx <= fw; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy * 0.7);
        if (dist < 10) {
          const fidx = (Math.floor(dist * 1.8) + ((dx + dy) & 1)) % 16;
          idx[(t.cy + dy) * W + (t.cx + dx)] = 112 + fidx;
        }
      }
    }
  });
}

// Advance cycle phases based on time & audio
const dt = frame.dt || 0.016;
const bassSurge = (audio.bass || 0) * 1.8;
const midSparkle = (audio.mid || 0) * 1.2;
const trebleShimmer = (audio.treble || 0) * 1.5;

room.state.waterPhase = (room.state.waterPhase + dt * (18 * speedMul + bassSurge * 22)) % 32;
room.state.lakePhase = (room.state.lakePhase + dt * (10 * speedMul + trebleShimmer * 16)) % 32;
room.state.torchPhase = (room.state.torchPhase + dt * (24 * torchPower + midSparkle * 28)) % 16;

// Build 256-color RGBA32 palette
const pal = new Uint32Array(256);

// Helper to pack RGBA (little endian ABGR)
function pack(r, g, b) {
  const R = Math.min(255, Math.max(0, r | 0));
  const G = Math.min(255, Math.max(0, g | 0));
  const B = Math.min(255, Math.max(0, b | 0));
  return 0xFF000000 | (B << 16) | (G << 8) | R;
}

// Palettes definitions
let skyR = 20, skyG = 18, skyB = 40;
let rockR = 35, rockG = 42, rockB = 48;
let waterBaseR = 12, waterBaseG = 65, waterBaseB = 120;

if (paletteTheme === 'cyber_lagoon') {
  skyR = 10; skyG = 5; skyB = 30;
  rockR = 25; rockG = 18; rockB = 45;
  waterBaseR = 0; waterBaseG = 180; waterBaseB = 160;
} else if (paletteTheme === 'blood_moon') {
  skyR = 45; skyG = 8; skyB = 18;
  rockR = 40; rockG = 25; rockB = 25;
  waterBaseR = 130; waterBaseG = 20; waterBaseB = 45;
} else if (paletteTheme === 'emerald_grotto') {
  skyR = 8; skyG = 30; skyB = 25;
  rockR = 20; rockG = 38; rockB = 30;
  waterBaseR = 20; waterBaseG = 140; waterBaseB = 90;
}

// Sky stars flicker & style
const starBeat = (audio.beat ? 40 : 0);
for (let i = 0; i < 16; i++) {
  const f = i / 15;
  if (skyStyle === 'aurora_borealis') {
    const aur = Math.sin(f * 6 + frame.t * 1.5) * 30;
    pal[i] = pack(skyR + aur * 0.4, skyG + f * 90 + aur, skyB + f * 70 + starBeat);
  } else if (skyStyle === 'vapor_dawn') {
    pal[i] = pack(skyR + f * 180, skyG + f * 70, skyB + f * 110 + starBeat);
  } else {
    pal[i] = pack(skyR + f * 35, skyG + f * 45, skyB + f * 75 + starBeat);
  }
}

// Mountains
for (let i = 0; i < 8; i++) {
  const f = i / 7;
  pal[16 + i] = pack(rockR * 0.6 + f * 20, rockG * 0.6 + f * 25, rockB * 0.7 + f * 40);
}

// Cliffs & Lintels (dark rock with ambient depth)
for (let i = 0; i < 24; i++) {
  const f = i / 23;
  pal[24 + i] = pack(rockR * 0.4 + f * 45, rockG * 0.4 + f * 48, rockB * 0.4 + f * 55);
}

// Waterfall cycling palette (32 colors shifted by waterPhase)
const wShift = Math.floor(room.state.waterPhase);
for (let i = 0; i < 32; i++) {
  const shifted = (i + wShift) % 32;
  const wave = Math.sin((shifted / 32) * Math.PI * 2);
  const foam = Math.pow(Math.max(0, wave), 4);
  const r = waterBaseR * 0.8 + foam * 180 + (audio.bass * 40);
  const g = waterBaseG * 0.9 + foam * 200;
  const b = waterBaseB + foam * 220;
  pal[48 + i] = pack(r, g, b);
}

// Lake cycling palette (32 colors shifted by lakePhase)
const lShift = Math.floor(room.state.lakePhase);
for (let i = 0; i < 32; i++) {
  const shifted = (i + lShift) % 32;
  const f = (shifted / 32);
  const gloss = Math.pow(Math.sin(f * Math.PI * 4), 6) * 70 * trebleShimmer;
  const r = waterBaseR * 0.4 + gloss;
  const g = waterBaseG * 0.55 + gloss;
  const b = waterBaseB * 0.7 + gloss * 1.5;
  pal[80 + i] = pack(r, g, b);
}

// Torches cycling palette (16 colors shifted by torchPhase + noise)
const tShift = Math.floor(room.state.torchPhase);
const flare = (audio.beat ? 60 : 0) + (audio.bass * 40);
for (let i = 0; i < 16; i++) {
  const shifted = (i + tShift) % 16;
  const lum = (15 - shifted) / 15;
  // Heat gradient from white-yellow -> intense orange -> deep red -> smoke
  const r = Math.min(255, lum * (240 + flare));
  const g = Math.min(255, Math.pow(lum, 1.8) * (180 + flare * 0.5));
  const b = Math.min(255, Math.pow(lum, 3.5) * (120 + flare * 0.2));
  pal[112 + i] = pack(r, g, b);
}

// Mist & Spray (16 colors)
for (let i = 0; i < 16; i++) {
  const f = ((i + Math.floor(room.state.waterPhase * 1.5)) % 16) / 15;
  const brightness = 140 + f * 115 + (audio.bass * 30);
  pal[128 + i] = pack(brightness * 0.85, brightness * 0.95, brightness);
}

// Interactive community: draw glowing fireflies / wisps for room participants
const people = room.people || [];

// Translate indexed scene through palette into 32-bit pixel buffer
const indices = room.state.indices;
const buf32 = room.state.buf32;
const totalPix = W * H;

for (let p = 0; p < totalPix; p++) {
  buf32[p] = pal[indices[p]];
}

// Stamp avatars/wisps as glowing indexed sprites into buffer
for (let i = 0; i < people.length && i < 40; i++) {
  const p = people[i];
  const hue = (p.hue || 0) * (Math.PI / 180);
  const wx = Math.floor(160 + Math.cos(frame.t * 0.8 + i * 1.2) * (70 + (i % 5) * 15));
  const wy = Math.floor(130 + Math.sin(frame.t * 1.1 + i * 0.9) * 25 + Math.cos(i) * 10);
  if (wx >= 2 && wx < W - 2 && wy >= 2 && wy < H - 2) {
    const wCol = pack(160 + Math.sin(hue) * 90, 160 + Math.cos(hue) * 90, 240);
    const coreCol = pack(255, 255, 255);
    buf32[wy * W + wx] = coreCol;
    buf32[wy * W + wx - 1] = wCol;
    buf32[wy * W + wx + 1] = wCol;
    buf32[(wy - 1) * W + wx] = wCol;
    buf32[(wy + 1) * W + wx] = wCol;
  }
}

// Push pixels to offscreen canvas
room.state.offCtx.putImageData(room.state.imgData, 0, 0);

// Render low-res buffer scaled to target frame without smoothing (pixelated demoscene look)
ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

// Vignette & subtle CRT phosphor scanlines for authentic retro vibe
ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
for (let y = 0; y < frame.height; y += 4) {
  ctx.fillRect(0, y, frame.width, 1);
}
ctx.restore();