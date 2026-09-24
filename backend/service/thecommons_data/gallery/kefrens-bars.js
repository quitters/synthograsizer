const BW = 480;
const BH = 270;

if (!room.state.init) {
  room.state.init = true;
  room.state.offCanvas = new OffscreenCanvas(BW, BH);
  room.state.offCtx = room.state.offCanvas.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(BW, BH);
  room.state.pixels = new Uint32Array(room.state.imgData.data.buffer);
  room.state.lut = new Uint32Array(256);
  room.state.lastPal = '';
  room.state.barOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  room.state.barX = new Float32Array(9);
  room.state.barZ = new Float32Array(9);
  room.state.seeded = false;
}

const paletteChoice = getVar('palette') || 'classic_copper';
if (room.state.lastPal !== paletteChoice) {
  room.state.lastPal = paletteChoice;
  const palettes = {
    classic_copper: [
      { p: 0.0, r: 16, g: 3, b: 2 },
      { p: 0.32, r: 145, g: 45, b: 12 },
      { p: 0.64, r: 245, g: 125, b: 35 },
      { p: 0.86, r: 255, g: 220, b: 110 },
      { p: 1.0, r: 255, g: 255, b: 245 }
    ],
    amiga_rainbow: [
      { p: 0.0, r: 10, g: 4, b: 26 },
      { p: 0.25, r: 18, g: 105, b: 235 },
      { p: 0.50, r: 35, g: 225, b: 115 },
      { p: 0.75, r: 255, g: 215, b: 35 },
      { p: 1.0, r: 255, g: 255, b: 255 }
    ],
    ice_chrome: [
      { p: 0.0, r: 6, g: 12, b: 26 },
      { p: 0.35, r: 28, g: 72, b: 135 },
      { p: 0.65, r: 95, g: 180, b: 235 },
      { p: 0.85, r: 205, g: 242, b: 255 },
      { p: 1.0, r: 255, g: 255, b: 255 }
    ],
    synth_cyber: [
      { p: 0.0, r: 20, g: 3, b: 30 },
      { p: 0.35, r: 145, g: 16, b: 128 },
      { p: 0.65, r: 248, g: 36, b: 148 },
      { p: 0.85, r: 255, g: 205, b: 45 },
      { p: 1.0, r: 255, g: 255, b: 255 }
    ]
  };
  const stops = palettes[paletteChoice] || palettes.classic_copper;
  for (let i = 0; i < 256; i++) {
    const f = i / 255;
    let s0 = stops[0], s1 = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (f >= stops[s].p && f <= stops[s + 1].p) {
        s0 = stops[s];
        s1 = stops[s + 1];
        break;
      }
    }
    const t = (s1.p === s0.p) ? 0 : (f - s0.p) / (s1.p - s0.p);
    const r = Math.round(s0.r + (s1.r - s0.r) * t);
    const g = Math.round(s0.g + (s1.g - s0.g) * t);
    const b = Math.round(s0.b + (s1.b - s0.b) * t);
    room.state.lut[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
  }
}

const barCount = Math.max(3, Math.min(9, getVar('bar_count') ?? 5));
const barWidth = Math.max(16, Math.min(48, getVar('bar_width') ?? 28));
const cascadeSpeed = Math.max(1, Math.min(4, getVar('cascade_speed') ?? 2));
const weaveMode = getVar('weave_mode') || 'braid';
const renderStyle = getVar('render_style') || 'phosphor_bloom';

const weaveConfigs = {
  braid: { f1: 1.25, f2: 2.65, pStep: 0.88, a1: 0.23, a2: 0.13 },
  unison: { f1: 1.05, f2: 2.10, pStep: 0.16, a1: 0.27, a2: 0.08 },
  vortex: { f1: 1.65, f2: 3.35, pStep: 1.55, a1: 0.21, a2: 0.19 }
};
const cfg = weaveConfigs[weaveMode] || weaveConfigs.braid;

const bass = audio ? audio.bass : 0;
const beatPulse = (audio && audio.beat) ? 0.35 : 0;
const swayAmp = 1.0 + bass * 1.5 + beatPulse;
const amp1 = BW * cfg.a1 * swayAmp;
const amp2 = BW * cfg.a2 * swayAmp;
const midTint = audio ? Math.floor(audio.mid * 20) : 0;
const bgPixel = 0xFF000000 | (midTint << 16) | (midTint << 8) | (midTint + 8);

const drawRow = (targetY, evalTime) => {
  const rowStart = targetY * BW;
  room.state.pixels.fill(bgPixel, rowStart, rowStart + BW);

  for (let i = 0; i < barCount; i++) {
    const person = (room.people && room.people.length > 0) ? room.people[i % room.people.length] : null;
    const personPhase = person ? (person.hue * (Math.PI / 180)) : 0;
    const p = i * cfg.pStep + personPhase;
    const spread = (i - (barCount - 1) * 0.5) * (barWidth * 0.85);
    room.state.barX[i] = (BW * 0.5) + spread + Math.sin(evalTime * cfg.f1 + p) * amp1 + Math.sin(evalTime * cfg.f2 + p * 1.7) * amp2;
    room.state.barZ[i] = Math.cos(evalTime * cfg.f1 * 0.8 + p);
    room.state.barOrder[i] = i;
  }

  for (let i = 0; i < barCount - 1; i++) {
    for (let j = 0; j < barCount - 1 - i; j++) {
      if (room.state.barZ[room.state.barOrder[j]] > room.state.barZ[room.state.barOrder[j + 1]]) {
        const tmp = room.state.barOrder[j];
        room.state.barOrder[j] = room.state.barOrder[j + 1];
        room.state.barOrder[j + 1] = tmp;
      }
    }
  }

  const halfW = barWidth * 0.5;
  for (let b = 0; b < barCount; b++) {
    const idx = room.state.barOrder[b];
    const xc = room.state.barX[idx];
    const x0 = Math.max(0, Math.floor(xc - halfW));
    const x1 = Math.min(BW - 1, Math.ceil(xc + halfW));
    for (let x = x0; x <= x1; x++) {
      const u = (x - xc) / halfW;
      const u2 = u * u;
      if (u2 < 1.0) {
        const nz = Math.sqrt(1.0 - u2);
        const glint = Math.max(0, 1.0 - Math.abs(u + 0.22));
        const spec = glint * glint * glint * glint;
        const intensity = Math.min(255, Math.floor((nz * 0.62 + spec * 0.55) * 255));
        room.state.pixels[rowStart + x] = room.state.lut[intensity];
      }
    }
  }
};

if (!room.state.seeded) {
  room.state.seeded = true;
  for (let y = BH - 1; y >= 0; y--) {
    const simTime = frame.t - (y / Math.max(1, cascadeSpeed)) * (1 / 60);
    drawRow(y, simTime);
  }
} else {
  room.state.pixels.copyWithin(cascadeSpeed * BW, 0, (BH - cascadeSpeed) * BW);
  for (let s = 0; s < cascadeSpeed; s++) {
    const simTime = frame.t - (s / cascadeSpeed) * (1 / 60);
    drawRow(s, simTime);
  }
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.save();
ctx.fillStyle = '#060204';
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.imageSmoothingEnabled = (renderStyle !== 'crisp_amiga');
ctx.drawImage(room.state.offCanvas, 0, 0, frame.width, frame.height);

if (renderStyle === 'phosphor_bloom') {
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.30 + bass * 0.40;
  ctx.drawImage(room.state.offCanvas, 0, 0, frame.width, frame.height);
}
ctx.restore();