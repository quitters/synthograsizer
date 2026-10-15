ctx.save();
const W = frame.width;
const H = frame.height;
const S = Math.max(0.65, Math.min(W / 1920, H / 1080));

// --- State Persistence ---
room.state.boats ??= [
  { dist: 0, vel: 0, strokeAnim: 0, strokes: [] },
  { dist: 0, vel: 0, strokeAnim: 0, strokes: [] }
];
room.state.scores ??= [0, 0];
room.state.winner ??= -1;
room.state.winTimer ??= 0;
room.state.roundCount ??= 1;
room.state.lastInputTime ??= frame.t - 10;
room.state.attractTimer ??= 0;
room.state.wakes ??= [];
room.state.splashes ??= [];
room.state.popups ??= [];
room.state.startBannerTimer ??= 3.0;

// --- Team Assignment Helper ---
const people = room.people || [];
function getTeam(pId) {
  if (!people || people.length === 0) {
    let h = 0;
    for (let i = 0; i < (pId || '').length; i++) h = (h * 31 + pId.charCodeAt(i)) | 0;
    return Math.abs(h) % 2;
  }
  const tables = [...new Set(people.map(p => p.table).filter(Boolean))].sort();
  const person = people.find(p => p.id === pId);
  if (tables.length > 1 && person && person.table) {
    const tidx = tables.indexOf(person.table);
    return (tidx >= 0 ? tidx : 0) % 2;
  }
  if (person) {
    const pidx = people.indexOf(person);
    return (pidx >= 0 ? pidx : 0) % 2;
  }
  let h = 0;
  for (let i = 0; i < (pId || '').length; i++) h = (h * 31 + pId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2;
}

const teamMembers = [[], []];
for (let i = 0; i < people.length; i++) {
  const p = people[i];
  teamMembers[getTeam(p.id)].push(p);
}

// --- Variable Controls ---
const mood = getVar('dawn_mood') ?? 'Amber Dawn';
const targetDist = getVar('race_distance') ?? 1000;
const syncMap = { Generous: 0.44, 'Tempo Match': 0.28, 'Razor Sync': 0.16 };
const syncWindow = syncMap[getVar('sync_strictness')] ?? 0.28;
const fogDensity = getVar('fog_density') ?? 0.6;
const reflections = getVar('water_reflections') ?? true;

const laneStartX = W * 0.16;
const laneFinishX = W * 0.82;
const laneY0 = H * 0.46;
const laneY1 = H * 0.70;

// --- Event Processing ---
const events = room.events || [];
for (let i = 0; i < events.length; i++) {
  const e = events[i];
  if (e.name === 'stroke') {
    room.state.lastInputTime = frame.t;
    const tIdx = getTeam(e.participantId);
    const boat = room.state.boats[tIdx];
    const now = frame.t;

    boat.strokes = boat.strokes.filter(st => now - st.t < 1.2);
    const partners = boat.strokes.filter(st => now - st.t <= syncWindow && st.pId !== e.participantId);
    let synergy = 1.0;
    let popupText = 'STROKE!';

    if (partners.length > 0) {
      const combo = partners.length + 1;
      synergy = 1.0 + partners.length * 1.15;
      popupText = combo >= 4 ? `QUAD SYNC! x${combo}` : combo === 3 ? 'TRIPLE SYNC! x3' : 'PERFECT SYNC! x2';
    } else if (teamMembers[tIdx].length <= 1 && boat.strokes.length > 0) {
      const prevT = boat.strokes[boat.strokes.length - 1].t;
      const delta = now - prevT;
      if (delta >= 0.55 && delta <= 0.95) {
        synergy = 1.6;
        popupText = 'RHYTHM CADENCE! +60%';
      }
    }

    boat.strokes.push({ t: now, pId: e.participantId });
    if (boat.strokes.length > 20) boat.strokes.shift();

    boat.vel += 52 * synergy;
    boat.strokeAnim = 1.0;

    const person = people.find(p => p.id === e.participantId);
    const rowerHue = person ? person.hue : tIdx === 0 ? 38 : 190;
    const boatProgress = Math.min(1, boat.dist / targetDist);
    const bx = laneStartX + (laneFinishX - laneStartX) * boatProgress;
    const by = tIdx === 0 ? laneY0 : laneY1;

    if (room.state.popups.length < 16) {
      room.state.popups.push({
        text: popupText,
        x: bx,
        y: by - 52 * S,
        hue: rowerHue,
        scale: synergy > 1.8 ? 1.4 : synergy > 1.2 ? 1.15 : 0.95,
        life: 1.0
      });
    }

    const splashN = Math.floor(10 * Math.min(2.5, synergy));
    for (let k = 0; k < splashN && room.state.splashes.length < 160; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      room.state.splashes.push({
        x: bx + (Math.random() - 0.5) * 80 * S,
        y: by + side * (32 + Math.random() * 26) * S,
        vx: (Math.random() - 0.7) * 110 * S,
        vy: side * (35 + Math.random() * 90) * S * (1 + (audio ? audio.bass * 0.8 : 0)),
        hue: rowerHue,
        size: (3.5 + Math.random() * 4.5) * S,
        life: 1.0,
        decay: 1.6 + Math.random() * 1.4
      });
    }
  }
}

// --- Attract Mode ---
const isAttract = frame.t - room.state.lastInputTime > 3.6;
if (isAttract && room.state.winner === -1) {
  room.state.attractTimer += frame.dt;
  const beatGap = 0.85 - (audio ? audio.level * 0.22 : 0);
  if (room.state.attractTimer >= beatGap) {
    room.state.attractTimer = 0;
    for (let b = 0; b < 2; b++) {
      const boat = room.state.boats[b];
      const synced = Math.random() < 0.65;
      const syn = synced ? 1.85 : 1.1;
      boat.vel += 46 * syn;
      boat.strokeAnim = 1.0;
      const bp = Math.min(1, boat.dist / targetDist);
      const bx = laneStartX + (laneFinishX - laneStartX) * bp;
      const by = b === 0 ? laneY0 : laneY1;
      const bHue = b === 0 ? 38 : 190;
      if (synced && room.state.popups.length < 16 && Math.random() < 0.5) {
        room.state.popups.push({
          text: 'AI COMBO x2',
          x: bx,
          y: by - 52 * S,
          hue: bHue,
          scale: 1.05,
          life: 0.85
        });
      }
    }
  }
}

// --- Physics & Round Lifecycle ---
for (let b = 0; b < 2; b++) {
  const boat = room.state.boats[b];
  boat.vel *= Math.pow(0.58, frame.dt * 60);
  if (audio && audio.beat) boat.vel += 1.5;
  boat.dist += boat.vel * frame.dt;
  if (boat.strokeAnim > 0) {
    boat.strokeAnim = Math.max(0, boat.strokeAnim - frame.dt * 2.3);
  }
  if (boat.dist >= targetDist && room.state.winner === -1) {
    room.state.winner = b;
    room.state.winTimer = 0;
    room.state.scores[b]++;
    for (let k = 0; k < 60 && room.state.splashes.length < 180; k++) {
      room.state.splashes.push({
        x: laneFinishX + (Math.random() - 0.5) * 90 * S,
        y: (b === 0 ? laneY0 : laneY1) + (Math.random() - 0.5) * 110 * S,
        vx: (Math.random() - 0.5) * 280 * S,
        vy: (Math.random() - 0.5) * 280 * S,
        hue: b === 0 ? 35 + Math.random() * 35 : 180 + Math.random() * 45,
        size: (4 + Math.random() * 7) * S,
        life: 1.0,
        decay: 0.8 + Math.random() * 0.7
      });
    }
  }
}

if (room.state.winner !== -1) {
  room.state.winTimer += frame.dt;
  if (room.state.winTimer > 4.6) {
    room.state.winner = -1;
    room.state.boats[0].dist = 0;
    room.state.boats[0].vel = 0;
    room.state.boats[1].dist = 0;
    room.state.boats[1].vel = 0;
    room.state.roundCount++;
    room.state.startBannerTimer = 2.6;
  }
}
if (room.state.startBannerTimer > 0) {
  room.state.startBannerTimer -= frame.dt;
}

// --- Palettes ---
const palettes = {
  'Amber Dawn': { sky0: '#130722', sky1: '#541c39', sky2: '#c95932', water0: '#0c0715', water1: '#261226', mist: '235, 130, 75' },
  'Violet Mist': { sky0: '#0a061c', sky1: '#3d144c', sky2: '#963f78', water0: '#080413', water1: '#1f0f29', mist: '190, 110, 210' },
  'Electric Teal': { sky0: '#040d16', sky1: '#0b2f42', sky2: '#16767c', water0: '#03080e', water1: '#0d222e', mist: '55, 205, 185' },
  'Midnight Phosphor': { sky0: '#050711', sky1: '#151d38', sky2: '#3e4f87', water0: '#04060d', water1: '#10162a', mist: '115, 135, 235' }
};
const pal = palettes[mood] ?? palettes['Amber Dawn'];

// --- Draw Background & Dawn Sky ---
const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.38);
skyGrad.addColorStop(0, pal.sky0);
skyGrad.addColorStop(0.65, pal.sky1);
skyGrad.addColorStop(1, pal.sky2);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// Sun Glow
const sunY = H * 0.36;
const sunX = W * 0.65;
const sunPulse = 1 + (audio ? audio.mid * 0.35 : 0);
const sunGrad = ctx.createRadialGradient(sunX, sunY, 10 * S, sunX, sunY, 180 * S * sunPulse);
sunGrad.addColorStop(0, 'rgba(255, 240, 200, 0.9)');
sunGrad.addColorStop(0.35, 'rgba(255, 180, 100, 0.4)');
sunGrad.addColorStop(1, 'rgba(255, 100, 50, 0)');
ctx.fillStyle = sunGrad;
ctx.beginPath();
ctx.arc(sunX, sunY, 180 * S * sunPulse, 0, Math.PI * 2);
ctx.fill();

// Distant Riverbank Silhouettes
ctx.fillStyle = '#080511';
ctx.beginPath();
ctx.moveTo(0, H * 0.36);
for (let x = 0; x <= W; x += 30 * S) {
  const h = Math.sin(x * 0.003 + 1.2) * 22 * S + Math.sin(x * 0.008) * 12 * S;
  ctx.lineTo(x, H * 0.35 - h);
}
ctx.lineTo(W, H * 0.38);
ctx.lineTo(0, H * 0.38);
ctx.fill();

// Distant Pines
ctx.fillStyle = '#05030b';
for (let px = 20 * S; px < W; px += 45 * S) {
  const ph = 18 * S + (px * 37 % 24) * S;
  const py = H * 0.355;
  ctx.beginPath();
  ctx.moveTo(px, py - ph);
  ctx.lineTo(px + 7 * S, py);
  ctx.lineTo(px - 7 * S, py);
  ctx.fill();
}

// --- River Water Surface ---
const waterGrad = ctx.createLinearGradient(0, H * 0.36, 0, H);
waterGrad.addColorStop(0, pal.water1);
waterGrad.addColorStop(0.35, pal.water0);
waterGrad.addColorStop(1, '#020306');
ctx.fillStyle = waterGrad;
ctx.fillRect(0, H * 0.36, W, H - H * 0.36);

// Water Surface Ripple Streaks
ctx.lineWidth = 1.5 * S;
for (let y = H * 0.38; y < H; y += 22 * S) {
  const drift = (frame.t * 40 + y * 7) % (W + 200) - 100;
  const wave = Math.sin(frame.t * 2 + y * 0.08) * 4 * S;
  ctx.strokeStyle = `rgba(${pal.mist}, ${0.08 + (audio ? audio.level * 0.08 : 0)})`;
  ctx.beginPath();
  ctx.moveTo(drift - 80 * S, y + wave);
  ctx.lineTo(drift + 120 * S, y + wave);
  ctx.stroke();
}

// Lane Divider Buoys
const dividerY = H * 0.58;
ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
for (let bx = W * 0.12; bx <= laneFinishX + 40 * S; bx += 55 * S) {
  const bob = Math.sin(frame.t * 3.2 + bx * 0.03) * 2.8 * S;
  ctx.beginPath();
  ctx.arc(bx, dividerY + bob, 3.5 * S, 0, Math.PI * 2);
  ctx.fill();
}

// --- Finish Line & Flags ---
const fX = laneFinishX;
ctx.save();
ctx.setLineDash([8 * S, 6 * S]);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
ctx.lineWidth = 3.5 * S;
ctx.beginPath();
ctx.moveTo(fX, H * 0.38);
ctx.lineTo(fX, H * 0.82);
ctx.stroke();
ctx.restore();

// Checkered finish buoys with flags
const flagYs = [H * 0.40, dividerY, H * 0.78];
for (let fi = 0; fi < flagYs.length; fi++) {
  const fy = flagYs[fi];
  ctx.fillStyle = '#ff8800';
  ctx.beginPath();
  ctx.arc(fX, fy, 7 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2 * S;
  ctx.stroke();
  ctx.strokeStyle = '#ddd';
  ctx.beginPath();
  ctx.moveTo(fX, fy);
  ctx.lineTo(fX, fy - 28 * S);
  ctx.stroke();
  const wave = Math.sin(frame.t * 6 + fi * 1.5) * 6 * S;
  ctx.fillStyle = fi % 2 === 0 ? '#ffea00' : '#00e5ff';
  ctx.beginPath();
  ctx.moveTo(fX, fy - 28 * S);
  ctx.lineTo(fX + 18 * S + wave, fy - 22 * S);
  ctx.lineTo(fX, fy - 16 * S);
  ctx.fill();
}

// Finish Beacon Text
ctx.font = `900 ${Math.floor(18 * S)}px Impact, "Arial Black", sans-serif`;
ctx.textAlign = 'center';
ctx.fillStyle = '#ffea00';
ctx.fillText('FINISH', fX, H * 0.355);

// --- Wakes Behind Boats ---
for (let b = 0; b < 2; b++) {
  const boat = room.state.boats[b];
  const bp = Math.min(1, boat.dist / targetDist);
  const bx = laneStartX + (laneFinishX - laneStartX) * bp;
  const by = b === 0 ? laneY0 : laneY1;
  if (Math.random() < 0.5) {
    room.state.wakes.push({
      x: bx - 130 * S,
      y: by,
      r: 4 * S,
      spread: 2 * S,
      alpha: 0.55,
      team: b
    });
  }
}
if (room.state.wakes.length > 70) room.state.wakes.splice(0, room.state.wakes.length - 70);

for (let i = room.state.wakes.length - 1; i >= 0; i--) {
  const w = room.state.wakes[i];
  w.r += 32 * S * frame.dt;
  w.spread += 18 * S * frame.dt;
  w.alpha -= frame.dt * 0.42;
  if (w.alpha <= 0) {
    room.state.wakes.splice(i, 1);
    continue;
  }
  const hue = w.team === 0 ? 38 : 190;
  ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${w.alpha})`;
  ctx.lineWidth = 1.8 * S;
  ctx.beginPath();
  ctx.moveTo(w.x - w.r * 0.7, w.y - w.spread);
  ctx.lineTo(w.x, w.y);
  ctx.lineTo(w.x - w.r * 0.7, w.y + w.spread);
  ctx.stroke();
}

// --- Water Reflections (Toggle) ---
if (reflections) {
  ctx.save();
  for (let b = 0; b < 2; b++) {
    const bp = Math.min(1, room.state.boats[b].dist / targetDist);
    const bx = laneStartX + (laneFinishX - laneStartX) * bp;
    const by = (b === 0 ? laneY0 : laneY1) + 14 * S;
    const rColor = b === 0 ? 'rgba(255, 140, 0, 0.22)' : 'rgba(0, 220, 255, 0.22)';
    ctx.fillStyle = rColor;
    for (let rx = -90 * S; rx <= 90 * S; rx += 14 * S) {
      const jx = rx + Math.sin(frame.t * 5 + rx) * 6 * S;
      const jy = by + Math.abs(rx) * 0.12;
      ctx.fillRect(bx + jx, jy, 16 * S, 3.5 * S);
    }
  }
  ctx.restore();
}

// --- Draw Boats & Crews ---
function drawBoat(bIdx, by) {
  const boat = room.state.boats[bIdx];
  const progress = Math.min(1, boat.dist / targetDist);
  const bx = laneStartX + (laneFinishX - laneStartX) * progress;
  const members = teamMembers[bIdx];
  const primary = bIdx === 0 ? '#ff9d00' : '#00e5ff';
  const glow = bIdx === 0 ? '#ff5500' : '#0077ff';

  ctx.save();
  const pitch = Math.sin(frame.t * 4.5 + bIdx) * 1.5 * S;
  ctx.translate(bx, by + pitch);

  const length = 270 * S;
  const width = 22 * S;

  // Hull Body
  ctx.beginPath();
  ctx.moveTo(length * 0.48, 0);
  ctx.bezierCurveTo(length * 0.25, -width * 0.5, -length * 0.25, -width * 0.55, -length * 0.5, -width * 0.2);
  ctx.lineTo(-length * 0.52, 0);
  ctx.lineTo(-length * 0.5, width * 0.2);
  ctx.bezierCurveTo(-length * 0.25, width * 0.55, length * 0.25, width * 0.5, length * 0.48, 0);
  ctx.closePath();

  ctx.fillStyle = '#181b24';
  ctx.fill();
  ctx.lineWidth = 3.2 * S;
  ctx.strokeStyle = primary;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 10 * S;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Bow ball & Racing stripe
  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.arc(length * 0.48, 0, 4.5 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(-length * 0.46, 0);
  ctx.lineTo(length * 0.45, 0);
  ctx.stroke();

  // Draw Rowers & Outriggers
  const seatCount = Math.min(6, Math.max(3, members.length || 4));
  for (let s = 0; s < seatCount; s++) {
    const seatX = -length * 0.35 + (s / (seatCount - 1 || 1)) * length * 0.64;
    const side = s % 2 === 0 ? -1 : 1;
    const p = members.length > 0 ? members[s % members.length] : null;
    const rowerHue = p ? p.hue : bIdx === 0 ? 38 : 190;

    // Outrigger Bracket
    const pivotX = seatX - 3 * S;
    const pivotY = side * (width * 0.95);
    ctx.strokeStyle = '#718096';
    ctx.lineWidth = 1.8 * S;
    ctx.beginPath();
    ctx.moveTo(seatX - 7 * S, side * (width * 0.4));
    ctx.lineTo(pivotX, pivotY);
    ctx.lineTo(seatX + 7 * S, side * (width * 0.4));
    ctx.stroke();

    // Oar Sweep Math
    let oarAng;
    if (boat.strokeAnim > 0) {
      const pull = 1 - boat.strokeAnim;
      oarAng = -0.65 + pull * 1.35;
    } else {
      oarAng = 0.7 - Math.sin(frame.t * 3.5 + s) * 0.12;
    }
    const totalAng = (side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5) + side * oarAng;
    const bladeX = pivotX + Math.cos(totalAng) * (54 * S);
    const bladeY = pivotY + Math.sin(totalAng) * (54 * S);

    // Oar Shaft
    ctx.strokeStyle = '#2b2d35';
    ctx.lineWidth = 2.6 * S;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bladeX, bladeY);
    ctx.stroke();

    // Oar Blade Spoon
    ctx.save();
    ctx.translate(bladeX, bladeY);
    ctx.rotate(totalAng);
    ctx.fillStyle = `hsl(${rowerHue}, 90%, 55%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9.5 * S, 4.2 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rower Torso
    const lean = boat.strokeAnim > 0 ? (boat.strokeAnim - 0.5) * 11 * S : Math.sin(frame.t * 3.2) * 2.5 * S;
    const headX = seatX - lean;
    ctx.fillStyle = `hsl(${rowerHue}, 85%, 52%)`;
    ctx.beginPath();
    ctx.ellipse(headX, 0, 6 * S, 4.8 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rower Cap & Head
    ctx.fillStyle = '#ffe0bd';
    ctx.beginPath();
    ctx.arc(headX, 0, 3.8 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bIdx === 0 ? '#ff3700' : '#0055ff';
    ctx.beginPath();
    ctx.arc(headX, -1.2 * S, 3.4 * S, Math.PI, Math.PI * 2);
    ctx.fill();

    // Individual player crown dot in their hue
    if (p) {
      ctx.fillStyle = `hsl(${p.hue}, 100%, 75%)`;
      ctx.beginPath();
      ctx.arc(headX, -9 * S, 2.5 * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

drawBoat(0, laneY0);
drawBoat(1, laneY1);

// --- Splashes & Mist Spray ---
for (let i = room.state.splashes.length - 1; i >= 0; i--) {
  const p = room.state.splashes[i];
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.vx *= 0.94;
  p.vy += 120 * S * frame.dt;
  p.life -= p.decay * frame.dt;
  if (p.life <= 0) {
    room.state.splashes.splice(i, 1);
    continue;
  }
  ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${p.life * 0.85})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
  ctx.fill();
}

// --- Floating Mist Layers ---
for (let m = 0; m < 3; m++) {
  const my = H * (0.37 + m * 0.22);
  const mSpeed = (0.08 + m * 0.04) * (m % 2 === 0 ? 1 : -1);
  ctx.fillStyle = `rgba(${pal.mist}, ${0.07 * fogDensity})`;
  ctx.beginPath();
  ctx.moveTo(0, my);
  for (let x = 0; x <= W; x += 40 * S) {
    const mh = Math.sin(frame.t * mSpeed + x * 0.005 + m) * 16 * S;
    ctx.lineTo(x, my + mh);
  }
  ctx.lineTo(W, my + 30 * S);
  ctx.lineTo(0, my + 30 * S);
  ctx.fill();
}

// --- Combo & Feedback Popups ---
for (let i = room.state.popups.length - 1; i >= 0; i--) {
  const pop = room.state.popups[i];
  pop.y -= 38 * S * frame.dt;
  pop.life -= frame.dt * 1.35;
  if (pop.life <= 0) {
    room.state.popups.splice(i, 1);
    continue;
  }
  ctx.save();
  ctx.font = `900 ${Math.floor(22 * S * pop.scale)}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = `hsla(${pop.hue}, 100%, 50%, 0.8)`;
  ctx.shadowBlur = 12 * S;
  ctx.lineWidth = 3.5 * S;
  ctx.strokeStyle = `rgba(0, 0, 0, ${pop.life * 0.85})`;
  ctx.strokeText(pop.text, pop.x, pop.y);
  ctx.fillStyle = `hsla(${pop.hue}, 100%, 75%, ${pop.life})`;
  ctx.fillText(pop.text, pop.x, pop.y);
  ctx.restore();
}

// --- Heads-Up Display & Scores ---
const boxW = 240 * S;
const boxH = 68 * S;
const topPad = 20 * S;

// Team 0 Score Badge (Gold Sun)
ctx.save();
ctx.fillStyle = 'rgba(15, 10, 24, 0.82)';
ctx.strokeStyle = '#ffaa00';
ctx.lineWidth = 2.5 * S;
ctx.beginPath();
ctx.roundRect(W * 0.06, topPad, boxW, boxH, 12 * S);
ctx.fill();
ctx.stroke();

ctx.textAlign = 'left';
ctx.font = `900 ${Math.floor(16 * S)}px Impact, "Arial Black", sans-serif`;
ctx.fillStyle = '#ffaa00';
ctx.fillText('☀ GOLD SUN', W * 0.06 + 16 * S, topPad + 28 * S);
ctx.font = `600 ${Math.floor(13 * S)}px sans-serif`;
ctx.fillStyle = '#ccc';
ctx.fillText(`${teamMembers[0].length} Rowers`, W * 0.06 + 16 * S, topPad + 48 * S);

ctx.textAlign = 'right';
ctx.font = `900 ${Math.floor(38 * S)}px Impact, "Arial Black", sans-serif`;
ctx.fillStyle = '#fff';
ctx.fillText(`${room.state.scores[0]}`, W * 0.06 + boxW - 16 * S, topPad + 48 * S);
ctx.restore();

// Team 1 Score Badge (Aqua Moon)
ctx.save();
ctx.fillStyle = 'rgba(10, 15, 28, 0.82)';
ctx.strokeStyle = '#00e5ff';
ctx.lineWidth = 2.5 * S;
ctx.beginPath();
ctx.roundRect(W * 0.94 - boxW, topPad, boxW, boxH, 12 * S);
ctx.fill();
ctx.stroke();

ctx.textAlign = 'left';
ctx.font = `900 ${Math.floor(16 * S)}px Impact, "Arial Black", sans-serif`;
ctx.fillStyle = '#00e5ff';
ctx.fillText('☾ AQUA MOON', W * 0.94 - boxW + 16 * S, topPad + 28 * S);
ctx.font = `600 ${Math.floor(13 * S)}px sans-serif`;
ctx.fillStyle = '#ccc';
ctx.fillText(`${teamMembers[1].length} Rowers`, W * 0.94 - boxW + 16 * S, topPad + 48 * S);

ctx.textAlign = 'right';
ctx.font = `900 ${Math.floor(38 * S)}px Impact, "Arial Black", sans-serif`;
ctx.fillStyle = '#fff';
ctx.fillText(`${room.state.scores[1]}`, W * 0.94 - 16 * S, topPad + 48 * S);
ctx.restore();

// Center Race Overview
ctx.save();
ctx.textAlign = 'center';
ctx.font = `900 ${Math.floor(18 * S)}px Impact, "Arial Black", sans-serif`;
ctx.fillStyle = '#fff';
ctx.fillText(`ROUND ${room.state.roundCount} — ${Math.floor(targetDist)}m SPRINT`, W * 0.5, topPad + 24 * S);

const barW = 280 * S;
const barH = 8 * S;
const barX = W * 0.5 - barW * 0.5;
const barY = topPad + 36 * S;
ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
ctx.fillRect(barX, barY, barW, barH);

const p0 = Math.min(1, room.state.boats[0].dist / targetDist);
const p1 = Math.min(1, room.state.boats[1].dist / targetDist);
ctx.fillStyle = '#ffaa00';
ctx.fillRect(barX, barY, barW * p0, barH * 0.5);
ctx.fillStyle = '#00e5ff';
ctx.fillRect(barX, barY + barH * 0.5, barW * p1, barH * 0.5);

ctx.font = `700 ${Math.floor(12 * S)}px sans-serif`;
ctx.fillStyle = '#ffaa00';
ctx.fillText(`GOLD: ${Math.max(0, Math.floor(targetDist - room.state.boats[0].dist))}m`, W * 0.5 - 65 * S, topPad + 60 * S);
ctx.fillStyle = '#00e5ff';
ctx.fillText(`AQUA: ${Math.max(0, Math.floor(targetDist - room.state.boats[1].dist))}m`, W * 0.5 + 65 * S, topPad + 60 * S);
ctx.restore();

// --- Round Start Flash Banner ---
if (room.state.startBannerTimer > 0) {
  const alpha = Math.min(1, room.state.startBannerTimer);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.floor(52 * S)}px Impact, "Arial Black", sans-serif`;
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.shadowColor = '#ffea00';
  ctx.shadowBlur = 18 * S;
  ctx.fillText('ROW TOGETHER!', W * 0.5, H * 0.26);
  ctx.font = `700 ${Math.floor(18 * S)}px sans-serif`;
  ctx.fillStyle = `rgba(255, 240, 200, ${alpha * 0.9})`;
  ctx.shadowBlur = 0;
  ctx.fillText('Press STROKE simultaneously for explosive sync power', W * 0.5, H * 0.30);
  ctx.restore();
}

// --- Winner Celebration Overlay ---
if (room.state.winner !== -1) {
  const winTeam = room.state.winner;
  const winName = winTeam === 0 ? 'GOLD SUN' : 'AQUA MOON';
  const winHue = winTeam === 0 ? 38 : 190;
  const winColor = winTeam === 0 ? '#ffaa00' : '#00e5ff';

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.floor(68 * S)}px Impact, "Arial Black", sans-serif`;
  ctx.fillStyle = winColor;
  ctx.shadowColor = `hsl(${winHue}, 100%, 55%)`;
  ctx.shadowBlur = 24 * S;
  ctx.lineWidth = 6 * S;
  ctx.strokeStyle = '#000';
  ctx.strokeText(`${winName} WINS!`, W * 0.5, H * 0.48);
  ctx.fillText(`${winName} WINS!`, W * 0.5, H * 0.48);

  ctx.shadowBlur = 0;
  ctx.font = `900 ${Math.floor(24 * S)}px sans-serif`;
  ctx.fillStyle = '#fff';
  const remaining = Math.max(1, Math.ceil(4.6 - room.state.winTimer));
  ctx.fillText(`Next round starting in ${remaining}s...`, W * 0.5, H * 0.56);
  ctx.restore();
}

// --- Attract Mode Call to Action ---
if (isAttract && room.state.winner === -1) {
  ctx.save();
  const pillW = 420 * S;
  const pillH = 44 * S;
  const pillX = W * 0.5 - pillW * 0.5;
  const pillY = H - 54 * S;
  const pulse = Math.sin(frame.t * 4.5) * 0.15 + 0.85;

  ctx.fillStyle = 'rgba(10, 12, 22, 0.88)';
  ctx.strokeStyle = `rgba(255, 230, 80, ${pulse})`;
  ctx.lineWidth = 2.5 * S;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 22 * S);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.floor(15 * S)}px Impact, "Arial Black", sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.fillText('⚡ TAP "STROKE!" ON PHONE TO JOIN THE RACE ⚡', W * 0.5, pillY + pillH * 0.5);
  ctx.restore();
}

ctx.restore();