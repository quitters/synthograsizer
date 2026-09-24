ctx.save();
const W = 192;
const H = 108;
const P = W * H;

const paletteKey = getVar('metal_tone') ?? 'warm_brass';
const ringCount = Math.round(getVar('ring_complexity') ?? 3);
const bumpScale = (getVar('relief_depth') ?? 2.5) * 0.45;
const motionMode = getVar('light_motion') ?? 'orbital';
const gloss = getVar('sheen_gloss') ?? 35;

const tones = {
  warm_brass:   { base: [42, 34, 18],  diff: [240, 195, 110], spec: [255, 248, 220] },
  aged_bronze:  { base: [34, 26, 20],  diff: [190, 130, 80],  spec: [245, 215, 170] },
  rose_copper:  { base: [46, 24, 24],  diff: [230, 140, 120], spec: [255, 230, 225] },
  golden_amber: { base: [48, 30, 12],  diff: [250, 175, 55],  spec: [255, 250, 200] }
};
const tone = tones[paletteKey] ?? tones.warm_brass;

if (!room.state.initialized || room.state.lastRings !== ringCount || room.state.lastDepth !== bumpScale) {
  room.state.initialized = true;
  room.state.lastRings = ringCount;
  room.state.lastDepth = bumpScale;

  room.state.offscreen = new OffscreenCanvas(W, H);
  room.state.offCtx = room.state.offscreen.getContext('2d', { willReadFrequently: true });
  room.state.imgData = room.state.offCtx.createImageData(W, H);
  room.state.pixels = room.state.imgData.data;

  room.state.normals = new Float32Array(P * 3);
  const height = new Float32Array(P);

  const centers = [];
  for (let i = 0; i < ringCount; i++) {
    const ang = (i / ringCount) * Math.PI * 2;
    const rad = 28 + (i % 2) * 12;
    centers.push({ x: W * 0.5 + Math.cos(ang) * rad, y: H * 0.5 + Math.sin(ang) * (rad * 0.65) });
  }

  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let h = 0;
      for (let c = 0; c < centers.length; c++) {
        const dx = x - centers[c].x;
        const dy = y - centers[c].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        h += Math.sin(d * 0.38) * Math.exp(-d * 0.012);
        h += Math.cos((dx + dy) * 0.15) * 0.25;
      }
      const brushGrain = Math.sin(x * 1.8 + y * 0.4) * 0.08 + Math.cos(x * 3.4) * 0.04;
      height[row + x] = h + brushGrain;
    }
  }

  const norm = room.state.normals;
  for (let y = 0; y < H; y++) {
    const yPrev = (y > 0 ? y - 1 : y) * W;
    const yNext = (y < H - 1 ? y + 1 : y) * W;
    const yCurr = y * W;
    for (let x = 0; x < W; x++) {
      const xPrev = x > 0 ? x - 1 : x;
      const xNext = x < W - 1 ? x + 1 : x;
      const dhdx = (height[yCurr + xNext] - height[yCurr + xPrev]) * bumpScale;
      const dhdy = (height[yNext + x] - height[yPrev + x]) * bumpScale;
      const nz = 1.0;
      const invLen = 1.0 / Math.sqrt(dhdx * dhdx + dhdy * dhdy + nz * nz);
      const idx = (yCurr + x) * 3;
      norm[idx] = -dhdx * invLen;
      norm[idx + 1] = -dhdy * invLen;
      norm[idx + 2] = nz * invLen;
    }
  }
}

const t = frame.t;
const bass = audio.bass ?? 0;
const treble = audio.treble ?? 0;

let lx, ly;
if (motionMode === 'lissajous') {
  lx = W * 0.5 + Math.sin(t * 1.2) * (W * 0.42);
  ly = H * 0.5 + Math.cos(t * 1.7) * (H * 0.38);
} else if (motionMode === 'pulse_chase') {
  const ang = t * 2.0 + bass * 1.5;
  const rad = (W * 0.3) + Math.sin(t * 3.0) * 18;
  lx = W * 0.5 + Math.cos(ang) * rad;
  ly = H * 0.5 + Math.sin(ang) * (rad * 0.6);
} else {
  lx = W * 0.5 + Math.cos(t * 0.85) * (W * 0.38);
  ly = H * 0.5 + Math.sin(t * 0.85) * (H * 0.35);
}
const lz = 40 + Math.sin(t * 1.5) * 12 - bass * 16;

const norm = room.state.normals;
const pix = room.state.pixels;
const pCount = room.people?.length ?? 0;
const tintH = pCount > 0 ? (room.people[0].hue ?? 40) : 40;
const tintR = Math.sin((tintH / 360) * Math.PI * 2) * 20;
const tintB = Math.cos((tintH / 360) * Math.PI * 2) * 20;

let nIdx = 0;
let pIdx = 0;
for (let y = 0; y < H; y++) {
  const dy = ly - y;
  const dy2 = dy * dy;
  for (let x = 0; x < W; x++) {
    const dx = lx - x;
    const distSq = dx * dx + dy2 + lz * lz;
    const invDist = 1.0 / Math.sqrt(distSq);

    const lDirX = dx * invDist;
    const lDirY = dy * invDist;
    const lDirZ = lz * invDist;

    const nx = norm[nIdx];
    const ny = norm[nIdx + 1];
    const nz = norm[nIdx + 2];
    nIdx += 3;

    let diff = nx * lDirX + ny * lDirY + nz * lDirZ;
    if (diff < 0) diff = 0;

    const hx = lDirX;
    const hy = lDirY;
    const hz = lDirZ + 1.0;
    const invH = 1.0 / Math.sqrt(hx * hx + hy * hy + hz * hz);
    let ndoth = (nx * hx + ny * hy + nz * hz) * invH;
    if (ndoth < 0) ndoth = 0;

    let spec = 1.0;
    for (let k = 0; k < 6; k++) {
      ndoth *= ndoth;
    }
    spec = ndoth * (0.8 + treble * 1.2);

    const atten = 16000 / (12000 + distSq);
    const litDiff = diff * atten;
    const litSpec = spec * atten * (gloss * 0.05);

    const r = tone.base[0] + tone.diff[0] * litDiff + tone.spec[0] * litSpec + tintR * litDiff;
    const g = tone.base[1] + tone.diff[1] * litDiff + tone.spec[1] * litSpec;
    const b = tone.base[2] + tone.diff[2] * litDiff + tone.spec[2] * litSpec + tintB * litDiff;

    pix[pIdx]     = r > 255 ? 255 : (r < 0 ? 0 : r);
    pix[pIdx + 1] = g > 255 ? 255 : (g < 0 ? 0 : g);
    pix[pIdx + 2] = b > 255 ? 255 : (b < 0 ? 0 : b);
    pix[pIdx + 3] = 255;
    pIdx += 4;
  }
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.fillStyle = '#0a0806';
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

if (audio.beat) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255, 230, 180, 0.08)';
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.globalCompositeOperation = 'source-over';
}

ctx.restore();