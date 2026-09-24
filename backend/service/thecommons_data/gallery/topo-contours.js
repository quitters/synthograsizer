ctx.save();

const GW = 112;
const GH = 64;
const N_CELLS = GW * GH;

room.state.h ??= new Float32Array(N_CELLS);
room.state.off ??= new OffscreenCanvas(GW, GH);
room.state.offCtx ??= room.state.off.getContext('2d');
room.state.imgData ??= room.state.offCtx.createImageData(GW, GH);
room.state.edgeTable ??= new Int8Array([
  -1,-1,-1,-1,  3, 0,-1,-1,  0, 1,-1,-1,  3, 1,-1,-1,
   1, 2,-1,-1,  3, 0, 1, 2,  0, 2,-1,-1,  3, 2,-1,-1,
   2, 3,-1,-1,  0, 2,-1,-1,  0, 1, 2, 3,  1, 2,-1,-1,
   3, 1,-1,-1,  0, 1,-1,-1,  3, 0,-1,-1, -1,-1,-1,-1
]);

const palChoice = getVar('palette') ?? 'Swiss Topo';
const numContours = getVar('contour_density') ?? 24;
const driftSpeed = getVar('terrain_drift') ?? 0.5;
const shadeStrength = getVar('relief_shade') ?? 0.7;
const marksMode = getVar('survey_marks') ?? 'Surveyor Grid';

const PALETTES = {
  'Swiss Topo': {
    paper: '#ece7db', hillDark: [85, 95, 80], hillLight: [255, 255, 248],
    thin: 'rgba(102, 85, 62, 0.42)', index: 'rgba(74, 58, 38, 0.95)',
    grid: 'rgba(100, 90, 75, 0.16)', accent: '#b84228'
  },
  'Vintage Parchment': {
    paper: '#f3ebd5', hillDark: [110, 80, 52], hillLight: [255, 252, 240],
    thin: 'rgba(120, 80, 48, 0.38)', index: 'rgba(84, 44, 18, 0.92)',
    grid: 'rgba(130, 95, 65, 0.18)', accent: '#962b1a'
  },
  'Blueprint': {
    paper: '#0e2646', hillDark: [4, 16, 32], hillLight: [38, 92, 164],
    thin: 'rgba(110, 180, 255, 0.35)', index: 'rgba(195, 230, 255, 0.95)',
    grid: 'rgba(100, 170, 255, 0.18)', accent: '#62e2ff'
  },
  'Slate & Ochre': {
    paper: '#24272c', hillDark: [14, 16, 18], hillLight: [62, 70, 82],
    thin: 'rgba(215, 170, 95, 0.36)', index: 'rgba(242, 198, 118, 0.95)',
    grid: 'rgba(180, 190, 200, 0.14)', accent: '#f09838'
  },
  'Phosphor Green': {
    paper: '#06130b', hillDark: [2, 10, 5], hillLight: [18, 48, 28],
    thin: 'rgba(70, 210, 120, 0.32)', index: 'rgba(125, 255, 175, 0.92)',
    grid: 'rgba(60, 180, 100, 0.16)', accent: '#a6ffb8'
  }
};
const pal = PALETTES[palChoice] ?? PALETTES['Swiss Topo'];

const W = frame.width;
const H = frame.height;
const bass = audio.level > 0 ? audio.bass : 0.15;
const beat = audio.beat ? 1.0 : 0.0;
const t = frame.t * 0.18 * driftSpeed;

const h = room.state.h;
const imgData = room.state.imgData;
const pixels = imgData.data;

for (let y = 0; y < GH; y++) {
  const ny = (y / GH) * 3.2;
  const idxY = y * GW;
  for (let x = 0; x < GW; x++) {
    const nx = (x / GW) * 5.6;
    let v = Math.sin(nx * 1.1 + t * 0.8) * Math.cos(ny * 1.2 - t * 0.5)
          + Math.sin((nx + ny) * 1.8 + t * 1.2) * 0.5
          + Math.cos(nx * 3.7 - ny * 2.4 - t * 0.9) * 0.25
          + Math.sin(nx * 7.1 + ny * 6.3 + t * 1.5) * 0.12;
    v = (v + 1.87) * 0.27;
    v += bass * 0.12 * Math.sin(nx * 2.5 + ny * 2.5 + frame.t * 2.0);
    if (v < 0) v = 0; else if (v > 1) v = 1;
    h[idxY + x] = v;
  }
}

const [dr, dg, db] = pal.hillDark;
const [lr, lg, lb] = pal.hillLight;
const lx = -0.707;
const ly = -0.707;
const zScale = 2.8 + bass * 1.4;

for (let y = 0; y < GH; y++) {
  const ym = y > 0 ? y - 1 : 0;
  const yp = y < GH - 1 ? y + 1 : GH - 1;
  const row = y * GW;
  const rowM = ym * GW;
  const rowP = yp * GW;
  for (let x = 0; x < GW; x++) {
    const xm = x > 0 ? x - 1 : 0;
    const xp = x < GW - 1 ? x + 1 : GW - 1;
    const dzdx = (h[row + xp] - h[row + xm]) * zScale;
    const dzdy = (h[rowP + x] - h[rowM + x]) * zScale;
    const invLen = 1.0 / Math.hypot(-dzdx, -dzdy, 1.0);
    const nx = -dzdx * invLen;
    const ny = -dzdy * invLen;
    const nz = 1.0 * invLen;
    let diff = (nx * lx + ny * ly + nz * 0.55);
    diff = Math.max(0, Math.min(1, (diff + 0.3) * 0.85));
    const pIdx = (row + x) * 4;
    const alpha = shadeStrength * 0.85;
    pixels[pIdx]     = dr + (lr - dr) * diff;
    pixels[pIdx + 1] = dg + (lg - dg) * diff;
    pixels[pIdx + 2] = db + (lb - db) * diff;
    pixels[pIdx + 3] = alpha * 255;
  }
}

room.state.offCtx.putImageData(imgData, 0, 0);

ctx.fillStyle = pal.paper;
ctx.fillRect(0, 0, W, H);

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'medium';
ctx.drawImage(room.state.off, 0, 0, W, H);

if (marksMode === 'Surveyor Grid') {
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const stepX = W / 12;
  const stepY = H / 8;
  for (let gx = stepX; gx < W; gx += stepX) {
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
  }
  for (let gy = stepY; gy < H; gy += stepY) {
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
  }
  ctx.stroke();
}

const sx = W / (GW - 1);
const sy = H / (GH - 1);
const step = 1.0 / numContours;
const thinPath = new Path2D();
const indexPath = new Path2D();
const edges = room.state.edgeTable;

const epX = new Float32Array(4);
const epY = new Float32Array(4);

for (let cy = 0; cy < GH - 1; cy++) {
  const row0 = cy * GW;
  const row1 = row0 + GW;
  const py0 = cy * sy;
  const py1 = py0 + sy;

  for (let cx = 0; cx < GW - 1; cx++) {
    const px0 = cx * sx;
    const px1 = px0 + sx;

    const v0 = h[row0 + cx];
    const v1 = h[row0 + cx + 1];
    const v2 = h[row1 + cx + 1];
    const v3 = h[row1 + cx];

    let minV = v0 < v1 ? v0 : v1;
    if (v2 < minV) minV = v2;
    if (v3 < minV) minV = v3;

    let maxV = v0 > v1 ? v0 : v1;
    if (v2 > maxV) maxV = v2;
    if (v3 > maxV) maxV = v3;

    const kStart = Math.ceil(minV / step);
    const kEnd = Math.floor(maxV / step);
    if (kStart > kEnd) continue;

    for (let k = kStart; k <= kEnd; k++) {
      const iso = k * step;
      const code = (v0 >= iso ? 1 : 0) |
                   (v1 >= iso ? 2 : 0) |
                   (v2 >= iso ? 4 : 0) |
                   (v3 >= iso ? 8 : 0);
      if (code === 0 || code === 15) continue;

      const t0 = (iso - v0) / (v1 - v0 || 1e-6);
      epX[0] = px0 + t0 * sx;
      epY[0] = py0;

      const t1 = (iso - v1) / (v2 - v1 || 1e-6);
      epX[1] = px1;
      epY[1] = py0 + t1 * sy;

      const t2 = (iso - v3) / (v2 - v3 || 1e-6);
      epX[2] = px0 + t2 * sx;
      epY[2] = py1;

      const t3 = (iso - v0) / (v3 - v0 || 1e-6);
      epX[3] = px0;
      epY[3] = py0 + t3 * sy;

      const target = (k % 5 === 0) ? indexPath : thinPath;
      const offset = code * 4;
      for (let i = 0; i < 4; i += 2) {
        const eA = edges[offset + i];
        if (eA < 0) break;
        const eB = edges[offset + i + 1];
        target.moveTo(epX[eA], epY[eA]);
        target.lineTo(epX[eB], epY[eB]);
      }
    }
  }
}

ctx.strokeStyle = pal.thin;
ctx.lineWidth = 1.0;
ctx.stroke(thinPath);

ctx.strokeStyle = pal.index;
ctx.lineWidth = 2.2 + beat * 0.8;
ctx.stroke(indexPath);

if (marksMode !== 'Clean') {
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.accent;
  ctx.strokeStyle = pal.accent;

  const people = room.people ?? [];
  const numMarks = Math.max(people.length, 6);
  const crossR = 4;

  for (let i = 0; i < numMarks; i++) {
    const p = people[i % (people.length || 1)];
    const seed = p ? (p.hue * 1.37 + i * 29.5) : (i * 37.1 + 13.0);
    const gx = Math.floor(10 + ((seed * 11) % (GW - 20)));
    const gy = Math.floor(8 + ((seed * 23) % (GH - 16)));
    const bx = gx * sx;
    const by = gy * sy;
    const elev = Math.round(h[gy * GW + gx] * 3200 + 400);

    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx - crossR, by);
    ctx.lineTo(bx + crossR, by);
    ctx.moveTo(bx, by - crossR);
    ctx.lineTo(bx, by + crossR);
    ctx.stroke();

    ctx.fillText(`${elev}m`, bx + 18, by - 6);
  }
}

ctx.restore();