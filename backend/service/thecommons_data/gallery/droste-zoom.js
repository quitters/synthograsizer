const speedVal = getVar('zoom_speed') ?? 0.8;
const twistVal = getVar('twist_rate') ?? 0.15;
const ratioVal = getVar('ring_ratio') ?? 1.25;
const geomMode = getVar('geometry') ?? 'morph_hybrid';
const palMode = getVar('palette') ?? 'cyber_neon';
const kickMode = getVar('beat_kick') ?? 'pulse';

room.state.phase ??= 0;
room.state.bassPunch ??= 0;
room.state.lut ??= new Float32Array(256 * 3);

if (!room.state.lutReady || room.state.lastPal !== palMode) {
  room.state.lastPal = palMode;
  room.state.lutReady = true;
  const lut = room.state.lut;
  for (let i = 0; i < 256; i++) {
    const u = i / 256;
    let r, g, b;
    if (palMode === 'golden_monolith') {
      const c = 0.5 + 0.5 * Math.cos(6.28318 * u);
      r = Math.min(255, (0.95 * c + 0.08) * 255);
      g = Math.min(255, (0.75 * c + 0.04) * 255);
      b = Math.min(255, (0.35 * c * c) * 255);
    } else if (palMode === 'spectral_void') {
      r = (0.5 + 0.5 * Math.sin(6.28318 * (u + 0.00))) * 240;
      g = (0.5 + 0.5 * Math.sin(6.28318 * (u + 0.33))) * 240;
      b = (0.5 + 0.5 * Math.sin(6.28318 * (u + 0.67))) * 255;
    } else if (palMode === 'acid_retro') {
      const wave = Math.sin(6.28318 * u * 2);
      r = (u > 0.5 ? 245 : 30) + wave * 20;
      g = (0.5 + 0.5 * Math.cos(6.28318 * u)) * 255;
      b = (0.5 - 0.5 * wave) * 240;
    } else {
      r = (0.5 + 0.5 * Math.cos(6.28318 * (u + 0.1))) * 255;
      g = (0.3 + 0.7 * Math.sin(6.28318 * (u + 0.5))) * 220;
      b = (0.6 + 0.4 * Math.cos(6.28318 * (u + 0.8))) * 255;
    }
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
}

const dt = Math.min(frame.dt || 0.016, 0.1);
const kickMult = kickMode === 'strobe_twist' ? 1.6 : (kickMode === 'subtle' ? 0.35 : 0.9);
const targetBass = audio.bass * kickMult + (audio.beat ? 0.4 * kickMult : 0);
room.state.bassPunch = Math.max(targetBass, room.state.bassPunch * Math.exp(-dt * 6.5));
const bassEnergy = room.state.bassPunch;

room.state.phase += dt * speedVal * (1.0 + audio.mid * 0.45);
const p = room.state.phase;
const pFloor = Math.floor(p);
const pFrac = p - pFloor;

const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const cy = h * 0.5;
const maxDim = Math.hypot(cx, cy) * 1.05;

ctx.save();
ctx.fillStyle = '#040407';
ctx.fillRect(0, 0, w, h);

const lut = room.state.lut;
const N = 44;
const logR = Math.log(ratioVal);

for (let i = 0; i < N; i++) {
  const depth = i + pFrac;
  const scale = maxDim * Math.exp(-depth * logR * 0.48);
  if (scale < 0.4) break;

  const stepIdx = (pFloor + i) * 7;
  const lutIdx = (stepIdx & 255) * 3;
  const rawR = lut[lutIdx];
  const rawG = lut[lutIdx + 1];
  const rawB = lut[lutIdx + 2];

  const fade = Math.min(1, scale / 8);
  const depthDim = Math.max(0.2, 1.0 - (i / N) * 0.55);
  const colR = Math.min(255, (rawR * depthDim + bassEnergy * 50 * (i % 2)) | 0);
  const colG = Math.min(255, (rawG * depthDim + bassEnergy * 30) | 0);
  const colB = Math.min(255, (rawB * depthDim + bassEnergy * 60) | 0);

  const angle = depth * twistVal + bassEnergy * (kickMode === 'strobe_twist' ? 0.4 : 0.08) * ((i % 2 === 0) ? 1 : -1);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  ctx.beginPath();

  if (geomMode === 'circles') {
    ctx.arc(cx, cy, scale, 0, 6.28318);
  } else if (geomMode === 'squares') {
    const s = scale;
    const x0 = -s, y0 = -s;
    const x1 =  s, y1 = -s;
    const x2 =  s, y2 =  s;
    const x3 = -s, y3 =  s;
    ctx.moveTo(cx + x0 * cosA - y0 * sinA, cy + x0 * sinA + y0 * cosA);
    ctx.lineTo(cx + x1 * cosA - y1 * sinA, cy + x1 * sinA + y1 * cosA);
    ctx.lineTo(cx + x2 * cosA - y2 * sinA, cy + x2 * sinA + y2 * cosA);
    ctx.lineTo(cx + x3 * cosA - y3 * sinA, cy + x3 * sinA + y3 * cosA);
    ctx.closePath();
  } else if (geomMode === 'octagons') {
    const s = scale;
    const k = 0.41421356 * s;
    const px = [-s, -k,  k,  s,  s,  k, -k, -s];
    const py = [ k,  s,  s,  k, -k, -s, -s, -k];
    ctx.moveTo(cx + px[0] * cosA - py[0] * sinA, cy + px[0] * sinA + py[0] * cosA);
    for (let j = 1; j < 8; j++) {
      ctx.lineTo(cx + px[j] * cosA - py[j] * sinA, cy + px[j] * sinA + py[j] * cosA);
    }
    ctx.closePath();
  } else {
    const morph = 0.5 + 0.5 * Math.sin(depth * 0.4 + p * 0.5 + bassEnergy);
    const sides = 16;
    for (let j = 0; j < sides; j++) {
      const th = (j * 6.2831853) / sides;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const sqR = 1.0 / Math.max(Math.abs(c), Math.abs(s));
      const rad = scale * (1.0 - morph + morph * sqR * 0.78);
      const lx = rad * c;
      const ly = rad * s;
      const rx = cx + lx * cosA - ly * sinA;
      const ry = cy + lx * sinA + ly * cosA;
      if (j === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
  }

  ctx.fillStyle = `rgb(${colR},${colG},${colB})`;
  ctx.globalAlpha = fade;
  ctx.fill();

  ctx.strokeStyle = `rgba(${(colR * 1.35) | 0},${(colG * 1.35) | 0},${(colB * 1.45) | 0},0.85)`;
  ctx.lineWidth = Math.max(0.8, Math.min(3.5, scale * 0.025));
  ctx.stroke();
}

if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 32);
  const orbRadius = Math.min(cx, cy) * 0.92;
  for (let idx = 0; idx < pCount; idx++) {
    const person = room.people[idx];
    const baseAng = (idx / pCount) * 6.28318 + p * 0.2;
    const px = cx + Math.cos(baseAng) * orbRadius;
    const py = cy + Math.sin(baseAng) * orbRadius;
    const pHue = person.hue ?? (idx * 37) % 360;
    ctx.beginPath();
    ctx.arc(px, py, 3.5 + bassEnergy * 3, 0, 6.28318);
    ctx.fillStyle = `hsl(${pHue}, 90%, 65%)`;
    ctx.globalAlpha = 0.9;
    ctx.fill();
  }
}

ctx.restore();