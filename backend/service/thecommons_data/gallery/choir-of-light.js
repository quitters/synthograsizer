ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- Configuration & Variables ---
const palChoice = getVar('palette') || 'Starlight Silver';
const atmoChoice = getVar('atmosphere') || 'misty';
const vibeChoice = getVar('vibe') || 'anthem';
const tempo = getVar('sway_speed') ?? 1.0;
const enableBeams = getVar('show_beams') ?? true;

const paletteMap = {
  'Starlight Silver': { core: '#ffffff', glow: [200, 225, 255], beam: [160, 205, 255] },
  'Golden Warmth':    { core: '#fff9e6', glow: [255, 200, 120], beam: [240, 170, 70] },
  'Neon Twilight':    { core: '#fdf0ff', glow: [200, 110, 255], beam: [140, 80, 255] },
  'Concert Amber':    { core: '#fff2dd', glow: [255, 140, 60],  beam: [230, 95, 30] }
};
const pal = paletteMap[palChoice] || paletteMap['Starlight Silver'];

const atmoDensity = atmoChoice === 'crisp' ? 0.35 : (atmoChoice === 'hazy' ? 0.95 : 0.65);
const vibeMult = vibeChoice === 'frenzy' ? 1.7 : (vibeChoice === 'ambient' ? 0.55 : 1.0);
const speed = tempo * vibeMult;

// --- Persistent Arena Data (Preallocated) ---
const NUM_SEATS = 175;
room.state.seats ??= [];
if (room.state.seats.length === 0) {
  for (let i = 0; i < NUM_SEATS; i++) {
    const tier = Math.pow(i / NUM_SEATS, 0.72); // 0 (distant) to 1 (near foreground)
    const spread = (Math.random() - 0.5) * 1.85;
    room.state.seats.push({
      u: spread,
      tier: tier,
      phaseOffset: Math.random() * Math.PI * 2,
      swayFreq: 0.85 + Math.random() * 0.3,
      flicker: 0.7 + Math.random() * 0.6,
      size: 0.8 + tier * 2.2,
      raiseLevel: 0,
      targetRaise: 0,
      personIdx: -1
    });
  }
}

room.state.waves ??= [];
room.state.personMap ??= {};

// Handle Triggers & Events
const events = room.events || [];
for (let i = 0; i < events.length; i++) {
  const ev = events[i];
  if (ev.name === 'stadium_wave') {
    room.state.waves.push({ tStart: t, dir: Math.random() > 0.5 ? 1 : -1 });
    if (room.state.waves.length > 5) room.state.waves.shift();
  } else if (ev.name === 'raise_torch') {
    // Raise a cluster around the user's assigned seat
    const pid = ev.participantId || '';
    let assignedIdx = room.state.personMap[pid];
    if (assignedIdx === undefined) {
      assignedIdx = Math.floor(Math.random() * NUM_SEATS);
      room.state.personMap[pid] = assignedIdx;
    }
    for (let j = 0; j < NUM_SEATS; j++) {
      const s = room.state.seats[j];
      const dist = Math.abs(s.u - room.state.seats[assignedIdx].u) + Math.abs(s.tier - room.state.seats[assignedIdx].tier);
      if (dist < 0.38) {
        s.targetRaise = Math.max(s.targetRaise, 1.0 - dist * 1.5);
      }
    }
  }
}

// Couple motion to crowd size (Kuramoto-style phase locking)
const peopleCount = (room.people && room.people.length) || 1;
const syncStrength = Math.min(0.92, 0.25 + peopleCount * 0.08);

// Map room.people directly into seats for visual agency
const peopleList = room.people || [];
for (let i = 0; i < NUM_SEATS; i++) {
  room.state.seats[i].personIdx = -1;
}
for (let p = 0; p < peopleList.length; p++) {
  const seatIdx = (p * 29) % NUM_SEATS;
  room.state.seats[seatIdx].personIdx = p;
}

// Update Wave ripples
for (let w = room.state.waves.length - 1; w >= 0; w--) {
  const wave = room.state.waves[w];
  if (t - wave.tStart > 5.0) {
    room.state.waves.splice(w, 1);
  }
}

// --- Background & Arena Architectural Silhouette ---
// Deep stadium black with subtle upper bowl gradient
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, '#020308');
bgGrad.addColorStop(0.55, '#040711');
bgGrad.addColorStop(1, '#080d1c');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Soft arena atmospheric mist (modulated by bass)
const bassPump = (audio?.bass || 0) * 0.3;
const hazeGrad = ctx.createRadialGradient(W * 0.5, H * 0.65, W * 0.1, W * 0.5, H * 0.65, W * 0.85);
hazeGrad.addColorStop(0, `rgba(${pal.beam[0]}, ${pal.beam[1]}, ${pal.beam[2]}, ${0.07 * atmoDensity + bassPump * 0.05})`);
hazeGrad.addColorStop(0.6, `rgba(${pal.glow[0] * 0.4}, ${pal.glow[1] * 0.4}, ${pal.glow[2] * 0.5}, ${0.03 * atmoDensity})`);
hazeGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = hazeGrad;
ctx.fillRect(0, 0, W, H);

// Distant stadium tier arc silhouettes
ctx.lineWidth = 1.2;
ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
for (let k = 0; k < 6; k++) {
  const arcY = H * (0.32 + k * 0.11);
  ctx.beginPath();
  ctx.ellipse(W * 0.5, arcY, W * 0.75, H * 0.18, 0, 0, Math.PI);
  ctx.stroke();
}

// --- Render Audience Torches & Cones ---
const commonPhase = t * speed * 2.2;
const audioFlash = audio?.beat ? 0.35 : 0;
const trebleSparkle = (audio?.treble || 0) * 0.4;

// Sort indices roughly back-to-front so volumetric beams overlay properly
// Since seats are static, tier directly correlates with depth
for (let i = 0; i < NUM_SEATS; i++) {
  const s = room.state.seats[i];

  // Check active stadium waves
  let waveEffect = 0;
  for (let w = 0; w < room.state.waves.length; w++) {
    const wave = room.state.waves[w];
    const elapsed = t - wave.tStart;
    const waveFront = -1.0 + elapsed * 0.65 * wave.dir;
    const d = Math.abs(s.u - waveFront);
    if (d < 0.28) {
      waveEffect = Math.max(waveEffect, Math.cos((d / 0.28) * (Math.PI * 0.5)));
    }
  }

  // Update raised state smoothly
  if (waveEffect > 0.01) {
    s.targetRaise = Math.max(s.targetRaise, waveEffect);
  }
  s.targetRaise = Math.max(0, s.targetRaise - dt * 0.45);
  s.raiseLevel += (s.targetRaise - s.raiseLevel) * Math.min(1.0, dt * 6.0);

  // Kuramoto swaying: pull seat phase towards global stadium motion
  const naturalSway = Math.sin(t * s.swayFreq * speed + s.phaseOffset);
  const syncedSway = Math.sin(commonPhase);
  const sway = (1 - syncStrength) * naturalSway + syncStrength * syncedSway;

  // Perspective projection into arena bowl
  const depth = s.tier;
  const screenY = H * (0.38 + depth * 0.56) - s.raiseLevel * H * 0.09;
  const horizSpread = W * (0.46 + depth * 0.48);
  const screenX = W * 0.5 + s.u * horizSpread + sway * (14 + depth * 32);

  // Dynamic color derivation
  let rgbGlow = pal.glow;
  let rgbCore = pal.core;
  if (s.personIdx >= 0 && peopleList[s.personIdx]) {
    // Connect individual participant's custom hue
    const h = peopleList[s.personIdx].hue;
    rgbGlow = [Math.round(180 + 75 * Math.sin(h * 0.017)), Math.round(180 + 75 * Math.sin((h + 120) * 0.017)), Math.round(180 + 75 * Math.sin((h + 240) * 0.017))];
  }

  const isRaised = s.raiseLevel > 0.05;
  const intensity = (0.75 + s.flicker * 0.25 + audioFlash + trebleSparkle) * (1.0 + s.raiseLevel * 1.5);

  // 1. Draw Volumetric Light Cones if enabled and raised
  if (enableBeams && isRaised) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const beamHeight = H * (0.28 + depth * 0.32) * (0.6 + s.raiseLevel * 0.7);
    const beamTopHalfW = (22 + depth * 45) * (0.8 + s.raiseLevel * 0.5);
    const beamTilt = sway * 0.25; // beams tilt as bodies sway

    const topCenterX = screenX + beamTilt * beamHeight;
    const topY = screenY - beamHeight;

    const coneGrad = ctx.createLinearGradient(screenX, screenY, topCenterX, topY);
    const alpha = (0.045 + s.raiseLevel * 0.095) * atmoDensity;
    coneGrad.addColorStop(0, `rgba(${rgbGlow[0]}, ${rgbGlow[1]}, ${rgbGlow[2]}, ${alpha * 1.8})`);
    coneGrad.addColorStop(0.35, `rgba(${pal.beam[0]}, ${pal.beam[1]}, ${pal.beam[2]}, ${alpha})`);
    coneGrad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(screenX - 1.5, screenY);
    ctx.lineTo(topCenterX - beamTopHalfW, topY);
    ctx.lineTo(topCenterX + beamTopHalfW, topY);
    ctx.lineTo(screenX + 1.5, screenY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 2. Audience Silhouette (Subtle dark head/shoulders under the light)
  ctx.save();
  const personScale = (0.6 + depth * 1.4);
  ctx.fillStyle = 'rgba(2, 3, 6, 0.88)';
  ctx.beginPath();
  ctx.ellipse(screenX - sway * 4, screenY + 7 * personScale, 5 * personScale, 6.5 * personScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(screenX - sway * 4, screenY + 16 * personScale, 11 * personScale, 7 * personScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Torch Filament & Multi-pass Glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const coreRadius = s.size * (1.2 + s.raiseLevel * 0.8);
  const haloRadius = coreRadius * (5.5 + depth * 4.0);

  // Outer soft bloom
  const haloGrad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, haloRadius);
  const haloAlpha = Math.min(0.85, (0.28 + s.raiseLevel * 0.4) * intensity);
  haloGrad.addColorStop(0, `rgba(${rgbGlow[0]}, ${rgbGlow[1]}, ${rgbGlow[2]}, ${haloAlpha})`);
  haloGrad.addColorStop(0.4, `rgba(${rgbGlow[0]}, ${rgbGlow[1]}, ${rgbGlow[2]}, ${haloAlpha * 0.3})`);
  haloGrad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(screenX, screenY, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  // Piercing bright core (phone LED)
  ctx.fillStyle = rgbCore;
  ctx.beginPath();
  ctx.arc(screenX, screenY, Math.max(1.0, coreRadius * 0.7), 0, Math.PI * 2);
  ctx.fill();

  // Cross-star sparkle on beat or prominent lights
  if (s.personIdx >= 0 || audio?.beat) {
    const sparkLen = haloRadius * (s.personIdx >= 0 ? 0.9 : 0.45);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 * intensity})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(screenX - sparkLen, screenY);
    ctx.lineTo(screenX + sparkLen, screenY);
    ctx.moveTo(screenX, screenY - sparkLen);
    ctx.lineTo(screenX, screenY + sparkLen);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Dark Projection Wall Vignette ---
// Assures pristine black borders for immersion on high-lumen projectors
const edgeGrad = ctx.createRadialGradient(W * 0.5, H * 0.52, Math.min(W, H) * 0.42, W * 0.5, H * 0.52, Math.max(W, H) * 0.78);
edgeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
edgeGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.45)');
edgeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
ctx.fillStyle = edgeGrad;
ctx.fillRect(0, 0, W, H);

ctx.restore();