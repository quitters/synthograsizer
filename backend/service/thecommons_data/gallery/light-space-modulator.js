ctx.save();
const W = frame.width;
const H = frame.height;
const minDim = Math.min(W, H);
const cx = W * 0.5;
const cy = H * 0.5;
const dt = Math.min(frame.dt, 0.1);

// Persistent LUTs and motion accumulators
if (!room.state.initialized) {
  room.state.initialized = true;
  room.state.rot1 = 0;
  room.state.rot2 = 0;
  room.state.rotSpiral = 0;
  room.state.shutterSlide = 0;
  room.state.strobePhase = 0;

  // Precompute disc perforated pattern tables (no heap churn in hot loops)
  room.state.outerPerfs = [];
  for (let i = 0; i < 32; i++) {
    const ang = (i / 32) * Math.PI * 2;
    room.state.outerPerfs.push({
      cos: Math.cos(ang),
      sin: Math.sin(ang),
      radFrac: 0.74 + (i % 3) * 0.08,
      size: 0.038 + (i % 2) * 0.018
    });
  }

  room.state.innerPerfs = [];
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * Math.PI * 2;
    room.state.innerPerfs.push({
      cos: Math.cos(ang),
      sin: Math.sin(ang),
      radFrac: 0.38 + (i % 4) * 0.07,
      size: 0.02 + ((i % 5) === 0 ? 0.03 : 0.01)
    });
  }
}

// Controls
const paletteChoice = getVar('palette') ?? 'Bauhaus Monochrome';
const speed = getVar('motion_speed') ?? 1.0;
const slatsCount = getVar('grille_density') ?? 24;
const shadowLayers = getVar('shadow_depth') ?? 3;
const spiralCoils = getVar('spiral_density') ?? 5;
const beamGlow = getVar('beam_intensity') ?? 0.6;
const strobeOn = getVar('strobe_fx') ?? true;

// Kinetic state integration with audio surges
const bassBoost = 1.0 + audio.bass * 1.8;
const midBoost = 1.0 + audio.mid * 1.4;
room.state.rot1 += dt * speed * 0.42 * bassBoost;
room.state.rot2 -= dt * speed * 0.71 * midBoost;
room.state.rotSpiral += dt * speed * 1.15;
room.state.shutterSlide = Math.sin(frame.t * 0.8 * speed) * 0.35;
if (strobeOn && audio.beat) {
  room.state.strobePhase = 1.0;
} else {
  room.state.strobePhase = Math.max(0, room.state.strobePhase - dt * 4.0);
}

// Palette definition
let cBgDark = '#060608';
let cBeam = 'rgba(255, 255, 255, ';
let cMetal = '#e0e4eb';
let cAccent1 = 'rgba(255, 255, 255, 0.85)';
let cAccent2 = 'rgba(180, 195, 210, 0.7)';
let cShadow = 'rgba(0, 0, 0, 0.85)';

if (paletteChoice === 'Tungsten & Amber') {
  cBgDark = '#090604';
  cBeam = 'rgba(255, 190, 110, ';
  cMetal = '#f5dfc6';
  cAccent1 = 'rgba(255, 150, 40, 0.9)';
  cAccent2 = 'rgba(255, 220, 170, 0.7)';
  cShadow = 'rgba(12, 6, 2, 0.9)';
} else if (paletteChoice === 'Bauhaus Gel Filters') {
  cBgDark = '#07080c';
  cBeam = 'rgba(240, 244, 255, ';
  cMetal = '#ffffff';
  cAccent1 = 'rgba(225, 45, 45, 0.9)';   // Bauhaus Primary Red
  cAccent2 = 'rgba(245, 205, 30, 0.85)'; // Bauhaus Primary Yellow
  cShadow = 'rgba(8, 12, 28, 0.9)';
} else if (paletteChoice === 'Mercury Vapor') {
  cBgDark = '#02090b';
  cBeam = 'rgba(120, 240, 245, ';
  cMetal = '#cbebee';
  cAccent1 = 'rgba(40, 215, 235, 0.9)';
  cAccent2 = 'rgba(190, 255, 240, 0.7)';
  cShadow = 'rgba(1, 10, 14, 0.92)';
}

// 1. Deep projection wall background
ctx.fillStyle = cBgDark;
ctx.fillRect(0, 0, W, H);

// Ambient projector spotlight pool on wall
const spotGrad = ctx.createRadialGradient(cx, cy, minDim * 0.05, cx, cy, minDim * 0.75);
const wallLuma = 0.18 + audio.level * 0.12 + (room.state.strobePhase * 0.15);
spotGrad.addColorStop(0, cBeam + (wallLuma * 1.6) + ')');
spotGrad.addColorStop(0.5, cBeam + (wallLuma * 0.7) + ')');
spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = spotGrad;
ctx.fillRect(0, 0, W, H);

// 2. Projected Kinetic Shadows (Shadows of the Modulator cast onto back wall)
const baseScale = minDim * 0.44;
const rot1 = room.state.rot1;
const rot2 = room.state.rot2;
const rotSp = room.state.rotSpiral;
const slide = room.state.shutterSlide;

// Multi-angle lamp shadow sweeps
for (let s = shadowLayers; s >= 1; s--) {
  ctx.save();
  const shadowDist = (s / shadowLayers) * (0.16 + audio.bass * 0.08) * minDim;
  const lampAngle = (s * 1.85) + frame.t * 0.15;
  const offX = Math.cos(lampAngle) * shadowDist;
  const offY = Math.sin(lampAngle) * shadowDist * 0.65;
  const shadowScale = 1.0 + (s * 0.08);
  const shadowAlpha = (0.42 / shadowLayers) * (1.1 - s * 0.12);

  ctx.translate(cx + offX, cy + offY);
  ctx.scale(shadowScale, shadowScale);
  ctx.fillStyle = cShadow;
  ctx.strokeStyle = cShadow;
  ctx.globalAlpha = shadowAlpha;

  // Cast Shadow: Perforated revolving disc
  ctx.save();
  ctx.rotate(rot1 * 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, baseScale * 0.85, 0, Math.PI * 2);
  ctx.lineWidth = baseScale * 0.12;
  ctx.stroke();
  for (let i = 0; i < room.state.outerPerfs.length; i += 2) {
    const p = room.state.outerPerfs[i];
    const pr = p.radFrac * baseScale;
    ctx.beginPath();
    ctx.arc(p.cos * pr, p.sin * pr, p.size * baseScale * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Cast Shadow: Louver Slats & Grilles
  ctx.save();
  ctx.rotate(0.38 + slide * 0.2);
  const slatW = (baseScale * 1.5) / slatsCount;
  for (let k = -slatsCount * 0.5; k < slatsCount * 0.5; k += 2) {
    ctx.fillRect(k * slatW + slide * 25, -baseScale * 0.75, slatW * 0.7, baseScale * 1.5);
  }
  ctx.restore();

  // Cast Shadow: Twisted Glass Spiral Helix
  ctx.beginPath();
  for (let step = 0; step < 70; step++) {
    const frac = step / 70;
    const th = frac * Math.PI * 2 * spiralCoils + rotSp;
    const r = frac * baseScale * 0.7;
    const hx = Math.cos(th) * r;
    const hy = Math.sin(th) * r * 0.38 + (frac - 0.5) * baseScale * 0.9;
    if (step === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
  }
  ctx.lineWidth = 4 + s * 2;
  ctx.stroke();

  ctx.restore();
}

// 3. Volumetric Projection Rays & Caustic Fans
ctx.save();
ctx.globalCompositeOperation = 'screen';
const rayCount = 12;
for (let r = 0; r < rayCount; r++) {
  const rayAng = (r / rayCount) * Math.PI * 2 + rot2 * 0.3;
  const rayWidth = 0.08 + Math.sin(r * 2.3 + frame.t) * 0.04;
  const rayLength = minDim * (0.65 + Math.sin(r + frame.t * 1.2) * 0.15);
  const beamAlpha = (0.05 + audio.mid * 0.08) * beamGlow;
  
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, rayLength, rayAng - rayWidth, rayAng + rayWidth);
  ctx.closePath();
  ctx.fillStyle = cBeam + beamAlpha + ')';
  ctx.fill();
}
ctx.restore();

// 4. Physical Sculpture: The Kinetic Modulator (Foreground Machine)
ctx.save();
ctx.translate(cx, cy);

// Axis hub and stationary Bauhaus reference framework
ctx.lineWidth = 1.5;
ctx.strokeStyle = cMetal;
ctx.globalAlpha = 0.35;
ctx.beginPath();
ctx.arc(0, 0, baseScale * 0.92, 0, Math.PI * 2);
ctx.stroke();

// Stationary vertical calibrated scale column
ctx.strokeStyle = cMetal;
ctx.globalAlpha = 0.5;
ctx.beginPath();
ctx.moveTo(-baseScale * 0.98, -baseScale * 0.95);
ctx.lineTo(-baseScale * 0.98, baseScale * 0.95);
ctx.stroke();
for (let m = -10; m <= 10; m++) {
  ctx.beginPath();
  const my = (m / 10) * baseScale * 0.9;
  ctx.moveTo(-baseScale * 0.98, my);
  ctx.lineTo(-baseScale * (m % 5 === 0 ? 0.92 : 0.95), my);
  ctx.stroke();
}

// Audience interactive rings: Room attendees mapped onto the outer vernier dial
if (room.people && room.people.length > 0) {
  ctx.save();
  for (let idx = 0; idx < room.people.length; idx++) {
    const person = room.people[idx];
    const pAng = (idx / room.people.length) * Math.PI * 2 + rot1 * 0.25;
    const pr = baseScale * 0.92;
    const px = Math.cos(pAng) * pr;
    const py = Math.sin(pAng) * pr;
    ctx.fillStyle = `hsl(${person.hue ?? 0}, 85%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, 3.5 + audio.treble * 3.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `hsla(${person.hue ?? 0}, 90%, 75%, 0.4)`.replace('"', '');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
  ctx.restore();
}

// Component A: Sliding Louver Grille (Metallic slats oscillating horizontally)
ctx.save();
ctx.rotate(0.25);
const gridW = baseScale * 1.35;
const slatStep = gridW / slatsCount;
const shiftX = slide * slatStep * 2;
ctx.lineWidth = slatStep * 0.38;
ctx.strokeStyle = cMetal;
ctx.globalAlpha = 0.65;
for (let i = -slatsCount * 0.5; i <= slatsCount * 0.5; i++) {
  const xpos = i * slatStep + shiftX;
  if (Math.abs(xpos) < gridW * 0.52) {
    ctx.beginPath();
    ctx.moveTo(xpos, -baseScale * 0.65);
    ctx.lineTo(xpos, baseScale * 0.65);
    ctx.stroke();
  }
}
ctx.restore();

// Component B: Primary Perforated Nickel Disc (Rotates counter-clockwise)
ctx.save();
ctx.rotate(rot1);
ctx.strokeStyle = cMetal;
ctx.lineWidth = 3.0;
ctx.globalAlpha = 0.85;
ctx.beginPath();
ctx.arc(0, 0, baseScale * 0.82, 0, Math.PI * 2);
ctx.stroke();

// Outer perforated holes that shutter the projection
for (let i = 0; i < room.state.outerPerfs.length; i++) {
  const p = room.state.outerPerfs[i];
  const pr = p.radFrac * baseScale;
  const hx = p.cos * pr;
  const hy = p.sin * pr;
  const hRad = p.size * baseScale;
  
  ctx.fillStyle = cMetal;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(hx, hy, hRad, 0, Math.PI * 2);
  ctx.fill();

  // Glowing hole aperture
  ctx.fillStyle = cAccent1;
  ctx.globalAlpha = 0.75 + audio.treble * 0.25;
  ctx.beginPath();
  ctx.arc(hx, hy, hRad * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

// Cross-bracing spokes
ctx.lineWidth = 1.8;
ctx.strokeStyle = cMetal;
ctx.globalAlpha = 0.7;
for (let a = 0; a < 4; a++) {
  const ang = (a * Math.PI) / 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(ang) * baseScale * 0.82, Math.sin(ang) * baseScale * 0.82);
  ctx.stroke();
}
ctx.restore();

// Component C: Secondary Perforated Rotor (Rotates clockwise, high speed)
ctx.save();
ctx.rotate(rot2);
ctx.strokeStyle = cAccent2;
ctx.lineWidth = 2.2;
ctx.globalAlpha = 0.8;
ctx.beginPath();
ctx.arc(0, 0, baseScale * 0.52, 0, Math.PI * 2);
ctx.stroke();

for (let j = 0; j < room.state.innerPerfs.length; j++) {
  const ip = room.state.innerPerfs[j];
  const ipr = ip.radFrac * baseScale;
  const ix = ip.cos * ipr;
  const iy = ip.sin * ipr;
  ctx.fillStyle = cMetal;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(ix, iy, ip.size * baseScale, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Component D: 3D Kinetic Glass Helix / Spiral (Luminous optical refractions)
ctx.save();
ctx.rotate(-0.15);
const spiralSteps = 120;
let prevX = 0;
let prevY = 0;
for (let s = 0; s < spiralSteps; s++) {
  const frac = s / spiralSteps;
  const theta = frac * Math.PI * 2 * spiralCoils + rotSp;
  const r = (0.12 + frac * 0.65) * baseScale;
  
  // Perspective projection of a cylindrical coil
  const sx = Math.cos(theta) * r;
  const sy = (frac - 0.5) * baseScale * 1.1 + Math.sin(theta) * r * 0.32;
  const zDepth = Math.sin(theta);

  if (s > 0) {
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(sx, sy);
    
    // Front segments gleam with bright caustic highlights; rear are dimmer
    const frontGleam = (zDepth + 1) * 0.5;
    ctx.lineWidth = 1.5 + frontGleam * 3.5 + audio.treble * 2.0;
    ctx.strokeStyle = frontGleam > 0.6 ? cAccent1 : cMetal;
    ctx.globalAlpha = 0.25 + frontGleam * 0.7;
    ctx.stroke();
  }
  prevX = sx;
  prevY = sy;
}
ctx.restore();

// Component E: Orbiting Polished Chrome Spheres (Reflective mirror balls)
const sphereCount = 3;
for (let b = 0; b < sphereCount; b++) {
  const bAng = rot1 * 1.35 + (b * Math.PI * 2) / sphereCount;
  const bDist = baseScale * (0.28 + b * 0.2);
  const bx = Math.cos(bAng) * bDist;
  const by = Math.sin(bAng) * bDist * 0.7;
  const ballRadius = 6 + b * 3 + audio.bass * 3;

  // Metallic chrome ball with specular hot-point
  const ballGrad = ctx.createRadialGradient(bx - ballRadius * 0.35, by - ballRadius * 0.35, 1, bx, by, ballRadius);
  ballGrad.addColorStop(0, '#ffffff');
  ballGrad.addColorStop(0.3, cMetal);
  ballGrad.addColorStop(0.7, '#3a404a');
  ballGrad.addColorStop(1, '#0c0e12');

  ctx.fillStyle = ballGrad;
  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
  ctx.fill();

  // Specular flare glint
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(bx - ballRadius * 0.32, by - ballRadius * 0.32, ballRadius * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

// Central heavy drive axle / bearing
const hubGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, baseScale * 0.1);
hubGrad.addColorStop(0, '#ffffff');
hubGrad.addColorStop(0.4, cMetal);
hubGrad.addColorStop(0.8, '#1b1d24');
hubGrad.addColorStop(1, '#000000');
ctx.fillStyle = hubGrad;
ctx.globalAlpha = 1.0;
ctx.beginPath();
ctx.arc(0, 0, baseScale * 0.08, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = cMetal;
ctx.lineWidth = 1.5;
ctx.stroke();

ctx.restore();

// 5. Film Projection Vignette & Film Shutter Flicker
ctx.save();
const borderGrad = ctx.createRadialGradient(cx, cy, minDim * 0.5, cx, cy, minDim * 0.95);
borderGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
borderGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.45)');
borderGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
ctx.fillStyle = borderGrad;
ctx.fillRect(0, 0, W, H);

// Subtle vintage shutter bar lines
if (strobeOn) {
  const shutterBarY = ((frame.t * 180) % H);
  ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.015 + audio.treble * 0.025) + ')';
  ctx.fillRect(0, shutterBarY, W, 8);
}
ctx.restore();

ctx.restore();