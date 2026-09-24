const width = frame.width;
const height = frame.height;
const t = frame.t;

// Read variables
const palMode = getVar('palette_mode') ?? 'Lapis & Royal Gold';
const patScale = getVar('pattern_scale') ?? 'Medium';
const symChoice = getVar('symmetry_order') ?? '8-Fold Rosette';
const strapW = getVar('strap_width') ?? 14;
const traceSpd = getVar('trace_speed') ?? 0.8;
const pulseAmt = getVar('pulse_intensity') ?? 0.5;

// Palettes (Lapis, Gold, Deep Indigo, Ambient Glow)
const palettes = {
  'Lapis & Royal Gold': {
    bg0: '#070b18',
    bg1: '#0d1833',
    strapBg: '#091326',
    strapFill: '#1a3a78',
    goldMain: '#e6be53',
    goldBright: '#fff2a8',
    goldShadow: '#8f6e1b',
    gem: '#2979ff',
    gemCore: '#00e5ff'
  },
  'Midnight & Ochre': {
    bg0: '#0a0612',
    bg1: '#140c24',
    strapBg: '#0e081c',
    strapFill: '#24143d',
    goldMain: '#d99b3b',
    goldBright: '#fed88b',
    goldShadow: '#7a4e14',
    gem: '#ff5252',
    gemCore: '#ffd740'
  },
  'Persian Turquoise & Brass': {
    bg0: '#041315',
    bg1: '#072428',
    strapBg: '#051b1f',
    strapFill: '#0a3d42',
    goldMain: '#c8a84a',
    goldBright: '#fae38c',
    goldShadow: '#785f1c',
    gem: '#00e5ff',
    gemCore: '#e0f7fa'
  }
};
const pal = palettes[palMode] ?? palettes['Lapis & Royal Gold'];

// Symmetry and cell radius lookup
const symCounts = { '6-Fold Hexagonal': 6, '8-Fold Rosette': 8, '12-Fold Star': 12 };
const N = symCounts[symChoice] ?? 8;

const scaleMap = { 'Dense': 110, 'Medium': 155, 'Grand': 210 };
const R = scaleMap[patScale] ?? 155;

// Sound reactivity
const bass = audio ? (audio.bass || 0) : 0;
const beat = audio ? (audio.beat ? 1 : 0) : 0;
const treble = audio ? (audio.treble || 0) : 0;
const audioBoost = (bass * 0.4 + beat * 0.3) * pulseAmt;

// Lookup tables & precomputed static ribbon segments in room.state
const stateKey = `${N}_${R}`;
if (room.state.key !== stateKey) {
  room.state.key = stateKey;
  const segs = [];
  const step = (Math.PI * 2) / N;
  const rInner = R * 0.382;
  const rMid = R * 0.707;
  const rOuter = R;
  const rStar = R * 0.53;

  for (let i = 0; i < N; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    const aMid = a0 + step * 0.5;

    const p0 = { x: Math.cos(a0) * rInner, y: Math.sin(a0) * rInner };
    const p1 = { x: Math.cos(aMid) * rStar, y: Math.sin(aMid) * rStar };
    const p2 = { x: Math.cos(a1) * rInner, y: Math.sin(a1) * rInner };
    segs.push({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, kind: 0, order: i % 2 });
    segs.push({ x0: p1.x, y0: p1.y, x1: p2.x, y1: p2.y, kind: 0, order: (i + 1) % 2 });

    const pMidStar = { x: Math.cos(a0) * rMid, y: Math.sin(a0) * rMid };
    segs.push({ x0: p1.x, y0: p1.y, x1: pMidStar.x, y1: pMidStar.y, kind: 1, order: (i + 1) % 2 });

    const pOut0 = { x: Math.cos(a0) * rOuter, y: Math.sin(a0) * rOuter };
    const pOut1 = { x: Math.cos(a1) * rOuter, y: Math.sin(a1) * rOuter };
    segs.push({ x0: pMidStar.x, y0: pMidStar.y, x1: pOut0.x, y1: pOut0.y, kind: 2, order: i % 2 });
    segs.push({ x0: pMidStar.x, y0: pMidStar.y, x1: pOut1.x, y1: pOut1.y, kind: 2, order: (i + 1) % 2 });
    segs.push({ x0: pOut0.x, y0: pOut0.y, x1: pOut1.x, y1: pOut1.y, kind: 3, order: i % 2 });
  }

  for (let s of segs) {
    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    s.len = Math.hypot(dx, dy);
  }
  room.state.segs = segs;
}
const segs = room.state.segs;

ctx.save();
const bgGrad = ctx.createRadialGradient(width * 0.5, height * 0.5, 50, width * 0.5, height * 0.5, Math.max(width, height) * 0.7);
bgGrad.addColorStop(0, pal.bg1);
bgGrad.addColorStop(0.7, pal.bg0);
bgGrad.addColorStop(1, '#020409');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, width, height);

const cx = width * 0.5;
const cy = height * 0.5;
const colSpacing = R * (N === 6 ? 1.732 : 1.847);
const rowSpacing = R * (N === 6 ? 1.5 : 1.847);

const nx = Math.ceil(width / colSpacing) + 1;
const ny = Math.ceil(height / rowSpacing) + 1;
const startX = cx - Math.floor(nx / 2) * colSpacing;
const startY = cy - Math.floor(ny / 2) * rowSpacing;

const cycleDuration = 12 / Math.max(0.1, traceSpd);
const progress = (t % cycleDuration) / cycleDuration;

const baseW = strapW * (1 + audioBoost * 0.25);
const casingW = baseW + 5;
const coreW = Math.max(2, baseW - 4);

for (let pass = 0; pass < 4; pass++) {
  ctx.beginPath();
  if (pass === 0) {
    ctx.lineWidth = casingW;
    ctx.strokeStyle = pal.strapBg;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  } else if (pass === 1) {
    ctx.lineWidth = coreW;
    ctx.strokeStyle = pal.strapFill;
    ctx.lineCap = 'butt';
  } else if (pass === 2) {
    ctx.lineWidth = Math.max(1, strapW * 0.12);
    ctx.strokeStyle = pal.goldMain;
    ctx.lineCap = 'butt';
  } else if (pass === 3) {
    continue;
  }

  for (let gy = 0; gy < ny; gy++) {
    const py = startY + gy * rowSpacing;
    const rowOffset = (N === 6 && gy % 2 === 1) ? colSpacing * 0.5 : 0;
    for (let gx = 0; gx < nx; gx++) {
      const px = startX + gx * colSpacing + rowOffset;
      const dist = Math.hypot(px - cx, py - cy);
      const cellDelay = (dist / (width * 0.75)) * 0.35;
      const localProg = Math.min(1, Math.max(0, (progress * 1.35 - cellDelay)));
      if (localProg <= 0) continue;

      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const segPhase = (i / segs.length);
        const traceFrac = Math.min(1, Math.max(0, (localProg - segPhase * 0.4) / 0.6));
        if (traceFrac <= 0) continue;

        const x0 = px + s.x0;
        const y0 = py + s.y0;
        const x1 = px + s.x0 + (s.x1 - s.x0) * traceFrac;
        const y1 = py + s.y0 + (s.y1 - s.y0) * traceFrac;

        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
    }
  }
  ctx.stroke();
}

ctx.save();
for (let gy = 0; gy < ny; gy++) {
  const py = startY + gy * rowSpacing;
  const rowOffset = (N === 6 && gy % 2 === 1) ? colSpacing * 0.5 : 0;
  for (let gx = 0; gx < nx; gx++) {
    const px = startX + gx * colSpacing + rowOffset;
    const dist = Math.hypot(px - cx, py - cy);
    const cellDelay = (dist / (width * 0.75)) * 0.35;
    const localProg = Math.min(1, Math.max(0, (progress * 1.35 - cellDelay)));
    if (localProg < 0.2) continue;

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.order !== 1) continue;

      const midX = px + (s.x0 + s.x1) * 0.5;
      const midY = py + (s.y0 + s.y1) * 0.5;
      const dx = (s.x1 - s.x0);
      const dy = (s.y1 - s.y0);
      const len = s.len || 1;
      const overLen = casingW * 0.85;
      const vx = (dx / len) * overLen;
      const vy = (dy / len) * overLen;

      ctx.beginPath();
      ctx.lineWidth = casingW;
      ctx.strokeStyle = pal.strapBg;
      ctx.moveTo(midX - vx, midY - vy);
      ctx.lineTo(midX + vx, midY + vy);
      ctx.stroke();

      ctx.beginPath();
      ctx.lineWidth = coreW;
      ctx.strokeStyle = pal.strapFill;
      ctx.moveTo(midX - vx, midY - vy);
      ctx.lineTo(midX + vx, midY + vy);
      ctx.stroke();

      ctx.beginPath();
      ctx.lineWidth = Math.max(1, strapW * 0.12);
      ctx.strokeStyle = pal.goldBright;
      ctx.moveTo(midX - vx, midY - vy);
      ctx.lineTo(midX + vx, midY + vy);
      ctx.stroke();
    }
  }
}
ctx.restore();

for (let gy = 0; gy < ny; gy++) {
  const py = startY + gy * rowSpacing;
  const rowOffset = (N === 6 && gy % 2 === 1) ? colSpacing * 0.5 : 0;
  for (let gx = 0; gx < nx; gx++) {
    const px = startX + gx * colSpacing + rowOffset;
    const dist = Math.hypot(px - cx, py - cy);
    const pulse = Math.sin(t * 2.5 - dist * 0.005) * 0.5 + 0.5;
    const centerRadius = Math.max(4, strapW * 0.65 + audioBoost * 4);

    ctx.beginPath();
    ctx.arc(px, py, centerRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = pal.strapBg;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py, centerRadius, 0, Math.PI * 2);
    ctx.fillStyle = pal.goldMain;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py, centerRadius * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = (pulse > 0.6 || beat) ? pal.gemCore : pal.gem;
    ctx.shadowColor = pal.goldBright;
    ctx.shadowBlur = (beat || treble > 0.4) ? 12 : 3;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 32);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const ang = t * 0.3 + (i * (Math.PI * 2) / pCount);
    const orbitR = R * (0.8 + 0.35 * Math.sin(t * 0.7 + i));
    const px = cx + Math.cos(ang) * orbitR;
    const py = cy + Math.sin(ang) * orbitR;
    const hue = (typeof p.hue === 'number') ? p.hue : 45;

    ctx.beginPath();
    ctx.arc(px, py, 3 + (audioBoost * 3), 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 90%, 65%)`;
    ctx.shadowColor = `hsl(${hue}, 100%, 75%)`;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

const vig = ctx.createRadialGradient(cx, cy, height * 0.4, cx, cy, width * 0.8);
vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
vig.addColorStop(1, 'rgba(3, 6, 15, 0.65)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, width, height);

ctx.restore();