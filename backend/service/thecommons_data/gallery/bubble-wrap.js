const cols = Math.round(getVar('bubble_columns') ?? 16);
const style = getVar('bubble_style') ?? 'glossy';
const tempo = getVar('speed_mode') ?? 'party';
const beatPops = getVar('beat_pops') ?? true;

// Init persistent state
room.state.bubbles ??= [];
room.state.particles ??= [];
room.state.scores ??= {};
room.state.lastPopTime ??= frame.t;
room.state.lastCols ??= cols;
room.state.sheetState ??= 'playing'; // 'playing', 'won', 'unrolling'
room.state.winTime ??= 0;
room.state.unrollProgress ??= 1;
room.state.totalPops ??= 0;
room.state.winnerHue ??= 45;
room.state.winnerName ??= 'Player';

// Helper to reinitialize grid
function initGrid(numCols) {
  const rows = Math.round(numCols * 0.5625); // 16:9 ratio approx
  const total = numCols * rows;
  const b = [];
  for (let i = 0; i < total; i++) {
    b.push({
      popped: false,
      popT: 0,
      hue: 0,
      scale: 1,
      wobble: Math.random() * Math.PI * 2
    });
  }
  room.state.bubbles = b;
  room.state.cols = numCols;
  room.state.rows = rows;
  room.state.scores = {};
  room.state.totalPops = 0;
  room.state.sheetState = 'unrolling';
  room.state.unrollProgress = 0;
}

if (room.state.bubbles.length === 0 || room.state.lastCols !== cols) {
  room.state.lastCols = cols;
  initGrid(cols);
}

const curCols = room.state.cols || cols;
const curRows = room.state.rows || Math.round(cols * 0.5625);
const totalBubbles = curCols * curRows;

// Parse events
const popEvents = [];
if (room.events) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'pop') {
      popEvents.push(ev);
    } else if (ev.name === 'reset') {
      initGrid(curCols);
    }
  }
}

// Attract mode auto-pop timer & beat pop
const idleIntervals = { chill: 2.5, party: 1.2, frenzy: 0.6 };
const idleLimit = idleIntervals[tempo] ?? 1.2;
if (frame.t - room.state.lastPopTime > idleLimit) {
  const dummyHue = Math.floor((frame.t * 30) % 360);
  popEvents.push({ participantId: 'ghost', fakeHue: dummyHue });
}

if (beatPops && audio.beat && audio.bass > 0.65 && room.state.sheetState === 'playing') {
  if (Math.random() < 0.45) {
    const pHue = (room.people && room.people.length > 0) 
      ? room.people[Math.floor(Math.random() * room.people.length)].hue 
      : 180;
    popEvents.push({ participantId: 'beat', fakeHue: pHue });
  }
}

// Process pops
function popOneBubble(hue, pId) {
  if (room.state.sheetState !== 'playing') return;
  const unpopped = [];
  const bList = room.state.bubbles;
  for (let i = 0; i < bList.length; i++) {
    if (!bList[i].popped) unpopped.push(i);
  }
  if (unpopped.length === 0) return;
  
  const pickIdx = unpopped[Math.floor(Math.random() * unpopped.length)];
  const b = bList[pickIdx];
  b.popped = true;
  b.popT = frame.t;
  b.hue = hue;
  
  room.state.totalPops++;
  room.state.lastPopTime = frame.t;
  
  // Track score
  const scoreKey = pId || ('hue-' + hue);
  room.state.scores[scoreKey] = (room.state.scores[scoreKey] || 0) + 1;
  
  // Burst particles & shockwave
  const colW = frame.width / curCols;
  const rowH = frame.height / curRows;
  const c = pickIdx % curCols;
  const r = Math.floor(pickIdx / curCols);
  const cx = (c + 0.5) * colW;
  const cy = (r + 0.5) * rowH;
  const radius = Math.min(colW, rowH) * 0.42;
  
  // Add particles (bounded pool)
  const pCount = 14;
  for (let k = 0; k < pCount; k++) {
    if (room.state.particles.length > 180) room.state.particles.shift();
    const ang = (Math.PI * 2 * k) / pCount + (Math.random() - 0.5) * 0.4;
    const spd = (radius * 3.5 + Math.random() * radius * 4.5) * (1 + audio.bass);
    room.state.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      hue: hue,
      life: 1.0,
      decay: 1.8 + Math.random() * 1.2,
      size: radius * (0.18 + Math.random() * 0.2)
    });
  }
  
  // Add shockwave ring
  if (room.state.particles.length > 180) room.state.particles.shift();
  room.state.particles.push({
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    hue: hue,
    life: 1.0,
    decay: 2.2,
    size: radius,
    isRing: true
  });
  
  // Check round end
  if (unpopped.length <= 1) {
    room.state.sheetState = 'won';
    room.state.winTime = frame.t;
    let topScore = -1;
    let topKey = null;
    for (const k in room.state.scores) {
      if (room.state.scores[k] > topScore) {
        topScore = room.state.scores[k];
        topKey = k;
      }
    }
    let winnerPerson = (room.people || []).find(p => p.id === topKey);
    room.state.winnerHue = winnerPerson ? winnerPerson.hue : (hue || 45);
    room.state.winnerName = winnerPerson ? ('TABLE ' + (winnerPerson.table || '1')) : 'HOT POPPER';
  }
}

// Handle events
for (let i = 0; i < popEvents.length; i++) {
  const ev = popEvents[i];
  let p = (room.people || []).find(person => person.id === ev.participantId);
  let h = p ? p.hue : (ev.fakeHue !== undefined ? ev.fakeHue : ((frame.t * 60) % 360));
  popOneBubble(h, ev.participantId);
}

// Win state transition to unroll
if (room.state.sheetState === 'won') {
  if (frame.t - room.state.winTime > 4.5) {
    initGrid(curCols);
  }
}

// Unroll animation progression
if (room.state.sheetState === 'unrolling') {
  room.state.unrollProgress += frame.dt * 1.8;
  if (room.state.unrollProgress >= 1) {
    room.state.unrollProgress = 1;
    room.state.sheetState = 'playing';
  }
}

// DRAWING
ctx.save();
// Deep rich textured background
ctx.fillStyle = '#0a0b10';
ctx.fillRect(0, 0, frame.width, frame.height);

const colW = frame.width / curCols;
const rowH = frame.height / curRows;
const baseRadius = Math.min(colW, rowH) * 0.43;
const unrollY = room.state.sheetState === 'unrolling' 
  ? frame.height * room.state.unrollProgress 
  : frame.height;

// Draw Bubble Grid
const bubbles = room.state.bubbles;
for (let i = 0; i < bubbles.length; i++) {
  const b = bubbles[i];
  const c = i % curCols;
  const r = Math.floor(i / curCols);
  const cx = (c + 0.5) * colW;
  const cy = (r + 0.5) * rowH;
  
  // Clip by unroll sheet
  if (cy - baseRadius > unrollY) continue;
  
  const pulse = Math.sin(frame.t * 3.5 + b.wobble) * (0.03 + audio.bass * 0.08);
  const rad = baseRadius * (1 + pulse);
  
  if (!b.popped) {
    // Intact bubble
    ctx.save();
    ctx.translate(cx, cy);
    
    // Bubble outer membrane
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    
    if (style === 'neon_glow') {
      ctx.strokeStyle = `hsla(${200 + audio.treble * 60}, 90%, 65%, 0.75)`;
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(20, 35, 60, 0.4)';
      ctx.shadowColor = 'rgba(0, 180, 255, 0.5)';
      ctx.shadowBlur = 8 + audio.mid * 10;
      ctx.fill();
      ctx.stroke();
    } else if (style === 'iridescent') {
      const grad = ctx.createLinearGradient(-rad, -rad, rad, rad);
      const h1 = (frame.t * 25 + c * 10 + r * 15) % 360;
      grad.addColorStop(0, `hsla(${h1}, 80%, 60%, 0.35)`);
      grad.addColorStop(0.5, `hsla(${(h1 + 60) % 360}, 90%, 75%, 0.2)`);
      grad.addColorStop(1, `hsla(${(h1 + 140) % 360}, 85%, 65%, 0.4)`);
      ctx.fillStyle = grad;
      ctx.strokeStyle = `hsla(${h1}, 90%, 80%, 0.6)`;
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();
    } else {
      // Glossy transparent film
      ctx.fillStyle = 'rgba(60, 85, 120, 0.22)';
      ctx.strokeStyle = 'rgba(160, 205, 255, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();
    }
    
    // Glossy 3D crescent highlights
    ctx.beginPath();
    ctx.ellipse(-rad * 0.32, -rad * 0.32, rad * 0.35, rad * 0.18, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(rad * 0.28, rad * 0.28, rad * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();
    ctx.restore();
  } else {
    // Popped bubble: deflated crater with player color
    ctx.save();
    ctx.translate(cx, cy);
    const dtPop = frame.t - b.popT;
    const shrink = Math.max(0.72, 1.2 - dtPop * 1.5);
    
    ctx.beginPath();
    ctx.arc(0, 0, rad * shrink * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${b.hue}, 85%, 20%, 0.55)`;
    ctx.strokeStyle = `hsla(${b.hue}, 95%, 60%, 0.85)`;
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
    
    // Crinkle folds
    ctx.beginPath();
    for (let f = 0; f < 6; f++) {
      const fa = (f * Math.PI) / 3;
      ctx.moveTo(Math.cos(fa) * rad * 0.2, Math.sin(fa) * rad * 0.2);
      ctx.lineTo(Math.cos(fa) * rad * 0.72, Math.sin(fa) * rad * 0.72);
    }
    ctx.strokeStyle = `hsla(${b.hue}, 90%, 75%, 0.45)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

// Sheet unroll curl bar
if (room.state.sheetState === 'unrolling' && unrollY < frame.height) {
  ctx.save();
  const curlH = 34;
  const curlGrad = ctx.createLinearGradient(0, unrollY - curlH, 0, unrollY + curlH * 0.5);
  curlGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  curlGrad.addColorStop(0.5, 'rgba(220, 240, 255, 0.9)');
  curlGrad.addColorStop(0.8, 'rgba(100, 160, 220, 0.4)');
  curlGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = curlGrad;
  ctx.fillRect(0, unrollY - curlH, frame.width, curlH * 1.5);
  ctx.restore();
}

// Update & Draw Particles
const pList = room.state.particles;
for (let i = pList.length - 1; i >= 0; i--) {
  const p = pList[i];
  p.life -= frame.dt * p.decay;
  if (p.life <= 0) {
    pList.splice(i, 1);
    continue;
  }
  
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  
  ctx.save();
  if (p.isRing) {
    const ringR = p.size + (1.0 - p.life) * baseRadius * 2.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${p.hue}, 95%, 70%, ${p.life * 0.85})`;
    ctx.lineWidth = 5 * p.life;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
    ctx.shadowColor = `hsla(${p.hue}, 100%, 50%, 0.8)`;
    ctx.shadowBlur = 10;
    ctx.fill();
  }
  ctx.restore();
}

// TOP HUD: Big Legible Score Bar for Party Wall
ctx.save();
const hudH = 68;
ctx.fillStyle = 'rgba(10, 12, 20, 0.82)';
ctx.fillRect(0, 0, frame.width, hudH);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(0, hudH); ctx.lineTo(frame.width, hudH); ctx.stroke();

// Pops remaining & action text
const remaining = bubbles.filter(b => !b.popped).length;
ctx.fillStyle = '#ffffff';
ctx.font = '900 28px sans-serif';
ctx.textBaseline = 'middle';
ctx.textAlign = 'left';
ctx.fillText(`POPS: ${room.state.totalPops} / ${totalBubbles}`, 24, hudH * 0.5);

// Center Call to Action or Leaderboard
const peopleList = room.people || [];
if (room.state.sheetState === 'playing') {
  if (peopleList.length <= 6) {
    // Render colored avatars / badges for present room people
    let startX = frame.width * 0.44;
    for (let k = 0; k < peopleList.length; k++) {
      const person = peopleList[k];
      const pScore = room.state.scores[person.id] || 0;
      ctx.fillStyle = `hsl(${person.hue}, 90%, 60%)`;
      ctx.beginPath();
      ctx.arc(startX + k * 95, hudH * 0.5, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${pScore}`, startX + k * 95, hudH * 0.5);
    }
  } else {
    ctx.textAlign = 'center';
    ctx.font = '900 28px sans-serif';
    ctx.fillStyle = '#ffd100';
    ctx.fillText('SMASH [POP]!', frame.width * 0.52, hudH * 0.5);
  }
}

// Right side: Remaining counter pill
ctx.textAlign = 'right';
ctx.font = '900 26px sans-serif';
ctx.fillStyle = remaining < 10 ? '#ff3b30' : '#4cd964';
ctx.fillText(`${remaining} LEFT`, frame.width - 28, hudH * 0.5);
ctx.restore();

// OVERLAY: WINNER CELEBRATION OVERLAY
if (room.state.sheetState === 'won') {
  ctx.save();
  ctx.fillStyle = 'rgba(5, 7, 15, 0.72)';
  ctx.fillRect(0, 0, frame.width, frame.height);
  
  const pulseWin = 1 + Math.sin(frame.t * 8) * 0.05 + audio.bass * 0.1;
  ctx.translate(frame.width * 0.5, frame.height * 0.48);
  ctx.scale(pulseWin, pulseWin);
  
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Big glowing badge
  ctx.beginPath();
  ctx.arc(0, -90, 75, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${room.state.winnerHue}, 90%, 55%)`;
  ctx.shadowColor = `hsl(${room.state.winnerHue}, 100%, 65%)`;
  ctx.shadowBlur = 35;
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 70px sans-serif';
  ctx.fillText('POP!', 0, -88);
  
  ctx.fillStyle = '#ffd100';
  ctx.font = '900 58px sans-serif';
  ctx.shadowBlur = 20;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.fillText('SHEET CLEARED!', 0, 30);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 36px sans-serif';
  ctx.fillText(`WINNER: ${room.state.winnerName}`, 0, 95);
  
  ctx.font = '700 22px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('NEW SHEET UNROLLING SOON...', 0, 145);
  ctx.restore();
}

ctx.restore();