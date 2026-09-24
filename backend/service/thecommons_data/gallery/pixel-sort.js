const W = 320, H = 180;

room.state.bins ??= new Int32Array(256);
room.state.offsets ??= new Int32Array(256);
room.state.temp ??= new Uint32Array(320);
room.state.runPixels ??= new Uint32Array(320);
room.state.runLumas ??= new Uint8Array(320);
room.state.offCanvas ??= new OffscreenCanvas(W, H);
room.state.offCtx ??= room.state.offCanvas.getContext('2d', { willReadFrequently: true });

const offCanvas = room.state.offCanvas;
const offCtx = room.state.offCtx;
const bins = room.state.bins;
const offsets = room.state.offsets;
const temp = room.state.temp;
const runPixels = room.state.runPixels;
const runLumas = room.state.runLumas;

const intensity = getVar('glitch_intensity') ?? 0.6;
const speed = getVar('sweep_speed') ?? 1.0;
const mode = getVar('sort_mode') ?? 'Horizontal Drift';
const style = getVar('landscape_style') ?? 'Neon Ridges';
const palChoice = getVar('palette') ?? 'Cyber Sunset';

const palettes = {
  'Cyber Sunset': { sky0: '#0c011a', sky1: '#db2777', sun: '#fde047', glow: '#f43f5e', m1: '#581c87', m2: '#2e1065', m3: '#0f0529', grid: '#06b6d4' },
  'Emerald Matrix': { sky0: '#010c05', sky1: '#064e22', sun: '#4ade80', glow: '#15803d', m1: '#14532d', m2: '#052e16', m3: '#021609', grid: '#22c55e' },
  'Thermal Drift': { sky0: '#1e0533', sky1: '#991b1b', sun: '#f97316', glow: '#fbbf24', m1: '#701a75', m2: '#4a044e', m3: '#1a0022', grid: '#ec4899' },
  'Monochrome Void': { sky0: '#090a0f', sky1: '#333745', sun: '#f8fafc', glow: '#64748b', m1: '#262933', m2: '#16181f', m3: '#090a0d', grid: '#94a3b8' }
};
const pal = palettes[palChoice] ?? palettes['Cyber Sunset'];

const t = frame.t * speed;
const bass = audio.bass || 0;
const mid = audio.mid || 0;
const treble = audio.treble || 0;
const beat = audio.beat;

offCtx.save();
const skyGrad = offCtx.createLinearGradient(0, 0, 0, H * 0.75);
skyGrad.addColorStop(0, pal.sky0);
skyGrad.addColorStop(1, pal.sky1);
offCtx.fillStyle = skyGrad;
offCtx.fillRect(0, 0, W, H);

const sunX = W * 0.5 + Math.sin(t * 0.15) * 45;
const sunY = H * 0.44 + Math.cos(t * 0.12) * 8;
const sunR = 24 + bass * 12;

offCtx.fillStyle = pal.glow;
offCtx.beginPath();
offCtx.arc(sunX, sunY, sunR + 8, 0, Math.PI * 2);
offCtx.fill();

offCtx.fillStyle = pal.sun;
offCtx.beginPath();
offCtx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
offCtx.fill();

offCtx.fillStyle = pal.sky0;
for (let sy = sunY - sunR * 0.5; sy < sunY + sunR; sy += 4) {
  const barH = 1.2 + ((sy - (sunY - sunR)) / (sunR * 2)) * 2;
  offCtx.fillRect(sunX - sunR - 4, sy, (sunR + 4) * 2, barH);
}

const drawRidge = (baseY, amp, freq, shift, color) => {
  offCtx.fillStyle = color;
  offCtx.beginPath();
  offCtx.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) {
    let y = baseY;
    if (style === 'Neon Ridges') {
      y += Math.sin(x * freq + shift) * amp + Math.cos(x * freq * 2.3 - shift * 0.7) * (amp * 0.45);
    } else if (style === 'Polygonal Peaks') {
      const phase = (x * freq + shift) % 2;
      y += (Math.abs(phase - 1) * 2 - 1) * amp;
    } else {
      const raw = Math.sin(x * freq + shift) * amp;
      y += Math.floor(raw / 7) * 7;
    }
    offCtx.lineTo(x, y);
  }
  offCtx.lineTo(W, H);
  offCtx.closePath();
  offCtx.fill();
};

drawRidge(H * 0.52, 18 + bass * 6, 0.018, t * 0.35, pal.m1);
drawRidge(H * 0.65, 24 + mid * 8, 0.026, -t * 0.6, pal.m2);
drawRidge(H * 0.80, 20, 0.038, t * 0.9, pal.m3);

offCtx.strokeStyle = pal.grid;
offCtx.lineWidth = 1;
offCtx.globalAlpha = 0.4 + mid * 0.3;
const gridYStart = H * 0.78;
for (let y = gridYStart; y < H; y += 7) {
  offCtx.beginPath();
  offCtx.moveTo(0, y);
  offCtx.lineTo(W, y);
  offCtx.stroke();
}
for (let gx = -W; gx < W * 2; gx += 20) {
  const xDrift = (gx + (t * 22) % 20);
  offCtx.beginPath();
  offCtx.moveTo(xDrift, gridYStart);
  offCtx.lineTo(W * 0.5 + (xDrift - W * 0.5) * 2.4, H);
  offCtx.stroke();
}
offCtx.globalAlpha = 1.0;

if (room.people && room.people.length > 0) {
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    let hash = 0;
    for (let c = 0; c < p.id.length; c++) hash = (hash * 33 + p.id.charCodeAt(c)) | 0;
    const bx = Math.abs(hash) % (W - 20) + 10;
    const by = H * 0.72 + (Math.abs(hash >> 3) % 18);
    offCtx.fillStyle = `hsl(${p.hue}, 95%, 65%)`;
    offCtx.fillRect(bx - 1, by - 4, 3, 5);
    offCtx.fillRect(bx, by - 14, 1, 10);
  }
}

if (beat) {
  const sliceY = (Math.sin(t * 13) * 0.5 + 0.5) * (H - 24);
  offCtx.drawImage(offCanvas, 0, sliceY, W, 18, (Math.sin(t * 70) * 12) | 0, sliceY, W, 18);
}
offCtx.restore();

const imgData = offCtx.getImageData(0, 0, W, H);
const data32 = new Uint32Array(imgData.data.buffer);
const sweepT = t * 1.5;

const sortRun = (start, len, stride, idxBase) => {
  if (len < 4) return;
  bins.fill(0);
  for (let i = 0; i < len; i++) {
    const p = data32[idxBase + i * stride];
    const luma = ((p & 0xff) * 77 + ((p >> 8) & 0xff) * 150 + ((p >> 16) & 0xff) * 29) >> 8;
    runPixels[i] = p;
    runLumas[i] = luma;
    bins[luma]++;
  }
  let acc = 0;
  for (let k = 0; k < 256; k++) {
    offsets[k] = acc;
    acc += bins[k];
  }
  for (let i = 0; i < len; i++) {
    const luma = runLumas[i];
    temp[offsets[luma]++] = runPixels[i];
  }
  if (beat) {
    for (let i = 0; i < len; i++) {
      data32[idxBase + i * stride] = temp[len - 1 - i];
    }
  } else {
    for (let i = 0; i < len; i++) {
      data32[idxBase + i * stride] = temp[i];
    }
  }
};

if (mode === 'Horizontal Drift' || mode === 'Crosshatch Glitch') {
  const rowStep = mode === 'Crosshatch Glitch' ? 2 : 1;
  for (let y = 0; y < H; y += rowStep) {
    const rowOffset = y * W;
    const wave = Math.sin(y * 0.055 - sweepT) * 0.5 + 0.5;
    const threshLow = Math.max(12, (wave * 150 - intensity * 45) | 0);
    const threshHigh = Math.min(248, threshLow + 45 + (intensity * 90 | 0) + (bass * 50 | 0));

    let x = 0;
    while (x < W) {
      while (x < W) {
        const p = data32[rowOffset + x];
        const l = ((p & 0xff) * 77 + ((p >> 8) & 0xff) * 150 + ((p >> 16) & 0xff) * 29) >> 8;
        if (l >= threshLow && l <= threshHigh) break;
        x++;
      }
      const start = x;
      while (x < W) {
        const p = data32[rowOffset + x];
        const l = ((p & 0xff) * 77 + ((p >> 8) & 0xff) * 150 + ((p >> 16) & 0xff) * 29) >> 8;
        if (l < threshLow || l > threshHigh) break;
        x++;
      }
      sortRun(start, x - start, 1, rowOffset + start);
    }
  }
}

if (mode === 'Vertical Cascade' || mode === 'Crosshatch Glitch') {
  const colStep = mode === 'Crosshatch Glitch' ? 4 : 1;
  for (let x = 0; x < W; x += colStep) {
    const wave = Math.sin(x * 0.045 + sweepT * 0.8) * 0.5 + 0.5;
    const threshLow = Math.max(16, (wave * 135 - intensity * 40) | 0);
    const threshHigh = Math.min(245, threshLow + 50 + (intensity * 80 | 0) + (treble * 40 | 0));

    let y = 0;
    while (y < H) {
      while (y < H) {
        const p = data32[y * W + x];
        const l = ((p & 0xff) * 77 + ((p >> 8) & 0xff) * 150 + ((p >> 16) & 0xff) * 29) >> 8;
        if (l >= threshLow && l <= threshHigh) break;
        y++;
      }
      const start = y;
      while (y < H) {
        const p = data32[y * W + x];
        const l = ((p & 0xff) * 77 + ((p >> 8) & 0xff) * 150 + ((p >> 16) & 0xff) * 29) >> 8;
        if (l < threshLow || l > threshHigh) break;
        y++;
      }
      sortRun(start, y - start, W, start * W + x);
    }
  }
}

offCtx.putImageData(imgData, 0, 0);

ctx.save();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(offCanvas, 0, 0, frame.width, frame.height);
ctx.restore();