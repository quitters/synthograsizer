ctx.save();
const W = frame.width, H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Init persistent state
room.state.lanterns ??= [];
room.state.particles ??= [];
room.state.ripples ??= [];
room.state.score ??= 0;
room.state.targetScore ??= 7;
room.state.lastPassTime ??= t;
room.state.lastSpawnTime ??= t;
room.state.winTime ??= -999;
room.state.stationFlash ??= [];

const mountainStyle = getVar('mountain_style') || 'craggy';
const skyStyle = getVar('night_sky') || 'aurora';
const speedMult = getVar('lantern_speed') ?? 1.25;
const beaconMult = getVar('beacon_burst') ?? 3;
const showTrails = getVar('trail_glow') ?? true;

// Determine active relay stations from room.people
const people = (room.people && room.people.length > 0) ? room.people : [
  { id: 'wanderer-1', hue: 42, table: 'base' },
  { id: 'wanderer-2', hue: 175, table: 'mid' },
  { id: 'wanderer-3', hue: 310, table: 'ridge' }
];
const numStations = Math.max(2, Math.min(people.length, 36));

// Ensure station flash tracking
while (room.state.stationFlash.length < numStations) {
  room.state.stationFlash.push(0);
}
if (room.state.stationFlash.length > numStations) {
  room.state.stationFlash.length = numStations;
}

// Path generation: S-curve switchbacks ascending from bottom-left to top-right summit
function getPathPos(s) {
  const clamped = Math.max(0, Math.min(1, s));
  const px = W * (0.12 + 0.74 * clamped + 0.08 * Math.sin(clamped * Math.PI * 3.5));
  const py = H * (0.84 - 0.66 * Math.pow(clamped, 0.88) + 0.04 * Math.cos(clamped * Math.PI * 4));
  return { x: px, y: py };
}

// 1. SKY & MOUNTAIN BACKGROUND
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
if (skyStyle === 'aurora') {
  bgGrad.addColorStop(0, '#040b16');
  bgGrad.addColorStop(0.5, '#071b26');
  bgGrad.addColorStop(1, '#02050b');
} else if (skyStyle === 'deep_violet') {
  bgGrad.addColorStop(0, '#0d041a');
  bgGrad.addColorStop(0.5, '#16092e');
  bgGrad.addColorStop(1, '#04020a');
} else {
  bgGrad.addColorStop(0, '#03050c');
  bgGrad.addColorStop(0.5, '#090e1c');
  bgGrad.addColorStop(1, '#020306');
}
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Aurora ribbons if selected
if (skyStyle === 'aurora') {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let a = 0; a < 3; a++) {
    ctx.beginPath();
    const aHue = (140 + a * 45 + t * 8) % 360;
    ctx.fillStyle = `hsla(${aHue}, 80%, 45%, ${0.08 + audio.mid * 0.08})`;
    ctx.moveTo(0, H * 0.15);
    for (let x = 0; x <= W; x += 60) {
      const wave = Math.sin(x * 0.003 + t * 0.7 + a) * 45 + Math.cos(x * 0.006 - t * 0.5) * 30;
      ctx.lineTo(x, H * (0.12 + a * 0.07) + wave);
    }
    ctx.lineTo(W, 0);
    ctx.lineTo(0, 0);
    ctx.fill();
  }
  ctx.restore();
}

// Distant Stars
ctx.save();
for (let i = 0; i < 40; i++) {
  const sx = ((i * 197.3) % W);
  const sy = ((i * 123.7) % (H * 0.55));
  const twinkle = (Math.sin(t * 2.5 + i * 1.7) * 0.5 + 0.5) * (0.4 + audio.treble * 0.6);
  ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.75})`;
  ctx.fillRect(sx, sy, 2, 2);
}
ctx.restore();

// Parallax mountain silhouettes
function drawMountainLayer(offsetY, peakFreq, roughness, color) {
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 25) {
    let my = offsetY;
    if (mountainStyle === 'craggy') {
      my += Math.sin(x * peakFreq) * roughness + Math.abs(Math.sin(x * peakFreq * 2.3)) * (roughness * 0.6);
    } else if (mountainStyle === 'volcanic') {
      const distToSummit = Math.abs(x - W * 0.88);
      my += (distToSummit * 0.5) - Math.cos(x * 0.004) * roughness * 0.5;
    } else {
      my += Math.sin(x * peakFreq) * roughness;
    }
    ctx.lineTo(x, my);
  }
  ctx.lineTo(W, H);
  ctx.fillStyle = color;
  ctx.fill();
}
drawMountainLayer(H * 0.52, 0.0025, 120, '#0a1020');
drawMountainLayer(H * 0.64, 0.004, 80, '#0e182a');
drawMountainLayer(H * 0.76, 0.006, 60, '#070b13');

// Draw glowing path line
ctx.save();
ctx.beginPath();
for (let s = 0; s <= 1.01; s += 0.02) {
  const p = getPathPos(s);
  if (s === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
}
ctx.lineWidth = 5 + audio.bass * 4;
ctx.strokeStyle = 'rgba(255, 180, 70, 0.25)';
ctx.stroke();
if (showTrails) {
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255, 140, 30, 0.08)';
  ctx.stroke();
}
ctx.restore();

// Check victory celebration state
const isCelebrating = (t - room.state.winTime) < 4.5;
if (isCelebrating) {
  if (t - room.state.winTime > 4.2 && room.state.score >= room.state.targetScore) {
    room.state.score = 0;
    room.state.lanterns = [];
  }
}

// 2. EVENTS PROCESSING
let passTriggered = false;
let triggerStationIdx = -1;
for (const e of (room.events || [])) {
  if (e.name === 'pass') {
    passTriggered = true;
    room.state.lastPassTime = t;
    const pIdx = people.findIndex(p => p.id === e.participantId);
    if (pIdx !== -1) triggerStationIdx = pIdx % numStations;
  } else if (e.name === 'ignite') {
    const pIdx = people.findIndex(p => p.id === e.participantId);
    const stIdx = pIdx !== -1 ? (pIdx % numStations) : Math.floor(Math.random() * numStations);
    const stPos = getPathPos(0.08 + (stIdx / (numStations + 0.2)) * 0.82);
    for (let k = 0; k < 12; k++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      room.state.particles.push({
        x: stPos.x, y: stPos.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 30,
        hue: people[stIdx].hue || 45,
        life: 0.8 + Math.random() * 0.5,
        t0: t
      });
    }
  }
}

// Attract mode: Auto-pass if inactive for 3.2s
if (!isCelebrating && (t - room.state.lastPassTime > 3.2)) {
  passTriggered = true;
  room.state.lastPassTime = t;
}

// Handle lantern passing
if (passTriggered && !isCelebrating) {
  let passedAny = false;
  for (const l of room.state.lanterns) {
    if (l.state === 'held') {
      if (triggerStationIdx === -1 || l.station === triggerStationIdx || Math.random() < 0.35) {
        l.state = 'moving';
        l.targetStation = l.station + 1;
        room.state.stationFlash[l.station] = t;
        const pos = getPathPos(0.08 + (l.station / (numStations + 0.2)) * 0.82);
        room.state.ripples.push({ x: pos.x, y: pos.y, t0: t, hue: l.hue });
        passedAny = true;
        if (triggerStationIdx !== -1) break;
      }
    }
  }
  // If no lantern was waiting, spawn one at base!
  if (!passedAny && room.state.lanterns.length < 4) {
    const p0 = people[0];
    room.state.lanterns.push({
      station: 0,
      s: 0.08,
      state: 'held',
      hue: p0.hue || 45,
      glow: 1.0
    });
    room.state.stationFlash[0] = t;
  }
}

// Base auto-spawns lantern if station 0 is empty and few on mountain
if (!isCelebrating && room.state.lanterns.length < 3 && (t - room.state.lastSpawnTime > 2.5)) {
  const hasAtZero = room.state.lanterns.some(l => l.station === 0 && l.state === 'held');
  if (!hasAtZero) {
    room.state.lanterns.push({
      station: 0,
      s: 0.08,
      state: 'held',
      hue: people[0].hue || 45,
      glow: 1.0
    });
    room.state.lastSpawnTime = t;
    room.state.stationFlash[0] = t;
  }
}

// 3. UPDATE LANTERNS & STATIONS
const baseSpeed = 0.55 * speedMult;
for (let i = room.state.lanterns.length - 1; i >= 0; i--) {
  const l = room.state.lanterns[i];
  if (l.state === 'moving') {
    const targetS = 0.08 + (l.targetStation / (numStations + 0.2)) * 0.82;
    l.s += baseSpeed * dt;
    // Trail embers
    if (Math.random() < 0.4) {
      const curPos = getPathPos(l.s);
      room.state.particles.push({
        x: curPos.x + (Math.random() - 0.5) * 10,
        y: curPos.y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 30,
        vy: -20 - Math.random() * 40,
        hue: l.hue,
        life: 0.5 + Math.random() * 0.4,
        t0: t
      });
    }
    if (l.s >= targetS) {
      l.s = targetS;
      l.station = l.targetStation;
      if (l.station >= numStations) {
        // Reached summit!
        room.state.score++;
        room.state.lanterns.splice(i, 1);
        const sumPos = getPathPos(0.98);
        room.state.ripples.push({ x: sumPos.x, y: sumPos.y, t0: t, hue: 50, big: true });
        // Beacon burst particles
        const burstCount = 28 * beaconMult;
        for (let b = 0; b < burstCount; b++) {
          const ang = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.8;
          const spd = 90 + Math.random() * 220 * beaconMult * 0.5;
          room.state.particles.push({
            x: sumPos.x,
            y: sumPos.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            hue: (35 + Math.random() * 40) % 360,
            life: 1.0 + Math.random() * 1.2,
            t0: t
          });
        }
        if (room.state.score >= room.state.targetScore) {
          room.state.winTime = t;
        }
      } else {
        // Held at next station
        l.state = 'held';
        l.hue = people[l.station % people.length].hue;
        room.state.stationFlash[l.station] = t;
      }
    }
  } else {
    l.s = 0.08 + (l.station / (numStations + 0.2)) * 0.82;
  }
}

// 4. DRAW SUMMIT BEACON
const sumPos = getPathPos(0.98);
ctx.save();
// Spire / Brazier
ctx.fillStyle = '#121926';
ctx.beginPath();
ctx.moveTo(sumPos.x - 22, sumPos.y + 24);
ctx.lineTo(sumPos.x + 22, sumPos.y + 24);
ctx.lineTo(sumPos.x + 14, sumPos.y - 12);
ctx.lineTo(sumPos.x - 14, sumPos.y - 12);
ctx.closePath();
ctx.fill();

// Beacon fire
const beaconPower = (room.state.score / room.state.targetScore) + (audio.bass * 0.4) + (isCelebrating ? 1.5 : 0);
const beaconRadius = Math.max(16, 26 + beaconPower * 28);
const bGrad = ctx.createRadialGradient(sumPos.x, sumPos.y - 16, 4, sumPos.x, sumPos.y - 16, beaconRadius);
bGrad.addColorStop(0, '#ffffff');
bGrad.addColorStop(0.3, '#ffcc44');
bGrad.addColorStop(0.7, '#ff5500');
bGrad.addColorStop(1, 'rgba(255, 60, 0, 0)');
ctx.fillStyle = bGrad;
ctx.beginPath();
ctx.arc(sumPos.x, sumPos.y - 16, beaconRadius, 0, Math.PI * 2);
ctx.fill();

// Sky pillar beam from summit
ctx.save();
ctx.globalCompositeOperation = 'screen';
const beamAlpha = Math.min(0.65, 0.15 + (room.state.score / room.state.targetScore) * 0.4 + audio.treble * 0.2);
const beamW = 18 + beaconPower * 8;
const beamGrad = ctx.createLinearGradient(sumPos.x - beamW, 0, sumPos.x + beamW, 0);
beamGrad.addColorStop(0, 'rgba(255, 200, 80, 0)');
beamGrad.addColorStop(0.5, `rgba(255, 240, 150, ${beamAlpha})`);
beamGrad.addColorStop(1, 'rgba(255, 200, 80, 0)');
ctx.fillStyle = beamGrad;
ctx.fillRect(sumPos.x - beamW, 0, beamW * 2, sumPos.y - 12);
ctx.restore();
ctx.restore();

// 5. DRAW STATION FIGURES (THE PLAYERS)
for (let i = 0; i < numStations; i++) {
  const p = people[i % people.length];
  const sPos = getPathPos(0.08 + (i / (numStations + 0.2)) * 0.82);
  const flashAge = t - (room.state.stationFlash[i] || 0);
  const isFlashing = flashAge < 0.4;
  const scale = 1.0 + (isFlashing ? Math.sin(flashAge * Math.PI / 0.4) * 0.35 : 0) + audio.beat * 0.08;
  const pHue = p.hue ?? (i * (360 / numStations));

  ctx.save();
  ctx.translate(sPos.x, sPos.y);
  ctx.scale(scale, scale);

  // Player aura / stand glow
  const standGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
  standGrad.addColorStop(0, `hsla(${pHue}, 90%, 65%, 0.5)`);
  standGrad.addColorStop(1, `hsla(${pHue}, 90%, 50%, 0)`);
  ctx.fillStyle = standGrad;
  ctx.beginPath();
  ctx.ellipse(0, 8, 26, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Traveler figure: cloaked silhouette with bright trim
  ctx.fillStyle = '#060a12';
  ctx.beginPath();
  ctx.moveTo(-9, 10);
  ctx.lineTo(9, 10);
  ctx.lineTo(6, -14);
  ctx.lineTo(-6, -14);
  ctx.closePath();
  ctx.fill();

  // Glowing traveler hood/crest
  ctx.fillStyle = `hsl(${pHue}, 90%, 60%)`;
  ctx.beginPath();
  ctx.arc(0, -18, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // Staff with crystal
  ctx.strokeStyle = '#c8d6e5';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(11, 10);
  ctx.lineTo(11, -26);
  ctx.stroke();

  ctx.fillStyle = `hsl(${pHue}, 100%, 75%)`;
  ctx.beginPath();
  ctx.arc(11, -27, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Indicator if holding a lantern
  const isHolding = room.state.lanterns.some(l => l.station === i && l.state === 'held');
  if (isHolding) {
    const pulse = 1 + Math.sin(t * 8) * 0.2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PASS!', 0, -38);
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.strokeText('PASS!', 0, -38);
  }
  ctx.restore();
}

// 6. DRAW LANTERNS IN MOTION & AT STATIONS
for (const l of room.state.lanterns) {
  const lPos = getPathPos(l.s);
  const bob = Math.sin(t * 6 + l.s * 20) * 3;
  const rad = (l.state === 'moving' ? 14 : 11) + audio.mid * 5;

  ctx.save();
  ctx.translate(lPos.x, lPos.y - 14 + bob);

  // Outer radial light
  const radGrad = ctx.createRadialGradient(0, 0, rad * 0.3, 0, 0, rad * 2.8);
  radGrad.addColorStop(0, `hsla(${l.hue}, 100%, 75%, 0.8)`);
  radGrad.addColorStop(0.4, `hsla(${l.hue}, 100%, 55%, 0.3)`);
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radGrad;
  ctx.beginPath();
  ctx.arc(0, 0, rad * 2.8, 0, Math.PI * 2);
  ctx.fill();

  // Lantern body
  ctx.fillStyle = `hsl(${l.hue}, 100%, 65%)`;
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fill();

  // White hot core
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 7. PARTICLES & EXPANDING RIPPLES
// Update & draw ripples
for (let i = room.state.ripples.length - 1; i >= 0; i--) {
  const r = room.state.ripples[i];
  const age = t - r.t0;
  const maxLife = r.big ? 1.0 : 0.6;
  if (age > maxLife) {
    room.state.ripples.splice(i, 1);
    continue;
  }
  const progress = age / maxLife;
  const maxRadius = r.big ? 140 : 55;
  ctx.save();
  ctx.beginPath();
  ctx.arc(r.x, r.y, progress * maxRadius, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${r.hue}, 100%, 70%, ${(1 - progress) * 0.8})`;
  ctx.lineWidth = 4 * (1 - progress);
  ctx.stroke();
  ctx.restore();
}

// Update & draw particles
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  const age = t - p.t0;
  if (age > p.life) {
    room.state.particles.splice(i, 1);
    continue;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += 80 * dt; // slight gravity
  const alpha = 1 - (age / p.life);
  ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.5 * alpha, 0, Math.PI * 2);
  ctx.fill();
}
// Cap bounded particle count
if (room.state.particles.length > 180) {
  room.state.particles.splice(0, room.state.particles.length - 180);
}

// 8. BOLD PARTY HUD (Legible from far away across the room)
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'top';

if (isCelebrating) {
  // Giant Winner Banner
  const flash = Math.sin(t * 12) * 0.5 + 0.5;
  ctx.font = '900 68px Impact, system-ui, sans-serif';
  ctx.fillStyle = flash > 0.5 ? '#ffffff' : '#ffd700';
  ctx.shadowColor = '#ff6600';
  ctx.shadowBlur = 24;
  ctx.fillText('SUMMIT IGNITED!', W * 0.5, H * 0.12);
  ctx.font = '800 32px system-ui, sans-serif';
  ctx.fillStyle = '#ffeedd';
  ctx.fillText('GREAT RELAY! NEXT ROUND STARTING...', W * 0.5, H * 0.21);
} else {
  // Round Progress
  ctx.font = '900 48px Impact, system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 10;
  ctx.fillText(`BEACONS: ${room.state.score} / ${room.state.targetScore}`, W * 0.5, H * 0.05);

  // Subtitle / Instruction
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = '#ffbe3b';
  ctx.shadowBlur = 6;
  const anyHeld = room.state.lanterns.some(l => l.state === 'held');
  const promptMsg = anyHeld ? 'TAP PASS TO HAND THE LANTERN UP!' : 'KEEP THE FLAME CLIMBING!';
  ctx.fillText(promptMsg, W * 0.5, H * 0.05 + 56);

  // Station count indicator
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText(`${numStations} HIKERS ON THE MOUNTAIN`, W * 0.5, H * 0.05 + 86);
}
ctx.restore();

ctx.restore();