ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.1);

// Lookups and knobs
const paletteChoice = getVar('palette') || 'outrun_sunset';
const speedBase = Number(getVar('speed_base') ?? 140);
const hillProfile = getVar('hill_profile') || 'rolling';
const curveAmount = Number(getVar('curve_amount') ?? 1.2);
const sceneryStyle = getVar('scenery_style') || 'palms';

const PALETTES = {
  outrun_sunset: {
    skyTop: '#12042b', skyBot: '#fd3a69',
    sunTop: '#ffe156', sunBot: '#ff1493',
    grassLight: '#144c38', grassDark: '#0d3224',
    roadLight: '#444654', roadDark: '#393a46',
    rumbleLight: '#ffffff', rumbleDark: '#e62436',
    lane: '#ffffff',
    mountain: '#360940'
  },
  neon_cyber: {
    skyTop: '#05021a', skyBot: '#00e5ff',
    sunTop: '#00ffff', sunBot: '#bd00ff',
    grassLight: '#0b132b', grassDark: '#050a17',
    roadLight: '#1c2541', roadDark: '#12182a',
    rumbleLight: '#00f0ff', rumbleDark: '#ff0055',
    lane: '#00f0ff',
    mountain: '#110726'
  },
  desert_dusk: {
    skyTop: '#2b1055', skyBot: '#e97036',
    sunTop: '#fff275', sunBot: '#d83a56',
    grassLight: '#9e5a22', grassDark: '#783e10',
    roadLight: '#4a4039', roadDark: '#3b332d',
    rumbleLight: '#f6d55c', rumbleDark: '#a33327',
    lane: '#f6d55c',
    mountain: '#401830'
  }
};
const pal = PALETTES[paletteChoice] || PALETTES.outrun_sunset;

// Init persistent state buffers
if (!room.state.init) {
  const SEGMENTS_COUNT = 320;
  const segs = [];
  for (let i = 0; i < SEGMENTS_COUNT; i++) {
    segs.push({
      index: i,
      worldZ: (i + 1) * 200,
      x: 0,
      y: 0,
      z: (i + 1) * 200,
      screenX: 0,
      screenY: 0,
      screenW: 0,
      scale: 0,
      curve: 0,
      sprite: 0,
      spriteSide: 1,
      spriteHue: 0
    });
  }
  room.state.segs = segs;
  room.state.totalSegments = SEGMENTS_COUNT;
  room.state.segLength = 200;
  room.state.trackLength = SEGMENTS_COUNT * 200;
  room.state.pos = 0;
  room.state.playerX = 0;
  room.state.speed = 0;
  room.state.sunPulse = 1;
  room.state.init = true;
}

const S = room.state;
const segs = S.segs;
const totalSegs = S.totalSegments;
const segLen = S.segLength;
const trackLen = S.trackLength;

// Audio driven speed and camera bounce
const bass = audio.bass || 0;
const mid = audio.mid || 0;
const beat = audio.beat ? 1 : 0;
const targetSpeed = speedBase * (1.0 + bass * 1.8 + beat * 0.4);
S.speed += (targetSpeed - S.speed) * Math.min(1, dt * 6);
S.pos = (S.pos + S.speed * dt * 45) % trackLen;
S.sunPulse += ((1 + bass * 0.25) - S.sunPulse) * 0.15;

// Recompute segment track geometry procedurally
const hillMult = hillProfile === 'steep' ? 1400 : (hillProfile === 'flat' ? 180 : 750);
for (let i = 0; i < totalSegs; i++) {
  const s = segs[i];
  const p = i / totalSegs;
  // Curves
  s.curve = Math.sin(p * Math.PI * 4) * Math.cos(p * Math.PI * 2) * curveAmount * 2.8;
  // Elevation
  s.y = Math.sin(p * Math.PI * 6) * hillMult + Math.cos(p * Math.PI * 2) * (hillMult * 0.5);
  // Sprites: place sparse roadside objects
  s.sprite = (i % 7 === 0) ? (sceneryStyle === 'palms' ? 1 : (sceneryStyle === 'city' ? 2 : 3)) : 0;
  s.spriteSide = (i % 14 === 0) ? -1 : 1;
  // Link sprite color/identity to room people
  if (room.people && room.people.length > 0) {
    const person = room.people[(i >> 3) % room.people.length];
    s.spriteHue = person ? person.hue : (i * 37) % 360;
  } else {
    s.spriteHue = (i * 29) % 360;
  }
}

// Horizon and camera properties
const cameraHeight = 1100 + Math.sin(t * 12) * (S.speed * 0.02 + bass * 12);
const cameraDepth = 0.84;
const horizonY = H * 0.48;

// --- DRAW SKY & BACKGROUND ---
const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
skyGrad.addColorStop(0, pal.skyTop);
skyGrad.addColorStop(1, pal.skyBot);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, horizonY + 2);

// Distant mountains shifted by cumulative curve
const baseSegIdx = Math.floor(S.pos / segLen) % totalSegs;
const currentCurve = segs[baseSegIdx].curve;
S.playerX += (currentCurve * 0.02 - S.playerX * 0.01);
const mtnOffset = (S.pos * 0.02) % W;

ctx.save();
ctx.fillStyle = pal.mountain;
ctx.beginPath();
ctx.moveTo(0, horizonY);
for (let mx = 0; mx <= W; mx += 40) {
  const my = horizonY - 40 - Math.sin((mx + mtnOffset) * 0.008) * 35 - Math.cos((mx + mtnOffset) * 0.022) * 20;
  ctx.lineTo(mx, my);
}
ctx.lineTo(W, horizonY);
ctx.closePath();
ctx.fill();
ctx.restore();

// Synthwave Sun
const sunX = W * 0.5 - S.playerX * 40;
const sunR = Math.min(W, H) * 0.16 * S.sunPulse;
const sunY = horizonY - sunR * 0.65;

ctx.save();
ctx.beginPath();
ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
ctx.clip();
const sunGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
sunGrad.addColorStop(0, pal.sunTop);
sunGrad.addColorStop(1, pal.sunBot);
ctx.fillStyle = sunGrad;
ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

// Horizontal scanline cuts in the sun
ctx.fillStyle = pal.skyBot;
const bandCount = 10;
for (let b = 0; b < bandCount; b++) {
  const by = sunY - sunR * 0.2 + (b / bandCount) * (sunR * 1.2);
  const bh = (b / bandCount) * 6 + 1.5;
  ctx.fillRect(sunX - sunR, by, sunR * 2, bh);
}
ctx.restore();

// --- ROAD PROJECTION ---
const drawDistance = 140;
let maxClipY = H;
let camX = S.playerX * 2400;
let camY = cameraHeight;

// Find start segment based on player position
const startIdx = Math.floor(S.pos / segLen);
let dx = 0;
let ddx = 0;

// Project segments into screen coordinates
for (let n = 0; n < drawDistance; n++) {
  const seg = segs[(startIdx + n) % totalSegs];
  const looped = (startIdx + n) >= totalSegs;
  const worldZ = seg.worldZ + (looped ? trackLen : 0) - S.pos;

  if (worldZ <= 10) continue;

  seg.scale = cameraDepth / worldZ;
  seg.screenX = Math.round(W * 0.5 + (seg.x - camX + dx) * seg.scale * W * 0.5);
  seg.screenY = Math.round(horizonY + (camY - seg.y) * seg.scale * H * 0.5);
  seg.screenW = Math.round(1900 * seg.scale * W * 0.5);

  dx += ddx;
  ddx += seg.curve;
}

// Render segments back-to-front or front-to-back with clipping
for (let n = drawDistance - 1; n > 0; n--) {
  const p1 = segs[(startIdx + n - 1) % totalSegs];
  const p2 = segs[(startIdx + n) % totalSegs];

  if (p2.screenY <= p1.screenY || p2.screenY >= maxClipY) continue;

  const isAlt = ((startIdx + n) % 6) < 3;
  const grassCol = isAlt ? pal.grassDark : pal.grassLight;
  const rumbleCol = isAlt ? pal.rumbleDark : pal.rumbleLight;
  const roadCol = isAlt ? pal.roadDark : pal.roadLight;

  // Grass
  ctx.fillStyle = grassCol;
  ctx.fillRect(0, p2.screenY, W, p1.screenY - p2.screenY);

  // Rumble strip 1
  const r1W = p1.screenW * 1.22;
  const r2W = p2.screenW * 1.22;
  ctx.fillStyle = rumbleCol;
  ctx.beginPath();
  ctx.moveTo(p1.screenX - r1W, p1.screenY);
  ctx.lineTo(p1.screenX + r1W, p1.screenY);
  ctx.lineTo(p2.screenX + r2W, p2.screenY);
  ctx.lineTo(p2.screenX - r2W, p2.screenY);
  ctx.fill();

  // Main Tarmac
  ctx.fillStyle = roadCol;
  ctx.beginPath();
  ctx.moveTo(p1.screenX - p1.screenW, p1.screenY);
  ctx.lineTo(p1.screenX + p1.screenW, p1.screenY);
  ctx.lineTo(p2.screenX + p2.screenW, p2.screenY);
  ctx.lineTo(p2.screenX - p2.screenW, p2.screenY);
  ctx.fill();

  // Center dashed lane lines
  if (isAlt) {
    const lane1W = p1.screenW * 0.04;
    const lane2W = p2.screenW * 0.04;
    ctx.fillStyle = pal.lane;
    ctx.beginPath();
    ctx.moveTo(p1.screenX - lane1W, p1.screenY);
    ctx.lineTo(p1.screenX + lane1W, p1.screenY);
    ctx.lineTo(p2.screenX + lane2W, p2.screenY);
    ctx.lineTo(p2.screenX - lane2W, p2.screenY);
    ctx.fill();
  }

  // Roadside Sprite drawing
  if (p2.sprite > 0 && p2.screenW > 6) {
    const spriteX = p2.screenX + p2.spriteSide * (p2.screenW * 1.65);
    const spriteY = p2.screenY;
    const spriteH = p2.screenW * 1.6;
    const spriteW = spriteH * 0.75;

    ctx.save();
    if (p2.sprite === 1) {
      // Retro Palm Tree
      ctx.strokeStyle = '#2b1020';
      ctx.lineWidth = Math.max(2, p2.screenW * 0.06);
      ctx.beginPath();
      const trunkCurve = p2.spriteSide * spriteW * 0.3;
      ctx.moveTo(spriteX, spriteY);
      ctx.quadraticCurveTo(spriteX + trunkCurve, spriteY - spriteH * 0.5, spriteX + trunkCurve * 0.7, spriteY - spriteH);
      ctx.stroke();

      // Palm fronds
      const topX = spriteX + trunkCurve * 0.7;
      const topY = spriteY - spriteH;
      ctx.fillStyle = `hsl(${p2.spriteHue}, 80%, 45%)`;
      ctx.beginPath();
      for (let f = 0; f < 6; f++) {
        const ang = (f / 6) * Math.PI * 2;
        const fx = topX + Math.cos(ang) * spriteW * 0.6;
        const fy = topY + Math.sin(ang) * spriteH * 0.25;
        ctx.lineTo(fx, fy);
        ctx.lineTo(topX, topY);
      }
      ctx.fill();
    } else if (p2.sprite === 2) {
      // Cyber billboard with sound meter
      const bw = spriteW * 1.1;
      const bh = spriteH * 0.7;
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(spriteX - bw * 0.5, spriteY - bh, bw, bh);
      ctx.strokeStyle = `hsl(${p2.spriteHue}, 100%, 65%)`;
      ctx.lineWidth = Math.max(1, p2.screenW * 0.04);
      ctx.strokeRect(spriteX - bw * 0.5, spriteY - bh, bw, bh);
      // Inner glowing beat bar
      ctx.fillStyle = `hsl(${(p2.spriteHue + 60) % 360}, 100%, 55%)`;
      const barH = bh * (0.2 + bass * 0.7);
      ctx.fillRect(spriteX - bw * 0.35, spriteY - barH - bh * 0.1, bw * 0.7, barH);
    } else {
      // Neon chevron sign
      ctx.strokeStyle = `hsl(${p2.spriteHue}, 90%, 60%)`;
      ctx.lineWidth = Math.max(2, p2.screenW * 0.08);
      ctx.beginPath();
      const sDir = p2.spriteSide > 0 ? 1 : -1;
      ctx.moveTo(spriteX - sDir * spriteW * 0.4, spriteY - spriteH);
      ctx.lineTo(spriteX + sDir * spriteW * 0.4, spriteY - spriteH * 0.6);
      ctx.lineTo(spriteX - sDir * spriteW * 0.4, spriteY - spriteH * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// --- PLAYER COCKPIT / HOOD VIEW ---
const hoodW = W * 0.36;
const hoodY = H;
const hoodTop = H - 65;
const hoodCenter = W * 0.5 + Math.sin(t * 30) * (bass * 3);

// Hood base reflection
const hoodGrad = ctx.createLinearGradient(hoodCenter, hoodTop, hoodCenter, hoodY);
hoodGrad.addColorStop(0, '#101018');
hoodGrad.addColorStop(0.5, '#280c2e');
hoodGrad.addColorStop(1, '#05050a');

ctx.fillStyle = hoodGrad;
ctx.beginPath();
ctx.moveTo(hoodCenter - hoodW * 0.45, hoodY);
ctx.lineTo(hoodCenter - hoodW * 0.28, hoodTop);
ctx.lineTo(hoodCenter + hoodW * 0.28, hoodTop);
ctx.lineTo(hoodCenter + hoodW * 0.45, hoodY);
ctx.closePath();
ctx.fill();

// Hood neon accent strip reacting to treble
ctx.strokeStyle = `hsl(${(t * 80) % 360}, 100%, ${50 + (audio.treble || 0) * 40}%)`;
ctx.lineWidth = 3 + bass * 4;
ctx.beginPath();
ctx.moveTo(hoodCenter - hoodW * 0.26, hoodTop + 4);
ctx.lineTo(hoodCenter + hoodW * 0.26, hoodTop + 4);
ctx.stroke();

// Arcade HUD Speedometer / People counter
ctx.fillStyle = '#ffffff';
ctx.font = '900 18px monospace';
ctx.textAlign = 'left';
const kmh = Math.round(S.speed * 1.8);
ctx.fillText(`SPEED ${kmh} KM/H`, 30, H - 40);

if (room.people && room.people.length > 0) {
  ctx.textAlign = 'right';
  ctx.fillStyle = `hsl(${room.people[0].hue}, 90%, 65%)`;
  ctx.fillText(`RACERS: ${room.people.length}`, W - 30, H - 40);
}

ctx.restore();