const W = frame.width;
const H = frame.height;
const S = Math.min(W / 1920, H / 1080);

// --- Persistent State Initialization ---
room.state.balloonY ??= H * 0.48;
room.state.vy ??= 0;
room.state.heat ??= 0.4;
room.state.dist ??= 0;
room.state.bestDist ??= 0;
room.state.status ??= 'playing'; // 'playing' | 'crashed'
room.state.statusTimer ??= 0;
room.state.lastPressTime ??= frame.t;
room.state.shake ??= 0;
room.state.flames ??= [];
room.state.floaters ??= [];
room.state.lastBurnerHue ??= 38;
room.state.flash ??= 0;
room.state.lastActivePlayerId ??= '';

// --- Variable Lookups ---
const speedMult = getVar('flight_speed') ?? 1.4;
const turbAmount = (getVar('wind_turbulence') ?? 4) * 16 * S;
const stormOn = getVar('storm_ceiling') ?? true;
const audioBoostOn = getVar('audio_boost') ?? true;
const skyChoice = getVar('sky_palette') ?? 'Twilight Neon';
const mountainChoice = getVar('mountain_style') ?? 'Jagged Crags';

const palettes = {
  'Twilight Neon': {
    skyTop: '#0a0521', skyBot: '#2b1055',
    stormTop: '#100028', stormEdge: '#d946ef',
    mtnBack: '#1d0b38', mtnMid: '#381463', mtnFront: '#59168b',
    crest: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)',
    balloonBase: 330
  },
  'Midnight Nebula': {
    skyTop: '#030712', skyBot: '#0f172a',
    stormTop: '#020617', stormEdge: '#38bdf8',
    mtnBack: '#0c1b33', mtnMid: '#162e52', mtnFront: '#1e3a66',
    crest: '#22d3ee', glow: 'rgba(34, 211, 238, 0.4)',
    balloonBase: 195
  },
  'Golden Sunset': {
    skyTop: '#230b1e', skyBot: '#5b1e31',
    stormTop: '#1f0917', stormEdge: '#f97316',
    mtnBack: '#3b1228', mtnMid: '#631d38', mtnFront: '#882245',
    crest: '#fbbf24', glow: 'rgba(251, 191, 36, 0.45)',
    balloonBase: 25
  },
  'Cyber Aurora': {
    skyTop: '#021014', skyBot: '#07252b',
    stormTop: '#010f13', stormEdge: '#10b981',
    mtnBack: '#092d34', mtnMid: '#0e434c', mtnFront: '#135e69',
    crest: '#34d399', glow: 'rgba(52, 211, 153, 0.45)',
    balloonBase: 160
  }
};
const pal = palettes[skyChoice] ?? palettes['Twilight Neon'];

// --- Mountain & Storm Height Equations ---
function getMountainH(wx) {
  let h = Math.sin(wx * 0.0006) * H * 0.12 + Math.sin(wx * 0.0016 + 1.2) * H * 0.08;
  if (mountainChoice === 'Jagged Crags') {
    h += Math.abs(Math.sin(wx * 0.0037 + 0.4)) * H * 0.22;
    h += Math.abs(Math.sin(wx * 0.008)) * H * 0.08;
  } else if (mountainChoice === 'Rolling Spires') {
    h += (Math.sin(wx * 0.003) * 0.5 + 0.5) * H * 0.2;
    h += Math.sin(wx * 0.006 + 2) * H * 0.06;
  } else {
    const saw = Math.abs(((wx * 0.0025) % 2) - 1);
    h += saw * H * 0.28;
  }
  return Math.min(H * 0.9, Math.max(H * 0.48, H * 0.88 - h));
}

function getStormH(wx) {
  if (!stormOn) return -100;
  let c = Math.sin(wx * 0.0011 + 3.1) * H * 0.07 + Math.cos(wx * 0.0028) * H * 0.05;
  c += Math.abs(Math.sin(wx * 0.0055)) * H * 0.06;
  return Math.min(H * 0.38, Math.max(H * 0.08, H * 0.16 + c));
}

// --- Event Handling (Burner Presses) ---
const balloonX = W * 0.24;
const balloonR = 48 * S;
let burnerPressedThisFrame = false;

if (room.events && room.events.length > 0) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'burner') {
      burnerPressedThisFrame = true;
      room.state.lastPressTime = frame.t;
      const person = room.people?.find(p => p.id === ev.participantId);
      const pHue = person ? person.hue : ((Math.random() * 360) | 0);
      room.state.lastBurnerHue = pHue;
      room.state.lastActivePlayerId = ev.participantId || '';

      if (room.state.status === 'playing') {
        room.state.heat = Math.min(1.8, room.state.heat + 0.44);
        room.state.vy = Math.min(room.state.vy - 160 * S, -80 * S);
        room.state.shake = Math.min(room.state.shake + 10, 24);
        // Spawn flame bursts
        for (let k = 0; k < 14; k++) {
          if (room.state.flames.length < 160) {
            room.state.flames.push({
              x: balloonX + (Math.random() - 0.5) * 20 * S,
              y: room.state.balloonY + balloonR * 0.6,
              vx: (Math.random() - 0.5) * 80 * S - 40 * S,
              vy: -Math.random() * 320 * S - 120 * S,
              size: (18 + Math.random() * 22) * S,
              life: 1.0,
              decay: 1.8 + Math.random() * 1.5,
              hue: pHue
            });
          }
        }
        // Floater badge
        if (room.state.floaters.length < 8) {
          const lbl = person ? (person.table ? `${person.table} ROAR!` : 'BLAST!') : 'BURNER!';
          room.state.floaters.push({
            x: balloonX + 50 * S,
            y: room.state.balloonY,
            text: lbl,
            hue: pHue,
            life: 1.0
          });
        }
      } else if (room.state.status === 'crashed' && room.state.statusTimer < 2.5) {
        // Quick revive on button press!
        room.state.status = 'playing';
        room.state.balloonY = H * 0.45;
        room.state.vy = -60 * S;
        room.state.heat = 0.5;
        room.state.dist = 0;
      }
    }
  }
}

// --- Attract Mode (Auto Pilot if idle > 4.2s) ---
const isAttract = (frame.t - room.state.lastPressTime > 4.2);
if (isAttract && room.state.status === 'playing') {
  const targetBottom = getMountainH(room.state.dist + 160 * S);
  const targetTop = getStormH(room.state.dist + 160 * S);
  const midSafeY = (targetBottom + (stormOn ? targetTop : H * 0.1)) * 0.5;
  if (room.state.balloonY > midSafeY + 25 * S || room.state.vy > 90 * S) {
    room.state.heat = Math.min(1.5, room.state.heat + 0.35);
    room.state.vy -= 110 * S * frame.dt * 60;
    // Spawn auto-pilot flame puff
    if (Math.random() < 0.35 && room.state.flames.length < 160) {
      room.state.flames.push({
        x: balloonX + (Math.random() - 0.5) * 16 * S,
        y: room.state.balloonY + balloonR * 0.6,
        vx: (Math.random() - 0.5) * 60 * S,
        vy: -Math.random() * 240 * S - 80 * S,
        size: 16 * S,
        life: 0.9,
        decay: 2.2,
        hue: (frame.t * 60) % 360
      });
    }
  }
}

// --- Physics Update ---
const dt = Math.min(frame.dt, 0.05);
const worldSpeed = (room.state.status === 'playing' ? 240 * speedMult * S : 30 * S);
room.state.dist += worldSpeed * dt;

if (room.state.status === 'playing') {
  const gravity = 320 * S;
  const audioThermal = (audioBoostOn && audio ? audio.bass * 280 * S : 0);
  const lift = (680 * S + audioThermal) * room.state.heat;
  const turbDraft = Math.sin(room.state.dist * 0.004) * turbAmount;

  room.state.vy += (gravity - lift + turbDraft) * dt;
  room.state.vy *= Math.pow(0.965, dt * 60);
  room.state.balloonY += room.state.vy * dt;

  // Heat decay
  room.state.heat = Math.max(0, room.state.heat - 0.72 * dt);

  // Collision checks
  const currentMtnY = getMountainH(room.state.dist);
  const currentStormY = getStormH(room.state.dist);
  const basketBottomY = room.state.balloonY + balloonR * 1.55;
  const envelopeTopY = room.state.balloonY - balloonR * 1.05;

  if (basketBottomY >= currentMtnY || (stormOn && envelopeTopY <= currentStormY)) {
    room.state.status = 'crashed';
    room.state.statusTimer = 3.6;
    room.state.shake = 30;
    room.state.flash = 1.0;
    if (room.state.dist > room.state.bestDist) {
      room.state.bestDist = room.state.dist;
    }
  }
} else {
  // Crashed sequence
  room.state.statusTimer -= dt;
  room.state.balloonY = Math.min(H * 0.86, room.state.balloonY + 80 * S * dt);
  if (room.state.statusTimer <= 0) {
    room.state.status = 'playing';
    room.state.balloonY = H * 0.45;
    room.state.vy = -50 * S;
    room.state.heat = 0.5;
    room.state.dist = 0;
  }
}

// --- Shake & Screen Flash Decay ---
room.state.shake *= Math.pow(0.9, dt * 60);
room.state.flash = Math.max(0, room.state.flash - dt * 2.0);

// --- Render: Setup Transform with Shake ---
ctx.save();
if (room.state.shake > 0.4) {
  const sx = (Math.random() - 0.5) * room.state.shake;
  const sy = (Math.random() - 0.5) * room.state.shake;
  ctx.translate(sx, sy);
}

// 1. Sky Gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
skyGrad.addColorStop(0, pal.skyTop);
skyGrad.addColorStop(1, pal.skyBot);
ctx.fillStyle = skyGrad;
ctx.fillRect(-20, -20, W + 40, H + 40);

// Stars / Speed Streaks in background
ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
for (let i = 0; i < 28; i++) {
  const stx = ((i * 137.5 + room.state.dist * 0.15) % W);
  const sty = (i * 73.1) % (H * 0.55);
  const srad = (i % 3 === 0 ? 2.5 : 1.4) * S;
  ctx.beginPath();
  ctx.arc(stx, sty, srad, 0, Math.PI * 2);
  ctx.fill();
}

// 2. Parallax Mountain Layers (Back & Mid)
const drawMountainLayer = (speedFactor, color, alpha, yOffset) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(0, H);
  const step = 28 * S;
  const offsetWx = room.state.dist * speedFactor;
  for (let x = 0; x <= W + step; x += step) {
    const wx = offsetWx + x;
    const my = getMountainH(wx * 0.7) * 0.8 + yOffset;
    ctx.lineTo(x, my);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};
drawMountainLayer(0.2, pal.mtnBack, 0.7, H * 0.14);
drawMountainLayer(0.5, pal.mtnMid, 0.85, H * 0.08);

// 3. Storm Clouds at Ceiling (Hazard)
if (stormOn) {
  ctx.save();
  const cloudGrad = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  cloudGrad.addColorStop(0, pal.stormTop);
  cloudGrad.addColorStop(0.7, '#180a2b');
  cloudGrad.addColorStop(1, 'rgba(30, 10, 50, 0)');
  ctx.fillStyle = cloudGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  const stepC = 30 * S;
  for (let x = W; x >= -stepC; x -= stepC) {
    const wx = room.state.dist + x;
    const cy = getStormH(wx);
    ctx.lineTo(x, cy);
  }
  ctx.closePath();
  ctx.fill();

  // Lightning & Storm edge rim
  ctx.beginPath();
  for (let x = 0; x <= W + stepC; x += stepC) {
    const wx = room.state.dist + x;
    const cy = getStormH(wx);
    if (x === 0) ctx.moveTo(x, cy); else ctx.lineTo(x, cy);
  }
  ctx.strokeStyle = pal.stormEdge;
  ctx.lineWidth = (3 + (audio?.beat ? 4 : 0)) * S;
  ctx.shadowColor = pal.stormEdge;
  ctx.shadowBlur = 12 * S;
  ctx.stroke();

  // Occasional audio-reactive lightning discharge
  if (audio && (audio.beat || audio.treble > 0.65)) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * S;
    ctx.beginPath();
    const lx = (frame.t * 310) % W;
    const ly = getStormH(room.state.dist + lx);
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx - 20 * S, ly + 40 * S);
    ctx.lineTo(lx + 15 * S, ly + 70 * S);
    ctx.lineTo(lx - 10 * S, ly + 110 * S);
    ctx.stroke();
  }
  ctx.restore();
}

// 4. Foreground Hazardous Mountain Terrain
ctx.save();
const fgMtnGrad = ctx.createLinearGradient(0, H * 0.45, 0, H);
fgMtnGrad.addColorStop(0, pal.mtnFront);
fgMtnGrad.addColorStop(1, '#05020c');
ctx.fillStyle = fgMtnGrad;
ctx.beginPath();
ctx.moveTo(0, H);
const stepFg = 20 * S;
for (let x = 0; x <= W + stepFg; x += stepFg) {
  const wx = room.state.dist + x;
  const my = getMountainH(wx);
  ctx.lineTo(x, my);
}
ctx.lineTo(W, H);
ctx.closePath();
ctx.fill();

// Glowing Crest Line
ctx.beginPath();
for (let x = 0; x <= W + stepFg; x += stepFg) {
  const wx = room.state.dist + x;
  const my = getMountainH(wx);
  if (x === 0) ctx.moveTo(x, my); else ctx.lineTo(x, my);
}
ctx.strokeStyle = pal.crest;
ctx.lineWidth = (4 + (audio?.bass ? audio.bass * 4 : 1)) * S;
ctx.shadowColor = pal.glow;
ctx.shadowBlur = 16 * S;
ctx.stroke();
ctx.restore();

// 5. Flames & Burner Jet (Drawn behind/inside balloon neck)
ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (let i = room.state.flames.length - 1; i >= 0; i--) {
  const f = room.state.flames[i];
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.life -= f.decay * dt;
  if (f.life <= 0) {
    room.state.flames.splice(i, 1);
    continue;
  }
  const rad = f.size * f.life;
  const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rad));
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, `hsla(${f.hue}, 100%, 65%, ${f.life})`);
  grad.addColorStop(1, `hsla(${f.hue}, 100%, 45%, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(f.x, f.y, Math.max(1, rad), 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Constant ambient burner ember when heating
if (room.state.heat > 0.05 && room.state.flames.length < 160 && Math.random() < 0.6) {
  room.state.flames.push({
    x: balloonX + (Math.random() - 0.5) * 12 * S,
    y: room.state.balloonY + balloonR * 0.55,
    vx: (Math.random() - 0.5) * 40 * S - 30 * S,
    vy: -Math.random() * 180 * S - 60 * S,
    size: (12 + room.state.heat * 14) * S,
    life: 0.65,
    decay: 2.5,
    hue: room.state.lastBurnerHue
  });
}

// 6. Draw Hot-Air Balloon & Connected People Crew
const bx = balloonX;
const by = room.state.balloonY;
const R = balloonR;

ctx.save();
ctx.translate(bx, by);

// Tilt slightly with vertical speed
const tilt = Math.max(-0.25, Math.min(0.25, room.state.vy / (600 * S)));
ctx.rotate(tilt);

// Crash smoke / sparks
if (room.state.status === 'crashed') {
  ctx.fillStyle = '#ff3344';
  ctx.beginPath();
  ctx.arc(0, 0, (R * 1.2) * (1 + Math.sin(frame.t * 18) * 0.1), 0, Math.PI * 2);
  ctx.fill();
}

// --- Envelope (Teardrop Hot-Air Balloon) ---
ctx.beginPath();
ctx.moveTo(0, -R * 1.35);
// Right curve to throat
ctx.bezierCurveTo(R * 1.28, -R * 1.35, R * 1.25, R * 0.25, R * 0.32, R * 0.85);
// Throat opening
ctx.lineTo(-R * 0.32, R * 0.85);
// Left curve to top
ctx.bezierCurveTo(-R * 1.25, R * 0.25, -R * 1.28, -R * 1.35, 0, -R * 1.35);
ctx.closePath();

// Clip to draw vertical striped gores tinted by room people!
ctx.save();
ctx.clip();

const peopleCount = (room.people && room.people.length > 0) ? room.people.length : 4;
const stripeCount = Math.max(6, Math.min(24, peopleCount * 2));
const goreW = (R * 2.6) / stripeCount;

for (let i = 0; i < stripeCount; i++) {
  let stripeHue;
  if (room.people && room.people.length > 0) {
    const p = room.people[i % room.people.length];
    stripeHue = p.hue;
  } else {
    stripeHue = (pal.balloonBase + i * (260 / stripeCount)) % 360;
  }
  const sx = -R * 1.3 + i * goreW;
  ctx.fillStyle = `hsl(${stripeHue}, 85%, ${i % 2 === 0 ? 55 : 42}%)`;
  ctx.fillRect(sx, -R * 1.6, goreW + 1, R * 2.7);
}

// Shadow & highlight shading over envelope for 3D sphere volume
const shadeGrad = ctx.createRadialGradient(-R * 0.4, -R * 0.5, R * 0.2, 0, -R * 0.2, R * 1.3);
shadeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
shadeGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0)');
shadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
ctx.fillStyle = shadeGrad;
ctx.fillRect(-R * 1.5, -R * 1.5, R * 3, R * 3);
ctx.restore();

// Envelope Contour & Rigging Lines
ctx.lineWidth = 3.5 * S;
ctx.strokeStyle = '#ffffff';
ctx.stroke();

// Burner Nozzle ring
ctx.fillStyle = '#475569';
ctx.fillRect(-R * 0.24, R * 0.84, R * 0.48, R * 0.12);
ctx.fillStyle = room.state.heat > 0.4 ? '#fef08a' : '#94a3b8';
ctx.beginPath();
ctx.arc(0, R * 0.9, R * 0.18, 0, Math.PI * 2);
ctx.fill();

// Rigging ropes to basket
ctx.strokeStyle = '#cbd5e1';
ctx.lineWidth = 2 * S;
ctx.beginPath();
ctx.moveTo(-R * 0.28, R * 0.94);
ctx.lineTo(-R * 0.38, R * 1.35);
ctx.moveTo(R * 0.28, R * 0.94);
ctx.lineTo(R * 0.38, R * 1.35);
ctx.moveTo(-R * 0.12, R * 0.94);
ctx.lineTo(-R * 0.18, R * 1.35);
ctx.moveTo(R * 0.12, R * 0.94);
ctx.lineTo(R * 0.18, R * 1.35);
ctx.stroke();

// --- Basket Body ---
const bktW = R * 0.95;
const bktH = R * 0.45;
const bktX = -bktW * 0.5;
const bktY = R * 1.35;

ctx.fillStyle = '#78350f'; // Wicker brown
ctx.beginPath();
ctx.roundRect(bktX, bktY, bktW, bktH, 6 * S);
ctx.fill();
ctx.lineWidth = 2.5 * S;
ctx.strokeStyle = '#d97706';
ctx.stroke();

// Basket weave accents
ctx.strokeStyle = '#92400e';
ctx.beginPath();
for (let wx = bktX + 8 * S; wx < bktX + bktW; wx += 10 * S) {
  ctx.moveTo(wx, bktY);
  ctx.lineTo(wx, bktY + bktH);
}
ctx.stroke();

// --- Passengers / Room Crew Inside Basket ---
// Scaled to fit 1 to 40 players smoothly
const pCount = (room.people && room.people.length > 0) ? room.people.length : 3;
const maxVisible = Math.min(pCount, 16);
const seatGap = bktW / (maxVisible + 1);

for (let i = 0; i < maxVisible; i++) {
  let pHue;
  let isHot = false;
  if (room.people && room.people.length > 0) {
    const p = room.people[i];
    pHue = p.hue;
    if (p.id === room.state.lastActivePlayerId && frame.t - room.state.lastPressTime < 0.6) {
      isHot = true;
    }
  } else {
    pHue = (i * 95) % 360;
  }

  const px = bktX + seatGap * (i + 1);
  const py = bktY - (isHot ? 12 * S : 4 * S);

  // Scarf trailing in wind
  ctx.strokeStyle = `hsl(${pHue}, 90%, 55%)`;
  ctx.lineWidth = 3 * S;
  ctx.beginPath();
  ctx.moveTo(px, py + 4 * S);
  ctx.quadraticCurveTo(px - 14 * S, py + 2 * S + Math.sin(frame.t * 12 + i) * 4 * S, px - 24 * S, py + 8 * S);
  ctx.stroke();

  // Head / Pilot Helmet
  ctx.fillStyle = `hsl(${pHue}, 90%, 55%)`;
  ctx.beginPath();
  ctx.arc(px, py, 6.5 * S, 0, Math.PI * 2);
  ctx.fill();

  // Pilot Goggles
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px - 4 * S, py - 2 * S, 8 * S, 3 * S);

  if (isHot) {
    // Glow crown for player who just hit burner
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2 * S;
    ctx.strokeRect(px - 7 * S, py - 12 * S, 14 * S, 4 * S);
  }
}

// Heat gauge halo around balloon
if (room.state.heat > 0.1) {
  ctx.strokeStyle = `hsla(${room.state.lastBurnerHue}, 100%, 60%, ${Math.min(0.65, room.state.heat * 0.45)})`;
  ctx.lineWidth = 8 * S;
  ctx.beginPath();
  ctx.arc(0, -R * 0.35, R * 1.35, 0, Math.PI * 2);
  ctx.stroke();
}

ctx.restore(); // Restore balloon transform

// 7. Floating Combat / Action Badges
for (let i = room.state.floaters.length - 1; i >= 0; i--) {
  const fl = room.state.floaters[i];
  fl.y -= 75 * S * dt;
  fl.life -= dt * 1.5;
  if (fl.life <= 0) {
    room.state.floaters.splice(i, 1);
    continue;
  }
  ctx.save();
  ctx.font = `900 ${22 * S}px "Montserrat", "Arial Black", sans-serif`;
  ctx.fillStyle = `hsla(${fl.hue}, 100%, 65%, ${fl.life})`;
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 8 * S;
  ctx.fillText(fl.text, fl.x, fl.y);
  ctx.restore();
}

// 8. Full-Screen Flash on Crash
if (room.state.flash > 0.01) {
  ctx.fillStyle = `rgba(239, 68, 68, ${room.state.flash * 0.55})`;
  ctx.fillRect(0, 0, W, H);
}

// --- BIG BOLD HUD (Legible from Across the Room) ---
ctx.save();

// Top-Center Big Score / Distance Flown
const currentScoreM = Math.floor(room.state.dist * 0.1);
const bestScoreM = Math.floor(room.state.bestDist * 0.1);

ctx.textAlign = 'center';
ctx.font = `900 ${44 * S}px "Montserrat", "Arial Black", sans-serif`;
ctx.fillStyle = '#ffffff';
ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
ctx.shadowBlur = 14 * S;
ctx.fillText(`${currentScoreM} M`, W * 0.5, 65 * S);

ctx.font = `700 ${20 * S}px "Montserrat", sans-serif`;
ctx.fillStyle = '#38bdf8';
ctx.fillText(`BEST: ${bestScoreM} M`, W * 0.5, 96 * S);

// Heat Thermometer Bar (Left Edge)
const barW = 24 * S;
const barH = 220 * S;
const barX = 40 * S;
const barY = H * 0.38;

ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
ctx.lineWidth = 2.5 * S;
ctx.beginPath();
ctx.roundRect(barX, barY, barW, barH, 12 * S);
ctx.fill();
ctx.stroke();

const fillRatio = Math.min(1, Math.max(0, room.state.heat / 1.5));
const fillH = barH * fillRatio;
const barGrad = ctx.createLinearGradient(0, barY + barH, 0, barY);
barGrad.addColorStop(0, '#38bdf8');
barGrad.addColorStop(0.5, '#f59e0b');
barGrad.addColorStop(1, '#ef4444');
ctx.fillStyle = barGrad;
ctx.beginPath();
ctx.roundRect(barX + 3 * S, barY + barH - fillH + 2 * S, barW - 6 * S, fillH - 4 * S, 8 * S);
ctx.fill();

ctx.textAlign = 'left';
ctx.font = `900 ${15 * S}px "Montserrat", sans-serif`;
ctx.fillStyle = '#fde047';
ctx.fillText('HEAT', barX - 4 * S, barY - 12 * S);

// Passenger Count Indicator (Right Edge)
ctx.textAlign = 'right';
ctx.font = `800 ${18 * S}px "Montserrat", sans-serif`;
ctx.fillStyle = '#e2e8f0';
const roomCountStr = `${room.people?.length ?? 1} CREW FLYING`;
ctx.fillText(roomCountStr, W - 40 * S, 60 * S);

// Game Over / Crash Announcement Screen
if (room.state.status === 'crashed') {
  ctx.textAlign = 'center';
  ctx.font = `900 ${72 * S}px "Montserrat", "Arial Black", sans-serif`;
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 24 * S;
  ctx.fillText('CRASHED!', W * 0.5, H * 0.38);

  ctx.font = `800 ${32 * S}px "Montserrat", sans-serif`;
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(`DISTANCE: ${currentScoreM} METERS`, W * 0.5, H * 0.46);

  const restartSec = Math.max(1, Math.ceil(room.state.statusTimer));
  ctx.font = `900 ${28 * S}px "Montserrat", sans-serif`;
  ctx.fillStyle = '#facc15';
  ctx.fillText(`NEXT FLIGHT IN ${restartSec}... (OR HIT BURNER)`, W * 0.5, H * 0.54);
}

// Autopilot & Attract Indicator (When Idle)
if (isAttract && room.state.status === 'playing') {
  const pulse = 0.7 + Math.sin(frame.t * 6) * 0.3;
  ctx.textAlign = 'center';
  ctx.font = `900 ${28 * S}px "Montserrat", "Arial Black", sans-serif`;
  ctx.fillStyle = `rgba(250, 204, 21, ${pulse})`;
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 12 * S;
  ctx.fillText('AUTOPILOT DEMO — TAP BURNER TO FLY!', W * 0.5, H - 55 * S);
}

ctx.restore();
ctx.restore();