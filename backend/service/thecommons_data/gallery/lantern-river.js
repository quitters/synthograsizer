ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.1);

const speed = getVar('flow_speed') ?? 1.0;
const density = Math.min(180, getVar('lantern_density') ?? 120);
const mistVal = getVar('mist_intensity') ?? 0.5;
const themeName = getVar('color_theme') ?? 'classic_amber';
const shimmerName = getVar('water_shimmer') ?? 'dancing_eddies';
const skyEnabled = getVar('sky_lanterns') ?? true;

const paletteThemes = {
  classic_amber: { h1: 34, h2: 18, inner: '#fff6d6', paper: '#ff8822', rim: '#cc3300' },
  lotus_pink:    { h1: 330, h2: 290, inner: '#ffe8f4', paper: '#ff4488', rim: '#991155' },
  festival_gold: { h1: 45, h2: 30, inner: '#fffae0', paper: '#ffaa00', rim: '#dd5500' },
  aurora_spirit: { h1: 165, h2: 195, inner: '#e0ffff', paper: '#00ccaa', rim: '#006677' }
};
const theme = paletteThemes[themeName] ?? paletteThemes.classic_amber;

const shimmerParams = {
  gentle_ripples: { freq: 14.0, amp: 2.2, warp: 1.0 },
  dancing_eddies: { freq: 22.0, amp: 5.0, warp: 2.4 },
  glassy_streaks: { freq: 8.0, amp: 1.0, warp: 0.4 }
};
const shim = shimmerParams[shimmerName] ?? shimmerParams.dancing_eddies;

// Init persistent lantern state
room.state.lanterns ??= [];
room.state.skyLanterns ??= [];
const pool = room.state.lanterns;

while (pool.length < 180) {
  const i = pool.length;
  pool.push({
    z: Math.random(),
    lane: (Math.random() - 0.5) * 1.5,
    seed: Math.random() * 1000,
    phase: Math.random() * Math.PI * 2,
    size: 0.8 + Math.random() * 0.4,
    personIdx: i % Math.max(1, (room.people ? room.people.length : 1))
  });
}

if (skyEnabled && room.state.skyLanterns.length < 24) {
  while (room.state.skyLanterns.length < 24) {
    room.state.skyLanterns.push({
      x: Math.random() * W,
      y: H * 0.35 + Math.random() * H * 0.3,
      vx: (Math.random() - 0.5) * 12,
      vy: -(15 + Math.random() * 25),
      size: 0.6 + Math.random() * 0.7,
      seed: Math.random() * 50
    });
  }
}

// Horizon & river boundary
const horizonY = H * 0.36;

// 1. Night sky & river background gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
skyGrad.addColorStop(0, '#020308');
skyGrad.addColorStop(0.7, '#070b18');
skyGrad.addColorStop(1, '#0e172a');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, horizonY);

const waterGrad = ctx.createLinearGradient(0, horizonY, 0, H);
waterGrad.addColorStop(0, '#080d19');
waterGrad.addColorStop(0.3, '#040710');
waterGrad.addColorStop(1, '#010206');
ctx.fillStyle = waterGrad;
ctx.fillRect(0, horizonY, W, H - horizonY);

// 2. Distant mountains silhouette
ctx.fillStyle = '#060a14';
ctx.beginPath();
ctx.moveTo(0, horizonY);
for (let x = 0; x <= W; x += 32) {
  const my = horizonY - 45 * Math.sin(x * 0.003 + 1.2) - 25 * Math.sin(x * 0.0075 + 4.0);
  ctx.lineTo(x, my);
}
ctx.lineTo(W, horizonY);
ctx.closePath();
ctx.fill();

// 3. Audio modulators
const bassBoost = (audio.bass || 0) * 0.7;
const flare = audio.beat ? 1.35 : 1.0;

// 4. Update and sort water lanterns by depth (z: 1=distant, 0=near)
const activeCount = density;
const activeLanterns = [];
for (let i = 0; i < activeCount; i++) {
  const p = pool[i];
  p.z -= dt * speed * 0.075 * (0.35 + (1.0 - p.z) * 0.65);
  if (p.z <= 0.005) {
    p.z = 0.99;
    p.lane = (Math.random() - 0.5) * 1.5;
    p.seed = Math.random() * 1000;
  }
  activeLanterns.push(p);
}

activeLanterns.sort((a, b) => b.z - a.z);

// Render Reflections First (Lighter composite for glow)
ctx.save();
ctx.globalCompositeOperation = 'screen';

for (let i = 0; i < activeLanterns.length; i++) {
  const p = activeLanterns[i];
  const depth = 1.0 - p.z;
  const scale = 0.25 + Math.pow(depth, 1.8) * 1.5;
  
  const riverCurve = Math.sin(p.z * 3.8 + t * 0.25) * 0.22;
  const screenX = W * (0.5 + riverCurve + p.lane * (0.15 + depth * 0.45));
  const bob = Math.sin(t * 2.2 + p.seed) * (1.5 + depth * 3.5);
  const screenY = horizonY + Math.pow(depth, 1.35) * (H - horizonY) * 0.92 + bob;

  if (screenX < -60 || screenX > W + 60 || screenY < horizonY - 10) continue;

  // Determine hue (check room people)
  let hue = theme.h1;
  if (room.people && room.people.length > 0) {
    const person = room.people[p.personIdx % room.people.length];
    if (person && typeof person.hue === 'number') {
      hue = (person.hue * 0.35 + theme.h1 * 0.65) % 360;
    }
  }

  // Reflection streaks downward
  const reflLen = (18 + depth * 140) * (1.0 + bassBoost);
  const alphaRefl = Math.min(0.85, (0.08 + depth * 0.45) * (0.8 + bassBoost * 0.4));
  const streakWidth = Math.max(3, (4 + depth * 22) * p.size);

  const steps = Math.min(16, Math.floor(6 + depth * 10));
  const segHeight = reflLen / steps;
  for (let s = 0; s < steps; s++) {
    const currY = screenY + 4 + s * segHeight;
    if (currY >= H) break;
    const wave = Math.sin(currY * (0.05 * shim.freq) + t * (2.0 * speed) + p.seed) * shim.amp * (s / steps + 0.3);
    const segAlpha = alphaRefl * (1.0 - s / steps) * 0.7;
    ctx.fillStyle = `hsla(${hue}, 95%, 55%, ${segAlpha})`;
    const w = streakWidth * (1.0 - s / (steps * 1.4));
    ctx.fillRect(screenX + wave - w * 0.5, currY, w, segHeight * 0.75);
  }
}
ctx.restore();

// 5. Render Lantern Bodies
for (let i = 0; i < activeLanterns.length; i++) {
  const p = activeLanterns[i];
  const depth = 1.0 - p.z;
  const scale = 0.25 + Math.pow(depth, 1.8) * 1.5;
  
  const riverCurve = Math.sin(p.z * 3.8 + t * 0.25) * 0.22;
  const screenX = W * (0.5 + riverCurve + p.lane * (0.15 + depth * 0.45));
  const bob = Math.sin(t * 2.2 + p.seed) * (1.5 + depth * 3.5);
  const screenY = horizonY + Math.pow(depth, 1.35) * (H - horizonY) * 0.92 + bob;

  if (screenX < -50 || screenX > W + 50) continue;

  let hue = theme.h1;
  if (room.people && room.people.length > 0) {
    const person = room.people[p.personIdx % room.people.length];
    if (person && typeof person.hue === 'number') {
      hue = (person.hue * 0.35 + theme.h1 * 0.65) % 360;
    }
  }

  const rSize = (7 + depth * 20) * p.size;
  const rot = Math.sin(t * 1.8 + p.seed) * 0.08;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(rot);

  // Warm halo glow
  const glowRad = rSize * (2.5 + bassBoost * 1.2) * flare;
  const glow = ctx.createRadialGradient(0, 0, rSize * 0.2, 0, 0, glowRad);
  glow.addColorStop(0, `hsla(${hue}, 100%, 75%, ${0.65 * depth + 0.2})`);
  glow.addColorStop(0.4, `hsla(${theme.h2}, 95%, 50%, ${(0.35 * depth + 0.15)})`);
  glow.addColorStop(1, `hsla(${theme.h2}, 100%, 20%, 0)`);
  
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, glowRad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Lantern paper frame (folded box / octagonal feel)
  const w = rSize * 1.1;
  const h = rSize * 1.35;
  
  // Dark base rim
  ctx.fillStyle = '#1a0d04';
  ctx.fillRect(-w * 0.55, h * 0.38, w * 1.1, h * 0.16);

  // Inner glowing paper body
  const paperGrad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
  paperGrad.addColorStop(0, theme.rim);
  paperGrad.addColorStop(0.35, theme.paper);
  paperGrad.addColorStop(0.7, theme.inner);
  paperGrad.addColorStop(1, theme.rim);

  ctx.fillStyle = paperGrad;
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, -h * 0.45);
  ctx.lineTo(w * 0.45, -h * 0.45);
  ctx.lineTo(w * 0.55, h * 0.4);
  ctx.lineTo(-w * 0.55, h * 0.4);
  ctx.closePath();
  ctx.fill();

  // Wooden frame ribs
  if (depth > 0.3) {
    ctx.strokeStyle = 'rgba(40, 15, 5, 0.65)';
    ctx.lineWidth = Math.max(1, 1.8 * depth);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.45);
    ctx.lineTo(0, h * 0.4);
    ctx.moveTo(-w * 0.25, -h * 0.45);
    ctx.lineTo(-w * 0.3, h * 0.4);
    ctx.moveTo(w * 0.25, -h * 0.45);
    ctx.lineTo(w * 0.3, h * 0.4);
    ctx.stroke();
  }

  // Center candle flame highlight
  const flameFlicker = (Math.sin(t * 15.0 + p.seed * 3) + Math.cos(t * 23.0 + p.seed)) * 0.15;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, h * 0.05, Math.max(1.5, rSize * 0.22 * (1.0 + flameFlicker)), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// 6. Sky Lanterns (drifting gently up into the night)
if (skyEnabled) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const skyList = room.state.skyLanterns;
  for (let i = 0; i < skyList.length; i++) {
    const sl = skyList[i];
    sl.y += sl.vy * dt;
    sl.x += sl.vx * dt + Math.sin(t * 0.8 + sl.seed) * 0.5;
    
    if (sl.y < -30) {
      sl.y = horizonY + Math.random() * 40;
      sl.x = W * 0.2 + Math.random() * W * 0.6;
      sl.vy = -(15 + Math.random() * 25);
    }

    const distFactor = Math.max(0.15, (sl.y / horizonY));
    const sRad = (6 + sl.size * 6) * distFactor;

    const sGlow = ctx.createRadialGradient(sl.x, sl.y, 0, sl.x, sl.y, sRad * 2.8);
    sGlow.addColorStop(0, '#fff4cc');
    sGlow.addColorStop(0.3, `hsla(${theme.h1}, 95%, 55%, 0.8)`);
    sGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');

    ctx.fillStyle = sGlow;
    ctx.beginPath();
    ctx.arc(sl.x, sl.y, sRad * 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fffbe8';
    ctx.fillRect(sl.x - sRad * 0.4, sl.y - sRad * 0.5, sRad * 0.8, sRad * 0.9);
  }
  ctx.restore();
}

// 7. Layer of misty glow above horizon
if (mistVal > 0.05) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const mistGrad = ctx.createLinearGradient(0, horizonY - 40, 0, horizonY + 80);
  const mAlpha = mistVal * 0.35 * (1.0 + bassBoost * 0.5);
  mistGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  mistGrad.addColorStop(0.4, `hsla(${theme.h1}, 80%, 40%, ${mAlpha})`);
  mistGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mistGrad;
  ctx.fillRect(0, horizonY - 40, W, 120);
  ctx.restore();
}

// 8. Foreground subtle vignette frame
const vig = ctx.createRadialGradient(W * 0.5, H * 0.55, W * 0.35, W * 0.5, H * 0.55, W * 0.8);
vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
vig.addColorStop(1, 'rgba(2, 4, 8, 0.7)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();