ctx.save();

const w = frame.width;
const h = frame.height;
const cx = w * 0.44;
const cy = h * 0.52;
const minDim = Math.min(w, h);

const rotSpeed = getVar('prism_speed') ?? 0.5;
const dispScale = getVar('dispersion') ?? 1.2;
const beamW = getVar('beam_width') ?? 14;
const radiance = getVar('glow_intensity') ?? 1.2;
const showDust = getVar('dust_motes') ?? true;
const shape = getVar('prism_shape') ?? 'equilateral_prism';
const palMode = getVar('spectrum_palette') ?? 'pure_spectrum';
const medium = getVar('ambient_smoke') ?? 'luminous_haze';

// Persistent state initialization
room.state.angle ??= 0.4;
room.state.glint ??= 0;
room.state.motes ??= [];

if (room.state.motes.length === 0) {
  for (let i = 0; i < 180; i++) {
    room.state.motes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 8,
      vy: -6 - Math.random() * 12,
      size: 1 + Math.random() * 2,
      seed: Math.random() * 100
    });
  }
}

// Audio reactivity smoothing
const bass = audio.bass || 0;
const treble = audio.treble || 0;
const level = audio.level || 0;
const beat = audio.beat ? 1.0 : 0;

room.state.glint = Math.max(room.state.glint * 0.92, beat * 0.8 + treble * 0.4);
room.state.angle += (rotSpeed * 0.4 + level * 0.2) * frame.dt;
const theta = room.state.angle;

// Deep void clear with medium-dependent lingering trail
const fadeAlpha = medium === 'dense_aether' ? 0.18 : (medium === 'luminous_haze' ? 0.32 : 0.85);
ctx.fillStyle = `rgba(3, 4, 7, ${fadeAlpha})`;
ctx.fillRect(0, 0, w, h);

// Palette wavelength lookup
function getWavelengthColor(t, alpha) {
  let r = 0, g = 0, b = 0;
  if (palMode === 'pure_spectrum') {
    // Natural Fraunhofer approximation from violet (0) to deep red (1)
    const hue = (1.0 - t) * 290 - 20;
    const hNorm = ((hue % 360) + 360) % 360;
    return `hsla(${hNorm}, 100%, ${52 + bass * 12}%, ${alpha})`;
  } else if (palMode === 'deep_neon') {
    // Ultra cyan -> hot magenta -> laser amber
    if (t < 0.5) {
      const f = t * 2;
      r = Math.floor(0 * (1 - f) + 255 * f);
      g = Math.floor(255 * (1 - f) + 20 * f);
      b = Math.floor(220 * (1 - f) + 180 * f);
    } else {
      const f = (t - 0.5) * 2;
      r = 255;
      g = Math.floor(20 * (1 - f) + 220 * f);
      b = Math.floor(180 * (1 - f) + 30 * f);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } else if (palMode === 'aurora_borealis') {
    const hue = 140 + t * 150;
    return `hsla(${hue}, 95%, ${55 + bass * 15}%, ${alpha})`;
  } else {
    // Hyper gold
    const hue = 25 + t * 45;
    return `hsla(${hue}, 100%, ${48 + t * 20}%, ${alpha})`;
  }
}

// Prism Geometry Setup
const prismR = minDim * 0.15;
let numSides = 3;
let vAngles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

if (shape === 'sharp_flint_wedge') {
  vAngles = [-Math.PI * 0.65, Math.PI * 0.15, Math.PI * 0.75];
} else if (shape === 'hexagonal_beryl') {
  numSides = 6;
  vAngles = [];
  for (let i = 0; i < 6; i++) vAngles.push((i * Math.PI * 2) / 6);
}

const verts = vAngles.map(a => ({
  x: cx + Math.cos(a + theta) * prismR,
  y: cy + Math.sin(a + theta) * prismR
}));

// Incident Beam coordinates (originating offscreen left)
const beamStartX = -40;
const beamStartY = cy - h * 0.18 + Math.sin(frame.t * 0.25) * 30;
const beamDx = cx - beamStartX;
const beamDy = cy - beamStartY;
const beamLen = Math.hypot(beamDx, beamDy);
const beamUx = beamDx / beamLen;
const beamUy = beamDy / beamLen;

// Incident ray hit point on front facet
const hitX = cx - beamUx * prismR * 0.72;
const hitY = cy - beamUy * prismR * 0.72;

// 1. Draw Incident White Beam with Core & Volumetric Scatter
ctx.save();
ctx.globalCompositeOperation = 'screen';

// Broad soft cone
const gradBeam = ctx.createLinearGradient(beamStartX, beamStartY, hitX, hitY);
gradBeam.addColorStop(0, `rgba(240, 245, 255, ${0.15 * radiance})`);
gradBeam.addColorStop(0.8, `rgba(255, 255, 255, ${0.4 * radiance})`);
gradBeam.addColorStop(1, `rgba(255, 255, 255, ${0.85 * radiance})`);

ctx.lineWidth = beamW * 2.8;
ctx.strokeStyle = gradBeam;
ctx.beginPath();
ctx.moveTo(beamStartX, beamStartY);
ctx.lineTo(hitX, hitY);
ctx.stroke();

// Core intense laser
ctx.lineWidth = Math.max(2, beamW * 0.55);
ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1.0, 0.9 * radiance)})`;
ctx.beginPath();
ctx.moveTo(beamStartX, beamStartY);
ctx.lineTo(hitX, hitY);
ctx.stroke();

// Flash bloom at entrance face
const entranceGlow = ctx.createRadialGradient(hitX, hitY, 1, hitX, hitY, beamW * 3.5);
entranceGlow.addColorStop(0, `rgba(255, 255, 255, ${0.9 * radiance})`);
entranceGlow.addColorStop(0.3, `rgba(180, 220, 255, ${0.4 * radiance})`);
entranceGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = entranceGlow;
ctx.beginPath();
ctx.arc(hitX, hitY, beamW * 3.5, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// 2. Refracted Spectrum Fan Exit Vector Calculations
// Base exit angle driven by prism orientation and incident vector
const sweepBase = Math.atan2(beamUy, beamUx) + Math.sin(theta * 2) * 0.35 + 0.3;
const fanSpan = (0.42 + bass * 0.15) * dispScale;
const exitDist = Math.max(w, h) * 1.5;
const exitOriginX = cx + beamUx * prismR * 0.25;
const exitOriginY = cy + beamUy * prismR * 0.25;

const bands = 28;
ctx.save();
ctx.globalCompositeOperation = 'screen';

// Draw refractive ribbons across the spectrum
for (let i = 0; i < bands; i++) {
  const u0 = i / bands;
  const u1 = (i + 1) / bands;
  const ang0 = sweepBase - (fanSpan * 0.5) + u0 * fanSpan;
  const ang1 = sweepBase - (fanSpan * 0.5) + u1 * fanSpan;

  const p0x = exitOriginX + Math.cos(ang0) * exitDist;
  const p0y = exitOriginY + Math.sin(ang0) * exitDist;
  const p1x = exitOriginX + Math.cos(ang1) * exitDist;
  const p1y = exitOriginY + Math.sin(ang1) * exitDist;

  // Subtle caustic flutter driven by time & audio mid
  const causticMod = 1.0 + Math.sin(frame.t * 3.5 + i * 0.4) * (0.15 + audio.mid * 0.2);
  const alpha = (0.24 * radiance * causticMod) / Math.sqrt(dispScale);

  const col = getWavelengthColor(u0, alpha);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(exitOriginX, exitOriginY);
  ctx.lineTo(p0x, p0y);
  ctx.lineTo(p1x, p1y);
  ctx.closePath();
  ctx.fill();
}

// Intense caustic highlight lines through the spectrum
ctx.lineWidth = 2.0;
for (let j = 0; j < 5; j++) {
  const frac = (j + 0.5) / 5;
  const aCore = sweepBase - (fanSpan * 0.5) + frac * fanSpan;
  const colLine = getWavelengthColor(frac, 0.45 * radiance);
  ctx.strokeStyle = colLine;
  ctx.beginPath();
  ctx.moveTo(exitOriginX, exitOriginY);
  ctx.lineTo(exitOriginX + Math.cos(aCore) * exitDist, exitOriginY + Math.sin(aCore) * exitDist);
  ctx.stroke();
}
ctx.restore();

// 3. Faint Internal Total Reflections & Specular Glint Off Facets
ctx.save();
ctx.globalCompositeOperation = 'screen';
const specAngle = Math.atan2(beamUy, beamUx) - Math.PI + Math.sin(theta) * 0.8;
const specDist = w * 0.8;
const specAlpha = (0.18 + room.state.glint * 0.4) * radiance;

ctx.strokeStyle = `rgba(220, 240, 255, ${specAlpha})`;
ctx.lineWidth = Math.max(1.5, beamW * 0.35);
ctx.beginPath();
ctx.moveTo(hitX, hitY);
ctx.lineTo(hitX + Math.cos(specAngle) * specDist, hitY + Math.sin(specAngle) * specDist);
ctx.stroke();

// Internal bounce ray across prism vertices
ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * radiance})`;
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.moveTo(hitX, hitY);
ctx.lineTo(exitOriginX, exitOriginY);
ctx.lineTo(verts[0].x, verts[0].y);
ctx.stroke();
ctx.restore();

// 4. Render Glass Prism: Facet fills, refractive inner tint, specular bevels
ctx.save();
// Glass body
ctx.beginPath();
ctx.moveTo(verts[0].x, verts[0].y);
for (let i = 1; i < verts.length; i++) {
  ctx.lineTo(verts[i].x, verts[i].y);
}
ctx.closePath();

const glassGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, prismR);
glassGrad.addColorStop(0, `rgba(200, 230, 255, ${0.28 + bass * 0.1})`);
glassGrad.addColorStop(0.7, 'rgba(80, 120, 160, 0.12)');
glassGrad.addColorStop(1, 'rgba(18, 25, 40, 0.45)');
ctx.fillStyle = glassGrad;
ctx.fill();

// Glass facets internal refraction shadows
ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 + room.state.glint * 0.5})`;
ctx.lineWidth = 2;
ctx.stroke();

// Glass facet edges & glowing corner beads
for (let i = 0; i < verts.length; i++) {
  const p1 = verts[i];
  const p2 = verts[(i + 1) % verts.length];
  const edgeNormal = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const align = Math.abs(Math.sin(edgeNormal - theta));
  
  ctx.lineWidth = 1 + align * 2.5;
  ctx.strokeStyle = `rgba(230, 245, 255, ${(0.3 + align * 0.6) * radiance})`;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  // Corner glints
  const cornerGlint = ctx.createRadialGradient(p1.x, p1.y, 0, p1.x, p1.y, 10 + bass * 6);
  cornerGlint.addColorStop(0, `rgba(255, 255, 255, ${0.75 + room.state.glint * 0.25})`);
  cornerGlint.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = cornerGlint;
  ctx.beginPath();
  ctx.arc(p1.x, p1.y, 10 + bass * 6, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// 5. Caustic Dust Motes floating in space and catching light
if (showDust) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const motes = room.state.motes;
  const moteLen = motes.length;

  for (let i = 0; i < moteLen; i++) {
    const m = motes[i];
    m.x += m.vx * frame.dt * (1 + bass * 1.5);
    m.y += m.vy * frame.dt;

    if (m.y < -20) { m.y = h + 20; m.x = Math.random() * w; }
    if (m.x < -20) m.x = w + 20;
    if (m.x > w + 20) m.x = -20;

    // Test if mote is inside the incident beam or dispersed spectrum cone
    let lit = 0.05;
    let moteHue = 0;
    let isColored = false;

    // Check incident beam proximity
    const toBeamX = m.x - beamStartX;
    const toBeamY = m.y - beamStartY;
    const proj = (toBeamX * beamUx + toBeamY * beamUy);
    if (proj > 0 && proj < beamLen) {
      const perpDist = Math.abs(toBeamX * (-beamUy) + toBeamY * beamUx);
      if (perpDist < beamW * 2.2) {
        lit = Math.max(lit, (1.0 - perpDist / (beamW * 2.2)) * 0.9);
      }
    }

    // Check spectrum fan cone proximity
    const toMoteX = m.x - exitOriginX;
    const toMoteY = m.y - exitOriginY;
    const mDist = Math.hypot(toMoteX, toMoteY);
    if (mDist > 20 && mDist < exitDist) {
      let mAng = Math.atan2(toMoteY, toMoteX);
      let dAng = mAng - sweepBase;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      const halfSpan = fanSpan * 0.5;
      if (Math.abs(dAng) < halfSpan) {
        const u = (dAng + halfSpan) / fanSpan;
        lit = Math.max(lit, 0.85);
        moteHue = u;
        isColored = true;
      }
    }

    if (lit > 0.1) {
      const scint = Math.sin(frame.t * 6 + m.seed) * 0.4 + 0.6;
      const sz = m.size * (1 + treble * 1.2) * (lit > 0.4 ? 1.5 : 1.0);
      if (isColored) {
        ctx.fillStyle = getWavelengthColor(moteHue, lit * scint * radiance);
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${lit * scint * 0.8 * radiance})`;
      }
      ctx.beginPath();
      ctx.arc(m.x, m.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// 6. Connected room audience echoes (sparkling nodes along crystal boundary)
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const pCount = room.people.length;
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const pAngle = theta * 1.2 + (i / pCount) * Math.PI * 2;
    const orbitR = prismR * (1.18 + Math.sin(frame.t * 2 + i) * 0.1);
    const px = cx + Math.cos(pAngle) * orbitR;
    const py = cy + Math.sin(pAngle) * orbitR;
    const hue = p.hue ?? (i * 45) % 360;
    
    ctx.fillStyle = `hsla(${hue}, 90%, 65%, ${0.5 + room.state.glint * 0.5})`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5 + bass * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Subtle vignette to focus projector contrast
const vignette = ctx.createRadialGradient(cx, cy, minDim * 0.4, cx, cy, minDim * 0.95);
vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
vignette.addColorStop(1, 'rgba(2, 2, 4, 0.65)');
ctx.fillStyle = vignette;
ctx.fillRect(0, 0, w, h);

ctx.restore();