const paletteChoice = getVar('palette') ?? 'cinematic';
const spin = getVar('spin') ?? 1.0;
const diskDensity = getVar('disk_density') ?? 3;
const dopplerMult = getVar('doppler_strength') ?? 1.5;
const showFlare = getVar('lens_flare') ?? true;
const upscaleStyle = getVar('upscale_style') ?? 'cinematic_smooth';

const W = 240;
const H = 135;
const N = W * H;

if (!room.state.init || room.state.lutWidth !== W) {
  room.state.init = true;
  room.state.lutWidth = W;
  room.state.lutHeight = H;
  room.state.offCanvas = new OffscreenCanvas(W, H);
  room.state.offCtx = room.state.offCanvas.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(W, H);
  room.state.pixels = new Uint32Array(room.state.imgData.data.buffer);

  room.state.sinTable = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    room.state.sinTable[i] = Math.sin((i / 1024) * Math.PI * 2);
  }

  room.state.starMap = new Uint8Array(W * H);
  let seed = 1337;
  for (let i = 0; i < W * H; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    if ((seed & 0xFFF) < 14) {
      room.state.starMap[i] = 120 + ((seed >> 12) & 0x7F);
    }
  }

  room.state.lutType = new Uint8Array(N);
  room.state.lutDiskR = new Float32Array(N);
  room.state.lutDiskPhi = new Float32Array(N);
  room.state.lutDoppler = new Float32Array(N);
  room.state.lutStarIdx = new Int32Array(N);

  const cx = W * 0.5;
  const cy = H * 0.52;
  const rCapt = 27;
  const rIn = 30;
  const rOut = 95;
  const rE = 29;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);

      const frontTiltY = dy * 4.6;
      const rDirect = Math.sqrt(dx * dx + frontTiltY * frontTiltY);

      const isShadow = r < rCapt;
      const isFront = dy > -2 && rDirect >= rIn && rDirect <= rOut;

      let isTopLensed = false;
      let rLensed = 0;
      let phiLensed = 0;
      if (!isShadow && dy < 4) {
        const dr = r - rCapt;
        const diskMapped = rIn + dr * 1.35;
        if (diskMapped >= rIn && diskMapped <= rOut) {
          isTopLensed = true;
          rLensed = diskMapped;
          phiLensed = Math.atan2(-dy * 1.8, dx) + Math.PI;
        }
      }

      let isBotLensed = false;
      if (!isShadow && !isFront && dy >= 4 && dy < 26) {
        const dr = r - rCapt;
        const diskMapped = rIn + dr * 1.8;
        if (diskMapped >= rIn && diskMapped <= rOut * 0.8) {
          isBotLensed = true;
          rLensed = diskMapped;
          phiLensed = Math.atan2(dy * 1.8, dx);
        }
      }

      if (isShadow) {
        room.state.lutType[idx] = 0;
      } else if (isFront) {
        room.state.lutType[idx] = 1;
        room.state.lutDiskR[idx] = rDirect;
        room.state.lutDiskPhi[idx] = Math.atan2(frontTiltY, dx);
        const vLos = -(dx / rDirect) * 0.85;
        room.state.lutDoppler[idx] = Math.max(0.1, 1.0 + vLos);
      } else if (isTopLensed) {
        room.state.lutType[idx] = 2;
        room.state.lutDiskR[idx] = rLensed;
        room.state.lutDiskPhi[idx] = phiLensed;
        const vLos = -(dx / (r + 0.1)) * 0.7;
        room.state.lutDoppler[idx] = Math.max(0.1, 1.0 + vLos);
      } else if (isBotLensed) {
        room.state.lutType[idx] = 3;
        room.state.lutDiskR[idx] = rLensed;
        room.state.lutDiskPhi[idx] = phiLensed;
        const vLos = (dx / (r + 0.1)) * 0.6;
        room.state.lutDoppler[idx] = Math.max(0.1, 1.0 + vLos);
      } else {
        room.state.lutType[idx] = 4;
        const defl = 1.0 - (rE * rE) / (r * r + 0.01);
        const sx = Math.floor(cx + dx * defl);
        const sy = Math.floor(cy + dy * defl);
        if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
          room.state.lutStarIdx[idx] = sy * W + sx;
        } else {
          room.state.lutStarIdx[idx] = -1;
        }
      }
    }
  }
}

if (room.state.currentPalette !== paletteChoice) {
  room.state.currentPalette = paletteChoice;
  room.state.paletteLUT = new Uint32Array(256);
  const lut = room.state.paletteLUT;

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = 0, g = 0, b = 0;
    if (paletteChoice === 'infrared') {
      if (t < 0.3) {
        const u = t / 0.3;
        r = Math.floor(u * 120);
        b = Math.floor(u * 60);
      } else if (t < 0.7) {
        const u = (t - 0.3) / 0.4;
        r = Math.floor(120 + u * 135);
        g = Math.floor(u * 80);
        b = Math.floor(60 + u * 100);
      } else {
        const u = (t - 0.7) / 0.3;
        r = 255;
        g = Math.floor(80 + u * 175);
        b = Math.floor(160 + u * 95);
      }
    } else if (paletteChoice === 'quasar') {
      if (t < 0.35) {
        const u = t / 0.35;
        b = Math.floor(u * 140);
        r = Math.floor(u * 40);
      } else if (t < 0.75) {
        const u = (t - 0.35) / 0.4;
        r = Math.floor(40 + u * 90);
        g = Math.floor(u * 190);
        b = Math.floor(140 + u * 115);
      } else {
        const u = (t - 0.75) / 0.25;
        r = Math.floor(130 + u * 125);
        g = Math.floor(190 + u * 65);
        b = 255;
      }
    } else if (paletteChoice === 'ultraviolet') {
      if (t < 0.4) {
        const u = t / 0.4;
        r = Math.floor(u * 80);
        b = Math.floor(u * 180);
      } else if (t < 0.8) {
        const u = (t - 0.4) / 0.4;
        r = Math.floor(80 + u * 140);
        g = Math.floor(u * 120);
        b = Math.floor(180 + u * 75);
      } else {
        const u = (t - 0.8) / 0.2;
        r = Math.floor(220 + u * 35);
        g = Math.floor(120 + u * 135);
        b = 255;
      }
    } else {
      if (t < 0.25) {
        const u = t / 0.25;
        r = Math.floor(u * 160);
        g = Math.floor(u * 20);
      } else if (t < 0.65) {
        const u = (t - 0.25) / 0.4;
        r = Math.floor(160 + u * 95);
        g = Math.floor(20 + u * 150);
        b = Math.floor(u * 30);
      } else {
        const u = (t - 0.65) / 0.35;
        r = 255;
        g = Math.floor(170 + u * 85);
        b = Math.floor(30 + u * 225);
      }
    }
    lut[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
  }
}

const sinTab = room.state.sinTable;
const fastSin = (a) => sinTab[((a * 162.974) | 0) & 1023];

const time = frame.t * spin;
const bass = audio.bass ?? 0;
const beat = audio.beat ? 0.3 : 0.0;
const mid = audio.mid ?? 0;

const pixels = room.state.pixels;
const lutType = room.state.lutType;
const lutDiskR = room.state.lutDiskR;
const lutDiskPhi = room.state.lutDiskPhi;
const lutDoppler = room.state.lutDoppler;
const lutStarIdx = room.state.lutStarIdx;
const starMap = room.state.starMap;
const palette = room.state.paletteLUT;

const shockPhase = time * 4.0;
const shockAmp = (bass * 0.4 + beat) * 0.35;

for (let i = 0; i < N; i++) {
  const type = lutType[i];
  if (type === 0) {
    pixels[i] = 0xFF000000;
  } else if (type === 4) {
    const sIdx = lutStarIdx[i];
    if (sIdx >= 0) {
      const s = starMap[sIdx];
      if (s > 0) {
        const b = s;
        const g = (s * 0.95) | 0;
        const r = (s * 0.9) | 0;
        pixels[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
      } else {
        pixels[i] = 0xFF020101;
      }
    } else {
      pixels[i] = 0xFF000000;
    }
  } else {
    const r = lutDiskR[i];
    const phi = lutDiskPhi[i];
    const dopplerRaw = lutDoppler[i];
    const doppler = Math.pow(dopplerRaw, dopplerMult);

    const omega = 55.0 / (r * 0.75 + 6.0);
    const rotAngle = phi + time * omega;

    const turb1 = fastSin(rotAngle * diskDensity + r * 0.22);
    const turb2 = fastSin(rotAngle * (diskDensity * 2.1) - r * 0.45);
    const turbulence = turb1 * 0.65 + turb2 * 0.35;

    const shock = fastSin(r * 0.35 - shockPhase) * shockAmp;

    const normR = (r - 30.0) / 65.0;
    const profile = fastSin(normR * Math.PI);

    let val = (0.35 + turbulence * 0.35 + shock + bass * 0.15) * profile * doppler;
    if (type === 2) val *= 1.15;
    if (type === 3) val *= 0.65;

    if (r < 33.0) {
      const photonRing = (33.0 - r) / 3.0;
      val += photonRing * (0.8 + mid * 0.4);
    }

    let pIdx = (val * 240.0) | 0;
    if (pIdx < 0) pIdx = 0;
    else if (pIdx > 255) pIdx = 255;
    pixels[i] = palette[pIdx];
  }
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.save();
ctx.imageSmoothingEnabled = (upscaleStyle === 'cinematic_smooth');
ctx.drawImage(room.state.offCanvas, 0, 0, frame.width, frame.height);

if (upscaleStyle === 'crt_scanline') {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  const step = Math.max(2, Math.floor(frame.height / 135));
  for (let y = 0; y < frame.height; y += step * 2) {
    ctx.fillRect(0, y, frame.width, step);
  }
  ctx.restore();
}

const cx = frame.width * 0.5;
const cy = frame.height * 0.52;
const scale = frame.width / W;

if (showFlare) {
  const flareX = cx - 35 * scale;
  const flareY = cy;
  const flareW = 280 * scale * (1.0 + bass * 0.4);
  const flareH = 2.5 * scale * (1.0 + beat);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const grad = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, flareW * 0.5);
  grad.addColorStop(0.0, 'rgba(210, 240, 255, 0.7)');
  grad.addColorStop(0.15, 'rgba(140, 200, 255, 0.4)');
  grad.addColorStop(0.5, 'rgba(255, 120, 40, 0.15)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(flareX, flareY, flareW * 0.5, flareH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const pAngle = (p.hue / 360) * Math.PI * 2 + time * 0.4 + i * 0.8;
    const pDist = (55 + (i % 5) * 6) * scale;
    const px = cx + Math.cos(pAngle) * pDist;
    const py = cy + Math.sin(pAngle) * (pDist * 0.22);

    const size = (3 + (bass * 3)) * (scale * 0.4);
    ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, 0.75)`;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

ctx.save();
const vig = ctx.createRadialGradient(cx, cy, frame.height * 0.4, cx, cy, frame.height * 0.85);
vig.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
vig.addColorStop(1.0, 'rgba(0, 0, 0, 0.6)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.restore();

ctx.restore();