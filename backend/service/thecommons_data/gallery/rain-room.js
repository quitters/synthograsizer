const W = frame.width, H = frame.height;
ctx.save();

// Palettes
const palettes = {
  'Amber Noir': { bg: '#050403', light: [255, 185, 100], ambient: [40, 50, 65], mist: 'rgba(255,160,70,' },
  'Electric Cyan': { bg: '#02060b', light: [110, 220, 255], ambient: [35, 60, 90], mist: 'rgba(90,210,255,' },
  'Silver Mono': { bg: '#040405', light: [230, 240, 255], ambient: [50, 55, 65], mist: 'rgba(200,220,255,' },
  'Crimson Flare': { bg: '#080204', light: [255, 80, 60], ambient: [70, 30, 45], mist: 'rgba(255,70,50,' }
};
const pal = palettes[getVar('palette')] ?? palettes['Amber Noir'];

// Angle configs
const spotStyles = {
  'Dramatic Rake': { ox: -0.05 * W, oy: 0.15 * H, angle: 0.52, spread: 0.38 },
  'Steep Beam': { ox: 0.15 * W, oy: -0.05 * H, angle: 0.85, spread: 0.42 },
  'Low Horizon': { ox: -0.08 * W, oy: 0.40 * H, angle: 0.28, spread: 0.32 }
};
const spot = spotStyles[getVar('spot_style')] ?? spotStyles['Dramatic Rake'];

const pocketScale = getVar('pocket_scale') ?? 110;
const fury = getVar('weather_fury') ?? 1.0;
const mistOn = getVar('mist_density') ?? true;

// Initialize persistent buffers
const MAX_RAIN = 1200;
const MAX_SPLASH = 240;
if (!room.state.rain) {
  room.state.rain = new Float32Array(MAX_RAIN * 4); // x, y, speed, len
  for (let i = 0; i < MAX_RAIN; i++) {
    const idx = i * 4;
    room.state.rain[idx] = Math.random() * W;
    room.state.rain[idx + 1] = Math.random() * H;
    room.state.rain[idx + 2] = 700 + Math.random() * 900;
    room.state.rain[idx + 3] = 20 + Math.random() * 35;
  }
  room.state.splashes = new Float32Array(MAX_SPLASH * 5); // x, y, vx, vy, life
  room.state.sIdx = 0;
  room.state.pockets = [];
}

const dt = Math.min(frame.dt || 0.016, 0.05);
const floorY = H * 0.88;

// Resolve dry pocket entities from people
const peopleList = (room.people && room.people.length > 0) ? room.people : [
  { id: 'drift-1', hue: 45 },
  { id: 'drift-2', hue: 195 },
  { id: 'drift-3', hue: 310 }
];
const count = Math.min(peopleList.length, 6);

// Smooth / update pocket centers
while (room.state.pockets.length < count) {
  room.state.pockets.push({ x: W * 0.5, y: floorY - 90, hue: 0 });
}
if (room.state.pockets.length > count) {
  room.state.pockets.length = count;
}

for (let i = 0; i < count; i++) {
  const p = peopleList[i];
  const targetX = (W / (count + 1)) * (i + 1) + Math.sin(frame.t * 0.4 + i * 1.7) * 45;
  const targetY = floorY - 70 - Math.cos(frame.t * 0.5 + i * 2.1) * 20;
  const cur = room.state.pockets[i];
  cur.x += (targetX - cur.x) * 4.0 * dt;
  cur.y += (targetY - cur.y) * 4.0 * dt;
  cur.hue = p.hue ?? (i * 70);
}

// Background fill
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Spotlight volumetric cone
const beamLen = Math.hypot(W, H) * 1.3;
const cosA = Math.cos(spot.angle), sinA = Math.sin(spot.angle);
const cosL = Math.cos(spot.angle - spot.spread * 0.5), sinL = Math.sin(spot.angle - spot.spread * 0.5);
const cosR = Math.cos(spot.angle + spot.spread * 0.5), sinR = Math.sin(spot.angle + spot.spread * 0.5);

ctx.save();
ctx.globalCompositeOperation = 'lighter';
const coneGrad = ctx.createRadialGradient(spot.ox, spot.oy, 20, spot.ox + cosA * beamLen * 0.6, spot.oy + sinA * beamLen * 0.6, beamLen);
const bBoost = 0.25 + audio.bass * 0.35 + (audio.beat ? 0.2 : 0.0);
coneGrad.addColorStop(0.0, `rgba(${pal.light[0]},${pal.light[1]},${pal.light[2]},${0.45 * bBoost})`);
coneGrad.addColorStop(0.4, `rgba(${pal.light[0]},${pal.light[1]},${pal.light[2]},${0.18 * bBoost})`);
coneGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
ctx.fillStyle = coneGrad;
ctx.beginPath();
ctx.moveTo(spot.ox, spot.oy);
ctx.lineTo(spot.ox + cosL * beamLen, spot.oy + sinL * beamLen);
ctx.lineTo(spot.ox + cosR * beamLen, spot.oy + sinR * beamLen);
ctx.closePath();
ctx.fill();
ctx.restore();

// Rain angle & wind
const windX = (cosA * 0.35 + 0.15) * 120;
const rData = room.state.rain;
const sData = room.state.splashes;
let sHead = room.state.sIdx;

// Pointers for drawing batches
const ambPath = new Path2D();
const litPath = new Path2D();

const baseR = pocketScale * (1.0 + audio.bass * 0.2);
const r2Base = baseR * baseR;

for (let i = 0; i < MAX_RAIN; i++) {
  const idx = i * 4;
  let rx = rData[idx];
  let ry = rData[idx + 1];
  const spd = rData[idx + 2] * fury;
  const len = rData[idx + 3];

  // Advance rain
  rx += windX * dt;
  ry += spd * dt;

  // Check pocket collision (dome repulsion)
  let absorbed = false;
  for (let p = 0; p < count; p++) {
    const poc = room.state.pockets[p];
    const dx = rx - poc.x;
    const dy = ry - (poc.y + 20);
    if (dy < 20 && dy > -baseR * 1.1) {
      const d2 = dx * dx + dy * dy * 1.3;
      if (d2 < r2Base) {
        // Deflected off top rim
        absorbed = true;
        if (Math.random() < 0.25) {
          const sOff = (sHead % MAX_SPLASH) * 5;
          sData[sOff] = rx;
          sData[sOff + 1] = ry;
          sData[sOff + 2] = (dx > 0 ? 1 : -1) * (40 + Math.random() * 80);
          sData[sOff + 3] = -20 - Math.random() * 50;
          sData[sOff + 4] = 0.3;
          sHead++;
        }
        break;
      }
    }
  }

  // Floor collision
  if (!absorbed && ry >= floorY) {
    if (Math.random() < 0.4) {
      const sOff = (sHead % MAX_SPLASH) * 5;
      sData[sOff] = rx;
      sData[sOff + 1] = floorY;
      sData[sOff + 2] = (Math.random() - 0.4) * 110 + windX * 0.2;
      sData[sOff + 3] = -60 - Math.random() * 120 * (1 + audio.mid);
      sData[sOff + 4] = 0.4;
      sHead++;
    }
    rx = Math.random() * W;
    ry = -len - Math.random() * 40;
  } else if (absorbed || rx > W + 60 || rx < -60) {
    rx = Math.random() * W;
    ry = -len - Math.random() * 40;
  }

  rData[idx] = rx;
  rData[idx + 1] = ry;

  // Test if drop is in spotlight cone
  const toX = rx - spot.ox, toY = ry - spot.oy;
  const pAng = Math.atan2(toY, toX);
  let angDiff = pAng - spot.angle;
  while (angDiff > Math.PI) angDiff -= Math.PI * 2;
  while (angDiff < -Math.PI) angDiff += Math.PI * 2;

  const inLight = Math.abs(angDiff) < (spot.spread * 0.52);
  const tailX = rx - (windX / spd) * len;
  const tailY = ry - len;

  if (inLight) {
    litPath.moveTo(rx, ry);
    litPath.lineTo(tailX, tailY);
  } else {
    ambPath.moveTo(rx, ry);
    ambPath.lineTo(tailX, tailY);
  }
}
room.state.sIdx = sHead;

// Render ambient streaks
ctx.strokeStyle = `rgba(${pal.ambient[0]},${pal.ambient[1]},${pal.ambient[2]},0.35)`;
ctx.lineWidth = 1.0;
ctx.stroke(ambPath);

// Render lit glinting streaks
ctx.save();
ctx.globalCompositeOperation = 'lighter';
ctx.strokeStyle = `rgba(${pal.light[0]},${pal.light[1]},${pal.light[2]},${0.85 + audio.treble * 0.15})`;
ctx.lineWidth = 1.8;
ctx.stroke(litPath);

// Floor specular wet reflection
const floorGrad = ctx.createLinearGradient(0, floorY, 0, H);
floorGrad.addColorStop(0, `rgba(${pal.light[0]},${pal.light[1]},${pal.light[2]},0.28)`);
floorGrad.addColorStop(0.2, `rgba(${pal.ambient[0]},${pal.ambient[1]},${pal.ambient[2]},0.12)`);
floorGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
ctx.fillStyle = floorGrad;
ctx.fillRect(0, floorY, W, H - floorY);

// Splashes
ctx.fillStyle = `rgba(${pal.light[0]},${pal.light[1]},${pal.light[2]},0.9)`;
for (let i = 0; i < MAX_SPLASH; i++) {
  const sOff = i * 5;
  let life = sData[sOff + 4];
  if (life > 0) {
    sData[sOff] += sData[sOff + 2] * dt;
    sData[sOff + 1] += sData[sOff + 3] * dt;
    sData[sOff + 3] += 550 * dt; // gravity
    life -= dt * 1.8;
    sData[sOff + 4] = life;

    const size = Math.max(1, life * 3.5);
    ctx.fillRect(sData[sOff], sData[sOff + 1], size, size);
  }
}
ctx.restore();

// Draw dry sanctuary domes
for (let p = 0; p < count; p++) {
  const poc = room.state.pockets[p];
  ctx.save();

  // Subtle floor shadow inside the dry sanctuary
  ctx.beginPath();
  ctx.ellipse(poc.x, floorY, baseR * 0.75, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fill();

  // Aura dome edge
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(poc.x, poc.y + 20, baseR, Math.PI * 0.95, Math.PI * 2.05);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = `hsla(${poc.hue}, 85%, 68%, ${0.35 + audio.bass * 0.35})`;
  ctx.stroke();

  // Outer faint shimmer
  ctx.beginPath();
  ctx.arc(poc.x, poc.y + 20, baseR + 4, Math.PI, Math.PI * 2);
  ctx.lineWidth = 1.0;
  ctx.strokeStyle = `hsla(${poc.hue}, 90%, 80%, ${0.2 + audio.treble * 0.25})`;
  ctx.stroke();

  // Silhouette of human posture inside
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#010203';
  ctx.beginPath();
  // Head
  ctx.arc(poc.x, poc.y + 12, 10, 0, Math.PI * 2);
  // Torso / cloak
  ctx.moveTo(poc.x - 16, floorY);
  ctx.lineTo(poc.x - 9, poc.y + 24);
  ctx.lineTo(poc.x + 9, poc.y + 24);
  ctx.lineTo(poc.x + 16, floorY);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// Ground mist & turbulence
if (mistOn) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const mistAlpha = 0.08 + audio.mid * 0.07 + audio.level * 0.05;
  for (let layer = 0; layer < 2; layer++) {
    const yBase = floorY - 35 + layer * 25;
    const waveFreq = 0.005 + layer * 0.003;
    const waveSpeed = frame.t * (0.8 + layer * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 32) {
      const my = yBase + Math.sin(x * waveFreq + waveSpeed) * 16 + Math.cos(x * 0.012 - waveSpeed * 0.7) * 8;
      ctx.lineTo(x, my);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = `${pal.mist}${mistAlpha * (1.2 - layer * 0.4)})`;
    ctx.fill();
  }
  ctx.restore();
}

// High contrast spotlight glare source
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const bulbGrad = ctx.createRadialGradient(spot.ox, spot.oy, 0, spot.ox, spot.oy, 90 + audio.bass * 40);
bulbGrad.addColorStop(0, '#ffffff');
bulbGrad.addColorStop(0.3, `rgba(${pal.light[0]},${pal.light[1]},${pal.light[2]},0.7)`);
bulbGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = bulbGrad;
ctx.beginPath();
ctx.arc(spot.ox, spot.oy, 100 + audio.bass * 40, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

ctx.restore();