ctx.save();

// --- Persistent State Initialization ---
room.state.init ??= false;
if (!room.state.init) {
  room.state.crankPhase = 0;
  // Fixed-size joint buffers: [x, y] pairs for joints O, A, C, B, D, E, F (7 joints * 2 = 14 floats per leg)
  // 8 leg pairs per beast max, up to 8 beasts = 64 legs * 14 = 896 floats
  room.state.jointBuffer = new Float32Array(1024);
  // Dust / sand kicked up buffer
  room.state.dust = new Float32Array(200 * 4); // [x, y, vx, vy]
  room.state.dustCount = 0;
  room.state.init = true;
}

// --- Variable & Audio Ingestion ---
const palChoice = getVar('palette') ?? 'Amber Dusk';
const linkStyle = getVar('link_style') ?? 'Shadow Silhouette';
const herdCount = Math.min(8, Math.max(2, Math.round(getVar('herd_size') ?? 4)));
const speedMult = getVar('stride_speed') ?? 1.2;
const scaleBase = getVar('scale_size') ?? 1.0;
const tideReflect = getVar('tide_reflection') ?? 0.5;

const W = frame.width;
const H = frame.height;
const bass = audio.bass || 0;
const level = audio.level || 0;

// Advance crank angle with audio boost
const dt = Math.min(frame.dt || 0.016, 0.05);
room.state.crankPhase += dt * speedMult * (1.8 + bass * 1.5);
const phase = room.state.crankPhase;

// --- Palette Themes ---
const palettes = {
  'Amber Dusk': {
    skyTop: '#13111c', skyMid: '#5c2a38', skyLow: '#d9653b', horizon: '#f4a259',
    sand: '#18121a', wetSand: '#2b1b22', sun: 'rgba(255, 230, 180, 0.9)', sunGlow: 'rgba(244, 162, 89, 0.25)',
    ambient: [244, 162, 89]
  },
  'Crimson Tide': {
    skyTop: '#0d0814', skyMid: '#400d23', skyLow: '#8c1d35', horizon: '#e63946',
    sand: '#140810', wetSand: '#240d1a', sun: 'rgba(255, 200, 200, 0.85)', sunGlow: 'rgba(230, 57, 70, 0.28)',
    ambient: [230, 57, 70]
  },
  'Deep Twilight': {
    skyTop: '#050814', skyMid: '#121f3d', skyLow: '#243b6b', horizon: '#688bb5',
    sand: '#0a0d14', wetSand: '#121a29', sun: 'rgba(210, 230, 255, 0.75)', sunGlow: 'rgba(104, 139, 181, 0.22)',
    ambient: [104, 139, 181]
  },
  'Neon Horizon': {
    skyTop: '#0a0217', skyMid: '#280644', skyLow: '#6a0dad', horizon: '#00f5d4',
    sand: '#0a0512', wetSand: '#190a2a', sun: 'rgba(0, 245, 212, 0.85)', sunGlow: 'rgba(0, 245, 212, 0.25)',
    ambient: [0, 245, 212]
  }
};
const pal = palettes[palChoice] ?? palettes['Amber Dusk'];

// --- Horizon & Ground Geometry ---
const groundY = H * 0.72;

// Draw Sky Gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
skyGrad.addColorStop(0, pal.skyTop);
skyGrad.addColorStop(0.45, pal.skyMid);
skyGrad.addColorStop(0.82, pal.skyLow);
skyGrad.addColorStop(1, pal.horizon);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, groundY);

// Sun at Horizon
const sunX = W * 0.76;
const sunY = groundY - H * 0.05;
const sunRadius = Math.min(W, H) * (0.07 + bass * 0.015);

const glowGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 4.5);
glowGrad.addColorStop(0, pal.sun);
glowGrad.addColorStop(0.35, pal.sunGlow);
glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = glowGrad;
ctx.beginPath();
ctx.arc(sunX, sunY, sunRadius * 4.5, 0, Math.PI * 2);
ctx.fill();

ctx.fillStyle = pal.sun;
ctx.beginPath();
ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
ctx.fill();

// Distant shoreline & haze
ctx.fillStyle = pal.horizon;
ctx.globalAlpha = 0.35;
ctx.fillRect(0, groundY - 2, W, 3);
ctx.globalAlpha = 1.0;

// Draw Wet Sand / Beach Ground
const sandGrad = ctx.createLinearGradient(0, groundY, 0, H);
sandGrad.addColorStop(0, pal.wetSand);
sandGrad.addColorStop(0.3, pal.sand);
sandGrad.addColorStop(1, '#050308');
ctx.fillStyle = sandGrad;
ctx.fillRect(0, groundY, W, H - groundY);

// Tidal sheen on wet sand
const sheenGrad = ctx.createLinearGradient(0, groundY, 0, groundY + (H - groundY) * 0.7);
sheenGrad.addColorStop(0, `rgba(${pal.ambient[0]}, ${pal.ambient[1]}, ${pal.ambient[2]}, ${0.25 * tideReflect})`);
sheenGrad.addColorStop(0.6, `rgba(${pal.ambient[0]}, ${pal.ambient[1]}, ${pal.ambient[2]}, ${0.05 * tideReflect})`);
sheenGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = sheenGrad;
ctx.fillRect(0, groundY, W, H - groundY);

// Subtle tidal wave lines
ctx.strokeStyle = `rgba(${pal.ambient[0]}, ${pal.ambient[1]}, ${pal.ambient[2]}, 0.18)`;
ctx.lineWidth = 1.5;
for (let i = 0; i < 3; i++) {
  const wy = groundY + 18 + i * 22;
  const wavePhase = frame.t * 0.6 + i * 1.7;
  ctx.beginPath();
  for (let wx = 0; wx <= W; wx += 40) {
    const off = Math.sin(wx * 0.008 + wavePhase) * 4 + Math.sin(wx * 0.02 - wavePhase * 0.5) * 2;
    if (wx === 0) ctx.moveTo(wx, wy + off);
    else ctx.lineTo(wx, wy + off);
  }
  ctx.stroke();
}

// --- Jansen Linkage Solver ---
// Holy numbers (Theo Jansen canonical ratios scaled):
// Crank radius: 15.0
// Fixed pivot relative to crank O(0,0): A = (-38.0, 7.8)
// b = 41.5 (A to B),   j = 50.0 (C to B)
// d = 40.1 (B to D),   e = 55.8 (C to D)
// c = 39.3 (A to E),   k = 61.9 (B to E)
// h = 65.7 (D to F),   i = 49.0 (E to F)
// Joints: O=crank center, A=fixed frame joint, C=crank pin,
// B, D, E=triangulated nodes, F=foot.
function solveCircleIntersection(x1, y1, r1, x2, y2, r2, flipSign, out, idx) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d2 = dx * dx + dy * dy;
  const d = Math.sqrt(d2);
  if (d < 0.0001 || d > (r1 + r2) || d < Math.abs(r1 - r2)) {
    out[idx] = x1 + (r1 / (r1 + r2)) * dx;
    out[idx + 1] = y1 + (r1 / (r1 + r2)) * dy;
    return;
  }
  const a = (r1 * r1 - r2 * r2 + d2) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, h2));
  const px = x1 + (a * dx) / d;
  const py = y1 + (a * dy) / d;
  const sign = flipSign ? 1 : -1;
  out[idx] = px + (sign * h * (-dy)) / d;
  out[idx + 1] = py + (sign * h * dx) / d;
}

// Solve one Jansen leg at a given crank angle
// Stores into buf starting at offset:
// [Ox, Oy, Ax, Ay, Cx, Cy, Bx, By, Dx, Dy, Ex, Ey, Fx, Fy]
function solveJansenLeg(crankAngle, flipX, buf, off) {
  const s = flipX ? -1 : 1;
  const Ox = 0;
  const Oy = 0;
  // Fixed joint A is shifted up/left from crank
  const Ax = -38.0 * s;
  const Ay = -7.8;

  // Crank pin C
  const Cx = Math.cos(crankAngle) * 15.0 * s;
  const Cy = Math.sin(crankAngle) * 15.0;

  buf[off + 0] = Ox; buf[off + 1] = Oy;
  buf[off + 2] = Ax; buf[off + 3] = Ay;
  buf[off + 4] = Cx; buf[off + 5] = Cy;

  // Solve B: dist(A,B)=41.5, dist(C,B)=50.0
  solveCircleIntersection(Ax, Ay, 41.5, Cx, Cy, 50.0, !flipX, buf, off + 6);
  const Bx = buf[off + 6], By = buf[off + 7];

  // Solve D: dist(B,D)=40.1, dist(C,D)=55.8
  solveCircleIntersection(Bx, By, 40.1, Cx, Cy, 55.8, !flipX, buf, off + 8);
  const Dx = buf[off + 8], Dy = buf[off + 9];

  // Solve E: dist(A,E)=39.3, dist(B,E)=61.9
  solveCircleIntersection(Ax, Ay, 39.3, Bx, By, 61.9, flipX, buf, off + 10);
  const Ex = buf[off + 10], Ey = buf[off + 11];

  // Solve Foot F: dist(D,F)=65.7, dist(E,F)=49.0
  solveCircleIntersection(Dx, Dy, 65.7, Ex, Ey, 49.0, !flipX, buf, off + 12);
}

// Render a single Jansen leg from solved buffer
function drawLeg(buf, off, colorStroke, fillStyle, lw, isMirror, mirrorY) {
  const Ox = buf[off+0], Oy = isMirror ? mirrorY - (buf[off+1] - mirrorY) : buf[off+1];
  const Ax = buf[off+2], Ay = isMirror ? mirrorY - (buf[off+3] - mirrorY) : buf[off+3];
  const Cx = buf[off+4], Cy = isMirror ? mirrorY - (buf[off+5] - mirrorY) : buf[off+5];
  const Bx = buf[off+6], By = isMirror ? mirrorY - (buf[off+7] - mirrorY) : buf[off+7];
  const Dx = buf[off+8], Dy = isMirror ? mirrorY - (buf[off+9] - mirrorY) : buf[off+9];
  const Ex = buf[off+10], Ey = isMirror ? mirrorY - (buf[off+11] - mirrorY) : buf[off+11];
  const Fx = buf[off+12], Fy = isMirror ? mirrorY - (buf[off+13] - mirrorY) : buf[off+13];

  // Filled triangular struts for structural silhouette feel
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    // Triangle B-C-D
    ctx.beginPath();
    ctx.moveTo(Bx, By); ctx.lineTo(Cx, Cy); ctx.lineTo(Dx, Dy); ctx.closePath();
    ctx.fill();
    // Triangle D-E-F (the lower leg / foot triangle)
    ctx.beginPath();
    ctx.moveTo(Dx, Dy); ctx.lineTo(Ex, Ey); ctx.lineTo(Fx, Fy); ctx.closePath();
    ctx.fill();
    // Triangle A-B-E
    ctx.beginPath();
    ctx.moveTo(Ax, Ay); ctx.lineTo(Bx, By); ctx.lineTo(Ex, Ey); ctx.closePath();
    ctx.fill();
  }

  // Linkage Rods
  ctx.strokeStyle = colorStroke;
  ctx.lineWidth = lw;
  ctx.beginPath();
  // Crank link
  ctx.moveTo(Ox, Oy); ctx.lineTo(Cx, Cy);
  // Triangle 1 links
  ctx.moveTo(Ax, Ay); ctx.lineTo(Bx, By); ctx.lineTo(Cx, Cy);
  // Triangle 2 links
  ctx.moveTo(Bx, By); ctx.lineTo(Dx, Dy); ctx.lineTo(Cx, Cy);
  // Triangle 3 links
  ctx.moveTo(Ax, Ay); ctx.lineTo(Ex, Ey); ctx.lineTo(Bx, By);
  // Foot triangle links
  ctx.moveTo(Dx, Dy); ctx.lineTo(Fx, Fy); ctx.lineTo(Ex, Ey); ctx.lineTo(Dx, Dy);
  ctx.stroke();

  // Joint rivets / pivot dots
  if (lw >= 1.5) {
    ctx.fillStyle = colorStroke;
    const r = lw * 0.9;
    ctx.beginPath();
    ctx.arc(Cx, Cy, r, 0, Math.PI*2);
    ctx.arc(Bx, By, r, 0, Math.PI*2);
    ctx.arc(Dx, Dy, r, 0, Math.PI*2);
    ctx.arc(Ex, Ey, r, 0, Math.PI*2);
    ctx.arc(Fx, Fy, r * 1.3, 0, Math.PI*2); // foot pad
    ctx.fill();
  }
}

// --- Style Resolver ---
let baseColor, backLegColor, fillTriColor, bodySpineColor, glowJoints;
if (linkStyle === 'Shadow Silhouette') {
  baseColor = 'rgba(18, 12, 22, 0.95)';
  backLegColor = 'rgba(45, 28, 48, 0.65)';
  fillTriColor = 'rgba(28, 18, 34, 0.45)';
  bodySpineColor = '#120c16';
  glowJoints = false;
} else if (linkStyle === 'Brass Steampunk') {
  baseColor = '#d4af37';
  backLegColor = 'rgba(150, 100, 30, 0.6)';
  fillTriColor = 'rgba(212, 175, 55, 0.18)';
  bodySpineColor = '#b8860b';
  glowJoints = true;
} else if (linkStyle === 'Skeletal Wire') {
  baseColor = 'rgba(230, 235, 245, 0.85)';
  backLegColor = 'rgba(120, 140, 170, 0.45)';
  fillTriColor = 'rgba(200, 220, 255, 0.08)';
  bodySpineColor = '#e6ebf5';
  glowJoints = true;
} else { // Luminous Ribs
  baseColor = `rgba(${pal.ambient[0]}, ${pal.ambient[1]}, ${pal.ambient[2]}, 0.9)`;
  backLegColor = `rgba(${pal.ambient[0]}, ${pal.ambient[1]}, ${pal.ambient[2]}, 0.35)`;
  fillTriColor = `rgba(${pal.ambient[0]}, ${pal.ambient[1]}, ${pal.ambient[2]}, 0.15)`;
  bodySpineColor = `rgb(${pal.ambient[0]}, ${pal.ambient[1]}, ${pal.ambient[2]})`;
  glowJoints = true;
}

// --- Herd Motion & Setup ---
// Sort beasts from background (small, slow) to foreground (large, fast)
const beasts = [];
for (let b = 0; b < herdCount; b++) {
  const depth = (b + 0.5) / herdCount; // 0 = farthest, 1 = nearest
  // Stagger positions across the beach
  const travelDist = W * 1.6;
  const speed = (0.25 + depth * 0.75) * 60 * speedMult;
  const baseX = (depth * 987 + phase * speed * 45) % travelDist - travelDist * 0.15;
  // Scale according to depth
  const scale = (0.35 + depth * 0.65) * scaleBase * (H / 900);
  const y = groundY - 20 * scale - (1 - depth) * 25;
  beasts.push({ id: b, depth, x: baseX, y, scale });
}
beasts.sort((a, b) => a.depth - b.depth);

// Loop over each beast in depth order
for (let bi = 0; bi < beasts.length; bi++) {
  const beast = beasts[bi];
  const scale = beast.scale;
  const bx = beast.x;
  const by = beast.y;
  const legCount = 6; // 6 leg pairs (12 legs per beast) - classic Jansen chassis
  const chassisLength = 110 * scale;
  const legSpacing = chassisLength / (legCount - 1);

  // Room people association: each person can cast an aura or lantern atop a beast
  const person = (room.people && room.people.length > 0) ? room.people[bi % room.people.length] : null;

  ctx.save();
  ctx.translate(bx, by);

  // Scale coordinate system: canonical Jansen math has height ~120 units
  // Foot reaches ~ +100 Y. We scale so foot kisses the ground plane precisely.
  const animScale = scale * 0.85;

  // --- PASS 1: Tidal Mirror Reflection (if enabled) ---
  if (tideReflect > 0.05) {
    ctx.save();
    // Foot contact is roughly at Y = +90 * animScale
    const footContactY = 88 * animScale;
    ctx.translate(0, footContactY);
    ctx.scale(1, -0.65); // flip and squash reflection
    ctx.translate(0, -footContactY);
    ctx.globalAlpha = 0.22 * tideReflect * beast.depth;

    // Render mirrored legs
    for (let li = 0; li < legCount; li++) {
      const legX = -chassisLength * 0.5 + li * legSpacing;
      const legAngle = phase * 2.0 + (li * Math.PI * 2) / legCount;
      
      // Back & front legs
      solveJansenLeg(legAngle + Math.PI, false, room.state.jointBuffer, 0);
      solveJansenLeg(legAngle, true, room.state.jointBuffer, 14);

      ctx.save();
      ctx.translate(legX, 0);
      ctx.scale(animScale, animScale);
      drawLeg(room.state.jointBuffer, 0, pal.horizon, null, 1.2, false, 0);
      drawLeg(room.state.jointBuffer, 14, pal.horizon, null, 1.2, false, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // --- PASS 2: Background Legs (Far side of chassis) ---
  ctx.globalAlpha = 0.55 + beast.depth * 0.35;
  for (let li = 0; li < legCount; li++) {
    const legX = -chassisLength * 0.5 + li * legSpacing;
    const legAngle = phase * 2.0 + (li * Math.PI * 2) / legCount + Math.PI; // 180 deg out of phase

    solveJansenLeg(legAngle, false, room.state.jointBuffer, 0);

    ctx.save();
    ctx.translate(legX, 0);
    ctx.scale(animScale, animScale);
    drawLeg(room.state.jointBuffer, 0, backLegColor, null, 1.2 * scale, false, 0);
    ctx.restore();
  }

  // --- PASS 3: Central Spine / Drive Crank Shaft & Wings ---
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = bodySpineColor;
  ctx.lineWidth = Math.max(2, 3.5 * scale);
  ctx.beginPath();
  ctx.moveTo(-chassisLength * 0.58, 0);
  ctx.lineTo(chassisLength * 0.58, 0);
  // Fixed frame upper backbone (connects all A joints at y = -7.8 * animScale)
  ctx.moveTo(-chassisLength * 0.58, -7.8 * animScale);
  ctx.lineTo(chassisLength * 0.58, -7.8 * animScale);
  // Cross struts connecting backbone
  for (let li = 0; li < legCount; li++) {
    const lx = -chassisLength * 0.5 + li * legSpacing;
    ctx.moveTo(lx, 0); ctx.lineTo(lx, -7.8 * animScale);
  }
  ctx.stroke();

  // Strandbeest wind-propeller / decorative fan sails atop the chassis
  const sailHeight = 45 * animScale;
  const sailY = -12 * animScale;
  ctx.save();
  ctx.strokeStyle = `rgba(${pal.ambient[0]}, ${pal.ambient[1]}, ${pal.ambient[2]}, 0.75)`;
  ctx.lineWidth = 1.2 * scale;
  for (let s = -2; s <= 2; s++) {
    const sx = s * (chassisLength * 0.18);
    const flap = Math.sin(phase * 4 + s) * (6 * animScale);
    ctx.beginPath();
    ctx.moveTo(sx, sailY);
    ctx.lineTo(sx - 8 * animScale + flap, sailY - sailHeight);
    ctx.lineTo(sx + 8 * animScale + flap, sailY - sailHeight);
    ctx.closePath();
    ctx.stroke();
    if (fillTriColor) {
      ctx.fillStyle = fillTriColor;
      ctx.fill();
    }
  }
  ctx.restore();

  // Lantern / Room Persona Glow on lead machine mast
  if (person || beast.depth > 0.8) {
    const glowHue = person ? person.hue : pal.ambient[0];
    const mastX = chassisLength * 0.52;
    const mastY = sailY - sailHeight * 0.9;
    ctx.save();
    ctx.fillStyle = person ? `hsl(${glowHue}, 90%, 65%)` : pal.sun;
    ctx.shadowColor = person ? `hsl(${glowHue}, 90%, 60%)` : pal.sun;
    ctx.shadowBlur = 14 * scaleBase * (1 + bass * 0.8);
    ctx.beginPath();
    ctx.arc(mastX, mastY, 3.5 * scaleBase, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- PASS 4: Foreground Legs (Near side of chassis) ---
  ctx.globalAlpha = 1.0;
  for (let li = 0; li < legCount; li++) {
    const legX = -chassisLength * 0.5 + li * legSpacing;
    const legAngle = phase * 2.0 + (li * Math.PI * 2) / legCount;

    // Foreground leg is mirrored (flips x coordinates) to stride naturally on the near side
    solveJansenLeg(legAngle, true, room.state.jointBuffer, 14);

    ctx.save();
    ctx.translate(legX, 0);
    ctx.scale(animScale, animScale);
    drawLeg(room.state.jointBuffer, 14, baseColor, fillTriColor, 1.8 * scale, false, 0);
    ctx.restore();
  }

  ctx.restore();
}

// --- Foreground Tidal Froth & Ambient Beach Atmosphere ---
ctx.globalAlpha = 0.3;
ctx.fillStyle = pal.horizon;
for (let i = 0; i < 40; i++) {
  const fx = ((i * 137.5 + frame.t * 30) % W);
  const fy = groundY + ((i * 47) % (H - groundY));
  const fw = 30 + ((i * 23) % 80);
  ctx.fillRect(fx, fy, fw, 1.2);
}

ctx.restore();