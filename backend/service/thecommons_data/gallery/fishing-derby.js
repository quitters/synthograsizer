ctx.save();
const W = frame.width, H = frame.height;
const targetCatch = getVar('target_score') ?? 5;
const moodKey = getVar('water_mood') ?? 'Twilight Violet';
const tempoKey = getVar('bite_speed') ?? 'Normal';
const glow = getVar('night_glow') ?? true;

const tempoMultipliers = { Brisk: 1.5, Normal: 1.0, Chilled: 0.65 };
const tempo = tempoMultipliers[tempoKey] ?? 1.0;

const moods = {
  'Twilight Violet': { skyTop: '#0d041a', skyBot: '#431259', waterTop: '#140c2d', waterBot: '#050210', accent: '#ff498b', sun: '#ff735c' },
  'Sunset Gold': { skyTop: '#15061b', skyBot: '#661c28', waterTop: '#2e0f18', waterBot: '#08020a', accent: '#ffb300', sun: '#ffcc00' },
  'Deep Midnight': { skyTop: '#020614', skyBot: '#0b1d3a', waterTop: '#061326', waterBot: '#01050e', accent: '#00e5ff', sun: '#70b5ff' },
  'Neon Abyss': { skyTop: '#050014', skyBot: '#1f003b', waterTop: '#042833', waterBot: '#000f14', accent: '#00ffaa', sun: '#f700ff' }
};
const pal = moods[moodKey] ?? moods['Twilight Violet'];

// Persistent game state
room.state.players ??= {};
room.state.fx ??= [];
room.state.winner ??= null;
room.state.lastInput ??= frame.t;
room.state.nextRoundT ??= 0;
room.state.starSeed ??= Array.from({length: 40}, () => ({ x: Math.random(), y: Math.random() * 0.4, s: Math.random() * 2 + 1 }));

// Ensure active players map synced with room.people
const people = (room.people && room.people.length > 0) ? room.people : [{ id: 'local_bot_1', hue: 190 }, { id: 'local_bot_2', hue: 45 }, { id: 'local_bot_3', hue: 320 }];
const currentIds = new Set(people.map(p => p.id));
for (const p of people) {
  if (!room.state.players[p.id]) {
    room.state.players[p.id] = {
      id: p.id,
      score: 0,
      status: 'idle', // 'idle' | 'waiting' | 'bite' | 'reeling' | 'miss'
      stateT: frame.t + Math.random() * 0.5,
      biteWindow: 0.9,
      bobberOffset: 0,
      lastActionT: 0
    };
  }
}
// Prune missing players after a while
for (const id in room.state.players) {
  if (!currentIds.has(id)) delete room.state.players[id];
}

// Process input triggers
const events = room.events || [];
let inputDetected = false;
for (const ev of events) {
  inputDetected = true;
  room.state.lastInput = frame.t;
  if (ev.name === 'reset_round') {
    room.state.winner = null;
    for (const id in room.state.players) room.state.players[id].score = 0;
  } else if (ev.name === 'cast') {
    const p = room.state.players[ev.participantId] || room.state.players[people[0]?.id];
    if (p) triggerAction(p, frame.t);
  }
}

// Attract mode if idle > 4.5s
const isAttract = (frame.t - room.state.lastInput) > 4.5;
if (isAttract) {
  for (const id in room.state.players) {
    const p = room.state.players[id];
    if (p.status === 'idle' && frame.t - p.stateT > 0.8 + Math.random() * 1.5) {
      triggerAction(p, frame.t);
    } else if (p.status === 'bite' && frame.t - p.stateT > 0.25) {
      triggerAction(p, frame.t);
    }
  }
}

function triggerAction(p, now) {
  if (room.state.winner) return;
  if (p.status === 'idle') {
    p.status = 'waiting';
    p.stateT = now;
    p.waitDuration = (1.5 + Math.random() * 2.8) / tempo;
    spawnFx('text', p.id, 'CAST!', 0.6, '#ffffff');
  } else if (p.status === 'waiting') {
    // Too early!
    p.status = 'miss';
    p.stateT = now;
    spawnFx('text', p.id, 'EARLY!', 0.7, '#ff3b30');
    spawnFx('splash', p.id, null, 0.4, '#ffffff');
  } else if (p.status === 'bite') {
    // Hit!
    p.status = 'reeling';
    p.stateT = now;
    p.score += 1;
    spawnFx('catch', p.id, '+1 FISH!', 1.2, '#ffea00');
    spawnFx('splash', p.id, null, 0.8, '#ffea00');
    if (p.score >= targetCatch && !room.state.winner) {
      room.state.winner = p.id;
      room.state.nextRoundT = now + 5.0;
      spawnFx('winner', p.id, 'WINNER!', 3.0, '#ffffff');
    }
  } else if (p.status === 'miss' || p.status === 'reeling') {
    // Reset early on mash
    p.status = 'idle';
    p.stateT = now;
  }
}

function spawnFx(type, pid, label, duration, color) {
  if (room.state.fx.length > 50) room.state.fx.shift();
  room.state.fx.push({ type, pid, label, t0: frame.t, dur: duration, col: color, seed: Math.random() });
}

// Advance game loops & bites
for (const id in room.state.players) {
  const p = room.state.players[id];
  const dtState = frame.t - p.stateT;
  if (p.status === 'waiting') {
    // audio beats can speed up bite triggers
    const beatBoost = audio.beat ? 0.4 : 0;
    if (dtState + beatBoost >= (p.waitDuration || 2)) {
      p.status = 'bite';
      p.stateT = frame.t;
      p.biteWindow = Math.max(0.65, (1.2 / tempo) - (audio.treble * 0.2));
      spawnFx('text', p.id, 'STRIKE!', 0.8, '#00ffcc');
    }
  } else if (p.status === 'bite') {
    if (dtState > p.biteWindow) {
      p.status = 'miss';
      p.stateT = frame.t;
      spawnFx('text', p.id, 'ESCAPED!', 0.8, '#ff5555');
      spawnFx('splash', p.id, null, 0.5, '#7799ff');
    }
  } else if (p.status === 'miss' && dtState > 0.9) {
    p.status = 'idle';
    p.stateT = frame.t;
  } else if (p.status === 'reeling' && dtState > 1.2) {
    p.status = 'idle';
    p.stateT = frame.t;
  }
}

// Handle auto-round restart
if (room.state.winner && frame.t > room.state.nextRoundT) {
  room.state.winner = null;
  for (const id in room.state.players) {
    room.state.players[id].score = 0;
    room.state.players[id].status = 'idle';
  }
}

// --- DRAWING ---
// Sky gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.65);
skyGrad.addColorStop(0, pal.skyTop);
skyGrad.addColorStop(1, pal.skyBot);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// Stars twinkling
ctx.fillStyle = '#ffffff';
for (const s of room.state.starSeed) {
  const tw = Math.sin(frame.t * 3 + s.x * 20) * 0.5 + 0.5;
  ctx.globalAlpha = 0.2 + 0.7 * tw;
  ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
}
ctx.globalAlpha = 1.0;

// Giant setting sun / moon
const sunY = H * 0.42;
const sunR = Math.min(W, H) * 0.14 + audio.bass * 20;
const sunGrad = ctx.createRadialGradient(W * 0.5, sunY, sunR * 0.1, W * 0.5, sunY, sunR);
sunGrad.addColorStop(0, pal.sun);
sunGrad.addColorStop(0.7, pal.accent);
sunGrad.addColorStop(1, 'rgba(255, 73, 139, 0)');
ctx.fillStyle = sunGrad;
ctx.beginPath();
ctx.arc(W * 0.5, sunY, sunR, 0, Math.PI * 2);
ctx.fill();

// Horizon & Water
const pierY = H * 0.52;
const waterGrad = ctx.createLinearGradient(0, pierY, 0, H);
waterGrad.addColorStop(0, pal.waterTop);
waterGrad.addColorStop(1, pal.waterBot);
ctx.fillStyle = waterGrad;
ctx.fillRect(0, pierY, W, H - pierY);

// Water wave neon lines reacting to audio
const waveCount = 12;
for (let i = 0; i < waveCount; i++) {
  const wy = pierY + (H - pierY) * (i / waveCount);
  const wAlpha = 0.12 + (i / waveCount) * 0.25;
  ctx.strokeStyle = pal.accent;
  ctx.globalAlpha = wAlpha;
  ctx.lineWidth = 1 + (i * 0.3) + audio.mid * 2;
  ctx.beginPath();
  const freq = 0.008 + i * 0.002;
  const speed = frame.t * (1.2 + i * 0.3);
  for (let wx = 0; wx <= W; wx += 24) {
    const waveH = Math.sin(wx * freq + speed) * (4 + audio.bass * 10) * (i / waveCount + 0.4);
    if (wx === 0) ctx.moveTo(wx, wy + waveH);
    else ctx.lineTo(wx, wy + waveH);
  }
  ctx.stroke();
}
ctx.globalAlpha = 1.0;

// Wooden Pier Structure
ctx.fillStyle = '#07040a';
ctx.fillRect(0, pierY - 12, W, 22);
// Railing
ctx.strokeStyle = '#1b1224';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(0, pierY - 28);
ctx.lineTo(W, pierY - 28);
ctx.stroke();

// Support pilings
const piles = 10;
for (let i = 0; i <= piles; i++) {
  const px = (W / piles) * i;
  ctx.fillStyle = '#050208';
  ctx.fillRect(px - 7, pierY, 14, H - pierY);
  ctx.fillStyle = '#140c1e';
  ctx.fillRect(px - 2, pierY, 4, H - pierY);
}

// Layout Players evenly on pier
const pCount = people.length;
const laneW = W / (pCount + 1);
const pCoords = {};

people.forEach((person, idx) => {
  const cx = laneW * (idx + 1);
  const cy = pierY - 12;
  pCoords[person.id] = { x: cx, y: cy, hue: person.hue ?? (idx * 360 / pCount) };
});

// Draw each angler, fishing line, bobber, and status
for (let idx = 0; idx < people.length; idx++) {
  const person = people[idx];
  const pState = room.state.players[person.id] || { status: 'idle', score: 0 };
  const pos = pCoords[person.id];
  const col = `hsl(${pos.hue}, 95%, 60%)`;
  const colGlow = `hsla(${pos.hue}, 100%, 65%, 0.4)`.replace(' ', '');

  // Angler silhouette + hue halo
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = glow ? 16 : 0;
  
  // Pier post / seat
  ctx.fillStyle = '#1c1326';
  ctx.fillRect(pos.x - 10, pos.y - 20, 20, 20);

  // Silhouette Body
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 42, 10, 0, Math.PI * 2); // Head
  ctx.fill();
  
  // Torso / Jacket
  ctx.fillRect(pos.x - 7, pos.y - 32, 14, 20);
  
  // Fishing Rod
  const rodAngle = pState.status === 'reeling' ? -0.85 : (pState.status === 'bite' ? -0.35 : -0.55);
  const rodLen = Math.min(laneW * 0.9, 70);
  const tipX = pos.x + Math.cos(rodAngle) * rodLen;
  const tipY = (pos.y - 28) + Math.sin(rodAngle) * rodLen;
  
  ctx.strokeStyle = '#f0f0f5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - 26);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Fishing line & Bobber in water
  const waterBobY = pierY + 90 + Math.sin(frame.t * 3 + idx) * 5;
  const bobX = pos.x + 35 + Math.cos(frame.t * 2 + idx) * 6;
  
  if (pState.status !== 'idle') {
    let bobY = waterBobY;
    if (pState.status === 'bite') {
      // Jerk rapidly under water
      const biteShake = Math.sin(frame.t * 32) * 16;
      bobY += 18 + biteShake;
    } else if (pState.status === 'reeling') {
      bobY -= 30 + Math.sin(frame.t * 12) * 20;
    }

    // Line
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = (pState.status === 'bite') ? '#ffff55' : 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    // Curved sag for fishing line
    const sag = (pState.status === 'bite') ? 0 : 25;
    ctx.quadraticCurveTo((tipX + bobX) * 0.5, (tipY + bobY) * 0.5 + sag, bobX, bobY);
    ctx.stroke();

    // Bobber float
    ctx.fillStyle = (pState.status === 'bite') ? '#ff0055' : '#ffffff';
    ctx.beginPath();
    ctx.arc(bobX, bobY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2a2a';
    ctx.beginPath();
    ctx.arc(bobX, bobY - 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Water ripples under bobber
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    const ripR = (frame.t * 20 + idx * 8) % 24;
    ctx.globalAlpha = Math.max(0, 1 - ripR / 24);
    ctx.beginPath();
    ctx.ellipse(bobX, waterBobY + 6, ripR, ripR * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }
  ctx.restore();

  // Tally Score & Prompt Tag under angler
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 18px sans-serif';
  ctx.fillStyle = col;
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 6;
  
  // Score Pill
  const pillY = pos.y + 26;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(pos.x - 28, pillY - 14, 56, 24);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.strokeRect(pos.x - 28, pillY - 14, 56, 24);
  
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${pState.score} / ${targetCatch}`, pos.x, pillY + 4);

  // Angler status tag
  let statusTag = 'READY';
  let tagCol = '#888888';
  if (pState.status === 'waiting') { statusTag = 'WAIT...'; tagCol = '#ffe600'; }
  else if (pState.status === 'bite') { statusTag = '! STRIKE !'; tagCol = '#00ffcc'; }
  else if (pState.status === 'reeling') { statusTag = 'CAUGHT!'; tagCol = '#a3ff00'; }
  else if (pState.status === 'miss') { statusTag = 'MISSED'; tagCol = '#ff3b30'; }

  ctx.font = '800 13px sans-serif';
  ctx.fillStyle = tagCol;
  ctx.fillText(statusTag, pos.x, pillY + 32);
  ctx.restore();
}

// Update & Render Effects (Jumping fish, splashes, bold text bursts)
const remainingFx = [];
for (const fx of room.state.fx) {
  const age = frame.t - fx.t0;
  if (age >= fx.dur) continue;
  remainingFx.push(fx);
  const progress = age / fx.dur;
  const pos = pCoords[fx.pid] || { x: W * 0.5, y: pierY, hue: 0 };

  ctx.save();
  if (fx.type === 'text') {
    const alpha = 1 - progress;
    const lift = progress * 60;
    ctx.globalAlpha = alpha;
    ctx.font = '900 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = fx.col;
    ctx.shadowColor = fx.col;
    ctx.shadowBlur = glow ? 20 : 0;
    ctx.fillText(fx.label, pos.x, pierY - 50 - lift);
  } else if (fx.type === 'splash') {
    const sAlpha = 1 - progress;
    ctx.globalAlpha = sAlpha;
    ctx.strokeStyle = fx.col;
    ctx.lineWidth = 3;
    const splashR = progress * 40;
    ctx.beginPath();
    ctx.ellipse(pos.x + 35, pierY + 95, splashR, splashR * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    // droplets
    for (let d = 0; d < 6; d++) {
      const ang = (d / 6) * Math.PI * 2 + fx.seed;
      const dDist = progress * 45;
      const dx = pos.x + 35 + Math.cos(ang) * dDist;
      const dy = pierY + 95 + Math.sin(ang) * dDist * 0.4 - (Math.sin(progress * Math.PI) * 25);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dx, dy, 3, 3);
    }
  } else if (fx.type === 'catch') {
    // Jumping fish arc from water to angler
    const arcP = Math.sin(progress * Math.PI);
    const fishX = (pos.x + 35) + (pos.x - (pos.x + 35)) * progress;
    const fishY = (pierY + 90) - arcP * 90;
    
    ctx.fillStyle = fx.col;
    ctx.shadowColor = fx.col;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.ellipse(fishX, fishY, 14, 7, -0.4 + progress * 0.8, 0, Math.PI * 2);
    ctx.fill();
    // Tail
    ctx.beginPath();
    ctx.moveTo(fishX - 12, fishY);
    ctx.lineTo(fishX - 20, fishY - 6);
    ctx.lineTo(fishX - 20, fishY + 6);
    ctx.fill();
  } else if (fx.type === 'winner') {
    // Huge screen celebration banner
    const scale = 1 + Math.sin(frame.t * 8) * 0.05;
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.floor(W * 0.065 * scale)}px sans-serif`;
    ctx.fillStyle = '#ffea00';
    ctx.shadowColor = '#ff2a70';
    ctx.shadowBlur = 30;
    ctx.fillText('WINNER!', W * 0.5, H * 0.32);
  }
  ctx.restore();
}
room.state.fx = remainingFx;

// Top HUD Derby Header
ctx.save();
ctx.textAlign = 'center';
ctx.font = '900 24px sans-serif';
ctx.fillStyle = pal.accent;
ctx.shadowColor = pal.accent;
ctx.shadowBlur = 10;
ctx.fillText('PIER PRESSURE  *  FIRST TO ' + targetCatch + ' CATCHES', W * 0.5, 42);

// Attract mode overlay helper banner
if (isAttract) {
  ctx.font = '700 16px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 8;
  ctx.fillText('PRESS CAST / STRIKE TO PLAY', W * 0.5, 74);
}
ctx.restore();

// Winner Round Banner & Countdown
if (room.state.winner) {
  const wPerson = people.find(p => p.id === room.state.winner);
  const wHue = wPerson ? wPerson.hue : 45;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, H * 0.28, W, 130);
  ctx.textAlign = 'center';
  ctx.font = '900 48px sans-serif';
  ctx.fillStyle = `hsl(${wHue}, 100%, 65%)`;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 25;
  ctx.fillText(`ANGLER WINS THE DERBY!`, W * 0.5, H * 0.35);
  ctx.font = '700 22px sans-serif';
  ctx.fillStyle = '#ffffff';
  const resetSec = Math.max(1, Math.ceil(room.state.nextRoundT - frame.t));
  ctx.fillText(`NEXT ROUND IN ${resetSec}s`, W * 0.5, H * 0.41);
  ctx.restore();
}

ctx.restore();