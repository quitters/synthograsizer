ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.05);

// Controls
const jellyCount = Math.min(Math.max(Math.floor(getVar('jelly_count') ?? 4), 2), 7);
const palChoice = getVar('bioluminescence') ?? 'spectral_prism';
const pulseTempo = getVar('pulse_tempo') ?? 0.8;
const dragChoice = getVar('tentacle_drag') ?? 'silken_ribbons';
const snowChoice = getVar('marine_snow') ?? 'glowing_dust';
const bloomGlow = getVar('bloom_glow') ?? true;

// Audio hooks
const bassBoost = (audio.bass || 0) * 0.45;
const midEnergy = (audio.mid || 0) * 0.5;
const trebleSparks = (audio.treble || 0) * 0.6;
const beatKick = audio.beat ? 1.0 : 0.0;

// Persistent state initialization
room.state.init ??= false;
if (!room.state.init) {
  room.state.snow = [];
  for (let i = 0; i < 160; i++) {
    room.state.snow.push({
      x: Math.random(),
      y: Math.random(),
      sz: 0.8 + Math.random() * 2.2,
      spd: 0.025 + Math.random() * 0.04,
      drift: (Math.random() - 0.5) * 0.03,
      lum: 0.3 + Math.random() * 0.7
    });
  }

  room.state.jellies = [];
  for (let j = 0; j < 7; j++) {
    const tentSegs = 22;
    const tentacles = [];
    for (let k = 0; k < 6; k++) {
      const segs = [];
      for (let s = 0; s < tentSegs; s++) segs.push({ x: 0, y: 0 });
      tentacles.push(segs);
    }
    room.state.jellies.push({
      x: 0.15 + (j / 7) * 0.7 + (Math.random() - 0.5) * 0.1,
      y: 0.2 + (j % 3) * 0.28 + Math.random() * 0.15,
      vx: 0,
      vy: 0,
      scale: 0.75 + (j % 3) * 0.25,
      phase: (j * 1.618) % (Math.PI * 2),
      pulseVal: 0,
      tentacles: tentacles,
      hueOffset: j * 54
    });
  }
  room.state.init = true;
}

// Palette base hue offsets
const palettes = {
  abyssal_blue: 200,
  aurora_green: 145,
  spectral_prism: -1,
  hyper_magenta: 310
};
const baseHue = palettes[palChoice] ?? -1;

// Drag coefficients
const dragParams = {
  gentle_sway: { lag: 0.09, curl: 18, amp: 20 },
  silken_ribbons: { lag: 0.14, curl: 32, amp: 38 },
  turbulent_currents: { lag: 0.22, curl: 50, amp: 55 }
}[dragChoice] || { lag: 0.14, curl: 32, amp: 38 };

// Snow counts
const snowMax = snowChoice === 'sparse_drift' ? 60 : (snowChoice === 'denser_flurry' ? 150 : 110);

// 1. Deep abyss background with gentle ambient radiance
const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.4, H * 0.05, W * 0.5, H * 0.5, H * 0.85);
bgGrad.addColorStop(0, 'rgba(4, 12, 28, 0.95)');
bgGrad.addColorStop(0.5, 'rgba(1, 5, 14, 0.98)');
bgGrad.addColorStop(1, 'rgba(0, 1, 4, 1.0)');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// 2. Marine snow particles
ctx.save();
for (let i = 0; i < snowMax; i++) {
  const s = room.state.snow[i];
  s.y += (s.spd * (1.0 + bassBoost * 0.5)) * dt;
  s.x += Math.sin(t * 0.4 + i) * s.drift * dt;
  if (s.y > 1.05) { s.y = -0.05; s.x = Math.random(); }
  if (s.x < 0) s.x += 1; else if (s.x > 1) s.x -= 1;

  const px = s.x * W;
  const py = s.y * H;
  const glowAlpha = s.lum * (snowChoice === 'glowing_dust' ? 0.65 : 0.35);
  ctx.fillStyle = snowChoice === 'glowing_dust'
    ? `hsla(${(t * 25 + i * 15) % 360}, 80%, 75%, ${glowAlpha})`
    : `rgba(180, 220, 255, ${glowAlpha})`;
  ctx.beginPath();
  ctx.arc(px, py, s.sz, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 3. Jellyfish rendering loop
const jellies = room.state.jellies;
const activeCount = jellyCount;

for (let j = 0; j < activeCount; j++) {
  const jl = jellies[j];
  // Pulse mechanics
  const pFreq = pulseTempo * 2.8;
  const rawPulse = Math.sin(t * pFreq + jl.phase);
  const pulseSharp = Math.max(0, Math.pow(Math.max(0, rawPulse), 2.2));
  const pulse = pulseSharp * (1.0 + bassBoost * 0.7) + beatKick * 0.15;
  jl.pulseVal = pulse;

  // Drift and swimming thrust
  const thrust = pulse * 0.08 * dt;
  jl.vy -= thrust;
  jl.vy += 0.015 * dt; // gravity / water sink
  jl.vx += Math.sin(t * 0.35 + jl.phase) * 0.005 * dt;
  jl.vx *= 0.94;
  jl.vy *= 0.94;
  jl.x += jl.vx;
  jl.y += jl.vy;

  // Boundary wrap/bounce
  if (jl.y < 0.1) jl.vy += 0.02 * dt;
  if (jl.y > 0.88) { jl.y = 0.88; jl.vy -= 0.04 * dt; }
  if (jl.x < 0.08) jl.vx += 0.02 * dt;
  if (jl.x > 0.92) jl.vx -= 0.02 * dt;

  const jx = jl.x * W;
  const jy = jl.y * H;
  const R = Math.min(W, H) * 0.11 * jl.scale;
  const bellW = R * (1.1 - pulse * 0.35);
  const bellH = R * (0.85 + pulse * 0.45);

  // Color selection
  const personHue = (room.people && room.people[j % room.people.length]) ? room.people[j % room.people.length].hue : null;
  const rootHue = personHue !== null ? personHue : (baseHue < 0 ? (t * 22 + jl.hueOffset) % 360 : baseHue);

  ctx.save();
  ctx.translate(jx, jy);

  // Slight bell tilt matching velocity
  const tilt = jl.vx * 15;
  ctx.rotate(tilt);

  // 3a. Trailing tentacles
  ctx.save();
  if (bloomGlow) {
    ctx.globalCompositeOperation = 'lighter';
  }
  for (let k = 0; k < jl.tentacles.length; k++) {
    const tent = jl.tentacles[k];
    const anchorOffset = ((k - (jl.tentacles.length - 1) * 0.5) / jl.tentacles.length) * (bellW * 0.75);
    const rootX = anchorOffset;
    const rootY = bellH * 0.25;
    tent[0].x = rootX;
    tent[0].y = rootY;

    // Cascade segments down
    for (let s = 1; s < tent.length; s++) {
      const seg = tent[s];
      const prev = tent[s - 1];
      const wave = Math.sin(t * 2.2 + s * 0.32 + k) * dragParams.curl * (s / tent.length);
      const targetX = prev.x + wave * 0.25;
      const targetY = prev.y + (dragParams.amp / tent.length) * 4.2;
      seg.x += (targetX - seg.x) * dragParams.lag;
      seg.y += (targetY - seg.y) * dragParams.lag;
    }

    // Draw tentacle ribbon
    ctx.beginPath();
    ctx.moveTo(tent[0].x, tent[0].y);
    for (let s = 1; s < tent.length - 1; s++) {
      const xc = (tent[s].x + tent[s + 1].x) * 0.5;
      const yc = (tent[s].y + tent[s + 1].y) * 0.5;
      ctx.quadraticCurveTo(tent[s].x, tent[s].y, xc, yc);
    }
    const tentHue = (rootHue + k * 18 + t * 15) % 360;
    ctx.strokeStyle = `hsla(${tentHue}, 88%, 68%, 0.45)`;
    ctx.lineWidth = Math.max(1, (3.2 - (k % 2) * 1.5) * (1 - k / jl.tentacles.length * 0.3));
    ctx.stroke();

    // Bioluminescent beads along tentacles on treble/audio spikes
    if (trebleSparks > 0.1 || k % 2 === 0) {
      const sparkIdx = (Math.floor(t * 8 + k * 3)) % (tent.length - 2) + 1;
      const spPt = tent[sparkIdx];
      ctx.fillStyle = `hsla(${(tentHue + 60) % 360}, 95%, 85%, ${0.6 + midEnergy})`;
      ctx.beginPath();
      ctx.arc(spPt.x, spPt.y, 2.2 + trebleSparks * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 3b. Inner bell / gastric cavity glow
  const innerGrad = ctx.createRadialGradient(0, -bellH * 0.1, 0, 0, 0, bellW * 0.6);
  innerGrad.addColorStop(0, `hsla(${(rootHue + 40) % 360}, 95%, 75%, ${0.55 + pulse * 0.4})`);
  innerGrad.addColorStop(0.5, `hsla(${rootHue}, 85%, 55%, ${0.3 + pulse * 0.25})`);
  innerGrad.addColorStop(1, 'rgba(0, 10, 30, 0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, bellW * 0.6, bellH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3c. Translucent Outer Bell Shell
  ctx.beginPath();
  ctx.moveTo(-bellW, 0.1 * bellH);
  ctx.bezierCurveTo(-bellW, -bellH * 1.15, bellW, -bellH * 1.15, bellW, 0.1 * bellH);
  ctx.bezierCurveTo(bellW * 0.65, bellH * 0.35, bellW * 0.2, -0.05 * bellH, 0, 0.15 * bellH);
  ctx.bezierCurveTo(-bellW * 0.2, -0.05 * bellH, -bellW * 0.65, bellH * 0.35, -bellW, 0.1 * bellH);
  ctx.closePath();

  const bellGrad = ctx.createLinearGradient(0, -bellH, 0, bellH * 0.3);
  bellGrad.addColorStop(0, `hsla(${rootHue}, 90%, 65%, 0.65)`);
  bellGrad.addColorStop(0.4, `hsla(${(rootHue + 25) % 360}, 80%, 45%, 0.35)`);
  bellGrad.addColorStop(0.85, `hsla(${(rootHue + 50) % 360}, 90%, 60%, 0.15)`);
  bellGrad.addColorStop(1, 'rgba(0, 20, 45, 0.05)');
  ctx.fillStyle = bellGrad;
  ctx.fill();

  // Bell rim contour
  ctx.strokeStyle = `hsla(${rootHue}, 90%, 75%, ${0.5 + pulse * 0.35})`;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // 3d. Iridescent Comb Rows (Ctenophore cilia plates)
  // 8 longitudinal radiating ribs running from apex to margin
  const ribCount = 8;
  for (let r = 0; r < ribCount; r++) {
    const norm = (r / (ribCount - 1)) * 2 - 1; // -1 to 1
    const ribX = norm * (bellW * 0.78);
    const curveX = ribX * 1.18;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -bellH * 0.95);
    ctx.quadraticCurveTo(curveX, -bellH * 0.3, ribX, bellH * 0.12);
    
    // Rainbow light cascades down the comb plates
    const ctenoSpeed = t * 3.5 + r * 0.5;
    const wavePhase = (ctenoSpeed) % 1.0;
    const combHue = baseHue < 0 ? (r * 45 + t * 90) % 360 : (baseHue + r * 15 + Math.sin(t * 4 + r) * 35) % 360;
    
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -wavePhase * 24;
    ctx.strokeStyle = `hsla(${combHue}, 100%, 72%, ${0.65 + midEnergy * 0.35})`;
    ctx.lineWidth = 2.4;
    if (bloomGlow) {
      ctx.shadowColor = `hsla(${combHue}, 100%, 70%, 0.9)`;
      ctx.shadowBlur = 10;
    }
    ctx.stroke();
    ctx.restore();
  }

  // 3e. Margin Lappets / Rhopalia sensor dots
  for (let m = -3; m <= 3; m++) {
    const mx = (m / 3.5) * (bellW * 0.85);
    const my = bellH * 0.18 + Math.cos(m * 1.2) * 5;
    ctx.fillStyle = `hsla(${(rootHue + 90 + m * 20) % 360}, 100%, 80%, 0.95)`;
    ctx.beginPath();
    ctx.arc(mx, my, 1.8 + pulse * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// 4. Subtle abyssal depth vignette to maintain contrast for wall projection
const vignette = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.45, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
vignette.addColorStop(1, 'rgba(0, 2, 8, 0.65)');
ctx.fillStyle = vignette;
ctx.fillRect(0, 0, W, H);

ctx.restore();