ctx.save();

const W = 160;
const H = 90;
const totalCells = W * H;

const paletteChoice = getVar('palette') ?? 'demon_fire';
const numStates = Math.max(4, Math.min(24, Math.round(getVar('states') ?? 12)));
const threshold = Math.max(1, Math.min(3, Math.round(getVar('threshold') ?? 1)));
const stepsPerFrame = Math.max(1, Math.min(4, Math.round(getVar('speed') ?? 2)));
const injectMode = getVar('inject_mode') ?? 'bass_eruption';

if (!room.state.gridA || room.state.w !== W || room.state.h !== H) {
  room.state.w = W;
  room.state.h = H;
  room.state.gridA = new Uint8Array(totalCells);
  room.state.gridB = new Uint8Array(totalCells);
  for (let i = 0; i < totalCells; i++) {
    room.state.gridA[i] = (Math.random() * numStates) | 0;
  }
  room.state.activeBuf = 0;
  room.state.offscreen = new OffscreenCanvas(W, H);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(W, H);
  room.state.pixels32 = new Uint32Array(room.state.imgData.data.buffer);
  room.state.lut = new Uint32Array(32);
  room.state.lutPal = '';
  room.state.lutStates = 0;
  room.state.beatPulse = 0;
}

if (room.state.lutPal !== paletteChoice || room.state.lutStates !== numStates) {
  room.state.lutPal = paletteChoice;
  room.state.lutStates = numStates;
  for (let s = 0; s < numStates; s++) {
    const f = s / numStates;
    let r = 0, g = 0, b = 0;
    if (paletteChoice === 'demon_fire') {
      const p = f * 4;
      if (p < 1) {
        r = Math.floor(40 + 160 * p); g = Math.floor(10 * p); b = Math.floor(25 * (1 - p));
      } else if (p < 2) {
        const q = p - 1;
        r = Math.floor(200 + 55 * q); g = Math.floor(10 + 110 * q); b = 0;
      } else if (p < 3) {
        const q = p - 2;
        r = 255; g = Math.floor(120 + 120 * q); b = Math.floor(40 * q);
      } else {
        const q = p - 3;
        r = Math.floor(255 - 150 * q); g = Math.floor(240 - 200 * q); b = Math.floor(40 + 200 * q);
      }
    } else if (paletteChoice === 'cyber_neon') {
      const h = (f * 360 + 280) % 360;
      const rad = (h * Math.PI) / 180;
      r = Math.floor(128 + 127 * Math.sin(rad));
      g = Math.floor(128 + 127 * Math.sin(rad + 2.094));
      b = Math.floor(128 + 127 * Math.sin(rad + 4.188));
      if (f > 0.8) { r = Math.min(255, r + 60); g = Math.min(255, g + 60); }
    } else if (paletteChoice === 'emerald_matrix') {
      const lum = Math.pow(f, 1.4);
      r = Math.floor(15 * lum + 10 * (1 - f));
      g = Math.floor(50 + 205 * lum);
      b = Math.floor(35 * lum + 30 * f);
    } else {
      const h = f * 360;
      const c = 0.9, l = 0.55;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l - c / 2;
      let tr = 0, tg = 0, tb = 0;
      if (h < 60) { tr = c; tg = x; }
      else if (h < 120) { tr = x; tg = c; }
      else if (h < 180) { tg = c; tb = x; }
      else if (h < 240) { tg = x; tb = c; }
      else if (h < 300) { tr = x; tb = c; }
      else { tr = c; tb = x; }
      r = Math.floor((tr + m) * 255);
      g = Math.floor((tg + m) * 255);
      b = Math.floor((tb + m) * 255);
    }
    room.state.lut[s] = 0xFF000000 | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
  }
}

let cur = room.state.activeBuf === 0 ? room.state.gridA : room.state.gridB;
let nxt = room.state.activeBuf === 0 ? room.state.gridB : room.state.gridA;

if (injectMode === 'bass_eruption') {
  if (audio.beat || audio.bass > 0.62) {
    room.state.beatPulse = 1.0;
    const cx = Math.floor(W * 0.5 + (Math.sin(frame.t * 2.3) * W * 0.25));
    const cy = Math.floor(H * 0.5 + (Math.cos(frame.t * 1.9) * H * 0.25));
    const rad = 2 + Math.floor(audio.bass * 4);
    const seedState = Math.floor((frame.t * 4) % numStates);
    for (let dy = -rad; dy <= rad; dy++) {
      const ny = (cy + dy + H) % H;
      const row = ny * W;
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= rad * rad) {
          const nx = (cx + dx + W) % W;
          cur[row + nx] = seedState;
        }
      }
    }
  }
} else if (injectMode === 'person_sparks') {
  const people = room.people || [];
  const limit = Math.min(people.length, 12);
  for (let p = 0; p < limit; p++) {
    const person = people[p];
    const angle = (person.hue / 360) * Math.PI * 2 + frame.t * 0.8;
    const dist = 0.22 + 0.22 * Math.sin(frame.t * 0.5 + p);
    const px = Math.floor(((Math.cos(angle) * dist) + 0.5) * W) % W;
    const py = Math.floor(((Math.sin(angle) * dist) + 0.5) * H) % H;
    const targetSt = Math.floor((person.hue / 360) * numStates) % numStates;
    const baseIdx = ((py + H) % H) * W + ((px + W) % W);
    cur[baseIdx] = targetSt;
    if (baseIdx + 1 < totalCells) cur[baseIdx + 1] = targetSt;
    if (baseIdx + W < totalCells) cur[baseIdx + W] = targetSt;
  }
} else {
  const driftX = Math.floor((Math.sin(frame.t * 0.7) * 0.4 + 0.5) * W);
  const driftY = Math.floor((Math.cos(frame.t * 0.5) * 0.4 + 0.5) * H);
  const driftState = Math.floor(frame.t * 2) % numStates;
  cur[driftY * W + driftX] = driftState;
  if (audio.treble > 0.5) {
    const rx = Math.floor(Math.random() * W);
    const ry = Math.floor(Math.random() * H);
    cur[ry * W + rx] = (cur[ry * W + rx] + 1) % numStates;
  }
}

for (let step = 0; step < stepsPerFrame; step++) {
  for (let y = 0; y < H; y++) {
    const ym1 = (y === 0 ? H - 1 : y - 1) * W;
    const y0  = y * W;
    const yp1 = (y === H - 1 ? 0 : y + 1) * W;
    for (let x = 0; x < W; x++) {
      const xm1 = x === 0 ? W - 1 : x - 1;
      const xp1 = x === W - 1 ? 0 : x + 1;
      const idx = y0 + x;
      const c = cur[idx] % numStates;
      const target = (c + 1) === numStates ? 0 : c + 1;

      let count = 0;
      if ((cur[ym1 + xm1] % numStates) === target) count++;
      if ((cur[ym1 + x]   % numStates) === target) count++;
      if ((cur[ym1 + xp1] % numStates) === target) count++;
      if ((cur[y0  + xm1] % numStates) === target) count++;
      if ((cur[y0  + xp1] % numStates) === target) count++;
      if ((cur[yp1 + xm1] % numStates) === target) count++;
      if ((cur[yp1 + x]   % numStates) === target) count++;
      if ((cur[yp1 + xp1] % numStates) === target) count++;

      nxt[idx] = count >= threshold ? target : c;
    }
  }
  const tmp = cur;
  cur = nxt;
  nxt = tmp;
  room.state.activeBuf = room.state.activeBuf === 0 ? 1 : 0;
}

const lut = room.state.lut;
const pix = room.state.pixels32;
for (let i = 0; i < totalCells; i++) {
  pix[i] = lut[cur[i] % numStates];
}
room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.fillStyle = '#06060a';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.imageSmoothingEnabled = false;
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

room.state.beatPulse = Math.max(0, room.state.beatPulse - frame.dt * 2.8);
if (room.state.beatPulse > 0.01) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(255, 120, 80, ${room.state.beatPulse * 0.18})`;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.restore();
}

const vig = ctx.createRadialGradient(
  frame.width * 0.5, frame.height * 0.5, frame.width * 0.32,
  frame.width * 0.5, frame.height * 0.5, frame.width * 0.72
);
vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
vig.addColorStop(1, 'rgba(0, 4, 12, 0.65)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.restore();