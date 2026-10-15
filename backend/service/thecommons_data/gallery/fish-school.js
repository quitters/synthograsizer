const targetCount = Math.floor(getVar('school_size') ?? 120);
const moodKey = getVar('water_mood') ?? 'twilight_reef';
const swimKey = getVar('swim_style') ?? 'glide';
const hasPredator = getVar('predator') ?? false;
const showCurrent = getVar('show_current') ?? true;

const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

const moods = {
  sunlit_shallows: {
    bgTop: '#083a54', bgBot: '#021827',
    ambient: [160, 220, 240],
    glow: 'rgba(80, 210, 240, 0.35)',
    foodColor: '#ffe46b',
    currentAlpha: 0.12
  },
  deep_trench: {
    bgTop: '#030814', bgBot: '#000206',
    ambient: [120, 160, 220],
    glow: 'rgba(50, 110, 220, 0.25)',
    foodColor: '#ff9944',
    currentAlpha: 0.07
  },
  twilight_reef: {
    bgTop: '#0a1d37', bgBot: '#050a1a',
    ambient: [240, 130, 200],
    glow: 'rgba(230, 90, 180, 0.3)',
    foodColor: '#6effca',
    currentAlpha: 0.10
  },
  bioluminescent: {
    bgTop: '#020d18', bgBot: '#000409',
    ambient: [130, 255, 180],
    glow: 'rgba(80, 255, 190, 0.5)',
    foodColor: '#ff44aa',
    currentAlpha: 0.16
  }
};
const mood = moods[moodKey] ?? moods.twilight_reef;

room.state.boids ??= [];
room.state.foods ??= [];
room.state.ripples ??= [];
room.state.predatorObj ??= { x: W * 0.5, y: H * 0.5, vx: 2, vy: 1, angle: 0 };

const boids = room.state.boids;
const foods = room.state.foods;
const ripples = room.state.ripples;
const pred = room.state.predatorObj;

for (const ev of (room.events || [])) {
  if (ev.name === 'feed') {
    const p = (room.people || []).find(person => person.id === ev.participantId);
    const px = p ? ((parseInt(p.id.slice(0, 4), 16) % 800) / 800) * (W * 0.7) + W * 0.15 : (Math.random() * 0.7 + 0.15) * W;
    const py = 20 + Math.random() * 30;
    const hue = p ? p.hue : Math.floor(Math.random() * 360);
    foods.push({ x: px, y: py, vy: 35 + Math.random() * 30, radius: 5, hue, life: 1.0 });
    ripples.push({ x: px, y: py, r: 4, maxR: 45, alpha: 0.8, color: `hsl(${hue}, 80%, 65%)` });
  }
}
while (foods.length > 20) foods.shift();

while (boids.length < targetCount) {
  boids.push({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 100,
    vy: (Math.random() - 0.5) * 100,
    size: 5 + Math.random() * 4,
    seed: Math.random() * 1000,
    phase: Math.random() * Math.PI * 2
  });
}
if (boids.length > targetCount) boids.length = targetCount;

ctx.save();
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, mood.bgTop);
bgGrad.addColorStop(1, mood.bgBot);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

function getCurrent(x, y, t) {
  const n1 = Math.sin(x * 0.0022 + t * 0.4) * Math.cos(y * 0.0028 + t * 0.25);
  const n2 = Math.cos(x * 0.0017 - t * 0.3) * Math.sin(y * 0.0021 + t * 0.35);
  const angle = Math.atan2(n2, n1 + 0.2) + 0.3;
  const speed = 25 + Math.sin(x * 0.001 + y * 0.001 + t) * 15;
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed, angle };
}

if (showCurrent) {
  ctx.strokeStyle = `rgba(180, 230, 255, ${mood.currentAlpha})`;
  ctx.lineWidth = 1.2;
  const step = 55;
  const t = frame.t;
  for (let gx = step * 0.5; gx < W; gx += step) {
    for (let gy = step * 0.5; gy < H; gy += step) {
      const c = getCurrent(gx, gy, t);
      const mag = 14 + audio.mid * 10;
      const ex = gx + Math.cos(c.angle) * mag;
      const ey = gy + Math.sin(c.angle) * mag;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }
}

for (let i = ripples.length - 1; i >= 0; i--) {
  const rp = ripples[i];
  rp.r += dt * 50;
  rp.alpha -= dt * 0.6;
  if (rp.alpha <= 0 || rp.r >= rp.maxR) {
    ripples.splice(i, 1);
    continue;
  }
  ctx.beginPath();
  ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
  ctx.strokeStyle = rp.color.replace(')', `, ${rp.alpha})`).replace('hsl', 'hsla');
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

for (let i = foods.length - 1; i >= 0; i--) {
  const f = foods[i];
  f.y += f.vy * dt;
  f.x += Math.sin(frame.t * 3 + f.y * 0.05) * 18 * dt;
  if (f.y > H - 10) {
    f.life -= dt * 0.5;
  }
  if (f.life <= 0) {
    foods.splice(i, 1);
    continue;
  }
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
  ctx.fillStyle = f.hue !== undefined ? `hsl(${f.hue}, 90%, 65%)` : mood.foodColor;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

if (hasPredator) {
  let targetX = W * 0.5;
  let targetY = H * 0.5;
  let minDist = Infinity;
  for (const b of boids) {
    const d = Math.hypot(b.x - pred.x, b.y - pred.y);
    if (d < minDist) {
      minDist = d;
      targetX = b.x;
      targetY = b.y;
    }
  }
  const angleToTarget = Math.atan2(targetY - pred.y, targetX - pred.x);
  const steerAngle = Math.atan2(Math.sin(angleToTarget - pred.angle), Math.cos(angleToTarget - pred.angle));
  pred.angle += steerAngle * dt * 2.8;
  const speed = 160 + audio.bass * 140;
  pred.vx = Math.cos(pred.angle) * speed;
  pred.vy = Math.sin(pred.angle) * speed;
  pred.x += pred.vx * dt;
  pred.y += pred.vy * dt;
  if (pred.x < -40) pred.x = W + 40;
  if (pred.x > W + 40) pred.x = -40;
  if (pred.y < -40) pred.y = H + 40;
  if (pred.y > H + 40) pred.y = -40;

  ctx.save();
  ctx.translate(pred.x, pred.y);
  ctx.rotate(pred.angle);
  const tailWag = Math.sin(frame.t * 10) * 0.25;
  ctx.fillStyle = '#b62438';
  ctx.shadowColor = 'rgba(255, 60, 80, 0.8)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(-14, -10);
  ctx.lineTo(-24 + tailWag * 6, -16);
  ctx.lineTo(-18, 0);
  ctx.lineTo(-24 - tailWag * 6, 16);
  ctx.lineTo(-14, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff7b8a';
  ctx.beginPath();
  ctx.arc(10, -4, 2.5, 0, Math.PI * 2);
  ctx.arc(10, 4, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const styleMult = {
  glide: { speed: 85, align: 1.0, jitter: 10 },
  darting: { speed: 135, align: 0.6, jitter: 35 },
  swirling: { speed: 110, align: 1.4, jitter: 15 }
}[swimKey] ?? { speed: 85, align: 1.0, jitter: 10 };

const bassBoost = 1.0 + audio.bass * 0.8 + (audio.beat ? 0.4 : 0);
const speedLimit = (styleMult.speed + audio.treble * 40) * bassBoost;
const visualRadius = 75;
const separationDist = 28;

for (let i = 0; i < boids.length; i++) {
  const b = boids[i];
  let avgVx = 0;
  let avgVy = 0;
  let centerX = 0;
  let centerY = 0;
  let sepX = 0;
  let sepY = 0;
  let neighbors = 0;

  for (let j = 0; j < boids.length; j++) {
    if (i === j) continue;
    const other = boids[j];
    const dx = other.x - b.x;
    const dy = other.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < visualRadius) {
      avgVx += other.vx;
      avgVy += other.vy;
      centerX += other.x;
      centerY += other.y;
      neighbors++;
      if (dist < separationDist) {
        const push = (separationDist - dist) / dist;
        sepX -= dx * push * 2.5;
        sepY -= dy * push * 2.5;
      }
    }
  }

  let fx = 0;
  let fy = 0;

  if (neighbors > 0) {
    avgVx /= neighbors;
    avgVy /= neighbors;
    centerX /= neighbors;
    centerY /= neighbors;
    fx += (avgVx - b.vx) * styleMult.align;
    fx += (centerX - b.x) * 0.8;
    fy += (avgVy - b.vy) * styleMult.align;
    fy += (centerY - b.y) * 0.8;
    fx += sepX * 18;
    fy += sepY * 18;
  }

  const cur = getCurrent(b.x, b.y, frame.t);
  fx += (cur.x - b.vx) * 0.4;
  fy += (cur.y - b.vy) * 0.4;

  if (swimKey === 'swirling') {
    const cx = W * 0.5;
    const cy = H * 0.5;
    const swirlDx = b.x - cx;
    const swirlDy = b.y - cy;
    fx += -swirlDy * 0.25;
    fy += swirlDx * 0.25;
  }

  if (foods.length > 0) {
    let closestF = null;
    let closestD = 220;
    for (const f of foods) {
      const d = Math.hypot(f.x - b.x, f.y - b.y);
      if (d < closestD) {
        closestD = d;
        closestF = f;
      }
    }
    if (closestF) {
      const attract = (220 - closestD) / 220;
      fx += (closestF.x - b.x) * attract * 3.5;
      fy += (closestF.y - b.y) * attract * 3.5;
      if (closestD < 12) {
        closestF.life -= 0.25;
      }
    }
  }

  if (hasPredator) {
    const pdx = b.x - pred.x;
    const pdy = b.y - pred.y;
    const pdist = Math.hypot(pdx, pdy);
    if (pdist < 160 && pdist > 0) {
      const fear = (160 - pdist) / pdist;
      fx += pdx * fear * 14;
      fy += pdy * fear * 14;
    }
  }

  const margin = 70;
  if (b.x < margin) fx += (margin - b.x) * 3;
  if (b.x > W - margin) fx -= (b.x - (W - margin)) * 3;
  if (b.y < margin) fy += (margin - b.y) * 3;
  if (b.y > H - margin) fy -= (b.y - (H - margin)) * 3;

  fx += Math.sin(frame.t * 3 + b.seed) * styleMult.jitter;
  fy += Math.cos(frame.t * 3 + b.seed) * styleMult.jitter;

  b.vx += fx * dt;
  b.vy += fy * dt;
  const curSpeed = Math.hypot(b.vx, b.vy);
  if (curSpeed > speedLimit) {
    b.vx = (b.vx / curSpeed) * speedLimit;
    b.vy = (b.vy / curSpeed) * speedLimit;
  } else if (curSpeed < 20) {
    b.vx = (b.vx / (curSpeed || 1)) * 25;
    b.vy = (b.vy / (curSpeed || 1)) * 25;
  }

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x < -20) b.x = W + 20;
  if (b.x > W + 20) b.x = -20;
  if (b.y < -20) b.y = H + 20;
  if (b.y > H + 20) b.y = -20;

  const angle = Math.atan2(b.vy, b.vx);
  const peopleCount = room.people ? room.people.length : 0;
  let fishHue = (mood.ambient[0] + (i % 5) * 8 + audio.mid * 40) % 360;
  if (peopleCount > 0 && i < peopleCount) {
    fishHue = room.people[i].hue;
  }

  const flap = Math.sin(frame.t * 8 + b.phase + curSpeed * 0.04) * 0.35;
  const len = b.size * 1.8;
  const wid = b.size * 0.75;

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(angle);

  ctx.shadowColor = mood.glow;
  ctx.shadowBlur = 8 + audio.bass * 8;

  ctx.fillStyle = `hsl(${fishHue}, 85%, 68%)`;
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.quadraticCurveTo(0, -wid, -len * 0.5, 0);
  ctx.quadraticCurveTo(0, wid, len, 0);
  ctx.fill();

  ctx.strokeStyle = `hsl(${fishHue}, 90%, 80%)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-len * 0.5, 0);
  ctx.lineTo(-len - Math.cos(flap) * 4, Math.sin(flap) * 7);
  ctx.stroke();

  ctx.restore();
}

ctx.restore();