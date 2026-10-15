const dt = Math.min(frame.dt || 0.016, 0.1);
room.state.creatures ??= [];
room.state.food ??= [];
room.state.predators ??= [];
room.state.particles ??= [];

const climates = {
  "Lush": { rate: 6, max: 280 },
  "Temperate": { rate: 3, max: 150 },
  "Harsh": { rate: 1, max: 80 },
  "Drought": { rate: 0.25, max: 35 }
};
const climateKey = getVar('climate') ?? 'Temperate';
const env = climates[climateKey] ?? climates.Temperate;
const metab = getVar('metabolism') ?? 2;
const mut = getVar('mutation') ?? 15;
const bScale = getVar('boid_scale') ?? 10;
const targetPredators = Math.round(getVar('predator_count') ?? 2);

// 60-second continuous seasonal cycle
const seasonPhase = (frame.t % 60) / 60;
const sTotal = seasonPhase * 4;
const sIdx1 = Math.floor(sTotal) % 4;
const sIdx2 = (sIdx1 + 1) % 4;
const sRawFrac = sTotal - Math.floor(sTotal);
const sBlend = sRawFrac * sRawFrac * (3 - 2 * sRawFrac);

const seasons = [
  { name: 'SPRING', r: 12, g: 30, b: 20, mult: 1.3, hue: 135 },
  { name: 'SUMMER', r: 28, g: 32, b: 12, mult: 1.85, hue: 65 },
  { name: 'AUTUMN', r: 35, g: 18, b: 10, mult: 0.8, hue: 28 },
  { name: 'WINTER', r: 10, g: 18, b: 35, mult: 0.25, hue: 195 }
];
const curSeason = seasons[sIdx1];
const nextSeason = seasons[sIdx2];

const bgR = Math.round(curSeason.r + (nextSeason.r - curSeason.r) * sBlend);
const bgG = Math.round(curSeason.g + (nextSeason.g - curSeason.g) * sBlend);
const bgB = Math.round(curSeason.b + (nextSeason.b - curSeason.b) * sBlend);
const seasonMult = curSeason.mult + (nextSeason.mult - curSeason.mult) * sBlend;
const foodHue = Math.round(curSeason.hue + (nextSeason.hue - curSeason.hue) * sBlend);

// Trigger reactions
for (const e of room.events) {
  if (e.name === 'spawn_creature') {
    const p = (room.people || []).find(x => x.id === e.participantId);
    const baseHue = p ? p.hue : Math.random() * 360;
    for (let i = 0; i < 4; i++) {
      room.state.creatures.push({
        x: (Math.random() * 0.8 + 0.1) * frame.width,
        y: (Math.random() * 0.8 + 0.1) * frame.height,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        energy: 140,
        hue: (baseHue + (Math.random() - 0.5) * mut + 360) % 360
      });
    }
  }
  if (e.name === 'feed_burst') {
    const burstCeiling = env.max * seasonMult * 2.2;
    for (let i = 0; i < 28 && room.state.food.length < burstCeiling; i++) {
      room.state.food.push({
        x: Math.random() * frame.width,
        y: Math.random() * frame.height,
        energy: 25
      });
    }
  }
  if (e.name === 'extinction') {
    const survivors = Math.max(2, Math.floor(room.state.creatures.length * 0.12));
    room.state.creatures = room.state.creatures.slice(0, survivors);
    for (let k = 0; k < 35; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * 7 + 2;
      room.state.particles.push({
        x: frame.width * 0.5, y: frame.height * 0.5,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1.0, hue: 0, size: 4
      });
    }
  }
}

// Maintain starter creatures
if (room.state.creatures.length < 5) {
  for (let i = 0; i < 6; i++) {
    room.state.creatures.push({
      x: frame.width * 0.5 + (Math.random() - 0.5) * 140,
      y: frame.height * 0.5 + (Math.random() - 0.5) * 140,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      energy: 150,
      hue: Math.random() * 360
    });
  }
}

// Manage apex predators pool
while (room.state.predators.length < targetPredators) {
  room.state.predators.push({
    id: Math.random(),
    x: Math.random() < 0.5 ? 20 : frame.width - 20,
    y: Math.random() * frame.height,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    isLunging: false,
    trail: []
  });
}
while (room.state.predators.length > targetPredators) {
  room.state.predators.pop();
}

// Seasonal food spawning
const effectiveMaxFood = Math.max(10, Math.round(env.max * seasonMult));
let growth = env.rate * seasonMult * dt * 60;
if (audio.beat) growth += 2.5 * seasonMult;
while (growth > 1 || Math.random() < growth) {
  if (room.state.food.length < effectiveMaxFood) {
    room.state.food.push({
      x: Math.random() * frame.width,
      y: Math.random() * frame.height,
      energy: 18 + Math.random() * 22
    });
  }
  growth -= 1;
}

// Land background tinted by active season
ctx.save();
ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, 0.28)`;
ctx.fillRect(0, 0, frame.width, frame.height);

// Ambient seasonal motes drifting on the wind
for (let k = 0; k < 16; k++) {
  const mx = ((k * 97 + frame.t * (12 + (k % 4) * 6)) % (frame.width + 40)) - 20;
  const my = ((k * 153 + Math.sin(frame.t * 0.7 + k) * 35 + frame.t * 8) % (frame.height + 40)) - 20;
  ctx.beginPath();
  ctx.arc(mx, my, 1 + (k % 3) * 0.7 + audio.mid * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${foodHue + (k % 3) * 12}, 85%, 72%, 0.22)`;
  ctx.fill();
}

// Render food pellets matching seasonal flora
ctx.globalCompositeOperation = 'screen';
for (let i = 0; i < room.state.food.length; i++) {
  const f = room.state.food[i];
  const pulse = 1.8 + audio.bass * 4;
  ctx.beginPath();
  ctx.arc(f.x, f.y, pulse, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${foodHue}, 90%, 65%, 0.75)`;
  ctx.fill();
}
ctx.restore();

const speedScale = 60 * dt;
const maxPreySpeed = 3.2 + audio.level * 3.8;

// Preys update & draw
for (let i = room.state.creatures.length - 1; i >= 0; i--) {
  const c = room.state.creatures[i];

  // Evasion: flee from the nearest predator
  let nearestPred = null;
  let minPredSq = 130 * 130;
  for (let pIdx = 0; pIdx < room.state.predators.length; pIdx++) {
    const pr = room.state.predators[pIdx];
    const pdx = pr.x - c.x;
    const pdy = pr.y - c.y;
    const pDistSq = pdx * pdx + pdy * pdy;
    if (pDistSq < minPredSq) {
      minPredSq = pDistSq;
      nearestPred = { x: pr.x, y: pr.y, dist: Math.sqrt(pDistSq) };
    }
  }

  if (nearestPred && nearestPred.dist > 0.001) {
    const panic = (1 - nearestPred.dist / 130) * 2.2;
    c.vx -= ((nearestPred.x - c.x) / nearestPred.dist) * panic;
    c.vy -= ((nearestPred.y - c.y) / nearestPred.dist) * panic;
  } else {
    // Seek nearest food
    let nearestF = null;
    let minFSq = 60000;
    let fIdx = -1;
    for (let j = 0; j < room.state.food.length; j++) {
      const f = room.state.food[j];
      const dx = f.x - c.x;
      const dy = f.y - c.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minFSq) {
        minFSq = distSq;
        nearestF = f;
        fIdx = j;
      }
    }
    if (nearestF) {
      const fDist = Math.sqrt(minFSq);
      if (fDist < bScale * 1.5) {
        c.energy = Math.min(200, c.energy + nearestF.energy);
        room.state.food.splice(fIdx, 1);
      } else {
        c.vx += ((nearestF.x - c.x) / fDist) * 0.42;
        c.vy += ((nearestF.y - c.y) / fDist) * 0.42;
      }
    } else {
      c.vx += (Math.random() - 0.5) * 0.5;
      c.vy += (Math.random() - 0.5) * 0.5;
    }
  }

  const spd = Math.hypot(c.vx, c.vy);
  if (spd > maxPreySpeed) {
    c.vx = (c.vx / spd) * maxPreySpeed;
    c.vy = (c.vy / spd) * maxPreySpeed;
  }
  c.x += c.vx * speedScale;
  c.y += c.vy * speedScale;

  if (c.x < 0) c.x += frame.width;
  if (c.x > frame.width) c.x -= frame.width;
  if (c.y < 0) c.y += frame.height;
  if (c.y > frame.height) c.y -= frame.height;

  c.energy -= metab * dt * 10;

  // Reproduction when nourished
  if (c.energy > 175 && room.state.creatures.length < 240) {
    c.energy -= 90;
    room.state.creatures.push({
      x: c.x, y: c.y,
      vx: -c.vx, vy: -c.vy,
      energy: 85,
      hue: (c.hue + (Math.random() - 0.5) * mut + 360) % 360
    });
  }

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(Math.atan2(c.vy, c.vx));
  let alpha = 1;
  if (c.energy < 40) alpha = 0.3 + 0.7 * Math.abs(Math.sin(frame.t * 8));
  ctx.fillStyle = `hsla(${c.hue}, 85%, 60%, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(bScale, 0);
  ctx.lineTo(-bScale, bScale * 0.6);
  ctx.lineTo(-bScale * 0.45, 0);
  ctx.lineTo(-bScale, -bScale * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (c.energy <= 0) {
    room.state.creatures.splice(i, 1);
  }
}

// Apex Predators update & draw
for (let p = 0; p < room.state.predators.length; p++) {
  const pred = room.state.predators[p];
  let preyTarget = null;
  let preyMinDist = 320 * 320;
  let targetIdx = -1;

  for (let cIdx = 0; cIdx < room.state.creatures.length; cIdx++) {
    const target = room.state.creatures[cIdx];
    const dx = target.x - pred.x;
    const dy = target.y - pred.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < preyMinDist) {
      preyMinDist = distSq;
      preyTarget = target;
      targetIdx = cIdx;
    }
  }

  pred.isLunging = false;
  if (preyTarget) {
    const pDist = Math.sqrt(preyMinDist);
    if (pDist < 100 || audio.bass > 0.4) pred.isLunging = true;
    const steer = pred.isLunging ? 0.65 : 0.35;
    pred.vx += ((preyTarget.x - pred.x) / pDist) * steer;
    pred.vy += ((preyTarget.y - pred.y) / pDist) * steer;

    // Hunt strike
    if (pDist < bScale * 1.5 + 8) {
      for (let k = 0; k < 9; k++) {
        const sang = Math.random() * Math.PI * 2;
        const sspd = Math.random() * 4 + 1.5;
        room.state.particles.push({
          x: preyTarget.x, y: preyTarget.y,
          vx: Math.cos(sang) * sspd + pred.vx * 0.3,
          vy: Math.sin(sang) * sspd + pred.vy * 0.3,
          life: 0.85,
          hue: Math.random() < 0.5 ? 0 : preyTarget.hue,
          size: 2.8
        });
      }
      room.state.creatures.splice(targetIdx, 1);
    }
  } else {
    pred.vx += Math.cos(frame.t * 1.2 + pred.id * 10) * 0.25;
    pred.vy += Math.sin(frame.t * 1.2 + pred.id * 10) * 0.25;
  }

  const maxPredSpd = (pred.isLunging ? 6.8 : 3.8) + audio.bass * 3.5;
  const curPSpd = Math.hypot(pred.vx, pred.vy);
  if (curPSpd > maxPredSpd) {
    pred.vx = (pred.vx / curPSpd) * maxPredSpd;
    pred.vy = (pred.vy / curPSpd) * maxPredSpd;
  }

  pred.x += pred.vx * speedScale;
  pred.y += pred.vy * speedScale;
  if (pred.x < -30) pred.x += frame.width + 60;
  if (pred.x > frame.width + 30) pred.x -= frame.width + 60;
  if (pred.y < -30) pred.y += frame.height + 60;
  if (pred.y > frame.height + 30) pred.y -= frame.height + 60;

  pred.trail.push({ x: pred.x, y: pred.y });
  if (pred.trail.length > 8) pred.trail.shift();

  // Trail ribbon
  ctx.save();
  ctx.strokeStyle = 'rgba(240, 45, 75, 0.25)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let t = 0; t < pred.trail.length; t++) {
    const pt = pred.trail[t];
    if (t === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();

  // Apex predator body
  ctx.translate(pred.x, pred.y);
  ctx.rotate(Math.atan2(pred.vy, pred.vx));
  const pS = bScale * 2.2;
  const finFlare = audio.bass * pS * 0.45;

  ctx.shadowColor = 'rgba(255, 30, 60, 0.65)';
  ctx.shadowBlur = 12 + audio.bass * 16;
  ctx.fillStyle = '#140608';
  ctx.strokeStyle = `hsl(350, 95%, ${62 + audio.bass * 25}%)`;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(pS * 1.35, 0);
  ctx.lineTo(pS * 0.2, pS * 0.5 + finFlare);
  ctx.lineTo(-pS * 0.35, pS * 0.85 + finFlare);
  ctx.lineTo(-pS * 0.2, pS * 0.35);
  ctx.lineTo(-pS * 1.3, pS * 0.45);
  ctx.lineTo(-pS * 0.95, 0);
  ctx.lineTo(-pS * 1.3, -pS * 0.45);
  ctx.lineTo(-pS * 0.2, -pS * 0.35);
  ctx.lineTo(-pS * 0.35, -pS * 0.85 - finFlare);
  ctx.lineTo(pS * 0.2, -pS * 0.5 - finFlare);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing predator core
  ctx.beginPath();
  ctx.arc(pS * 0.45, 0, 3 + audio.treble * 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff3355';
  ctx.fill();
  ctx.restore();
}

// Particle bursts
for (let pIdx = room.state.particles.length - 1; pIdx >= 0; pIdx--) {
  const p = room.state.particles[pIdx];
  p.x += p.vx;
  p.y += p.vy;
  p.vx *= 0.94;
  p.vy *= 0.94;
  p.life -= dt * 1.8;
  if (p.life <= 0) {
    room.state.particles.splice(pIdx, 1);
    continue;
  }
  ctx.save();
  ctx.fillStyle = `hsla(${p.hue}, 95%, 62%, ${p.life})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, (p.size || 2.5) * p.life, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
if (room.state.particles.length > 60) {
  room.state.particles.splice(0, room.state.particles.length - 60);
}

// Minimalist Season Gauge HUD
ctx.save();
ctx.font = '11px monospace';
ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
ctx.fillText(`${curSeason.name}  •  ${(seasonPhase * 60).toFixed(0)}s`, 22, 28);
ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
ctx.fillRect(22, 34, 90, 3);
ctx.fillStyle = `hsl(${foodHue}, 80%, 65%)`;
ctx.fillRect(22, 34, 90 * seasonPhase, 3);
ctx.restore();