const GW = 320;
const GH = 180;
const AGENTS = 5500;
const PI2 = Math.PI * 2;

// Initialize persistent state and fixed buffers
if (!room.state.trail) {
  room.state.trail = new Float32Array(GW * GH);
  room.state.diffused = new Float32Array(GW * GH);
  room.state.ax = new Float32Array(AGENTS);
  room.state.ay = new Float32Array(AGENTS);
  room.state.ang = new Float32Array(AGENTS);
  
  const cx = GW * 0.5;
  const cy = GH * 0.5;
  for (let i = 0; i < AGENTS; i++) {
    const r = Math.sqrt(Math.random()) * (GH * 0.38);
    const th = Math.random() * PI2;
    room.state.ax[i] = cx + Math.cos(th) * r;
    room.state.ay[i] = cy + Math.sin(th) * r;
    room.state.ang[i] = th + Math.PI * 0.5;
  }
  
  room.state.offscreen = new OffscreenCanvas(GW, GH);
  room.state.offCtx = room.state.offscreen.getContext('2d', { alpha: false });
  room.state.imgData = room.state.offCtx.createImageData(GW, GH);
  room.state.pixelBuf = new Uint32Array(room.state.imgData.data.buffer);
  room.state.pal32 = new Uint32Array(256);
  room.state.activePal = '';
}

const paletteKey = getVar('palette') || 'bioluminescence';
const structureKey = getVar('structure') || 'capillary_web';
const sensorAngleDeg = getVar('sensor_angle') ?? 35;
const speedBase = getVar('agent_speed') ?? 2;
const decayBase = getVar('decay_speed') ?? 0.94;

// Update precomputed 256-color gradient LUT when palette changes
if (room.state.activePal !== paletteKey) {
  room.state.activePal = paletteKey;
  const pal = room.state.pal32;
  const stops = {
    bioluminescence: [[0, 5, 14], [10, 50, 70], [30, 180, 190], [180, 255, 230]],
    toxic_amber:     [[8, 8, 2],  [60, 45, 10], [210, 150, 20], [255, 245, 160]],
    cyber_fungus:    [[8, 2, 14], [60, 15, 80], [190, 40, 210], [140, 240, 255]],
    crimson_vein:    [[12, 2, 4], [80, 15, 25], [220, 50, 60],  [255, 210, 180]]
  }[paletteKey] || [[0, 5, 14], [10, 50, 70], [30, 180, 190], [180, 255, 230]];

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const st = (t * (stops.length - 1)) - seg;
    const c0 = stops[seg];
    const c1 = stops[seg + 1];
    const r = Math.round(c0[0] + (c1[0] - c0[0]) * st);
    const g = Math.round(c0[1] + (c1[1] - c0[1]) * st);
    const b = Math.round(c0[2] + (c1[2] - c0[2]) * st);
    // ABGR packed representation for 32-bit canvas buffer (Little-Endian)
    pal[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
}

const trail = room.state.trail;
const diffused = room.state.diffused;
const ax = room.state.ax;
const ay = room.state.ay;
const ang = room.state.ang;
const pal32 = room.state.pal32;
const pixelBuf = room.state.pixelBuf;

// Music dynamics modulation
const bassBoost = audio.bass * 0.04;
const decay = Math.min(0.985, decayBase + bassBoost);
const speed = speedBase * (1.0 + audio.level * 0.45);
const sensorDist = 5.0 + audio.mid * 4.0;
const sensorAngle = (sensorAngleDeg * Math.PI) / 180;
const turnSpeed = 0.35 + (audio.treble * 0.25);

// Structure bias
const webBias = structureKey === 'meandering_river' ? 0.08 : 0.0;
const spiralBias = structureKey === 'spiral_colony' ? 0.04 : 0.0;

// Inject beacon traces from connected room participants
if (room.people && room.people.length > 0) {
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const ph = (person.hue || 0) * (Math.PI / 180);
    const px = Math.floor(GW * 0.5 + Math.cos(ph + frame.t * 0.2) * (GW * 0.3));
    const py = Math.floor(GH * 0.5 + Math.sin(ph + frame.t * 0.2) * (GH * 0.3));
    if (px >= 2 && px < GW - 2 && py >= 2 && py < GH - 2) {
      trail[py * GW + px] = Math.min(1.0, trail[py * GW + px] + 0.35);
    }
  }
}

// Beat surge adds an ambient pulse at center
if (audio.beat) {
  const midIdx = Math.floor(GH * 0.5) * GW + Math.floor(GW * 0.5);
  trail[midIdx] = 1.0;
}

// 1. AGENT SIMULATION PASS
for (let i = 0; i < AGENTS; i++) {
  let x = ax[i];
  let y = ay[i];
  let a = ang[i];

  // 3-point sensory probe (left, center, right)
  const aL = a - sensorAngle;
  const aR = a + sensorAngle;

  let xl = Math.floor(x + Math.cos(aL) * sensorDist);
  let yl = Math.floor(y + Math.sin(aL) * sensorDist);
  let xc = Math.floor(x + Math.cos(a) * sensorDist);
  let yc = Math.floor(y + Math.sin(a) * sensorDist);
  let xr = Math.floor(x + Math.cos(aR) * sensorDist);
  let yr = Math.floor(y + Math.sin(aR) * sensorDist);

  // Periodic boundaries for sampling
  xl = (xl % GW + GW) % GW;
  yl = (yl % GH + GH) % GH;
  xc = (xc % GW + GW) % GW;
  yc = (yc % GH + GH) % GH;
  xr = (xr % GW + GW) % GW;
  yr = (yr % GH + GH) % GH;

  const sL = trail[yl * GW + xl];
  const sC = trail[yc * GW + xc];
  const sR = trail[yr * GW + xr];

  if (sC > sL && sC > sR) {
    // Continue forward
  } else if (sC < sL && sC < sR) {
    a += (Math.random() > 0.5 ? 1 : -1) * turnSpeed;
  } else if (sL > sR) {
    a -= turnSpeed;
  } else if (sR > sL) {
    a += turnSpeed;
  }

  // Subtle stylistic steering & noise
  a += (Math.random() - 0.5) * 0.15 + webBias * Math.sin(y * 0.05) + spiralBias;

  // Move agent
  x += Math.cos(a) * speed;
  y += Math.sin(a) * speed;

  // Soft boundary wrapping with margin
  if (x < 1) x = GW - 2;
  else if (x >= GW - 1) x = 1;
  if (y < 1) y = GH - 2;
  else if (y >= GH - 1) y = 1;

  ax[i] = x;
  ay[i] = y;
  ang[i] = a;

  // Deposit chemical
  const depositIdx = Math.floor(y) * GW + Math.floor(x);
  const currentVal = trail[depositIdx];
  if (currentVal < 1.0) {
    trail[depositIdx] = Math.min(1.0, currentVal + 0.45);
  }
}

// 2. CHEMICAL DIFFUSION & DECAY PASS
for (let y = 1; y < GH - 1; y++) {
  const row = y * GW;
  const rowUp = (y - 1) * GW;
  const rowDown = (y + 1) * GW;
  for (let x = 1; x < GW - 1; x++) {
    const sum = (trail[row + x - 1] + trail[row + x + 1] +
                 trail[rowUp + x] + trail[rowDown + x] +
                 trail[rowUp + x - 1] + trail[rowUp + x + 1] +
                 trail[rowDown + x - 1] + trail[rowDown + x + 1] +
                 trail[row + x] * 4) * 0.08333;
    diffused[row + x] = sum * decay;
  }
}

// Swap & map values to 32-bit pixel buffer
for (let idx = 0; idx < GW * GH; idx++) {
  const v = diffused[idx];
  trail[idx] = v;
  const valByte = Math.min(255, Math.floor(v * 255));
  pixelBuf[idx] = pal32[valByte];
}

// 3. RENDER BUFFER TO CANVAS
room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.save();
ctx.fillStyle = '#030508';
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.imageSmoothingEnabled = true;
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

// Subtle vignette overlay to focus central network glow
const vig = ctx.createRadialGradient(
  frame.width * 0.5, frame.height * 0.5, frame.height * 0.3,
  frame.width * 0.5, frame.height * 0.5, frame.width * 0.65
);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(2,4,8,0.65)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.restore();