ctx.save();
const W = frame.width, H = frame.height;
const cx = W * 0.5, cy = H * 0.5;
const scale = Math.min(W, H) * 0.36;

// --- Variable Lookups ---
const pointsMap = { '4-Point': 4, '5-Point': 5, '6-Point': 6, '8-Point': 8 };
const nPoints = pointsMap[getVar('star_points')] ?? 5;

const paletteKey = getVar('chrome_palette') ?? 'horizon';
const depthMult = getVar('depth_style') ?? 0.6;
const spinSpeed = getVar('spin_speed') ?? 0.8;
const flareScale = getVar('flare_intensity') ?? 0.7;

// --- Preallocated Persistent Buffers in room.state ---
room.state.mesh ??= { n: 0, depth: 0, verts: [], faces: [] };
room.state.tVerts ??= [];
room.state.drawList ??= [];

// Rebuild mesh only when point count or depth changes
if (room.state.mesh.n !== nPoints || room.state.mesh.depth !== depthMult) {
  const m = room.state.mesh;
  m.n = nPoints;
  m.depth = depthMult;
  m.verts = [];
  m.faces = [];
  const totalPts = nPoints * 2;
  const rOuter = 1.0;
  const rInner = nPoints === 4 ? 0.38 : (nPoints === 5 ? 0.44 : (nPoints === 6 ? 0.5 : 0.58));
  const d = depthMult * 0.4;
  const apexD = depthMult * 0.75;

  // Vertices:
  // 0: Front Apex (0, 0, apexD)
  m.verts.push([0, 0, apexD]);
  // 1 .. totalPts: Front perimeter (z = d)
  for (let i = 0; i < totalPts; i++) {
    const a = (i * Math.PI) / nPoints - Math.PI * 0.5;
    const r = (i % 2 === 0) ? rOuter : rInner;
    m.verts.push([Math.cos(a) * r, Math.sin(a) * r, d]);
  }
  // totalPts + 1 .. 2 * totalPts: Back perimeter (z = -d)
  for (let i = 0; i < totalPts; i++) {
    const a = (i * Math.PI) / nPoints - Math.PI * 0.5;
    const r = (i % 2 === 0) ? rOuter : rInner;
    m.verts.push([Math.cos(a) * r, Math.sin(a) * r, -d]);
  }
  // 2 * totalPts + 1: Back Apex (0, 0, -apexD)
  m.verts.push([0, 0, -apexD]);

  const backApexIdx = 2 * totalPts + 1;

  // Front Cap Triangles
  for (let i = 0; i < totalPts; i++) {
    const next = (i + 1) % totalPts;
    m.faces.push({ a: 0, b: 1 + i, c: 1 + next });
  }
  // Side Quads (split into 2 triangles each)
  for (let i = 0; i < totalPts; i++) {
    const next = (i + 1) % totalPts;
    const f1 = 1 + i, f2 = 1 + next;
    const b1 = 1 + totalPts + i, b2 = 1 + totalPts + next;
    m.faces.push({ a: f1, b: b1, c: f2 });
    m.faces.push({ a: f2, b: b1, c: b2 });
  }
  // Back Cap Triangles (clockwise for outward normal)
  for (let i = 0; i < totalPts; i++) {
    const next = (i + 1) % totalPts;
    const b1 = 1 + totalPts + i, b2 = 1 + totalPts + next;
    m.faces.push({ a: backApexIdx, b: b2, c: b1 });
  }
}

const mesh = room.state.mesh;

// --- Audio Reactivity & Animation Angles ---
const bassBump = (audio.bass || 0) * 0.16;
const beatPulse = audio.beat ? 1.0 : 0.0;
room.state.flash = Math.max(0, (room.state.flash ?? 0) * 0.9 + beatPulse * 0.3);

const t = frame.t * spinSpeed;
const ax = t * 0.72 + Math.sin(t * 0.3) * 0.4;
const ay = t * 1.15;
const az = t * 0.35;

const cxR = Math.cos(ax), sxR = Math.sin(ax);
const cyR = Math.cos(ay), syR = Math.sin(ay);
const czR = Math.cos(az), szR = Math.sin(az);

// --- Dark Ambient Background with Slowly Turning Light ---
const lightAngle = frame.t * 0.4;
const lx = cx + Math.cos(lightAngle) * W * 0.42;
const ly = cy + Math.sin(lightAngle) * H * 0.38;
const bgGrad = ctx.createRadialGradient(lx, ly, W * 0.05, cx, cy, Math.max(W, H) * 0.85);
bgGrad.addColorStop(0, '#101524');
bgGrad.addColorStop(0.45, '#06080e');
bgGrad.addColorStop(1, '#010204');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Subtle CRT / demoscene vignette floor line
ctx.strokeStyle = 'rgba(40, 60, 90, 0.15)';
ctx.lineWidth = 1;
for (let y = 0; y < H; y += 4) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}

// --- Transform Vertices to Camera Space ---
const effScale = scale * (1.0 + bassBump);
const camDist = 3.6;
const tVerts = room.state.tVerts;
while (tVerts.length < mesh.verts.length) tVerts.push({ x: 0, y: 0, z: 0, px: 0, py: 0 });

for (let i = 0; i < mesh.verts.length; i++) {
  const v = mesh.verts[i];
  let x = v[0], y = v[1], z = v[2];

  // Rotate Y
  let x1 = x * cyR + z * syR;
  let z1 = -x * syR + z * cyR;
  // Rotate X
  let y2 = y * cxR - z1 * sxR;
  let z2 = y * sxR + z1 * cxR;
  // Rotate Z
  let x3 = x1 * czR - y2 * szR;
  let y3 = x1 * szR + y2 * czR;
  let z3 = z2;

  const pz = z3 + camDist;
  const fov = 1.0 / pz;
  const tv = tVerts[i];
  tv.x = x3;
  tv.y = y3;
  tv.z = z3;
  tv.px = cx + x3 * effScale * fov * 3.2;
  tv.py = cy - y3 * effScale * fov * 3.2;
}

// --- Palette Shading Definition ---
function computeChrome(ny, spec, pal) {
  const tNorm = ny * 0.5 + 0.5; // 0 to 1
  const ridge = Math.exp(-Math.pow((tNorm - 0.5) * 16.0, 2)); // razor sharp horizon
  let r = 0, g = 0, b = 0;

  if (pal === 'mercury') {
    if (tNorm >= 0.5) {
      const s = (tNorm - 0.5) * 2.0;
      r = 130 + s * 100; g = 145 + s * 95; b = 175 + s * 80;
    } else {
      const gnd = tNorm * 2.0;
      r = 15 + gnd * 65; g = 18 + gnd * 70; b = 25 + gnd * 80;
    }
    r += ridge * 120; g += ridge * 120; b += ridge * 140;
  } else if (pal === 'cyberpunk') {
    if (tNorm >= 0.5) {
      const s = (tNorm - 0.5) * 2.0;
      r = 240 - s * 140; g = 40 + s * 10; b = 180 + s * 60;
    } else {
      const gnd = tNorm * 2.0;
      r = 10 + gnd * 20; g = 20 + gnd * 180; b = 40 + gnd * 190;
    }
    r += ridge * 180; g += ridge * 160; b += ridge * 40;
  } else if (pal === 'gold') {
    if (tNorm >= 0.5) {
      const s = (tNorm - 0.5) * 2.0;
      r = 60 + s * 70; g = 80 + s * 110; b = 140 + s * 100;
    } else {
      const gnd = tNorm * 2.0;
      r = 30 + gnd * 160; g = 15 + gnd * 95; b = 5 + gnd * 20;
    }
    r += ridge * 190; g += ridge * 160; b += ridge * 30;
  } else {
    // Classic Amiga horizon chrome
    if (tNorm >= 0.5) {
      const s = (tNorm - 0.5) * 2.0;
      r = 40 + s * 110; g = 90 + s * 120; b = 170 + s * 85;
    } else {
      const gnd = tNorm * 2.0;
      r = 35 + gnd * 130; g = 22 + gnd * 80; b = 12 + gnd * 35;
    }
    r += ridge * 165; g += ridge * 165; b += ridge * 165;
  }

  // Specular blast + beat flash
  const sp = spec * 170 + room.state.flash * 90;
  r = Math.min(255, Math.max(0, (r + sp) | 0));
  g = Math.min(255, Math.max(0, (g + sp) | 0));
  b = Math.min(255, Math.max(0, (b + sp) | 0));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// --- Face Processing, Backface Culling & Depth Sort ---
const drawList = room.state.drawList;
drawList.length = 0;

// Light direction in camera space
const ldx = 0.577, ldy = 0.577, ldz = 0.577;

for (let i = 0; i < mesh.faces.length; i++) {
  const f = mesh.faces[i];
  const vA = tVerts[f.a];
  const vB = tVerts[f.b];
  const vC = tVerts[f.c];

  // Screen space 2D cross product for front-facing test
  const e1x = vB.px - vA.px, e1y = vB.py - vA.py;
  const e2x = vC.px - vA.px, e2y = vC.py - vA.py;
  const crossZ = e1x * e2y - e1y * e2x;
  if (crossZ <= 0) continue; // Cull back faces

  // 3D face normal for lighting & chrome reflection
  const abx = vB.x - vA.x, aby = vB.y - vA.y, abz = vB.z - vA.z;
  const acx = vC.x - vA.x, acy = vC.y - vA.y, acz = vC.z - vA.z;
  let nx = aby * acz - abz * acy;
  let ny = abz * acx - abx * acz;
  let nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;

  // Specular reflection (Blinn-Phong approx in camera space)
  const dotL = Math.max(0, nx * ldx + ny * ldy + nz * ldz);
  const spec = Math.pow(dotL, 12);

  const depthZ = vA.z + vB.z + vC.z;
  drawList.push({
    a: vA, b: vB, c: vC,
    z: depthZ,
    color: computeChrome(ny, spec, paletteKey)
  });
}

// Sort faces Painter's order (back-to-front)
drawList.sort((f1, f2) => f1.z - f2.z);

// --- Render Chrome Triangles ---
for (let i = 0; i < drawList.length; i++) {
  const face = drawList[i];
  ctx.beginPath();
  ctx.moveTo(face.a.px, face.a.py);
  ctx.lineTo(face.b.px, face.b.py);
  ctx.lineTo(face.c.px, face.c.py);
  ctx.closePath();
  ctx.fillStyle = face.color;
  ctx.fill();
  ctx.strokeStyle = face.color;
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

// --- Connected People Satellites ---
const people = room.people ?? [];
for (let i = 0; i < people.length; i++) {
  const p = people[i];
  const pAng = frame.t * 1.5 + (i * Math.PI * 2) / Math.max(1, people.length);
  const pDist = effScale * 1.35;
  const sx = cx + Math.cos(pAng) * pDist;
  const sy = cy + Math.sin(pAng * 1.3) * pDist * 0.45;
  const pHue = p.hue ?? 200;

  ctx.fillStyle = 'hsla(' + pHue + ', 90%, 65%, 0.85)';
  ctx.beginPath();
  ctx.arc(sx, sy, 3 + bassBump * 8, 0, Math.PI * 2);
  ctx.fill();
}

// --- Demoscene Glint / Lens Flare at Front Apex ---
if (flareScale > 0.05) {
  const apex = tVerts[0];
  if (apex.z > 0) {
    const flareAlpha = Math.min(1.0, (0.4 + (audio.treble || 0) * 0.6 + room.state.flash * 0.5) * flareScale);
    const glintSize = (20 + (audio.treble || 0) * 35) * flareScale;

    ctx.save();
    ctx.translate(apex.px, apex.py);
    ctx.globalCompositeOperation = 'lighter';

    const radG = ctx.createRadialGradient(0, 0, 0, 0, 0, glintSize);
    radG.addColorStop(0, 'rgba(255, 255, 255, ' + flareAlpha + ')');
    radG.addColorStop(0.3, 'rgba(180, 220, 255, ' + (flareAlpha * 0.6) + ')');
    radG.addColorStop(1, 'rgba(100, 160, 255, 0)');
    ctx.fillStyle = radG;
    ctx.beginPath();
    ctx.arc(0, 0, glintSize, 0, Math.PI * 2);
    ctx.fill();

    // 4-point cross glint beam
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + (flareAlpha * 0.8) + ')';
    ctx.lineWidth = 1.5;
    const beamL = glintSize * 2.2;
    ctx.beginPath();
    ctx.moveTo(-beamL, 0); ctx.lineTo(beamL, 0);
    ctx.moveTo(0, -beamL); ctx.lineTo(0, beamL);
    ctx.stroke();

    ctx.restore();
  }
}

ctx.restore();