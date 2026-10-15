const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// 1. Controls & Palettes
const filamentStyle = getVar('filament_style') ?? 'Tungsten Coil';
const colorTemp = getVar('color_temp') ?? 'Vintage Amber';
const glowReach = getVar('glow_reach') ?? 1.2;
const swayAmt = getVar('sway_intensity') ?? 0.4;
const showDust = getVar('dust_motes') ?? true;

const PALETTES = {
  'Vintage Amber':   { h: 32,  sat: 96,  emberH: 14,  rimAlpha: 0.25 },
  'Golden Hearth':   { h: 42,  sat: 98,  emberH: 22,  rimAlpha: 0.35 },
  'Sodium Vapor':    { h: 50,  sat: 100, emberH: 28,  rimAlpha: 0.40 },
  'Prismatic Glass': { h: 180, sat: 80,  emberH: 310, rimAlpha: 0.45 }
};
const pal = PALETTES[colorTemp] ?? PALETTES['Vintage Amber'];

// 2. Persistent State Setup (Demoscene buffers, LUTs, zero alloc in hot loop)
if (!room.state.init) {
  room.state.init = true;
  room.state.maxBulbs = 36;
  room.state.bulbs = [];
  room.state.pulses = [];
  room.state.dust = [];
  room.state.bassFollower = 0;

  // Pre-seed fixed bulb positions with multi-plane depth
  for (let i = 0; i < room.state.maxBulbs; i++) {
    const row = Math.floor(i / 12);
    const col = i % 12;
    const z = 0.45 + (i * 0.19) % 0.55; // 0.45 to 1.0 depth
    const jitterX = Math.sin(i * 997.3) * 0.05;
    const jitterY = Math.cos(i * 433.7) * 0.07;
    room.state.bulbs.push({
      u: (col + 0.5 + jitterX) / 12,
      v: 0.22 + row * 0.24 + jitterY,
      z,
      cordLen: 0.15 + (i * 0.07) % 0.26,
      heartPhase: (i * 1.618) % (Math.PI * 2),
      heartRate: 0.7 + (i % 5) * 0.15,
      energy: 0.1,
      swayPhase: i * 0.93,
      personId: null,
      customHue: null
    });
  }

  // Sort bulbs back to front once for correct draw order
  room.state.bulbs.sort((a, b) => a.z - b.z);

  // Pre-seed dust motes
  for (let i = 0; i < 70; i++) {
    room.state.dust.push({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.015,
      vy: -0.01 - Math.random() * 0.015,
      size: 0.8 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2
    });
  }

  // Pre-render glow sprite onto OffscreenCanvas (fast stamp)
  const gSize = 256;
  const off = new OffscreenCanvas(gSize, gSize);
  const octx = off.getContext('2d');
  const grad = octx.createRadialGradient(gSize / 2, gSize / 2, 2, gSize / 2, gSize / 2, gSize / 2);
  grad.addColorStop(0, 'rgba(255,245,210,1)');
  grad.addColorStop(0.18, 'rgba(255,170,40,0.6)');
  grad.addColorStop(0.5, 'rgba(230,70,10,0.18)');
  grad.addColorStop(1, 'rgba(120,20,0,0)');
  octx.fillStyle = grad;
  octx.fillRect(0, 0, gSize, gSize);
  room.state.glowSprite = off;
}

// 3. Audio & Music integration
room.state.bassFollower += ((audio?.bass ?? 0) - room.state.bassFollower) * Math.min(1, dt * 14);
const bass = room.state.bassFollower;
const isBeat = !!audio?.beat;

// 4. Map active connected room people to bulbs
const people = room.people || [];
for (let i = 0; i < room.state.bulbs.length; i++) {
  const bulb = room.state.bulbs[i];
  if (i < people.length) {
    bulb.personId = people[i].id;
    bulb.customHue = people[i].hue;
  } else {
    bulb.personId = null;
    bulb.customHue = null;
  }
}

// 5. Handle Room Events (Triggers & Ripples)
const events = room.events || [];
for (let e = 0; e < events.length; e++) {
  const ev = events[e];
  let sourceBulb = null;
  if (ev.participantId) {
    sourceBulb = room.state.bulbs.find(b => b.personId === ev.participantId);
  }
  if (!sourceBulb) {
    // Pick random prominent bulb
    sourceBulb = room.state.bulbs[Math.floor(Math.random() * room.state.bulbs.length)];
  }

  if (ev.name === 'surge' || ev.name === 'cascade') {
    sourceBulb.energy = 2.8;
    if (room.state.pulses.length < 18) {
      room.state.pulses.push({
        x: sourceBulb.u * W,
        y: sourceBulb.v * H,
        r: 10,
        maxR: ev.name === 'cascade' ? W * 1.1 : W * 0.55,
        speed: ev.name === 'cascade' ? 520 : 420,
        hue: sourceBulb.customHue ?? pal.h,
        power: ev.name === 'cascade' ? 2.5 : 1.6
      });
    }
  }
}

// Automatic gentle ripple on strong audio drop
if (isBeat && room.state.pulses.length < 12 && bass > 0.4) {
  const randomBulb = room.state.bulbs[Math.floor(Math.random() * room.state.bulbs.length)];
  randomBulb.energy = Math.min(2.5, randomBulb.energy + 1.2);
  room.state.pulses.push({
    x: randomBulb.u * W,
    y: randomBulb.v * H,
    r: 8,
    maxR: W * 0.35,
    speed: 360,
    hue: randomBulb.customHue ?? pal.h,
    power: 0.9
  });
}

// 6. Update Active Ripples
for (let i = room.state.pulses.length - 1; i >= 0; i--) {
  const p = room.state.pulses[i];
  p.r += p.speed * dt;
  p.power *= Math.max(0, 1 - dt * 0.75);

  // Propagate energy into intersecting bulbs
  for (let b = 0; b < room.state.bulbs.length; b++) {
    const bulb = room.state.bulbs[b];
    const bx = bulb.u * W;
    const by = bulb.v * H;
    const dist = Math.hypot(bx - p.x, by - p.y);
    if (Math.abs(dist - p.r) < 32) {
      bulb.energy = Math.min(2.6, bulb.energy + p.power * dt * 7.0);
    }
  }

  if (p.r >= p.maxR || p.power < 0.05) {
    room.state.pulses.splice(i, 1);
  }
}

// 7. Background: Pure deep velvet black with subtle ambient filament warmth
ctx.save();
ctx.fillStyle = '#050302';
ctx.fillRect(0, 0, W, H);

// Top architectural conduit / darkness gradient
const ceilingGrad = ctx.createLinearGradient(0, 0, 0, H * 0.28);
ceilingGrad.addColorStop(0, '#000000');
ceilingGrad.addColorStop(1, 'rgba(6,3,2,0)');
ctx.fillStyle = ceilingGrad;
ctx.fillRect(0, 0, W, H * 0.28);

// 8. Draw Expanding Wavefronts (additive glow rings)
ctx.globalCompositeOperation = 'screen';
for (let i = 0; i < room.state.pulses.length; i++) {
  const p = room.state.pulses[i];
  const alpha = Math.min(0.65, p.power * 0.45);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${p.hue}, 90%, 55%, ${alpha})`;
  ctx.lineWidth = 4 + (p.power * 5);
  ctx.stroke();
}

// 9. Update & Draw Bulbs (sorted from back to front)
for (let i = 0; i < room.state.bulbs.length; i++) {
  const b = room.state.bulbs[i];

  // Heartbeat pulsing math
  b.heartPhase += dt * b.heartRate * (2.8 + bass * 2.2);
  const rawPulse = Math.sin(b.heartPhase);
  const beatKick = Math.max(0, rawPulse * rawPulse * rawPulse);

  // Decay burst energy
  b.energy = Math.max(0, b.energy - dt * 1.8);
  const totalHeat = Math.min(2.8, 0.28 + beatKick * 0.45 + (bass * 0.4) + b.energy);

  // Pendulum sway
  const swayPhase = t * 1.2 * (0.8 + b.z * 0.4) + b.swayPhase;
  const swayX = Math.sin(swayPhase) * (14 * swayAmt * (1.2 - b.z * 0.5));
  const swayAngle = Math.sin(swayPhase) * (0.045 * swayAmt);

  const bx = b.u * W + swayX;
  const by = b.v * H;
  const cordTopX = b.u * W;
  const cordTopY = 0;
  const scale = 0.55 + b.z * 0.65; // depth scaling

  // Color calculations based on heat & palette
  const currentHue = (b.customHue !== null) ? b.customHue : pal.h;
  const bulbWarmth = Math.min(1, totalHeat * 0.65);
  const filamentLight = 40 + bulbWarmth * 55;
  const coreColor = `hsl(${currentHue}, 100%, ${filamentLight}%)`;
  const auraAlpha = Math.min(0.85, (0.18 + bulbWarmth * 0.6) * b.z);

  // A. Cord (hangs from ceiling)
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(32, 24, 18, ${0.4 + b.z * 0.5})`;
  ctx.lineWidth = Math.max(1, 1.8 * scale);
  ctx.beginPath();
  ctx.moveTo(cordTopX, cordTopY);
  ctx.quadraticCurveTo(cordTopX, by * 0.5, bx, by - 38 * scale);
  ctx.stroke();

  // B. Bulb Transform
  ctx.translate(bx, by);
  ctx.rotate(swayAngle);

  // C. Socket (brass fixture atop glass)
  const sockW = 14 * scale;
  const sockH = 16 * scale;
  ctx.fillStyle = `rgb(${70 + b.z * 40}, ${50 + b.z * 30}, ${30 + b.z * 15})`;
  ctx.fillRect(-sockW / 2, -38 * scale, sockW, sockH);
  // Little ridged ring on socket
  ctx.fillStyle = `rgb(${100 + b.z * 50}, ${75 + b.z * 35}, ${40 + b.z * 20})`;
  ctx.fillRect(-sockW * 0.6, -30 * scale, sockW * 1.2, 4 * scale);

  // D. Large Radial Warm Glow Halo (Additive Sprite Blit)
  ctx.globalCompositeOperation = 'screen';
  const spriteDiam = (160 + totalHeat * 140) * scale * glowReach;
  ctx.globalAlpha = auraAlpha;
  ctx.drawImage(
    room.state.glowSprite,
    -spriteDiam / 2,
    -spriteDiam / 2,
    spriteDiam,
    spriteDiam
  );

  // E. Glass Bulb Envelope
  const bulbR = 24 * scale;
  ctx.globalCompositeOperation = 'screen';
  ctx.beginPath();
  // Edison teardrop geometry
  ctx.moveTo(-9 * scale, -22 * scale);
  ctx.bezierCurveTo(-14 * scale, -10 * scale, -bulbR, 0, -bulbR, 12 * scale);
  ctx.bezierCurveTo(-bulbR, 32 * scale, bulbR, 32 * scale, bulbR, 12 * scale);
  ctx.bezierCurveTo(bulbR, 0, 14 * scale, -10 * scale, 9 * scale, -22 * scale);
  ctx.closePath();

  // Warm internal volume tint
  ctx.fillStyle = `hsla(${currentHue}, 85%, 50%, ${0.08 + totalHeat * 0.16})`;
  ctx.fill();

  // Subtle glass contour highlight
  ctx.strokeStyle = `hsla(${currentHue}, 70%, 75%, ${pal.rimAlpha * b.z})`;
  ctx.lineWidth = 1.4 * scale;
  ctx.stroke();

  // Glossy rim reflection
  ctx.beginPath();
  ctx.arc(-bulbR * 0.45, 8 * scale, bulbR * 0.4, -Math.PI * 0.7, -Math.PI * 0.2);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + totalHeat * 0.25})`;
  ctx.lineWidth = 2 * scale;
  ctx.stroke();

  // F. Tungsten Coiled Filament (Draw style variations)
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = Math.max(1.2, (1.6 + totalHeat * 1.2) * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  // Lead support wires
  ctx.moveTo(-6 * scale, -20 * scale);
  ctx.lineTo(-5 * scale, 0);
  ctx.moveTo(6 * scale, -20 * scale);
  ctx.lineTo(5 * scale, 0);
  ctx.stroke();

  // Glowing heated filament path
  ctx.beginPath();
  if (filamentStyle === 'Tungsten Coil') {
    // Zigzag squirrel cage coil
    ctx.moveTo(-5 * scale, 0);
    ctx.lineTo(-7 * scale, 16 * scale);
    ctx.lineTo(-2 * scale, 2 * scale);
    ctx.lineTo(0, 18 * scale);
    ctx.lineTo(2 * scale, 2 * scale);
    ctx.lineTo(7 * scale, 16 * scale);
    ctx.lineTo(5 * scale, 0);
  } else if (filamentStyle === 'Edison Cage') {
    // Arch loop
    ctx.moveTo(-5 * scale, 0);
    ctx.bezierCurveTo(-9 * scale, 22 * scale, 9 * scale, 22 * scale, 5 * scale, 0);
    ctx.moveTo(-3 * scale, 0);
    ctx.bezierCurveTo(-5 * scale, 15 * scale, 5 * scale, 15 * scale, 3 * scale, 0);
  } else {
    // Loop Spiral
    ctx.moveTo(-5 * scale, 0);
    ctx.quadraticCurveTo(-12 * scale, 14 * scale, 0, 16 * scale);
    ctx.quadraticCurveTo(12 * scale, 18 * scale, 0, 4 * scale);
    ctx.quadraticCurveTo(-8 * scale, 6 * scale, 5 * scale, 0);
  }
  ctx.stroke();

  // Super-hot filament core bloom (white center when surging)
  if (totalHeat > 0.8) {
    ctx.strokeStyle = `rgba(255, 255, 240, ${Math.min(1, (totalHeat - 0.7) * 0.9)})`;
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.stroke();
  }

  // Connected Person Crown Indicator (tiny elegant ring on bulb socket)
  if (b.personId) {
    ctx.beginPath();
    ctx.arc(0, -42 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${currentHue}, 90%, 65%)`;
    ctx.fill();
  }

  ctx.restore();
}

// 10. Floating Dust Motes (illuminated as they drift through golden light)
if (showDust) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < room.state.dust.length; i++) {
    const d = room.state.dust[i];
    d.x += d.vx * dt * 60 + Math.sin(t * 0.5 + d.phase) * 0.0003;
    d.y += d.vy * dt * 60;
    if (d.y < -0.05) d.y = 1.05;
    if (d.x < -0.05) d.x = 1.05;
    if (d.x > 1.05) d.x = -0.05;

    const dx = d.x * W;
    const dy = d.y * H;

    // Test proximity to nearest bulb for illumination intensity
    let lit = 0.08;
    for (let b = 0; b < room.state.bulbs.length; b += 2) {
      const bulb = room.state.bulbs[b];
      const distSq = (dx - bulb.u * W) ** 2 + (dy - bulb.v * H) ** 2;
      if (distSq < 18000) {
        lit += (1 - distSq / 18000) * (0.6 + bulb.energy);
      }
    }

    const moteAlpha = Math.min(0.65, lit * (0.5 + Math.sin(t * 2 + d.phase) * 0.25));
    ctx.fillStyle = `hsla(${pal.h}, 90%, 75%, ${moteAlpha})`;
    ctx.beginPath();
    ctx.arc(dx, dy, d.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 11. Subtle cinematic vignetting
ctx.save();
const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.35, W * 0.5, H * 0.5, W * 0.72);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(0,0,0,0.55)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);
ctx.restore();