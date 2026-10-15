ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);

// Read variables
const palChoice = getVar('palette') ?? 'carnelian';
const numBands = Math.round(getVar('banding_density') ?? 48);
const wander = getVar('wandering') ?? 1.25;
const glowMult = getVar('backlight_glow') ?? 1.0;
const sparkleMult = getVar('druzy_sparkle') ?? 1.0;
const speed = getVar('breathing_speed') ?? 0.6;
const cavityRatio = getVar('cavity_size') ?? 0.25;

// Palettes: [primaryHue, secondaryHue, altHue, saturation%]
const palettes = {
  carnelian: { h1: 22, h2: 38, h3: 5, sat: 92, lightMod: 1.0 },
  amethyst:  { h1: 275, h2: 295, h3: 245, sat: 85, lightMod: 1.1 },
  malachite: { h1: 155, h2: 175, h3: 135, sat: 88, lightMod: 0.9 },
  celestine: { h1: 200, h2: 220, h3: 185, sat: 86, lightMod: 1.15 },
  onyx_gold: { h1: 42, h2: 30, h3: 50, sat: 70, lightMod: 0.85 }
};
const pal = palettes[palChoice] ?? palettes.carnelian;

// Precompute lookup tables and persistent structures
room.state.inited ??= false;
if (!room.state.inited) {
  room.state.inited = true;
  const S = 96;
  room.state.S = S;
  room.state.cos = new Float32Array(S);
  room.state.sin = new Float32Array(S);
  for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2;
    room.state.cos[i] = Math.cos(a);
    room.state.sin[i] = Math.sin(a);
  }
  const C_COUNT = 96;
  room.state.crystals = [];
  for (let i = 0; i < C_COUNT; i++) {
    room.state.crystals.push({
      depth: 0.65 + Math.random() * 0.7,
      width: 0.5 + Math.random() * 0.6,
      seed: Math.random() * 100,
      phase: Math.random() * Math.PI * 2
    });
  }
  const SP_COUNT = 40;
  room.state.sparks = [];
  for (let i = 0; i < SP_COUNT; i++) {
    const rad = Math.sqrt(Math.random()) * 0.85;
    const th = Math.random() * Math.PI * 2;
    room.state.sparks.push({
      rx: Math.cos(th) * rad,
      ry: Math.sin(th) * rad,
      freq: 2.0 + Math.random() * 5.0,
      phase: Math.random() * Math.PI * 2,
      size: 1.0 + Math.random() * 2.2
    });
  }
}

const S = room.state.S;
const cos = room.state.cos;
const sin = room.state.sin;

// Black base background
ctx.fillStyle = '#050406';
ctx.fillRect(0, 0, W, H);

const t = frame.t * speed;
const bass = audio.bass ?? 0;
const mid = audio.mid ?? 0;
const treble = audio.treble ?? 0;
const beat = audio.beat ? 1.0 : 0;

// 1. Backlight bloom behind the slice
const maxR = minDim * 0.44;
const cavityR = maxR * cavityRatio;
const backlightRadius = maxR * (1.1 + bass * 0.25);

const bgGrad = ctx.createRadialGradient(cx, cy, cavityR * 0.2, cx, cy, backlightRadius);
const glowHue = pal.h1;
const glowAlpha = Math.min(1.0, 0.45 * glowMult + bass * 0.25 + beat * 0.2);
bgGrad.addColorStop(0, `hsla(${glowHue + 15}, 100%, 75%, ${glowAlpha})`);
bgGrad.addColorStop(0.35, `hsla(${glowHue}, 90%, 45%, ${glowAlpha * 0.7})`);
bgGrad.addColorStop(0.75, `hsla(${pal.h3}, 80%, 25%, ${glowAlpha * 0.3})`);
bgGrad.addColorStop(1, 'rgba(5, 4, 6, 0)');

ctx.save();
ctx.globalCompositeOperation = 'screen';
ctx.fillStyle = bgGrad;
ctx.beginPath();
ctx.arc(cx, cy, backlightRadius, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// Wandering shape harmonics calculation function
function getDistortion(idx, frac, time) {
  const d1 = Math.sin(2 * idx / S * Math.PI * 2 + time * 0.4) * 0.11;
  const d2 = Math.cos(3 * idx / S * Math.PI * 2 - time * 0.3) * 0.08;
  const d3 = Math.sin(5 * idx / S * Math.PI * 2 + time * 0.7) * 0.04;
  const innerFuzz = (1 - frac) * Math.sin(idx * 1.8 + time) * 0.04;
  return 1.0 + (d1 + d2 + d3 + innerFuzz) * wander;
}

// 2. Concentric agate chalcedony bands (drawn outer to inner)
for (let b = 0; b <= numBands; b++) {
  const u = b / numBands;
  const currentR = maxR - u * (maxR - cavityR);
  
  const micro = Math.sin(u * 42.0) * 0.5 + 0.5;
  const stripe = Math.sin(u * 14.0);
  let bandHue = (stripe > 0.1) ? pal.h1 : (stripe < -0.3 ? pal.h3 : pal.h2);
  if (palChoice === 'onyx_gold' && micro > 0.7) bandHue = 48;

  let lightness = (20 + u * 45 + micro * 25) * pal.lightMod;
  let opacity = 0.55 + micro * 0.38 - (u * 0.25);

  if (u < 0.06) {
    lightness = 10 + u * 50;
    opacity = 0.98;
    bandHue = pal.h3;
  } else if (micro > 0.88) {
    lightness = 85;
    opacity = 0.85;
  }

  lightness += mid * 12;
  const bandColor = `hsla(${bandHue}, ${pal.sat}%, ${Math.min(95, lightness)}%, ${Math.min(0.98, opacity)})`;

  ctx.beginPath();
  for (let i = 0; i < S; i++) {
    const dist = getDistortion(i, u, t);
    const r = currentR * dist;
    const vx = cx + r * cos[i];
    const vy = cy + r * sin[i];
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.fillStyle = bandColor;
  ctx.fill();

  if (micro > 0.75 || b === numBands) {
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = `hsla(${bandHue + 10}, 100%, 85%, ${0.25 + mid * 0.25})`;
    ctx.stroke();
  }
}

// 3. Central crystal cavity: hollow opening with depth gradient
ctx.beginPath();
for (let i = 0; i < S; i++) {
  const dist = getDistortion(i, 1.0, t);
  const r = cavityR * dist;
  const vx = cx + r * cos[i];
  const vy = cy + r * sin[i];
  if (i === 0) ctx.moveTo(vx, vy);
  else ctx.lineTo(vx, vy);
}
ctx.closePath();

const cavGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cavityR * 1.2);
cavGrad.addColorStop(0, '#020104');
cavGrad.addColorStop(0.65, `hsla(${pal.h3}, 80%, 8%, 0.95)`);
cavGrad.addColorStop(1, `hsla(${pal.h1}, 95%, 15%, 0.8)`);
ctx.fillStyle = cavGrad;
ctx.fill();

// 4. Druzy quartz crystal teeth lining the cavity rim
const crystals = room.state.crystals;
const cLen = crystals.length;
const crystalBaseR = cavityR;

ctx.save();
for (let i = 0; i < cLen; i++) {
  const c = crystals[i];
  const angleIdx = i % S;
  const nextIdx = (i + 1) % S;
  
  const dist0 = getDistortion(angleIdx, 1.0, t);
  const dist1 = getDistortion(nextIdx, 1.0, t);
  
  const bx0 = cx + crystalBaseR * dist0 * cos[angleIdx];
  const by0 = cy + crystalBaseR * dist0 * sin[angleIdx];
  const bx1 = cx + crystalBaseR * dist1 * cos[nextIdx];
  const by1 = cy + crystalBaseR * dist1 * sin[nextIdx];
  
  const midAngle = ((angleIdx + 0.5) / S) * Math.PI * 2;
  const toothLen = (minDim * 0.028) * c.depth * (1.0 + mid * 0.4);
  const tipR = Math.max(0, crystalBaseR * ((dist0 + dist1) * 0.5) - toothLen);
  const tx = cx + tipR * Math.cos(midAngle);
  const ty = cy + tipR * Math.sin(midAngle);
  
  const shimmer = Math.sin(t * 3.5 + c.phase) * 0.5 + 0.5;
  const facetLit = 50 + shimmer * 45 + treble * 35;
  const facetAlpha = 0.5 + shimmer * 0.45 + beat * 0.2;

  ctx.beginPath();
  ctx.moveTo(bx0, by0);
  ctx.lineTo(tx, ty);
  ctx.lineTo((bx0 + bx1) * 0.5, (by0 + by1) * 0.5);
  ctx.closePath();
  ctx.fillStyle = `hsla(${pal.h1 + 10}, 70%, ${Math.min(98, facetLit)}%, ${facetAlpha})`;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo((bx0 + bx1) * 0.5, (by0 + by1) * 0.5);
  ctx.lineTo(tx, ty);
  ctx.lineTo(bx1, by1);
  ctx.closePath();
  ctx.fillStyle = `hsla(${pal.h2}, 85%, ${Math.min(95, facetLit * 0.65)}%, ${facetAlpha * 0.8})`;
  ctx.fill();
}
ctx.restore();

// 5. Druzy crystal sparkles & light points inside cavity
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const sparks = room.state.sparks;
const sCount = sparks.length;
for (let i = 0; i < sCount; i++) {
  const sp = sparks[i];
  const sx = cx + sp.rx * cavityR * 0.8;
  const sy = cy + sp.ry * cavityR * 0.8;
  
  const flash = Math.pow(Math.sin(t * sp.freq * sparkleMult + sp.phase) * 0.5 + 0.5, 5.0);
  const totalFlash = Math.min(1.0, flash + treble * 0.8 + beat * 0.6);
  if (totalFlash > 0.08) {
    const sz = sp.size * (1.2 + totalFlash * 2.5);
    
    ctx.strokeStyle = `hsla(${pal.h1 + 20}, 90%, 92%, ${totalFlash})`;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(sx - sz * 2.2, sy);
    ctx.lineTo(sx + sz * 2.2, sy);
    ctx.moveTo(sx, sy - sz * 2.2);
    ctx.lineTo(sx, sy + sz * 2.2);
    ctx.stroke();

    ctx.fillStyle = `hsla(60, 100%, 98%, ${totalFlash})`;
    ctx.beginPath();
    ctx.arc(sx, sy, sz * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 6. Connected room audience inclusions
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 36);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const angle = (i / pCount) * Math.PI * 2 + t * 0.15;
    const userR = cavityR * 1.35 + (i % 3) * (maxR * 0.16);
    const px = cx + Math.cos(angle) * userR;
    const py = cy + Math.sin(angle) * userR;
    
    const pHue = (p && typeof p.hue === 'number') ? p.hue : pal.h1;
    const pGlow = 0.5 + 0.5 * Math.sin(t * 2.0 + i);
    
    ctx.fillStyle = `hsla(${pHue}, 95%, 75%, ${0.55 + pGlow * 0.4})`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5 + pGlow * 2.0 + treble * 2.0, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();
ctx.restore();