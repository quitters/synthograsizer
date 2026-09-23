const paletteKey = getVar('palette') ?? 'amber_crt';
const scrollSpeed = getVar('scroll_speed') ?? 1.5;
const dotStyle = getVar('dot_style') ?? 'circles';
const sphereTilt = getVar('sphere_tilt') ?? 20;
const gridMode = getVar('grid_mode') ?? 'full_globe';

const palettes = {
  amber_crt:     { hue: 38,  sat: 100, frontLit: 65, backLit: 22, glow: 'rgba(255,170,30,0.35)' },
  phosphor_cyan: { hue: 185, sat: 95,  frontLit: 68, backLit: 20, glow: 'rgba(40,230,255,0.35)' },
  cyber_magenta: { hue: 310, sat: 95,  frontLit: 65, backLit: 18, glow: 'rgba(255,40,210,0.35)' },
  laser_green:   { hue: 125, sat: 90,  frontLit: 60, backLit: 18, glow: 'rgba(50,255,90,0.35)' }
};
const pal = palettes[paletteKey] ?? palettes.amber_crt;

// One-time setup of lookup tables & message raster dots
if (!room.state.ready) {
  room.state.scroll = 0;
  room.state.lastPeopleCount = -1;
  room.state.ready = true;
}

// Re-rasterize dot-matrix message if connected room count changes or not built yet
const pCount = Array.isArray(room.people) ? room.people.length : 0;
if (!room.state.textCoords || room.state.lastPeopleCount !== pCount) {
  room.state.lastPeopleCount = pCount;
  const bannerText = `*** GREETINGS TO TABLE & ROOM [${pCount} SIGNALS ONLINE] *** SCROLLING IN REALTIME *** DEMO OR DIE *** `;
  const bw = 480, bh = 13;
  const off = new OffscreenCanvas(bw, bh);
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.fillStyle = '#000';
  octx.fillRect(0, 0, bw, bh);
  octx.fillStyle = '#fff';
  octx.font = '900 11px monospace';
  octx.textBaseline = 'middle';
  octx.fillText(bannerText, 4, bh * 0.5);

  const img = octx.getImageData(0, 0, bw, bh).data;
  const coords = [];
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const idx = (y * bw + x) * 4;
      if (img[idx] > 110) {
        // u: 0..1 around equator, v: latitude offset in radians
        const u = x / bw;
        const v = ((y - bh * 0.5) / (bh * 0.5)) * 0.28;
        coords.push(u, v);
      }
    }
  }
  room.state.textCoords = new Float32Array(coords);
  room.state.textCount = (coords.length / 2) | 0;
}

// Generate static sphere cage points once into room.state
if (!room.state.cageCoords) {
  const cage = [];
  const latBands = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75];
  const lonSteps = 36;
  // Parallels
  for (let b = 0; b < latBands.length; b++) {
    const lat = latBands[b];
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let i = 0; i < lonSteps; i++) {
      const lon = (i / lonSteps) * Math.PI * 2;
      cage.push(cosLat * Math.sin(lon), sinLat, cosLat * Math.cos(lon), b === 3 ? 1.0 : 0.4);
    }
  }
  // Meridians
  const meridians = 8;
  const latSteps = 28;
  for (let m = 0; m < meridians; m++) {
    const lon = (m / meridians) * Math.PI * 2;
    for (let j = 0; j <= latSteps; j++) {
      const lat = -Math.PI * 0.46 + (j / latSteps) * Math.PI * 0.92;
      cage.push(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon), 0.3);
    }
  }
  room.state.cageCoords = new Float32Array(cage);
  room.state.cageCount = (cage.length / 4) | 0;
}

ctx.save();

// Deep CRT fade background
ctx.fillStyle = 'rgba(5, 7, 10, 0.85)';
ctx.fillRect(0, 0, frame.width, frame.height);

// Dimensions & dynamics
const minDim = Math.min(frame.width, frame.height);
const baseR = minDim * 0.36;
const pulse = 1.0 + (audio.bass || 0) * 0.12;
const R = baseR * pulse;
const cx = frame.width * 0.5;
const cy = frame.height * 0.5;

// Scroll advancement
room.state.scroll = (room.state.scroll + frame.dt * scrollSpeed * 0.08) % 1.0;

// Sphere orientation angles
const radTilt = (sphereTilt * Math.PI) / 180;
const rotY = frame.t * 0.35 + (audio.mid || 0) * 0.2;
const cosY = Math.cos(rotY);
const sinY = Math.sin(rotY);
const cosX = Math.cos(radTilt);
const sinX = Math.sin(radTilt);
const fov = minDim * 1.4;

// Helper drawing routine for single dots without closure allocations
function drawDot(sx, sy, sz, radius, alpha, isFront, hueVal) {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `hsl(${hueVal}, ${pal.sat}%, ${isFront ? pal.frontLit : pal.backLit}%)`;
  if (dotStyle === 'squares') {
    const s = radius * 1.6;
    ctx.fillRect(sx - s * 0.5, sy - s * 0.5, s, s);
  } else if (dotStyle === 'crosses') {
    const s = radius * 1.5;
    ctx.fillRect(sx - s, sy - 0.7, s * 2, 1.4);
    ctx.fillRect(sx - 0.7, sy - s, 1.4, s * 2);
  } else {
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, 6.2832);
    ctx.fill();
  }
}

// Project a 3D unit point with sphere rotation & perspective
function project(ux, uy, uz, radMult) {
  const r = R * radMult;
  const px0 = ux * r;
  const py0 = uy * r;
  const pz0 = uz * r;
  // Rotate Y
  const x1 = px0 * cosY + pz0 * sinY;
  const z1 = -px0 * sinY + pz0 * cosY;
  const y1 = py0;
  // Tilt X
  const y2 = y1 * cosX - z1 * sinX;
  const z2 = y1 * sinX + z1 * cosX;
  const x2 = x1;
  // Perspective factor
  const pers = fov / (fov + z2 + R * 0.6);
  return [cx + x2 * pers, cy + y2 * pers, z2, pers];
}

// 1. Draw Globe Cage (far side first, then near side)
if (gridMode !== 'equator_band') {
  const cage = room.state.cageCoords;
  const cCount = room.state.cageCount;
  const showFull = gridMode === 'full_globe';
  
  // Back-side cage points
  for (let i = 0; i < cCount; i++) {
    const idx = i * 4;
    const importance = cage[idx + 3];
    if (!showFull && importance < 0.8) continue;
    const [sx, sy, sz, pers] = project(cage[idx], cage[idx + 1], cage[idx + 2], 0.98);
    if (sz < 0) {
      const depthAlpha = Math.max(0.08, 0.25 * (1 + sz / R)) * importance;
      drawDot(sx, sy, sz, 1.2 * pers, depthAlpha, false, pal.hue);
    }
  }
}

// 2. Back-side text dots (z < 0: dimmed, darker, smaller)
const text = room.state.textCoords;
const tCount = room.state.textCount;
const scroll = room.state.scroll;
const trebleBoost = (audio.treble || 0) * 1.5;

for (let i = 0; i < tCount; i++) {
  const idx = i * 2;
  const u = text[idx];
  const v = text[idx + 1];
  const lon = ((u + scroll) % 1.0) * Math.PI * 2;
  const cosV = Math.cos(v);
  const ux = cosV * Math.sin(lon);
  const uy = Math.sin(v);
  const uz = cosV * Math.cos(lon);

  const [sx, sy, sz, pers] = project(ux, uy, uz, 1.0);
  if (sz < 0) {
    const depthFade = Math.max(0.08, 0.32 * (1.0 + sz / R));
    drawDot(sx, sy, sz, 1.4 * pers, depthFade, false, pal.hue);
  }
}

// 3. Room People Beacons on Far Side
if (Array.isArray(room.people)) {
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const pLon = (p * 2.399963 + frame.t * 0.1) % (Math.PI * 2);
    const pLat = Math.sin(p * 1.7) * 0.65;
    const cosLat = Math.cos(pLat);
    const [sx, sy, sz, pers] = project(cosLat * Math.sin(pLon), Math.sin(pLat), cosLat * Math.cos(pLon), 1.06);
    if (sz < 0) {
      drawDot(sx, sy, sz, 2.5 * pers, 0.25, false, person.hue || pal.hue);
    }
  }
}

// 4. Front-side Globe Cage points (z >= 0)
if (gridMode !== 'equator_band') {
  const cage = room.state.cageCoords;
  const cCount = room.state.cageCount;
  const showFull = gridMode === 'full_globe';
  for (let i = 0; i < cCount; i++) {
    const idx = i * 4;
    const importance = cage[idx + 3];
    if (!showFull && importance < 0.8) continue;
    const [sx, sy, sz, pers] = project(cage[idx], cage[idx + 1], cage[idx + 2], 0.98);
    if (sz >= 0) {
      const depthAlpha = Math.min(1.0, 0.35 + 0.65 * (sz / R)) * importance;
      drawDot(sx, sy, sz, (1.6 + importance * 0.8) * pers, depthAlpha, true, pal.hue);
    }
  }
}

// 5. Front-side Text Dots (z >= 0: sharp, bright, audio-reactive shimmer)
for (let i = 0; i < tCount; i++) {
  const idx = i * 2;
  const u = text[idx];
  const v = text[idx + 1];
  const lon = ((u + scroll) % 1.0) * Math.PI * 2;
  const cosV = Math.cos(v);
  const ux = cosV * Math.sin(lon);
  const uy = Math.sin(v);
  const uz = cosV * Math.cos(lon);

  const [sx, sy, sz, pers] = project(ux, uy, uz, 1.0);
  if (sz >= 0) {
    const normZ = sz / R;
    const alpha = Math.min(1.0, 0.5 + 0.5 * normZ);
    const sparkle = ((i * 13) % 7 === 0) ? trebleBoost : 0;
    const dotRad = (2.2 + sparkle + (audio.beat ? 0.8 : 0)) * pers;
    drawDot(sx, sy, sz, dotRad, alpha, true, pal.hue + (sparkle * 20));
  }
}

// 6. Room People Beacons on Near Side (glowing active satellites)
if (Array.isArray(room.people)) {
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const pLon = (p * 2.399963 + frame.t * 0.1) % (Math.PI * 2);
    const pLat = Math.sin(p * 1.7) * 0.65;
    const cosLat = Math.cos(pLat);
    const [sx, sy, sz, pers] = project(cosLat * Math.sin(pLon), Math.sin(pLat), cosLat * Math.cos(pLon), 1.06);
    if (sz >= 0) {
      const pColor = person.hue || pal.hue;
      const pSize = (4.5 + Math.sin(frame.t * 4 + p) * 1.5) * pers;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = `hsl(${pColor}, 100%, 75%)`;
      ctx.beginPath();
      ctx.arc(sx, sy, pSize, 0, 6.2832);
      ctx.fill();
      // Thin tether towards center
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = `hsl(${pColor}, 90%, 60%)`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx + (sx - cx) * 0.88, cy + (sy - cy) * 0.88);
      ctx.stroke();
    }
  }
}

// CRT Equatorial Guide Aura
ctx.globalCompositeOperation = 'lighter';
ctx.globalAlpha = 0.08 + (audio.bass || 0) * 0.12;
const grad = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.25);
grad.addColorStop(0, pal.glow);
grad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = grad;
ctx.beginPath();
ctx.arc(cx, cy, R * 1.25, 0, 6.2832);
ctx.fill();

ctx.restore();