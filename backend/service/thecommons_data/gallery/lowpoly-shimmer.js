ctx.save();

const PALETTES = {
  sunset: {
    skyTop: [18, 10, 36], skyMid: [68, 20, 55], skyBot: [255, 107, 53],
    sun: [255, 224, 102], sunHalo: [255, 107, 53],
    low: [26, 12, 40], mid: [184, 74, 57], high: [247, 160, 114], lit: [255, 235, 200],
    wire: [255, 190, 160]
  },
  aurora: {
    skyTop: [4, 16, 20], skyMid: [11, 37, 40], skyBot: [30, 90, 80],
    sun: [200, 255, 244], sunHalo: [82, 214, 164],
    low: [10, 28, 36], mid: [24, 82, 77], high: [82, 214, 164], lit: [220, 255, 245],
    wire: [130, 240, 200]
  },
  cyberpunk: {
    skyTop: [13, 2, 33], skyMid: [25, 11, 59], skyBot: [70, 10, 75],
    sun: [255, 0, 127], sunHalo: [180, 0, 140],
    low: [15, 8, 38], mid: [160, 26, 125], high: [0, 240, 255], lit: [255, 220, 255],
    wire: [0, 240, 255]
  },
  desert: {
    skyTop: [26, 28, 56], skyMid: [110, 70, 85], skyBot: [210, 130, 90],
    sun: [255, 204, 68], sunHalo: [230, 140, 60],
    low: [56, 30, 24], mid: [176, 109, 59], high: [242, 197, 124], lit: [255, 240, 210],
    wire: [255, 220, 170]
  }
};

const palKey = getVar('palette') ?? 'sunset';
const pal = PALETTES[palKey] ?? PALETTES.sunset;
const wireStyle = getVar('wireframe') ?? 'subtle';
const mountainHeight = getVar('mountain_height') ?? 1.2;
const driftSpeed = getVar('drift_speed') ?? 0.8;
const roughness = getVar('roughness') ?? 1.0;
const lightMotion = getVar('light_orbit') ?? 'sweeping';

const W = frame.width, H = frame.height;

// --- ONE-TIME INITIALIZATION (Normalized Delaunay Mesh) ---
if (!room.state.initialized) {
  const COLS = 13, ROWS = 8;
  const rawPts = [];
  let seed = 42;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // Boundary pin points to seal edges cleanly
  rawPts.push({ x: -0.15, y: 0.35, z: 200 });
  rawPts.push({ x:  1.15, y: 0.35, z: 200 });
  rawPts.push({ x: -0.15, y: 1.15, z: 0 });
  rawPts.push({ x:  1.15, y: 1.15, z: 0 });

  for (let r = 0; r < ROWS; r++) {
    const rowV = r / (ROWS - 1);
    const baseY = 0.36 + rowV * 0.72;
    const rowElevation = Math.pow(1 - rowV, 1.4) * 240;
    for (let c = 0; c < COLS; c++) {
      const colU = c / (COLS - 1);
      const jx = (rnd() - 0.5) * (0.85 / COLS);
      const jy = (rnd() - 0.5) * (0.45 / ROWS);
      const ridgeNoise = Math.sin(colU * 11 + r * 1.7) * 45 + Math.cos(colU * 5.3) * 35;
      const z = Math.max(0, rowElevation + ridgeNoise * (1 - rowV * 0.7));
      rawPts.push({
        x: Math.max(-0.1, Math.min(1.1, colU + jx)),
        y: Math.max(0.35, Math.min(1.1, baseY + jy)),
        z: z
      });
    }
  }

  // Bowyer-Watson Delaunay triangulation on normalized 2D points
  const N = rawPts.length;
  const superTri = [
    { x: -10, y: -10 },
    { x:  11, y: -10 },
    { x: 0.5, y:  12 }
  ];
  const all = [...rawPts, ...superTri];
  let tris = [[N, N + 1, N + 2]];

  for (let i = 0; i < N; i++) {
    const p = all[i];
    const bad = [];
    const edges = [];
    for (let t = 0; t < tris.length; t++) {
      const tr = tris[t];
      const a = all[tr[0]], b = all[tr[1]], c = all[tr[2]];
      const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (Math.abs(d) < 1e-7) continue;
      const a2 = a.x * a.x + a.y * a.y;
      const b2 = b.x * b.x + b.y * b.y;
      const c2 = c.x * c.x + c.y * c.y;
      const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
      const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
      const r2 = (a.x - ux) * (a.x - ux) + (a.y - uy) * (a.y - uy);
      const dist2 = (p.x - ux) * (p.x - ux) + (p.y - uy) * (p.y - uy);
      if (dist2 <= r2) {
        bad.push(t);
        edges.push(tr[0], tr[1], tr[1], tr[2], tr[2], tr[0]);
      }
    }

    const unique = [];
    for (let e = 0; e < edges.length; e += 2) {
      let shared = false;
      for (let f = 0; f < edges.length; f += 2) {
        if (e !== f && ((edges[e] === edges[f] && edges[e+1] === edges[f+1]) ||
                        (edges[e] === edges[f+1] && edges[e+1] === edges[f]))) {
          shared = true; break;
        }
      }
      if (!shared) unique.push(edges[e], edges[e + 1]);
    }

    tris = tris.filter((_, idx) => !bad.includes(idx));
    for (let e = 0; e < unique.length; e += 2) {
      tris.push([unique[e], unique[e + 1], i]);
    }
  }

  // Filter out super-triangle connections
  const validTris = tris.filter(t => t[0] < N && t[1] < N && t[2] < N);

  // Preallocate typed buffers
  room.state.ptCount = N;
  room.state.triCount = validTris.length;
  room.state.baseX = new Float32Array(N);
  room.state.baseY = new Float32Array(N);
  room.state.baseZ = new Float32Array(N);
  room.state.fx = new Float32Array(N);
  room.state.fy = new Float32Array(N);
  room.state.fz = new Float32Array(N);
  room.state.phase = new Float32Array(N);
  room.state.curX = new Float32Array(N);
  room.state.curY = new Float32Array(N);
  room.state.curZ = new Float32Array(N);
  room.state.triangles = new Uint16Array(validTris.length * 3);
  room.state.order = new Uint16Array(validTris.length);
  room.state.triY = new Float32Array(validTris.length);

  for (let i = 0; i < N; i++) {
    room.state.baseX[i] = rawPts[i].x;
    room.state.baseY[i] = rawPts[i].y;
    room.state.baseZ[i] = rawPts[i].z;
    room.state.fx[i] = 0.5 + rnd() * 0.9;
    room.state.fy[i] = 0.4 + rnd() * 0.8;
    room.state.fz[i] = 0.6 + rnd() * 1.2;
    room.state.phase[i] = rnd() * Math.PI * 2;
  }

  for (let t = 0; t < validTris.length; t++) {
    room.state.triangles[t * 3] = validTris[t][0];
    room.state.triangles[t * 3 + 1] = validTris[t][1];
    room.state.triangles[t * 3 + 2] = validTris[t][2];
    room.state.order[t] = t;
  }

  // Static stars
  room.state.stars = [];
  for (let s = 0; s < 45; s++) {
    room.state.stars.push({ x: rnd(), y: rnd() * 0.38, size: 0.8 + rnd() * 1.5, tw: rnd() * 6.28 });
  }

  room.state.initialized = true;
}

const N = room.state.ptCount;
const numTris = room.state.triCount;
const baseX = room.state.baseX;
const baseY = room.state.baseY;
const baseZ = room.state.baseZ;
const fx = room.state.fx, fy = room.state.fy, fz = room.state.fz, phase = room.state.phase;
const curX = room.state.curX, curY = room.state.curY, curZ = room.state.curZ;
const triIdx = room.state.triangles;
const order = room.state.order;
const triY = room.state.triY;

// --- MOVING SUN / LIGHT SOURCE ---
const t = frame.t * driftSpeed;
let lx, ly, lz;
if (lightMotion === 'overhead') {
  lx = W * (0.5 + Math.sin(t * 0.35) * 0.32);
  ly = H * (0.12 + Math.cos(t * 0.35) * 0.04);
  lz = 480 + audio.treble * 160;
} else if (lightMotion === 'pulsing') {
  lx = W * (0.5 + Math.sin(t * 0.5) * 0.16);
  ly = H * (0.2 + Math.cos(t * 0.3) * 0.07);
  lz = 280 + Math.sin(t * 2.2) * 120 + audio.bass * 220;
} else {
  const orbAngle = (t * 0.28) % (Math.PI * 2);
  lx = W * (0.5 + Math.cos(orbAngle) * 0.44);
  ly = H * (0.26 - Math.sin(orbAngle) * 0.18);
  lz = 320 + Math.sin(orbAngle) * 140 + audio.mid * 100;
}

// --- DRAW SKY & STARS ---
const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.65);
skyGrad.addColorStop(0, `rgb(${pal.skyTop.join(',')})`);
skyGrad.addColorStop(0.55, `rgb(${pal.skyMid.join(',')})`);
skyGrad.addColorStop(1, `rgb(${pal.skyBot.join(',')})`);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// Twinkling stars
const stars = room.state.stars;
for (let s = 0; s < stars.length; s++) {
  const st = stars[s];
  const alpha = 0.3 + 0.4 * Math.sin(frame.t * 2.0 + st.tw);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fillRect(st.x * W, st.y * H, st.size, st.size);
}

// Sun Glow
const sunPulse = 45 + audio.bass * 35 + (audio.beat ? 25 : 0);
const sunGrad = ctx.createRadialGradient(lx, ly, 4, lx, ly, sunPulse * 2.6);
sunGrad.addColorStop(0, `rgba(${pal.sun[0]}, ${pal.sun[1]}, ${pal.sun[2]}, 0.95)`);
sunGrad.addColorStop(0.3, `rgba(${pal.sunHalo[0]}, ${pal.sunHalo[1]}, ${pal.sunHalo[2]}, 0.45)`);
sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = sunGrad;
ctx.beginPath();
ctx.arc(lx, ly, sunPulse * 2.6, 0, Math.PI * 2);
ctx.fill();

// --- UPDATE VERTICES (Demoscene Shimmer Drift) ---
const bassKick = audio.bass * 50 * roughness;
for (let i = 0; i < N; i++) {
  const p = phase[i];
  const dx = Math.sin(t * fx[i] + p) * 0.012;
  const dy = Math.cos(t * fy[i] + p * 1.3) * 0.009;
  const dz = Math.sin(t * fz[i] + p * 0.7) * (14 * roughness) + (baseZ[i] > 60 ? bassKick : 0);

  curX[i] = (baseX[i] + dx) * W;
  curZ[i] = (baseZ[i] * mountainHeight + dz);
  curY[i] = (baseY[i] + dy) * H - curZ[i];
}

// Calculate triangle centroids for back-to-front sorting
for (let tIdx = 0; tIdx < numTris; tIdx++) {
  const i0 = triIdx[tIdx * 3];
  const i1 = triIdx[tIdx * 3 + 1];
  const i2 = triIdx[tIdx * 3 + 2];
  triY[tIdx] = (curY[i0] + curY[i1] + curY[i2]) / 3;
}
order.sort((a, b) => triY[a] - triY[b]);

// --- RENDER FACETS ---
const wireAlpha = wireStyle === 'none' ? 0 :
  wireStyle === 'glow' ? 0.35 + audio.treble * 0.3 :
  wireStyle === 'bold' ? 0.65 : 0.12;
const wireW = wireStyle === 'bold' ? 1.4 : 0.8;

for (let o = 0; o < numTris; o++) {
  const tIdx = order[o];
  const o0 = triIdx[tIdx * 3];
  const o1 = triIdx[tIdx * 3 + 1];
  const o2 = triIdx[tIdx * 3 + 2];

  const x0 = curX[o0], y0 = curY[o0], z0 = curZ[o0];
  const x1 = curX[o1], y1 = curY[o1], z1 = curZ[o1];
  const x2 = curX[o2], y2 = curY[o2], z2 = curZ[o2];

  // Facet normal
  const ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
  const bx = x2 - x0, by = y2 - y0, bz = z2 - z0;
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const nlen = Math.hypot(nx, ny, nz);
  if (nlen < 1e-5) continue;
  nx /= nlen; ny /= nlen; nz /= nlen;
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }

  // Centroid
  const cx = (x0 + x1 + x2) * 0.3333;
  const cy = (y0 + y1 + y2) * 0.3333;
  const cz = (z0 + z1 + z2) * 0.3333;

  // Light vector
  let ldx = lx - cx, ldy = ly - cy, ldz = lz - cz;
  const dlen = Math.hypot(ldx, ldy, ldz);
  ldx /= dlen; ldy /= dlen; ldz /= dlen;

  // Diffuse & Specular shimmer
  const dot = Math.max(0, nx * ldx + ny * ldy + nz * ldz);
  const rz = 2 * dot * nz - ldz;
  const spec = Math.pow(Math.max(0, rz), 10) * (0.35 + audio.treble * 0.65);

  // Gradient shading (valley to ridge to peak)
  const yNorm = Math.max(0, Math.min(1, (cy - H * 0.2) / (H * 0.8)));
  const elevNorm = Math.max(0, Math.min(1, cz / (320 * mountainHeight)));

  let br, bg, bb;
  if (elevNorm > 0.45) {
    const blend = (elevNorm - 0.45) / 0.55;
    br = pal.mid[0] + (pal.high[0] - pal.mid[0]) * blend;
    bg = pal.mid[1] + (pal.high[1] - pal.mid[1]) * blend;
    bb = pal.mid[2] + (pal.high[2] - pal.mid[2]) * blend;
  } else {
    const blend = yNorm;
    br = pal.mid[0] + (pal.low[0] - pal.mid[0]) * blend;
    bg = pal.mid[1] + (pal.low[1] - pal.mid[1]) * blend;
    bb = pal.mid[2] + (pal.low[2] - pal.mid[2]) * blend;
  }

  const lightFactor = 0.32 + dot * 0.68;
  const fr = Math.min(255, (br * lightFactor + spec * pal.lit[0]) | 0);
  const fg = Math.min(255, (bg * lightFactor + spec * pal.lit[1]) | 0);
  const fb = Math.min(255, (bb * lightFactor + spec * pal.lit[2]) | 0);

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();

  ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
  ctx.fill();

  if (wireAlpha > 0) {
    ctx.strokeStyle = `rgba(${pal.wire[0]},${pal.wire[1]},${pal.wire[2]},${wireAlpha})`;
    ctx.lineWidth = wireW;
    ctx.stroke();
  }
}

// --- ROOM AUDIENCE INTEGRATION (Perched Mountain Beacons) ---
if (room.people && room.people.length > 0) {
  for (let pIdx = 0; pIdx < room.people.length; pIdx++) {
    const person = room.people[pIdx];
    const vIdx = (pIdx * 17 + 9) % N;
    const bx = curX[vIdx], by = curY[vIdx];

    const beamHeight = 45 + audio.bass * 60;
    const beamGrad = ctx.createLinearGradient(bx, by, bx, by - beamHeight);
    beamGrad.addColorStop(0, `hsla(${person.hue}, 90%, 65%, 0.85)`);
    beamGrad.addColorStop(1, `hsla(${person.hue}, 90%, 65%, 0)`);

    ctx.strokeStyle = beamGrad;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by - beamHeight);
    ctx.stroke();

    ctx.fillStyle = `hsl(${person.hue}, 100%, 85%)`;
    ctx.beginPath();
    ctx.arc(bx, by - 1, 2.5 + (audio.beat ? 2 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();