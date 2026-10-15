ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.1);

// Init persistent state
room.state.scores ??= [0, 0];
room.state.teamProgress ??= [0, 0];
room.state.activeLeg ??= [0, 0];
room.state.targetProgress ??= [0, 0];
room.state.particles ??= [];
room.state.winner ??= -1;
room.state.winnerTimer ??= 0;
room.state.lastPressTime ??= t;
room.state.pulse ??= [0, 0];
room.state.attractTimer ??= 0;
room.state.lastLapCount ??= 4;

// Variable reads
const stridePower = getVar('stride_power') ?? 2.5;
const totalLegs = Math.round(getVar('laps_to_win') ?? 4);
const hypeChoice = getVar('crowd_hype') ?? 'steady';
const hypeMulti = { steady: 1, electric: 1.6, festival: 2.2 }[hypeChoice] ?? 1;
const floodlights = getVar('night_lighting') ?? true;

// Reset race if leg setting changed mid-play
if (room.state.lastLapCount !== totalLegs) {
  room.state.lastLapCount = totalLegs;
  room.state.teamProgress = [0, 0];
  room.state.targetProgress = [0, 0];
  room.state.activeLeg = [0, 0];
  room.state.winner = -1;
}

// Assign connected people into two teams
const people = room.people ?? [];
const teamPlayers = [[], []];
const tables = Array.from(new Set(people.map(p => p.table).filter(Boolean)));

if (tables.length > 1) {
  people.forEach(p => {
    const idx = tables.indexOf(p.table) % 2;
    teamPlayers[idx].push(p);
  });
} else {
  people.forEach((p, i) => {
    teamPlayers[i % 2].push(p);
  });
}

// Handle events
let pressedAny = false;
const strideDist = (1 / totalLegs) * (0.075 * stridePower);

if (room.events && room.events.length > 0) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'run' && room.state.winner === -1) {
      pressedAny = true;
      let team = 0;
      if (people.length > 0 && ev.participantId) {
        const p = people.find(pl => pl.id === ev.participantId);
        if (p) {
          team = teamPlayers[1].some(tp => tp.id === p.id) ? 1 : 0;
        } else {
          team = (room.state.teamProgress[0] > room.state.teamProgress[1]) ? 1 : 0;
        }
      } else {
        // Solo or no players: alternate advances
        team = (room.state.teamProgress[0] <= room.state.teamProgress[1]) ? 0 : 1;
      }
      room.state.targetProgress[team] = Math.min(1, room.state.targetProgress[team] + strideDist);
      room.state.pulse[team] = 1.0;

      // Particle burst behind active runner
      const prog = room.state.teamProgress[team];
      for (let k = 0; k < 8; k++) {
        if (room.state.particles.length < 180) {
          room.state.particles.push({
            prog: prog,
            lane: team,
            life: 1.0,
            decay: 1.8 + Math.random() * 2,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 120,
            hue: team === 0 ? 190 : 340,
            size: 4 + Math.random() * 6
          });
        }
      }
    } else if (ev.name === 'cheer') {
      for (let k = 0; k < 15; k++) {
        if (room.state.particles.length < 180) {
          room.state.particles.push({
            x: W * (0.15 + Math.random() * 0.7),
            y: H * (0.1 + Math.random() * 0.8),
            life: 1.0,
            decay: 1.2 + Math.random(),
            vx: (Math.random() - 0.5) * 80,
            vy: -40 - Math.random() * 60,
            hue: Math.random() * 360,
            size: 3 + Math.random() * 5
          });
        }
      }
    }
  }
}

if (pressedAny) {
  room.state.lastPressTime = t;
}

// Attract mode: step automatically if room is quiet
const idleTime = t - room.state.lastPressTime;
if (idleTime > 3.0 && room.state.winner === -1) {
  room.state.attractTimer += dt * (1 + (audio.level ?? 0) * 2);
  if (room.state.attractTimer > 0.45) {
    room.state.attractTimer = 0;
    const turn = Math.random() < 0.5 ? 0 : 1;
    room.state.targetProgress[turn] = Math.min(1, room.state.targetProgress[turn] + strideDist * 0.7);
    room.state.pulse[turn] = 0.6;
  }
}

// Smooth progress & leg calculation
for (let i = 0; i < 2; i++) {
  room.state.pulse[i] = Math.max(0, room.state.pulse[i] - dt * 3.5);
  room.state.teamProgress[i] += (room.state.targetProgress[i] - room.state.teamProgress[i]) * Math.min(1, dt * 14);
  const currentLeg = Math.min(totalLegs - 1, Math.floor(room.state.teamProgress[i] * totalLegs));
  room.state.activeLeg[i] = currentLeg;

  // Check winner
  if (room.state.teamProgress[i] >= 0.999 && room.state.winner === -1) {
    room.state.winner = i;
    room.state.winnerTimer = 0;
    room.state.scores[i]++;
  }
}

// Next round timer after finish
if (room.state.winner !== -1) {
  room.state.winnerTimer += dt;
  if (room.state.winnerTimer > 4.5) {
    room.state.winner = -1;
    room.state.teamProgress = [0, 0];
    room.state.targetProgress = [0, 0];
    room.state.activeLeg = [0, 0];
    room.state.lastPressTime = t;
  }
}

// STADIUM DRAWING SETUP
const cx = W * 0.5;
const cy = H * 0.53;
const sw = Math.min(W * 0.46, 700); // straight length
const r0 = Math.min(H * 0.22, 210); // inner radius
const laneW = Math.min(H * 0.055, 48);
const r1 = r0 + laneW;
const rTrackOuter = r1 + laneW * 0.5;
const rTrackInner = r0 - laneW * 0.5;

// Helper to get 2D coordinate on stadium track for normalized progress (0..1)
function getTrackCoord(prog, r) {
  const p = ((prog % 1) + 1) % 1;
  const straightLen = sw;
  const turnLen = Math.PI * r;
  const perimeter = 2 * straightLen + 2 * turnLen;
  const dist = p * perimeter;

  if (dist < straightLen) {
    // Bottom straight: moving right
    return { x: cx - sw * 0.5 + dist, y: cy + r, angle: 0 };
  } else if (dist < straightLen + turnLen) {
    // Right turn: bottom to top
    const turnDist = dist - straightLen;
    const theta = Math.PI * 0.5 - (turnDist / turnLen) * Math.PI;
    return { x: cx + sw * 0.5 + Math.cos(theta) * r, y: cy - Math.sin(theta) * r, angle: -Math.PI * 0.5 - theta };
  } else if (dist < 2 * straightLen + turnLen) {
    // Top straight: moving left
    const topDist = dist - (straightLen + turnLen);
    return { x: cx + sw * 0.5 - topDist, y: cy - r, angle: Math.PI };
  } else {
    // Left turn: top to bottom
    const turnDist = dist - (2 * straightLen + turnLen);
    const theta = -Math.PI * 0.5 - (turnDist / turnLen) * Math.PI;
    return { x: cx - sw * 0.5 + Math.cos(theta) * r, y: cy - Math.sin(theta) * r, angle: -Math.PI * 0.5 - theta };
  }
}

// Draw Stadium Background
ctx.fillStyle = '#080a12';
ctx.fillRect(0, 0, W, H);

// Grandstand crowd ambient pulse
const bass = audio.bass ?? 0;
const mid = audio.mid ?? 0;
const treble = audio.treble ?? 0;

if (floodlights) {
  const beamAlpha = 0.08 + bass * 0.12;
  const grad = ctx.createRadialGradient(cx, cy, r0 * 0.5, cx, cy, Math.max(W, H) * 0.65);
  grad.addColorStop(0, `rgba(50, 80, 130, ${beamAlpha * 1.5})`);
  grad.addColorStop(1, 'rgba(8, 10, 18, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// Draw crowd stands
const crowdRows = 3;
ctx.lineWidth = 4;
for (let cr = 0; cr < crowdRows; cr++) {
  const cRadius = rTrackOuter + 22 + cr * 18;
  ctx.strokeStyle = 'rgba(30, 45, 75, 0.4)';
  ctx.beginPath();
  ctx.arc(cx + sw * 0.5, cy, cRadius, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.arc(cx - sw * 0.5, cy, cRadius, Math.PI * 0.5, Math.PI * 1.5);
  ctx.closePath();
  ctx.stroke();

  // Crowd spectator dots
  const dotCount = 42;
  for (let d = 0; d < dotCount; d++) {
    const dp = (d / dotCount) + (cr * 0.03);
    const pos = getTrackCoord(dp, cRadius);
    const bob = Math.sin(t * (3 + cr * 2) * hypeMulti + d) * (2 + bass * 8);
    ctx.fillStyle = `hsla(${(d * 37 + cr * 60) % 360}, 75%, 65%, ${0.35 + bass * 0.45})`;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + bob, 2.5 + (d % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

// Infield grass
ctx.save();
ctx.beginPath();
ctx.arc(cx + sw * 0.5, cy, rTrackInner - 4, -Math.PI * 0.5, Math.PI * 0.5);
ctx.arc(cx - sw * 0.5, cy, rTrackInner - 4, Math.PI * 0.5, Math.PI * 1.5);
ctx.closePath();
ctx.fillStyle = '#0f241a';
ctx.fill();
ctx.strokeStyle = '#1b402e';
ctx.lineWidth = 4;
ctx.stroke();
ctx.restore();

// Function to trace track ribbon path
function traceTrackShape(r) {
  ctx.beginPath();
  ctx.moveTo(cx - sw * 0.5, cy + r);
  ctx.lineTo(cx + sw * 0.5, cy + r);
  ctx.arc(cx + sw * 0.5, cy, r, Math.PI * 0.5, -Math.PI * 0.5, true);
  ctx.lineTo(cx - sw * 0.5, cy - r);
  ctx.arc(cx - sw * 0.5, cy, r, -Math.PI * 0.5, Math.PI * 0.5, true);
  ctx.closePath();
}

// Red Track Base
ctx.save();
traceTrackShape(rTrackOuter);
ctx.fillStyle = '#ba2828';
ctx.fill();
ctx.lineWidth = 3;
ctx.strokeStyle = '#6e1414';
ctx.stroke();

// Lane dividing and boundary white lines
const lines = [rTrackInner, r0 + laneW * 0.5, rTrackOuter];
lines.forEach((r, idx) => {
  traceTrackShape(r);
  ctx.strokeStyle = idx === 1 ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = idx === 1 ? 2.5 : 4;
  if (idx === 1) ctx.setLineDash([12, 14]);
  else ctx.setLineDash([]);
  ctx.stroke();
});
ctx.restore();

// Changeover zones & Checkpoints
for (let leg = 0; leg < totalLegs; leg++) {
  const pLeg = leg / totalLegs;
  const posIn = getTrackCoord(pLeg, rTrackInner - 2);
  const posOut = getTrackCoord(pLeg, rTrackOuter + 2);
  
  ctx.save();
  ctx.strokeStyle = leg === 0 ? '#ffea00' : 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = leg === 0 ? 6 : 3;
  if (leg === 0) ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(posIn.x, posIn.y);
  ctx.lineTo(posOut.x, posOut.y);
  ctx.stroke();
  
  // Checkered finish line at leg 0
  if (leg === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FINISH', (posIn.x + posOut.x) * 0.5, posIn.y + 24);
  } else {
    // Zone number tag
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ZONE ${leg}`, (posIn.x + posOut.x) * 0.5, posIn.y + 20);
  }
  ctx.restore();
}

// DRAW RUNNERS
const teamRadii = [r0, r1];
const teamColors = ['#00f0ff', '#ff0055'];
const teamNames = ['CYAN SPRINT', 'MAGENTA BOLT'];

for (let team = 0; team < 2; team++) {
  const r = teamRadii[team];
  const prog = room.state.teamProgress[team];
  const curLeg = room.state.activeLeg[team];
  const pulse = room.state.pulse[team];
  const isWinner = room.state.winner === team;

  // Draw all legs' waiting runners
  for (let l = 0; l < totalLegs; l++) {
    const assignedPlayer = teamPlayers[team][l % Math.max(1, teamPlayers[team].length)];
    const runnerHue = assignedPlayer ? assignedPlayer.hue : (team === 0 ? 190 : 340);
    const legStartProg = l / totalLegs;
    const isCurrent = (l === curLeg) && (room.state.winner === -1);
    const hasFinished = l < curLeg || room.state.winner !== -1;

    const drawProg = isCurrent ? prog : legStartProg;
    const pos = getTrackCoord(drawProg, r);

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // Pulse ground ring on stride
    if (isCurrent && pulse > 0.05) {
      ctx.beginPath();
      ctx.arc(0, 0, 16 + pulse * 24, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${runnerHue}, 100%, 65%, ${pulse * 0.8})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Running bounce & leg swing
    const runSpeed = isCurrent ? 22 : 4;
    const bounce = isCurrent ? Math.abs(Math.sin(t * runSpeed)) * 9 : Math.sin(t * 3 + l) * 2;
    const swing = isCurrent ? Math.sin(t * runSpeed) * 0.6 : 0;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Runner Body
    ctx.translate(0, -bounce);

    // Legs (animated lines)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4 + swing * 8, 8);
    ctx.moveTo(0, -6);
    ctx.lineTo(4 - swing * 8, 8);
    ctx.stroke();

    // Torso (team hue pill)
    ctx.fillStyle = `hsl(${runnerHue}, 90%, 55%)`;
    ctx.beginPath();
    ctx.ellipse(0, -10, 8, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Head
    ctx.fillStyle = '#fce4c8';
    ctx.beginPath();
    ctx.arc(0, -22, 6, 0, Math.PI * 2);
    ctx.fill();

    // Headband with team color
    ctx.fillStyle = teamColors[team];
    ctx.fillRect(-6, -24, 12, 3);

    // Glowing Baton for the active runner!
    if (isCurrent || isWinner) {
      const batonSwing = Math.sin(t * runSpeed + Math.PI * 0.5) * 6;
      ctx.save();
      ctx.translate(10, -12 + batonSwing);
      ctx.rotate(0.3 + swing * 0.5);
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 12 + bass * 14;
      ctx.fillRect(-2, -10, 4, 20);
      ctx.restore();
    } else if (!hasFinished) {
      // Waiting posture: hands on hips / stretching badge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '900 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`P${(l % 4) + 1}`, 0, -9);
    }

    ctx.restore();
  }
}

// UPDATE & DRAW PARTICLES
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const p = room.state.particles[i];
  p.life -= dt * p.decay;
  if (p.life <= 0) {
    room.state.particles.splice(i, 1);
    continue;
  }
  if (p.lane !== undefined) {
    const r = teamRadii[p.lane];
    const pos = getTrackCoord(p.prog, r);
    pos.x += p.vx * (1 - p.life);
    pos.y += p.vy * (1 - p.life);
    ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  } else {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${p.life})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
}

// HEADER & SCOREBOARD OVERLAY
ctx.save();
// Center Title / Prompt
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.fillStyle = '#ffffff';
ctx.font = '900 34px system-ui, -apple-system, sans-serif';
ctx.shadowColor = 'rgba(0,0,0,0.8)';
ctx.shadowBlur = 10;
ctx.fillText('RELAY RUMBLE', cx, 24);

// Subtext / Press reminder
ctx.font = '700 15px system-ui, sans-serif';
ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
if (idleTime > 3.0 && room.state.winner === -1) {
  const flash = Math.sin(t * 8) > 0 ? '#ffea00' : '#ffffff';
  ctx.fillStyle = flash;
  ctx.fillText('⚡ TAP "RUN!" TO TAKE A STRIDE ⚡', cx, 66);
} else if (room.state.winner === -1) {
  ctx.fillText('MASH "RUN" FOR YOUR TEAM • PASS THE BATON AT EACH ZONE', cx, 66);
}

// Team 0 Card (Top Left)
const cardW = Math.min(W * 0.28, 320);
const cardH = 80;

function drawTeamCard(x, y, teamIdx, align) {
  const color = teamColors[teamIdx];
  const isLeft = align === 'left';
  const score = room.state.scores[teamIdx];
  const curLeg = room.state.activeLeg[teamIdx] + 1;
  const members = teamPlayers[teamIdx];

  ctx.save();
  ctx.translate(x, y);
  
  // Background box
  ctx.fillStyle = 'rgba(12, 16, 26, 0.88)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 + room.state.pulse[teamIdx] * 4;
  ctx.beginPath();
  ctx.roundRect(isLeft ? 0 : -cardW, 0, cardW, cardH, 12);
  ctx.fill();
  ctx.stroke();

  // Accent color pill
  ctx.fillStyle = color;
  ctx.fillRect(isLeft ? 0 : -8, 0, 8, cardH);

  // Team Name & Score
  ctx.font = '900 20px system-ui, sans-serif';
  ctx.textAlign = isLeft ? 'left' : 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(teamNames[teamIdx], isLeft ? 18 : -18, 14);

  ctx.font = '900 36px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(`${score}`, isLeft ? cardW - 24 : -cardW + 24, 14);

  // Leg status & member count
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const memberLabel = members.length > 0 ? `${members.length} RUNNERS` : 'OPEN ROSTER';
  ctx.fillText(`LEG ${curLeg}/${totalLegs} • ${memberLabel}`, isLeft ? 18 : -18, 48);

  ctx.restore();
}

drawTeamCard(30, 24, 0, 'left');
drawTeamCard(W - 30, 24, 1, 'right');

// BIG WINNER BANNER
if (room.state.winner !== -1) {
  const wTeam = room.state.winner;
  const wColor = teamColors[wTeam];
  const wName = teamNames[wTeam];

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, W, H);

  // Victory Ribbon
  const bannerScale = Math.min(1, room.state.winnerTimer * 3);
  ctx.translate(cx, cy);
  ctx.scale(bannerScale, bannerScale);

  ctx.fillStyle = '#101424';
  ctx.strokeStyle = wColor;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(-340, -110, 680, 220, 24);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd700';
  ctx.font = '900 48px system-ui, sans-serif';
  ctx.shadowColor = '#ffea00';
  ctx.shadowBlur = 20;
  ctx.fillText('VICTORY!', 0, -50);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 36px system-ui, sans-serif';
  ctx.shadowBlur = 0;
  ctx.fillText(`${wName} WINS!`, 0, 10);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '700 20px system-ui, sans-serif';
  const countdown = Math.max(0, Math.ceil(4.5 - room.state.winnerTimer));
  ctx.fillText(`NEXT HEAT IN ${countdown}...`, 0, 65);

  ctx.restore();
}

ctx.restore();
