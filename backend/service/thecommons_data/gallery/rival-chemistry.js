ctx.save();

const aLevel = (audio?.level ?? 0) * (getVar('audio_reactivity') ?? 1.0);
const aBass = (audio?.bass ?? 0) * (getVar('audio_reactivity') ?? 1.0);
const aMid = (audio?.mid ?? 0) * (getVar('audio_reactivity') ?? 1.0);
const aTreble = (audio?.treble ?? 0) * (getVar('audio_reactivity') ?? 1.0);
const beat = audio?.beat ?? false;

const aggression = getVar('combat_aggression') ?? 0.6;
const viscosity = getVar('viscosity') ?? 1.0;
const regimeKey = getVar('growth_regime') ?? 'mitotic_cells';
const colorKey = getVar('color_pair') ?? 'neon_cyber';
const overlayKey = getVar('overlay_detail') ?? 'biofilm_contours';

const regimes = {
  mitotic_cells: { f: 0.035, k: 0.063, label: 'Mitotic Solitons' },
  coral_labyrinth: { f: 0.029, k: 0.057, label: 'Labyrinthine Maze' },
  pulsing_spirals: { f: 0.022, k: 0.051, label: 'Oscillating Waves' }
};
const regime = regimes[regimeKey] ?? regimes.mitotic_cells;

const palettes = {
  neon_cyber: {
    c1_name: 'CYAN FLARE',
    c2_name: 'CRIMSON CORE',
    c1_hi: [0, 240, 255],
    c1_lo: [10, 45, 110],
    c2_hi: [255, 30, 95],
    c2_lo: [110, 15, 45],
    clash: [255, 230, 255]
  },
  deep_sea: {
    c1_name: 'BIOLUM TEAL',
    c2_name: 'MAGMA GOLD',
    c1_hi: [20, 255, 190],
    c1_lo: [5, 60, 50],
    c2_hi: [255, 150, 10],
    c2_lo: [120, 45, 10],
    clash: [255, 250, 160]
  },
  toxic_bloom: {
    c1_name: 'ACID LIME',
    c2_name: 'VIOLET HYPHA',
    c1_hi: [195, 255, 20],
    c1_lo: [35, 85, 20],
    c2_hi: [210, 50, 255],
    c2_lo: [75, 15, 95],
    clash: [210, 255, 255]
  },
  solar_void: {
    c1_name: 'SOLAR CORONA',
    c2_name: 'ABYSSAL AZURE',
    c1_hi: [255, 215, 40],
    c1_lo: [135, 60, 15],
    c2_hi: [65, 130, 255],
    c2_lo: [15, 30, 95],
    clash: [255, 255, 240]
  }
};
const pal = palettes[colorKey] ?? palettes.neon_cyber;

const GW = 140;
const GH = 88;
const N = GW * GH;

room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  room.state.GW = GW;
  room.state.GH = GH;
  room.state.u = new Float32Array(N);
  room.state.v1 = new Float32Array(N);
  room.state.v2 = new Float32Array(N);
  room.state.nextU = new Float32Array(N);
  room.state.nextV1 = new Float32Array(N);
  room.state.nextV2 = new Float32Array(N);
  room.state.u.fill(1.0);
  room.state.bursts = [];
  room.state.sparks = [];
  room.state.alphaScore = 50;
  room.state.betaScore = 50;
  room.state.surgeT = -99;

  if (typeof OffscreenCanvas !== 'undefined') {
    room.state.offCanvas = new OffscreenCanvas(GW, GH);
  }
  if (room.state.offCanvas) {
    room.state.offCtx = room.state.offCanvas.getContext('2d');
    room.state.imgData = room.state.offCtx.createImageData(GW, GH);
  }

  const seedInit = (faction, cx, cy, rad, val) => {
    const r2 = rad * rad;
    for (let y = Math.max(0, cy - rad); y <= Math.min(GH - 1, cy + rad); y++) {
      for (let x = Math.max(0, cx - rad); x <= Math.min(GW - 1, cx + rad); x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 <= r2) {
          const idx = y * GW + x;
          const f = 1 - Math.sqrt(d2) / rad;
          room.state.u[idx] = Math.max(0.1, room.state.u[idx] - 0.6 * f);
          if (faction === 0) room.state.v1[idx] = Math.min(1.0, room.state.v1[idx] + val * f);
          else room.state.v2[idx] = Math.min(1.0, room.state.v2[idx] + val * f);
        }
      }
    }
  };

  seedInit(0, 32, 28, 7, 0.85);
  seedInit(0, 24, 60, 8, 0.9);
  seedInit(0, 48, 44, 6, 0.8);
  seedInit(1, 108, 28, 7, 0.85);
  seedInit(1, 116, 60, 8, 0.9);
  seedInit(1, 92, 44, 6, 0.8);
}

const u = room.state.u;
const v1 = room.state.v1;
const v2 = room.state.v2;
const nu = room.state.nextU;
const nv1 = room.state.nextV1;
const nv2 = room.state.nextV2;

const plantColony = (faction, gx, gy, rad, val) => {
  const r2 = rad * rad;
  const x0 = Math.max(0, Math.floor(gx - rad));
  const x1 = Math.min(GW - 1, Math.ceil(gx + rad));
  const y0 = Math.max(0, Math.floor(gy - rad));
  const y1 = Math.min(GH - 1, Math.ceil(gy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - gx) * (x - gx) + (y - gy) * (y - gy);
      if (d2 <= r2) {
        const idx = y * GW + x;
        const f = 1.0 - Math.sqrt(d2) / rad;
        u[idx] = Math.max(0.15, u[idx] - 0.45 * f);
        if (faction === 0) {
          v1[idx] = Math.min(1.0, v1[idx] + val * f);
          v2[idx] = Math.max(0.0, v2[idx] - val * f * 0.7);
        } else {
          v2[idx] = Math.min(1.0, v2[idx] + val * f);
          v1[idx] = Math.max(0.0, v1[idx] - val * f * 0.7);
        }
      }
    }
  }
};

if (room.events && room.events.length > 0) {
  for (const ev of room.events) {
    const person = room.people ? room.people.find(p => p.id === ev.participantId) : null;
    let faction = 0;
    let spawnHue = 190;
    if (person) {
      faction = (person.hue >= 90 && person.hue < 270) ? 0 : 1;
      spawnHue = person.hue;
    } else {
      faction = Math.random() < 0.5 ? 0 : 1;
      spawnHue = faction === 0 ? 190 : 345;
    }

    if (ev.name === 'seed_colony') {
      const gx = faction === 0 ? (0.15 + Math.random() * 0.45) * GW : (0.40 + Math.random() * 0.45) * GW;
      const gy = (0.15 + Math.random() * 0.70) * GH;
      plantColony(faction, gx, gy, 7, 0.95);
      room.state.bursts.push({
        x: (gx / GW) * frame.width,
        y: (gy / GH) * frame.height,
        faction,
        hue: spawnHue,
        t: frame.t,
        label: person ? `COLONY: Table ${person.table ?? person.id.slice(0, 4)}` : (faction === 0 ? 'ALPHA COLONY' : 'BETA COLONY'),
        rad: 8
      });
    } else if (ev.name === 'seed_rival') {
      const rivalFaction = 1 - faction;
      const gx = rivalFaction === 0 ? (0.2 + Math.random() * 0.35) * GW : (0.45 + Math.random() * 0.35) * GW;
      const gy = (0.2 + Math.random() * 0.6) * GH;
      plantColony(rivalFaction, gx, gy, 6, 0.9);
      room.state.bursts.push({
        x: (gx / GW) * frame.width,
        y: (gy / GH) * frame.height,
        faction: rivalFaction,
        hue: rivalFaction === 0 ? 190 : 345,
        t: frame.t,
        label: 'COUNTER-INFECTION',
        rad: 12
      });
    } else if (ev.name === 'catalyst_surge') {
      room.state.surgeT = frame.t;
      for (let s = 0; s < 5; s++) {
        const sgx = (0.35 + Math.random() * 0.30) * GW;
        const sgy = (0.15 + Math.random() * 0.70) * GH;
        plantColony(s % 2, sgx, sgy, 5, 0.85);
      }
      room.state.bursts.push({
        x: frame.width * 0.5,
        y: frame.height * 0.5,
        faction: 2,
        hue: 55,
        t: frame.t,
        label: 'CATALYST SHOCKWAVE',
        rad: 30
      });
    }
  }
}

if (room.state.bursts.length > 30) {
  room.state.bursts.splice(0, room.state.bursts.length - 30);
}

const Du = 0.16 * viscosity;
const Dv = 0.08 * viscosity;
const dt = 0.85;

const baseF = regime.f;
const baseK = regime.k;
const waveFeedA = Math.sin(frame.t * 0.2) * 0.0015 + aBass * 0.003;
const waveFeedB = -Math.sin(frame.t * 0.2) * 0.0015 + aTreble * 0.003;

let sumA = 0;
let sumB = 0;

for (let y = 0; y < GH; y++) {
  const row = y * GW;
  const upRow = (y > 0 ? y - 1 : y) * GW;
  const dnRow = (y < GH - 1 ? y + 1 : y) * GW;
  for (let x = 0; x < GW; x++) {
    const i = row + x;
    const l = row + (x > 0 ? x - 1 : x);
    const r = row + (x < GW - 1 ? x + 1 : x);
    const ul = upRow + (x > 0 ? x - 1 : x);
    const ur = upRow + (x < GW - 1 ? x + 1 : x);
    const dl = dnRow + (x > 0 ? x - 1 : x);
    const dr = dnRow + (x < GW - 1 ? x + 1 : x);
    const uCenter = upRow + x;
    const dCenter = dnRow + x;

    const lapU = 0.2 * (u[l] + u[r] + u[uCenter] + u[dCenter]) + 0.05 * (u[ul] + u[ur] + u[dl] + u[dr]) - u[i];
    const lapV1 = 0.2 * (v1[l] + v1[r] + v1[uCenter] + v1[dCenter]) + 0.05 * (v1[ul] + v1[ur] + v1[dl] + v1[dr]) - v1[i];
    const lapV2 = 0.2 * (v2[l] + v2[r] + v2[uCenter] + v2[dCenter]) + 0.05 * (v2[ul] + v2[ur] + v2[dl] + v2[dr]) - v2[i];

    const uVal = u[i];
    const v1Val = v1[i];
    const v2Val = v2[i];

    const r1 = uVal * v1Val * v1Val;
    const r2 = uVal * v2Val * v2Val;
    const clash = aggression * v1Val * v2Val * (1.0 + aBass * 0.8);
    const conversion = (v1Val - v2Val) * clash * 0.45;

    const du = Du * lapU - r1 - r2 + (baseF + waveFeedA * 0.5) * (1.0 - uVal);
    const dv1 = Dv * lapV1 + r1 - (baseF + waveFeedA + baseK) * v1Val - clash * 0.35 + conversion;
    const dv2 = Dv * lapV2 + r2 - (baseF + waveFeedB + baseK) * v2Val - clash * 0.35 - conversion;

    nu[i] = Math.max(0.0, Math.min(1.0, uVal + du * dt));
    nv1[i] = Math.max(0.0, Math.min(1.0, v1Val + dv1 * dt));
    nv2[i] = Math.max(0.0, Math.min(1.0, v2Val + dv2 * dt));

    if ((x & 3) === 0 && (y & 3) === 0) {
      if (v1Val > 0.15) sumA++;
      if (v2Val > 0.15) sumB++;
    }

    if (clash > 0.08 && Math.random() < 0.003 + aTreble * 0.015 && room.state.sparks.length < 90) {
      room.state.sparks.push({
        x: (x / GW) * frame.width,
        y: (y / GH) * frame.height,
        vx: (Math.random() - 0.5) * 45,
        vy: (Math.random() - 0.5) * 45,
        life: 1.0,
        hue: v1Val > v2Val ? pal.c1_hi : pal.c2_hi
      });
    }
  }
}

u.set(nu);
v1.set(nv1);
v2.set(nv2);

const totalSampled = Math.max(1, sumA + sumB);
room.state.alphaScore = (sumA / totalSampled) * 100;
room.state.betaScore = 100 - room.state.alphaScore;

if (sumA < 20) plantColony(0, (0.15 + Math.random() * 0.2) * GW, (0.2 + Math.random() * 0.6) * GH, 7, 0.9);
if (sumB < 20) plantColony(1, (0.65 + Math.random() * 0.2) * GW, (0.2 + Math.random() * 0.6) * GH, 7, 0.9);

if (room.state.offCanvas && room.state.imgData) {
  const d = room.state.imgData.data;
  let p = 0;
  for (let i = 0; i < N; i++) {
    const v1Val = v1[i];
    const v2Val = v2[i];
    const a1 = Math.min(1.0, Math.max(0.0, (v1Val - 0.06) * 3.2));
    const a2 = Math.min(1.0, Math.max(0.0, (v2Val - 0.06) * 3.2));
    const clash = Math.min(1.0, v1Val * v2Val * 16.0);

    let r = 7;
    let g = 9;
    let b = 15;

    if (a1 > 0) {
      const c1R = pal.c1_hi[0] * a1 + pal.c1_lo[0] * (1 - a1);
      const c1G = pal.c1_hi[1] * a1 + pal.c1_lo[1] * (1 - a1);
      const c1B = pal.c1_hi[2] * a1 + pal.c1_lo[2] * (1 - a1);
      r += c1R * a1;
      g += c1G * a1;
      b += c1B * a1;
    }
    if (a2 > 0) {
      const c2R = pal.c2_hi[0] * a2 + pal.c2_lo[0] * (1 - a2);
      const c2G = pal.c2_hi[1] * a2 + pal.c2_lo[1] * (1 - a2);
      const c2B = pal.c2_hi[2] * a2 + pal.c2_lo[2] * (1 - a2);
      r += c2R * a2;
      g += c2G * a2;
      b += c2B * a2;
    }
    if (clash > 0.03) {
      const clBoost = clash * (0.85 + aBass * 0.4);
      r = r * (1 - clBoost) + pal.clash[0] * clBoost;
      g = g * (1 - clBoost) + pal.clash[1] * clBoost;
      b = b * (1 - clBoost) + pal.clash[2] * clBoost;
    }

    d[p] = r > 255 ? 255 : r;
    d[p + 1] = g > 255 ? 255 : g;
    d[p + 2] = b > 255 ? 255 : b;
    d[p + 3] = 255;
    p += 4;
  }

  room.state.offCtx.putImageData(room.state.imgData, 0, 0);
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(room.state.offCanvas, 0, 0, frame.width, frame.height);
} else {
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, frame.width, frame.height);
}

ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (let k = room.state.sparks.length - 1; k >= 0; k--) {
  const s = room.state.sparks[k];
  s.x += s.vx * frame.dt;
  s.y += s.vy * frame.dt;
  s.life -= frame.dt * 1.8;
  if (s.life <= 0) {
    room.state.sparks.splice(k, 1);
    continue;
  }
  ctx.fillStyle = `rgba(${s.hue[0]}, ${s.hue[1]}, ${s.hue[2]}, ${s.life * 0.9})`;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 1.8 * s.life, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

for (let bIdx = room.state.bursts.length - 1; bIdx >= 0; bIdx--) {
  const b = room.state.bursts[bIdx];
  const age = frame.t - b.t;
  if (age > 2.0) {
    room.state.bursts.splice(bIdx, 1);
    continue;
  }
  const progress = age / 2.0;
  const alpha = (1 - progress) * 0.85;
  const radius = b.rad + progress * 70;

  ctx.save();
  ctx.strokeStyle = `hsla(${b.hue}, 95%, 65%, ${alpha})`;
  ctx.lineWidth = 2.5 * (1 - progress);
  ctx.beginPath();
  ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(b.x, b.y, radius * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${b.hue}, 95%, 85%, ${alpha * 0.6})`;
  ctx.stroke();

  if (progress < 0.7) {
    ctx.fillStyle = `hsla(${b.hue}, 90%, 90%, ${alpha})`;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x, b.y - radius - 6);
  }
  ctx.restore();
}

if (overlayKey === 'biofilm_contours') {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = `rgba(${pal.clash[0]}, ${pal.clash[1]}, ${pal.clash[2]}, ${0.08 + aMid * 0.15})`;
  ctx.lineWidth = 1.2;
  const scanStep = 24;
  for (let gy = scanStep; gy < frame.height; gy += scanStep) {
    ctx.beginPath();
    ctx.moveTo(0, gy + Math.sin(gy * 0.05 + frame.t * 1.5) * 6);
    for (let gx = 0; gx <= frame.width; gx += 32) {
      const wav = Math.sin(gx * 0.02 + gy * 0.03 + frame.t * 2.0) * (5 + aBass * 10);
      ctx.lineTo(gx, gy + wav);
    }
    ctx.stroke();
  }
  ctx.restore();
}

const people = room.people ?? [];
if (people.length > 0) {
  ctx.save();
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const pFaction = (p.hue >= 90 && p.hue < 270) ? 0 : 1;
    const baseX = pFaction === 0 ? frame.width * 0.04 : frame.width * 0.96;
    const spacing = Math.min(38, (frame.height - 120) / Math.max(1, people.length));
    const baseY = 80 + i * spacing;
    const pulse = 1.0 + Math.sin(frame.t * 3.0 + i) * 0.2 + (beat ? 0.35 : 0);

    ctx.fillStyle = `hsl(${p.hue}, 85%, 55%)`;
    ctx.beginPath();
    ctx.arc(baseX, baseY, 5.5 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsla(${p.hue}, 90%, 80%, 0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(baseX, baseY, 10 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(230, 240, 255, 0.85)';
    ctx.font = '9px monospace';
    ctx.textAlign = pFaction === 0 ? 'left' : 'right';
    const pLabel = p.table != null ? `T${p.table}` : p.id.slice(0, 3);
    ctx.fillText(pLabel, baseX + (pFaction === 0 ? 14 : -14), baseY + 3);
  }
  ctx.restore();
}

ctx.save();
const barH = 34;
ctx.fillStyle = 'rgba(5, 7, 12, 0.82)';
ctx.fillRect(0, 0, frame.width, barH);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(0, barH);
ctx.lineTo(frame.width, barH);
ctx.stroke();

const aScore = room.state.alphaScore ?? 50;
const bScore = 100 - aScore;
const midX = frame.width * (aScore / 100);

ctx.fillStyle = `rgba(${pal.c1_hi[0]}, ${pal.c1_hi[1]}, ${pal.c1_hi[2]}, 0.85)`;
ctx.fillRect(0, barH - 3, midX, 3);
ctx.fillStyle = `rgba(${pal.c2_hi[0]}, ${pal.c2_hi[1]}, ${pal.c2_hi[2]}, 0.85)`;
ctx.fillRect(midX, barH - 3, frame.width - midX, 3);

ctx.fillStyle = `rgb(${pal.clash[0]}, ${pal.clash[1]}, ${pal.clash[2]})`;
ctx.beginPath();
ctx.arc(midX, barH - 1.5, 4 + (beat ? 2 : 0), 0, Math.PI * 2);
ctx.fill();

ctx.font = 'bold 11px monospace';
ctx.fillStyle = `rgb(${pal.c1_hi[0]}, ${pal.c1_hi[1]}, ${pal.c1_hi[2]})`;
ctx.textAlign = 'left';
ctx.fillText(`${pal.c1_name} ${aScore.toFixed(1)}%`, 16, 21);

ctx.fillStyle = `rgb(${pal.c2_hi[0]}, ${pal.c2_hi[1]}, ${pal.c2_hi[2]})`;
ctx.textAlign = 'right';
ctx.fillText(`${bScore.toFixed(1)}% ${pal.c2_name}`, frame.width - 16, 21);

ctx.font = '9px monospace';
ctx.fillStyle = 'rgba(180, 205, 230, 0.7)';
ctx.textAlign = 'center';
const statusTxt = overlayKey === 'full_diagnostic'
  ? `REGIME: ${regime.label.toUpperCase()} | AGGRESSION: ${(aggression * 100).toFixed(0)}% | BATTLEFRONT SENSOR ACTIVE`
  : `CONTESTED CONTACT FRONT | AUDIO BIO-PUMP ${(aLevel * 100).toFixed(0)}%`;
ctx.fillText(statusTxt, frame.width * 0.5, 21);
ctx.restore();

ctx.restore();