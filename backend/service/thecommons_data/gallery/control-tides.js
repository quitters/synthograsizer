ctx.save();

const count = Math.round(getVar('pool_count') ?? 5);
const rings = Math.round(getVar('depth_rings') ?? 7);
const speed = getVar('tide_speed') ?? 0.6;
const caustics = getVar('shimmer') ?? true;
const paletteName = getVar('palette') ?? 'abyssal';

const PALETTES = {
  abyssal: { baseHue: 195, hueSpan: 50, deepSat: 85, deepLight: 14, rimSat: 75, rimLight: 58 },
  coral: { baseHue: 330, hueSpan: 75, deepSat: 90, deepLight: 20, rimSat: 80, rimLight: 62 },
  twilight: { baseHue: 260, hueSpan: 60, deepSat: 80, deepLight: 15, rimSat: 85, rimLight: 65 },
  emerald: { baseHue: 155, hueSpan: 55, deepSat: 85, deepLight: 16, rimSat: 70, rimLight: 60 }
};
const pal = PALETTES[paletteName] ?? PALETTES.abyssal;

// Initialize persistent pool anchors once
room.state.pools ??= [];
if (room.state.pools.length !== 8) {
  room.state.pools = [
    { nx: 0.28, ny: 0.35, rBase: 0.24, phase: 0.0, lobes: 5, drift: 0.13 },
    { nx: 0.72, ny: 0.32, rBase: 0.22, phase: 1.7, lobes: 6, drift: 0.17 },
    { nx: 0.50, ny: 0.62, rBase: 0.28, phase: 3.2, lobes: 7, drift: 0.11 },
    { nx: 0.18, ny: 0.76, rBase: 0.18, phase: 4.5, lobes: 4, drift: 0.19 },
    { nx: 0.82, ny: 0.74, rBase: 0.20, phase: 2.1, lobes: 5, drift: 0.15 },
    { nx: 0.45, ny: 0.18, rBase: 0.17, phase: 5.3, lobes: 6, drift: 0.22 },
    { nx: 0.88, ny: 0.16, rBase: 0.15, phase: 0.9, lobes: 4, drift: 0.14 },
    { nx: 0.10, ny: 0.22, rBase: 0.16, phase: 3.8, lobes: 5, drift: 0.18 }
  ];
}

// Smooth dynamic hue drift driven by audio and time
room.state.hueOffset = ((room.state.hueOffset ?? 0) + frame.dt * (4 + audio.mid * 18)) % 360;
const curHueBase = (pal.baseHue + room.state.hueOffset) % 360;

const w = frame.width;
const h = frame.height;
const minDim = Math.min(w, h);

// Deep wet-rock intertidal background
const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, minDim * 0.1, w * 0.5, h * 0.5, minDim * 0.9);
bgGrad.addColorStop(0, '#090d13');
bgGrad.addColorStop(0.65, '#05070a');
bgGrad.addColorStop(1, '#020305');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, w, h);

// Subtle tidal rock texture
ctx.save();
ctx.strokeStyle = 'rgba(255, 255, 255, 0.018)';
ctx.lineWidth = 1.5;
for (let i = 0; i < 6; i++) {
  ctx.beginPath();
  const y0 = h * (0.15 + i * 0.15);
  ctx.moveTo(0, y0);
  ctx.bezierCurveTo(w * 0.33, y0 + Math.sin(frame.t * 0.2 + i) * 35, w * 0.66, y0 - Math.cos(frame.t * 0.2 + i) * 35, w, y0);
  ctx.stroke();
}
ctx.restore();

// Helper to trace harmonic organic pool contour
function tracePoolContour(cx, cy, radius, lobeCount, phase, t, audioWarp) {
  const steps = 48;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const wave1 = Math.sin(angle * lobeCount + phase + t * speed * 1.3);
    const wave2 = Math.cos(angle * 2 - phase * 1.5 - t * speed * 0.8);
    const wave3 = Math.sin(angle * 3 + phase * 0.7);
    const warp = 1 + (wave1 * 0.12 + wave2 * 0.07 + wave3 * 0.04) * (1 + audioWarp * 0.8);
    const r = radius * warp;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Draw pools back-to-front
const activePools = room.state.pools.slice(0, count);

for (let pIdx = 0; pIdx < activePools.length; pIdx++) {
  const pool = activePools[pIdx];
  // Organic slow wander for pool center
  const cx = (pool.nx + Math.sin(frame.t * pool.drift + pool.phase) * 0.02) * w;
  const cy = (pool.ny + Math.cos(frame.t * pool.drift * 0.8 + pool.phase) * 0.02) * h;

  // Breathing tidal pulse (sine + music kick)
  const breathe = Math.sin(frame.t * speed * 1.8 + pool.phase) * 0.14 + (audio.bass * 0.22);
  const maxRadius = minDim * pool.rBase * (1 + breathe);

  // Draw concentric depth contours, outer (sand/edge) down to deep trench center
  for (let r = 0; r < rings; r++) {
    const layerProgress = r / (rings - 1); // 0 = rim (shallow), 1 = deep abyss
    const currentRadius = maxRadius * (1 - layerProgress * 0.78);
    if (currentRadius <= 2) continue;

    // Color gradient across depth
    const hue = (curHueBase + (1 - layerProgress) * pal.hueSpan + pIdx * 16) % 360;
    const sat = pal.rimSat + (pal.deepSat - pal.rimSat) * layerProgress;
    const light = pal.rimLight - (pal.rimLight - pal.deepLight) * Math.pow(layerProgress, 0.7);
    const alpha = 0.35 + layerProgress * 0.55;

    tracePoolContour(cx, cy, currentRadius, pool.lobes, pool.phase + layerProgress * 0.5, frame.t, audio.bass);

    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
    ctx.fill();

    // Delicate contour rim line
    ctx.strokeStyle = `hsla(${hue}, ${sat + 10}%, ${light + 18}%, ${0.25 + (1 - layerProgress) * 0.45})`;
    ctx.lineWidth = (1 - layerProgress) * 2.2 + 0.8;
    ctx.stroke();
  }

  // Deep pool core glowing focal point
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 0.35);
  coreGrad.addColorStop(0, `hsla(${(curHueBase + pal.hueSpan + 40) % 360}, 95%, 65%, 0.85)`);
  coreGrad.addColorStop(0.4, `hsla(${(curHueBase + pal.hueSpan) % 360}, 90%, 35%, 0.5)`);
  coreGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, maxRadius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Caustics shimmer over liquid surface
  if (caustics) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `hsla(${curHueBase}, 60%, 85%, ${0.12 + audio.treble * 0.28})`;
    ctx.lineWidth = 1.2;
    const causticLines = 6;
    for (let c = 0; c < causticLines; c++) {
      const cPhase = pool.phase + c * (Math.PI * 2 / causticLines);
      const cRad = maxRadius * (0.3 + 0.5 * Math.sin(frame.t * speed * 2 + cPhase * 2));
      ctx.beginPath();
      const pts = 16;
      for (let j = 0; j <= pts; j++) {
        const a = (j / pts) * Math.PI * 2;
        const distort = Math.sin(a * 4 + frame.t * 3 + cPhase) * (12 + audio.treble * 16);
        const px = cx + Math.cos(a) * (cRad + distort);
        const py = cy + Math.sin(a) * (cRad + distort) * 0.85;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Inhabitants of the pools (room people as luminous shoreline anemones)
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < room.people.length; i++) {
    const person = room.people[i];
    const pool = activePools[i % activePools.length];
    const cx = (pool.nx + Math.sin(frame.t * pool.drift + pool.phase) * 0.02) * w;
    const cy = (pool.ny + Math.cos(frame.t * pool.drift * 0.8 + pool.phase) * 0.02) * h;
    const orbitAngle = frame.t * 0.4 * (i % 2 === 0 ? 1 : -1) + (i * 2.399);
    const orbitDist = minDim * pool.rBase * 0.85;
    const px = cx + Math.cos(orbitAngle) * orbitDist;
    const py = cy + Math.sin(orbitAngle) * orbitDist;

    const pHue = person.hue ?? 180;
    const pulse = 4 + Math.sin(frame.t * 3 + i) * 2 + (audio.level * 5);

    // Anemone tentacle flares
    ctx.strokeStyle = `hsla(${pHue}, 90%, 70%, 0.6)`;
    ctx.lineWidth = 1.4;
    for (let f = 0; f < 5; f++) {
      const fa = (f / 5) * Math.PI * 2 + frame.t * 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + Math.cos(fa + 0.3) * (pulse * 2.2), py + Math.sin(fa + 0.3) * (pulse * 2.2), px + Math.cos(fa) * (pulse * 3.5), py + Math.sin(fa) * (pulse * 3.5));
      ctx.stroke();
    }

    // Center spore
    ctx.fillStyle = `hsla(${pHue}, 100%, 85%, 0.9)`;
    ctx.beginPath();
    ctx.arc(px, py, pulse * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Ambient vignette edge shadow
const vignette = ctx.createRadialGradient(w * 0.5, h * 0.5, minDim * 0.55, w * 0.5, h * 0.5, minDim * 0.95);
vignette.addColorStop(0, 'rgba(0,0,0,0)');
vignette.addColorStop(1, 'rgba(1, 2, 4, 0.7)');
ctx.fillStyle = vignette;
ctx.fillRect(0, 0, w, h);

ctx.restore();