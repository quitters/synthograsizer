const width = frame.width;
const height = frame.height;
const cx = width * 0.5;
const cy = height * 0.5;
const dt = Math.min(frame.dt || 0.016, 0.05);

const mirrors = Math.round(getVar('mirrors') ?? 6);
const rotSpeed = getVar('rot_speed') ?? 0.3;
const driftSpeed = getVar('drift_speed') ?? 0.8;
const zoom = getVar('zoom') ?? 1.0;
const paletteKey = getVar('palette') || 'stained_glass';
const shardStyle = getVar('shard_style') || 'faceted_gems';
const aperture = getVar('aperture') || 'brass_scope';

const PALETTES = {
  stained_glass: [[352, 85, 50], [218, 90, 52], [148, 80, 42], [42, 95, 54], [282, 75, 48], [14, 92, 54], [192, 88, 48], [48, 92, 60]],
  opal_fire:     [[184, 90, 64], [332, 85, 68], [46, 95, 66], [272, 80, 70], [162, 80, 60], [16, 92, 68], [206, 95, 74], [302, 85, 66]],
  deep_amethyst: [[268, 85, 48], [292, 80, 54], [236, 90, 46], [322, 75, 50], [196, 85, 40], [276, 95, 64], [248, 70, 36], [308, 85, 58]],
  neon_cyber:    [[326, 100, 54], [176, 100, 50], [86, 100, 52], [48, 100, 52], [282, 100, 58], [196, 100, 54], [14, 100, 54], [132, 100, 50]]
};

room.state.initialized ??= false;
if (!room.state.initialized) {
  room.state.initialized = true;
  room.state.tubeAngle = 0;
  room.state.beatPulse = 0;
  room.state.lastPalette = '';
  room.state.peopleHash = 0;
  room.state.cachedColors = [];
  room.state.shards = [];
  for (let i = 0; i < 36; i++) {
    room.state.shards.push({
      r: 60 + (i / 36) * 440,
      vr: (Math.random() - 0.5) * 20,
      driftR: (Math.random() - 0.5) * 14,
      th: Math.random() * 0.4,
      vth: (Math.random() - 0.5) * 0.05,
      driftTh: (Math.random() - 0.5) * 0.03,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 1.5,
      size: 16 + (i % 6) * 5,
      type: i % 4,
      colorIdx: i % 16,
      facet: 0.35 + (i % 5) * 0.1
    });
  }
}

const peopleLen = room.people ? room.people.length : 0;
if (room.state.lastPalette !== paletteKey || room.state.peopleHash !== peopleLen) {
  room.state.lastPalette = paletteKey;
  room.state.peopleHash = peopleLen;
  const base = PALETTES[paletteKey] ?? PALETTES.stained_glass;
  room.state.cachedColors = [];
  for (let i = 0; i < 16; i++) {
    let [h, s, l] = base[i % base.length];
    if (peopleLen > 0) {
      const p = room.people[i % peopleLen];
      if (p && typeof p.hue === 'number') {
        h = Math.round((h * 0.4 + p.hue * 0.6)) % 360;
      }
    }
    room.state.cachedColors.push({
      fill: `hsla(${h}, ${s}%, ${l}%, 0.72)`,
      fillHigh: `hsla(${h}, ${s}%, ${Math.min(96, l + 26)}%, 0.88)`,
      stroke: `hsla(${h}, ${s}%, ${Math.min(98, l + 38)}%, 0.92)`,
      lead: '#120f0d',
      glow: `hsla(${h}, ${s}%, ${l}%, 0.28)`
    });
  }
}

if (audio && audio.beat) {
  room.state.beatPulse = 1.0;
  const kick = 1 + (audio.bass || 0);
  const shards = room.state.shards;
  for (let i = 0; i < shards.length; i++) {
    const s = shards[i];
    s.vth += (Math.random() - 0.5) * 0.12 * kick;
    s.vr += (Math.random() - 0.5) * 90 * kick;
    s.vrot += (Math.random() - 0.5) * 5.0 * kick;
  }
}
room.state.beatPulse *= 0.91;

room.state.tubeAngle += rotSpeed * dt;

const omega = Math.PI / mirrors;
const maxScopeR = Math.hypot(width, height) * 0.52 * zoom;
const minR = 24;
const shards = room.state.shards;

for (let i = 0; i < shards.length; i++) {
  const s = shards[i];
  s.th += (s.vth + s.driftTh) * dt * driftSpeed;
  s.r += (s.vr + s.driftR) * dt * driftSpeed;
  s.rot += s.vrot * dt;

  s.vth *= 0.95;
  s.vr *= 0.95;
  s.vrot *= 0.96;

  if (s.th < 0.015) {
    s.th = 0.015;
    s.vth = Math.abs(s.vth) * 0.8 + 0.02;
    s.driftTh = Math.abs(s.driftTh);
  } else if (s.th > omega - 0.015) {
    s.th = omega - 0.015;
    s.vth = -Math.abs(s.vth) * 0.8 - 0.02;
    s.driftTh = -Math.abs(s.driftTh);
  }

  if (s.r < minR) {
    s.r = minR;
    s.vr = Math.abs(s.vr) * 0.8 + 15;
    s.driftR = Math.abs(s.driftR);
  } else if (s.r > maxScopeR) {
    s.r = maxScopeR;
    s.vr = -Math.abs(s.vr) * 0.8 - 15;
    s.driftR = -Math.abs(s.driftR);
  }
}

ctx.save();
ctx.fillStyle = '#060508';
ctx.fillRect(0, 0, width, height);

ctx.translate(cx, cy);
ctx.rotate(room.state.tubeAngle);

const audioBass = audio ? audio.bass || 0 : 0;
const audioTreb = audio ? audio.treble || 0 : 0;
const colors = room.state.cachedColors;

function renderShards() {
  for (let i = 0; i < shards.length; i++) {
    const s = shards[i];
    const px = s.r * Math.cos(s.th);
    const py = s.r * Math.sin(s.th);
    const sz = s.size * (1 + audioBass * 0.22);
    const c = colors[s.colorIdx];

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(s.rot);

    if (shardStyle === 'faceted_gems') {
      if (s.type === 0) {
        ctx.beginPath();
        ctx.moveTo(0, -sz * 1.1);
        ctx.lineTo(sz * 0.75, sz * 0.65);
        ctx.lineTo(-sz * 0.75, sz * 0.65);
        ctx.closePath();
        ctx.fillStyle = c.fill;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -sz * 1.1);
        ctx.lineTo(0, sz * 0.65);
        ctx.lineTo(-sz * 0.75, sz * 0.65);
        ctx.closePath();
        ctx.fillStyle = c.fillHigh;
        ctx.fill();
      } else if (s.type === 1) {
        ctx.beginPath();
        ctx.moveTo(0, -sz * 1.3);
        ctx.lineTo(sz * 0.65, 0);
        ctx.lineTo(0, sz * 1.3);
        ctx.lineTo(-sz * 0.65, 0);
        ctx.closePath();
        ctx.fillStyle = c.fill;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -sz * 1.3);
        ctx.lineTo(sz * 0.65, 0);
        ctx.lineTo(0, sz * 1.3);
        ctx.closePath();
        ctx.fillStyle = c.fillHigh;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -sz);
        ctx.lineTo(sz * 0.8, -sz * 0.3);
        ctx.lineTo(sz * 0.5, sz * 0.8);
        ctx.lineTo(-sz * 0.5, sz * 0.8);
        ctx.lineTo(-sz * 0.8, -sz * 0.3);
        ctx.closePath();
        ctx.fillStyle = c.fill;
        ctx.fill();
      }
      ctx.lineWidth = 1.0 + audioTreb * 1.2;
      ctx.strokeStyle = c.stroke;
      ctx.stroke();
    } else if (shardStyle === 'stained_plates') {
      ctx.beginPath();
      ctx.moveTo(-sz * 0.7, -sz * 0.7);
      ctx.lineTo(sz * 0.7, -sz * 0.5);
      ctx.lineTo(sz * 0.9, sz * 0.6);
      ctx.lineTo(-sz * 0.6, sz * 0.8);
      ctx.closePath();
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = c.lead;
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = c.stroke;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -sz * 1.8);
      ctx.lineTo(sz * 0.32, -sz * 0.2);
      ctx.lineTo(0, sz * 0.9);
      ctx.lineTo(-sz * 0.32, -sz * 0.2);
      ctx.closePath();
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -sz * 1.8);
      ctx.lineTo(0, sz * 0.9);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = c.stroke;
      ctx.stroke();
    }

    ctx.restore();
  }
}

const clipR = maxScopeR * 1.05;
for (let k = 0; k < mirrors; k++) {
  ctx.save();
  ctx.rotate(k * 2 * omega);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, clipR, 0, omega);
  ctx.closePath();
  ctx.clip();
  renderShards();
  ctx.restore();

  ctx.save();
  ctx.rotate((k + 1) * 2 * omega);
  ctx.scale(1, -1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, clipR, 0, omega);
  ctx.closePath();
  ctx.clip();
  renderShards();
  ctx.restore();
}

const centerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 90 + audioBass * 40);
centerGlow.addColorStop(0, 'rgba(255, 250, 230, 0.6)');
centerGlow.addColorStop(0.3, 'rgba(255, 215, 120, 0.25)');
centerGlow.addColorStop(1, 'rgba(255, 200, 100, 0)');
ctx.fillStyle = centerGlow;
ctx.beginPath();
ctx.arc(0, 0, 120, 0, Math.PI * 2);
ctx.fill();

ctx.restore();

ctx.save();
const viewRadius = Math.min(width, height) * 0.47;
if (aperture === 'brass_scope') {
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(cx, cy, viewRadius, 0, Math.PI * 2, true);
  ctx.fillStyle = '#080605';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, viewRadius, 0, Math.PI * 2);
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#4a3416';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, viewRadius, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#c6953c';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, viewRadius - 6, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffe89c';
  ctx.stroke();
} else if (aperture === 'dark_vignette') {
  const vig = ctx.createRadialGradient(cx, cy, viewRadius * 0.7, cx, cy, Math.max(cx, cy));
  vig.addColorStop(0, 'rgba(6, 5, 8, 0)');
  vig.addColorStop(0.7, 'rgba(6, 5, 8, 0.75)');
  vig.addColorStop(1, 'rgba(6, 5, 8, 0.98)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
}
ctx.restore();