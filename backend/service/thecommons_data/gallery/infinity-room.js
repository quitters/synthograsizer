ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;

// --- State & Lookups Preallocation (Demoscene Economy) ---
room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  // Fixed pool for projected lights (sortable without realloc)
  room.state.maxLights = 900;
  room.state.pool = new Float32Array(room.state.maxLights * 6); // sx, sy, radius, hue, alpha, z
  room.state.indices = new Uint16Array(room.state.maxLights);
  for (let i = 0; i < room.state.maxLights; i++) room.state.indices[i] = i;
  
  // Base light seed points (local chamber cell)
  room.state.seedCount = 32;
  room.state.seeds = [];
  for (let i = 0; i < room.state.seedCount; i++) {
    room.state.seeds.push({
      x: (Math.random() - 0.5) * 1.8,
      y: (Math.random() - 0.5) * 1.8,
      z: (Math.random() - 0.5) * 1.8,
      phase: Math.random() * Math.PI * 2,
      baseHue: Math.random() * 360
    });
  }
  room.state.beatPulse = 0;
  room.state.timeAcc = 0;
}

// --- Inputs & Controls ---
const depthSteps = getVar('mirror_depth') ?? 12;
const bloomMult = getVar('glow_intensity') ?? 1.2;
const strobe = getVar('strobe_reaction') ?? true;
const geom = getVar('grid_geometry') ?? 'cubic_lattice';
const palChoice = getVar('palette') ?? 'cosmic_violet';
const driftChoice = getVar('camera_drift') ?? 'float';

// Palette definitions [hueOffset, hueSpan, sat%, light%]
const palettes = {
  cosmic_violet: [270, 70, 95, 60],
  solar_fire: [15, 55, 100, 58],
  emerald_abyss: [155, 65, 95, 55],
  spectral_waves: [200, 240, 90, 62]
};
const pal = palettes[palChoice] || palettes.cosmic_violet;

// Audio smoothing & beat decay
if (audio.beat && strobe) {
  room.state.beatPulse = 1.0;
} else {
  room.state.beatPulse *= 0.88;
}
const beatKick = room.state.beatPulse * (strobe ? 1 : 0);
const bassLevel = audio.bass || 0;

// Camera motion update
const speed = driftChoice === 'hyperspace' ? 0.9 : (driftChoice === 'orbit' ? 0.45 : 0.3);
room.state.timeAcc += frame.dt * speed;
const t = room.state.timeAcc;

let camX = 0, camY = 0, camZ = 0;
let rotY = 0, rotX = 0;

if (driftChoice === 'orbit') {
  const r = 0.35 + bassLevel * 0.15;
  camX = Math.sin(t * 0.8) * r;
  camY = Math.cos(t * 0.6) * 0.25;
  camZ = Math.sin(t * 0.5) * 0.3;
  rotY = Math.sin(t * 0.7) * 0.45;
  rotX = Math.cos(t * 0.5) * 0.2;
} else if (driftChoice === 'hyperspace') {
  camX = Math.sin(t * 1.5) * 0.15;
  camY = Math.cos(t * 1.3) * 0.15;
  camZ = (t * 2.2) % 2.0 - 1.0;
  rotY = Math.sin(t * 0.8) * 0.2;
  rotX = Math.cos(t * 0.9) * 0.15;
} else {
  // Gentle float
  camX = Math.sin(t * 0.4) * 0.28;
  camY = Math.sin(t * 0.33) * 0.22;
  camZ = Math.cos(t * 0.28) * 0.35;
  rotY = Math.sin(t * 0.25) * 0.3;
  rotX = Math.cos(t * 0.2) * 0.18;
}

// People presence: blend in their hues dynamically
const people = room.people || [];
const hasPeople = people.length > 0;

// Clear screen to deep mirror black
ctx.fillStyle = '#020205';
ctx.fillRect(0, 0, W, H);

// Precompute camera trig
const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
const fov = Math.min(W, H) * (0.85 + bassLevel * 0.15);

const pool = room.state.pool;
let lightCount = 0;
const maxL = room.state.maxLights;

// Mirror space repeats (unit cell spans -1..1)
const halfRep = Math.min(4, Math.floor(depthSteps / 3));
const cellSize = 2.0;

// Collect & transform mirrored virtual lights
const seeds = room.state.seeds;
const sLen = seeds.length;

for (let rx = -halfRep; rx <= halfRep; rx++) {
  for (let ry = -halfRep; ry <= halfRep; ry++) {
    for (let rz = -halfRep; rz <= halfRep; rz++) {
      if (lightCount >= maxL - sLen) break;
      
      const mirrorDistSq = rx * rx + ry * ry + rz * rz;
      if (mirrorDistSq > (depthSteps * 0.4) * (depthSteps * 0.4)) continue;
      
      // Reflection parity: odd mirrors flip coordinates
      const flipX = (Math.abs(rx) % 2 === 1) ? -1 : 1;
      const flipY = (Math.abs(ry) % 2 === 1) ? -1 : 1;
      const flipZ = (Math.abs(rz) % 2 === 1) ? -1 : 1;
      
      const offsetX = rx * cellSize;
      const offsetY = ry * cellSize;
      const offsetZ = rz * cellSize;
      
      // Wave phase travels outward from chamber origin
      const waveDist = Math.sqrt(rx * rx + ry * ry + rz * rz) * 1.6;
      const wave = Math.sin(t * 2.4 - waveDist) * 0.5 + 0.5;
      
      for (let s = 0; s < sLen; s += (mirrorDistSq > 9 ? 3 : 1)) {
        if (lightCount >= maxL) break;
        const seed = seeds[s];
        
        // Modulated position inside mirror cell
        let px = (seed.x * flipX) + offsetX - camX;
        let py = (seed.y * flipY) + offsetY - camY;
        let pz = (seed.z * flipZ) + offsetZ - camZ;
        
        if (geom === 'hexagonal') {
          px += (Math.abs(ry) % 2) * 0.5;
        } else if (geom === 'spiral_hall') {
          const angleShift = rz * 0.2;
          const ox = px * Math.cos(angleShift) - py * Math.sin(angleShift);
          py = px * Math.sin(angleShift) + py * Math.cos(angleShift);
          px = ox;
        }
        
        // Camera rotation (Y then X)
        const x1 = px * cosY + pz * sinY;
        const z1 = -px * sinY + pz * cosY;
        const y2 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;
        
        // Clip near/behind plane
        if (z2 < 0.28) continue;
        
        // Perspective projection
        const invZ = 1.0 / z2;
        const sx = cx + x1 * fov * invZ;
        const sy = cy + y2 * fov * invZ;
        
        // Check viewport bounds with bleed
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
        
        // Color computation & traveling wave shift
        let hue = (pal[0] + (seed.baseHue * 0.25) + wave * pal[1] + t * 12) % 360;
        if (hasPeople) {
          const person = people[s % people.length];
          hue = (hue * 0.7 + person.hue * 0.3) % 360;
        }
        
        // Reflection attenuation (mirrors absorb light over depth)
        const reflectFade = Math.exp(-Math.sqrt(mirrorDistSq) * 0.42);
        const baseSize = Math.max(1.0, (14.0 * invZ) * (1.0 + beatKick * 0.45));
        const alpha = Math.min(1.0, (reflectFade * (0.8 + wave * 0.5) + beatKick * 0.2));
        
        const idx = lightCount * 6;
        pool[idx + 0] = sx;
        pool[idx + 1] = sy;
        pool[idx + 2] = baseSize;
        pool[idx + 3] = hue;
        pool[idx + 4] = alpha;
        pool[idx + 5] = z2;
        lightCount++;
      }
    }
  }
}

// Fast sort by depth (back to front)
const indices = room.state.indices;
const sorted = indices.subarray(0, lightCount);
sorted.sort((a, b) => pool[b * 6 + 5] - pool[a * 6 + 5]);

// --- Rendering Passes ---
ctx.globalCompositeOperation = 'lighter';

// Pass 1: Broad soft glow halations (sampled subset for high FPS)
const glowSkip = lightCount > 350 ? 2 : 1;
for (let i = 0; i < lightCount; i += glowSkip) {
  const p = sorted[i] * 6;
  const a = pool[p + 4];
  if (a < 0.08) continue;
  
  const sx = pool[p + 0];
  const sy = pool[p + 1];
  const r = pool[p + 2] * (3.8 * bloomMult);
  const hue = pool[p + 3];
  
  const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  glowGrad.addColorStop(0, `hsla(${hue | 0}, ${pal[2]}%, ${pal[3]}%, ${a * 0.28})`);
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, 6.2832);
  ctx.fill();
}

// Pass 2: Sharp suspended bulbs + bright cores
for (let i = 0; i < lightCount; i++) {
  const p = sorted[i] * 6;
  const sx = pool[p + 0];
  const sy = pool[p + 1];
  const r = pool[p + 2];
  const hue = pool[p + 3];
  const a = pool[p + 4];
  
  // Inner intense saturated point
  ctx.fillStyle = `hsla(${hue | 0}, 100%, 75%, ${Math.min(1.0, a * 1.2)})`;
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(1.2, r * 0.65), 0, 6.2832);
  ctx.fill();
  
  // Pure hot center on closer lights
  if (r > 3.0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1.0, a * 0.9 + beatKick * 0.4)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.28, 0, 6.2832);
    ctx.fill();
  }
}

// Faint infinity chamber mirror seams (architectural depth cue)
ctx.globalCompositeOperation = 'source-over';
ctx.strokeStyle = `rgba(180, 200, 255, ${0.035 + beatKick * 0.04})`;
ctx.lineWidth = 1.0;
ctx.beginPath();
ctx.moveTo(0, 0); ctx.lineTo(cx * 0.6, cy * 0.6);
ctx.moveTo(W, 0); ctx.lineTo(W - cx * 0.6, cy * 0.6);
ctx.moveTo(0, H); ctx.lineTo(cx * 0.6, H - cy * 0.6);
ctx.moveTo(W, H); ctx.lineTo(W - cx * 0.6, H - cy * 0.6);
// Inner reflection portal frame
ctx.strokeRect(cx * 0.6, cy * 0.6, W - cx * 1.2, H - cy * 1.2);
ctx.stroke();

// Vignette at edges to preserve projection contrast on distant wall
const vig = ctx.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.6, cx, cy, Math.max(cx, cy) * 1.15);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(1,1,3,0.85)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();