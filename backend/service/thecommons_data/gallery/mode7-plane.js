const W = frame.width;
const H = frame.height;
const S_W = 384;
const S_H = 216;

const theme = getVar('theme') ?? 'f_zero';
const timeOfDay = getVar('time_of_day') ?? 'twilight_neon';
const steerMode = getVar('steering_mode') ?? 'smooth_banking';
const speedMult = getVar('speed') ?? 1.5;
const camAltBase = getVar('camera_height') ?? 40;
const horizonFrac = getVar('horizon') ?? 0.35;

room.state.offscreen ??= new OffscreenCanvas(S_W, S_H);
room.state.offCtx ??= room.state.offscreen.getContext('2d');
room.state.imgData ??= room.state.offCtx.createImageData(S_W, S_H);
room.state.buf32 ??= new Uint32Array(room.state.imgData.data.buffer);

function getTrackPoint(tNorm) {
  const a = tNorm * Math.PI * 2;
  const r = 145 + 42 * Math.sin(a * 2) + 28 * Math.cos(a * 3) + 14 * Math.sin(a * 5);
  return {
    x: 256 + Math.cos(a) * r,
    y: 256 + Math.sin(a) * r * 0.88
  };
}

if (!room.state.trackLUT) {
  const lut = [];
  const STEPS = 512;
  for (let i = 0; i < STEPS; i++) {
    const t0 = i / STEPS;
    const t1 = (i + 1) / STEPS;
    const p0 = getTrackPoint(t0);
    const p1 = getTrackPoint(t1);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    lut.push({
      x: p0.x,
      y: p0.y,
      ang: Math.atan2(dy, dx)
    });
  }
  room.state.trackLUT = lut;
}

const curPaletteKey = `${theme}_${timeOfDay}`;
if (room.state.loadedKey !== curPaletteKey) {
  room.state.loadedKey = curPaletteKey;
  const texCanvas = new OffscreenCanvas(512, 512);
  const tc = texCanvas.getContext('2d');

  const colors = {
    f_zero: {
      bg: '#080518', grid: '#161036', road: '#141426', curb1: '#ff0055', curb2: '#00f0ff', line: '#ffe600'
    },
    cyber_grid: {
      bg: '#03080e', grid: '#0a2228', road: '#09151e', curb1: '#00ff88', curb2: '#ffaa00', line: '#ffffff'
    },
    desert_rally: {
      bg: '#6c2712', grid: '#8f3818', road: '#261b18', curb1: '#d85020', curb2: '#f0e8d0', line: '#e8c060'
    },
    toxic_sewer: {
      bg: '#0c160c', grid: '#193019', road: '#121812', curb1: '#77ff00', curb2: '#aa00ff', line: '#00ffcc'
    }
  }[theme] || {
    bg: '#080518', grid: '#161036', road: '#141426', curb1: '#ff0055', curb2: '#00f0ff', line: '#ffe600'
  };

  tc.fillStyle = colors.bg;
  tc.fillRect(0, 0, 512, 512);

  tc.strokeStyle = colors.grid;
  tc.lineWidth = 1;
  for (let g = 0; g < 512; g += 16) {
    tc.beginPath(); tc.moveTo(g, 0); tc.lineTo(g, 512); tc.stroke();
    tc.beginPath(); tc.moveTo(0, g); tc.lineTo(512, g); tc.stroke();
  }

  const lut = room.state.trackLUT;
  function traceTrack() {
    tc.beginPath();
    tc.moveTo(lut[0].x, lut[0].y);
    for (let i = 1; i < lut.length; i++) {
      tc.lineTo(lut[i].x, lut[i].y);
    }
    tc.closePath();
  }

  tc.lineWidth = 44;
  tc.strokeStyle = colors.curb1;
  traceTrack();
  tc.stroke();

  tc.lineWidth = 44;
  tc.setLineDash([8, 8]);
  tc.strokeStyle = colors.curb2;
  traceTrack();
  tc.stroke();
  tc.setLineDash([]);

  tc.lineWidth = 34;
  tc.strokeStyle = colors.road;
  traceTrack();
  tc.stroke();

  tc.lineWidth = 2;
  tc.setLineDash([6, 10]);
  tc.strokeStyle = colors.line;
  traceTrack();
  tc.stroke();
  tc.setLineDash([]);

  const sf = lut[0];
  tc.save();
  tc.translate(sf.x, sf.y);
  tc.rotate(sf.ang + Math.PI / 2);
  for (let ci = -16; ci <= 16; ci += 4) {
    tc.fillStyle = (Math.floor(ci / 4) % 2 === 0) ? '#ffffff' : '#000000';
    tc.fillRect(ci, -3, 4, 3);
    tc.fillStyle = (Math.floor(ci / 4) % 2 !== 0) ? '#ffffff' : '#000000';
    tc.fillRect(ci, 0, 4, 3);
  }
  tc.restore();

  const img = tc.getImageData(0, 0, 512, 512);
  room.state.tex32 = new Uint32Array(img.data.buffer);
}

room.state.playerDist ??= 0;
const baseSpeed = 0.05 * speedMult * (1 + audio.level * 0.4);
room.state.playerDist = (room.state.playerDist + (frame.dt || 0.016) * baseSpeed) % 1.0;

const lut = room.state.trackLUT;
const lutLen = lut.length;
const curIdx = Math.floor(room.state.playerDist * lutLen) % lutLen;
const playerPos = lut[curIdx];

const camLagDist = (room.state.playerDist - 0.03 + 1.0) % 1.0;
const camIdx = Math.floor(camLagDist * lutLen) % lutLen;
const camTrackPos = lut[camIdx];

let targetAng = Math.atan2(playerPos.y - camTrackPos.y, playerPos.x - camTrackPos.x);
room.state.camAng ??= targetAng;

let angDiff = targetAng - room.state.camAng;
while (angDiff > Math.PI) angDiff -= Math.PI * 2;
while (angDiff < -Math.PI) angDiff += Math.PI * 2;

const turnTightness = steerMode === 'aggressive_drift' ? 0.22 : (steerMode === 'arcade_snap' ? 0.35 : 0.12);
room.state.camAng += angDiff * turnTightness;
room.state.turnRate = angDiff;

const camX = camTrackPos.x;
const camY = camTrackPos.y;
const camAng = room.state.camAng;
const cosA = Math.cos(camAng);
const sinA = Math.sin(camAng);

const horizonRow = Math.floor(S_H * horizonFrac);
const camAlt = camAltBase + Math.sin(frame.t * 8) * (audio.bass * 6);
const fov = 160 * (1 + (audio.beat ? 0.05 : 0));

const buf32 = room.state.buf32;
const tex32 = room.state.tex32;

buf32.fill(0, 0, horizonRow * S_W);

const halfW = S_W * 0.5;
for (let sy = horizonRow; sy < S_H; sy++) {
  const dy = sy - horizonRow + 0.1;
  const rowDist = (camAlt * fov) / dy;
  const stepX = -sinA * (camAlt / dy);
  const stepY =  cosA * (camAlt / dy);
  const midX = camX + cosA * rowDist;
  const midY = camY + sinA * rowDist;

  let curX = midX - halfW * stepX;
  let curY = midY - halfW * stepY;
  const rowOff = sy * S_W;

  for (let sx = 0; sx < S_W; sx++) {
    const u = ((curX | 0) & 511);
    const v = ((curY | 0) & 511);
    buf32[rowOff + sx] = tex32[(v << 9) | u];
    curX += stepX;
    curY += stepY;
  }
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.save();

const skyH = H * horizonFrac;
const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH);
if (timeOfDay === 'twilight_neon') {
  skyGrad.addColorStop(0, '#040114');
  skyGrad.addColorStop(0.6, '#260938');
  skyGrad.addColorStop(1, '#68144b');
} else if (timeOfDay === 'high_noon') {
  skyGrad.addColorStop(0, '#0b326e');
  skyGrad.addColorStop(0.7, '#246eb9');
  skyGrad.addColorStop(1, '#8cd3ff');
} else {
  skyGrad.addColorStop(0, '#02060b');
  skyGrad.addColorStop(0.7, '#072428');
  skyGrad.addColorStop(1, '#0c4f42');
}
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, skyH + 4);

ctx.save();
const sunX = ((W * 0.5 - camAng * (W / (Math.PI * 2)) * 1.5) % W + W) % W;
const sunY = skyH * 0.65;
const sunR = Math.min(W, H) * (0.09 + audio.bass * 0.02);
const sunGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR);
if (timeOfDay === 'twilight_neon') {
  sunGrad.addColorStop(0, '#fff4a3');
  sunGrad.addColorStop(0.5, '#ff2a6d');
  sunGrad.addColorStop(1, 'rgba(255,42,109,0)');
} else if (timeOfDay === 'high_noon') {
  sunGrad.addColorStop(0, '#ffffff');
  sunGrad.addColorStop(0.4, '#fff5b0');
  sunGrad.addColorStop(1, 'rgba(255,245,176,0)');
} else {
  sunGrad.addColorStop(0, '#d0fffa');
  sunGrad.addColorStop(0.5, '#00ffaa');
  sunGrad.addColorStop(1, 'rgba(0,255,170,0)');
}
ctx.fillStyle = sunGrad;
ctx.beginPath();
ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

ctx.save();
ctx.fillStyle = timeOfDay === 'high_noon' ? '#16385a' : '#05030f';
const mountCount = 14;
const mStep = W / (mountCount * 0.5);
const mOffset = -((camAng * 180) % mStep);
ctx.beginPath();
ctx.moveTo(-mStep, skyH + 2);
for (let i = -1; i <= mountCount + 2; i++) {
  const mx = i * mStep + mOffset;
  const peakY = skyH - 35 - Math.sin(i * 1.8) * 25 - (i % 2 === 0 ? 20 : 0);
  ctx.lineTo(mx - mStep * 0.5, skyH);
  ctx.lineTo(mx, peakY);
}
ctx.lineTo(W + mStep, skyH + 2);
ctx.closePath();
ctx.fill();
ctx.restore();

ctx.imageSmoothingEnabled = false;
ctx.drawImage(room.state.offscreen, 0, 0, S_W, S_H, 0, 0, W, H);

const fogGrad = ctx.createLinearGradient(0, skyH - 2, 0, skyH + H * 0.25);
fogGrad.addColorStop(0, timeOfDay === 'twilight_neon' ? 'rgba(104,20,75,0.95)' : (timeOfDay === 'high_noon' ? 'rgba(140,211,255,0.9)' : 'rgba(12,79,66,0.95)'));
fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = fogGrad;
ctx.fillRect(0, skyH - 2, W, H * 0.25);

const peopleList = (room.people && room.people.length > 0) ? room.people : [
  { id: 'rival1', hue: 180 },
  { id: 'rival2', hue: 45 },
  { id: 'rival3', hue: 310 }
];

const scaleX = W / S_W;
const scaleY = H / S_H;

for (let i = 0; i < peopleList.length; i++) {
  const p = peopleList[i];
  const pDist = (room.state.playerDist + 0.04 + i * 0.06) % 1.0;
  const rIdx = Math.floor(pDist * lutLen) % lutLen;
  const rWorld = lut[rIdx];

  const rdx = rWorld.x - camX;
  const rdy = rWorld.y - camY;
  const forwardD = rdx * cosA + rdy * sinA;
  const lateralD = -rdx * sinA + rdy * cosA;

  if (forwardD > 6 && forwardD < 280) {
    const screenSY = horizonRow + (camAlt * fov) / forwardD;
    const screenSX = halfW + (lateralD * fov) / forwardD;

    if (screenSX > -40 && screenSX < S_W + 40 && screenSY > horizonRow && screenSY < S_H) {
      const scrX = screenSX * scaleX;
      const scrY = screenSY * scaleY;
      const craftSize = Math.max(8, (fov / forwardD) * 14 * (scaleX / 5));
      const pHue = p.hue ?? ((i * 95) % 360);

      ctx.save();
      ctx.translate(scrX, scrY);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, craftSize * 0.45, craftSize * 0.8, craftSize * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsl(${pHue}, 90%, 55%)`;
      ctx.beginPath();
      ctx.moveTo(0, -craftSize * 0.5);
      ctx.lineTo(craftSize * 0.6, craftSize * 0.35);
      ctx.lineTo(0, craftSize * 0.15);
      ctx.lineTo(-craftSize * 0.6, craftSize * 0.35);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, -craftSize * 0.1, craftSize * 0.2, craftSize * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

const playerScreenX = W * 0.5;
const playerScreenY = H * 0.86;
const pScale = Math.min(W, H) * 0.08;
const bankAngle = Math.max(-0.4, Math.min(0.4, room.state.turnRate * 4));

ctx.save();
ctx.translate(playerScreenX, playerScreenY);
ctx.rotate(bankAngle);

ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
ctx.beginPath();
ctx.ellipse(0, pScale * 0.4, pScale * 0.9, pScale * 0.2, 0, 0, Math.PI * 2);
ctx.fill();

const flameLen = pScale * (0.5 + audio.bass * 0.9 + Math.random() * 0.2);
const jetGrad = ctx.createLinearGradient(0, pScale * 0.3, 0, pScale * 0.3 + flameLen);
jetGrad.addColorStop(0, '#ffffff');
jetGrad.addColorStop(0.3, '#00f0ff');
jetGrad.addColorStop(1, 'rgba(0,100,255,0)');
ctx.fillStyle = jetGrad;
ctx.beginPath();
ctx.moveTo(-pScale * 0.28, pScale * 0.25);
ctx.lineTo(-pScale * 0.18, pScale * 0.25 + flameLen);
ctx.lineTo(-pScale * 0.08, pScale * 0.25);
ctx.fill();
ctx.beginPath();
ctx.moveTo(pScale * 0.08, pScale * 0.25);
ctx.lineTo(pScale * 0.18, pScale * 0.25 + flameLen);
ctx.lineTo(pScale * 0.28, pScale * 0.25);
ctx.fill();

ctx.fillStyle = '#ff1155';
ctx.beginPath();
ctx.moveTo(0, -pScale * 0.65);
ctx.lineTo(pScale * 0.65, pScale * 0.28);
ctx.lineTo(pScale * 0.35, pScale * 0.35);
ctx.lineTo(0, pScale * 0.18);
ctx.lineTo(-pScale * 0.35, pScale * 0.35);
ctx.lineTo(-pScale * 0.65, pScale * 0.28);
ctx.closePath();
ctx.fill();

ctx.fillStyle = '#ffd500';
ctx.beginPath();
ctx.moveTo(0, -pScale * 0.5);
ctx.lineTo(pScale * 0.12, pScale * 0.12);
ctx.lineTo(0, pScale * 0.05);
ctx.lineTo(-pScale * 0.12, pScale * 0.12);
ctx.closePath();
ctx.fill();

ctx.fillStyle = '#e8faff';
ctx.beginPath();
ctx.ellipse(0, -pScale * 0.12, pScale * 0.16, pScale * 0.24, 0, 0, Math.PI * 2);
ctx.fill();

ctx.restore();

if (audio.treble > 0.35) {
  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${audio.treble * 0.3})`;
  ctx.lineWidth = 1.5;
  for (let s = 0; s < 12; s++) {
    const lineX = (Math.sin(s * 93 + frame.t * 20) * 0.5 + 0.5) * W;
    const lineY = skyH + Math.random() * (H - skyH);
    const len = 30 + audio.treble * 50;
    ctx.beginPath();
    ctx.moveTo(lineX, lineY);
    ctx.lineTo(lineX + (lineX - W * 0.5) * 0.1, lineY + len);
    ctx.stroke();
  }
  ctx.restore();
}

ctx.restore();