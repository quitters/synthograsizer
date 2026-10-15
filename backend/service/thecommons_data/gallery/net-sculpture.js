ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;

// 1. Controls & Palettes
const palChoice = getVar('palette') ?? 'aurora';
const wind = getVar('wind_energy') ?? 1.0;
const densityChoice = getVar('mesh_density') ?? 'woven';
const glow = getVar('glow_intensity') ?? 1.5;
const audioScale = getVar('audio_reactivity') ?? 1.0;
const showSkyline = getVar('skyline_depth') ?? true;

const palettes = {
  aurora: [
    { r: 24,  g: 220, b: 180 }, // teal
    { r: 80,  g: 130, b: 255 }, // royal blue
    { r: 180, g: 70,  b: 240 }, // violet
    { r: 50,  g: 255, b: 140 }  // vivid emerald
  ],
  bioluminescent: [
    { r: 0,   g: 240, b: 220 }, // electric cyan
    { r: 10,  g: 100, b: 240 }, // deep sea
    { r: 130, g: 255, b: 110 }, // chartreuse
    { r: 20,  g: 180, b: 200 }
  ],
  sunset_embers: [
    { r: 255, g: 75,  b: 110 }, // rose
    { r: 255, g: 170, b: 40  }, // amber gold
    { r: 160, g: 40,  b: 200 }, // magenta
    { r: 255, g: 220, b: 120 }  // spark white-yellow
  ],
  neon_tide: [
    { r: 255, g: 30,  b: 160 }, // hot pink
    { r: 40,  g: 140, b: 255 }, // electric blue
    { r: 140, g: 0,   b: 255 }, // ultraviolet
    { r: 0,   g: 255, b: 210 }  // cyan
  ]
};
const cols = palettes[palChoice] ?? palettes.aurora;

// 2. Preallocated simulation buffers in room.state
const COLS = densityChoice === 'airy' ? 24 : (densityChoice === 'dense' ? 36 : 30);
const ROWS = densityChoice === 'airy' ? 18 : (densityChoice === 'dense' ? 28 : 22);
const TOTAL = COLS * ROWS;

if (!room.state.px || room.state.px.length !== TOTAL) {
  room.state.px = new Float32Array(TOTAL);
  room.state.py = new Float32Array(TOTAL);
  room.state.pz = new Float32Array(TOTAL);
  room.state.sx = new Float32Array(TOTAL);
  room.state.sy = new Float32Array(TOTAL);
  room.state.lum = new Float32Array(TOTAL);
  room.state.bassImpulse = 0;
}

// Smooth bass impulse tracking
const bassEnergy = (audio.bass || 0) * audioScale;
const trebleEnergy = (audio.treble || 0) * audioScale;
room.state.bassImpulse = (room.state.bassImpulse || 0) * 0.9 + bassEnergy * 0.1;
const impulse = room.state.bassImpulse;

// Deep Night Sky & Ground gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
skyGrad.addColorStop(0, '#03050c');
skyGrad.addColorStop(0.65, '#070a16');
skyGrad.addColorStop(0.85, '#04060c');
skyGrad.addColorStop(1, '#010205');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// 3. Optional City Plaza Skyline & Uplight spots
const cx = W * 0.5;
const cy = H * 0.42;
const plazaY = H * 0.88;

if (showSkyline) {
  ctx.fillStyle = '#05070e';
  // Left towers
  ctx.fillRect(0, H * 0.45, W * 0.12, H);
  ctx.fillRect(W * 0.08, H * 0.55, W * 0.1, H);
  // Right towers
  ctx.fillRect(W * 0.85, H * 0.42, W * 0.15, H);
  ctx.fillRect(W * 0.78, H * 0.52, W * 0.1, H);
  // Distant rooftop beacons
  ctx.fillStyle = 'rgba(255, 60, 60, 0.7)';
  ctx.fillRect(W * 0.06, H * 0.45 - 3, 3, 3);
  ctx.fillRect(W * 0.91, H * 0.42 - 3, 3, 3);
}

// Uplight Spotlights from the plaza
ctx.save();
ctx.globalCompositeOperation = 'screen';
const spotGrad = ctx.createRadialGradient(cx, H * 0.92, 10, cx, H * 0.45, W * 0.45);
const c1 = cols[0];
const c2 = cols[2];
spotGrad.addColorStop(0, `rgba(${c1.r}, ${c1.g}, ${c1.b}, ${0.25 * glow})`);
spotGrad.addColorStop(0.4, `rgba(${c2.r}, ${c2.g}, ${c2.b}, ${0.12 * glow})`);
spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = spotGrad;
ctx.fillRect(0, 0, W, H);
ctx.restore();

// 4. Update billow physics and project mesh to 2D
const px = room.state.px;
const py = room.state.py;
const pz = room.state.pz;
const sx = room.state.sx;
const sy = room.state.sy;
const lum = room.state.lum;

const aspect = W / (H || 1);
const spreadX = W * 0.46;
const spreadY = H * 0.28;
const fov = 650;

const windTime = t * 0.8 * wind;
const swayX = Math.sin(windTime * 0.5) * 40 * wind;
const swayY = Math.cos(windTime * 0.3) * 20 * wind;

let idx = 0;
for (let r = 0; r < ROWS; r++) {
  const v = r / (ROWS - 1); // 0 (anchored perimeter) to 1 (anchored perimeter)
  const vNorm = (v - 0.5) * 2.0; // -1 .. +1

  for (let c = 0; c < COLS; c++) {
    const u = c / (COLS - 1); // 0 .. 1
    const uNorm = (u - 0.5) * 2.0; // -1 .. +1

    // Catenary dip: center drops, edges hang from buildings
    const edgeDist = 1.0 - Math.min(1.0, Math.hypot(uNorm, vNorm * 1.15));
    const sag = Math.sin((1.0 - Math.abs(uNorm)) * Math.PI * 0.5) *
                Math.sin((1.0 - Math.abs(vNorm)) * Math.PI * 0.5);

    // Multi-frequency billowing waves (like chiffon / silk in breeze)
    const wave1 = Math.sin(uNorm * 3.2 + windTime * 1.4) * Math.cos(vNorm * 2.8 - windTime * 1.1);
    const wave2 = Math.sin(uNorm * 6.5 - windTime * 2.1 + vNorm * 4.0) * 0.45;
    const wave3 = Math.cos(Math.hypot(uNorm, vNorm) * 8.0 - t * 3.5) * (0.3 + impulse * 1.2);
    const displacement = (wave1 + wave2 + wave3) * sag * (60 * wind + bassEnergy * 40);

    // 3D coordinates in plaza space
    const x3d = uNorm * spreadX + swayX * sag;
    const y3d = vNorm * spreadY * 0.75 + (sag * 160) + displacement + swayY;
    const z3d = (vNorm * 300) - (sag * 140) + Math.sin(uNorm * 4.0 + windTime) * 35;

    px[idx] = x3d;
    py[idx] = y3d;
    pz[idx] = z3d;

    // Perspective projection
    const zDist = fov + z3d;
    const scale = fov / Math.max(zDist, 100);
    sx[idx] = cx + x3d * scale;
    sy[idx] = cy + y3d * scale;

    // Lighting attenuation (lit strongly from below center)
    const distToLight = Math.hypot(uNorm * 0.7, vNorm * 0.9);
    const underLight = Math.max(0, 1.0 - distToLight * 0.85) * glow;
    const shimmer = Math.sin(u * 18.0 + v * 12.0 + t * 4.0) * trebleEnergy * 0.4;
    lum[idx] = Math.max(0.1, Math.min(1.0, (underLight * 0.75 + 0.25) + shimmer));

    idx++;
  }
}

// 5. Draw Anchor Suspension Cables
ctx.lineWidth = 1.2;
ctx.strokeStyle = 'rgba(120, 160, 210, 0.25)';
ctx.beginPath();
// Left top anchor
ctx.moveTo(0, H * 0.45);
ctx.lineTo(sx[0], sy[0]);
// Left bottom anchor
ctx.moveTo(W * 0.08, H * 0.65);
ctx.lineTo(sx[(ROWS - 1) * COLS], sy[(ROWS - 1) * COLS]);
// Right top anchor
ctx.moveTo(W, H * 0.42);
ctx.lineTo(sx[COLS - 1], sy[COLS - 1]);
// Right bottom anchor
ctx.moveTo(W * 0.88, H * 0.62);
ctx.lineTo(sx[TOTAL - 1], sy[TOTAL - 1]);
ctx.stroke();

// 6. Draw Translucent Filaments (Rows & Columns in batched paths)
ctx.save();
ctx.globalCompositeOperation = 'screen';

const numColorPasses = 3;
for (let p = 0; p < numColorPasses; p++) {
  const colA = cols[p % cols.length];
  const colB = cols[(p + 1) % cols.length];
  
  ctx.beginPath();
  ctx.lineWidth = p === 0 ? 0.75 : 0.55;

  // Strands running along U (warp)
  for (let r = p; r < ROWS; r += numColorPasses) {
    const rowOffset = r * COLS;
    ctx.moveTo(sx[rowOffset], sy[rowOffset]);
    for (let c = 1; c < COLS; c++) {
      const i = rowOffset + c;
      ctx.lineTo(sx[i], sy[i]);
    }
  }

  // Strands running along V (weft)
  for (let c = p; c < COLS; c += numColorPasses) {
    ctx.moveTo(sx[c], sy[c]);
    for (let r = 1; r < ROWS; r++) {
      const i = r * COLS + c;
      ctx.lineTo(sx[i], sy[i]);
    }
  }

  const strokeAlpha = Math.min(0.65, 0.28 * glow + impulse * 0.15);
  ctx.strokeStyle = `rgba(${colA.r}, ${colA.g}, ${colA.b}, ${strokeAlpha})`;
  ctx.stroke();
}

// 7. Diagonals for delicate lace-like sheer veil
if (densityChoice !== 'airy') {
  ctx.beginPath();
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = `rgba(${cols[3 % cols.length].r}, ${cols[3 % cols.length].g}, ${cols[3 % cols.length].b}, ${0.16 * glow})`;
  const step = densityChoice === 'dense' ? 1 : 2;
  for (let r = 0; r < ROWS - 1; r += step) {
    for (let c = 0; c < COLS - 1; c += step) {
      const i1 = r * COLS + c;
      const i2 = (r + 1) * COLS + (c + 1);
      ctx.moveTo(sx[i1], sy[i1]);
      ctx.lineTo(sx[i2], sy[i2]);
    }
  }
  ctx.stroke();
}

// 8. Luminous Mesh Nodes (Dewdrops / nodes catching the floodlights)
ctx.beginPath();
const nodeStep = densityChoice === 'dense' ? 3 : 2;
for (let r = 1; r < ROWS - 1; r += nodeStep) {
  for (let c = 1; c < COLS - 1; c += nodeStep) {
    const i = r * COLS + c;
    const l = lum[i];
    if (l > 0.45) {
      const rad = 1.0 + l * 1.6 + (audio.beat ? 0.8 : 0);
      ctx.moveTo(sx[i] + rad, sy[i]);
      ctx.arc(sx[i], sy[i], rad, 0, Math.PI * 2);
    }
  }
}
const highlight = cols[1];
ctx.fillStyle = `rgba(${highlight.r}, ${highlight.g}, ${highlight.b}, ${0.6 * glow})`;
ctx.fill();

ctx.restore(); // Restore from 'screen'

// 9. Plaza floor & Spectator presence (Room people mapped to warm ground specks)
ctx.save();
// Wet pavement reflection sheen
const reflGrad = ctx.createLinearGradient(0, plazaY, 0, H);
reflGrad.addColorStop(0, `rgba(${cols[0].r}, ${cols[0].g}, ${cols[0].b}, 0.08)`);
reflGrad.addColorStop(0.5, 'rgba(10, 15, 25, 0.4)');
reflGrad.addColorStop(1, 'rgba(3, 4, 8, 0.95)');
ctx.fillStyle = reflGrad;
ctx.fillRect(0, plazaY, W, H - plazaY);

// Spectators looking up at the monumental net
const people = room.people || [];
const spectatorCount = Math.max(people.length, 14);
ctx.globalCompositeOperation = 'screen';

for (let i = 0; i < spectatorCount; i++) {
  let specX, specY, hue;
  if (i < people.length) {
    const p = people[i];
    hue = p.hue ?? 200;
    // Distribute spectators across plaza width based on index
    const norm = (i + 0.5) / spectatorCount;
    specX = W * 0.18 + norm * W * 0.64 + Math.sin(i * 9.3) * 20;
    specY = plazaY + 12 + ((i * 17) % 24);
  } else {
    hue = 35 + (i * 25) % 50; // warm plaza ambient spectators
    const norm = i / spectatorCount;
    specX = W * 0.15 + norm * W * 0.7 + Math.cos(i * 4.1) * 15;
    specY = plazaY + 10 + ((i * 13) % 28);
  }

  // Tiny silhouette body & phone/face light facing up
  ctx.fillStyle = 'rgba(12, 16, 26, 0.85)';
  ctx.fillRect(specX - 1.5, specY - 6, 3, 7);
  ctx.fillStyle = `hsla(${hue}, 80%, 75%, 0.75)`;
  ctx.beginPath();
  ctx.arc(specX, specY - 7, 1.2, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

ctx.restore();