const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// 1. Controls & Palettes
const moodKey = getVar('sky_mood') ?? 'Midnight Indigo';
const targetCount = getVar('lantern_density') ?? 100;
const wind = getVar('wind_drift') ?? 0.5;
const glowScale = getVar('glow_size') ?? 2;
const showWater = getVar('lake_reflection') ?? true;

const skies = {
  'Midnight Indigo': { top: '#02040b', mid: '#081226', low: '#16233b', ember: 36 },
  'Dusk Amethyst':   { top: '#05020c', mid: '#1a0d2a', low: '#301844', ember: 28 },
  'Deep Obsidian':   { top: '#010102', mid: '#06070a', low: '#10141b', ember: 42 },
  'Crimson Twilight':{ top: '#0a0307', mid: '#240b17', low: '#421623', ember: 22 }
};
const sky = skies[moodKey] ?? skies['Midnight Indigo'];

// 2. Persistent State Setup (bounded buffers)
room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  room.state.lanterns = [];
  room.state.stars = [];
  room.state.gust = 0;
  for (let i = 0; i < 90; i++) {
    room.state.stars.push({
      x: (Math.sin(i * 991.1) * 0.5 + 0.5),
      y: (Math.cos(i * 433.7) * 0.5 + 0.5) * 0.72,
      s: 0.6 + (i % 3) * 0.6,
      p: (i * 1.7) % 6.28
    });
  }
}

// 3. Audio & Triggers
const bassBoost = (audio?.bass ?? 0) * 1.4;
const midPulse = (audio?.mid ?? 0);
const trebleTwinkle = (audio?.treble ?? 0);

// Event handling
if (room.events) {
  for (const e of room.events) {
    if (e.name === 'updraft') {
      room.state.gust = 2.4;
    } else if (e.name === 'release') {
      const p = room.people ? room.people.find(person => person.id === e.participantId) : null;
      const userHue = p && typeof p.hue === 'number' ? p.hue : ((Math.random() * 60 + 20) | 0);
      room.state.lanterns.unshift({
        x: 0.15 + Math.random() * 0.7,
        y: 0.94,
        z: 0.85 + Math.random() * 0.15,
        hue: userHue,
        speed: 0.055 + Math.random() * 0.03,
        swaySpeed: 1.6 + Math.random() * 0.8,
        swayAmp: 0.02 + Math.random() * 0.015,
        seed: Math.random() * 6.28,
        highlight: 1.0
      });
    }
  }
}

// Updraft decay
room.state.gust = Math.max(0, (room.state.gust || 0) - dt * 1.2);
const totalUpdraft = 1 + room.state.gust + bassBoost * 0.6;

// Maintain ambient lantern population
const pool = room.state.lanterns;
while (pool.length < targetCount) {
  pool.push({
    x: Math.random(),
    y: 0.05 + Math.random() * 0.9,
    z: 0.15 + Math.random() * 0.8,
    hue: sky.ember + (Math.random() * 24 - 12),
    speed: 0.03 + Math.random() * 0.04,
    swaySpeed: 1.2 + Math.random() * 1.4,
    swayAmp: 0.012 + Math.random() * 0.018,
    seed: Math.random() * 6.28,
    highlight: 0
  });
}
if (pool.length > 200) pool.length = 200;

// 4. Update Lantern Positions
for (let i = pool.length - 1; i >= 0; i--) {
  const l = pool[i];
  l.y -= l.speed * totalUpdraft * (0.3 + l.z * 0.7) * dt;
  l.x += (wind * 0.025 * (0.2 + l.z * 0.8) + Math.cos(t * l.swaySpeed + l.seed) * l.swayAmp) * dt;
  if (l.x < -0.05) l.x = 1.05;
  if (l.x > 1.05) l.x = -0.05;
  l.highlight = Math.max(0, (l.highlight || 0) - dt * 0.4);

  // Recycle if above view
  if (l.y < -0.08) {
    if (pool.length > targetCount) {
      pool.splice(i, 1);
    } else {
      l.y = 0.92 + Math.random() * 0.06;
      l.x = Math.random();
      l.z = 0.15 + Math.random() * 0.8;
      l.hue = sky.ember + (Math.random() * 24 - 12);
      l.highlight = 0;
    }
  }
}

// 5. Draw Sky & Horizon
ctx.save();
const waterY = showWater ? H * 0.82 : H;

const skyGrad = ctx.createLinearGradient(0, 0, 0, waterY);
skyGrad.addColorStop(0, sky.top);
skyGrad.addColorStop(0.55, sky.mid);
skyGrad.addColorStop(1, sky.low);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, waterY);

// Background Stars (Subtle, responsive to treble)
ctx.fillStyle = '#ffffff';
for (let i = 0; i < room.state.stars.length; i++) {
  const s = room.state.stars[i];
  const alpha = 0.3 + 0.45 * Math.sin(t * 1.8 + s.p) + trebleTwinkle * 0.35;
  if (alpha > 0.05) {
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillRect(s.x * W, s.y * waterY, s.s, s.s);
  }
}
ctx.globalAlpha = 1;

// 6. Sort lanterns by depth z (far first)
pool.sort((a, b) => a.z - b.z);

// 7. Render Lanterns (Layered batching for speed & glow)
function drawLanternMesh(lx, ly, lz, hue, hl, isWater) {
  const baseH = (14 + lz * 32) * (isWater ? 0.7 : 1);
  const baseW = baseH * 0.72;
  const candleFlicker = 0.85 + 0.15 * Math.sin(t * 7 + lx * 11) + bassBoost * 0.25;
  const sat = isWater ? 80 : 95;
  const lit = isWater ? 48 : 58;

  // Warm outer halo
  const haloR = baseW * (1.6 * glowScale + (hl > 0 ? 1.4 : 0));
  const halo = ctx.createRadialGradient(lx, ly, baseW * 0.15, lx, ly, haloR);
  halo.addColorStop(0, `hsla(${hue}, ${sat}%, 65%, ${isWater ? 0.18 : 0.42 * candleFlicker})`);
  halo.addColorStop(0.5, `hsla(${hue}, 90%, 50%, ${isWater ? 0.08 : 0.16})`);
  halo.addColorStop(1, `hsla(${hue}, 100%, 30%, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(lx, ly, haloR, 0, 6.283);
  ctx.fill();

  // Paper Lantern Body
  ctx.save();
  ctx.translate(lx, ly);
  const swayAngle = Math.sin(t * 2.2 + ly * 0.01) * 0.07 * (1 - lz * 0.3);
  ctx.rotate(isWater ? -swayAngle * 0.4 : swayAngle);

  const hw = baseW * 0.5;
  const hh = baseH * 0.5;
  const bodyGrad = ctx.createLinearGradient(0, -hh, 0, hh);
  bodyGrad.addColorStop(0, `hsla(${hue}, 85%, ${lit * 0.75}%, 0.88)`);
  bodyGrad.addColorStop(0.65, `hsla(${hue}, 100%, ${lit}%, 0.95)`);
  bodyGrad.addColorStop(1, `hsla(${hue - 6}, 95%, ${lit * 0.55}%, 0.9)`);

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  // Subtle parabolic balloon curve
  ctx.moveTo(-hw * 0.82, -hh);
  ctx.bezierCurveTo(-hw * 1.12, -hh * 0.15, -hw * 1.05, hh * 0.6, -hw * 0.68, hh);
  ctx.lineTo(hw * 0.68, hh);
  ctx.bezierCurveTo(hw * 1.05, hh * 0.6, hw * 1.12, -hh * 0.15, hw * 0.82, -hh);
  ctx.closePath();
  ctx.fill();

  // Inner candle core flame
  ctx.fillStyle = '#fff9d6';
  ctx.beginPath();
  ctx.ellipse(0, hh * 0.62, hw * 0.32 * candleFlicker, hh * 0.22 * candleFlicker, 0, 0, 6.283);
  ctx.fill();

  // Rim wire / bottom collar
  ctx.strokeStyle = `hsla(${hue}, 70%, 20%, 0.75)`;
  ctx.lineWidth = Math.max(1, baseW * 0.08);
  ctx.beginPath();
  ctx.moveTo(-hw * 0.68, hh);
  ctx.lineTo(hw * 0.68, hh);
  ctx.stroke();

  // Participant highlight ring for recently released lantern
  if (hl > 0) {
    ctx.strokeStyle = `hsla(${hue}, 100%, 85%, ${hl * 0.8})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  ctx.restore();
}

// Render sky lanterns
for (let i = 0; i < pool.length; i++) {
  const l = pool[i];
  const px = l.x * W;
  const py = l.y * waterY;
  drawLanternMesh(px, py, l.z, l.hue, l.highlight, false);
}

// 8. Water Reflection & Horizon
if (showWater) {
  const waterH = H - waterY;
  const wGrad = ctx.createLinearGradient(0, waterY, 0, H);
  wGrad.addColorStop(0, '#02050b');
  wGrad.addColorStop(0.3, '#040b18');
  wGrad.addColorStop(1, '#010206');
  ctx.fillStyle = wGrad;
  ctx.fillRect(0, waterY, W, waterH);

  // Shimmering reflection of bottom-half lanterns
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < pool.length; i++) {
    const l = pool[i];
    if (l.y > 0.42) {
      const normDist = (l.y - 0.42) / 0.58;
      const rx = l.x * W + Math.sin(t * 4 + l.y * 30) * (4 + l.z * 12);
      const ry = waterY + (waterY - l.y * waterY) * 0.45 + (1 - l.y) * 40;
      if (ry < H + 30) {
        ctx.globalAlpha = 0.45 * normDist;
        drawLanternMesh(rx, ry, l.z * 0.85, l.hue, 0, true);
      }
    }
  }
  ctx.restore();

  // Water ripple horizontal scanlines
  ctx.strokeStyle = 'rgba(255, 210, 140, 0.08)';
  ctx.lineWidth = 1.2;
  for (let r = 0; r < 7; r++) {
    const ry = waterY + 6 + r * 9 + Math.sin(t * 2 + r) * 3;
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.lineTo(W, ry);
    ctx.stroke();
  }
}

// 9. Horizon & Silhouetted Crowd Foreground
ctx.save();
const bankY = waterY;
// Distant mountain skyline
ctx.fillStyle = '#010408';
ctx.beginPath();
ctx.moveTo(0, bankY);
ctx.lineTo(0, bankY - 32);
for (let x = 0; x <= W; x += W * 0.1) {
  const peak = Math.sin(x * 0.0035) * 26 + Math.cos(x * 0.008) * 12;
  ctx.lineTo(x, bankY - 24 - peak);
}
ctx.lineTo(W, bankY);
ctx.closePath();
ctx.fill();

// Foreground Bank & Crowd silhouettes (temple rooftops and spectators holding lanterns)
const crowdY = showWater ? waterY - 8 : H - 50;
ctx.fillStyle = '#010204';
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(0, crowdY + 12);

// Gentle undulating shore
for (let x = 0; x <= W; x += 40) {
  const bump = Math.sin(x * 0.015) * 6;
  ctx.lineTo(x, crowdY + bump);
}
ctx.lineTo(W, crowdY + 10);
ctx.lineTo(W, H);
ctx.closePath();
ctx.fill();

// Stylized crowd heads & arms releasing lights at the shore
ctx.fillStyle = '#000000';
const numPeople = Math.min(32, Math.floor(W / 45));
for (let p = 0; p < numPeople; p++) {
  const px = (p / (numPeople - 1)) * (W * 0.94) + W * 0.03;
  const py = crowdY + 4 + Math.sin(p * 3.3) * 6;
  const personH = 14 + (p % 4) * 3;
  
  // Head
  ctx.beginPath();
  ctx.arc(px, py - personH, 4.5, 0, 6.283);
  ctx.fill();
  // Shoulders / torso
  ctx.beginPath();
  ctx.ellipse(px, py - personH * 0.35, 7, personH * 0.65, 0, 0, 6.283);
  ctx.fill();

  // Occasional raised hands holding a warm ember preparing to launch
  if ((p % 5) === 1) {
    ctx.fillStyle = 'rgba(255, 170, 70, 0.85)';
    ctx.beginPath();
    ctx.arc(px + 4, py - personH - 6 + Math.sin(t * 3 + p) * 1.5, 2.5, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#000000';
  }
}
ctx.restore();

// 10. Ambient Golden Shore Wash
const shoreWash = ctx.createLinearGradient(0, crowdY - 30, 0, crowdY + 18);
shoreWash.addColorStop(0, 'rgba(240, 160, 60, 0.12)');
shoreWash.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = shoreWash;
ctx.fillRect(0, crowdY - 30, W, 48);

ctx.restore();