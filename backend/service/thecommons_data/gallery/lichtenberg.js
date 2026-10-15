ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Variable lookups
const woodType = getVar('wood_type') ?? 'walnut';
const voltageMode = getVar('voltage') ?? 'steady_high';
const branchDensity = getVar('branch_density') ?? 60;
const grainBias = getVar('grain_bias') ?? 0.6;
const sparkMode = getVar('spark_count') ?? 'crackle_swarm';
const glowMult = getVar('glow_intensity') ?? 1.5;
const smokeEnabled = getVar('smoke_trails') ?? true;

const voltFactors = { steady_high: 1.0, surging_pulse: 1.4, overcharged: 1.8, hyper_arc: 2.3 };
const voltPower = voltFactors[voltageMode] ?? 1.0;

const sparkLimits = { subtle_embers: 30, crackle_swarm: 70, firestorm: 140 };
const maxSparks = sparkLimits[sparkMode] ?? 70;

// Audio drive
const bass = audio.bass || 0;
const beat = audio.beat || false;
const treble = audio.treble || 0;
const surge = 1.0 + bass * 0.9 + (beat ? 0.8 : 0);

// Internal buffer setup (demoscene economy: fixed 960x540 offscreen canvas)
const bW = 960;
const bH = 540;

if (!room.state.woodCanvas) {
  room.state.woodCanvas = new OffscreenCanvas(bW, bH);
  room.state.burnCanvas = new OffscreenCanvas(bW, bH);
  room.state.woodCtx = room.state.woodCanvas.getContext('2d');
  room.state.burnCtx = room.state.burnCanvas.getContext('2d');
  room.state.tips = [];
  room.state.sparks = [];
  room.state.smoke = [];
  room.state.plankX = 0;
  room.state.slideSpeed = 0;
  room.state.state = 'burning';
  room.state.burnScore = 0;
  room.state.currentWood = '';
}

const wCtx = room.state.woodCtx;
const bCtx = room.state.burnCtx;

// Palette profiles
const woodPalettes = {
  walnut: { base: '#362215', dark: '#24140b', light: '#503522', ring: '#1a0e07', copper: '#d48039' },
  golden_oak: { base: '#b07838', dark: '#804f1a', light: '#d99c55', ring: '#58340d', copper: '#e0a055' },
  burnt_cedar: { base: '#6e2b19', dark: '#48190d', light: '#993f26', ring: '#2e0f06', copper: '#ff6633' },
  driftwood: { base: '#55575c', dark: '#3b3d42', light: '#787a82', ring: '#25262a', copper: '#a0aab5' }
};

// Procedural wood plank painter
function renderPlankTexture(ctxT, palette) {
  const p = woodPalettes[palette] || woodPalettes.walnut;
  ctxT.fillStyle = p.base;
  ctxT.fillRect(0, 0, bW, bH);

  // Grain lines
  ctxT.lineWidth = 1.6;
  const knots = [
    { x: bW * 0.28, y: bH * 0.42, r: 48 },
    { x: bW * 0.74, y: bH * 0.60, r: 62 }
  ];

  for (let y = 0; y <= bH; y += 4) {
    ctxT.beginPath();
    ctxT.strokeStyle = (y % 12 === 0) ? p.dark : (y % 8 === 0 ? p.light : p.ring);
    ctxT.globalAlpha = 0.45;
    for (let x = 0; x <= bW; x += 16) {
      let dyTotal = Math.sin(x * 0.012 + y * 0.05) * 2.2;
      for (let k = 0; k < knots.length; k++) {
        const dx = x - knots[k].x;
        const dy = y - knots[k].y;
        const distSq = dx * dx + dy * dy;
        const influence = Math.exp(-distSq / (knots[k].r * knots[k].r * 2.4));
        dyTotal += influence * 24.0 * Math.sin(influence * Math.PI);
      }
      const py = y + dyTotal;
      if (x === 0) ctxT.moveTo(x, py); else ctxT.lineTo(x, py);
    }
    ctxT.stroke();
  }

  // Knot centers
  for (let k = 0; k < knots.length; k++) {
    const kn = knots[k];
    for (let r = kn.r * 0.55; r > 3; r -= 4) {
      ctxT.beginPath();
      ctxT.strokeStyle = p.dark;
      ctxT.globalAlpha = 0.7;
      ctxT.ellipse(kn.x, kn.y, r, r * 0.55, 0.12, 0, Math.PI * 2);
      ctxT.stroke();
    }
  }

  // Subtle bevel seams at top and bottom edge
  ctxT.globalAlpha = 0.85;
  ctxT.fillStyle = '#0a0503';
  ctxT.fillRect(0, 0, bW, 7);
  ctxT.fillRect(0, bH - 7, bW, 7);
  ctxT.globalAlpha = 1.0;
}

// Seed initial electrical tips
function seedTips() {
  room.state.tips.length = 0;
  const origins = [
    { side: 0, x: 10, y: bH * 0.32, angle: 0 },
    { side: 0, x: 10, y: bH * 0.50, angle: 0 },
    { side: 0, x: 10, y: bH * 0.68, angle: 0 },
    { side: 1, x: bW - 10, y: bH * 0.32, angle: Math.PI },
    { side: 1, x: bW - 10, y: bH * 0.50, angle: Math.PI },
    { side: 1, x: bW - 10, y: bH * 0.68, angle: Math.PI }
  ];

  origins.forEach(o => {
    room.state.tips.push({
      x: o.x, y: o.y,
      ang: o.angle + (Math.random() - 0.5) * 0.2,
      side: o.side,
      w: 4.8,
      energy: 220 + Math.random() * 120,
      gen: 0
    });
  });
  room.state.burnScore = 0;
}

// Initialise / swap plank
if (room.state.currentWood !== woodType) {
  renderPlankTexture(wCtx, woodType);
  bCtx.clearRect(0, 0, bW, bH);
  seedTips();
  room.state.currentWood = woodType;
}

// --- STATE MACHINE: BURNING VS SLIDE-OUT ---
if (room.state.state === 'burning') {
  // Advance tips
  const maxAllowedTips = Math.floor(branchDensity);
  const speedBase = (36 + 28 * voltPower) * surge * dt;
  let activeCount = room.state.tips.length;

  for (let i = activeCount - 1; i >= 0; i--) {
    const tip = room.state.tips[i];
    const ox = tip.x;
    const oy = tip.y;

    // Grain pull: forces angle toward 0 (if side 0) or PI (if side 1)
    const targetAng = tip.side === 0 ? 0 : Math.PI;
    let da = targetAng - tip.ang;
    while (da < -Math.PI) da += Math.PI * 2;
    while (da > Math.PI) da -= Math.PI * 2;
    tip.ang += da * (0.02 + grainBias * 0.08);

    // Dielectric noise & audio jitter
    const jitter = (Math.random() - 0.5) * (0.85 + treble * 1.2);
    tip.ang += jitter * (1.0 - grainBias * 0.55);

    // Advance step
    const step = speedBase * (0.8 + Math.random() * 0.6);
    tip.x += Math.cos(tip.ang) * step;
    tip.y += Math.sin(tip.ang) * step;
    tip.energy -= dt * (18 + voltPower * 14);
    room.state.burnScore += step;

    // Permanent draw onto burn buffer
    // 1. Carbon soot halo
    bCtx.beginPath();
    bCtx.moveTo(ox, oy);
    bCtx.lineTo(tip.x, tip.y);
    bCtx.strokeStyle = 'rgba(10, 4, 2, 0.16)';
    bCtx.lineWidth = tip.w * 4.2;
    bCtx.lineCap = 'round';
    bCtx.stroke();

    // 2. Deep char fracture
    bCtx.beginPath();
    bCtx.moveTo(ox, oy);
    bCtx.lineTo(tip.x, tip.y);
    bCtx.strokeStyle = 'rgba(14, 7, 4, 0.95)';
    bCtx.lineWidth = Math.max(1.1, tip.w);
    bCtx.stroke();

    // 3. Glowing ember core
    bCtx.beginPath();
    bCtx.moveTo(ox, oy);
    bCtx.lineTo(tip.x, tip.y);
    bCtx.strokeStyle = 'rgba(255, 95, 15, 0.42)';
    bCtx.lineWidth = Math.max(0.8, tip.w * 0.38);
    bCtx.stroke();

    // Branching
    const branchOdds = (0.024 + voltPower * 0.016 + bass * 0.035);
    if (Math.random() < branchOdds && room.state.tips.length < maxAllowedTips && tip.w > 1.2) {
      const forkAng = (Math.random() > 0.5 ? 1 : -1) * (0.42 + Math.random() * 0.45);
      room.state.tips.push({
        x: tip.x,
        y: tip.y,
        ang: tip.ang + forkAng,
        side: tip.side,
        w: tip.w * 0.74,
        energy: tip.energy * 0.85,
        gen: tip.gen + 1
      });
      tip.w *= 0.82;
    }

    // Spawn ember sparks
    if (room.state.sparks.length < maxSparks && Math.random() < (0.25 + bass * 0.4)) {
      const personHue = (room.people && room.people.length > 0) ? (room.people[i % room.people.length].hue ?? 30) : 32;
      room.state.sparks.push({
        x: tip.x,
        y: tip.y,
        vx: (Math.random() - 0.5) * 45 - 20,
        vy: -20 - Math.random() * 65 - bass * 40,
        life: 0.8 + Math.random() * 0.9,
        maxLife: 1.7,
        hue: personHue
      });
    }

    // Spawn smoke puff
    if (smokeEnabled && room.state.smoke.length < 50 && Math.random() < 0.12) {
      room.state.smoke.push({
        x: tip.x,
        y: tip.y,
        vx: (Math.random() - 0.5) * 12,
        vy: -15 - Math.random() * 20,
        r: 6 + Math.random() * 8,
        life: 1.2,
        maxLife: 1.2
      });
    }

    // Die condition: out of bounds or energy depleted
    const outOfBounds = tip.x < 4 || tip.x > bW - 4 || tip.y < 12 || tip.y > bH - 12;
    if (tip.energy <= 0 || outOfBounds) {
      room.state.tips.splice(i, 1);
    }
  }

  // Check Touchdown / Completion (tips meeting near center or branch saturation)
  let closedCircuit = false;
  for (let a = 0; a < room.state.tips.length; a++) {
    for (let b = a + 1; b < room.state.tips.length; b++) {
      const ta = room.state.tips[a];
      const tb = room.state.tips[b];
      if (ta.side !== tb.side) {
        const distSq = (ta.x - tb.x) ** 2 + (ta.y - tb.y) ** 2;
        if (distSq < 1100) {
          closedCircuit = true;
          break;
        }
      }
    }
    if (closedCircuit) break;
  }

  // Trigger slide transition when wood is extensively burned or opposing roots touch
  if (closedCircuit || (room.state.tips.length === 0 && room.state.burnScore > 800) || room.state.burnScore > 14000) {
    room.state.state = 'sliding';
    room.state.slideSpeed = 0;
  }
} else if (room.state.state === 'sliding') {
  // Smooth conveyor slide
  room.state.slideSpeed += dt * 1400;
  room.state.plankX -= room.state.slideSpeed * dt;

  // Sliding finished: new plank takes over
  if (room.state.plankX <= -bW) {
    room.state.plankX = 0;
    room.state.slideSpeed = 0;
    room.state.state = 'burning';
    renderPlankTexture(wCtx, woodType);
    bCtx.clearRect(0, 0, bW, bH);
    seedTips();
  }
}

// --- RENDER COMPOSITION ---
// Dark industrial backdrop
ctx.fillStyle = '#080504';
ctx.fillRect(0, 0, W, H);

// Scale math: fit bW x bH plank centered on screen
const scale = Math.min((W * 0.94) / bW, (H * 0.84) / bH);
const plankW = bW * scale;
const plankH = bH * scale;
const originX = (W - plankW) * 0.5;
const originY = (H - plankH) * 0.5;

// Viewport clipping mask for the conveyor/workbench opening
ctx.save();
ctx.beginPath();
ctx.rect(originX, originY, plankW, plankH);
ctx.clip();

// Draw primary and sliding planks
const shiftX = room.state.plankX * scale;
for (let pIdx = 0; pIdx < (room.state.state === 'sliding' ? 2 : 1); pIdx++) {
  const px = originX + shiftX + pIdx * plankW;
  ctx.drawImage(room.state.woodCanvas, px, originY, plankW, plankH);

  if (pIdx === 0) {
    ctx.drawImage(room.state.burnCanvas, px, originY, plankW, plankH);
  }
}

// Active Electrical Tips (drawn in screen space with intense bloom)
if (room.state.state === 'burning') {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  room.state.tips.forEach((tip, idx) => {
    const sx = originX + tip.x * scale;
    const sy = originY + tip.y * scale;
    const rOuter = (12 + bass * 14 + Math.random() * 4) * glowMult;
    const rCore = (3 + treble * 3) * glowMult;

    // Electric halo gradient
    const radGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rOuter);
    radGlow.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
    radGlow.addColorStop(0.25, 'rgba(255, 140, 20, 0.85)');
    radGlow.addColorStop(0.6, 'rgba(230, 60, 10, 0.35)');
    radGlow.addColorStop(1, 'rgba(180, 20, 0, 0)');

    ctx.fillStyle = radGlow;
    ctx.beginPath();
    ctx.arc(sx, sy, rOuter, 0, Math.PI * 2);
    ctx.fill();

    // Hot pinpoint nucleus
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, rCore, 0, Math.PI * 2);
    ctx.fill();

    // Micro-arcs jumping from tips
    if (Math.random() < (0.35 + treble * 0.5)) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      let lx = sx;
      let ly = sy;
      for (let s = 0; s < 3; s++) {
        lx += (Math.random() - 0.5) * 16 * scale;
        ly += (Math.random() - 0.5) * 16 * scale;
        ctx.lineTo(lx, ly);
      }
      ctx.strokeStyle = idx % 2 === 0 ? 'rgba(255, 220, 170, 0.8)' : 'rgba(190, 230, 255, 0.9)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  });
  ctx.restore();
}

// Update & Render Smoke
if (smokeEnabled && room.state.smoke.length > 0) {
  ctx.save();
  for (let s = room.state.smoke.length - 1; s >= 0; s--) {
    const sm = room.state.smoke[s];
    sm.x += sm.vx * dt;
    sm.y += sm.vy * dt;
    sm.r += dt * 14;
    sm.life -= dt;
    if (sm.life <= 0) {
      room.state.smoke.splice(s, 1);
      continue;
    }
    const alpha = (sm.life / sm.maxLife) * 0.18;
    ctx.fillStyle = `rgba(28, 20, 16, ${alpha})`;
    ctx.beginPath();
    ctx.arc(originX + sm.x * scale, originY + sm.y * scale, sm.r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Update & Render Sparks / Embers
if (room.state.sparks.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let k = room.state.sparks.length - 1; k >= 0; k--) {
    const sp = room.state.sparks[k];
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 85 * dt; // slight downward drift/gravity
    sp.life -= dt;
    if (sp.life <= 0) {
      room.state.sparks.splice(k, 1);
      continue;
    }
    const alpha = Math.min(1.0, sp.life / sp.maxLife);
    const rad = (1.5 + Math.random() * 1.5) * scale;
    ctx.fillStyle = `hsla(${sp.hue}, 95%, 65%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(originX + sp.x * scale, originY + sp.y * scale, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

ctx.restore(); // Exit plank clipping mask

// --- INDUSTRIAL ELECTRODE CLAMPS & AMBIENT FRAME ---
ctx.save();
// Heavy cast-iron bench shadow around opening
ctx.strokeStyle = '#050302';
ctx.lineWidth = 14;
ctx.strokeRect(originX, originY, plankW, plankH);

// Left & Right Brass Terminal Blocks
const clampW = 24 * scale;
const clampH = plankH * 0.88;
const clampY = originY + (plankH - clampH) * 0.5;

// Left Terminal Clamp (Negative/Ground)
const lGrad = ctx.createLinearGradient(originX - clampW, 0, originX + 8, 0);
lGrad.addColorStop(0, '#1c130c');
lGrad.addColorStop(0.4, '#b87333');
lGrad.addColorStop(0.8, '#593414');
lGrad.addColorStop(1, '#0e0804');
ctx.fillStyle = lGrad;
ctx.fillRect(originX - clampW * 0.7, clampY, clampW, clampH);

// Right Terminal Clamp (High Voltage)
const rGrad = ctx.createLinearGradient(originX + plankW - 8, 0, originX + plankW + clampW, 0);
rGrad.addColorStop(0, '#0e0804');
rGrad.addColorStop(0.2, '#593414');
rGrad.addColorStop(0.6, '#b87333');
rGrad.addColorStop(1, '#1c130c');
ctx.fillStyle = rGrad;
ctx.fillRect(originX + plankW - clampW * 0.3, clampY, clampW, clampH);

// Terminal contact heat / pilot arc glow
ctx.globalCompositeOperation = 'screen';
const clampPulse = (0.4 + 0.3 * Math.sin(t * 8) + bass * 0.5) * glowMult;
ctx.fillStyle = `rgba(255, 120, 20, ${clampPulse * 0.4})`;
ctx.fillRect(originX - 4, clampY, 12, clampH);
ctx.fillRect(originX + plankW - 8, clampY, 12, clampH);

// Dark Room Vignette
const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
vig.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();
ctx.restore();