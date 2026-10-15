ctx.save();

// Persistent room state
room.state.plucks ??= [];
room.state.rings ??= [];
room.state.motes ??= [];
room.state.lastBeat ??= false;
room.state.strumPhase ??= -1;

// Particle motes initialization (fixed pool for demoscene performance)
if (room.state.motes.length === 0) {
  for (let i = 0; i < 90; i++) {
    room.state.motes.push({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.04,
      vy: -0.02 - Math.random() * 0.05,
      size: 1 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2
    });
  }
}

// Palette map
const palettes = {
  emerald_ion: { h: 142, sat: '100%', glow: 'rgba(0, 255, 120, ', core: '#dffff0' },
  cyan_argon: { h: 188, sat: '100%', glow: 'rgba(0, 230, 255, ', core: '#e6ffff' },
  crimson_ruby: { h: 350, sat: '100%', glow: 'rgba(255, 30, 80, ', core: '#ffe6eb' },
  violet_flux: { h: 282, sat: '100%', glow: 'rgba(195, 40, 255, ', core: '#faeaff' },
  aurora_shift: { h: -1, sat: '100%', glow: '', core: '#ffffff' }
};
const palChoice = palettes[getVar('beam_palette')] ?? palettes.emerald_ion;

const hazeModes = {
  clean_mist: { alpha: 0.18, moteAlpha: 0.35, bloomPasses: 2 },
  dense_smoke: { alpha: 0.38, moteAlpha: 0.7, bloomPasses: 3 },
  cosmic_fog: { alpha: 0.55, moteAlpha: 0.85, bloomPasses: 4 }
};
const haze = hazeModes[getVar('haze_density')] ?? hazeModes.dense_smoke;

const harmonicModes = {
  fundamental: 1,
  octaves: 2,
  shimmer: 4
};
const harmMultiplier = harmonicModes[getVar('harmonics')] ?? 2;

const spreadAngleDeg = getVar('beam_spread') ?? 80;
const floorGridOn = getVar('floor_grid') ?? true;

// Determine active beams: 1 per person, minimum 7 for architectural fullness
const people = (room.people && room.people.length > 0) ? room.people : null;
const minBeams = 7;
const numBeams = people ? Math.max(people.length, minBeams) : 9;

// Handle events
for (const e of room.events) {
  if (e.name === 'pluck') {
    let beamIdx = Math.floor(Math.random() * numBeams);
    if (people && e.participantId) {
      const pIdx = people.findIndex(p => p.id === e.participantId);
      if (pIdx >= 0) beamIdx = pIdx % numBeams;
    }
    room.state.plucks.push({ idx: beamIdx, t: frame.t, amp: 1.0 });
    room.state.rings.push({ idx: beamIdx, yNorm: 0.0, speed: 0.65 + Math.random() * 0.3, life: 1.0 });
  } else if (e.name === 'sweep_strum') {
    room.state.strumPhase = 0;
  }
}

// Audio beat auto-trigger
if (audio.beat && !room.state.lastBeat) {
  const beatBeam = Math.floor(Math.random() * numBeams);
  room.state.plucks.push({ idx: beatBeam, t: frame.t, amp: 0.6 + audio.bass * 0.7 });
  room.state.rings.push({ idx: beatBeam, yNorm: 0.0, speed: 0.7, life: 0.9 });
}
room.state.lastBeat = audio.beat;

// Sequential strum handling
if (room.state.strumPhase >= 0) {
  const targetBeam = Math.floor(room.state.strumPhase);
  if (targetBeam < numBeams) {
    room.state.plucks.push({ idx: targetBeam, t: frame.t, amp: 0.85 });
    room.state.rings.push({ idx: targetBeam, yNorm: 0.0, speed: 0.8, life: 1.0 });
    room.state.strumPhase += frame.dt * 22;
  } else {
    room.state.strumPhase = -1;
  }
}

// Prune old plucks and rings
if (room.state.plucks.length > 32) room.state.plucks.splice(0, room.state.plucks.length - 32);
if (room.state.rings.length > 48) room.state.rings.splice(0, room.state.rings.length - 48);

// Clear screen to pure concert dark void with gentle falloff
const W = frame.width;
const H = frame.height;
const originX = W * 0.5;
const originY = H * 0.86;

ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = '#010306';
ctx.fillRect(0, 0, W, H);

// Stage floor horizon line
const stageY = originY;
if (floorGridOn) {
  // Perspective reflective stage floor
  ctx.save();
  const floorGrad = ctx.createLinearGradient(0, stageY, 0, H);
  floorGrad.addColorStop(0, 'rgba(4, 18, 14, 0.75)');
  floorGrad.addColorStop(1, 'rgba(0, 2, 4, 1)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, stageY, W, H - stageY);

  // Perspective floor grid lines
  ctx.strokeStyle = 'rgba(0, 255, 140, 0.07)';
  ctx.lineWidth = 1;
  const fSteps = 7;
  for (let fi = 1; fi <= fSteps; fi++) {
    const py = stageY + Math.pow(fi / fSteps, 1.8) * (H - stageY);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
    ctx.stroke();
  }
  ctx.restore();
}

// Precompute beam geometry and vibration
const halfAngleRad = ((spreadAngleDeg * 0.5) * Math.PI) / 180;
const beamAngleStep = numBeams > 1 ? (halfAngleRad * 2) / (numBeams - 1) : 0;
const topLength = H * 1.05;

// Find active vibration amp per beam
const beamAmps = new Float32Array(numBeams);
for (const p of room.state.plucks) {
  const age = frame.t - p.t;
  if (age >= 0 && age < 2.0) {
    const decay = Math.exp(-age * 2.5);
    beamAmps[p.idx] = Math.max(beamAmps[p.idx], p.amp * decay);
  }
}

// Draw ambient volumetric haze cone from origin
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const coneGrad = ctx.createRadialGradient(originX, originY, 10, originX, originY * 0.45, W * 0.65);
const ambientHue = palChoice.h < 0 ? (frame.t * 30) % 360 : palChoice.h;
coneGrad.addColorStop(0, `hsla(${ambientHue}, 90%, 55%, ${haze.alpha * 0.35 + audio.bass * 0.15})`);
coneGrad.addColorStop(0.5, `hsla(${ambientHue}, 90%, 35%, ${haze.alpha * 0.12})`);
coneGrad.addColorStop(1, 'transparent');
ctx.fillStyle = coneGrad;
ctx.fillRect(0, 0, W, H);
ctx.restore();

// Update & draw atmospheric dust motes floating across the beams
ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (let i = 0; i < room.state.motes.length; i++) {
  const m = room.state.motes[i];
  m.x += m.vx * (1 + audio.mid * 1.5) * frame.dt * 60;
  m.y += m.vy * (1 + audio.treble * 1.2) * frame.dt * 60;
  if (m.y < 0.05) m.y = 0.95;
  if (m.x < 0.05) m.x = 0.95;
  if (m.x > 0.95) m.x = 0.05;

  const mx = m.x * W;
  const my = m.y * H;
  const twinkle = 0.4 + 0.6 * Math.sin(frame.t * 3 + m.phase);
  ctx.fillStyle = `hsla(${ambientHue}, 80%, 75%, ${haze.moteAlpha * twinkle * (0.3 + audio.treble * 0.4)})`;
  ctx.beginPath();
  ctx.arc(mx, my, m.size, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Helper to get beam color string
function getBeamColors(idx) {
  let h = palChoice.h;
  if (h < 0) {
    h = (idx * (360 / numBeams) + frame.t * 20) % 360;
  } else if (people && people[idx] && people[idx].hue !== undefined) {
    // Blend room participant's unique hue softly into selected palette tone
    h = (palChoice.h * 0.6 + people[idx].hue * 0.4) % 360;
  }
  return {
    core: '#ffffff',
    glowInner: `hsla(${h}, 100%, 72%, `,
    glowOuter: `hsla(${h}, 100%, 50%, `,
    ringColor: `hsla(${(h + 40) % 360}, 100%, 85%, `
  };
}

// Draw each beam (core + layered outer bloom)
for (let i = 0; i < numBeams; i++) {
  const angle = -halfAngleRad + i * beamAngleStep - Math.PI / 2;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const endX = originX + cosA * topLength;
  const endY = originY + sinA * topLength;
  const amp = beamAmps[i];
  const col = getBeamColors(i);

  // Vibration normal vector
  const nx = -sinA;
  const ny = cosA;

  // Harmonic wave displacement function
  const getVibe = (normDist) => {
    if (amp <= 0.001) return 0;
    const wave1 = Math.sin(normDist * Math.PI * harmMultiplier - frame.t * 28);
    const wave2 = Math.sin(normDist * Math.PI * (harmMultiplier * 2.5) + frame.t * 44) * 0.4;
    return (wave1 + wave2) * amp * 22 * normDist;
  };

  // Number of sample segments for curvy vibrating string
  const segments = amp > 0.02 ? 24 : 6;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Pass 1: Wide Volumetric Beam Glow
  ctx.beginPath();
  for (let s = 0; s <= segments; s++) {
    const u = s / segments;
    const bx = originX + (endX - originX) * u + nx * getVibe(u);
    const by = originY + (endY - originY) * u + ny * getVibe(u);
    if (s === 0) ctx.moveTo(bx, by);
    else ctx.lineTo(bx, by);
  }
  const wideWidth = (14 + amp * 26 + audio.mid * 8) * (haze.bloomPasses * 0.65);
  ctx.lineWidth = wideWidth;
  ctx.strokeStyle = col.glowOuter + (0.12 + amp * 0.18) + ')';
  ctx.stroke();

  // Pass 2: Intense Inner Shaft Glow
  ctx.lineWidth = 4 + amp * 6;
  ctx.strokeStyle = col.glowInner + (0.6 + amp * 0.35) + ')';
  ctx.stroke();

  // Pass 3: Searing White Core Filament
  ctx.lineWidth = 1.4 + (amp * 1.6);
  ctx.strokeStyle = col.core;
  ctx.stroke();

  // Floor Reflection (downward projected beam bounce)
  if (floorGridOn) {
    const reflY = originY + (originY - endY) * 0.28;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(endX, reflY);
    ctx.lineWidth = 3 + amp * 5;
    ctx.strokeStyle = col.glowOuter + (0.09 + amp * 0.12) + ')';
    ctx.stroke();
  }

  ctx.restore();
}

// Update and render ascending energy rings on plucked beams
ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (let k = room.state.rings.length - 1; k >= 0; k--) {
  const r = room.state.rings[k];
  r.yNorm += r.speed * frame.dt;
  r.life -= frame.dt * 0.85;

  if (r.yNorm > 1.1 || r.life <= 0) {
    room.state.rings.splice(k, 1);
    continue;
  }

  const angle = -halfAngleRad + r.idx * beamAngleStep - Math.PI / 2;
  const rx = originX + Math.cos(angle) * (topLength * r.yNorm);
  const ry = originY + Math.sin(angle) * (topLength * r.yNorm);

  const col = getBeamColors(r.idx);
  const ringRadius = 10 + r.yNorm * 38 + (1.0 - r.life) * 20;
  const ringAlpha = Math.max(0, r.life) * 0.85;

  // Toroidal disc perpendicular to beam fan
  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(angle + Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(0, 0, ringRadius, ringRadius * 0.28, 0, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = col.ringColor + ringAlpha + ')';
  ctx.stroke();

  // Central bright node
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 2.5 + ringAlpha * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
ctx.restore();

// Central laser emitter pedestal & focal lens burst
ctx.save();
ctx.globalCompositeOperation = 'lighter';

// High power laser lens flare at origin
const flareRadius = 38 + audio.bass * 35 + (room.state.plucks.length > 0 ? 12 : 0);
const emitterGrad = ctx.createRadialGradient(originX, originY, 2, originX, originY, flareRadius);
emitterGrad.addColorStop(0, '#ffffff');
emitterGrad.addColorStop(0.2, `hsla(${ambientHue}, 100%, 75%, 0.9)`);
emitterGrad.addColorStop(0.6, `hsla(${ambientHue}, 100%, 50%, 0.3)`);
emitterGrad.addColorStop(1, 'transparent');
ctx.fillStyle = emitterGrad;
ctx.beginPath();
ctx.arc(originX, originY, flareRadius, 0, Math.PI * 2);
ctx.fill();

// Horizontal glare streak across projector floor
const streakWidth = W * (0.35 + audio.bass * 0.35);
const streakGrad = ctx.createLinearGradient(originX - streakWidth * 0.5, originY, originX + streakWidth * 0.5, originY);
streakGrad.addColorStop(0, 'transparent');
streakGrad.addColorStop(0.5, `hsla(${ambientHue}, 100%, 90%, ${0.5 + audio.bass * 0.4})`);
streakGrad.addColorStop(1, 'transparent');
ctx.fillStyle = streakGrad;
ctx.fillRect(originX - streakWidth * 0.5, originY - 1.5, streakWidth, 3);

// Individual projector emitter mirrors on stage floor
for (let i = 0; i < numBeams; i++) {
  const angle = -halfAngleRad + i * beamAngleStep - Math.PI / 2;
  const ex = originX + Math.cos(angle) * 14;
  const ey = originY + Math.sin(angle) * 14;
  const activeAmp = beamAmps[i];
  ctx.fillStyle = activeAmp > 0.1 ? '#ffffff' : `hsla(${ambientHue}, 80%, 70%, 0.5)`;
  ctx.beginPath();
  ctx.arc(ex, ey, 2.5 + activeAmp * 3, 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();

ctx.restore();