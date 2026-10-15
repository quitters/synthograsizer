ctx.save();

const paletteChoice = getVar('palette') ?? 'Molten Ember';
const jetStyle = getVar('jet_style') ?? 'Classic Plume';
const power = (getVar('flow_power') ?? 60) / 50;
const hasGravity = getVar('gravity') ?? true;
const mirrorMode = getVar('mirror') ?? false;

room.state.sparks ??= [];
const sparks = room.state.sparks;

// Palette definitions: [baseHue, hueSpread, sat, light]
const palettes = {
  'Molten Ember': [25, 40, 95, 60],
  'Deep Aurora': [160, 60, 85, 55],
  'Electric Violet': [280, 45, 90, 65],
  'Starlight Silver': [210, 20, 25, 80]
};
const pal = palettes[paletteChoice] ?? palettes['Molten Ember'];

// Fade previous frame for trails
ctx.fillStyle = 'rgba(6, 7, 13, 0.2)';
ctx.fillRect(0, 0, frame.width, frame.height);

// Spawn parameters
const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const originY = hasGravity ? h * 0.92 : h * 0.5;

const dt = Math.min(frame.dt, 0.1);
const beatBoost = audio.beat ? 1.6 : 1.0;
const bassBoost = 1.0 + audio.bass * 0.8;
const spawnCount = Math.floor((3 + audio.mid * 5) * power * beatBoost);

// Inject room people influence
const people = room.people ?? [];
let personHue = null;
if (people.length > 0) {
  const p = people[Math.floor(Math.random() * people.length)];
  if (p && typeof p.hue === 'number') personHue = p.hue;
}

for (let i = 0; i < spawnCount; i++) {
  let angle = -Math.PI / 2;
  let speed = (280 + Math.random() * 220) * power * bassBoost;
  
  if (jetStyle === 'Classic Plume') {
    angle += (Math.random() - 0.5) * 0.45;
  } else if (jetStyle === 'Twirling Ribbon') {
    const twirl = Math.sin(frame.t * 3.5 + i * 0.2) * 0.8;
    angle += twirl;
    speed *= 0.9 + Math.cos(frame.t * 5) * 0.25;
  } else {
    // Explosive Fan
    angle += (Math.random() - 0.5) * 1.8;
    speed *= 0.6 + Math.random() * 0.8;
  }

  // In zero-g, burst in full radial directions if placed in center
  if (!hasGravity) {
    const spread = (Math.random() - 0.5) * Math.PI * 1.8;
    angle = -Math.PI / 2 + spread;
    speed *= 0.6;
  }

  const hue = personHue !== null && Math.random() < 0.25 
    ? personHue 
    : (pal[0] + (Math.random() - 0.5) * pal[1] + 360) % 360;

  sparks.push({
    x: cx + (Math.random() - 0.5) * 12,
    y: originY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 1.0,
    decay: 0.25 + Math.random() * 0.4,
    size: 2 + Math.random() * 3 + audio.bass * 2,
    hue: hue,
    sat: pal[2],
    light: pal[3]
  });
}

// Keep bounded to prevent unbounded memory growth
if (sparks.length > 220) {
  sparks.splice(0, sparks.length - 220);
}

// Update & Draw sparks
ctx.globalCompositeOperation = 'lighter';
const gravityAcc = hasGravity ? 520 : 0;
const driftFreq = frame.t * 1.2;

for (let i = sparks.length - 1; i >= 0; i--) {
  const s = sparks[i];
  
  // Physics
  if (!hasGravity) {
    // Gentle ethereal float & gentle damping
    s.vx += Math.sin(s.y * 0.015 + driftFreq) * 12 * dt;
    s.vy += Math.cos(s.x * 0.015 + driftFreq) * 12 * dt;
    s.vx *= 0.985;
    s.vy *= 0.985;
  } else {
    s.vy += gravityAcc * dt;
    s.vx *= 0.992;
  }

  const prevX = s.x;
  const prevY = s.y;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.life -= s.decay * dt;

  if (s.life <= 0 || s.y > h + 50 || s.x < -50 || s.x > w + 50) {
    sparks.splice(i, 1);
    continue;
  }

  const alpha = Math.max(0, Math.min(1, s.life * (1 + audio.treble * 0.5)));
  const radius = s.size * (0.4 + s.life * 0.6);
  const color = `hsla(${s.hue}, ${s.sat}%, ${s.light}%, ${alpha})`;
  const coreColor = `hsla(${s.hue}, 40%, 95%, ${alpha})`;

  const drawStreak = (px, py, ox, oy) => {
    ctx.lineWidth = radius * 1.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Hot core head
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  };

  // Primary spark
  drawStreak(s.x, s.y, prevX, prevY);

  // Mirror reflection across middle axis
  if (mirrorMode) {
    const mx = w - s.x;
    const mopx = w - prevX;
    drawStreak(mx, s.y, mopx, prevY);
  }
}

// Ground/Emitter ambient glow
const emitterGrad = ctx.createRadialGradient(cx, originY, 4, cx, originY, 70 * power);
emitterGrad.addColorStop(0, `hsla(${pal[0]}, 90%, 70%, 0.35)`);
emitterGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = emitterGrad;
ctx.beginPath();
ctx.arc(cx, originY, 70 * power, 0, Math.PI * 2);
ctx.fill();

if (mirrorMode && !hasGravity) {
  // Symmetrical core glow
  ctx.beginPath();
  ctx.arc(cx, originY, 40 * power, 0, Math.PI * 2);
  ctx.fill();
}

ctx.restore();