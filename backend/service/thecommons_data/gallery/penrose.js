ctx.save();

const PHI = 1.618033988749895;
const INV_PHI = 0.6180339887498949;
const R0 = 1550;

const PALETTES = {
  obsidian_gold: {
    bg: '#080605',
    thick: [28, 20, 14],
    thin: [12, 10, 8],
    highThick: [255, 205, 80],
    highThin: [240, 130, 40],
    edge: 'rgba(215, 175, 95, 0.45)'
  },
  cyber_neon: {
    bg: '#04060d',
    thick: [12, 22, 50],
    thin: [26, 10, 42],
    highThick: [0, 235, 255],
    highThin: [255, 45, 165],
    edge: 'rgba(100, 200, 255, 0.45)'
  },
  spectral_prism: {
    bg: '#050807',
    thick: [10, 36, 28],
    thin: [32, 14, 42],
    highThick: [60, 255, 180],
    highThin: [245, 110, 225],
    edge: 'rgba(170, 235, 210, 0.45)'
  },
  monochrome_silver: {
    bg: '#070708',
    thick: [26, 26, 30],
    thin: [14, 14, 16],
    highThick: [235, 240, 250],
    highThin: [175, 185, 205],
    edge: 'rgba(205, 215, 235, 0.45)'
  }
};

const palKey = getVar('palette') ?? 'obsidian_gold';
const pal = PALETTES[palKey] ?? PALETTES.obsidian_gold;
const zoomSpeed = getVar('zoom_speed') ?? 0.15;
const waveSpeed = getVar('wave_speed') ?? 1.2;
const glowIntensity = getVar('glow_intensity') ?? 0.8;
const edgeStyle = getVar('edge_style') ?? 'delicate';

if (room.state.palKey !== palKey) {
  room.state.palKey = palKey;
  room.state.lutThick = new Array(32);
  room.state.lutThin = new Array(32);
  for (let i = 0; i < 32; i++) {
    const k = i / 31;
    const rT = Math.round(pal.thick[0] + (pal.highThick[0] - pal.thick[0]) * k);
    const gT = Math.round(pal.thick[1] + (pal.highThick[1] - pal.thick[1]) * k);
    const bT = Math.round(pal.thick[2] + (pal.highThick[2] - pal.thick[2]) * k);
    room.state.lutThick[i] = `rgb(${rT},${gT},${bT})`;

    const rN = Math.round(pal.thin[0] + (pal.highThin[0] - pal.thin[0]) * k);
    const gN = Math.round(pal.thin[1] + (pal.highThin[1] - pal.thin[1]) * k);
    const bN = Math.round(pal.thin[2] + (pal.highThin[2] - pal.thin[2]) * k);
    room.state.lutThin[i] = `rgb(${rN},${gN},${bN})`;
  }
}

const deflate = (src, dst, count, r) => {
  for (let i = 0; i < count; i++) {
    const s = i * 7;
    const d = i * 14;
    const ax = src[s], ay = src[s + 1];
    const bx = src[s + 2], by = src[s + 3];
    const cx = src[s + 4], cy = src[s + 5];
    const st = src[s + 6];

    if (st === 0) {
      const px = ax + (bx - ax) * r, py = ay + (by - ay) * r;
      dst[d] = cx; dst[d + 1] = cy; dst[d + 2] = px; dst[d + 3] = py; dst[d + 4] = bx; dst[d + 5] = by; dst[d + 6] = 1;
      dst[d + 7] = px; dst[d + 8] = py; dst[d + 9] = cx; dst[d + 10] = cy; dst[d + 11] = ax; dst[d + 12] = ay; dst[d + 13] = 2;
    } else if (st === 1) {
      const px = ax + (cx - ax) * r, py = ay + (cy - ay) * r;
      dst[d] = bx; dst[d + 1] = by; dst[d + 2] = px; dst[d + 3] = py; dst[d + 4] = cx; dst[d + 5] = cy; dst[d + 6] = 0;
      dst[d + 7] = px; dst[d + 8] = py; dst[d + 9] = bx; dst[d + 10] = by; dst[d + 11] = ax; dst[d + 12] = ay; dst[d + 13] = 3;
    } else if (st === 2) {
      const qx = bx + (cx - bx) * r, qy = by + (cy - by) * r;
      dst[d] = bx; dst[d + 1] = by; dst[d + 2] = qx; dst[d + 3] = qy; dst[d + 4] = ax; dst[d + 5] = ay; dst[d + 6] = 0;
      dst[d + 7] = qx; dst[d + 8] = qy; dst[d + 9] = ax; dst[d + 10] = ay; dst[d + 11] = cx; dst[d + 12] = cy; dst[d + 13] = 3;
    } else {
      const qx = cx + (bx - cx) * r, qy = cy + (by - cy) * r;
      dst[d] = cx; dst[d + 1] = cy; dst[d + 2] = qx; dst[d + 3] = qy; dst[d + 4] = ax; dst[d + 5] = ay; dst[d + 6] = 1;
      dst[d + 7] = qx; dst[d + 8] = qy; dst[d + 9] = ax; dst[d + 10] = ay; dst[d + 11] = bx; dst[d + 12] = by; dst[d + 13] = 2;
    }
  }
};

if (!room.state.gen4) {
  const tmpA = new Float32Array(160 * 7);
  const tmpB = new Float32Array(160 * 7);
  for (let k = 0; k < 10; k++) {
    const th1 = (k * Math.PI) / 5;
    const th2 = ((k + 1) * Math.PI) / 5;
    const o = k * 7;
    tmpA[o] = 0; tmpA[o + 1] = 0;
    tmpA[o + 2] = R0 * Math.cos(th1); tmpA[o + 3] = R0 * Math.sin(th1);
    tmpA[o + 4] = R0 * Math.cos(th2); tmpA[o + 5] = R0 * Math.sin(th2);
    tmpA[o + 6] = k % 2;
  }
  deflate(tmpA, tmpB, 10, INV_PHI);
  deflate(tmpB, tmpA, 20, INV_PHI);
  deflate(tmpA, tmpB, 40, INV_PHI);
  deflate(tmpB, tmpA, 80, INV_PHI);
  room.state.gen4 = tmpA;
  room.state.b0 = new Float32Array(320 * 7);
  room.state.b1 = new Float32Array(640 * 7);
  room.state.bFinal = new Float32Array(1280 * 7);
  room.state.phase = 0;
  room.state.beatPulse = 0;
}

const dt = Math.min(frame.dt, 0.05);
room.state.phase = (room.state.phase + dt * zoomSpeed) % 2;
if (audio.beat) room.state.beatPulse = 1.0;
room.state.beatPulse = Math.max(0, room.state.beatPulse - dt * 3.5);

const Z = room.state.phase;
const u1 = Math.min(1, Z);
const u2 = Math.max(0, Z - 1);
const r1 = 1.0 - u1 * (1.0 - INV_PHI);
const r2 = 1.0 - u2 * (1.0 - INV_PHI);

deflate(room.state.gen4, room.state.b0, 160, INV_PHI);
deflate(room.state.b0, room.state.b1, 320, r1);
deflate(room.state.b1, room.state.bFinal, 640, r2);

const zoom = Math.pow(PHI, Z * 0.5);

ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
ctx.translate(cx, cy);
ctx.scale(zoom, zoom);
ctx.rotate(frame.t * 0.015);

if (edgeStyle === 'luminous') {
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 1.0 + audio.bass * 1.6;
} else if (edgeStyle === 'submerged') {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.2;
} else {
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 0.55;
}

const tris = room.state.bFinal;
const lutThick = room.state.lutThick;
const lutThin = room.state.lutThin;
const waveT = frame.t * waveSpeed * 2.2;
const bassBoost = audio.bass * 0.45 + room.state.beatPulse * 0.4;
const trebleShimmer = audio.treble * 0.25;

for (let i = 0; i < 1280; i++) {
  const o = i * 7;
  const ax = tris[o], ay = tris[o + 1];
  const bx = tris[o + 2], by = tris[o + 3];
  const cpx = tris[o + 4], cpy = tris[o + 5];
  const st = tris[o + 6];

  const mx = (ax + bx + cpx) * 0.33333;
  const my = (ay + by + cpy) * 0.33333;
  const d = Math.hypot(mx, my);
  const ang = Math.atan2(my, mx);

  const w1 = Math.sin(d * 0.0075 - waveT + ang * 2.0);
  const w2 = Math.cos(d * 0.014 + waveT * 0.6 - ang * 3.0);
  let h = (w1 * 0.65 + w2 * 0.35 + 1.0) * 0.5;
  h = Math.pow(h, 2.2) * glowIntensity + bassBoost + trebleShimmer;
  const idx = Math.max(0, Math.min(31, (h * 31) | 0));

  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cpx, cpy);
  ctx.closePath();

  ctx.fillStyle = st < 2 ? lutThick[idx] : lutThin[idx];
  ctx.fill();
  ctx.stroke();
}

if (room.people && room.people.length > 0) {
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const pIdx = ((person.hue * 17) | 0) % 1280;
    const o = pIdx * 7;
    const px = (tris[o] + tris[o + 2] + tris[o + 4]) * 0.33333;
    const py = (tris[o + 1] + tris[o + 3] + tris[o + 5]) * 0.33333;
    const r = 3.5 + audio.bass * 4.5;

    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${person.hue}, 95%, 65%)`;
    ctx.shadowColor = `hsl(${person.hue}, 100%, 75%)`;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

ctx.restore();