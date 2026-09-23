const GW = 160;
const GH = 90;
const N = GW * GH;

// 1. Initialise persistent simulation buffers once
if (!room.state.inited) {
  room.state.buf0 = new Float32Array(N);
  room.state.buf1 = new Float32Array(N);
  room.state.activeBuf = 0;
  room.state.offscreen = new OffscreenCanvas(GW, GH);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(GW, GH);
  room.state.submerged = new Uint32Array(N);
  room.state.submergedKey = '';
  room.state.lastDrop = 0;
  room.state.inited = true;
}

const buf0 = room.state.buf0;
const buf1 = room.state.buf1;
const cur = room.state.activeBuf === 0 ? buf0 : buf1;
const nxt = room.state.activeBuf === 0 ? buf1 : buf0;

// 2. Settings & lookups
const dampStyle = getVar('damping_style') ?? 'springwater';
const dampings = { mercury: 0.994, springwater: 0.985, viscous: 0.965 };
const damp = dampings[dampStyle] ?? dampings.springwater;

const tileStyle = getVar('tile_style') ?? 'moroccan';
const refrStrength = (getVar('refraction_strength') ?? 10) * 0.35;
const palName = getVar('palette_theme') ?? 'deep_ocean';
const rainRate = getVar('rain_density') ?? 3;

// 3. Pre-render submerged mosaic buffer if tile or palette changed
const subKey = tileStyle + '_' + palName;
if (room.state.submergedKey !== subKey) {
  room.state.submergedKey = subKey;
  const sub = room.state.submerged;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      let r = 20, g = 60, b = 120;
      const nx = x / GW;
      const ny = y / GH;
      const cx = (x - GW * 0.5);
      const cy = (y - GH * 0.5);
      const dist = Math.sqrt(cx * cx + cy * cy);

      if (tileStyle === 'checker') {
        const chk = ((Math.floor(x / 10) + Math.floor(y / 10)) % 2) === 0;
        r = chk ? 180 : 40;
        g = chk ? 200 : 70;
        b = chk ? 220 : 130;
      } else if (tileStyle === 'moroccan') {
        const mx = (x % 16) - 8;
        const my = (y % 16) - 8;
        const d = Math.abs(mx) + Math.abs(my);
        const ring = (d < 6 && d > 2) ? 1 : (d <= 2 ? 2 : 0);
        r = ring === 2 ? 230 : (ring === 1 ? 70 : 30);
        g = ring === 2 ? 180 : (ring === 1 ? 130 : 75);
        b = ring === 2 ? 90  : (ring === 1 ? 180 : 130);
      } else if (tileStyle === 'greek_key') {
        const gx = x % 20;
        const gy = y % 20;
        const border = (gx < 2 || gx > 17 || gy < 2 || gy > 17 || (gx > 6 && gx < 14 && gy > 6 && gy < 14));
        r = border ? 210 : 35;
        g = border ? 190 : 80;
        b = border ? 140 : 120;
      } else {
        // sunburst
        const angle = Math.atan2(cy, cx);
        const ray = Math.sin(angle * 12) > 0;
        const ring = Math.floor(dist / 8) % 2 === 0;
        r = ray ^ ring ? 220 : 40;
        g = ray ^ ring ? 160 : 80;
        b = ray ? 100 : 160;
      }

      // Palette tint modulation
      if (palName === 'cyan_pool') {
        r = Math.min(255, (r * 0.3) | 0);
        g = Math.min(255, (g * 1.2 + 20) | 0);
        b = Math.min(255, (b * 1.3 + 40) | 0);
      } else if (palName === 'golden_hour') {
        const tr = r, tg = g, tb = b;
        r = Math.min(255, (tr * 1.3 + 50) | 0);
        g = Math.min(255, (tg * 0.9 + 20) | 0);
        b = Math.min(255, (tb * 0.4) | 0);
      } else if (palName === 'midnight_synth') {
        const tr = r, tg = g, tb = b;
        r = Math.min(255, (tb * 1.1 + 30) | 0);
        g = Math.min(255, (tg * 0.4) | 0);
        b = Math.min(255, (tr * 1.2 + 60) | 0);
      }

      // ABGR 32-bit format
      sub[y * GW + x] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
  }
}

// 4. Inject ripples from events (everyone's triggers)
function disturb(gx, gy, radius, force) {
  const x0 = Math.max(1, (gx - radius) | 0);
  const x1 = Math.min(GW - 2, (gx + radius) | 0);
  const y0 = Math.max(1, (gy - radius) | 0);
  const y1 = Math.min(GH - 2, (gy + radius) | 0);
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    const dy2 = (y - gy) * (y - gy);
    for (let x = x0; x <= x1; x++) {
      const d2 = dy2 + (x - gx) * (x - gx);
      if (d2 <= r2) {
        cur[y * GW + x] += (1 - Math.sqrt(d2) / radius) * force;
      }
    }
  }
}

if (room.events) {
  for (const ev of room.events) {
    if (ev.name === 'drop_stone') {
      const p = room.people ? room.people.find(person => person.id === ev.participantId) : null;
      const seed = p ? (p.hue / 360) : Math.random();
      const sx = 15 + Math.floor(seed * (GW - 30));
      const sy = 15 + Math.floor(((seed * 7.31) % 1) * (GH - 30));
      disturb(sx, sy, 7, 18.0);
    }
  }
}

// Raindrops: frequency determined by rainRate
const rainInterval = Math.max(0.04, 0.45 / rainRate);
if (frame.t - room.state.lastDrop > rainInterval) {
  room.state.lastDrop = frame.t;
  const rx = 3 + Math.floor(Math.random() * (GW - 6));
  const ry = 3 + Math.floor(Math.random() * (GH - 6));
  disturb(rx, ry, 2 + Math.floor(Math.random() * 3), 4.5 + Math.random() * 5.0);
}

// Music reactivity: bass kick causes a submerged surge
if (audio && (audio.beat || audio.bass > 0.65)) {
  const surgeForce = (audio.bass || 0.8) * 8.0;
  disturb(GW >> 1, GH >> 1, 6, surgeForce);
  // Extra accent ripples based on people
  if (room.people && room.people.length > 0) {
    const p = room.people[(frame.t * 3 | 0) % room.people.length];
    const px = 10 + ((p.hue * 1.3) % (GW - 20)) | 0;
    const py = 10 + ((p.hue * 2.7) % (GH - 20)) | 0;
    disturb(px, py, 4, 6.0);
  }
}

// 5. Wave equation step: 2-buffer ping-pong
// nxt(x,y) = (cur(x-1,y) + cur(x+1,y) + cur(x,y-1) + cur(x,y+1)) / 2 - nxt(x,y)
// Dampened and reflected naturally by leaving borders intact
let rowAbove = 0;
let rowCenter = GW;
let rowBelow = GW * 2;

for (let y = 1; y < GH - 1; y++) {
  for (let x = 1; x < GW - 1; x++) {
    const sum = cur[rowAbove + x] + cur[rowBelow + x] + cur[rowCenter + x - 1] + cur[rowCenter + x + 1];
    const val = (sum * 0.5 - nxt[rowCenter + x]) * damp;
    nxt[rowCenter + x] = val;
  }
  rowAbove += GW;
  rowCenter += GW;
  rowBelow += GW;
}

// Swap buffers
room.state.activeBuf = 1 - room.state.activeBuf;

// 6. Refraction & Specular Render into ImageData (using 32-bit view)
const sub = room.state.submerged;
const pix = new Uint32Array(room.state.imgData.data.buffer);
const waveBuf = nxt; // now the freshly calculated state

// Light source direction vector: (-1, -1, 2) normalized
const lightFactor = 2.4;

rowAbove = 0;
rowCenter = GW;
rowBelow = GW * 2;

for (let y = 1; y < GH - 1; y++) {
  for (let x = 1; x < GW - 1; x++) {
    const idx = rowCenter + x;
    // Normal gradients
    const dx = waveBuf[rowCenter + x + 1] - waveBuf[rowCenter + x - 1];
    const dy = waveBuf[rowBelow + x] - waveBuf[rowAbove + x];

    // Refraction coordinates
    let rx = (x + dx * refrStrength) | 0;
    let ry = (y + dy * refrStrength) | 0;
    if (rx < 0) rx = 0;
    else if (rx >= GW) rx = GW - 1;
    if (ry < 0) ry = 0;
    else if (ry >= GH) ry = GH - 1;

    const srcPixel = sub[ry * GW + rx];
    let r = srcPixel & 0xFF;
    let g = (srcPixel >> 8) & 0xFF;
    let b = (srcPixel >> 16) & 0xFF;

    // Specular lighting from wave surface slopes
    const spec = -dx * 0.7 - dy * 0.7;
    if (spec > 0) {
      const highlight = (spec * 32 * lightFactor) | 0;
      r = Math.min(255, r + highlight);
      g = Math.min(255, g + highlight);
      b = Math.min(255, b + highlight + (highlight >> 1));
    } else {
      // Ambient shading on trough
      const shade = (spec * 12) | 0;
      r = Math.max(0, r + shade);
      g = Math.max(0, g + shade);
      b = Math.max(0, b + shade);
    }

    pix[idx] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  rowAbove += GW;
  rowCenter += GW;
  rowBelow += GW;
}

// Top/bottom/left/right border clamping for clean edges
for (let x = 0; x < GW; x++) {
  pix[x] = sub[x];
  pix[(GH - 1) * GW + x] = sub[(GH - 1) * GW + x];
}
for (let y = 0; y < GH; y++) {
  pix[y * GW] = sub[y * GW];
  pix[y * GW + GW - 1] = sub[y * GW + GW - 1];
}

// 7. Blit to canvas scaled smoothly with architectural frame
room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.save();
// Clean background pool surround
ctx.fillStyle = '#060a12';
ctx.fillRect(0, 0, frame.width, frame.height);

// Draw pool with bilinear upscaling
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

const margin = Math.min(frame.width, frame.height) * 0.04;
const poolW = frame.width - margin * 2;
const poolH = frame.height - margin * 2;
const poolX = margin;
const poolY = margin;

// Pool border stone rim
ctx.lineWidth = 6;
ctx.strokeStyle = '#2d3e50';
ctx.strokeRect(poolX - 3, poolY - 3, poolW + 6, poolH + 6);

ctx.drawImage(room.state.offscreen, poolX, poolY, poolW, poolH);

// Caustic ambient rim glow responsive to music mid/treble
if (audio) {
  const glowAlpha = 0.08 + (audio.mid || 0) * 0.12;
  ctx.strokeStyle = `rgba(180, 240, 255, ${glowAlpha})`;
  ctx.lineWidth = 14;
  ctx.strokeRect(poolX, poolY, poolW, poolH);
}

// Render tiny participant indicators sitting along the pool's stone ledge
if (room.people && room.people.length > 0) {
  const count = room.people.length;
  for (let i = 0; i < count; i++) {
    const p = room.people[i];
    const px = poolX + (poolW * ((i + 1) / (count + 1)));
    const py = poolY - 1;
    ctx.fillStyle = `hsl(${p.hue}, 85%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
ctx.restore();