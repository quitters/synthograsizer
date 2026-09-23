const shapesChoice = getVar('poly_shapes') ?? 'Octa & Icosa';
const palChoice = getVar('palette') ?? 'Amiga Neon';
const blendChoice = getVar('blend_style') ?? 'Glenz Glass';
const rotSpeed = getVar('rot_speed') ?? 0.8;
const wireGlow = getVar('wire_glow') ?? 1.5;
const beatSwell = getVar('beat_swell') ?? 0.35;
const starsChoice = getVar('star_field') ?? 'Subtle Dust';

if (!room.state.init) {
  const phi = (1 + Math.sqrt(5)) * 0.5;
  const norm = (v) => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  };

  const rawIcoV = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
  ].map(norm);

  const icoF = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  const rawOctV = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
  ].map(norm);

  const octF = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]
  ];

  const rawCubeV = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
  ].map(norm);

  const cubeF = [
    [0, 1, 2], [0, 2, 3], [5, 4, 7], [5, 7, 6],
    [4, 0, 3], [4, 3, 7], [1, 5, 6], [1, 6, 2],
    [3, 2, 6], [3, 6, 7], [4, 5, 1], [4, 1, 0]
  ];

  room.state.models = {
    icosa: { v: rawIcoV, f: icoF },
    octa: { v: rawOctV, f: octF },
    cube: { v: rawCubeV, f: cubeF }
  };

  room.state.stars = Array.from({ length: 90 }, (_, i) => ({
    x: (Math.sin(i * 12.989) * 0.5 + 0.5),
    y: (Math.cos(i * 43.123) * 0.5 + 0.5),
    z: ((i * 37) % 100) / 100,
    sz: 0.8 + ((i * 7) % 3)
  }));

  room.state.swell = 0;
  room.state.vProjOut = [];
  room.state.vProjIn = [];
  room.state.renderQueue = [];
  room.state.init = true;
}

const palettes = {
  'Amiga Neon': {
    outRGB: [0, 220, 240],
    inRGB: [255, 40, 170],
    outEdge: '#44ffff',
    inEdge: '#ff66dd',
    bg1: '#05030f',
    bg2: '#100a26'
  },
  'Cyber Emerald': {
    outRGB: [0, 245, 140],
    inRGB: [255, 185, 25],
    outEdge: '#55ffbb',
    inEdge: '#ffe566',
    bg1: '#010d08',
    bg2: '#061c16'
  },
  'Vapor Glass': {
    outRGB: [160, 90, 255],
    inRGB: [30, 240, 210],
    outEdge: '#c499ff',
    inEdge: '#7affea',
    bg1: '#070214',
    bg2: '#1a062c'
  },
  'Solar Flare': {
    outRGB: [255, 60, 40],
    inRGB: [255, 215, 30],
    outEdge: '#ff8566',
    inEdge: '#fff377',
    bg1: '#120404',
    bg2: '#240909'
  }
};

const pal = palettes[palChoice] ?? palettes['Amiga Neon'];

const pairMap = {
  'Octa & Icosa': { outer: 'icosa', inner: 'octa', scaleOut: 1.0, scaleIn: 0.52 },
  'Cube & Octa': { outer: 'cube', inner: 'octa', scaleOut: 0.95, scaleIn: 0.55 },
  'Dual Icosa': { outer: 'icosa', inner: 'icosa', scaleOut: 1.05, scaleIn: 0.5 }
};
const pair = pairMap[shapesChoice] ?? pairMap['Octa & Icosa'];
const mOut = room.state.models[pair.outer];
const mIn = room.state.models[pair.inner];

const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const cy = h * 0.5;
const minDim = Math.min(w, h);

// Beat physics & smoothing
const targetSwell = (audio.beat ? 1.0 : 0) + (audio.bass || 0) * 0.65;
room.state.swell += (targetSwell - room.state.swell) * Math.min(1.0, frame.dt * 14);
const currentSwell = room.state.swell * beatSwell;

// Gradient Backdrop
ctx.save();
const grad = ctx.createRadialGradient(cx, cy, minDim * 0.05, cx, cy, minDim * 0.9);
grad.addColorStop(0, pal.bg2);
grad.addColorStop(1, pal.bg1);
ctx.fillStyle = grad;
ctx.fillRect(0, 0, w, h);

// Optional Star / Dust Field
if (starsChoice !== 'Off') {
  const warp = starsChoice === 'Demoscene Warp';
  const starSpeed = (0.04 + (audio.level || 0) * 0.08) * (warp ? 3.5 : 1.0);
  ctx.fillStyle = '#ffffff';
  const stars = room.state.stars;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    s.z = (s.z - frame.dt * starSpeed + 1) % 1;
    const sx = (s.x - 0.5) * w * (1 / (s.z * 1.5 + 0.2)) + cx;
    const sy = (s.y - 0.5) * h * (1 / (s.z * 1.5 + 0.2)) + cy;
    if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
      const alpha = (1 - s.z) * (warp ? 0.8 : 0.4);
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillRect(sx, sy, s.sz * (1 - s.z * 0.5), s.sz * (1 - s.z * 0.5));
    }
  }
  ctx.globalAlpha = 1;
}

// People presence ring pulses
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.lineWidth = 1.2;
  const pCount = Math.min(room.people.length, 24);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const angle = (i / pCount) * Math.PI * 2 + frame.t * 0.15;
    const dist = minDim * 0.44 + Math.sin(frame.t * 2 + i) * 6;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    ctx.strokeStyle = `hsla(${p.hue}, 80%, 65%, 0.45)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5 + (audio.mid || 0) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Rotation Matrices Setup
const t = frame.t * rotSpeed;
const a1 = t * 0.85;
const b1 = t * 0.6 + (audio.bass || 0) * 0.2;
const c1 = t * 0.4;

// Outer matrix: yaw(a1) * pitch(b1) * roll(c1)
const cosA1 = Math.cos(a1), sinA1 = Math.sin(a1);
const cosB1 = Math.cos(b1), sinB1 = Math.sin(b1);
const cosC1 = Math.cos(c1), sinC1 = Math.sin(c1);

// Inner matrix (opposite directions & distinct axes)
const a2 = -t * 1.25;
const b2 = -t * 0.95 - (audio.mid || 0) * 0.3;
const c2 = t * 0.5;
const cosA2 = Math.cos(a2), sinA2 = Math.sin(a2);
const cosB2 = Math.cos(b2), sinB2 = Math.sin(b2);
const cosC2 = Math.cos(c2), sinC2 = Math.sin(c2);

const rotate = (p, cA, sA, cB, sB, cC, sC, scale) => {
  const x = p[0] * scale;
  const y = p[1] * scale;
  const z = p[2] * scale;
  // Yaw around Y
  const x1 = x * cA + z * sA;
  const y1 = y;
  const z1 = -x * sA + z * cA;
  // Pitch around X
  const x2 = x1;
  const y2 = y1 * cB - z1 * sB;
  const z2 = y1 * sB + z1 * cB;
  // Roll around Z
  const x3 = x2 * cC - y2 * sC;
  const y3 = x2 * sC + y2 * cC;
  const z3 = z2;
  return [x3, y3, z3];
};

const camZ = 3.6;
const fov = minDim * 0.9;

const project = (pt3) => {
  const z = pt3[2] + camZ;
  const invZ = 1 / z;
  return {
    sx: cx + pt3[0] * invZ * fov,
    sy: cy + pt3[1] * invZ * fov,
    z: pt3[2],
    pt3
  };
};

// Transform outer solid
const outerScale = (pair.scaleOut * 1.05 + currentSwell);
const vProjOut = room.state.vProjOut;
vProjOut.length = mOut.v.length;
for (let i = 0; i < mOut.v.length; i++) {
  const pt3 = rotate(mOut.v[i], cosA1, sinA1, cosB1, sinB1, cosC1, sinC1, outerScale);
  vProjOut[i] = project(pt3);
}

// Transform inner solid
const innerScale = pair.scaleIn * (1.0 + (audio.treble || 0) * 0.15);
const vProjIn = room.state.vProjIn;
vProjIn.length = mIn.v.length;
for (let i = 0; i < mIn.v.length; i++) {
  const pt3 = rotate(mIn.v[i], cosA2, sinA2, cosB2, sinB2, cosC2, sinC2, innerScale);
  vProjIn[i] = project(pt3);
}

// Build render queue for sorting (Glenz vector sorting: back to front across both solids)
const queue = room.state.renderQueue;
queue.length = 0;

const enqueueFaces = (meshFaces, vProjList, isOuter) => {
  for (let f = 0; f < meshFaces.length; f++) {
    const face = meshFaces[f];
    const v0 = vProjList[face[0]];
    const v1 = vProjList[face[1]];
    const v2 = vProjList[face[2]];

    const cz = (v0.z + v1.z + v2.z) / 3;

    // Face normal for shading
    const ax = v1.pt3[0] - v0.pt3[0];
    const ay = v1.pt3[1] - v0.pt3[1];
    const az = v1.pt3[2] - v0.pt3[2];
    const bx = v2.pt3[0] - v0.pt3[0];
    const by = v2.pt3[1] - v0.pt3[1];
    const bz = v2.pt3[2] - v0.pt3[2];

    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const nlen = Math.hypot(nx, ny, nz) || 1;
    nx /= nlen;
    ny /= nlen;
    nz /= nlen;

    // Light from top-front-right
    const dot = nx * 0.45 - ny * 0.65 + nz * 0.61;
    const shade = Math.max(0.15, Math.min(1.0, 0.45 + dot * 0.55));

    queue.push({
      isOuter,
      z: cz,
      shade,
      indices: face,
      pts: vProjList
    });
  }
};

enqueueFaces(mOut.f, vProjOut, true);
enqueueFaces(mIn.f, vProjIn, false);

// Painters algorithm depth sort (furthest Z first)
queue.sort((a, b) => a.z - b.z);

// Set composite mode for tint mixing
if (blendChoice === 'Additive Flare') {
  ctx.globalCompositeOperation = 'lighter';
} else if (blendChoice === 'Subtle Tint') {
  ctx.globalCompositeOperation = 'screen';
} else {
  // Glenz Glass: overlay & alpha mixing
  ctx.globalCompositeOperation = 'source-over';
}

// Render sorted Glenz facets
for (let i = 0; i < queue.length; i++) {
  const item = queue[i];
  const isOut = item.isOuter;
  const rgb = isOut ? pal.outRGB : pal.inRGB;
  const edgeColor = isOut ? pal.outEdge : pal.inEdge;
  const indices = item.indices;
  const pts = item.pts;

  // Base glenz transparency boosted by music presence
  const baseAlpha = isOut ? 0.32 : 0.44;
  const audioBoost = (isOut ? (audio.bass || 0) : (audio.treble || 0)) * 0.18;
  const faceAlpha = Math.min(0.85, baseAlpha * item.shade + audioBoost);

  ctx.beginPath();
  const p0 = pts[indices[0]];
  ctx.moveTo(p0.sx, p0.sy);
  for (let j = 1; j < indices.length; j++) {
    const pj = pts[indices[j]];
    ctx.lineTo(pj.sx, pj.sy);
  }
  ctx.closePath();

  // Facet body
  ctx.fillStyle = `rgba(${Math.floor(rgb[0] * item.shade)}, ${Math.floor(rgb[1] * item.shade)}, ${Math.floor(rgb[2] * item.shade)}, ${faceAlpha})`;
  ctx.fill();

  // Glowing facet edge
  if (wireGlow > 0) {
    ctx.lineWidth = wireGlow * (isOut ? 1.0 : 0.8);
    ctx.strokeStyle = edgeColor;
    ctx.globalAlpha = Math.min(1.0, faceAlpha + 0.35);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }
}

// Core optical hotspot
if (blendChoice !== 'Subtle Tint') {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const coreFlare = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * (0.12 + currentSwell * 0.15));
  coreFlare.addColorStop(0, `rgba(${pal.inRGB.join(',')}, ${0.25 + (audio.bass || 0) * 0.3})`);
  coreFlare.addColorStop(0.5, `rgba(${pal.outRGB.join(',')}, 0.08)`);
  coreFlare.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreFlare;
  ctx.beginPath();
  ctx.arc(cx, cy, minDim * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

ctx.restore();