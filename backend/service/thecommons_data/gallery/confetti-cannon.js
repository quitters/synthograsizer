ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);
const t = frame.t;

// 1. Demoscene Memory: preallocate particle arrays in room.state
const MAX_FLAKES = 1600;
if (!room.state.px || room.state.px.length !== MAX_FLAKES) {
  room.state.px = new Float32Array(MAX_FLAKES);
  room.state.py = new Float32Array(MAX_FLAKES);
  room.state.vx = new Float32Array(MAX_FLAKES);
  room.state.vy = new Float32Array(MAX_FLAKES);
  room.state.z  = new Float32Array(MAX_FLAKES);
  room.state.yaw = new Float32Array(MAX_FLAKES);
  room.state.pitch = new Float32Array(MAX_FLAKES);
  room.state.roll = new Float32Array(MAX_FLAKES);
  room.state.dyaw = new Float32Array(MAX_FLAKES);
  room.state.dpitch = new Float32Array(MAX_FLAKES);
  room.state.hue = new Float32Array(MAX_FLAKES);
  room.state.sat = new Float32Array(MAX_FLAKES);
  room.state.sz  = new Float32Array(MAX_FLAKES);
  room.state.aspect = new Float32Array(MAX_FLAKES);
  room.state.life = new Float32Array(MAX_FLAKES);
  room.state.cursor = 0;
  room.state.flash = 0.0;
  room.state.lastBeatTime = 0;

  // Initial ambient sprinkle
  for (let i = 0; i < 400; i++) {
    const r = i;
    room.state.px[r] = Math.random() * W;
    room.state.py[r] = Math.random() * H;
    room.state.vx[r] = (Math.random() - 0.5) * 60;
    room.state.vy[r] = 50 + Math.random() * 120;
    room.state.z[r] = 0.4 + Math.random() * 1.2;
    room.state.yaw[r] = Math.random() * 6.28;
    room.state.pitch[r] = Math.random() * 6.28;
    room.state.roll[r] = Math.random() * 6.28;
    room.state.dyaw[r] = (Math.random() - 0.5) * 7.0;
    room.state.dpitch[r] = (Math.random() - 0.5) * 5.0;
    room.state.hue[r] = Math.floor(Math.random() * 360);
    room.state.sat[r] = 90;
    room.state.sz[r] = 8 + Math.random() * 10;
    room.state.aspect[r] = 1.6;
    room.state.life[r] = 1.0;
  }
}

// Helper for fixed-ring particle injection
function spawnFlake(x, y, vx, vy, z, hue, sat, sz, aspect) {
  const idx = room.state.cursor;
  room.state.px[idx] = x;
  room.state.py[idx] = y;
  room.state.vx[idx] = vx;
  room.state.vy[idx] = vy;
  room.state.z[idx] = z;
  room.state.yaw[idx] = Math.random() * 6.28;
  room.state.pitch[idx] = Math.random() * 6.28;
  room.state.roll[idx] = Math.random() * 6.28;
  room.state.dyaw[idx] = (Math.random() - 0.5) * 9.0;
  room.state.dpitch[idx] = (Math.random() - 0.5) * 7.0;
  room.state.hue[idx] = hue;
  room.state.sat[idx] = sat;
  room.state.sz[idx] = sz;
  room.state.aspect[idx] = aspect;
  room.state.life[idx] = 1.0;
  room.state.cursor = (idx + 1) % MAX_FLAKES;
}

// Controls lookup
const styleMap = {
  'Mylar Mix': { aspect: 1.5, baseSz: 10, sat: 90 },
  'Neon Streamers': { aspect: 4.8, baseSz: 7, sat: 100 },
  'Gold Leaf': { aspect: 1.2, baseSz: 9, sat: 40 }
};
const curStyle = styleMap[getVar('confetti_style')] ?? styleMap['Mylar Mix'];
const fallMult = getVar('fall_speed') ?? 1.0;
const driftMult = getVar('drift') ?? 1.1;
const beamPower = getVar('beam_intensity') ?? 0.7;
const strobeOn = getVar('strobe_flash') ?? true;

// Palettes for stage lighting
const rigSchemes = {
  'Arena Beams': [330, 200, 45, 175, 290],
  'Laser Neon': [120, 310, 185, 280, 60],
  'Golden Fest': [42, 30, 52, 24, 48],
  'Midnight Blue': [225, 255, 195, 280, 210]
};
const beamHues = rigSchemes[getVar('lighting')] ?? rigSchemes['Arena Beams'];

// 2. Interactive Cannons & Events
const events = room.events || [];
for (let i = 0; i < events.length; i++) {
  const ev = events[i];
  if (ev.name === 'blast') {
    const person = (room.people || []).find(p => p.id === ev.participantId);
    const cHue = person ? person.hue : Math.floor(Math.random() * 360);
    // Determine cannon origin along stage baseline
    let cannonX = W * 0.5;
    if (room.people && room.people.length > 0) {
      const pIdx = room.people.findIndex(p => p.id === ev.participantId);
      if (pIdx >= 0) {
        cannonX = W * ((pIdx + 0.8) / (room.people.length + 0.6));
      }
    }
    cannonX += (Math.random() - 0.5) * 60;
    const cannonY = H - 35;
    // Blast spray
    const blastCount = 95;
    for (let k = 0; k < blastCount; k++) {
      const spread = (Math.random() - 0.5) * 0.85;
      const speed = 400 + Math.random() * 550;
      const angle = -Math.PI * 0.5 + spread;
      const vx = Math.cos(angle) * speed + (cannonX - W * 0.5) * 0.4;
      const vy = Math.sin(angle) * speed;
      const z = 0.4 + Math.random() * 1.3;
      const aspect = curStyle.aspect * (0.8 + Math.random() * 0.4);
      const sz = curStyle.baseSz * (0.85 + Math.random() * 0.6);
      const jitterHue = (cHue + (Math.random() - 0.5) * 28 + 360) % 360;
      spawnFlake(cannonX, cannonY, vx, vy, z, jitterHue, curStyle.sat, sz, aspect);
    }
    room.state.flash = Math.min(room.state.flash + 0.4, 0.9);
  } else if (ev.name === 'drop_all') {
    // Sky roof drop
    for (let k = 0; k < 180; k++) {
      const rx = Math.random() * W;
      const ry = -10 - Math.random() * 150;
      const vx = (Math.random() - 0.5) * 90;
      const vy = 80 + Math.random() * 160;
      const z = 0.5 + Math.random() * 1.1;
      const rHue = Math.floor(Math.random() * 360);
      spawnFlake(rx, ry, vx, vy, z, rHue, curStyle.sat, curStyle.baseSz, curStyle.aspect);
    }
    room.state.flash = 0.75;
  }
}

// Audio beat reaction
if (audio && audio.beat && strobeOn && (t - room.state.lastBeatTime > 0.28)) {
  room.state.flash = Math.max(room.state.flash, 0.45 + (audio.bass || 0) * 0.45);
  room.state.lastBeatTime = t;
  // Gentle rhythmic burst from sides
  const sideHue = beamHues[Math.floor(Math.random() * beamHues.length)];
  for (let b = 0; b < 12; b++) {
    const fromLeft = (b % 2 === 0);
    spawnFlake(
      fromLeft ? 10 : W - 10,
      H * 0.35 + (Math.random() - 0.5) * 160,
      fromLeft ? 140 + Math.random() * 120 : -140 - Math.random() * 120,
      -60 - Math.random() * 80,
      0.6 + Math.random() * 0.8,
      sideHue,
      curStyle.sat,
      curStyle.baseSz,
      curStyle.aspect
    );
  }
}

// Flash decay
room.state.flash = Math.max(0, room.state.flash - dt * 2.8);

// 3. Render Stage Background & Deep Arena Ambient
ctx.fillStyle = '#030307';
ctx.fillRect(0, 0, W, H);

const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.3, 20, W * 0.5, H * 0.5, W * 0.75);
bgGrad.addColorStop(0, 'rgba(28, 24, 48, 0.55)');
bgGrad.addColorStop(0.6, 'rgba(10, 9, 20, 0.8)');
bgGrad.addColorStop(1, 'rgba(2, 2, 5, 1)');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// 4. Moving Stage Spotlights (volumetric additive beams)
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const numBeams = 6;
for (let b = 0; b < numBeams; b++) {
  const originX = W * ((b + 0.5) / numBeams);
  const originY = H + 20;
  const sweepSpeed = 0.45 + (b % 3) * 0.18;
  const phase = b * 1.35;
  const targetX = W * 0.5 + Math.sin(t * sweepSpeed + phase) * W * 0.48 + ((audio ? audio.bass : 0) - 0.5) * 80;
  const targetY = -40;
  const beamHue = beamHues[b % beamHues.length];
  const beamAlpha = (0.08 + (audio ? audio.mid * 0.12 : 0)) * beamPower;
  
  const angle = Math.atan2(targetY - originY, targetX - originX);
  const spread = 0.14 + (audio ? audio.bass * 0.05 : 0);
  const beamLen = H * 1.5;

  const p1x = originX + Math.cos(angle - spread * 0.2) * 20;
  const p1y = originY + Math.sin(angle - spread * 0.2) * 20;
  const p2x = originX + Math.cos(angle - spread) * beamLen;
  const p2y = originY + Math.sin(angle - spread) * beamLen;
  const p3x = originX + Math.cos(angle + spread) * beamLen;
  const p3y = originY + Math.sin(angle + spread) * beamLen;
  const p4x = originX + Math.cos(angle + spread * 0.2) * 20;
  const p4y = originY + Math.sin(angle + spread * 0.2) * 20;

  const beamGrad = ctx.createLinearGradient(originX, originY, targetX, targetY);
  beamGrad.addColorStop(0, `hsla(${beamHue}, 90%, 65%, ${beamAlpha * 1.8})`);
  beamGrad.addColorStop(0.35, `hsla(${beamHue}, 85%, 50%, ${beamAlpha * 0.9})`);
  beamGrad.addColorStop(1, `hsla(${beamHue}, 80%, 40%, 0)`);

  ctx.beginPath();
  ctx.moveTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.lineTo(p3x, p3y);
  ctx.lineTo(p4x, p4y);
  ctx.closePath();
  ctx.fillStyle = beamGrad;
  ctx.fill();
}
ctx.restore();

// 5. Update & Draw Confetti Flakes (Batched with Demoscene Economy)
const gForce = 160 * fallMult;
const turb = 75 * driftMult;
const bassPunch = audio ? audio.bass * 60 : 0;
const trebleSpark = audio ? audio.treble : 0.3;

for (let i = 0; i < MAX_FLAKES; i++) {
  if (room.state.life[i] <= 0) continue;

  // Physics update
  const z = room.state.z[i];
  const curYaw = room.state.yaw[i] + room.state.dyaw[i] * dt;
  const curPitch = room.state.pitch[i] + room.state.dpitch[i] * dt;
  room.state.yaw[i] = curYaw;
  room.state.pitch[i] = curPitch;

  // Flutter air drag & wobble
  const flutter = Math.sin(curPitch * 2.0 + t * 3.0) * turb * z;
  room.state.vx[i] = (room.state.vx[i] * 0.982) + flutter * dt;
  room.state.vy[i] = (room.state.vy[i] * 0.975) + (gForce * z + bassPunch) * dt;

  room.state.px[i] += room.state.vx[i] * dt;
  room.state.py[i] += room.state.vy[i] * dt;

  // Respawn or boundary check
  if (room.state.py[i] > H + 40 || room.state.px[i] < -60 || room.state.px[i] > W + 60) {
    room.state.life[i] = 0;
    continue;
  }

  const px = room.state.px[i];
  const py = room.state.py[i];

  // 3D Projected Facet: simulate tumbling normal & specular flash
  const cosY = Math.cos(curYaw);
  const sinY = Math.sin(curYaw);
  const cosP = Math.cos(curPitch);
  const facing = Math.abs(cosY * cosP);

  const baseSz = room.state.sz[i] * z;
  const aspect = room.state.aspect[i];
  const hw = Math.max(1.5, (baseSz * 0.5) * Math.max(0.12, Math.abs(cosY)));
  const hh = Math.max(1.5, (baseSz * aspect * 0.5) * Math.max(0.18, Math.abs(cosP)));

  // Specular gleam when normal aims near stage rig lights
  const isGlint = (facing > 0.88);
  const lightness = isGlint ? 88 + trebleSpark * 12 : 36 + facing * 32;
  const sat = isGlint ? 30 : room.state.sat[i];
  const hue = room.state.hue[i];

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(sinY * 0.45);
  
  ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lightness}%)`;
  ctx.fillRect(-hw, -hh, hw * 2, hh * 2);

  // Core specular glint spark for mylar/foil pop
  if (isGlint && z > 0.8) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(-hw * 0.45, -hh * 0.45, hw * 0.9, hh * 0.9);
  }
  ctx.restore();
}

// 6. Concert Crowd Silhouette & Participant Stage Cannons at Baseline
const stageY = H - 32;
ctx.fillStyle = '#020204';
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(0, stageY);
// Subtle crowd silhouette hands/heads
const segments = 28;
for (let s = 0; s <= segments; s++) {
  const sx = (s / segments) * W;
  const crowdWobble = Math.sin(s * 1.8 + t * 2.2) * 6 + Math.cos(s * 3.4) * 4;
  ctx.lineTo(sx, stageY - 6 + crowdWobble);
}
ctx.lineTo(W, stageY);
ctx.lineTo(W, H);
ctx.closePath();
ctx.fill();

// Stage Cannons with participant hues
const people = room.people || [];
const cannonCount = Math.max(people.length, 4);
for (let c = 0; c < cannonCount; c++) {
  const cx = W * ((c + 0.8) / (cannonCount + 0.6));
  const person = people[c];
  const cHue = person ? person.hue : 45;
  
  // Cannon nozzle base
  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(cx - 10, stageY + 2, 20, 24);
  
  // Glowing ready light (shows participant hue)
  ctx.fillStyle = `hsl(${cHue}, 95%, 55%)`;
  ctx.beginPath();
  ctx.arc(cx, stageY + 12, 4.5, 0, 6.28);
  ctx.fill();

  // Cannon rim glow
  ctx.strokeStyle = `hsla(${cHue}, 90%, 65%, 0.6)`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 8, stageY + 4, 16, 16);
}

// 7. Full-Screen Dynamic Beat Strobe & Stage Flash
if (room.state.flash > 0.02) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(240, 245, 255, ${room.state.flash * 0.48})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Subtle top rig truss bar for stage depth
ctx.fillStyle = '#06060c';
ctx.fillRect(0, 0, W, 8);
for (let tr = 0; tr < W; tr += 32) {
  ctx.fillStyle = '#11111c';
  ctx.fillRect(tr, 0, 3, 16);
}

ctx.restore();