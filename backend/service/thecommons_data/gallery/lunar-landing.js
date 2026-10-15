ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Persistent game state initialization
room.state.init ??= false;
room.state.roundIndex ??= 1;
room.state.roundWins ??= 0;
room.state.totalScore ??= 0;
room.state.lastScore ??= 0;
room.state.lastPressTime ??= frame.t;
room.state.roundPresses ??= {};
room.state.padX ??= W * 0.5;
room.state.padY ??= H - 120;
room.state.shake ??= 0;
room.state.particles ??= [];
room.state.rings ??= [];
room.state.messages ??= [];
room.state.stars ??= [];
room.state.windStream ??= [];

const padW = getVar('pad_size') ?? 220;
const themeName = getVar('visual_theme') || 'Cyber Lunar';
const gravPreset = getVar('gravity_preset') || 'Lunar Normal';
const windActive = getVar('solar_wind') ?? true;
const attractEnabled = getVar('auto_pilot_demo') ?? true;

// Gravity settings
let gravAcc = 175;
if (gravPreset === 'Apollo Light') gravAcc = 110;
if (gravPreset === 'Jupiter Heavy') gravAcc = 265;

// Themes palette
const themes = {
  'Cyber Lunar': {
    sky: '#040714',
    groundFill: '#071026',
    groundStroke: '#00f0ff',
    padPlate: '#0d224d',
    padGlow: '#00f0ff',
    beacon: '#ff007f',
    hudAccent: '#00f0ff',
    textMuted: '#5080b0'
  },
  'Retro Radar': {
    sky: '#020904',
    groundFill: '#041508',
    groundStroke: '#39ff14',
    padPlate: '#082a10',
    padGlow: '#39ff14',
    beacon: '#ffee00',
    hudAccent: '#39ff14',
    textMuted: '#307a2b'
  },
  'Solar Sunset': {
    sky: '#100318',
    groundFill: '#1a0624',
    groundStroke: '#ff5522',
    padPlate: '#320b30',
    padGlow: '#ffcc00',
    beacon: '#ff2255',
    hudAccent: '#ffaa00',
    textMuted: '#9a5080'
  }
};
const th = themes[themeName] || themes['Cyber Lunar'];

// Initialize stars once
if (room.state.stars.length === 0) {
  for (let i = 0; i < 90; i++) {
    room.state.stars.push({
      x: Math.random() * W,
      y: Math.random() * (H - 180),
      r: 1 + Math.random() * 2,
      ph: Math.random() * 6.28
    });
  }
}

// Initialize lander
if (!room.state.lander) {
  room.state.lander = {
    x: W * 0.5,
    y: 110,
    vx: 0,
    vy: 15,
    angle: 0,
    vangle: 0,
    thrustTimer: 0,
    state: 'FLYING',
    stateTimer: 0,
    lastThrustHue: 190
  };
}
const lander = room.state.lander;

// Helper: spawn thrust burst
function applyThrust(hue, sourceName) {
  lander.vy = Math.max(-260, lander.vy - 118);
  lander.angle *= 0.72;
  lander.vangle *= 0.5;
  lander.thrustTimer = 0.28;
  lander.lastThrustHue = hue;
  room.state.lastPressTime = frame.t;

  // Smoke / plasma exhaust particles
  for (let i = 0; i < 7; i++) {
    if (room.state.particles.length < 160) {
      room.state.particles.push({
        x: lander.x + (Math.random() - 0.5) * 14,
        y: lander.y + 22,
        vx: lander.vx * 0.2 + (Math.random() - 0.5) * 60 - Math.sin(lander.angle) * 140,
        vy: lander.vy * 0.2 + Math.cos(lander.angle) * (140 + Math.random() * 120),
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        size: 5 + Math.random() * 8,
        hue: hue,
        type: 'exhaust'
      });
    }
  }

  // Shockwave ring
  if (room.state.rings.length < 12) {
    room.state.rings.push({
      x: lander.x,
      y: lander.y + 20,
      r: 10,
      maxR: 55 + (audio.bass || 0) * 35,
      life: 0.35,
      maxLife: 0.35,
      hue: hue
    });
  }

  // Action notification
  if (room.state.messages.length < 8) {
    room.state.messages.push({
      text: sourceName + ' ^THRUST',
      x: lander.x + (Math.random() - 0.5) * 60,
      y: lander.y - 25,
      life: 0.85,
      hue: hue
    });
  }
}

// Helper: reset to next round
function startNewRound() {
  lander.x = W * 0.5 + (Math.random() - 0.5) * Math.max(80, W * 0.4);
  lander.y = 100;
  lander.vx = (Math.random() - 0.5) * 70;
  lander.vy = 20;
  lander.angle = (Math.random() - 0.5) * 0.16;
  lander.vangle = (Math.random() - 0.5) * 0.08;
  lander.state = 'FLYING';
  lander.stateTimer = 0;
  lander.thrustTimer = 0;
  room.state.padX = W * 0.5 + (Math.random() - 0.5) * (W * 0.32);
  room.state.padY = H - 120;
  room.state.roundIndex++;
  room.state.roundPresses = {};
}

// Read room events
let pressedThisFrame = false;
for (const e of (room.events || [])) {
  if (e.name === 'thrust') {
    pressedThisFrame = true;
    const person = (room.people || []).find(p => p.id === e.participantId);
    const pHue = person ? person.hue : Math.floor((frame.t * 80) % 360);
    const pId = person ? person.id : 'guest';
    room.state.roundPresses[pId] = (room.state.roundPresses[pId] || 0) + 1;

    if (lander.state === 'FLYING') {
      applyThrust(pHue, person ? (person.table || 'CREW') : 'PILOT');
    } else {
      // Advance countdown quickly if round ended
      lander.stateTimer -= 0.7;
    }
  }
}

// Attract mode autopilot
if (!pressedThisFrame && attractEnabled && (frame.t - room.state.lastPressTime > 2.6)) {
  if (lander.state === 'FLYING') {
    const distToPad = room.state.padY - (lander.y + 34);
    if (lander.vy > 60 || (distToPad < 240 && lander.vy > 35)) {
      applyThrust(180, 'AUTO');
      room.state.lastPressTime = frame.t - 2.0; // short cooldown between auto bursts
    }
  }
}

// Physics update
if (lander.state === 'FLYING') {
  // Solar wind
  let windVx = 0;
  if (windActive) {
    windVx = Math.sin(frame.t * 0.7) * 35 + (audio.mid || 0) * 15;
    lander.vx += windVx * dt;
  }

  // Movement
  lander.vy += gravAcc * dt;
  lander.y += lander.vy * dt;
  lander.x += lander.vx * dt;
  lander.angle += lander.vangle * dt;
  lander.vx *= Math.pow(0.99, dt * 60);
  lander.vangle *= Math.pow(0.95, dt * 60);

  // Lateral screen bounds bounce
  if (lander.x < 45) {
    lander.x = 45;
    lander.vx = Math.abs(lander.vx) * 0.5;
  } else if (lander.x > W - 45) {
    lander.x = W - 45;
    lander.vx = -Math.abs(lander.vx) * 0.5;
  }

  // Sky ceiling clamp
  if (lander.y < 50) {
    lander.y = 50;
    lander.vy = Math.max(15, lander.vy + 40 * dt);
  }

  // Ground & Pad Collision Check
  const leftPad = room.state.padX - padW * 0.5;
  const rightPad = room.state.padX + padW * 0.5;
  const contactY = lander.y + 34;

  if (contactY >= room.state.padY) {
    const withinPad = (lander.x >= leftPad - 16) && (lander.x <= rightPad + 16);
    const safeVy = lander.vy <= 125;
    const safeVx = Math.abs(lander.vx) <= 75;
    const safeAngle = Math.abs(lander.angle) <= 0.35;

    if (withinPad && safeVy && safeVx && safeAngle) {
      // SUCCESSFUL LANDING
      lander.state = 'LANDED';
      lander.stateTimer = 4.2;
      lander.y = room.state.padY - 34;
      lander.vy = 0;
      lander.vx = 0;
      lander.angle = 0;

      const softnessScore = Math.max(0, Math.round(1000 - lander.vy * 5 - Math.abs(lander.vx) * 4));
      const bullseyeBonus = Math.max(0, Math.round(500 * (1 - Math.abs(lander.x - room.state.padX) / (padW * 0.5))));
      room.state.lastScore = softnessScore + bullseyeBonus;
      room.state.totalScore += room.state.lastScore;
      room.state.roundWins++;

      // Celebration sparks
      for (let i = 0; i < 50; i++) {
        if (room.state.particles.length < 160) {
          const ang = Math.random() * 6.28;
          const spd = 60 + Math.random() * 220;
          room.state.particles.push({
            x: lander.x,
            y: lander.y + 20,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 60,
            life: 0.8 + Math.random() * 0.6,
            maxLife: 1.4,
            size: 4 + Math.random() * 6,
            hue: Math.random() * 360,
            type: 'firework'
          });
        }
      }
    } else {
      // CRASH
      lander.state = 'CRASHED';
      lander.stateTimer = 3.6;
      room.state.shake = 16;

      let reason = 'MISSED LIT PAD!';
      if (withinPad) {
        if (!safeVy) reason = 'TOUCHED DOWN TOO HARD (' + Math.round(lander.vy) + ' m/s)!';
        else if (!safeAngle) reason = 'TILTED OVER ON TOUCHDOWN!';
        else reason = 'LATERAL SKID CRASH!';
      }
      room.state.crashReason = reason;

      // Explosion debris
      for (let i = 0; i < 55; i++) {
        if (room.state.particles.length < 160) {
          const ang = Math.random() * 6.28;
          const spd = 40 + Math.random() * 260;
          room.state.particles.push({
            x: lander.x,
            y: lander.y + 15,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            life: 0.7 + Math.random() * 0.6,
            maxLife: 1.3,
            size: 5 + Math.random() * 8,
            hue: Math.random() > 0.4 ? 20 : 50,
            type: 'explosion'
          });
        }
      }
    }
  }
} else {
  // Countdown to next mission
  lander.stateTimer -= dt;
  if (lander.stateTimer <= 0) {
    startNewRound();
  }
}

// Screen shake dampening
if (room.state.shake > 0) {
  const sx = (Math.random() - 0.5) * room.state.shake;
  const sy = (Math.random() - 0.5) * room.state.shake;
  ctx.translate(sx, sy);
  room.state.shake = Math.max(0, room.state.shake - dt * 25);
}

// 1. BACKGROUND SKY & STARS
ctx.fillStyle = th.sky;
ctx.fillRect(0, 0, W, H);

// Twinkling stars
for (let i = 0; i < room.state.stars.length; i++) {
  const s = room.state.stars[i];
  const tw = 0.35 + 0.35 * Math.sin(frame.t * 2.2 + s.ph) + (audio.treble || 0) * 0.3;
  ctx.fillStyle = 'rgba(230, 245, 255, ' + Math.min(1, tw) + ')';
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.r, 0, 6.28);
  ctx.fill();
}

// Solar wind streaks
if (windActive) {
  const windSpeed = Math.sin(frame.t * 0.7) * 35;
  ctx.strokeStyle = th.hudAccent;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.18;
  for (let k = 0; k < 5; k++) {
    const sy = 120 + k * 110;
    const sx = ((frame.t * (windSpeed * 3 + 40) + k * 350) % (W + 200)) - 100;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 80, sy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;
}

// 2. CRATERED LUNAR TERRAIN
const leftPad = room.state.padX - padW * 0.5;
const rightPad = room.state.padX + padW * 0.5;
const padY = room.state.padY;

ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(0, padY - 55);
ctx.quadraticCurveTo(leftPad * 0.35, padY - 95, leftPad * 0.7, padY - 35);
ctx.lineTo(leftPad, padY);
ctx.lineTo(rightPad, padY);
ctx.quadraticCurveTo(rightPad + (W - rightPad) * 0.35, padY - 35, rightPad + (W - rightPad) * 0.7, padY - 95);
ctx.lineTo(W, padY - 60);
ctx.lineTo(W, H);
ctx.closePath();

ctx.fillStyle = th.groundFill;
ctx.fill();
ctx.strokeStyle = th.groundStroke;
ctx.lineWidth = 3;
ctx.stroke();

// Terrain neon grid lines
ctx.strokeStyle = th.groundStroke;
ctx.lineWidth = 1;
ctx.globalAlpha = 0.22 + (audio.bass || 0) * 0.15;
for (let gx = 40; gx < W; gx += 70) {
  ctx.beginPath();
  ctx.moveTo(gx, padY);
  ctx.lineTo(gx + (gx - W * 0.5) * 0.25, H);
  ctx.stroke();
}
ctx.globalAlpha = 1.0;

// 3. LANDING PAD
// Pad foundation / supports
ctx.fillStyle = th.padPlate;
ctx.fillRect(leftPad, padY, padW, 20);
ctx.strokeStyle = th.padGlow;
ctx.lineWidth = 3;
ctx.strokeRect(leftPad, padY, padW, 20);

// Chevrons on pad
ctx.fillStyle = th.padGlow;
const midPad = room.state.padX;
ctx.font = '900 16px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('▶ ▶ ▶  TOUCHDOWN PAD  ◀ ◀ ◀', midPad, padY + 10);

// Landing Pad Beacon Towers
const beaconPulse = 8 + Math.sin(frame.t * 8) * 4 + (audio.bass || 0) * 10;
// Left Beacon
ctx.fillStyle = th.beacon;
ctx.fillRect(leftPad - 10, padY - 26, 8, 26);
ctx.beginPath();
ctx.arc(leftPad - 6, padY - 26, beaconPulse, 0, 6.28);
ctx.fill();
// Right Beacon
ctx.fillRect(rightPad + 2, padY - 26, 8, 26);
ctx.beginPath();
ctx.arc(rightPad + 6, padY - 26, beaconPulse, 0, 6.28);
ctx.fill();

// Vertical guidance laser beam from pad to sky
ctx.save();
ctx.globalCompositeOperation = 'screen';
const beamGrad = ctx.createLinearGradient(0, padY, 0, 80);
beamGrad.addColorStop(0, th.padGlow);
beamGrad.addColorStop(1, 'transparent');
ctx.fillStyle = beamGrad;
ctx.globalAlpha = 0.12 + (audio.bass || 0) * 0.15;
ctx.fillRect(midPad - 28, 80, 56, padY - 80);
ctx.restore();

// 4. PARTICLES & SHOCKWAVE RINGS
// Shockwave rings
for (let i = room.state.rings.length - 1; i >= 0; i--) {
  const r = room.state.rings[i];
  r.life -= dt;
  if (r.life <= 0) {
    room.state.rings.splice(i, 1);
    continue;
  }
  const progress = 1 - (r.life / r.maxLife);
  const curR = r.r + (r.maxR - r.r) * progress;
  ctx.strokeStyle = 'hsla(' + r.hue + ', 100%, 65%, ' + (r.life / r.maxLife) + ')';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(r.x, r.y, curR, 0, 6.28);
  ctx.stroke();
}

// Particles
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.life -= dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.type === 'firework' || p.type === 'explosion') {
    p.vy += 160 * dt;
  }
  const alpha = Math.max(0, p.life / p.maxLife);
  ctx.fillStyle = 'hsla(' + p.hue + ', 100%, 65%, ' + alpha + ')';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, 6.28);
  ctx.fill();
}

// 5. DRAW LANDER
if (lander.state !== 'CRASHED') {
  ctx.save();
  ctx.translate(lander.x, lander.y);
  ctx.rotate(lander.angle);

  lander.thrustTimer = Math.max(0, lander.thrustTimer - dt);

  // Main Thruster Jet
  if (lander.thrustTimer > 0) {
    const flameLen = 28 + (lander.thrustTimer / 0.28) * 36 + (audio.bass || 0) * 30;
    const flicker = (Math.random() - 0.5) * 6;

    // Outer plasma flare (player hue)
    ctx.fillStyle = 'hsla(' + lander.lastThrustHue + ', 100%, 60%, 0.85)';
    ctx.beginPath();
    ctx.moveTo(-11, 14);
    ctx.lineTo(11, 14);
    ctx.lineTo(flicker, 14 + flameLen);
    ctx.closePath();
    ctx.fill();

    // Inner intense core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-5, 14);
    ctx.lineTo(5, 14);
    ctx.lineTo(flicker * 0.5, 14 + flameLen * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  // Landing Gear Struts & Footpads
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 3;
  // Left Leg
  ctx.beginPath();
  ctx.moveTo(-16, 8);
  ctx.lineTo(-32, 34);
  ctx.moveTo(-40, 34);
  ctx.lineTo(-24, 34);
  // Right Leg
  ctx.moveTo(16, 8);
  ctx.lineTo(32, 34);
  ctx.moveTo(24, 34);
  ctx.lineTo(40, 34);
  ctx.stroke();

  // Engine Bell Nozzle
  ctx.fillStyle = '#444855';
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.lineTo(8, 8);
  ctx.lineTo(12, 16);
  ctx.lineTo(-12, 16);
  ctx.closePath();
  ctx.fill();

  // Descent Stage Body (octagonal module)
  ctx.fillStyle = '#d4af37'; // Golden foil
  ctx.strokeStyle = '#ffeb79';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-22, -6);
  ctx.lineTo(22, -6);
  ctx.lineTo(26, 8);
  ctx.lineTo(-26, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Ascent Stage Cabin
  ctx.fillStyle = '#e8edf5';
  ctx.strokeStyle = '#8ca3be';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, -26);
  ctx.lineTo(16, -26);
  ctx.lineTo(22, -6);
  ctx.lineTo(-22, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cockpit Visor / Glass
  ctx.fillStyle = '#00f0ff';
  ctx.beginPath();
  ctx.arc(0, -16, 7, 3.14, 0);
  ctx.closePath();
  ctx.fill();

  // Top docking antenna
  ctx.strokeStyle = '#aaccff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(0, -36);
  ctx.stroke();
  ctx.fillStyle = '#ff3366';
  ctx.beginPath();
  ctx.arc(0, -36, 3, 0, 6.28);
  ctx.fill();

  ctx.restore();
}

// 6. FLOATING ACTION MESSAGES
for (let i = room.state.messages.length - 1; i >= 0; i--) {
  const m = room.state.messages[i];
  m.life -= dt;
  m.y -= 45 * dt;
  if (m.life <= 0) {
    room.state.messages.splice(i, 1);
    continue;
  }
  ctx.font = '900 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'hsla(' + m.hue + ', 100%, 70%, ' + m.life + ')';
  ctx.fillText(m.text, m.x, m.y);
}

// 7. ROBUST HUD & TELEMETRY GAUGES (Legible from across the room)
// Header Panel
ctx.fillStyle = 'rgba(4, 8, 20, 0.85)';
ctx.fillRect(0, 0, W, 70);
ctx.strokeStyle = th.hudAccent;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(0, 70);
ctx.lineTo(W, 70);
ctx.stroke();

// Left: Mission & Total Score
ctx.textAlign = 'left';
ctx.textBaseline = 'middle';
ctx.font = '900 20px system-ui, sans-serif';
ctx.fillStyle = '#ffffff';
ctx.fillText('MISSION #' + room.state.roundIndex, 24, 25);
ctx.font = '700 15px system-ui, sans-serif';
ctx.fillStyle = th.hudAccent;
ctx.fillText('SCORE: ' + room.state.totalScore + '  |  WINS: ' + room.state.roundWins, 24, 48);

// Center: Connected Players / Cockpit Crew Tokens
const peopleList = room.people || [];
ctx.textAlign = 'center';
if (peopleList.length === 0) {
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillStyle = attractEnabled ? '#ffdd55' : th.textMuted;
  ctx.fillText(attractEnabled ? '● AUTOPILOT ACTIVE (PRESS THRUST TO JOIN)' : 'SOLO PILOT MODE', W * 0.5, 35);
} else {
  const crewCount = peopleList.length;
  const slotW = Math.min(50, Math.max(28, (W * 0.4) / crewCount));
  const startX = W * 0.5 - (crewCount * slotW) * 0.5 + slotW * 0.5;

  for (let pIdx = 0; pIdx < crewCount; pIdx++) {
    const p = peopleList[pIdx];
    const px = startX + pIdx * slotW;
    const py = 32;
    const presses = room.state.roundPresses[p.id] || 0;

    // Seat helmet / badge
    ctx.fillStyle = 'hsl(' + p.hue + ', 85%, 55%)';
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, 6.28);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = presses > 0 ? 2.5 : 1;
    ctx.stroke();

    // Press count badge
    if (presses > 0) {
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText('' + presses, px, py);
    }
  }
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = th.hudAccent;
  ctx.fillText('CREW ROSTER (' + crewCount + ')', W * 0.5, 58);
}

// Right: Live Flight Gauges
const vyVal = Math.round(lander.vy);
const vxVal = Math.round(lander.vx);
const altVal = Math.max(0, Math.round(room.state.padY - (lander.y + 34)));

// Safe threshold color logic
let vyColor = '#39ff14';
let vyStatus = 'SAFE';
if (vyVal > 95 && vyVal <= 125) {
  vyColor = '#ffaa00';
  vyStatus = 'SLOW DOWN!';
} else if (vyVal > 125) {
  vyColor = '#ff2244';
  vyStatus = 'DANGER!';
}

ctx.textAlign = 'right';
ctx.font = '900 22px system-ui, monospace';
ctx.fillStyle = vyColor;
ctx.fillText('V-SPD: ' + vyVal + ' m/s ' + vyStatus, W - 24, 25);

ctx.font = '700 15px system-ui, monospace';
ctx.fillStyle = '#ffffff';
ctx.fillText('DRIFT: ' + Math.abs(vxVal) + ' m/s ' + (vxVal > 15 ? '▶' : (vxVal < -15 ? '◀' : '●')) + '  ALT: ' + altVal + 'm', W - 24, 48);

// 8. BIG SHORT OUTCOME & PROMPT BANNERS
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

if (lander.state === 'LANDED') {
  // Celebration Banner
  ctx.fillStyle = 'rgba(0, 20, 10, 0.88)';
  ctx.fillRect(W * 0.15, H * 0.32, W * 0.7, 150);
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 4;
  ctx.strokeRect(W * 0.15, H * 0.32, W * 0.7, 150);

  ctx.font = '900 58px system-ui, sans-serif';
  ctx.fillStyle = '#39ff14';
  ctx.fillText('TOUCHDOWN!', W * 0.5, H * 0.38);

  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SOFT LANDING SCORE: +' + room.state.lastScore + ' PTS!', W * 0.5, H * 0.44);

  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillStyle = th.hudAccent;
  ctx.fillText('NEXT MISSION IN ' + Math.ceil(lander.stateTimer) + 's (OR TAP THRUST)', W * 0.5, H * 0.485);
} else if (lander.state === 'CRASHED') {
  // Crash Banner
  ctx.fillStyle = 'rgba(30, 4, 8, 0.88)';
  ctx.fillRect(W * 0.15, H * 0.32, W * 0.7, 150);
  ctx.strokeStyle = '#ff2244';
  ctx.lineWidth = 4;
  ctx.strokeRect(W * 0.15, H * 0.32, W * 0.7, 150);

  ctx.font = '900 56px system-ui, sans-serif';
  ctx.fillStyle = '#ff2244';
  ctx.fillText('CRASHED!', W * 0.5, H * 0.38);

  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(room.state.crashReason || 'IMPACT VELOCITY TOO HIGH!', W * 0.5, H * 0.44);

  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillStyle = '#ffaa44';
  ctx.fillText('RETRYING IN ' + Math.ceil(lander.stateTimer) + 's (TAP THRUST TO SKIP)', W * 0.5, H * 0.485);
} else if (altVal < 260 && vyVal > 95) {
  // In-flight warning prompt
  ctx.fillStyle = 'rgba(255, 34, 68, ' + (0.6 + 0.4 * Math.sin(frame.t * 12)) + ')';
  ctx.font = '900 32px system-ui, sans-serif';
  ctx.fillText('▼ BRAKE NOW! TAP THRUST! ▼', W * 0.5, 110);
} else if (altVal > 300) {
  ctx.fillStyle = th.textMuted;
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillText('COOPERATE TO LAND GENTLY ON THE LIT PAD', W * 0.5, 95);
}

ctx.restore();