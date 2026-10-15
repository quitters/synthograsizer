ctx.save();

const W = frame.width;
const H = frame.height;
const now = frame.t;
const dt = Math.min(frame.dt, 0.1);

// Retrieve Controls
const layout = getVar('track_layout') || 'Grand Spiral';
const tileTheme = getVar('tile_theme') || 'Neon Arcade';
const floorStyle = getVar('floor_style') || 'Holodeck Grid';
const toppleSpeed = getVar('topple_speed') ?? 35;
const sparkFx = getVar('spark_fx') ?? true;

// State Initialization
room.state.dominos ??= [];
room.state.phase ??= 'building'; // 'building' | 'toppling' | 'victory'
room.state.toppleProgress ??= 0;
room.state.lastInteractTime ??= now;
room.state.victoryTimer ??= 0;
room.state.round ??= 1;
room.state.playerScores ??= {};
room.state.sparks ??= [];
room.state.shocks ??= [];
room.state.camShake ??= 0;
room.state.autoTimer ??= 0;
room.state.winner ??= null;

const MAX_DOMINOS = 160;
const people = room.people || [];

// Helper: Track Point Generator
function getTrackPoint(idx, style, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.52;
  let x, y, dx, dy;
  if (style === 'Twin Vortex') {
    const scale = Math.min(w, h) * 0.42;
    const t = idx * 0.052 + 0.1;
    const denom = 1 + Math.sin(t) * Math.sin(t);
    x = cx + (scale * Math.cos(t)) / denom;
    y = cy + (scale * Math.sin(t) * Math.cos(t) * 1.45) / denom;
    const dt = 0.01;
    const t2 = t + dt;
    const denom2 = 1 + Math.sin(t2) * Math.sin(t2);
    const x2 = cx + (scale * Math.cos(t2)) / denom2;
    const y2 = cy + (scale * Math.sin(t2) * Math.cos(t2) * 1.45) / denom2;
    dx = x2 - x;
    dy = y2 - y;
  } else if (style === 'Cosmic Meander') {
    const t = idx * 0.046 + 0.2;
    const rx = w * 0.38;
    const ry = h * 0.34;
    x = cx + Math.sin(t * 2) * rx * 0.88;
    y = cy + Math.sin(t * 3) * ry * 0.88;
    const dt = 0.01;
    const t2 = t + dt;
    const x2 = cx + Math.sin(t2 * 2) * rx * 0.88;
    const y2 = cy + Math.sin(t2 * 3) * ry * 0.88;
    dx = x2 - x;
    dy = y2 - y;
  } else {
    // Grand Spiral
    const scale = Math.min(w, h) / 720;
    const theta = idx * 0.185 + 0.35;
    const r = 52 + Math.pow(idx, 0.85) * 5.4 * scale;
    x = cx + Math.cos(theta) * r;
    y = cy + Math.sin(theta) * r * 0.82;
    const dTh = 0.015;
    const theta2 = theta + dTh;
    const r2 = 52 + Math.pow(idx + 0.08, 0.85) * 5.4 * scale;
    const x2 = cx + Math.cos(theta2) * r2;
    const y2 = cy + Math.sin(theta2) * r2 * 0.82;
    dx = x2 - x;
    dy = y2 - y;
  }
  return { x, y, angle: Math.atan2(dy, dx) };
}

// Spawn a domino
function placeDomino(hue, label) {
  if (room.state.dominos.length >= MAX_DOMINOS) return;
  const idx = room.state.dominos.length;
  const pt = getTrackPoint(idx, layout, W, H);
  room.state.dominos.push({
    x: pt.x,
    y: pt.y,
    angle: pt.angle,
    hue: hue,
    label: label,
    fall: 0,
    spawnT: now
  });
  // Add placement puff
  if (room.state.shocks.length < 24) {
    room.state.shocks.push({ x: pt.x, y: pt.y, r: 6, maxR: 38, hue: hue, alpha: 0.95 });
  }
  room.state.camShake = Math.min(room.state.camShake + 0.8, 4);
}

// Process Interactive Triggers
let placedThisFrame = false;
let toppleTriggered = false;
if (room.events && room.events.length > 0) {
  for (const ev of room.events) {
    if (ev.name === 'place') {
      room.state.lastInteractTime = now;
      if (room.state.phase === 'building') {
        const p = people.find(usr => usr.id === ev.participantId);
        const hue = p ? p.hue : ((ev.participantId ? ev.participantId.charCodeAt(0) * 53 : Math.random() * 360) % 360);
        const name = p ? (p.table || 'Player') : 'Guest';
        const key = p ? p.id : ('hue_' + Math.floor(hue));
        room.state.playerScores[key] = room.state.playerScores[key] || { count: 0, hue, name };
        room.state.playerScores[key].count++;
        placeDomino(hue, name);
        placedThisFrame = true;
      }
    } else if (ev.name === 'topple') {
      room.state.lastInteractTime = now;
      toppleTriggered = true;
    }
  }
}

// Manual topple trigger handling
if (toppleTriggered && room.state.phase === 'building' && room.state.dominos.length >= 4) {
  room.state.phase = 'toppling';
  room.state.toppleProgress = 0;
}

// Attract Mode: automatically places or topples if idle
const idleTime = now - room.state.lastInteractTime;
if (idleTime > 2.2 && room.state.phase === 'building') {
  room.state.autoTimer += dt;
  if (room.state.autoTimer > 0.22) {
    room.state.autoTimer = 0;
    if (room.state.dominos.length < 130) {
      let hue = (now * 45) % 360;
      let name = 'Attract';
      if (people.length > 0) {
        const p = people[room.state.dominos.length % people.length];
        hue = p.hue;
        name = p.table || 'Dancer';
      }
      const key = name;
      room.state.playerScores[key] = room.state.playerScores[key] || { count: 0, hue, name };
      room.state.playerScores[key].count++;
      placeDomino(hue, name);
    } else {
      // Full track in attract mode: auto topple
      room.state.phase = 'toppling';
      room.state.toppleProgress = 0;
    }
  }
} else if (idleTime <= 2.2) {
  room.state.autoTimer = 0;
}

// Update Toppling Physics
if (room.state.phase === 'toppling') {
  const prevProg = room.state.toppleProgress;
  room.state.toppleProgress += toppleSpeed * dt * (1 + audio.bass * 0.4);
  const currentProg = room.state.toppleProgress;

  for (let i = 0; i < room.state.dominos.length; i++) {
    const d = room.state.dominos[i];
    if (currentProg >= i) {
      const prevFall = d.fall;
      d.fall = Math.min(1, (currentProg - i) * 1.6);

      // Impact trigger (slapping flat on floor)
      if (prevFall < 0.92 && d.fall >= 0.92) {
        room.state.camShake = Math.min(room.state.camShake + 1.2, 5);
        if (room.state.shocks.length < 30) {
          room.state.shocks.push({ x: d.x, y: d.y, r: 4, maxR: 26, hue: d.hue, alpha: 0.9 });
        }
        if (sparkFx && room.state.sparks.length < 90) {
          for (let s = 0; s < 4; s++) {
            const spd = 50 + Math.random() * 120 + audio.treble * 80;
            const spkAng = d.angle + (Math.random() - 0.5) * 2.2;
            room.state.sparks.push({
              x: d.x,
              y: d.y,
              vx: Math.cos(spkAng) * spd,
              vy: Math.sin(spkAng) * spd,
              life: 1.0,
              decay: 1.8 + Math.random() * 1.6,
              hue: d.hue
            });
          }
        }
      }
    }
  }

  // Topple run complete -> Victory phase
  if (currentProg >= room.state.dominos.length + 1) {
    room.state.phase = 'victory';
    room.state.victoryTimer = 3.6;
    // Find MVP winner
    let bestScore = -1;
    let champ = { name: 'Everyone', hue: 45, count: room.state.dominos.length };
    for (const k in room.state.playerScores) {
      if (room.state.playerScores[k].count > bestScore) {
        bestScore = room.state.playerScores[k].count;
        champ = room.state.playerScores[k];
      }
    }
    room.state.winner = champ;
    // Grand victory fireworks burst
    if (sparkFx) {
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 220;
        room.state.sparks.push({
          x: W * 0.5,
          y: H * 0.5,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1.2,
          decay: 0.8 + Math.random() * 0.8,
          hue: champ.hue + (Math.random() - 0.5) * 40
        });
      }
    }
  }
}

// Update Victory Phase & Auto-Reset
if (room.state.phase === 'victory') {
  room.state.victoryTimer -= dt;
  if (room.state.victoryTimer <= 0) {
    room.state.dominos = [];
    room.state.phase = 'building';
    room.state.toppleProgress = 0;
    room.state.playerScores = {};
    room.state.winner = null;
    room.state.round++;
  }
}

// Update Sparks & Shocks
room.state.camShake *= Math.pow(0.04, dt);
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const sp = room.state.sparks[i];
  sp.x += sp.vx * dt;
  sp.y += sp.vy * dt;
  sp.life -= sp.decay * dt;
  if (sp.life <= 0) room.state.sparks.splice(i, 1);
}
for (let i = room.state.shocks.length - 1; i >= 0; i--) {
  const sk = room.state.shocks[i];
  sk.r += (sk.maxR - sk.r) * 12 * dt;
  sk.alpha -= 2.2 * dt;
  if (sk.alpha <= 0) room.state.shocks.splice(i, 1);
}

// Camera Shake Offset
const shakeX = (Math.random() - 0.5) * room.state.camShake * 3;
const shakeY = (Math.random() - 0.5) * room.state.camShake * 3;

// 1. Draw Floor
ctx.save();
ctx.translate(shakeX, shakeY);

if (floorStyle === 'Dark Velvet') {
  const rad = ctx.createRadialGradient(W * 0.5, H * 0.5, 50, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
  rad.addColorStop(0, '#16091f');
  rad.addColorStop(1, '#07020a');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);
} else if (floorStyle === 'Cyber Circuit') {
  ctx.fillStyle = '#060d14';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(30, 95, 120, ${0.12 + audio.bass * 0.15})`;
  ctx.lineWidth = 1;
  const step = 64;
  ctx.beginPath();
  for (let x = 0; x < W; x += step) {
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let y = 0; y < H; y += step) {
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
} else {
  // Holodeck Grid (Perspective Grid)
  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, W, H);
  const gridColor = `rgba(0, 220, 255, ${0.08 + audio.bass * 0.14})`;
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1.2;
  const gSize = 56;
  ctx.beginPath();
  for (let x = 0; x < W; x += gSize) {
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let y = 0; y < H; y += gSize) {
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
  // Subtle central ambient floor glow
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.52, 40, W * 0.5, H * 0.52, W * 0.45);
  glow.addColorStop(0, `rgba(0, 160, 255, ${0.08 + audio.mid * 0.1})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

// 2. Draw Track Projection Guide (subtle dotted track line)
ctx.save();
ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 + audio.treble * 0.08})`;
ctx.lineWidth = 2.5;
ctx.setLineDash([4, 10]);
ctx.beginPath();
for (let i = 0; i < MAX_DOMINOS; i += 2) {
  const p = getTrackPoint(i, layout, W, H);
  if (i === 0) ctx.moveTo(p.x, p.y);
  else ctx.lineTo(p.x, p.y);
}
ctx.stroke();
ctx.restore();

// 3. Draw Floor Shockwaves
for (let i = 0; i < room.state.shocks.length; i++) {
  const sk = room.state.shocks[i];
  ctx.save();
  ctx.beginPath();
  ctx.arc(sk.x, sk.y, sk.r, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${sk.hue}, 100%, 70%, ${sk.alpha})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = `hsl(${sk.hue}, 100%, 60%)`;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();
}

// 4. Draw Dominoes
const count = room.state.dominos.length;
for (let i = 0; i < count; i++) {
  const d = room.state.dominos[i];
  const isHead = (i === count - 1) && (room.state.phase === 'building');
  const fall = d.fall;
  const fallRad = fall * 1.5708; // 0 to 90 degrees

  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.angle);

  // Floor shadow (elongates as it leans)
  const shadowLen = 14 + fall * 18;
  ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * (1 - fall * 0.3)})`;
  ctx.beginPath();
  ctx.ellipse(shadowLen * 0.4, 4, shadowLen * 0.6, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Domino Dimensions
  const dw = 12;
  const dl = 26;
  const dh = 20 * Math.cos(fallRad);
  const fwd = dl * 0.7 * Math.sin(fallRad);

  // Extrusion Side Wall
  if (dh > 1.8) {
    ctx.fillStyle = `hsl(${d.hue}, 85%, 22%)`;
    ctx.beginPath();
    ctx.rect(-dw * 0.5, -dh, dw, dh);
    ctx.fill();
  }

  // Top Face (standing upright or pitched flat)
  ctx.save();
  ctx.translate(fwd, -dh);

  if (tileTheme === 'Neon Arcade') {
    ctx.fillStyle = `hsl(${d.hue}, 95%, ${48 + (isHead ? 25 : 0) + audio.bass * 12}%)`;
    if (sparkFx || isHead) {
      ctx.shadowColor = `hsl(${d.hue}, 100%, 60%)`;
      ctx.shadowBlur = isHead ? 18 : 6;
    }
  } else if (tileTheme === 'Cyber Glass') {
    ctx.fillStyle = `hsla(${d.hue}, 85%, 65%, 0.88)`;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
  } else {
    // Obsidian Gold
    ctx.fillStyle = `hsl(${d.hue}, 30%, 18%)`;
    ctx.strokeStyle = `hsl(45, 95%, 62%)`;
    ctx.lineWidth = 1.6;
  }

  ctx.beginPath();
  ctx.roundRect(-dw * 0.5, -dl * 0.5, dw, dl, 2.5);
  ctx.fill();
  if (tileTheme !== 'Neon Arcade') ctx.stroke();

  // Pips & Divider
  ctx.fillStyle = (tileTheme === 'Obsidian Gold') ? 'hsl(45, 95%, 70%)' : '#ffffff';
  ctx.fillRect(-dw * 0.45, -0.6, dw * 0.9, 1.2);
  ctx.beginPath();
  ctx.arc(0, -dl * 0.25, 1.8, 0, Math.PI * 2);
  ctx.arc(0, dl * 0.25, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

// 5. Draw Sparks
if (sparkFx && room.state.sparks.length > 0) {
  ctx.save();
  for (let i = 0; i < room.state.sparks.length; i++) {
    const sp = room.state.sparks[i];
    ctx.fillStyle = `hsla(${sp.hue}, 100%, 75%, ${sp.life})`;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 2.2 * sp.life + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

ctx.restore(); // Restore Camera Shake & Floor transform

// 6. Draw HUD & Large Status Banners (Legible from distance)
ctx.save();

// Top Status Bar
ctx.font = '900 24px system-ui, -apple-system, sans-serif';
ctx.fillStyle = '#ffffff';
ctx.shadowColor = 'rgba(0,0,0,0.8)';
ctx.shadowBlur = 6;
ctx.fillText(`ROUND ${String(room.state.round).padStart(2, '0')}`, 40, 52);

// Domino Counter & Capacity Pill
const countText = `${count} / ${MAX_DOMINOS} DOMINOES`;
ctx.font = '700 18px system-ui, sans-serif';
ctx.fillStyle = count >= MAX_DOMINOS ? '#ff4d4d' : 'rgba(255, 255, 255, 0.75)';
ctx.fillText(countText, 40, 80);

// Connected Player Roster (Right Side)
const pList = people.length > 0 ? people : Object.values(room.state.playerScores);
const showPlayers = pList.slice(0, 16);
const pillStartX = W - 40;
let curX = pillStartX;

for (let i = showPlayers.length - 1; i >= 0; i--) {
  const p = showPlayers[i];
  const pHue = p.hue ?? 180;
  const pScore = p.id && room.state.playerScores[p.id] ? room.state.playerScores[p.id].count : (p.count || 0);
  const tag = (p.table ? p.table.slice(0, 6) : (p.name || 'P' + (i + 1))) + `:${pScore}`;
  
  ctx.font = '800 13px system-ui, sans-serif';
  const tw = ctx.measureText(tag).width + 24;
  curX -= (tw + 8);
  if (curX < 300) break;

  // Player pill badge
  ctx.fillStyle = `hsla(${pHue}, 75%, 15%, 0.85)`;
  ctx.strokeStyle = `hsl(${pHue}, 90%, 55%)`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(curX, 34, tw, 26, 13);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `hsl(${pHue}, 95%, 70%)`;
  ctx.beginPath();
  ctx.arc(curX + 11, 47, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(tag, curX + 20, 52);
}

// Center Action Prompts and State Banners
if (room.state.phase === 'building') {
  const bannerY = H - 56;
  ctx.textAlign = 'center';
  
  const isIdle = idleTime > 2.2;
  const pulse = Math.sin(now * 5) * 0.15 + 0.85;
  
  ctx.fillStyle = 'rgba(8, 12, 22, 0.85)';
  ctx.strokeStyle = isIdle ? 'rgba(255, 180, 0, 0.6)' : 'rgba(0, 220, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(W * 0.5 - 340, bannerY - 32, 680, 48, 24);
  ctx.fill();
  ctx.stroke();

  ctx.font = '900 20px system-ui, sans-serif';
  if (isIdle) {
    ctx.fillStyle = `rgba(255, 200, 50, ${pulse})`;
    ctx.fillText('⚡ AUTO-RALLY ACTIVE • TAP [PLACE] TO JOIN IN!', W * 0.5, bannerY);
  } else {
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
    ctx.fillText('PRESS [PLACE] TO EXTEND • HOLD [TOPPLE] TO LAUNCH!', W * 0.5, bannerY);
  }
} else if (room.state.phase === 'toppling') {
  // Dramatic Topple Bar
  ctx.textAlign = 'center';
  const prog = Math.min(1, room.state.toppleProgress / Math.max(1, count));
  
  ctx.fillStyle = '#ff2255';
  ctx.font = '900 36px Impact, system-ui, sans-serif';
  ctx.shadowColor = 'rgba(255, 34, 85, 0.8)';
  ctx.shadowBlur = 16;
  ctx.fillText('⚡ CHAIN REACTION! ⚡', W * 0.5, 105);

  // Racing Progress Bar
  const barW = Math.min(600, W * 0.6);
  const barH = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(W * 0.5 - barW * 0.5, 125, barW, barH);
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(W * 0.5 - barW * 0.5, 125, barW * prog, barH);
} else if (room.state.phase === 'victory') {
  // Full Center Victory Screen
  ctx.textAlign = 'center';
  const champ = room.state.winner || { name: 'The Room', hue: 50, count: count };

  ctx.fillStyle = 'rgba(5, 5, 14, 0.82)';
  ctx.fillRect(0, H * 0.34, W, H * 0.32);

  ctx.strokeStyle = `hsl(${champ.hue}, 100%, 55%)`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.34); ctx.lineTo(W, H * 0.34);
  ctx.moveTo(0, H * 0.66); ctx.lineTo(W, H * 0.66);
  ctx.stroke();

  ctx.font = '900 64px Impact, system-ui, sans-serif';
  ctx.fillStyle = `hsl(${champ.hue}, 100%, 65%)`;
  ctx.shadowColor = `hsl(${champ.hue}, 100%, 50%)`;
  ctx.shadowBlur = 24;
  ctx.fillText(`🏆 ${champ.name.toUpperCase()} WINS! 🏆`, W * 0.5, H * 0.46);

  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.fillText(`Placed ${champ.count} Dominoes in this run! Next round starting...`, W * 0.5, H * 0.54);
}

ctx.restore();
ctx.restore();