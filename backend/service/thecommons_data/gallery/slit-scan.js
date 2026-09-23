const DIMS_W = 320, DIMS_H = 180;

// Initialize persistent state once
if (!room.state.init) {
  room.state.init = true;
  room.state.slitBuf = new OffscreenCanvas(DIMS_W, DIMS_H);
  room.state.slitCtx = room.state.slitBuf.getContext('2d');
  room.state.sideBuf = new OffscreenCanvas(DIMS_H, DIMS_W);
  room.state.sideCtx = room.state.sideBuf.getContext('2d');
  
  // Clear buffers with pure black
  room.state.slitCtx.fillStyle = '#000000';
  room.state.slitCtx.fillRect(0, 0, DIMS_W, DIMS_H);
  room.state.sideCtx.fillStyle = '#000000';
  room.state.sideCtx.fillRect(0, 0, DIMS_H, DIMS_W);
  
  // Lookup tables for 256 sine entries
  room.state.sinLUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    room.state.sinLUT[i] = Math.sin((i / 256) * Math.PI * 2);
  }
  room.state.head = 0;
  room.state.phase = 0;
  room.state.beatEnergy = 0;
}

// Controls
const paletteKey = getVar('palette') ?? 'stargate_amber';
const modeKey = getVar('corridor_mode') ?? 'dual_planes';
const patternKey = getVar('pattern_style') ?? 'moire_lattice';
const speedKnob = getVar('flow_speed') ?? 1.4;
const warpKnob = getVar('slit_warp') ?? 1.2;
const echoKnob = getVar('exposure_echo') ?? 0.85;

// Audio reactivity smoothing
room.state.beatEnergy = room.state.beatEnergy * 0.88 + (audio.beat ? 0.9 : audio.bass * 0.5);
const reactiveBass = audio.bass * 1.2 + room.state.beatEnergy * 0.5;
const reactiveTreble = audio.treble * 1.5;

// Phase progression
const dt = Math.min(frame.dt || 0.016, 0.05);
room.state.phase += (0.8 + speedKnob * 1.6 + reactiveBass * 0.8) * dt;
const ph = room.state.phase;

// Palette definitions
const palettes = {
  stargate_amber: {
    c1: [255, 140, 20],  // Amber gold
    c2: [0, 220, 255],    // Cyan laser
    c3: [255, 30, 110],   // Magenta streak
    c4: [255, 240, 200]   // High-exposure core
  },
  neon_cyber: {
    c1: [255, 0, 160],    // Hot pink
    c2: [0, 255, 240],    // Electric cyan
    c3: [120, 0, 255],    // Deep violet
    c4: [255, 255, 255]
  },
  monochrome_film: {
    c1: [220, 220, 220],  // 1968 Kodalith white
    c2: [90, 90, 90],     // Optical grey
    c3: [170, 170, 170],
    c4: [255, 255, 255]
  },
  infrared_solar: {
    c1: [255, 30, 10],    // Solar flare red
    c2: [255, 180, 0],    // Corona gold
    c3: [160, 0, 80],     // Deep infrared
    c4: [255, 245, 190]
  },
  acid_emerald: {
    c1: [0, 255, 120],    // Laser emerald
    c2: [220, 255, 0],    // Acid lime
    c3: [0, 140, 255],    // Deep cobalt
    c4: [240, 255, 220]
  }
};
const pal = palettes[paletteKey] ?? palettes.stargate_amber;

// Shift slit buffers downward by 1 pixel (time smear accumulation)
const sCtx = room.state.slitCtx;
const sideCtx = room.state.sideCtx;

sCtx.save();
sCtx.globalCompositeOperation = 'copy';
sCtx.drawImage(room.state.slitBuf, 0, 0, DIMS_W, DIMS_H - 1, 0, 1, DIMS_W, DIMS_H - 1);
sCtx.restore();

sideCtx.save();
sideCtx.globalCompositeOperation = 'copy';
sideCtx.drawImage(room.state.sideBuf, 0, 0, DIMS_H - 1, DIMS_W, 1, 0, DIMS_H - 1, DIMS_W);
sCtx.restore();

// Synthesize a new 1D slit scanline (row 0 of slitBuf)
const imgData = sCtx.createImageData(DIMS_W, 1);
const data = imgData.data;
const lut = room.state.sinLUT;
const peopleCount = (room.people && room.people.length) ? room.people.length : 1;

for (let x = 0; x < DIMS_W; x++) {
  const u = (x / DIMS_W) * 2 - 1; // -1 to 1
  const uWarp = u * Math.pow(Math.abs(u), warpKnob - 1);
  let v = 0;
  
  if (patternKey === 'op_stripes') {
    // Razor sharp Kodalith barcode bands
    const s1 = Math.sin(uWarp * 18.0 + ph * 3.0 + reactiveBass * 2.0);
    const s2 = Math.sin(uWarp * 42.0 - ph * 2.1);
    v = (s1 > 0.1 ? 0.9 : 0.0) ^ (s2 > -0.2 ? 0.6 : 0.0);
    v += reactiveTreble * (Math.sin(u * 90.0 + ph * 8.0) > 0.7 ? 0.4 : 0.0);
  } else if (patternKey === 'waveform_synth') {
    // Continuous electronic oscilloscope ribbons
    const wave1 = Math.exp(-Math.pow((uWarp * 4.0 - Math.sin(ph * 2.5 + reactiveBass)), 2) * 12.0);
    const wave2 = Math.exp(-Math.pow((uWarp * 3.0 + Math.sin(ph * 1.8)), 2) * 16.0);
    v = wave1 * 1.2 + wave2 * 0.8;
  } else if (patternKey === 'fractal_shards') {
    // Dense harmonic interference with crystalline teeth
    const f1 = Math.sin(uWarp * 14.0 + ph * 2.0);
    const f2 = Math.sin(uWarp * 33.0 - ph * 3.4);
    const f3 = Math.cos(uWarp * 77.0 + ph * 5.0 + reactiveTreble * 3.0);
    v = Math.abs(f1 * f2) * 1.3 + Math.max(0, f3) * 0.6;
  } else {
    // moire_lattice (default Douglas Trumbull overlapping optical grids)
    const lutIdx1 = ((Math.floor((uWarp * 0.5 + 0.5) * 255 * 3 + ph * 40)) & 255);
    const lutIdx2 = ((Math.floor((uWarp * 0.5 + 0.5) * 255 * 5 - ph * 28 + reactiveBass * 30)) & 255);
    const m1 = lut[lutIdx1];
    const m2 = lut[lutIdx2];
    v = (m1 * m2 + 1.0) * 0.65;
    // Secondary micro-teeth on audio treble
    if (reactiveTreble > 0.2) {
      v += Math.sin(uWarp * 120.0 + ph * 6.0) * reactiveTreble * 0.4;
    }
  }
  
  // Influence of active people in the room
  if (peopleCount > 1) {
    const pIdx = Math.floor((u * 0.5 + 0.5) * peopleCount) % peopleCount;
    const pHueMod = (room.people[pIdx]?.hue || 180) / 360;
    v *= (0.8 + 0.4 * Math.sin(pHueMod * Math.PI * 2 + ph));
  }
  
  v = Math.max(0, Math.min(1.4, v));
  
  // Map intensity v into palette gels
  const idx = x * 4;
  let r = 0, g = 0, b = 0;
  
  if (v < 0.5) {
    const t = v * 2.0;
    r = pal.c1[0] * t;
    g = pal.c1[1] * t;
    b = pal.c1[2] * t;
  } else if (v < 0.95) {
    const t = (v - 0.5) / 0.45;
    r = pal.c1[0] * (1 - t) + pal.c2[0] * t;
    g = pal.c1[1] * (1 - t) + pal.c2[1] * t;
    b = pal.c1[2] * (1 - t) + pal.c2[2] * t;
  } else {
    const t = Math.min(1.0, (v - 0.95) / 0.4);
    r = pal.c2[0] * (1 - t) + pal.c4[0] * t;
    g = pal.c2[1] * (1 - t) + pal.c4[1] * t;
    b = pal.c2[2] * (1 - t) + pal.c4[2] * t;
  }
  
  // Subtle anamorphic flare in the central slit
  const centerGlow = Math.exp(-u * u * 16.0) * (0.3 + reactiveBass * 0.4);
  r = Math.min(255, r + pal.c3[0] * centerGlow);
  g = Math.min(255, g + pal.c3[1] * centerGlow);
  b = Math.min(255, b + pal.c3[2] * centerGlow);
  
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = 255;
}

// Write to row 0
sCtx.putImageData(imgData, 0, 0);

// Copy to vertical side buffer for 4-wall corridors
const sideImg = sideCtx.createImageData(1, DIMS_W);
for (let y = 0; y < DIMS_W; y++) {
  const sIdx = y * 4;
  const dIdx = y * 4;
  sideImg.data[dIdx] = data[sIdx];
  sideImg.data[dIdx + 1] = data[sIdx + 1];
  sideImg.data[dIdx + 2] = data[sIdx + 2];
  sideImg.data[dIdx + 3] = 255;
}
sideCtx.putImageData(sideImg, 0, 0);

// RENDER TO SCREEN: Perspective corridor projection
ctx.save();

// Trail/persistence fade
ctx.fillStyle = '#020106';
ctx.globalAlpha = Math.max(0.12, 1.0 - echoKnob * 0.85);
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.globalAlpha = 1.0;

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const SLICES = 72; // Fine slicing for smooth 60fps tunnel depth

// Outer wall drawer helper
const drawWallPlanes = (isDual, isVerticalChasm) => {
  if (!isVerticalChasm) {
    // --- CEILING PLANE ---
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.closePath();
    ctx.clip();
    
    for (let i = 0; i < SLICES; i++) {
      const z0 = Math.pow(i / SLICES, 2.2);
      const z1 = Math.pow((i + 1) / SLICES, 2.2);
      const y0 = cy - z0 * cy;
      const y1 = cy - z1 * cy;
      const sliceH = Math.max(1.5, Math.abs(y1 - y0) + 0.8);
      const sampleY = Math.min(DIMS_H - 1, Math.floor(z0 * (DIMS_H - 1)));
      
      const halfSpan = z0 * cx * 2.2;
      ctx.drawImage(
        room.state.slitBuf,
        0, sampleY, DIMS_W, 1,
        cx - halfSpan, y1, halfSpan * 2, sliceH
      );
    }
    ctx.restore();
    
    // --- FLOOR PLANE ---
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(0, H);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.clip();
    
    for (let i = 0; i < SLICES; i++) {
      const z0 = Math.pow(i / SLICES, 2.2);
      const z1 = Math.pow((i + 1) / SLICES, 2.2);
      const y0 = cy + z0 * (H - cy);
      const sliceH = Math.max(1.5, (z1 - z0) * (H - cy) + 0.8);
      const sampleY = Math.min(DIMS_H - 1, Math.floor(z0 * (DIMS_H - 1)));
      
      const halfSpan = z0 * cx * 2.2;
      ctx.drawImage(
        room.state.slitBuf,
        0, sampleY, DIMS_W, 1,
        cx - halfSpan, y0, halfSpan * 2, sliceH
      );
    }
    ctx.restore();
  }
  
  if (!isDual || isVerticalChasm) {
    // --- LEFT WALL ---
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.clip();
    
    for (let i = 0; i < SLICES; i++) {
      const z0 = Math.pow(i / SLICES, 2.2);
      const z1 = Math.pow((i + 1) / SLICES, 2.2);
      const x0 = cx - z0 * cx;
      const x1 = cx - z1 * cx;
      const sliceW = Math.max(1.5, Math.abs(x1 - x0) + 0.8);
      const sampleX = Math.min(DIMS_H - 1, Math.floor(z0 * (DIMS_H - 1)));
      
      const halfSpanY = z0 * cy * 2.2;
      ctx.drawImage(
        room.state.sideBuf,
        sampleX, 0, 1, DIMS_W,
        x1, cy - halfSpanY, sliceW, halfSpanY * 2
      );
    }
    ctx.restore();
    
    // --- RIGHT WALL ---
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.clip();
    
    for (let i = 0; i < SLICES; i++) {
      const z0 = Math.pow(i / SLICES, 2.2);
      const z1 = Math.pow((i + 1) / SLICES, 2.2);
      const x0 = cx + z0 * (W - cx);
      const sliceW = Math.max(1.5, (z1 - z0) * (W - cx) + 0.8);
      const sampleX = Math.min(DIMS_H - 1, Math.floor(z0 * (DIMS_H - 1)));
      
      const halfSpanY = z0 * cy * 2.2;
      ctx.drawImage(
        room.state.sideBuf,
        sampleX, 0, 1, DIMS_W,
        x0, cy - halfSpanY, sliceW, halfSpanY * 2
      );
    }
    ctx.restore();
  }
};

const isDual = (modeKey === 'dual_planes');
const isChasm = (modeKey === 'vertical_crevasse');
drawWallPlanes(isDual, isChasm);

// Horizon Infinite Slit Glow (the optical slit source in 2001)
ctx.save();
ctx.globalCompositeOperation = 'screen';
const slitThickness = 3.0 + reactiveBass * 14.0 + (audio.beat ? 12 : 0);
const slitWidth = isChasm ? 12 : W * 0.96;
const slitHeight = isChasm ? H * 0.96 : slitThickness;

const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(slitWidth * 0.5, 80));
grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
grad.addColorStop(0.2, `rgba(${pal.c4[0]}, ${pal.c4[1]}, ${pal.c4[2]}, 0.8)`);
grad.addColorStop(0.6, `rgba(${pal.c2[0]}, ${pal.c2[1]}, ${pal.c2[2]}, 0.3)`);
grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

ctx.fillStyle = grad;
ctx.fillRect(cx - slitWidth * 0.5, cy - slitHeight * 0.5, slitWidth, slitHeight);

// Subtle optical anamorphic line streak
ctx.strokeStyle = `rgba(${pal.c4[0]}, ${pal.c4[1]}, ${pal.c4[2]}, ${0.7 + reactiveBass * 0.3})`;
ctx.lineWidth = 1.5 + reactiveBass * 2.0;
ctx.beginPath();
if (isChasm) {
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, H);
} else {
  ctx.moveTo(0, cy);
  ctx.lineTo(W, cy);
}
ctx.stroke();
ctx.restore();

ctx.restore();