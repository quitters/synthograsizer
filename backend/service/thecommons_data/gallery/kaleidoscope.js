const dt = Math.min(frame.dt || 0.016, 0.05);
const mirrors = Math.round(getVar('mirrors') ?? 6);
const rotSpeed = getVar('rotation_speed') ?? 0.6;
const shardCount = Math.min(150, Math.round(getVar('shard_count') ?? 75));
const paletteKey = getVar('color_palette') || 'stained_glass';
const shapeKey = getVar('gem_shape') || 'crystals';
const motionKey = getVar('chamber_motion') || 'hypnotic';

const PALETTES = {
  stained_glass: [350, 42, 145, 215, 280],
  opal_aurora: [175, 205, 255, 310, 140],
  cyber_neon: [315, 185, 115, 275, 55],
  solar_flare: [12, 34, 52, 355, 24]
};
const palette = PALETTES[paletteKey] || PALETTES.stained_glass;

// One-time setup of reusable buffers and bounded shard arrays
if (!room.state.initialized) {
  room.state.initialized = true;
  room.state.offscreen = new OffscreenCanvas(800, 800);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.scopeAngle = 0;
  room.state.tumblePulse = 0;
  room.state.shards = [];
  for (let i = 0; i < 150; i++) {
    const r = 50 + Math.random() * 300;
    const a = Math.random() * Math.PI * 2;
    room.state.shards.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      radius: 12 + Math.random() * 24,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 2.2,
      sides: 3 + (i % 4),
      aspect: 0.4 + Math.random() * 0.9,
      colorIdx: i % 5,
      seed: Math.random() * 200
    });
  }
}

// Beat tumble impulse & scope rotation
if (audio.beat) room.state.tumblePulse = 1.0;
else room.state.tumblePulse = Math.max(0, (room.state.tumblePulse || 0) - dt * 2.5);

const tumbleStrength = (room.state.tumblePulse * 2.0 + audio.bass * 1.5);
room.state.scopeAngle += (rotSpeed * 0.35 + tumbleStrength * 0.1) * dt;

// Update shard chamber simulation
const shards = room.state.shards;
const people = room.people || [];
const peopleLen = people.length;

for (let i = 0; i < shardCount; i++) {
  const s = shards[i];
  // Motion regimes
  if (motionKey === 'vortex') {
    const d = Math.hypot(s.x, s.y) || 1;
    s.vx += (-s.y / d * 55 - s.x * 0.05) * dt;
    s.vy += (s.x / d * 55 - s.y * 0.05) * dt;
  } else if (motionKey === 'turbulent') {
    s.vx += Math.sin(frame.t * 1.8 + s.y * 0.02) * 45 * dt;
    s.vy += Math.cos(frame.t * 1.8 + s.x * 0.02) * 45 * dt;
  } else {
    s.vx += Math.sin(frame.t * 0.6 + s.seed) * 15 * dt;
    s.vy += Math.cos(frame.t * 0.6 + s.seed) * 15 * dt;
  }

  // Damping
  s.vx *= 0.985;
  s.vy *= 0.985;
  s.x += s.vx * dt * (1 + tumbleStrength * 0.6);
  s.y += s.vy * dt * (1 + tumbleStrength * 0.6);

  // Soft chamber wall bounce
  const dist = Math.hypot(s.x, s.y);
  if (dist > 360) {
    const nx = s.x / dist;
    const ny = s.y / dist;
    s.x = nx * 360;
    s.y = ny * 360;
    s.vx = (s.vx - 2 * (s.vx * nx + s.vy * ny) * nx) * 0.85;
    s.vy = (s.vy - 2 * (s.vx * nx + s.vy * ny) * ny) * 0.85;
  }
  s.angle += (s.spin + tumbleStrength * (s.spin > 0 ? 3.5 : -3.5)) * dt;
}

// Render shard chamber once to 800x800 offscreen canvas
const offCtx = room.state.offCtx;
const offscreen = room.state.offscreen;
offCtx.save();
offCtx.clearRect(0, 0, 800, 800);
offCtx.translate(400, 400);

// Chamber ambient glow
const chGrad = offCtx.createRadialGradient(0, 0, 20, 0, 0, 380);
chGrad.addColorStop(0, 'rgba(25, 20, 35, 0.4)');
chGrad.addColorStop(1, 'rgba(5, 2, 10, 0.95)');
offCtx.fillStyle = chGrad;
offCtx.beginPath();
offCtx.arc(0, 0, 380, 0, Math.PI * 2);
offCtx.fill();

const midGlow = audio.mid * 0.4;
const trebleSpark = audio.treble * 0.5;

for (let i = 0; i < shardCount; i++) {
  const s = shards[i];
  const baseHue = (i < peopleLen) ? people[i].hue : palette[s.colorIdx];
  const shardRad = s.radius * (1 + audio.bass * 0.15);

  offCtx.save();
  offCtx.translate(s.x, s.y);
  offCtx.rotate(s.angle);

  const sides = shapeKey === 'crystals' ? 3 : (shapeKey === 'polyhedra' ? Math.max(5, s.sides) : 4);
  offCtx.beginPath();
  for (let v = 0; v < sides; v++) {
    const ang = (v / sides) * Math.PI * 2;
    let r = shardRad;
    if (shapeKey === 'crystals') {
      r *= (v === 0) ? 2.0 : s.aspect;
    } else if (shapeKey === 'fragments') {
      r *= 0.7 + Math.sin(v * 2.1 + s.seed) * 0.4;
    }
    const px = Math.cos(ang) * r;
    const py = Math.sin(ang) * r;
    if (v === 0) offCtx.moveTo(px, py);
    else offCtx.lineTo(px, py);
  }
  offCtx.closePath();

  // Faceted crystal fill
  offCtx.fillStyle = `hsla(${baseHue}, 85%, ${48 + tumbleStrength * 15}%, ${0.55 + midGlow})`;
  offCtx.fill();

  // Lead came / mirror edge line
  offCtx.strokeStyle = `hsla(${baseHue + 20}, 100%, ${75 + trebleSpark * 25}%, 0.85)`;
  offCtx.lineWidth = 1.4 + trebleSpark;
  offCtx.stroke();

  // Inner facet highlight triangle
  offCtx.beginPath();
  offCtx.moveTo(0, 0);
  offCtx.lineTo(Math.cos(0.2) * shardRad * 0.8, Math.sin(0.2) * shardRad * 0.8);
  offCtx.lineTo(Math.cos(1.4) * shardRad * 0.6, Math.sin(1.4) * shardRad * 0.6);
  offCtx.closePath();
  offCtx.fillStyle = `hsla(${baseHue + 35}, 95%, 85%, ${0.4 + midGlow})`;
  offCtx.fill();

  offCtx.restore();
}
offCtx.restore();

// Main canvas assembly: stamp mirrored wedges seamlessly
ctx.save();
ctx.fillStyle = '#060408';
ctx.fillRect(0, 0, frame.width, frame.height);

const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const maxRadius = Math.hypot(cx, cy) * 1.05;
const wedgeAngle = Math.PI / mirrors;

// Eyepiece focal point drift through shard chamber
const apexDriftDist = 130 + Math.sin(frame.t * 0.35) * 50 + audio.bass * 35;
const apexDriftAngle = frame.t * 0.22;
const apexX = 400 + Math.cos(apexDriftAngle) * apexDriftDist;
const apexY = 400 + Math.sin(apexDriftAngle) * apexDriftDist;

// Scale factor so 800x800 offscreen covers whole viewport
const scale = (maxRadius / 320) * (1 + audio.bass * 0.05);

ctx.translate(cx, cy);
ctx.rotate(room.state.scopeAngle);

for (let k = 0; k < mirrors; k++) {
  const baseAngle = k * 2 * wedgeAngle;

  // Slice A (direct sector [0, wedgeAngle])
  ctx.save();
  ctx.rotate(baseAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, maxRadius, -0.003, wedgeAngle + 0.003);
  ctx.closePath();
  ctx.clip();
  ctx.scale(scale, scale);
  ctx.drawImage(offscreen, -apexX, -apexY);
  ctx.restore();

  // Slice B (mirrored sector [wedgeAngle, 2*wedgeAngle])
  ctx.save();
  ctx.rotate(baseAngle + 2 * wedgeAngle);
  ctx.scale(1, -1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, maxRadius, -0.003, wedgeAngle + 0.003);
  ctx.closePath();
  ctx.clip();
  ctx.scale(scale, scale);
  ctx.drawImage(offscreen, -apexX, -apexY);
  ctx.restore();
}

// Eyepiece brass vignette
ctx.rotate(-room.state.scopeAngle);
const vignette = ctx.createRadialGradient(0, 0, maxRadius * 0.65, 0, 0, maxRadius);
vignette.addColorStop(0, 'rgba(4, 2, 8, 0)');
vignette.addColorStop(0.7, 'rgba(4, 2, 8, 0.45)');
vignette.addColorStop(1, 'rgba(2, 1, 4, 0.95)');
ctx.fillStyle = vignette;
ctx.beginPath();
ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
ctx.fill();

ctx.restore();