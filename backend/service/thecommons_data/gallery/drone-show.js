ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.05);

const droneCount = Math.floor(getVar('drone_count') ?? 320);
const formation = getVar('formation_mode') ?? 'auto_morph';
const paletteChoice = getVar('palette_theme') ?? 'bioluminescent';
const waterMode = getVar('water_clarity') ?? 'trembling';

const palettes = {
  bioluminescent: [
    [0, 245, 212],   // bright cyan
    [67, 97, 238],    // cobalt
    [114, 9, 183],   // purple
    [247, 37, 133],  // electric pink
    [76, 201, 240]   // ice blue
  ],
  cyberpunk: [
    [255, 0, 110],   // neon magenta
    [255, 190, 11],  // neon yellow
    [131, 56, 236],  // deep violet
    [58, 134, 255],  // electric blue
    [251, 86, 7]     // neon orange
  ],
  aurora: [
    [46, 196, 182],  // teal
    [231, 29, 54],   // ruby
    [255, 159, 28],  // warm amber
    [86, 204, 242],  // sky turquoise
    [187, 242, 235]  // pale mint
  ],
  gold_starlight: [
    [255, 230, 109], // gold
    [254, 250, 224], // ivory
    [255, 183, 3],   // deep amber
    [251, 133, 0],   // warm sunset
    [224, 251, 252]  // diamond white
  ]
};
const pal = palettes[paletteChoice] ?? palettes.bioluminescent;

const waterFactors = {
  glassy: { smear: 1.5, ripple: 0.015, alpha: 0.38 },
  trembling: { smear: 4.0, ripple: 0.045, alpha: 0.28 },
  turbulent: { smear: 9.0, ripple: 0.09, alpha: 0.2 }
};
const wf = waterFactors[waterMode] ?? waterFactors.trembling;

// Init persistent state
room.state.drones ??= [];
room.state.targets ??= [];
room.state.currentShape ??= 0;
room.state.morphTimer ??= 0;
room.state.rotY ??= 0;
room.state.rotX ??= 0;

const drones = room.state.drones;
const targets = room.state.targets;

// Ensure drone pool capacity
while (drones.length < 500) {
  const i = drones.length;
  drones.push({
    x: (Math.random() - 0.5) * 600,
    y: (Math.random() - 0.5) * 400 - 100,
    z: (Math.random() - 0.5) * 600,
    vx: 0, vy: 0, vz: 0,
    phase: Math.random() * Math.PI * 2,
    colIdx: i % pal.length
  });
  targets.push({ x: 0, y: 0, z: 0 });
}

// Shape calculation helpers
function computeFormation(shapeIdx, outTargets, count, time, audBass) {
  for (let i = 0; i < count; i++) {
    const p = outTargets[i];
    const u = i / count;
    if (shapeIdx === 0) {
      // Globe (Fibonacci sphere)
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = 220 + audBass * 35;
      p.x = radius * Math.sin(phi) * Math.cos(theta);
      p.y = -radius * Math.cos(phi) - 60;
      p.z = radius * Math.sin(phi) * Math.sin(theta);
    } else if (shapeIdx === 1) {
      // Giant 3D Heart
      const a = (i / count) * Math.PI * 2;
      const layer = ((i % 7) - 3) / 3;
      const scale = (14.5 + audBass * 2.5) * (1 - Math.abs(layer) * 0.35);
      const hx = 16 * Math.pow(Math.sin(a), 3);
      const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      p.x = hx * scale;
      p.y = hy * scale - 70;
      p.z = layer * 90;
    } else if (shapeIdx === 2) {
      // Breaching Whale
      const s = (i / count);
      const curve = Math.sin(s * Math.PI * 1.1);
      const arch = Math.sin(s * Math.PI) * -160 - 20;
      const ribAngle = (i % 12) / 12 * Math.PI * 2;
      const thickness = Math.sin(s * Math.PI) * (50 + Math.sin(s * 8 + time * 3) * 6);
      p.x = (s - 0.5) * 440;
      p.y = arch + Math.cos(ribAngle) * thickness * 0.7;
      p.z = Math.sin(ribAngle) * thickness + Math.cos(s * 4 + time * 2) * 40;
      // Tail fluke flourish
      if (s > 0.85) {
        const fluke = (s - 0.85) / 0.15;
        p.z += Math.sin(i * 1.5) * fluke * 90;
      }
    } else {
      // Galactic Double Spiral
      const arm = i % 2;
      const rev = (i / count) * Math.PI * 7 + (arm * Math.PI);
      const r = Math.pow(i / count, 0.7) * 270;
      p.x = Math.cos(rev + time * 0.4) * r;
      p.y = -70 + Math.sin(rev * 2 + time) * 35;
      p.z = Math.sin(rev + time * 0.4) * r;
    }
  }
}

// Formation sequencer
const shapeNames = ['globe', 'heart', 'whale', 'spiral'];
let targetShape = 0;
if (formation === 'auto_morph') {
  room.state.morphTimer += dt * 0.28;
  if (audio.beat && Math.random() < 0.25) room.state.morphTimer += 0.8;
  targetShape = Math.floor(room.state.morphTimer) % 4;
} else {
  const fixedIndex = shapeNames.indexOf(formation);
  targetShape = fixedIndex >= 0 ? fixedIndex : 0;
}

// Slowly rotate formation
room.state.rotY += dt * (0.35 + audio.mid * 0.4);
room.state.rotX = Math.sin(t * 0.22) * 0.18;

computeFormation(targetShape, targets, droneCount, t, audio.bass);

// Physics step: spring towards target formations
const cosY = Math.cos(room.state.rotY);
const sinY = Math.sin(room.state.rotY);
const cosX = Math.cos(room.state.rotX);
const sinX = Math.sin(room.state.rotX);

for (let i = 0; i < droneCount; i++) {
  const d = drones[i];
  const tgt = targets[i];

  // Rotate target in 3D
  const rx1 = tgt.x * cosY - tgt.z * sinY;
  const rz1 = tgt.x * sinY + tgt.z * cosY;
  const ry1 = tgt.y * cosX - rz1 * sinX;
  const rz2 = tgt.y * sinX + rz1 * cosX;

  // Subtle hover disturbance
  const hoverX = Math.sin(t * 2.5 + d.phase) * 2.2;
  const hoverY = Math.cos(t * 2.1 + d.phase) * 2.2;
  const hoverZ = Math.sin(t * 1.9 + d.phase * 2) * 2.2;

  const tx = rx1 + hoverX;
  const ty = ry1 + hoverY;
  const tz = rz2 + hoverZ;

  // Damped spring to position avoids intersecting chaotic jitter
  const k = 4.2;
  const damping = 0.82;
  d.vx = (d.vx + (tx - d.x) * k * dt) * damping;
  d.vy = (d.vy + (ty - d.y) * k * dt) * damping;
  d.vz = (d.vz + (tz - d.z) * k * dt) * damping;

  d.x += d.vx;
  d.y += d.vy;
  d.z += d.vz;
}

// Deep Night Sky & Harbour Background
const waterY = H * 0.68;
const skyGrad = ctx.createLinearGradient(0, 0, 0, waterY);
skyGrad.addColorStop(0, '#020308');
skyGrad.addColorStop(0.5, '#040714');
skyGrad.addColorStop(1, '#091024');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, waterY);

// Deep Dark Water background
const waterGrad = ctx.createLinearGradient(0, waterY, 0, H);
waterGrad.addColorStop(0, '#050a16');
waterGrad.addColorStop(0.3, '#02050c');
waterGrad.addColorStop(1, '#010206');
ctx.fillStyle = waterGrad;
ctx.fillRect(0, waterY, W, H - waterY);

// Distant harbour shoreline silhouettes & city light beacons
ctx.fillStyle = '#060a12';
ctx.beginPath();
ctx.moveTo(0, waterY);
ctx.lineTo(0, waterY - 14);
const hills = 14;
for (let i = 0; i <= hills; i++) {
  const hx = (i / hills) * W;
  const hy = waterY - 10 - Math.sin(i * 1.7) * 8 - (i % 3 === 0 ? 12 : 0);
  ctx.lineTo(hx, hy);
}
ctx.lineTo(W, waterY);
ctx.closePath();
ctx.fill();

// Distant harbour buoy / pier navigation lights
const pierCount = 12;
for (let i = 0; i < pierCount; i++) {
  const px = (i + 0.6) * (W / pierCount) + Math.sin(i * 99) * 20;
  const py = waterY - 5;
  const pcol = (i % 2 === 0) ? 'rgba(255, 60, 60, 0.7)' : 'rgba(80, 255, 140, 0.7)';
  ctx.fillStyle = pcol;
  ctx.fillRect(px, py, 2, 2);
  // Water reflection of distant light
  ctx.fillStyle = pcol.replace('0.7', '0.22');
  ctx.fillRect(px - 1, waterY + 1, 4, 18);
}

// Water separation horizon line
ctx.strokeStyle = 'rgba(50, 90, 140, 0.25)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(0, waterY);
ctx.lineTo(W, waterY);
ctx.stroke();

// Projection setup
const cx = W * 0.5;
const cy = waterY - 60;
const fov = 520;

// Pre-sort drones back to front for proper depth blending
const indices = [];
for (let i = 0; i < droneCount; i++) indices.push(i);
indices.sort((a, b) => drones[b].z - drones[a].z);

// Water reflection pass (Rendered first with additive blur / horizontal jitter)
ctx.save();
ctx.globalCompositeOperation = 'screen';

for (let idx = 0; idx < droneCount; idx++) {
  const i = indices[idx];
  const d = drones[i];
  const depth = (d.z + 550);
  if (depth < 60) continue;
  const scale = fov / depth;
  const sx = cx + d.x * scale;
  const sy = cy + d.y * scale;

  // Skip if way outside screen
  if (sx < -40 || sx > W + 40 || sy > waterY) continue;

  const distAboveWater = waterY - sy;
  if (distAboveWater < 0) continue;

  const reflY = waterY + distAboveWater * 0.95;
  if (reflY > H + 40) continue;

  // Ripple displacement based on y and time
  const rippleWave = Math.sin(reflY * 0.08 + t * 4 + d.x * 0.02) * (distAboveWater * wf.ripple + audio.bass * 14);
  const reflX = sx + rippleWave;

  const col = pal[d.colIdx % pal.length];
  const fade = Math.max(0, 1 - (reflY - waterY) / (H - waterY * 0.8));
  const alpha = fade * wf.alpha * (0.7 + audio.level * 0.5);

  const wSize = Math.max(1, scale * 3.5 * (1 + (reflY - waterY) * 0.003));
  const wSmear = (wf.smear * 2.5 + Math.abs(rippleWave)) * scale;

  // Trembling horizontal wash for harbour water feel
  ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha})`;
  ctx.fillRect(reflX - wSmear * 0.5, reflY, wSmear, Math.max(1, wSize * 0.6));
}
ctx.restore();

// Sky Drone Pass
ctx.save();
ctx.globalCompositeOperation = 'lighter';

const beatPulse = audio.beat ? 1.4 : 1.0;
const roomBoost = 1 + (room.people ? Math.min(room.people.length * 0.04, 0.4) : 0);

for (let idx = 0; idx < droneCount; idx++) {
  const i = indices[idx];
  const d = drones[i];
  const depth = (d.z + 550);
  if (depth < 60) continue;
  const scale = fov / depth;
  const sx = cx + d.x * scale;
  const sy = cy + d.y * scale;

  if (sx < -20 || sx > W + 20 || sy < -20 || sy > waterY + 10) continue;

  // Depth cues: brightness and size
  const depthFade = Math.min(1.0, Math.max(0.25, scale * 1.1));
  const baseRadius = Math.max(1.1, scale * 2.8 * beatPulse * roomBoost);

  // Palette color with person hue tint if available
  let col = pal[d.colIdx % pal.length];
  if (room.people && room.people.length > 0 && i < room.people.length * 15) {
    const p = room.people[i % room.people.length];
    // Gentle hybrid glow with participant hue
    const hRad = (p.hue * Math.PI) / 180;
    col = [
      Math.floor(128 + 127 * Math.sin(hRad)),
      Math.floor(128 + 127 * Math.sin(hRad + 2.09)),
      Math.floor(128 + 127 * Math.sin(hRad + 4.18))
    ];
  }

  // Outer luminous glow
  const glowRad = baseRadius * 4.2;
  const glowAlpha = 0.22 * depthFade;
  ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${glowAlpha})`;
  ctx.beginPath();
  ctx.arc(sx, sy, glowRad, 0, Math.PI * 2);
  ctx.fill();

  // Intense brilliant core
  const coreAlpha = 0.95 * depthFade;
  ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${coreAlpha})`;
  ctx.beginPath();
  ctx.arc(sx, sy, baseRadius, 0, Math.PI * 2);
  ctx.fill();

  // Crisp pinpoint diode center (white-hot)
  ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * depthFade})`;
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(0.6, baseRadius * 0.38), 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();

// Fine water surface glimmer lines
ctx.save();
ctx.globalCompositeOperation = 'screen';
ctx.strokeStyle = 'rgba(100, 160, 230, 0.08)';
ctx.lineWidth = 1;
for (let y = waterY + 6; y < H; y += 18) {
  const drift = Math.sin(y * 0.05 + t * 1.4) * 35;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W * 0.3 + drift, y);
  ctx.moveTo(W * 0.45 + drift, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}
ctx.restore();

ctx.restore();