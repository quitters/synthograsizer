ctx.save();

const PALETTES = {
  'Night Electric': { bg: '#03050c', field: '#07161b', accent: 195, sat: 90, beam: 'rgba(80,180,255,0.06)' },
  'Neon Cyber':     { bg: '#06020c', field: '#150621', accent: 310, sat: 95, beam: 'rgba(255,60,180,0.06)' },
  'Festival Gold':  { bg: '#060401', field: '#1c1204', accent: 42,  sat: 95, beam: 'rgba(255,180,50,0.06)' },
  'Aurora Borealis':{ bg: '#020708', field: '#041c16', accent: 155, sat: 90, beam: 'rgba(50,255,180,0.06)' }
};

const CHEERS = {
  'Low Buzz': 0.12,
  'Chanting': 0.28,
  'Roaring': 0.55
};

const pal = PALETTES[getVar('palette')] ?? PALETTES['Night Electric'];
const waveSpeed = getVar('wave_speed') ?? 1.5;
const haloSize = getVar('glow_size') ?? 3;
const cheerLevel = CHEERS[getVar('ambient_cheer')] ?? CHEERS['Chanting'];
const showBeams = getVar('floodlights') ?? true;

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.52;
const rxMax = W * 0.44;
const ryMax = H * 0.38;
const rxMin = W * 0.19;
const ryMin = H * 0.14;

// Persistent stadium geometry and simulation buffers
room.state.seats ??= [];
room.state.waves ??= [];
room.state.flashes ??= [];
room.state.flares ??= [];
room.state.lastDims ??= { w: 0, h: 0 };
room.state.autoTimer ??= 0;

// Precompute stadium seat coordinates if canvas reshaped
if (room.state.lastDims.w !== W || room.state.lastDims.h !== H || room.state.seats.length === 0) {
  room.state.lastDims.w = W;
  room.state.lastDims.h = H;
  const seats = [];
  const numRings = 28;
  for (let r = 0; r < numRings; r++) {
    const frac = r / (numRings - 1);
    const ringRx = rxMin + frac * (rxMax - rxMin);
    const ringRy = ryMin + frac * (ryMax - ryMin);
    const seatCount = Math.floor(40 + frac * 110);
    const yElevation = frac * (H * 0.09);
    for (let s = 0; s < seatCount; s++) {
      const angle = (s / seatCount) * Math.PI * 2;
      const jitter = ((s * 13 + r * 7) % 11 - 5) * 0.003;
      const finalAngle = angle + jitter;
      seats.push({
        ang: finalAngle,
        frac: frac,
        bx: cx + Math.cos(finalAngle) * ringRx,
        by: cy + Math.sin(finalAngle) * ringRy - yElevation,
        twinkle: ((s * 37 + r * 19) % 100) / 100
      });
    }
  }
  room.state.seats = seats;
}

// Resolve participant sections
const people = room.people || [];
const totalSections = Math.max(12, people.length);

function getPersonAngle(pId) {
  if (!pId || people.length === 0) return Math.random() * Math.PI * 2;
  const idx = people.findIndex(p => p.id === pId);
  if (idx === -1) return (parseInt(String(pId).slice(-3), 16) % totalSections) * ((Math.PI * 2) / totalSections);
  return (idx / totalSections) * Math.PI * 2;
}

function getPersonHue(pId) {
  const p = people.find(item => item.id === pId);
  return p ? p.hue : pal.accent;
}

// Handle interactive triggers
for (const ev of room.events) {
  if (ev.name === 'wave') {
    const origin = getPersonAngle(ev.participantId);
    const hue = getPersonHue(ev.participantId);
    // Split wave into clockwise and counterclockwise ripples
    room.state.waves.push(
      { ang: origin, dir: 1,  speed: 1.8 * waveSpeed, hue, t: 0, life: 6.0, id: Math.random() },
      { ang: origin, dir: -1, speed: 1.8 * waveSpeed, hue, t: 0, life: 6.0, id: Math.random() }
    );
  } else if (ev.name === 'flare') {
    const origin = getPersonAngle(ev.participantId);
    const hue = getPersonHue(ev.participantId);
    room.state.flares.push({ ang: origin, hue, life: 3.5, maxLife: 3.5 });
  }
}

// Ambient rhythmic waves if room is quiet
room.state.autoTimer += frame.dt;
if ((room.state.waves.length === 0 && room.state.autoTimer > 4.0) || (audio.beat && audio.bass > 0.65 && room.state.waves.length < 4)) {
  room.state.autoTimer = 0;
  const startAng = Math.random() * Math.PI * 2;
  const autoHue = (pal.accent + (Math.random() * 40 - 20) + 360) % 360;
  room.state.waves.push(
    { ang: startAng, dir: 1, speed: 1.6 * waveSpeed, hue: autoHue, t: 0, life: 5.5, id: Math.random() },
    { ang: startAng, dir: -1, speed: 1.6 * waveSpeed, hue: (autoHue + 30) % 360, t: 0, life: 5.5, id: Math.random() }
  );
}

// Advance waves & check for collisions
const waves = room.state.waves;
for (let i = 0; i < waves.length; i++) {
  const w = waves[i];
  w.ang = (w.ang + w.dir * w.speed * frame.dt + Math.PI * 4) % (Math.PI * 2);
  w.t += frame.dt;
  w.life -= frame.dt;
}

// Wave-wave collision detector
for (let i = 0; i < waves.length; i++) {
  for (let j = i + 1; j < waves.length; j++) {
    const w1 = waves[i];
    const w2 = waves[j];
    if (w1.dir !== w2.dir && w1.t > 0.3 && w2.t > 0.3) {
      let dAng = Math.abs(w1.ang - w2.ang);
      if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
      if (dAng < 0.16) {
        // Waves met! Ignite high-energy collision flash
        const flashAng = (w1.ang + w2.ang) * 0.5;
        room.state.flashes.push({
          ang: flashAng,
          hue: (w1.hue + w2.hue) * 0.5,
          intensity: 1.0,
          life: 1.2,
          maxLife: 1.2
        });
        // Reflect or dampen
        w1.life *= 0.4;
        w2.life *= 0.4;
      }
    }
  }
}

// Prune bounded lists
while (waves.length > 16) waves.shift();
room.state.waves = waves.filter(w => w.life > 0);

for (let i = 0; i < room.state.flashes.length; i++) {
  const f = room.state.flashes[i];
  f.life -= frame.dt;
  f.intensity = Math.max(0, f.life / f.maxLife);
}
room.state.flashes = room.state.flashes.filter(f => f.life > 0);
while (room.state.flashes.length > 20) room.state.flashes.shift();

for (let i = 0; i < room.state.flares.length; i++) {
  room.state.flares[i].life -= frame.dt;
}
room.state.flares = room.state.flares.filter(f => f.life > 0);
while (room.state.flares.length > 12) room.state.flares.shift();

// 1. Draw pitch and stadium darkness
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Arena field (center oval)
const pitchPulse = 1.0 + audio.bass * 0.04;
ctx.save();
ctx.beginPath();
ctx.ellipse(cx, cy, rxMin * 0.88 * pitchPulse, ryMin * 0.85 * pitchPulse, 0, 0, Math.PI * 2);
const fieldGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rxMin * 0.9);
fieldGrad.addColorStop(0, pal.field);
fieldGrad.addColorStop(0.8, '#010406');
fieldGrad.addColorStop(1, '#000000');
ctx.fillStyle = fieldGrad;
ctx.fill();
ctx.lineWidth = 1.5;
ctx.strokeStyle = `rgba(255,255,255,${0.07 + audio.mid * 0.1})`;
ctx.stroke();

// Pitch center ring
ctx.beginPath();
ctx.ellipse(cx, cy, rxMin * 0.25, ryMin * 0.25, 0, 0, Math.PI * 2);
ctx.stroke();
ctx.restore();

// 2. Volumetric roof floodlight beams
if (showBeams) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const beamCount = 6;
  for (let b = 0; b < beamCount; b++) {
    const beamAngle = (b / beamCount) * Math.PI * 2 + frame.t * 0.08;
    const bx = cx + Math.cos(beamAngle) * (rxMax * 1.08);
    const by = cy + Math.sin(beamAngle) * (ryMax * 1.08) - H * 0.12;
    const sweep = Math.sin(frame.t * 0.6 + b) * (W * 0.15);
    const grad = ctx.createLinearGradient(bx, by, cx + sweep, cy);
    grad.addColorStop(0, `hsla(${pal.accent}, 80%, 75%, ${0.25 + audio.treble * 0.3})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(cx + sweep - 50, cy + 30);
    ctx.lineTo(cx + sweep + 50, cy - 30);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// 3. Render all seats with fast batching
const seats = room.state.seats;
const activeWaves = room.state.waves;
const activeFlashes = room.state.flashes;
const activeFlares = room.state.flares;
const numWaves = activeWaves.length;
const numFlashes = activeFlashes.length;
const numFlares = activeFlares.length;
const waveWidth = 0.32;
const audioSparkle = audio.treble * 0.7;

ctx.save();
for (let i = 0; i < seats.length; i++) {
  const s = seats[i];
  let waveLift = 0;
  let waveBoost = 0;
  let seatHue = pal.accent;
  let sat = pal.sat;

  // Check active traveling waves
  for (let w = 0; w < numWaves; w++) {
    const wv = activeWaves[w];
    let d = Math.abs(s.ang - wv.ang);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < waveWidth) {
      const envelope = Math.cos((d / waveWidth) * (Math.PI * 0.5));
      if (envelope > waveBoost) {
        waveBoost = envelope;
        waveLift = envelope * (H * 0.035);
        seatHue = wv.hue;
      }
    }
  }

  // Check flares
  for (let f = 0; f < numFlares; f++) {
    const fl = activeFlares[f];
    let d = Math.abs(s.ang - fl.ang);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < 0.22) {
      const p = (1 - d / 0.22) * (fl.life / fl.maxLife);
      if (p > waveBoost) {
        waveBoost = Math.max(waveBoost, p * 1.2);
        seatHue = fl.hue;
      }
    }
  }

  // Base twinkling crowd noise
  const twinkle = Math.sin(frame.t * 3.0 + s.twinkle * 18.0);
  const ambientLit = cheerLevel * (0.4 + 0.6 * s.twinkle) + audioSparkle * (twinkle > 0.6 ? 0.4 : 0.0);
  const totalBrightness = Math.min(1.0, ambientLit + waveBoost * 1.5);

  if (totalBrightness < 0.05) continue;

  const drawX = s.bx;
  const drawY = s.by - waveLift;
  const isHot = waveBoost > 0.65;
  const lightness = isHot ? 88 : (25 + totalBrightness * 45);
  const alpha = 0.25 + totalBrightness * 0.75;
  const dotSize = (1.0 + s.frac * 1.6 + (isHot ? 1.4 : 0)) * (haloSize / 3);

  ctx.fillStyle = `hsla(${seatHue}, ${sat}%, ${lightness}%, ${alpha})`;
  ctx.fillRect(drawX - dotSize * 0.5, drawY - dotSize * 0.5, dotSize, dotSize);
}
ctx.restore();

// 4. Render collision flashes & shockwaves
if (numFlashes > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < numFlashes; i++) {
    const f = activeFlashes[i];
    const progress = 1.0 - (f.life / f.maxLife);
    const midR = (rxMin + rxMax) * 0.5;
    const fx = cx + Math.cos(f.ang) * midR;
    const fy = cy + Math.sin(f.ang) * (midR * 0.75) - H * 0.05;
    const burstRadius = (progress * 130 + 10);

    // Expanding pillar of stadium spark
    const burstGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, burstRadius);
    burstGrad.addColorStop(0, `hsla(0, 0%, 100%, ${f.intensity})`);
    burstGrad.addColorStop(0.35, `hsla(${f.hue}, 100%, 70%, ${f.intensity * 0.8})`);
    burstGrad.addColorStop(1, `hsla(${f.hue}, 90%, 50%, 0)`);
    ctx.fillStyle = burstGrad;
    ctx.beginPath();
    ctx.arc(fx, fy, burstRadius, 0, Math.PI * 2);
    ctx.fill();

    // Vertical light spire pointing into the sky
    ctx.fillStyle = `hsla(${f.hue}, 90%, 90%, ${f.intensity * 0.4})`;
    ctx.fillRect(fx - 2, 0, 4, fy);
  }
  ctx.restore();
}

// 5. Participant Section Markers along outer rim
ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (let pIdx = 0; pIdx < people.length; pIdx++) {
  const p = people[pIdx];
  const pAng = (pIdx / totalSections) * Math.PI * 2;
  const px = cx + Math.cos(pAng) * (rxMax * 1.03);
  const py = cy + Math.sin(pAng) * (ryMax * 1.03) - H * 0.08;
  ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${0.5 + Math.sin(frame.t * 2 + pIdx) * 0.3})`;
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

ctx.restore();