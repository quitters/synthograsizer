ctx.save();
const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);

// 1. Controls
const tempo = getVar('tempo') ?? 1.0;
const floorStyle = getVar('floor_style') ?? 'disco_tiles';
const partyHats = getVar('party_hats') ?? 'disco_afros';
const glitterInt = getVar('glitter_intensity') ?? 7;
const lineGlow = getVar('line_glow') ?? true;

// 2. State Initialization
room.state.dancers ??= [];
room.state.path ??= [];
room.state.particles ??= [];
room.state.fever ??= 10;
room.state.score ??= 0;
room.state.lastInputT ??= frame.t;
room.state.gameState ??= 'party';
room.state.victoryTimer ??= 0;
room.state.banner ??= { text: 'CONGA READY!', timer: 2.0, hue: 50 };
room.state.kickFlash ??= 0;

// Starter dancers if empty
if (room.state.dancers.length === 0) {
  const starterHues = [45, 160, 280, 205];
  for (let i = 0; i < 4; i++) {
    room.state.dancers.push({
      id: 'bot-' + i,
      hue: starterHues[i],
      kickT: 0,
      bob: i * 0.8,
      hat: i % 4
    });
  }
}

// 3. Process Momentary Triggers
const events = room.events || [];
for (const e of events) {
  room.state.lastInputT = frame.t;
  if (e.name === 'join') {
    const person = (room.people || []).find(p => p.id === e.participantId);
    const hue = person ? person.hue : Math.floor((frame.t * 83) % 360);
    const exists = room.state.dancers.find(d => d.id === e.participantId);
    if (!exists && room.state.dancers.length < 38) {
      room.state.dancers.push({
        id: e.participantId,
        hue: hue,
        kickT: 0,
        bob: Math.random() * 6,
        hat: Math.floor(Math.random() * 4)
      });
      room.state.fever = Math.min(100, room.state.fever + 12);
      room.state.score += 150;
      room.state.banner = { text: 'NEW DANCER IN!', timer: 1.2, hue };
      // Spawn entry sparks
      for (let k = 0; k < 18; k++) {
        if (room.state.particles.length < 120) {
          const a = Math.random() * Math.PI * 2;
          const sp = 90 + Math.random() * 180;
          room.state.particles.push({
            x: W * 0.5, y: H * 0.65, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
            life: 0.8 + Math.random() * 0.5, maxLife: 1.2, hue: hue, size: 4 + Math.random() * 5
          });
        }
      }
    } else if (exists) {
      exists.kickT = 0.5;
      room.state.fever = Math.min(100, room.state.fever + 4);
    }
  } else if (e.name === 'kick') {
    const onBeat = audio.beat || audio.bass > 0.45;
    const gain = onBeat ? 16 : 8;
    room.state.fever = Math.min(100, room.state.fever + gain);
    room.state.score += onBeat ? 250 : 80;
    room.state.kickFlash = 1.0;
    room.state.banner = {
      text: onBeat ? '★ PERFECT KICK! ★' : 'KICK! HEY!',
      timer: 0.9,
      hue: onBeat ? 45 : 320
    };
    for (const d of room.state.dancers) {
      d.kickT = 0.55;
    }
    // Confetti burst
    for (let k = 0; k < (onBeat ? 26 : 14); k++) {
      if (room.state.particles.length < 120) {
        const a = Math.random() * Math.PI * 2;
        const sp = 120 + Math.random() * 220;
        room.state.particles.push({
          x: W * 0.5 + (Math.random() - 0.5) * 200, y: H * 0.45,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
          life: 0.7 + Math.random() * 0.6, maxLife: 1.3, hue: Math.floor(Math.random() * 360), size: 5 + Math.random() * 4
        });
      }
    }
  }
}

// 4. Attract Mode (if idle for 4s)
if (frame.t - room.state.lastInputT > 4.0) {
  if (audio.beat && Math.random() < 0.6) {
    for (const d of room.state.dancers) d.kickT = 0.5;
    room.state.kickFlash = 0.4;
    room.state.fever = Math.min(100, room.state.fever + 4);
  }
  if (room.state.dancers.length < 5 && Math.random() < 0.02) {
    room.state.dancers.push({
      id: 'bot-' + Math.floor(frame.t),
      hue: Math.floor((frame.t * 97) % 360),
      kickT: 0,
      bob: Math.random() * 6,
      hat: Math.floor(Math.random() * 4)
    });
  }
}

// 5. Game Loop & Victory Progression
if (room.state.fever >= 100 && room.state.gameState !== 'victory') {
  room.state.gameState = 'victory';
  room.state.victoryTimer = 4.5;
  room.state.banner = { text: '★ CONGA CHAMPIONS! ★', timer: 4.5, hue: 50 };
}

if (room.state.gameState === 'victory') {
  room.state.victoryTimer -= dt;
  if (Math.random() < 0.4 && room.state.particles.length < 120) {
    room.state.particles.push({
      x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160,
      life: 1.8, maxLife: 1.8, hue: Math.floor(Math.random() * 360), size: 6 + Math.random() * 6
    });
  }
  if (room.state.victoryTimer <= 0) {
    room.state.gameState = 'party';
    room.state.fever = 15;
    room.state.banner = { text: 'NEXT ROUND - GO!', timer: 2.0, hue: 130 };
  }
} else {
  room.state.fever = Math.max(0, room.state.fever - dt * 1.8);
}

room.state.kickFlash = Math.max(0, room.state.kickFlash - dt * 2.5);

// 6. Snaking Conga Path Leader
const speed = tempo * 1.15;
const moveT = frame.t * speed;
const cx = W * 0.5;
const cy = H * 0.58;
const rx = W * 0.38;
const ry = H * 0.28;
const leadX = cx + Math.sin(moveT * 0.75) * rx + Math.cos(moveT * 1.5) * (rx * 0.25);
const leadY = cy + Math.cos(moveT * 0.6) * ry + Math.sin(moveT * 1.2) * (ry * 0.35);

const lastPt = room.state.path[room.state.path.length - 1];
if (!lastPt || Math.hypot(leadX - lastPt.x, leadY - lastPt.y) > 13) {
  room.state.path.push({ x: leadX, y: leadY });
  if (room.state.path.length > 280) room.state.path.shift();
}

// 7. Background & Dancefloor Drawing
ctx.fillStyle = '#070512';
ctx.fillRect(0, 0, W, H);

// Dancefloor grid projection
const floorTop = H * 0.26;
const cols = 12;
const rows = 8;
for (let r = 0; r < rows; r++) {
  const v0 = r / rows;
  const v1 = (r + 1) / rows;
  const y0 = floorTop + Math.pow(v0, 1.4) * (H - floorTop);
  const y1 = floorTop + Math.pow(v1, 1.4) * (H - floorTop);
  const w0 = W * (0.45 + v0 * 0.58);
  const w1 = W * (0.45 + v1 * 0.58);

  for (let c = 0; c < cols; c++) {
    const u00 = (c / cols - 0.5) * w0 + W * 0.5;
    const u10 = ((c + 1) / cols - 0.5) * w0 + W * 0.5;
    const u01 = (c / cols - 0.5) * w1 + W * 0.5;
    const u11 = ((c + 1) / cols - 0.5) * w1 + W * 0.5;

    let tileHue = (c * 30 + r * 45 + frame.t * 40) % 360;
    let tileAlpha = 0.12 + audio.bass * 0.22;
    if (floorStyle === 'starburst') {
      tileAlpha = 0.1 + Math.sin(c * 0.8 + frame.t * 3) * 0.08 + audio.mid * 0.15;
    } else if (floorStyle === 'neon_grid') {
      tileAlpha = 0.05;
    }

    ctx.fillStyle = `hsla(${tileHue}, 85%, 55%, ${tileAlpha})`;
    ctx.beginPath();
    ctx.moveTo(u00, y0);
    ctx.lineTo(u10, y0);
    ctx.lineTo(u11, y1);
    ctx.lineTo(u01, y1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `hsla(${tileHue}, 90%, 65%, ${0.18 + audio.bass * 0.25})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

// 8. Glitter Ball at Top
const ballX = W * 0.5;
const ballY = H * 0.13;
const ballRadius = Math.min(W, H) * 0.055;

// Light Beams radiating across floor
ctx.save();
const numBeams = 8;
for (let i = 0; i < numBeams; i++) {
  const beamAngle = frame.t * 0.6 * tempo + (i * Math.PI * 2) / numBeams;
  const beamWidth = 0.22 + audio.mid * 0.15;
  const beamGrad = ctx.createRadialGradient(ballX, ballY, 10, ballX, ballY, H * 0.9);
  const bHue = (i * 45 + frame.t * 30) % 360;
  beamGrad.addColorStop(0, `hsla(${bHue}, 90%, 75%, ${0.18 * (glitterInt / 7)})`);
  beamGrad.addColorStop(1, 'hsla(0,0%,0%,0)');

  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(ballX, ballY);
  ctx.arc(ballX, ballY, H * 0.95, beamAngle - beamWidth, beamAngle + beamWidth);
  ctx.closePath();
  ctx.fill();
}
ctx.restore();

// Glitter ball body & facets
ctx.save();
// Hanging rod
ctx.strokeStyle = '#888';
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.moveTo(ballX, 0);
ctx.lineTo(ballX, ballY);
ctx.stroke();

// Ball sphere gradient
const sphereGrad = ctx.createRadialGradient(ballX - ballRadius * 0.3, ballY - ballRadius * 0.3, ballRadius * 0.1, ballX, ballY, ballRadius);
sphereGrad.addColorStop(0, '#ffffff');
sphereGrad.addColorStop(0.5, '#99b3cc');
sphereGrad.addColorStop(1, '#1b2333');
ctx.fillStyle = sphereGrad;
ctx.beginPath();
ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
ctx.fill();

// Mirror facet glints
const facetRows = 6;
for (let fr = -facetRows; fr <= facetRows; fr++) {
  const fy = ballY + (fr / (facetRows + 1)) * (ballRadius * 0.88);
  const rowW = Math.sqrt(Math.max(0, ballRadius * ballRadius - Math.pow(fy - ballY, 2))) * 1.8;
  const fCols = 7;
  for (let fc = 0; fc < fCols; fc++) {
    const fx = ballX - rowW * 0.5 + (fc / fCols) * rowW;
    const sparkle = Math.sin(frame.t * 5 + fc * 1.3 + fr * 0.9 + audio.treble * 8);
    if (sparkle > 0.4) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + sparkle * 0.5})`;
      ctx.fillRect(fx - 2, fy - 2, 4, 4);
    }
  }
}
ctx.restore();

// Flash on Kick
if (room.state.kickFlash > 0) {
  ctx.fillStyle = `rgba(255, 255, 255, ${room.state.kickFlash * 0.22})`;
  ctx.fillRect(0, 0, W, H);
}

// 9. Draw Conga Connecting Ribbon
if (lineGlow && room.state.path.length > 2) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < room.state.path.length; i++) {
    const pt = room.state.path[i];
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.lineWidth = 6;
  ctx.strokeStyle = `hsla(${(frame.t * 80) % 360}, 90%, 65%, 0.45)`;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// 10. Draw Conga Dancers along the Path
const numDancers = room.state.dancers.length;
const pathSpacing = 6;
const pathLen = room.state.path.length;

// Sort dancers back to front by Y coordinate for depth
const renderList = [];
for (let i = 0; i < numDancers; i++) {
  const d = room.state.dancers[i];
  d.kickT = Math.max(0, d.kickT - dt * 2.2);
  const pathIdx = Math.max(0, pathLen - 1 - i * pathSpacing);
  const pt = room.state.path[pathIdx] || { x: cx, y: cy };
  // Look ahead for orientation
  const nextIdx = Math.min(pathLen - 1, pathIdx + 2);
  const nextPt = room.state.path[nextIdx] || pt;
  const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);
  renderList.push({ dancer: d, x: pt.x, y: pt.y, angle, index: i });
}
renderList.sort((a, b) => a.y - b.y);

// Draw dancers
for (const item of renderList) {
  const d = item.dancer;
  const dx = item.x;
  const dy = item.y;
  const kickActive = d.kickT > 0;
  const kickProgress = Math.sin(d.kickT * Math.PI);
  const bob = Math.sin(frame.t * 9 * tempo + d.bob) * (kickActive ? 12 : 5);
  const scale = 0.85 + (dy / H) * 0.45;

  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(scale, scale);

  // Drop shadow on floor
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  const legKickAngle = kickActive ? kickProgress * 1.1 : Math.sin(frame.t * 8 * tempo + d.bob) * 0.35;
  // Standing leg
  ctx.fillStyle = '#222';
  ctx.fillRect(-6, -10, 4, 18);
  // Kicking leg
  ctx.save();
  ctx.translate(4, -8);
  ctx.rotate(legKickAngle);
  ctx.fillStyle = `hsl(${d.hue}, 85%, 45%)`;
  ctx.fillRect(-2, 0, 5, 18);
  // Shoe
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-2, 16, 9, 5);
  ctx.restore();

  // Body / Torso (Groovy outfit in player hue)
  ctx.fillStyle = `hsl(${d.hue}, 90%, 52%)`;
  ctx.beginPath();
  ctx.roundRect(-10, -32 + bob * 0.3, 20, 24, 7);
  ctx.fill();

  // Conga arms reaching forward to player in front
  ctx.strokeStyle = `hsl(${d.hue}, 85%, 60%)`;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, -24 + bob * 0.3);
  ctx.lineTo(Math.cos(item.angle) * 16 - 4, -20 + Math.sin(item.angle) * 8);
  ctx.moveTo(7, -24 + bob * 0.3);
  ctx.lineTo(Math.cos(item.angle) * 16 + 4, -20 + Math.sin(item.angle) * 8);
  ctx.stroke();

  // Head
  const headY = -42 + bob;
  ctx.fillStyle = '#ffdfba';
  ctx.beginPath();
  ctx.arc(0, headY, 9, 0, Math.PI * 2);
  ctx.fill();

  // Party Hat / Gear
  const selectedHat = partyHats;
  if (selectedHat === 'disco_afros') {
    ctx.fillStyle = '#3a1f04';
    ctx.beginPath();
    ctx.arc(0, headY - 4, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (selectedHat === 'sombreros') {
    ctx.fillStyle = `hsl(${(d.hue + 50) % 360}, 95%, 55%)`;
    ctx.beginPath();
    ctx.ellipse(0, headY - 8, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, headY - 8);
    ctx.lineTo(0, headY - 20);
    ctx.lineTo(6, headY - 8);
    ctx.closePath();
    ctx.fill();
  } else if (selectedHat === 'retro_shades') {
    ctx.fillStyle = '#0ff';
    ctx.fillRect(-8, headY - 2, 16, 4);
  } else if (selectedHat === 'crowns') {
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(-8, headY - 8);
    ctx.lineTo(-8, headY - 17);
    ctx.lineTo(-3, headY - 11);
    ctx.lineTo(0, headY - 18);
    ctx.lineTo(3, headY - 11);
    ctx.lineTo(8, headY - 17);
    ctx.lineTo(8, headY - 8);
    ctx.closePath();
    ctx.fill();
  }

  // Kick swoosh visual
  if (kickActive) {
    ctx.strokeStyle = `hsla(${d.hue}, 100%, 75%, ${kickProgress * 0.8})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(4, 2, 22, -0.2, legKickAngle + 0.3);
    ctx.stroke();
  }

  ctx.restore();
}

// 11. Particles Update & Draw
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += 160 * dt;
  p.life -= dt;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  const alpha = Math.max(0, p.life / p.maxLife);
  ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
  ctx.fill();
}

// 12. Large Public Display HUD
ctx.save();
// Conga Fever Meter (Top Center Bar)
const barW = Math.min(W * 0.55, 520);
const barH = 26;
const barX = (W - barW) * 0.5;
const barY = 24;

// Bar background
ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
ctx.beginPath();
ctx.roundRect(barX - 4, barY - 4, barW + 8, barH + 8, 16);
ctx.fill();
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 2.5;
ctx.stroke();

// Bar fill with fever gradient
const feverPct = Math.min(1.0, room.state.fever / 100);
const feverGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
feverGrad.addColorStop(0, '#00ffcc');
feverGrad.addColorStop(0.5, '#ff00aa');
feverGrad.addColorStop(1, '#ffe600');
ctx.fillStyle = feverGrad;
ctx.beginPath();
ctx.roundRect(barX, barY, barW * feverPct, barH, 12);
ctx.fill();

// Meter Label
ctx.fillStyle = '#ffffff';
ctx.font = '900 16px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
const feverText = room.state.fever >= 99 ? '★ DISCO FEVER ACTIVATED! ★' : `FEVER: ${Math.round(room.state.fever)}%`;
ctx.fillText(feverText, W * 0.5, barY + barH * 0.5);

// Big short announcements / Banner
if (room.state.banner && room.state.banner.timer > 0) {
  room.state.banner.timer -= dt;
  const bAlpha = Math.min(1.0, room.state.banner.timer * 1.5);
  ctx.save();
  ctx.translate(W * 0.5, H * 0.28);
  const bScale = 1.0 + Math.sin((room.state.banner.timer) * 8) * 0.08;
  ctx.scale(bScale, bScale);
  ctx.font = '900 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Black outline
  ctx.strokeStyle = `rgba(0, 0, 0, ${bAlpha})`;
  ctx.lineWidth = 10;
  ctx.strokeText(room.state.banner.text, 0, 0);

  // Vibrant fill
  ctx.fillStyle = `hsla(${room.state.banner.hue}, 100%, 65%, ${bAlpha})`;
  ctx.fillText(room.state.banner.text, 0, 0);
  ctx.restore();
}

// Bottom Action Status Badges (Inviting Players Across Room)
const badgeY = H - 36;
ctx.font = '800 20px system-ui, sans-serif';
ctx.textBaseline = 'middle';

// Left Badge: Line Size
ctx.textAlign = 'left';
ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
ctx.beginPath();
ctx.roundRect(24, badgeY - 20, 250, 40, 20);
ctx.fill();
ctx.strokeStyle = '#00ffcc';
ctx.lineWidth = 2;
ctx.stroke();
ctx.fillStyle = '#00ffcc';
ctx.fillText(`🕺 CONGA LINE: ${room.state.dancers.length} DANCERS`, 40, badgeY);

// Right Badge: Score / Beat kick
ctx.textAlign = 'right';
ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
ctx.beginPath();
ctx.roundRect(W - 274, badgeY - 20, 250, 40, 20);
ctx.fill();
ctx.strokeStyle = '#ff00aa';
ctx.lineWidth = 2;
ctx.stroke();
ctx.fillStyle = '#ff00aa';
ctx.fillText(`★ PARTY SCORE: ${room.state.score}`, W - 40, badgeY);

ctx.restore();
ctx.restore();