ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// ---- CONTROLS & THEME ----
const themes = {
  neon_midnight: {
    bg: '#080512',
    road: '#120d22',
    vergeStart: '#1d1238',
    vergeFinish: '#ffd166',
    laneLine: 'rgba(0, 245, 212, 0.45)',
    curb: '#f72585',
    beamCol: 'rgba(255, 255, 220, 0.28)'
  },
  cyber_highway: {
    bg: '#050c14',
    road: '#091522',
    vergeStart: '#0d2238',
    vergeFinish: '#00f0ff',
    laneLine: 'rgba(58, 134, 255, 0.5)',
    curb: '#00f0ff',
    beamCol: 'rgba(0, 240, 255, 0.22)'
  },
  retro_arcade: {
    bg: '#030303',
    road: '#0a0a0a',
    vergeStart: '#006400',
    vergeFinish: '#ffbe0b',
    laneLine: 'rgba(255, 221, 0, 0.5)',
    curb: '#ff0055',
    beamCol: 'rgba(255, 255, 180, 0.25)'
  }
};
const themeKey = getVar('theme') ?? 'neon_midnight';
const theme = themes[themeKey] ?? themes.neon_midnight;
const numLanes = Math.round(getVar('lane_count') ?? 5);
const speedMult = (getVar('traffic_speed') ?? 1.2) * (1 + audio.level * 0.25);
const density = getVar('traffic_density') ?? 'rush_hour';
const showHeadlights = getVar('headlight_glow') ?? true;
const carsPerLaneMap = { breezy: 2, rush_hour: 3, gridlock: 4 };
const carsPerLane = carsPerLaneMap[density] ?? 3;

// ---- ROAD GEOMETRY ----
const topVergeH = H * 0.14;
const botVergeH = H * 0.16;
const roadTop = topVergeH;
const roadBottom = H - botVergeH;
const roadHeight = roadBottom - roadTop;
const laneHeight = roadHeight / numLanes;
const totalSteps = numLanes + 1;

// ---- INITIALIZE PERSISTENT STATE ----
room.state.init ??= true;
room.state.chickens ??= {};
room.state.lanes ??= [];
room.state.feathers ??= [];
room.state.dust ??= [];
room.state.lastActionT ??= frame.t;
room.state.roundState ??= 'playing';
room.state.winnerInfo ??= null;
room.state.bannerT ??= frame.t;
room.state.shake ??= 0;

// Rebuild cars if lane count changed
if (room.state.lanes.length !== numLanes) {
  room.state.lanes = [];
  for (let i = 0; i < numLanes; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const laneSpeed = (140 + (i * 47) % 110) * dir;
    const cars = [];
    for (let c = 0; c < 5; c++) {
      cars.push({
        x: (W / 5) * c + ((i * 83) % 120),
        len: 85 + ((i + c) * 31) % 65,
        hue: ((i * 65 + c * 80) % 360),
        type: (c + i) % 3
      });
    }
    room.state.lanes.push({ dir, speed: laneSpeed, cars });
  }
}

// ---- BUILD ROSTER ----
let roster = (room.people && room.people.length > 0) ? room.people : [
  { id: 'demo-1', hue: 45, table: 'Demo 1' },
  { id: 'demo-2', hue: 175, table: 'Demo 2' },
  { id: 'demo-3', hue: 285, table: 'Demo 3' },
  { id: 'demo-4', hue: 345, table: 'Demo 4' }
];

// Sync chickens to roster
const rosterIds = new Set(roster.map(p => p.id));
for (const id in room.state.chickens) {
  if (!rosterIds.has(id)) delete room.state.chickens[id];
}

const chickenR = Math.max(13, Math.min(24, (W / (roster.length + 1)) * 0.35));
roster.forEach((p, idx) => {
  const targetX = ((idx + 1) / (roster.length + 1)) * W;
  if (!room.state.chickens[p.id]) {
    room.state.chickens[p.id] = {
      id: p.id,
      x: targetX,
      targetX,
      lane: 0,
      targetLane: 0,
      hopT: 1,
      invuln: 0,
      wins: 0
    };
  } else {
    const ch = room.state.chickens[p.id];
    ch.targetX = targetX;
    ch.x += (targetX - ch.x) * 0.1;
  }
});

// ---- EVENTS & ATTRACT MODE ----
for (const e of (room.events || [])) {
  if (e.name === 'reset_race') {
    room.state.roundState = 'playing';
    room.state.winnerInfo = null;
    room.state.bannerT = frame.t;
    for (const id in room.state.chickens) {
      const c = room.state.chickens[id];
      c.lane = 0; c.targetLane = 0; c.hopT = 1;
    }
  }
  if (e.name === 'hop') {
    room.state.lastActionT = frame.t;
    const ch = room.state.chickens[e.participantId];
    if (ch && room.state.roundState === 'playing' && ch.targetLane < totalSteps) {
      ch.lane = ch.targetLane;
      ch.targetLane = Math.min(totalSteps, ch.lane + 1);
      ch.hopT = 0;
      for (let k = 0; k < 4; k++) {
        room.state.dust.push({
          x: ch.x + (Math.random() - 0.5) * 16,
          y: roadBottom - ch.lane * laneHeight + 6,
          vx: (Math.random() - 0.5) * 50,
          vy: Math.random() * 20 + 10,
          life: 0.35
        });
      }
    }
  }
}

// Attract mode auto-hops if no clicks for 3 seconds
if (frame.t - room.state.lastActionT > 3.0 && room.state.roundState === 'playing') {
  if (Math.random() < 0.08) {
    const keys = Object.keys(room.state.chickens);
    const randomId = keys[Math.floor(Math.random() * keys.length)];
    const ch = room.state.chickens[randomId];
    if (ch && ch.targetLane < totalSteps && ch.hopT >= 1) {
      ch.lane = ch.targetLane;
      ch.targetLane = Math.min(totalSteps, ch.lane + 1);
      ch.hopT = 0;
    }
  }
}

// Round state transition
if (room.state.roundState === 'won') {
  if (frame.t - (room.state.winnerInfo?.t ?? frame.t) > 3.6) {
    room.state.roundState = 'playing';
    room.state.winnerInfo = null;
    room.state.bannerT = frame.t;
    for (const id in room.state.chickens) {
      const c = room.state.chickens[id];
      c.lane = 0; c.targetLane = 0; c.hopT = 1;
    }
  }
}

// ---- UPDATE TRAFFIC ----
for (let i = 0; i < numLanes; i++) {
  const lane = room.state.lanes[i];
  const v = lane.speed * speedMult;
  for (let c = 0; c < carsPerLane; c++) {
    const car = lane.cars[c];
    car.x += v * dt;
    if (lane.dir > 0 && car.x > W + car.len) car.x = -car.len - ((c * 40) % 80);
    if (lane.dir < 0 && car.x < -car.len) car.x = W + car.len + ((c * 40) % 80);
  }
}

// ---- UPDATE CHICKENS & COLLISIONS ----
for (const p of roster) {
  const ch = room.state.chickens[p.id];
  if (!ch) continue;
  ch.invuln = Math.max(0, ch.invuln - dt);
  if (ch.hopT < 1) {
    ch.hopT = Math.min(1, ch.hopT + dt * 4.2);
  }
  const curStep = ch.lane + (ch.targetLane - ch.lane) * Math.sin(ch.hopT * Math.PI * 0.5);
  const cy = roadBottom - curStep * laneHeight;
  ch.curY = cy;

  // Check winner
  if (ch.targetLane >= totalSteps && ch.hopT >= 0.85 && room.state.roundState === 'playing') {
    room.state.roundState = 'won';
    ch.wins++;
    room.state.winnerInfo = { id: p.id, hue: p.hue, table: p.table || 'Player', t: frame.t };
    room.state.shake = 0.3;
  }

  // Collision with traffic
  if (room.state.roundState === 'playing' && ch.invuln <= 0) {
    for (let i = 0; i < numLanes; i++) {
      const laneY = roadBottom - (i + 0.5) * laneHeight;
      if (Math.abs(cy - laneY) < laneHeight * 0.44) {
        const lane = room.state.lanes[i];
        for (let c = 0; c < carsPerLane; c++) {
          const car = lane.cars[c];
          const halfW = car.len * 0.48;
          if (ch.x > car.x - halfW - chickenR && ch.x < car.x + halfW + chickenR) {
            // SPLAT!
            ch.lane = 0;
            ch.targetLane = 0;
            ch.hopT = 1;
            ch.invuln = 0.8;
            room.state.shake = 0.15;
            // Spawn feathers
            for (let f = 0; f < 14; f++) {
              const ang = Math.random() * Math.PI * 2;
              const spd = Math.random() * 220 + 80;
              room.state.feathers.push({
                x: ch.x,
                y: cy,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 60,
                hue: p.hue,
                rot: Math.random() * 6,
                rotV: (Math.random() - 0.5) * 12,
                alpha: 1.0,
                size: chickenR * (0.35 + Math.random() * 0.3)
              });
            }
            break;
          }
        }
      }
    }
  }
}

// ---- UPDATE PARTICLES ----
for (let i = room.state.feathers.length - 1; i >= 0; i--) {
  const f = room.state.feathers[i];
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.vy += 380 * dt;
  f.vx *= 0.94;
  f.rot += f.rotV * dt;
  f.alpha -= dt * 0.85;
  if (f.alpha <= 0) room.state.feathers.splice(i, 1);
}
if (room.state.feathers.length > 120) {
  room.state.feathers.splice(0, room.state.feathers.length - 120);
}

for (let i = room.state.dust.length - 1; i >= 0; i--) {
  const d = room.state.dust[i];
  d.x += d.vx * dt;
  d.y += d.vy * dt;
  d.life -= dt * 2.2;
  if (d.life <= 0) room.state.dust.splice(i, 1);
}

// ---- SCREEN SHAKE ----
if (room.state.shake > 0) {
  const sx = (Math.random() - 0.5) * room.state.shake * 30;
  const sy = (Math.random() - 0.5) * room.state.shake * 30;
  ctx.translate(sx, sy);
  room.state.shake = Math.max(0, room.state.shake - dt * 1.5);
}

// ---- DRAW BACKGROUND & ROAD ----
ctx.fillStyle = theme.bg;
ctx.fillRect(0, 0, W, H);

// Road base
ctx.fillStyle = theme.road;
ctx.fillRect(0, roadTop, W, roadHeight);

// Starting Verge (Grass/Sidewalk)
const startGrad = ctx.createLinearGradient(0, roadBottom, 0, H);
startGrad.addColorStop(0, theme.vergeStart);
startGrad.addColorStop(1, '#020205');
ctx.fillStyle = startGrad;
ctx.fillRect(0, roadBottom, W, botVergeH);

// Curb line bottom
ctx.fillStyle = theme.curb;
ctx.fillRect(0, roadBottom - 3, W, 6);

// Finish Verge (Golden Corn / Neon goal)
const finGrad = ctx.createLinearGradient(0, 0, 0, roadTop);
finGrad.addColorStop(0, '#000000');
finGrad.addColorStop(1, theme.vergeFinish);
ctx.fillStyle = finGrad;
ctx.fillRect(0, 0, W, roadTop);

// Checkered finish border
const checkW = 28;
ctx.save();
for (let x = 0; x < W; x += checkW) {
  const odd = Math.floor(x / checkW) % 2 === 0;
  ctx.fillStyle = odd ? '#ffffff' : '#111111';
  ctx.fillRect(x, roadTop - 12, checkW, 12);
}
ctx.restore();

// Lane Dividers
ctx.strokeStyle = theme.laneLine;
ctx.lineWidth = 3;
ctx.setLineDash([24, 20]);
for (let i = 1; i < numLanes; i++) {
  const ly = roadBottom - i * laneHeight;
  ctx.beginPath();
  ctx.moveTo(0, ly);
  ctx.lineTo(W, ly);
  ctx.stroke();
}
ctx.setLineDash([]);

// ---- DRAW HEADLIGHT BEAMS (Screen Mode) ----
if (showHeadlights) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const beamLen = (180 + audio.bass * 90) * (speedMult * 0.8);
  for (let i = 0; i < numLanes; i++) {
    const lane = room.state.lanes[i];
    const cy = roadBottom - (i + 0.5) * laneHeight;
    for (let c = 0; c < carsPerLane; c++) {
      const car = lane.cars[c];
      const noseX = lane.dir > 0 ? car.x + car.len * 0.5 : car.x - car.len * 0.5;
      const tipX = noseX + lane.dir * beamLen;

      const beamGrad = ctx.createRadialGradient(noseX, cy, 5, noseX, cy, beamLen);
      beamGrad.addColorStop(0, 'rgba(255, 255, 220, 0.45)');
      beamGrad.addColorStop(0.3, theme.beamCol);
      beamGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(noseX, cy - 10);
      ctx.lineTo(tipX, cy - laneHeight * 0.48);
      ctx.lineTo(tipX, cy + laneHeight * 0.48);
      ctx.lineTo(noseX, cy + 10);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- DRAW CARS ----
for (let i = 0; i < numLanes; i++) {
  const lane = room.state.lanes[i];
  const cy = roadBottom - (i + 0.5) * laneHeight;
  const carH = Math.min(46, laneHeight * 0.65);

  for (let c = 0; c < carsPerLane; c++) {
    const car = lane.cars[c];
    ctx.save();
    ctx.translate(car.x, cy);

    // Car Body Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-car.len * 0.5 + 4, -carH * 0.5 + 6, car.len, carH);

    // Chassis
    ctx.fillStyle = `hsl(${car.hue}, 85%, 48%)`;
    ctx.beginPath();
    ctx.roundRect(-car.len * 0.5, -carH * 0.5, car.len, carH, 8);
    ctx.fill();

    // Cabin / Windshield
    ctx.fillStyle = '#080812';
    const cabW = car.len * 0.45;
    const cabH = carH * 0.72;
    const cabOff = lane.dir * (car.len * 0.05);
    ctx.beginPath();
    ctx.roundRect(-cabW * 0.5 + cabOff, -cabH * 0.5, cabW, cabH, 4);
    ctx.fill();

    // Headlights & Taillights
    const frontX = lane.dir > 0 ? car.len * 0.5 - 4 : -car.len * 0.5 + 4;
    const backX = lane.dir > 0 ? -car.len * 0.5 + 3 : car.len * 0.5 - 3;

    // Headlight bulbs
    ctx.fillStyle = '#fffce6';
    ctx.fillRect(frontX - 2, -carH * 0.4, 4, 7);
    ctx.fillRect(frontX - 2, carH * 0.4 - 7, 4, 7);

    // Taillight bulbs
    ctx.fillStyle = '#ff1122';
    ctx.fillRect(backX - 2, -carH * 0.38, 4, 6);
    ctx.fillRect(backX - 2, carH * 0.38 - 6, 4, 6);

    ctx.restore();
  }
}

// ---- DUST PARTICLES ----
ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
for (const d of room.state.dust) {
  ctx.beginPath();
  ctx.arc(d.x, d.y, 4 * d.life, 0, Math.PI * 2);
  ctx.fill();
}

// ---- DRAW CHICKENS ----
roster.forEach((p, idx) => {
  const ch = room.state.chickens[p.id];
  if (!ch) return;
  const cy = ch.curY;
  const jumpArc = Math.sin(ch.hopT * Math.PI) * (laneHeight * 0.45);
  const renderY = cy - jumpArc;
  const isAirborne = ch.hopT < 0.95;

  ctx.save();
  ctx.translate(ch.x, renderY);

  // Flashing if respawning
  if (ch.invuln > 0 && Math.floor(frame.t * 16) % 2 === 0) {
    ctx.globalAlpha = 0.3;
  }

  // Shadow on ground
  ctx.save();
  ctx.translate(0, jumpArc);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  const shadowScale = Math.max(0.4, 1 - (jumpArc / (laneHeight * 0.5)) * 0.6);
  ctx.beginPath();
  ctx.ellipse(0, 4, chickenR * shadowScale, chickenR * 0.65 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Squash & stretch during hop
  const stretchY = isAirborne ? 1.25 : 1.0;
  const stretchX = isAirborne ? 0.85 : 1.0;
  ctx.scale(stretchX, stretchY);

  // Main Body
  ctx.fillStyle = `hsl(${p.hue}, 95%, 52%)`;
  ctx.beginPath();
  ctx.arc(0, 0, chickenR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Wings
  ctx.fillStyle = `hsl(${p.hue}, 95%, 40%)`;
  ctx.beginPath();
  ctx.ellipse(-chickenR * 0.85, 2, chickenR * 0.32, chickenR * 0.55, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(chickenR * 0.85, 2, chickenR * 0.32, chickenR * 0.55, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Beak (pointing upwards toward finish)
  ctx.fillStyle = '#ffaa00';
  ctx.beginPath();
  ctx.moveTo(-chickenR * 0.35, -chickenR * 0.7);
  ctx.lineTo(0, -chickenR * 1.35);
  ctx.lineTo(chickenR * 0.35, -chickenR * 0.7);
  ctx.closePath();
  ctx.fill();

  // Red Crest / Comb on top
  ctx.fillStyle = '#ff1d58';
  ctx.beginPath();
  ctx.arc(-chickenR * 0.25, -chickenR * 1.0, chickenR * 0.22, 0, Math.PI * 2);
  ctx.arc(0, -chickenR * 1.15, chickenR * 0.25, 0, Math.PI * 2);
  ctx.arc(chickenR * 0.25, -chickenR * 1.0, chickenR * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-chickenR * 0.35, -chickenR * 0.35, chickenR * 0.3, 0, Math.PI * 2);
  ctx.arc(chickenR * 0.35, -chickenR * 0.35, chickenR * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(-chickenR * 0.35, -chickenR * 0.42, chickenR * 0.16, 0, Math.PI * 2);
  ctx.arc(chickenR * 0.35, -chickenR * 0.42, chickenR * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Player ID / Score Tag (always upright)
  ctx.save();
  ctx.translate(ch.x, renderY - chickenR * 1.7 - (isAirborne ? 10 : 0));
  const label = p.table ? `${p.table}` : `P${idx + 1}`;
  ctx.font = '900 13px system-ui, sans-serif';
  const txtW = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.beginPath();
  ctx.roundRect(-txtW * 0.5 - 6, -9, txtW + 12, 18, 5);
  ctx.fill();
  ctx.fillStyle = `hsl(${p.hue}, 100%, 75%)`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);
  ctx.restore();
});

// ---- FEATHER PARTICLES ----
for (const f of room.state.feathers) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  ctx.globalAlpha = Math.max(0, f.alpha);
  ctx.fillStyle = `hsl(${f.hue}, 90%, 65%)`;
  ctx.beginPath();
  ctx.ellipse(0, 0, f.size * 1.2, f.size * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- VERGE LABELS & HUDS ----
// Finish Line Text
ctx.save();
ctx.font = '900 24px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#000000';
ctx.fillText('★ GOLDEN CORN FINISH LINE ★', W * 0.5, roadTop * 0.45);
ctx.restore();

// Start Verge Prompt
ctx.save();
ctx.font = '900 22px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
const bounce = Math.sin(frame.t * 6) * 4;
ctx.fillText('▲ TAP HOP TO CROSS ▲', W * 0.5, H - botVergeH * 0.35 + bounce);
ctx.restore();

// ---- BIG BANNERS: WINNER OR GO! ----
if (room.state.roundState === 'won' && room.state.winnerInfo) {
  const win = room.state.winnerInfo;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, H * 0.32, W, H * 0.36);

  const pulse = 1 + Math.sin(frame.t * 8) * 0.05 + audio.bass * 0.12;
  ctx.translate(W * 0.5, H * 0.5);
  ctx.scale(pulse, pulse);

  ctx.font = '900 76px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = `hsl(${win.hue}, 100%, 50%)`;
  ctx.shadowBlur = 35;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('WINNER!', 0, -38);

  ctx.font = '900 42px system-ui, sans-serif';
  ctx.fillStyle = `hsl(${win.hue}, 100%, 70%)`;
  ctx.shadowBlur = 18;
  ctx.fillText(`${win.table || 'Player'} Crossed First!`, 0, 36);
  ctx.restore();
} else if (frame.t - room.state.bannerT < 1.4) {
  // Fresh Round Start Banner
  const alpha = Math.max(0, 1 - (frame.t - room.state.bannerT) / 1.4);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffff00';
  ctx.shadowColor = '#ff0055';
  ctx.shadowBlur = 30;
  ctx.fillText('GO!', W * 0.5, H * 0.5);
  ctx.restore();
}

ctx.restore();