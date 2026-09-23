const STAR_COUNT = 3200;

if (!room.state.initialized) {
  room.state.a = new Float32Array(STAR_COUNT);
  room.state.phase = new Float32Array(STAR_COUNT);
  room.state.speed = new Float32Array(STAR_COUNT);
  room.state.ecc = new Float32Array(STAR_COUNT);
  room.state.type = new Uint8Array(STAR_COUNT);
  room.state.lum = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    const u = Math.random();
    const rad = Math.pow(u, 1.8) * 440 + 8;
    room.state.a[i] = rad;
    room.state.phase[i] = Math.random() * Math.PI * 2;
    room.state.speed[i] = (22.0 / Math.sqrt(rad + 18)) * (0.85 + Math.random() * 0.3);
    room.state.ecc[i] = 0.18 + 0.14 * Math.sin(rad * 0.015);
    
    const roll = Math.random();
    if (roll < 0.14) {
      room.state.type[i] = 3;
      room.state.lum[i] = 0.3 + Math.random() * 0.4;
    } else if (roll < 0.22) {
      room.state.type[i] = 2;
      room.state.lum[i] = 0.7 + Math.random() * 0.3;
    } else if (rad < 75) {
      room.state.type[i] = 0;
      room.state.lum[i] = 0.5 + Math.random() * 0.5;
    } else {
      room.state.type[i] = 1;
      room.state.lum[i] = 0.3 + Math.random() * 0.7;
    }
  }
  room.state.initialized = true;
}

const palettes = {
  andromeda_blue: { hCore: 44, sCore: 95, lCore: 88, hDisc: 215, sDisc: 80, hGiant: 195 },
  aurora_nebula:  { hCore: 145, sCore: 90, lCore: 85, hDisc: 175, sDisc: 85, hGiant: 285 },
  golden_amber:   { hCore: 38, sCore: 100, lCore: 88, hDisc: 24, sDisc: 90, hGiant: 52 },
  cosmic_infrared:{ hCore: 12, sCore: 100, lCore: 84, hDisc: 335, sDisc: 80, hGiant: 275 }
};

const armModes = {
  two_armed: { arms: 2, twist: 0.0145 },
  four_armed: { arms: 4, twist: 0.011 },
  barred_spiral: { arms: 2, twist: 0.0095, barStrength: 0.45 }
};

const pal = palettes[getVar('galaxy_palette')] ?? palettes.andromeda_blue;
const armCfg = armModes[getVar('arm_count')] ?? armModes.two_armed;
const tiltDeg = getVar('disk_tilt') ?? 55;
const coreMul = getVar('core_brilliance') ?? 1.2;
const dustFactor = getVar('dust_depth') ?? 0.6;
const simSpeed = getVar('rotation_speed') ?? 0.8;

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);
const scale = minDim / 1000;

const cosInc = Math.cos((tiltDeg * Math.PI) / 180);
const paRot = 0.38;
const cosPA = Math.cos(paRot);
const sinPA = Math.sin(paRot);

const bass = audio.bass ?? 0;
const treble = audio.treble ?? 0;
const beat = audio.beat ? 1 : 0;

ctx.save();
ctx.fillStyle = '#020308';
ctx.fillRect(0, 0, W, H);

const coreGlowRad = (55 + bass * 35 + beat * 15) * scale * coreMul;
const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreGlowRad * 3.5);
grad.addColorStop(0, `hsla(${pal.hCore}, ${pal.sCore}%, 96%, 0.85)`);
grad.addColorStop(0.25, `hsla(${pal.hCore}, ${pal.sCore}%, ${pal.lCore}%, ${0.45 * coreMul})`);
grad.addColorStop(0.65, `hsla(${pal.hDisc}, ${pal.sDisc}%, 45%, ${0.15 * coreMul})`);
grad.addColorStop(1, 'rgba(2, 3, 8, 0)');
ctx.fillStyle = grad;
ctx.beginPath();
ctx.arc(cx, cy, coreGlowRad * 3.5, 0, Math.PI * 2);
ctx.fill();

const time = frame.t * simSpeed;
const aBuf = room.state.a;
const pBuf = room.state.phase;
const sBuf = room.state.speed;
const eBuf = room.state.ecc;
const tBuf = room.state.type;
const lBuf = room.state.lum;
const arms = armCfg.arms;
const twist = armCfg.twist;
const bar = armCfg.barStrength ?? 0;

ctx.globalCompositeOperation = 'lighter';

for (let i = 0; i < STAR_COUNT; i++) {
  const type = tBuf[i];
  if (type === 3) continue;

  const a = aBuf[i];
  const v = pBuf[i] + sBuf[i] * time * 0.45;
  let ecc = eBuf[i];
  if (bar > 0 && a < 140) {
    ecc += bar * (1.0 - a / 140) * 0.4;
  }
  
  const omega = (Math.log(a * 0.05 + 1.0) * arms * 0.95 + a * twist);
  const b = a * Math.sqrt(Math.max(0.05, 1.0 - ecc * ecc));
  
  const cosV = Math.cos(v);
  const sinV = Math.sin(v);
  const cosW = Math.cos(omega);
  const sinW = Math.sin(omega);
  
  const xOrb = a * cosV;
  const yOrb = b * sinV;
  
  const xGal = xOrb * cosW - yOrb * sinW;
  const yGal = xOrb * sinW + yOrb * cosW;
  
  const xDisk = (xGal * cosPA - yGal * sinPA) * scale;
  const yDisk = (xGal * sinPA + yGal * cosPA) * cosInc * scale;
  
  const px = cx + xDisk;
  const py = cy + yDisk;
  
  if (px < -5 || px > W + 5 || py < -5 || py > H + 5) continue;
  
  const lum = lBuf[i];
  let r = (type === 2) ? 2.2 + treble * 1.5 : (type === 0 ? 1.5 : 1.1);
  
  if (type === 0) {
    ctx.fillStyle = `hsla(${pal.hCore}, ${pal.sCore}%, 90%, ${lum * 0.8})`;
  } else if (type === 2) {
    ctx.fillStyle = `hsla(${pal.hGiant}, 95%, 80%, ${Math.min(1.0, lum + treble * 0.4)})`;
  } else {
    const hue = pal.hDisc + (lum * 30 - 15);
    ctx.fillStyle = `hsla(${hue}, ${pal.sDisc}%, ${60 + lum * 25}%, ${lum * 0.65})`;
  }
  
  ctx.fillRect(px - r * 0.5, py - r * 0.5, r, r);
}

if (dustFactor > 0.05) {
  ctx.globalCompositeOperation = 'source-over';
  const dustAlpha = dustFactor * 0.38;
  
  for (let i = 0; i < STAR_COUNT; i++) {
    if (tBuf[i] !== 3) continue;
    const a = aBuf[i];
    if (a < 35) continue;
    
    const v = pBuf[i] + sBuf[i] * time * 0.45;
    const ecc = eBuf[i] * 1.1;
    const omega = (Math.log(a * 0.05 + 1.0) * arms * 0.95 + a * twist) - 0.22;
    const b = a * Math.sqrt(Math.max(0.05, 1.0 - ecc * ecc));
    
    const xOrb = a * Math.cos(v);
    const yOrb = b * Math.sin(v);
    const cosW = Math.cos(omega);
    const sinW = Math.sin(omega);
    
    const xGal = xOrb * cosW - yOrb * sinW;
    const yGal = xOrb * sinW + yOrb * cosW;
    
    const px = cx + (xGal * cosPA - yGal * sinPA) * scale;
    const py = cy + (xGal * sinPA + yGal * cosPA) * cosInc * scale;
    
    if (px < 0 || px > W || py < 0 || py > H) continue;
    
    const dSize = (3.5 + a * 0.018) * scale;
    ctx.fillStyle = `rgba(3, 4, 10, ${dustAlpha})`;
    ctx.beginPath();
    ctx.arc(px, py, dSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

if (room.people && room.people.length > 0) {
  ctx.globalCompositeOperation = 'lighter';
  const nP = room.people.length;
  for (let pIdx = 0; pIdx < nP; pIdx++) {
    const person = room.people[pIdx];
    const armBranch = (pIdx % arms) * (Math.PI * 2 / arms);
    const pRadius = 90 + (pIdx * 65) % 300;
    const pAngle = armBranch + time * 0.18 + pRadius * twist;
    
    const xg = pRadius * Math.cos(pAngle);
    const yg = pRadius * Math.sin(pAngle) * 0.85;
    const px = cx + (xg * cosPA - yg * sinPA) * scale;
    const py = cy + (xg * sinPA + yg * cosPA) * cosInc * scale;
    
    const pHue = person.hue ?? (pIdx * 73) % 360;
    const pulse = 1.0 + Math.sin(frame.t * 3.0 + pIdx) * 0.25 + bass * 0.4;
    
    ctx.fillStyle = `hsla(${pHue}, 90%, 75%, 0.9)`;
    ctx.beginPath();
    ctx.arc(px, py, 3.5 * pulse * scale, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = `hsla(${pHue}, 80%, 65%, 0.4)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 9.0 * pulse * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
}

ctx.restore();