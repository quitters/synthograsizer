ctx.save();

const W = 320;
const H = 180;
const MAP_SIZE = 512;
const MAP_MASK = MAP_SIZE - 1;

// 1. Initialize persistent state, offscreen canvas, and heightmap
if (!room.state.ready) {
  room.state.offscreen = new OffscreenCanvas(W, H);
  room.state.offCtx = room.state.offscreen.getContext('2d', { willReadFrequently: true });
  room.state.imgData = room.state.offCtx.createImageData(W, H);
  room.state.pixels = new Uint32Array(room.state.imgData.data.buffer);
  room.state.yBuffer = new Int16Array(W);
  room.state.heightMap = new Uint8Array(MAP_SIZE * MAP_SIZE);
  room.state.normalMap = new Uint8Array(MAP_SIZE * MAP_SIZE);
  room.state.camDist = 0;
  room.state.lastTheme = '';
  room.state.lut = new Uint32Array(256 * 4);

  // Demoscene procedural terrain: fractal canyon valleys with winding chasm
  const hmap = room.state.heightMap;
  for (let y = 0; y < MAP_SIZE; y++) {
    const ny = (y / MAP_SIZE) * Math.PI * 2;
    for (let x = 0; x < MAP_SIZE; x++) {
      const nx = (x / MAP_SIZE) * Math.PI * 2;
      let h = Math.sin(nx * 2 + Math.cos(ny * 1.5)) * 34;
      h += Math.sin(ny * 3 + Math.sin(nx * 3)) * 22;
      h += Math.sin(nx * 7 - ny * 5) * 11;
      h += Math.sin(nx * 15 + ny * 13) * 5;
      // Carve deep sinuous river gorge
      const gorge = Math.abs(Math.sin(nx * 1.5 + Math.sin(ny * 2) * 0.9));
      h += Math.pow(gorge, 0.7) * 75;
      hmap[(y << 9) | x] = Math.max(6, Math.min(245, (h + 85) | 0));
    }
  }

  // Slope lighting LUT (simple directional shade)
  const nmap = room.state.normalMap;
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const hL = hmap[(y << 9) | ((x - 1) & MAP_MASK)];
      const hR = hmap[(y << 9) | ((x + 1) & MAP_MASK)];
      const hU = hmap[(((y - 1) & MAP_MASK) << 9) | x];
      const hD = hmap[(((y + 1) & MAP_MASK) << 9) | x];
      const shade = 128 + (hL - hR) * 2 - (hU - hD) * 1.5;
      nmap[(y << 9) | x] = Math.max(40, Math.min(220, shade | 0));
    }
  }
  room.state.ready = true;
}

// Controls
const theme = getVar('canyon_theme') ?? 'Dusk Ochre';
const altMode = getVar('altitude_mode') ?? 'Valley Skimmer';
const speed = getVar('fly_speed') ?? 1.2;
const fogParam = getVar('fog_density') ?? 1.5;
const fovDeg = getVar('fov_angle') ?? 80;
const react = getVar('audio_reactivity') ?? 1.0;

// Update theme palette LUT if changed
if (room.state.lastTheme !== theme) {
  room.state.lastTheme = theme;
  const lut = room.state.lut;
  for (let shadeTier = 0; shadeTier < 4; shadeTier++) {
    const shadeMul = 0.55 + shadeTier * 0.28;
    for (let h = 0; h < 256; h++) {
      let r = 0, g = 0, b = 0;
      const normH = h / 255;
      if (theme === 'Violet Twilight') {
        r = 30 + normH * 160;
        g = 15 + normH * 50;
        b = 55 + normH * 190;
      } else if (theme === 'Cyber Neon') {
        r = Math.sin(normH * 6) > 0 ? 220 : 25;
        g = normH * 180;
        b = 180 + Math.cos(normH * 8) * 70;
      } else if (theme === 'Glacial Basin') {
        r = 50 + normH * 150;
        g = 90 + normH * 150;
        b = 120 + normH * 135;
      } else {
        // Dusk Ochre
        r = 85 + normH * 170;
        g = 35 + normH * 110;
        b = 20 + normH * 55;
      }
      r = Math.min(255, (r * shadeMul) | 0);
      g = Math.min(255, (g * shadeMul) | 0);
      b = Math.min(255, (b * shadeMul) | 0);
      // ABGR 32-bit packed
      lut[(shadeTier << 8) | h] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
  }
}

// Camera motion
const dt = Math.min(frame.dt || 0.016, 0.05);
const bass = (audio.bass || 0) * react;
const beat = audio.beat ? 1.0 : 0.0;
room.state.camDist += (speed * 42 + bass * 18) * dt;

const curT = room.state.camDist;
const camX = 256 + Math.sin(curT * 0.018) * 160;
const camY = curT;
const camAng = Math.sin(curT * 0.012) * 0.65;

// Ground clearance based on flight mode
const groundH = room.state.heightMap[(((camY | 0) & MAP_MASK) << 9) | ((camX | 0) & MAP_MASK)];
let targetClearance = 32;
if (altMode === 'Ridge Contour') targetClearance = 68;
else if (altMode === 'High Overlook') targetClearance = 125;
targetClearance += bass * 18;

const camH = groundH + targetClearance;
const horizon = (H * 0.44 + Math.sin(curT * 0.02) * 6 + (altMode === 'High Overlook' ? 18 : 0)) | 0;

// Sky gradient fill into buffer
const pixels = room.state.pixels;
const yBuf = room.state.yBuffer;
yBuf.fill(H);

// Palette sky endpoints
let skyR1 = 20, skyG1 = 10, skyB1 = 38;
let skyR2 = 180, skyG2 = 70, skyB2 = 40;
if (theme === 'Violet Twilight') {
  skyR1 = 12; skyG1 = 8; skyB1 = 30;
  skyR2 = 130; skyG2 = 50; skyB2 = 140;
} else if (theme === 'Cyber Neon') {
  skyR1 = 5; skyG1 = 0; skyB1 = 25;
  skyR2 = 0; skyG2 = 180; skyB2 = 230;
} else if (theme === 'Glacial Basin') {
  skyR1 = 10; skyG1 = 25; skyB2 = 55;
  skyR2 = 120; skyG2 = 180; skyB2 = 210;
}
if (beat) { skyR2 = Math.min(255, skyR2 + 40); skyG2 = Math.min(255, skyG2 + 25); }

// Pre-render Sky
for (let y = 0; y < H; y++) {
  const rowRatio = y / H;
  const r = (skyR1 + (skyR2 - skyR1) * rowRatio) | 0;
  const g = (skyG1 + (skyG2 - skyG1) * rowRatio) | 0;
  const b = (skyB1 + (skyB2 - skyB1) * rowRatio) | 0;
  const skyPix = (255 << 24) | (b << 16) | (g << 8) | r;
  const rowOffset = y * W;
  for (let x = 0; x < W; x++) {
    pixels[rowOffset + x] = skyPix;
  }
}

// Dusk Sun at horizon
const sunX = ((W * 0.5 + Math.sin(curT * 0.015 - camAng) * (W * 0.6)) | 0);
if (sunX > -30 && sunX < W + 30) {
  const sunY = horizon - 12;
  for (let dy = -16; dy <= 16; dy++) {
    const py = sunY + dy;
    if (py < 0 || py >= H) continue;
    const rowOff = py * W;
    for (let dx = -24; dx <= 24; dx++) {
      const px = sunX + dx;
      if (px < 0 || px >= W) continue;
      const d2 = (dx * dx) / (24 * 24) + (dy * dy) / (16 * 16);
      if (d2 < 1.0) {
        const glow = (1.0 - d2) * 0.85;
        const base = pixels[rowOff + px];
        const br = Math.min(255, (base & 0xFF) + (glow * 255) | 0);
        const bg = Math.min(255, ((base >> 8) & 0xFF) + (glow * 200) | 0);
        const bb = Math.min(255, ((base >> 16) & 0xFF) + (glow * 90) | 0);
        pixels[rowOff + px] = (255 << 24) | (bb << 16) | (bg << 8) | br;
      }
    }
  }
}

// 2. Front-to-back Comanche Voxel raycast
const halfFov = (fovDeg * 0.5 * Math.PI) / 180;
const cosA = Math.cos(camAng);
const sinA = Math.sin(camAng);
const pLx = cosA - sinA * Math.tan(halfFov);
const pLy = sinA + cosA * Math.tan(halfFov);
const pRx = cosA + sinA * Math.tan(halfFov);
const pRy = sinA - cosA * Math.tan(halfFov);

const heightMap = room.state.heightMap;
const normalMap = room.state.normalMap;
const lut = room.state.lut;

const maxDist = 280;
let z = 1.8;
let dz = 0.65;
const invW = 1.0 / W;
const vScale = 145.0;
const fogCoeff = 0.0035 * fogParam;

while (z < maxDist) {
  const rxL = camX + pLx * z;
  const ryL = camY + pLy * z;
  const rxR = camX + pRx * z;
  const ryR = camY + pRy * z;

  const stepX = (rxR - rxL) * invW;
  const stepY = (ryR - ryL) * invW;

  let curX = rxL;
  let curY = ryL;
  const invZ = vScale / z;
  const fog = Math.min(1.0, z * fogCoeff);
  const invFog = 1.0 - fog;

  for (let sx = 0; sx < W; sx++) {
    const mapIdx = (((curY | 0) & MAP_MASK) << 9) | ((curX | 0) & MAP_MASK);
    const hVal = heightMap[mapIdx];
    const projY = (((camH - hVal) * invZ) + horizon) | 0;

    if (projY < yBuf[sx]) {
      const top = Math.max(0, projY);
      const bot = yBuf[sx];
      const shadeTier = (normalMap[mapIdx] >> 6) & 3;
      const rawColor = lut[(shadeTier << 8) | hVal];

      // Atmospheric fog blend towards horizon sky tone
      let cR = rawColor & 0xFF;
      let cG = (rawColor >> 8) & 0xFF;
      let cB = (rawColor >> 16) & 0xFF;
      cR = (cR * invFog + skyR2 * fog) | 0;
      cG = (cG * invFog + skyG2 * fog) | 0;
      cB = (cB * invFog + skyB2 * fog) | 0;
      const foggedColor = (255 << 24) | (cB << 16) | (cG << 8) | cR;

      let row = top * W + sx;
      for (let yLine = top; yLine < bot; yLine++) {
        pixels[row] = foggedColor;
        row += W;
      }
      yBuf[sx] = top;
    }

    curX += stepX;
    curY += stepY;
  }

  z += dz;
  dz += 0.019; // progressive ray stepping for demoscene performance
}

// 3. Render audience members as towering glowing desert monoliths
const people = room.people || [];
for (let i = 0; i < people.length; i++) {
  const p = people[i];
  const pSeed = (p.hue || 0) * 13.37 + i * 53.1;
  const worldDist = 40 + (pSeed % 180);
  const mAngle = (pSeed * 0.05) % (Math.PI * 2);
  const monX = camX + Math.cos(mAngle) * worldDist;
  const monY = camY + Math.sin(mAngle) * worldDist + 40;

  // Project monolith onto screen
  const relX = monX - camX;
  const relY = monY - camY;
  const monZ = relX * cosA + relY * sinA;
  if (monZ > 5 && monZ < maxDist) {
    const monOrtho = -relX * sinA + relY * cosA;
    const scrX = ((W * 0.5) + (monOrtho / monZ) * (W * 0.5 * (1.0 / Math.tan(halfFov)))) | 0;
    if (scrX >= 2 && scrX < W - 2) {
      const mH = heightMap[(((monY | 0) & MAP_MASK) << 9) | ((monX | 0) & MAP_MASK)];
      const baseSy = (((camH - mH) * (vScale / monZ)) + horizon) | 0;
      const topSy = Math.max(0, baseSy - ((70 * vScale) / monZ) | 0);
      if (baseSy > 0 && topSy < yBuf[scrX] + 12) {
        const pHue = p.hue ?? 45;
        // Simple HSL to RGB for beacon
        const radH = (pHue * Math.PI) / 180;
        const bR = (Math.sin(radH) * 127 + 128) | 0;
        const bG = (Math.sin(radH + 2.09) * 127 + 128) | 0;
        const bB = (Math.sin(radH + 4.18) * 127 + 128) | 0;
        const monColor = (255 << 24) | (bB << 16) | (bG << 8) | bR;
        for (let my = topSy; my < Math.min(H, baseSy); my++) {
          pixels[my * W + scrX] = monColor;
          pixels[my * W + scrX - 1] = monColor;
        }
      }
    }
  }
}

// Blit the 320x180 buffer stretched to full canvas with nearest-neighbor demoscene crispness
room.state.offCtx.putImageData(room.state.imgData, 0, 0);
ctx.imageSmoothingEnabled = false;
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

// Vignette & subtle scanline overlay
ctx.fillStyle = 'rgba(0, 4, 12, 0.15)';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.restore();