ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);
const bass = audio.bass || 0;
const mid = audio.mid || 0;
const treble = audio.treble || 0;

// Preallocate fixed pool in room.state
if (!room.state.pool) {
  room.state.pool = [];
  for (let i = 0; i < 200; i++) {
    room.state.pool.push({
      x: 0, y: 0, r: 0,
      active: false,
      growing: false,
      age: 0,
      maxAge: 12,
      fade: 0,
      hue: 0,
      sat: 80,
      light: 50,
      id: i
    });
  }
  room.state.lastBeatTime = 0;
  room.state.spawnCursor = 0;
}

const pool = room.state.pool;
const maxDensity = Math.min(getVar('density') ?? 140, 200);
const growthVar = getVar('growth_speed') ?? 2.0;
const growthRate = growthVar * 55 * (1 + bass * 0.8);
const renderStyle = getVar('render_style') || 'nested_rings';
const dissolveMode = getVar('dissolve_mode') || 'breathing_tide';
const paletteKey = getVar('palette') || 'stained_glass';

// Palette base hue arrays
const palettes = {
  stained_glass: [210, 340, 42, 160, 280],
  cyber_neon: [180, 310, 275, 150, 45],
  monochrome_gold: [38, 44, 32, 50, 25],
  solar_aurora: [168, 195, 12, 345, 270]
};
const colorList = palettes[paletteKey] || palettes.stained_glass;

// Dissolve trigger / modulation
let dissolveFactor = 0;
if (dissolveMode === 'beat_shock') {
  if (audio.beat && (frame.t - room.state.lastBeatTime > 0.35) && bass > 0.45) {
    room.state.lastBeatTime = frame.t;
  }
  dissolveFactor = Math.max(0, 1 - (frame.t - room.state.lastBeatTime) * 1.8);
} else if (dissolveMode === 'breathing_tide') {
  dissolveFactor = 0.5 + 0.5 * Math.sin(frame.t * 0.45);
}

// 1. Lifecycle & Dissolve update
let activeCount = 0;
for (let i = 0; i < pool.length; i++) {
  const c = pool[i];
  if (!c.active) continue;
  activeCount++;
  c.age += dt;

  let shouldDie = false;
  if (dissolveMode === 'age_cascade') {
    if (c.age > c.maxAge) shouldDie = true;
  } else if (dissolveMode === 'beat_shock') {
    if (dissolveFactor > 0.7 && c.age > 3.0 && (c.id % 3 === 0)) shouldDie = true;
  } else {
    // breathing tide
    if (dissolveFactor > 0.88 && c.age > 4.5 && (c.id % 2 === 0)) shouldDie = true;
  }

  if (shouldDie) {
    c.fade += dt * 2.2;
    if (c.fade >= 1) {
      c.active = false;
      c.growing = false;
      activeCount--;
      continue;
    }
  } else {
    c.fade = Math.max(0, c.fade - dt * 2.0);
  }
}

// 2. Spawn new candidates
const spawnTries = 8;
const pad = 12;
if (activeCount < maxDensity) {
  for (let s = 0; s < spawnTries; s++) {
    const sx = pad + Math.random() * (W - pad * 2);
    const sy = pad + Math.random() * (H - pad * 2);
    let collision = false;

    for (let j = 0; j < pool.length; j++) {
      const other = pool[j];
      if (!other.active) continue;
      const dx = sx - other.x;
      const dy = sy - other.y;
      if (dx * dx + dy * dy < (other.r + 3) * (other.r + 3)) {
        collision = true;
        break;
      }
    }

    if (!collision) {
      // Find free slot
      let slot = null;
      for (let k = 0; k < pool.length; k++) {
        const idx = (room.state.spawnCursor + k) % pool.length;
        if (!pool[idx].active) {
          slot = pool[idx];
          room.state.spawnCursor = (idx + 1) % pool.length;
          break;
        }
      }
      if (slot) {
        slot.x = sx;
        slot.y = sy;
        slot.r = 2;
        slot.active = true;
        slot.growing = true;
        slot.age = 0;
        slot.fade = 0;
        slot.maxAge = 8 + Math.random() * 8;

        // Palette selection enriched by room participants
        if (room.people && room.people.length > 0 && Math.random() < 0.45) {
          const person = room.people[slot.id % room.people.length];
          slot.hue = person.hue;
        } else {
          const baseHue = colorList[slot.id % colorList.length];
          slot.hue = (baseHue + Math.floor(Math.random() * 20 - 10) + 360) % 360;
        }
        slot.sat = paletteKey === 'monochrome_gold' ? 45 : 85;
        slot.light = paletteKey === 'monochrome_gold' ? 55 + Math.random() * 25 : 50 + Math.random() * 15;
      }
      break;
    }
  }
}

// 3. Growth step with neighbor and boundary checks
const maxRadius = Math.min(W, H) * 0.38;
for (let i = 0; i < pool.length; i++) {
  const c = pool[i];
  if (!c.active || !c.growing) continue;

  const dr = growthRate * dt;
  const nextR = c.r + dr;

  // Screen bounds
  if (c.x - nextR <= pad || c.x + nextR >= W - pad || c.y - nextR <= pad || c.y + nextR >= H - pad || nextR >= maxRadius) {
    c.growing = false;
    continue;
  }

  // Inter-circle boundary checks
  for (let j = 0; j < pool.length; j++) {
    if (i === j) continue;
    const other = pool[j];
    if (!other.active) continue;
    const dx = other.x - c.x;
    const dy = other.y - c.y;
    const minDist = nextR + other.r + 2.5;
    if (dx * dx + dy * dy <= minDist * minDist) {
      c.growing = false;
      break;
    }
  }

  if (c.growing) {
    c.r = nextR;
  }
}

// 4. Clear background
ctx.fillStyle = '#05070a';
ctx.fillRect(0, 0, W, H);

// 5. Draw Packed Circles
for (let i = 0; i < pool.length; i++) {
  const c = pool[i];
  if (!c.active || c.r < 1.5) continue;

  const alpha = Math.max(0, 1 - c.fade);
  const pulse = Math.sin(frame.t * 3 + c.id) * (c.growing ? 0.05 : 0.02) * (1 + bass * 0.5);
  const curR = Math.max(1, c.r * (1 + pulse));
  const dynamicLight = Math.min(90, c.light + treble * 25);

  ctx.save();
  ctx.translate(c.x, c.y);

  if (renderStyle === 'solid_mosaic') {
    // Ambient back-glow
    ctx.beginPath();
    ctx.arc(0, 0, curR + 2, 0, 6.28318);
    ctx.fillStyle = `hsla(${c.hue}, ${c.sat}%, ${dynamicLight}%, ${alpha * 0.15})`;
    ctx.fill();

    // Main disc
    ctx.beginPath();
    ctx.arc(0, 0, curR, 0, 6.28318);
    ctx.fillStyle = `hsla(${c.hue}, ${c.sat}%, ${dynamicLight * 0.55}%, ${alpha * 0.85})`;
    ctx.fill();

    // Rim
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `hsla(${c.hue}, ${c.sat}%, ${dynamicLight + 15}%, ${alpha})`;
    ctx.stroke();

    // Soft inner highlight core
    if (curR > 8) {
      ctx.beginPath();
      ctx.arc(-curR * 0.25, -curR * 0.25, curR * 0.35, 0, 6.28318);
      ctx.fillStyle = `hsla(${c.hue}, 40%, 90%, ${alpha * 0.22})`;
      ctx.fill();
    }
  } else if (renderStyle === 'hollow_radar') {
    // High-tech circular wireframe & reticle
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `hsla(${c.hue}, ${c.sat}%, ${dynamicLight}%, ${alpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(0, 0, curR, 0, 6.28318);
    ctx.stroke();

    if (curR > 14) {
      const angle = frame.t * 0.6 + c.id;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `hsla(${c.hue}, 90%, 75%, ${alpha * 0.6})`;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * curR, Math.sin(angle) * curR);
      ctx.lineTo(Math.cos(angle + 3.14159) * curR, Math.sin(angle + 3.14159) * curR);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, curR * 0.35, 0, 6.28318);
      ctx.stroke();
    }
    ctx.fillStyle = `hsla(${c.hue}, 100%, 70%, ${alpha})`;
    ctx.fillRect(-1.5, -1.5, 3, 3);
  } else if (renderStyle === 'halftone_dots') {
    // Dotted orbital concentric tracks
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = `hsla(${c.hue}, ${c.sat}%, ${dynamicLight}%, ${alpha * 0.85})`;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, curR, 0, 6.28318);
    ctx.stroke();

    let innerR = curR - 7;
    while (innerR > 4) {
      ctx.beginPath();
      ctx.arc(0, 0, innerR, 0, 6.28318);
      ctx.stroke();
      innerR -= 7;
    }
    ctx.setLineDash([]);
  } else {
    // Default 'nested_rings': classic demoscene precision concentric circles
    const ringGap = Math.max(3.5, 5.0 - mid * 2.0);
    let step = 0;
    ctx.lineWidth = 1.2 + (c.growing ? 0.6 : 0.0);

    for (let rSub = curR; rSub >= 2; rSub -= ringGap) {
      const ringLum = (dynamicLight + (step % 2 === 0 ? 10 : -10));
      ctx.strokeStyle = `hsla(${c.hue}, ${c.sat}%, ${ringLum}%, ${alpha * (0.4 + (step === 0 ? 0.6 : 0.3))})`;
      ctx.beginPath();
      ctx.arc(0, 0, rSub, 0, 6.28318);
      ctx.stroke();
      step++;
    }
    if (c.growing) {
      ctx.fillStyle = `hsla(${c.hue}, 100%, 80%, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, 6.28318);
      ctx.fill();
    }
  }

  ctx.restore();
}

ctx.restore();