ctx.save();

if (!room.state.init) {
  const MAX_F = 2400;
  const fx = new Float32Array(MAX_F);
  const fy = new Float32Array(MAX_F);
  const fs = new Float32Array(MAX_F);
  const phi = 0.618033988749895;
  for (let i = 0; i < MAX_F; i++) {
    fx[i] = (i * phi) % 1.0;
    fy[i] = (i * phi * 1.414213562) % 1.0;
    fs[i] = 0.5 + 0.5 * Math.sin(i * 12.9898);
  }
  room.state.fx = fx;
  room.state.fy = fy;
  room.state.fs = fs;
  room.state.chX = new Float32Array(32);
  room.state.chY = new Float32Array(32);
  room.state.chQ = new Float32Array(32);
  room.state.chHue = new Float32Array(32);
  room.state.init = true;
}

const paletteKey = getVar('palette') ?? 'aurora_borealis';
const topoKey = getVar('field_topology') ?? 'dipolar_flux';
const numFilings = Math.min(2400, Math.max(600, getVar('filing_density') ?? 1500));
const numTracers = Math.min(64, Math.max(16, getVar('tracer_count') ?? 32));
const speed = getVar('orbit_speed') ?? 0.8;
const reach = getVar('flux_reach') ?? 1.2;

const bgColors = {
  aurora_borealis: 'rgba(6, 8, 15, 0.22)',
  phosphor_crt: 'rgba(3, 10, 6, 0.24)',
  ferro_slate: 'rgba(14, 16, 20, 0.28)',
  solar_plasma: 'rgba(16, 6, 4, 0.24)'
};
ctx.fillStyle = bgColors[paletteKey] ?? bgColors.aurora_borealis;
ctx.fillRect(0, 0, frame.width, frame.height);

const people = (room.people && room.people.length > 0) ? room.people : null;
const numCharges = Math.min(24, Math.max(4, people ? people.length : 5));
const chX = room.state.chX;
const chY = room.state.chY;
const chQ = room.state.chQ;
const chHue = room.state.chHue;

const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const bassBoost = audio.bass * 0.25;

for (let k = 0; k < numCharges; k++) {
  const p = people ? people[k % people.length] : null;
  chHue[k] = p ? p.hue : (k * (360 / numCharges) + 20) % 360;
  
  if (topoKey === 'monopole_repel') {
    chQ[k] = 1.0;
  } else {
    chQ[k] = (k % 2 === 0) ? 1.0 : -1.0;
  }

  const phase = (k / numCharges) * Math.PI * 2;
  const harmonic = 1 + (k % 3) * 0.5;
  const t = frame.t * speed * 0.6;
  const rx = (0.24 + 0.10 * Math.sin(k * 1.6 + t * 0.35)) * frame.width * (1.0 + bassBoost);
  const ry = (0.22 + 0.09 * Math.cos(k * 2.1 + t * 0.40)) * frame.height * (1.0 + bassBoost);
  chX[k] = cx + Math.cos(t * harmonic + phase) * rx + Math.sin(t * 0.8 + phase * 1.5) * (frame.width * 0.05);
  chY[k] = cy + Math.sin(t * (harmonic * 0.85) + phase) * ry + Math.cos(t * 0.7 + phase * 1.3) * (frame.height * 0.05);
}

const fx = room.state.fx;
const fy = room.state.fy;
const fs = room.state.fs;
const softening = 1400 * reach;
const isVortex = (topoKey === 'vortex_curls');

let filingColor = 'rgba(180, 205, 235, 0.45)';
if (paletteKey === 'phosphor_crt') filingColor = 'rgba(70, 240, 140, 0.45)';
else if (paletteKey === 'ferro_slate') filingColor = 'rgba(215, 220, 230, 0.50)';
else if (paletteKey === 'solar_plasma') filingColor = 'rgba(255, 180, 70, 0.45)';

ctx.strokeStyle = filingColor;
ctx.lineWidth = 1.2;
ctx.beginPath();

const beatPulse = audio.beat ? 1.4 : 1.0;
const w = frame.width;
const h = frame.height;

for (let i = 0; i < numFilings; i++) {
  const px = fx[i] * w;
  const py = fy[i] * h;

  let bx = 0;
  let by = 0;
  for (let c = 0; c < numCharges; c++) {
    const dx = px - chX[c];
    const dy = py - chY[c];
    const d2 = dx * dx + dy * dy + softening;
    const inv = chQ[c] / (d2 * Math.sqrt(d2));
    if (isVortex) {
      bx -= dy * inv;
      by += dx * inv;
    } else {
      bx += dx * inv;
      by += dy * inv;
    }
  }

  const bMag = Math.hypot(bx, by);
  if (bMag > 1e-9) {
    const nx = bx / bMag;
    const ny = by / bMag;
    const filingLen = (2.5 + Math.min(8.0, bMag * 9e6 * reach)) * beatPulse * (0.8 + fs[i] * 0.4);
    ctx.moveTo(px - nx * filingLen, py - ny * filingLen);
    ctx.lineTo(px + nx * filingLen, py + ny * filingLen);
  }
}
ctx.stroke();

const stepsPerLine = 35;
const linesPerCharge = Math.max(1, Math.floor(numTracers / numCharges));
const stepSize = (14 * reach) * (1.0 + audio.treble * 0.3);

ctx.save();
ctx.globalCompositeOperation = 'lighter';

for (let c = 0; c < numCharges; c++) {
  const chargeX = chX[c];
  const chargeY = chY[c];
  const qSign = chQ[c] >= 0 ? 1 : -1;
  const hue = chHue[c];

  const lineAlpha = 0.55 + audio.mid * 0.35;
  let strokeStyle = 'hsla(' + hue + ', 85%, 65%, ' + lineAlpha + ')';
  if (paletteKey === 'phosphor_crt') {
    strokeStyle = 'hsla(' + (140 + (c % 3) * 20) + ', 100%, 65%, ' + lineAlpha + ')';
  } else if (paletteKey === 'ferro_slate') {
    strokeStyle = 'hsla(' + hue + ', 35%, 75%, ' + (lineAlpha * 0.7) + ')';
  } else if (paletteKey === 'solar_plasma') {
    strokeStyle = 'hsla(' + (20 + (c * 25) % 60) + ', 95%, 60%, ' + lineAlpha + ')';
  }

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.6;

  for (let l = 0; l < linesPerCharge; l++) {
    const angle = (l / linesPerCharge) * Math.PI * 2 + frame.t * 0.15;
    let currX = chargeX + Math.cos(angle) * 18;
    let currY = chargeY + Math.sin(angle) * 18;

    ctx.beginPath();
    ctx.moveTo(currX, currY);

    for (let s = 0; s < stepsPerLine; s++) {
      let bx = 0;
      let by = 0;
      for (let k = 0; k < numCharges; k++) {
        const dx = currX - chX[k];
        const dy = currY - chY[k];
        const d2 = dx * dx + dy * dy + softening;
        const inv = chQ[k] / (d2 * Math.sqrt(d2));
        if (isVortex) {
          bx -= dy * inv;
          by += dx * inv;
        } else {
          bx += dx * inv;
          by += dy * inv;
        }
      }

      const mag = Math.hypot(bx, by);
      if (mag < 1e-8) break;

      const dir = isVortex ? 1.0 : qSign;
      currX += (bx / mag) * stepSize * dir;
      currY += (by / mag) * stepSize * dir;

      if (currX < -50 || currX > w + 50 || currY < -50 || currY > h + 50) break;
      ctx.lineTo(currX, currY);
    }
    ctx.stroke();
  }
}
ctx.restore();

for (let c = 0; c < numCharges; c++) {
  const px = chX[c];
  const py = chY[c];
  const hue = chHue[c];
  const baseR = 10 + audio.bass * 14;

  const grad = ctx.createRadialGradient(px, py, 2, px, py, baseR * 2.8);
  grad.addColorStop(0, 'hsla(' + hue + ', 100%, 80%, 0.9)');
  grad.addColorStop(0.4, 'hsla(' + hue + ', 90%, 55%, 0.4)');
  grad.addColorStop(1, 'hsla(' + hue + ', 90%, 40%, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(px, py, baseR * 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py, Math.max(3, baseR * 0.4), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = chQ[c] >= 0 ? 'rgba(255,255,255,0.85)' : 'rgba(200,225,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, baseR * 1.1, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const signSize = Math.max(2, baseR * 0.3);
  ctx.moveTo(px - signSize, py);
  ctx.lineTo(px + signSize, py);
  if (chQ[c] >= 0) {
    ctx.moveTo(px, py - signSize);
    ctx.lineTo(px, py + signSize);
  }
  ctx.stroke();
}

ctx.restore();