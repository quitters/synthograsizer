const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// 1. Parameter lookups
const moods = {
  'Midnight Ink': { bg0: '#02050e', bg1: '#060f24', waterHue: 215, tint: 'rgba(10,30,60,' },
  'Bioluminescent Lagoon': { bg0: '#01090d', bg1: '#031e24', waterHue: 175, tint: 'rgba(5,45,55,' },
  'Emerald Murk': { bg0: '#010a05', bg1: '#041f12', waterHue: 145, tint: 'rgba(8,40,25,' },
  'Deep Amethyst': { bg0: '#08020e', bg1: '#1b0528', waterHue: 280, tint: 'rgba(35,10,50,' }
};
const mood = moods[getVar('water_mood')] ?? moods['Midnight Ink'];
const scaleMod = getVar('koi_scale') ?? 1.0;
const padTargetCount = getVar('lily_density') ?? 14;
const showCaustics = getVar('caustics') ?? true;
const spiritGlow = getVar('spirit_glow') ?? true;

// 2. Persistent State Initialization
room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  room.state.fish = [];
  room.state.pads = [];
  room.state.food = [];
  room.state.ripples = [];
  room.state.flies = [];
  for (let i = 0; i < 28; i++) {
    room.state.pads.push({
      u: 0.08 + 0.84 * ((i * 0.173 + 0.05) % 1),
      v: 0.08 + 0.84 * ((i * 0.317 + 0.12) % 1),
      r: 32 + (i * 13) % 48,
      rot: (i * 1.37) % (Math.PI * 2),
      notch: 0.35 + ((i * 0.2) % 0.4),
      flower: i % 4 === 0,
      hue: (i * 65) % 360,
      driftSeed: i * 2.7
    });
  }
  for (let i = 0; i < 24; i++) {
    room.state.flies.push({
      u: Math.random(),
      v: Math.random(),
      seed: Math.random() * 100,
      size: 1.5 + Math.random() * 2.5
    });
  }
}

// 3. Audio accents
const bass = audio.bass || 0;
const beat = audio.beat || false;
const treble = audio.treble || 0;

// 4. Handle incoming triggers & food scattering
if (room.events) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'feed') {
      const p = room.people ? room.people.find(x => x.id === ev.participantId) : null;
      const feedHue = p ? p.hue : (Math.random() * 360);
      const cx = (0.2 + 0.6 * Math.random()) * W;
      const cy = (0.2 + 0.6 * Math.random()) * H;
      room.state.ripples.push({ x: cx, y: cy, r: 4, maxR: 180 + Math.random() * 80, hue: feedHue, a: 0.9 });
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        const dist = Math.random() * 45;
        room.state.food.push({
          x: cx + Math.cos(a) * dist,
          y: cy + Math.sin(a) * dist,
          vx: Math.cos(a) * 12,
          vy: Math.sin(a) * 12,
          life: 7.0 + Math.random() * 3,
          maxLife: 10,
          hue: feedHue
        });
      }
    }
  }
}

// Beat-induced ambient pond ripple
if (beat && Math.random() < 0.65) {
  room.state.ripples.push({
    x: (0.1 + Math.random() * 0.8) * W,
    y: (0.1 + Math.random() * 0.8) * H,
    r: 2,
    maxR: 90 + bass * 120,
    hue: mood.waterHue,
    a: 0.4 + bass * 0.4
  });
}
if (room.state.ripples.length > 35) room.state.ripples.splice(0, room.state.ripples.length - 35);
if (room.state.food.length > 50) room.state.food.splice(0, room.state.food.length - 50);

// 5. Build/Sync fish list: exactly one per person, or ambient if empty/small
const attendees = (room.people && room.people.length > 0) ? room.people : [
  { id: 'ambient_1', hue: 28 },
  { id: 'ambient_2', hue: 195 },
  { id: 'ambient_3', hue: 340 },
  { id: 'ambient_4', hue: 140 }
];

const fishList = room.state.fish;
// Retain matching, prune leaving
for (let i = fishList.length - 1; i >= 0; i--) {
  if (!attendees.some(p => p.id === fishList[i].id)) {
    fishList.splice(i, 1);
  }
}
// Add newly joined
for (let i = 0; i < attendees.length; i++) {
  const p = attendees[i];
  if (!fishList.some(f => f.id === p.id)) {
    const fx = (0.2 + 0.6 * Math.random()) * W;
    const fy = (0.2 + 0.6 * Math.random()) * H;
    const segs = [];
    for (let s = 0; s < 12; s++) segs.push({ x: fx - s * 8, y: fy });
    fishList.push({
      id: p.id,
      hue: p.hue,
      x: fx,
      y: fy,
      vx: 0,
      vy: 0,
      angle: Math.random() * Math.PI * 2,
      turnSpeed: 0,
      speed: 70,
      phase: Math.random() * 10,
      segs: segs,
      hunger: 0
    });
  } else {
    // keep hue updated in case person altered profile
    const f = fishList.find(x => x.id === p.id);
    if (f) f.hue = p.hue;
  }
}

// 6. Water Background with deep radial illumination
ctx.save();
const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
bgGrad.addColorStop(0, mood.bg1);
bgGrad.addColorStop(1, mood.bg0);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// 7. Water Caustics (procedural wave mesh)
if (showCaustics) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = 1.2;
  const causticAlpha = 0.04 + treble * 0.08;
  ctx.strokeStyle = `hsla(${mood.waterHue}, 80%, 70%, ${causticAlpha})`;
  const stepY = 48;
  const stepX = 40;
  for (let y = 10; y < H; y += stepY) {
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += stepX) {
      const wave1 = Math.sin(x * 0.015 + y * 0.01 + t * 0.8) * 9;
      const wave2 = Math.cos(x * 0.02 - y * 0.018 - t * 0.6) * 7;
      const py = y + wave1 + wave2;
      if (x === -20) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// 8. Update and Draw Food Pellets
ctx.save();
for (let i = room.state.food.length - 1; i >= 0; i--) {
  const fd = room.state.food[i];
  fd.life -= dt;
  fd.x += fd.vx * dt;
  fd.y += fd.vy * dt;
  fd.vx *= 0.94;
  fd.vy *= 0.94;
  if (fd.life <= 0) {
    room.state.food.splice(i, 1);
    continue;
  }
  const progress = fd.life / fd.maxLife;
  const sz = 2.5 + Math.sin(t * 8 + i) * 0.8;
  ctx.fillStyle = `hsla(${fd.hue}, 100%, 75%, ${Math.min(1, progress * 1.5)})`;
  ctx.shadowColor = `hsl(${fd.hue}, 100%, 55%)`;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(fd.x, fd.y, sz, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 9. Update & Draw Ripples
ctx.save();
for (let i = room.state.ripples.length - 1; i >= 0; i--) {
  const rp = room.state.ripples[i];
  rp.r += 65 * dt;
  rp.a -= 0.45 * dt;
  if (rp.r >= rp.maxR || rp.a <= 0) {
    room.state.ripples.splice(i, 1);
    continue;
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = `hsla(${rp.hue}, 85%, 65%, ${Math.max(0, rp.a)})`;
  ctx.beginPath();
  ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
  ctx.stroke();
  // Subtle inner echo
  if (rp.r > 18) {
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `hsla(${rp.hue}, 70%, 55%, ${Math.max(0, rp.a * 0.5)})`;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, rp.r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }
}
ctx.restore();

// 10. Update & Draw Koi
const segDist = 9 * scaleMod;
const segCount = 11;
const bodyRadii = [13, 15, 14.5, 13, 11, 9, 7.5, 6, 4.5, 3.2, 2.0];

for (let fi = 0; fi < fishList.length; fi++) {
  const k = fishList[fi];
  k.phase += dt * (3.5 + (k.speed / 60));

  // Steering target: seek nearest food pellet, else wander smoothly
  let targetX = W * 0.5 + Math.sin(t * 0.35 + fi * 1.7) * (W * 0.38);
  let targetY = H * 0.5 + Math.cos(t * 0.28 + fi * 2.1) * (H * 0.38);
  let seekingFood = false;
  let nearestDist = 99999;

  for (let j = 0; j < room.state.food.length; j++) {
    const fd = room.state.food[j];
    const d = Math.hypot(fd.x - k.x, fd.y - k.y);
    if (d < nearestDist && d < 650) {
      nearestDist = d;
      targetX = fd.x;
      targetY = fd.y;
      seekingFood = true;
      if (d < 16) {
        // Fish eats pellet
        fd.life = 0;
        room.state.ripples.push({ x: fd.x, y: fd.y, r: 2, maxR: 50, hue: k.hue, a: 0.8 });
      }
    }
  }

  // Margin avoidance
  const edgeMargin = 120;
  if (k.x < edgeMargin) targetX += 200;
  if (k.x > W - edgeMargin) targetX -= 200;
  if (k.y < edgeMargin) targetY += 200;
  if (k.y > H - edgeMargin) targetY -= 200;

  // Angle towards target
  const desiredAngle = Math.atan2(targetY - k.y, targetX - k.x);
  let angleDiff = desiredAngle - k.angle;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

  const maxTurn = seekingFood ? 4.2 : 2.0;
  k.angle += Math.max(-maxTurn, Math.min(maxTurn, angleDiff)) * dt * 2.8;

  const targetSpeed = (seekingFood ? 140 : 65) + bass * 40;
  k.speed += (targetSpeed - k.speed) * dt * 2.5;

  k.x += Math.cos(k.angle) * k.speed * dt;
  k.y += Math.sin(k.angle) * k.speed * dt;

  // First segment is the head
  k.segs[0].x = k.x;
  k.segs[0].y = k.y;

  // Segment kinematics (inverse kinematics trailing)
  for (let s = 1; s < segCount; s++) {
    const prev = k.segs[s - 1];
    const curr = k.segs[s];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const d = Math.hypot(dx, dy) || 0.001;
    // Natural fish wiggle amplitude increases toward tail
    const wiggleOffset = Math.sin(k.phase - s * 0.55) * (s * 0.85 * scaleMod);
    const angleToPrev = Math.atan2(dy, dx);
    const normX = -Math.sin(angleToPrev) * wiggleOffset * dt * 3;
    const normY = Math.cos(angleToPrev) * wiggleOffset * dt * 3;

    curr.x = prev.x + (dx / d) * segDist + normX;
    curr.y = prev.y + (dy / d) * segDist + normY;
  }

  // Draw Spirit Glow Trail
  if (spiritGlow) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const tailEnd = k.segs[segCount - 1];
    const glowGrad = ctx.createRadialGradient(k.x, k.y, 4, k.x, k.y, 90 * scaleMod);
    glowGrad.addColorStop(0, `hsla(${k.hue}, 100%, 65%, 0.35)`);
    glowGrad.addColorStop(1, `hsla(${k.hue}, 90%, 40%, 0)`);
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(k.x, k.y, 90 * scaleMod, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw Fish Body Contours
  ctx.save();
  const spine = k.segs;
  const leftPts = [];
  const rightPts = [];

  for (let s = 0; s < segCount; s++) {
    const pCurr = spine[s];
    const pNext = spine[s < segCount - 1 ? s + 1 : s];
    const pPrev = spine[s > 0 ? s - 1 : s];
    const heading = Math.atan2(pNext.y - pPrev.y, pNext.x - pPrev.x);
    const norm = heading + Math.PI * 0.5;
    const r = bodyRadii[s] * scaleMod;
    leftPts.push({ x: pCurr.x + Math.cos(norm) * r, y: pCurr.y + Math.sin(norm) * r });
    rightPts.push({ x: pCurr.x - Math.cos(norm) * r, y: pCurr.y - Math.sin(norm) * r });
  }

  // Pectoral Fins (attached at segment 2)
  const finBase = spine[2];
  const finAngle = Math.atan2(spine[1].y - spine[3].y, spine[1].x - spine[3].x);
  const finSweep = Math.sin(k.phase * 1.2) * 0.25;
  for (let side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.fillStyle = `hsla(${k.hue}, 95%, 72%, 0.45)`;
    ctx.beginPath();
    const rootX = finBase.x + Math.cos(finAngle + side * 1.5) * (13 * scaleMod);
    const rootY = finBase.y + Math.sin(finAngle + side * 1.5) * (13 * scaleMod);
    const tipX = rootX + Math.cos(finAngle + side * (1.8 + finSweep)) * (24 * scaleMod);
    const tipY = rootY + Math.sin(finAngle + side * (1.8 + finSweep)) * (24 * scaleMod);
    const controlX = rootX + Math.cos(finAngle + side * 1.1) * (18 * scaleMod);
    const controlY = rootY + Math.sin(finAngle + side * 1.1) * (18 * scaleMod);
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(controlX, controlY, tipX, tipY);
    ctx.quadraticCurveTo(rootX - side * 4, rootY + 6, rootX, rootY);
    ctx.fill();
    ctx.restore();
  }

  // Caudal/Tail Fin
  const tBase = spine[segCount - 1];
  const tPrev = spine[segCount - 2];
  const tAngle = Math.atan2(tBase.y - tPrev.y, tBase.x - tPrev.x);
  ctx.save();
  ctx.fillStyle = `hsla(${k.hue}, 90%, 65%, 0.55)`;
  ctx.beginPath();
  const tTip1X = tBase.x + Math.cos(tAngle + 0.5 + Math.sin(k.phase) * 0.2) * (30 * scaleMod);
  const tTip1Y = tBase.y + Math.sin(tAngle + 0.5 + Math.sin(k.phase) * 0.2) * (30 * scaleMod);
  const tTip2X = tBase.x + Math.cos(tAngle - 0.5 + Math.sin(k.phase) * 0.2) * (30 * scaleMod);
  const tTip2Y = tBase.y + Math.sin(tAngle - 0.5 + Math.sin(k.phase) * 0.2) * (30 * scaleMod);
  const tMidX = tBase.x + Math.cos(tAngle) * (18 * scaleMod);
  const tMidY = tBase.y + Math.sin(tAngle) * (18 * scaleMod);
  ctx.moveTo(tBase.x, tBase.y);
  ctx.quadraticCurveTo(tBase.x, tBase.y, tTip1X, tTip1Y);
  ctx.quadraticCurveTo(tMidX, tMidY, tTip2X, tTip2Y);
  ctx.quadraticCurveTo(tBase.x, tBase.y, tBase.x, tBase.y);
  ctx.fill();
  ctx.restore();

  // Main Torso Path
  ctx.beginPath();
  ctx.moveTo(leftPts[0].x, leftPts[0].y);
  for (let s = 1; s < segCount; s++) ctx.lineTo(leftPts[s].x, leftPts[s].y);
  ctx.quadraticCurveTo(spine[segCount - 1].x, spine[segCount - 1].y, rightPts[segCount - 1].x, rightPts[segCount - 1].y);
  for (let s = segCount - 2; s >= 0; s--) ctx.lineTo(rightPts[s].x, rightPts[s].y);
  ctx.closePath();

  // Bioluminescent Gradient Fill along body
  const headGrad = ctx.createLinearGradient(spine[0].x, spine[0].y, spine[segCount - 1].x, spine[segCount - 1].y);
  headGrad.addColorStop(0, `hsla(${k.hue}, 95%, 88%, 0.95)`);
  headGrad.addColorStop(0.35, `hsla(${k.hue}, 90%, 60%, 0.9)`);
  headGrad.addColorStop(0.7, `hsla(${(k.hue + 20) % 360}, 85%, 45%, 0.8)`);
  headGrad.addColorStop(1, `hsla(${k.hue}, 80%, 30%, 0.6)`);

  ctx.fillStyle = headGrad;
  ctx.shadowColor = `hsla(${k.hue}, 100%, 65%, 0.85)`;
  ctx.shadowBlur = 16 * scaleMod;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Body markings / scales
  ctx.lineWidth = 1.2 * scaleMod;
  ctx.strokeStyle = `hsla(${k.hue}, 100%, 92%, 0.7)`;
  for (let s = 1; s < 7; s += 2) {
    ctx.beginPath();
    ctx.arc(spine[s].x, spine[s].y, (bodyRadii[s] - 3.5) * scaleMod, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Eyes
  const eyeAngle = Math.atan2(spine[0].y - spine[1].y, spine[0].x - spine[1].x);
  for (let side = -1; side <= 1; side += 2) {
    const eyeX = spine[0].x + Math.cos(eyeAngle + side * 1.2) * (7 * scaleMod);
    const eyeY = spine[0].y + Math.sin(eyeAngle + side * 1.2) * (7 * scaleMod);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 1.8 * scaleMod, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#050b14';
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 0.9 * scaleMod, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// 11. Draw Layered Lily Pads with cast shadows (creating underwater depth!)
const padCount = Math.min(room.state.pads.length, Math.floor(padTargetCount));
for (let i = 0; i < padCount; i++) {
  const pad = room.state.pads[i];
  // Gentle floating drift
  const driftX = Math.sin(t * 0.4 + pad.driftSeed) * 12;
  const driftY = Math.cos(t * 0.32 + pad.driftSeed * 1.3) * 10;
  const px = pad.u * W + driftX;
  const py = pad.v * H + driftY;
  const pr = pad.r * scaleMod;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(pad.rot + Math.sin(t * 0.15 + pad.driftSeed) * 0.05);

  // Pad Shadow cast down into the water (makes koi glide UNDER pads)
  ctx.save();
  ctx.translate(14, 18);
  ctx.fillStyle = 'rgba(1, 4, 10, 0.65)';
  ctx.beginPath();
  ctx.arc(0, 0, pr * 0.98, pad.notch, Math.PI * 2 - pad.notch);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Pad Outer Body
  ctx.beginPath();
  ctx.arc(0, 0, pr, pad.notch, Math.PI * 2 - pad.notch);
  ctx.lineTo(0, 0);
  ctx.closePath();

  // Pad Gradient
  const padGrad = ctx.createRadialGradient(-pr * 0.2, -pr * 0.2, 2, 0, 0, pr);
  padGrad.addColorStop(0, '#1c4d2d');
  padGrad.addColorStop(0.7, '#0f331c');
  padGrad.addColorStop(1, '#071c10');
  ctx.fillStyle = padGrad;
  ctx.fill();

  // Pad Rim & Veins
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#2d7345';
  ctx.stroke();

  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(70, 160, 100, 0.35)';
  for (let v = 0; v < 6; v++) {
    const va = pad.notch + 0.3 + v * ((Math.PI * 2 - pad.notch * 2 - 0.6) / 5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(
      Math.cos(va + 0.15) * (pr * 0.5),
      Math.sin(va + 0.15) * (pr * 0.5),
      Math.cos(va) * (pr * 0.92),
      Math.sin(va) * (pr * 0.92)
    );
    ctx.stroke();
  }

  // Lily Pad Lotus Flower (on selected pads)
  if (pad.flower) {
    ctx.save();
    const fHue = pad.hue;
    const fPulse = 1.0 + Math.sin(t * 1.5 + pad.driftSeed) * 0.08;
    ctx.shadowColor = `hsla(${fHue}, 90%, 75%, 0.8)`;
    ctx.shadowBlur = 12;
    for (let pet = 0; pet < 8; pet++) {
      const pa = (pet / 8) * Math.PI * 2 + t * 0.05;
      const petalDist = 7 * fPulse;
      const ptx = Math.cos(pa) * petalDist;
      const pty = Math.sin(pa) * petalDist;
      ctx.fillStyle = `hsla(${fHue}, 80%, ${82 - pet * 2}%, 0.85)`;
      ctx.beginPath();
      ctx.ellipse(ptx, pty, 4.5 * fPulse, 8.5 * fPulse, pa, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flower center
    ctx.fillStyle = '#fffae0';
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// 12. Floating Night Fireflies / Water Embers
ctx.save();
ctx.globalCompositeOperation = 'screen';
for (let i = 0; i < room.state.flies.length; i++) {
  const fl = room.state.flies[i];
  const fx = ((fl.u * W + Math.sin(t * 0.7 + fl.seed) * 60) + W) % W;
  const fy = ((fl.v * H + Math.cos(t * 0.5 + fl.seed * 1.4) * 45) + H) % H;
  const glow = 0.3 + 0.7 * Math.pow(Math.sin(t * 2.2 + fl.seed), 2);
  const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fl.size * 6);
  grad.addColorStop(0, `rgba(210, 255, 170, ${glow})`);
  grad.addColorStop(0.4, `rgba(130, 240, 150, ${glow * 0.4})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(fx, fy, fl.size * 6, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 13. Deep Vignette to focus wall projection
ctx.save();
const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.45, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(0,3,8,0.72)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);
ctx.restore();