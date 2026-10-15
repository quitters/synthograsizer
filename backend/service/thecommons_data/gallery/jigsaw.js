ctx.save();
const W = frame.width;
const H = frame.height;
const artTheme = getVar('puzzle_art') ?? 'neon_totem';
const gridSizeKey = getVar('grid_size') ?? '4x3 classic';
const fxIntensity = getVar('fx_intensity') ?? 3;
const showHints = getVar('show_hints') ?? true;

const gridDims = {
  '3x3 compact': [3, 3],
  '4x3 classic': [4, 3],
  '4x4 balanced': [4, 4],
  '5x4 intricate': [5, 4]
}[gridSizeKey] ?? [4, 3];
const cols = gridDims[0];
const rows = gridDims[1];
const totalPieces = cols * rows;

// Init persistent state
room.state.round ??= 1;
room.state.status ??= 'playing'; // 'playing' | 'complete' | 'resetting'
room.state.statusT ??= frame.t;
room.state.pieces ??= [];
room.state.sparks ??= [];
room.state.scores ??= {};
room.state.lastWinner ??= null;
room.state.lastActionT ??= frame.t;
room.state.banner ??= 'PRESS PLACE TO SNAP!';
room.state.bannerT ??= frame.t;

// Puzzle board bounds
const boardW = Math.min(W * 0.58, H * 0.85 * (cols / rows));
const boardH = boardW * (rows / cols);
const boardX = (W - boardW) * 0.5;
const boardY = (H - boardH) * 0.5 + 20;
const cw = boardW / cols;
const ch = boardH / rows;

// Rebuild board on new round or size change
const needsReset = room.state.pieces.length !== totalPieces || room.state.currTheme !== artTheme;
if (needsReset) {
  room.state.currTheme = artTheme;
  room.state.pieces = [];
  // Deterministic tabs: horizontal interior edges & vertical interior edges
  const hTabs = [];
  for (let r = 0; r < rows - 1; r++) {
    hTabs[r] = [];
    for (let c = 0; c < cols; c++) hTabs[r][c] = ((r * 17 + c * 31 + room.state.round) % 2 === 0) ? 1 : -1;
  }
  const vTabs = [];
  for (let r = 0; r < rows; r++) {
    vTabs[r] = [];
    for (let c = 0; c < cols - 1; c++) vTabs[r][c] = ((r * 23 + c * 13 + room.state.round) % 2 === 0) ? 1 : -1;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      // Scatter position along outer margins
      const side = (id + room.state.round) % 4;
      let sx = 0, sy = 0;
      if (side === 0) { sx = Math.random() * (boardX - cw * 0.8); sy = Math.random() * H; }
      else if (side === 1) { sx = boardX + boardW + Math.random() * (W - boardX - boardW - cw * 0.5); sy = Math.random() * H; }
      else if (side === 2) { sx = Math.random() * W; sy = Math.random() * (boardY - ch * 0.8); }
      else { sx = Math.random() * W; sy = boardY + boardH + Math.random() * (H - boardY - boardH - ch * 0.5); }

      room.state.pieces.push({
        id, r, c,
        tx: boardX + c * cw,
        ty: boardY + r * ch,
        x: Math.max(cw * 0.6, Math.min(W - cw * 0.6, sx)),
        y: Math.max(ch * 0.6, Math.min(H - ch * 0.6, sy)),
        rot: (Math.random() - 0.5) * 1.2,
        placed: false,
        snapProgress: 0,
        hue: 0,
        who: '',
        // Tabs: [top, right, bottom, left] (1 = out, -1 = in, 0 = flat boundary)
        topTab: r === 0 ? 0 : -hTabs[r - 1][c],
        bottomTab: r === rows - 1 ? 0 : hTabs[r][c],
        leftTab: c === 0 ? 0 : -vTabs[r][c - 1],
        rightTab: c === cols - 1 ? 0 : vTabs[r][c]
      });
    }
  }
  room.state.status = 'playing';
  room.state.statusT = frame.t;
}

// Particle burst helper
function spawnBurst(x, y, hue, count) {
  for (let i = 0; i < count; i++) {
    if (room.state.sparks.length >= 180) room.state.sparks.shift();
    const ang = Math.random() * Math.PI * 2;
    const spd = 120 + Math.random() * 320 * (fxIntensity / 3);
    room.state.sparks.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      hue: hue + (Math.random() * 40 - 20),
      life: 0.8 + Math.random() * 0.5,
      t: 0
    });
  }
}

// Event handling (place trigger)
let triggerCount = 0;
for (const e of room.events) {
  if (e.name === 'place') {
    triggerCount++;
    room.state.lastActionT = frame.t;
    const person = room.people.find(p => p.id === e.participantId);
    const hue = person ? person.hue : ((Math.random() * 360) | 0);
    const pId = e.participantId || 'solo';

    // Find next unplaced piece (random or nearest)
    const unplaced = room.state.pieces.filter(p => !p.placed);
    if (unplaced.length > 0) {
      const pick = unplaced[(Math.random() * unplaced.length) | 0];
      pick.placed = true;
      pick.snapProgress = 0.01;
      pick.hue = hue;
      pick.who = person ? `P${(room.people.indexOf(person) + 1)}` : 'YOU';

      // Score keeping
      room.state.scores[pId] ??= { score: 0, hue, label: pick.who };
      room.state.scores[pId].score++;
      room.state.scores[pId].hue = hue;

      spawnBurst(pick.tx + cw * 0.5, pick.ty + ch * 0.5, hue, 20 * fxIntensity);
      room.state.banner = `${pick.who} SNAPPED A PIECE!`;
      room.state.bannerT = frame.t;

      if (unplaced.length === 1) {
        // Just placed the last piece!
        room.state.status = 'complete';
        room.state.statusT = frame.t;
        // Determine round winner
        let topScore = -1;
        let winInfo = { hue: 50, label: 'TEAM!' };
        for (const k in room.state.scores) {
          if (room.state.scores[k].score > topScore) {
            topScore = room.state.scores[k].score;
            winInfo = room.state.scores[k];
          }
        }
        room.state.lastWinner = winInfo;
        spawnBurst(boardX + boardW * 0.5, boardY + boardH * 0.5, winInfo.hue, 80 * fxIntensity);
      }
    }
  }
}

// Attract mode: auto-play if idle for > 4.5 seconds
if (frame.t - room.state.lastActionT > 4.5 && room.state.status === 'playing') {
  const unplaced = room.state.pieces.filter(p => !p.placed);
  if (unplaced.length > 0 && (Math.sin(frame.t * 3.5) > 0.96)) {
    const autoHue = (frame.t * 60) % 360;
    const pick = unplaced[(Math.random() * unplaced.length) | 0];
    pick.placed = true;
    pick.snapProgress = 0.01;
    pick.hue = autoHue;
    pick.who = 'AUTO';
    spawnBurst(pick.tx + cw * 0.5, pick.ty + ch * 0.5, autoHue, 15);
    if (unplaced.length === 1) {
      room.state.status = 'complete';
      room.state.statusT = frame.t;
      room.state.lastWinner = { hue: 45, label: 'ROOM COMPLETED!' };
    }
  }
}

// Next round timer after puzzle completion
if (room.state.status === 'complete' && frame.t - room.state.statusT > 5.5) {
  room.state.round++;
  room.state.pieces = []; // triggers re-init
}

// Background fill
ctx.fillStyle = '#08090f';
ctx.fillRect(0, 0, W, H);

// Ambient dynamic floor grid
ctx.save();
ctx.strokeStyle = 'rgba(255,255,255,0.03)';
ctx.lineWidth = 1;
for (let x = 0; x < W; x += 60) {
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
}
for (let y = 0; y < H; y += 60) {
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
}
ctx.restore();

// Empty puzzle frame silhouette & target slots
ctx.save();
ctx.fillStyle = 'rgba(15, 20, 32, 0.9)';
ctx.strokeStyle = `hsl(${(frame.t * 20) % 360}, 60%, 40%)`;
ctx.lineWidth = 3;
ctx.shadowColor = `hsla(${(frame.t * 20) % 360}, 90%, 50%, 0.4)`;
ctx.shadowBlur = 20 * (audio.bass + 0.3);
ctx.fillRect(boardX, boardY, boardW, boardH);
ctx.strokeRect(boardX, boardY, boardW, boardH);
ctx.restore();

// Board subtle guide lines
if (showHints && room.state.status === 'playing') {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  for (let c = 1; c < cols; c++) {
    ctx.beginPath(); ctx.moveTo(boardX + c * cw, boardY); ctx.lineTo(boardX + c * cw, boardY + boardH); ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    ctx.beginPath(); ctx.moveTo(boardX, boardY + r * ch); ctx.lineTo(boardX + boardW, boardY + r * ch); ctx.stroke();
  }
  ctx.restore();
}

// Artwork generator function that paints in board coordinates
function drawArt(context, scalePulse) {
  context.save();
  const cx = boardX + boardW * 0.5;
  const cy = boardY + boardH * 0.5;
  const t = frame.t;

  if (artTheme === 'neon_totem') {
    // Totem layered eyes, wings, and angular mandalas
    const grad = context.createLinearGradient(boardX, boardY, boardX + boardW, boardY + boardH);
    grad.addColorStop(0, '#10002b');
    grad.addColorStop(0.5, '#240046');
    grad.addColorStop(1, '#03071e');
    context.fillStyle = grad;
    context.fillRect(boardX, boardY, boardW, boardH);

    for (let i = 8; i >= 1; i--) {
      const rad = (boardH * 0.45) * (i / 8) * (1 + audio.bass * 0.15 * scalePulse);
      context.beginPath();
      context.arc(cx, cy, rad, 0, Math.PI * 2);
      context.fillStyle = `hsla(${(t * 40 + i * 45) % 360}, 90%, ${35 + i * 5}%, 0.85)`;
      context.fill();
      context.strokeStyle = '#fff';
      context.lineWidth = 3;
      context.stroke();
    }
    // Central totem eye
    context.beginPath();
    context.ellipse(cx, cy, boardW * 0.28, boardH * 0.15, 0, 0, Math.PI * 2);
    context.fillStyle = '#ff007f';
    context.fill();
    context.strokeStyle = '#00f0ff';
    context.lineWidth = 6;
    context.stroke();

    context.beginPath();
    context.arc(cx, cy, boardH * 0.1 * (1 + audio.mid * 0.3), 0, Math.PI * 2);
    context.fillStyle = '#ffe600';
    context.fill();
  } else if (artTheme === 'geometric_bloom') {
    // Kaleidoscope radiant petals
    context.fillStyle = '#050c1a';
    context.fillRect(boardX, boardY, boardW, boardH);
    const petals = 12;
    for (let p = 0; p < petals; p++) {
      const ang = (p / petals) * Math.PI * 2 + t * 0.3;
      context.save();
      context.translate(cx, cy);
      context.rotate(ang);
      context.beginPath();
      context.moveTo(0, 0);
      context.bezierCurveTo(boardW * 0.2, -boardH * 0.2, boardW * 0.3, boardH * 0.2, boardW * 0.45 * (1 + audio.bass * 0.2), 0);
      context.bezierCurveTo(boardW * 0.3, -boardH * 0.2, boardW * 0.2, boardH * 0.2, 0, 0);
      context.fillStyle = `hsla(${(p * 360 / petals + t * 50) % 360}, 85%, 55%, 0.9)`;
      context.fill();
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.stroke();
      context.restore();
    }
  } else if (artTheme === 'synth_sunset') {
    // Retro synthwave mountain and sun
    const sky = context.createLinearGradient(boardX, boardY, boardX, boardY + boardH);
    sky.addColorStop(0, '#0f051d');
    sky.addColorStop(0.5, '#7b2cbf');
    sky.addColorStop(1, '#ff0054');
    context.fillStyle = sky;
    context.fillRect(boardX, boardY, boardW, boardH);

    // Sun
    const sRad = boardH * 0.28 * (1 + audio.bass * 0.12);
    const sunGrad = context.createLinearGradient(cx, cy - sRad, cx, cy + sRad);
    sunGrad.addColorStop(0, '#fffb00');
    sunGrad.addColorStop(1, '#ff0055');
    context.beginPath();
    context.arc(cx, cy - boardH * 0.05, sRad, 0, Math.PI * 2);
    context.fillStyle = sunGrad;
    context.fill();

    // Sun slashes
    context.fillStyle = '#7b2cbf';
    for (let y = cy - boardH * 0.02; y < cy + sRad; y += 14) {
      context.fillRect(cx - sRad, y, sRad * 2, 4);
    }
    // Neon mountains
    context.beginPath();
    context.moveTo(boardX, boardY + boardH);
    context.lineTo(boardX + boardW * 0.3, cy + boardH * 0.1);
    context.lineTo(cx, boardY + boardH * 0.8);
    context.lineTo(boardX + boardW * 0.7, cy + boardH * 0.05);
    context.lineTo(boardX + boardW, boardY + boardH);
    context.closePath();
    context.fillStyle = '#0b001a';
    context.fill();
    context.strokeStyle = '#00f5d4';
    context.lineWidth = 4;
    context.stroke();
  } else {
    // Techno Matrix / Cyber mandala
    context.fillStyle = '#021008';
    context.fillRect(boardX, boardY, boardW, boardH);
    const ringCount = 7;
    for (let r = 1; r <= ringCount; r++) {
      const rad = (boardH * 0.44) * (r / ringCount);
      context.beginPath();
      context.arc(cx, cy, rad, 0, Math.PI * 2);
      context.strokeStyle = `hsl(${(130 + r * 25) % 360}, 100%, ${50 + audio.treble * 30}%)`;
      context.lineWidth = 4;
      context.stroke();
      // Radial spokes
      for (let s = 0; s < 8; s++) {
        const a = (s / 8) * Math.PI * 2 + (r % 2 === 0 ? t : -t) * 0.5;
        context.beginPath();
        context.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 8 + audio.mid * 10, 0, Math.PI * 2);
        context.fillStyle = '#00ff66';
        context.fill();
      }
    }
  }
  context.restore();
}

// Piece path outline builder with interlocking tabs
function buildPiecePath(context, p, w, h) {
  const x = p.tx;
  const y = p.ty;
  const tabSize = Math.min(w, h) * 0.22;
  context.beginPath();
  // Top edge
  context.moveTo(x, y);
  if (p.topTab !== 0) {
    context.lineTo(x + w * 0.38, y);
    context.bezierCurveTo(x + w * 0.38, y - tabSize * p.topTab, x + w * 0.62, y - tabSize * p.topTab, x + w * 0.62, y);
  }
  context.lineTo(x + w, y);
  // Right edge
  if (p.rightTab !== 0) {
    context.lineTo(x + w, y + h * 0.38);
    context.bezierCurveTo(x + w + tabSize * p.rightTab, y + h * 0.38, x + w + tabSize * p.rightTab, y + h * 0.62, x + w, y + h * 0.62);
  }
  context.lineTo(x + w, y + h);
  // Bottom edge
  if (p.bottomTab !== 0) {
    context.lineTo(x + w * 0.62, y + h);
    context.bezierCurveTo(x + w * 0.62, y + h + tabSize * p.bottomTab, x + w * 0.38, y + h + tabSize * p.bottomTab, x + w * 0.38, y + h);
  }
  context.lineTo(x, y + h);
  // Left edge
  if (p.leftTab !== 0) {
    context.lineTo(x, y + h * 0.62);
    context.bezierCurveTo(x - tabSize * p.leftTab, y + h * 0.62, x - tabSize * p.leftTab, y + h * 0.38, x, y + h * 0.38);
  }
  context.closePath();
}

// Update pieces motion
for (const p of room.state.pieces) {
  if (!p.placed) {
    // Gentle ambient floating
    p.x += Math.sin(frame.t * 1.5 + p.id * 1.1) * 0.4;
    p.y += Math.cos(frame.t * 1.2 + p.id * 1.3) * 0.4;
  } else if (p.snapProgress < 1.0) {
    p.snapProgress = Math.min(1.0, p.snapProgress + frame.dt * 3.5);
    const ease = 1 - Math.pow(1 - p.snapProgress, 3); // easeOutCubic
    p.currX = p.x + (p.tx - p.x) * ease;
    p.currY = p.y + (p.ty - p.y) * ease;
    p.currRot = p.rot * (1 - ease);
  } else {
    p.currX = p.tx;
    p.currY = p.ty;
    p.currRot = 0;
  }
}

// Draw all placed pieces or full animating board if complete
const isComplete = room.state.status === 'complete';

if (isComplete) {
  // When completed, full board comes alive with audio pulsing and wave ripples!
  ctx.save();
  const alivePulse = 1 + audio.bass * 0.15;
  ctx.translate(boardX + boardW * 0.5, boardY + boardH * 0.5);
  ctx.scale(alivePulse, alivePulse);
  ctx.translate(-(boardX + boardW * 0.5), -(boardY + boardH * 0.5));
  
  ctx.beginPath();
  ctx.rect(boardX, boardY, boardW, boardH);
  ctx.clip();
  drawArt(ctx, 1.5);
  ctx.restore();

  // Flashy jigsaw seam lines glow
  ctx.save();
  ctx.strokeStyle = `hsla(${(frame.t * 120) % 360}, 100%, 75%, ${0.5 + audio.treble * 0.5})`;
  ctx.lineWidth = 3.5;
  for (const p of room.state.pieces) {
    buildPiecePath(ctx, p, cw, ch);
    ctx.stroke();
  }
  ctx.restore();
} else {
  // Draw placed pieces locked into board
  for (const p of room.state.pieces) {
    if (p.placed && p.snapProgress >= 1.0) {
      ctx.save();
      buildPiecePath(ctx, p, cw, ch);
      ctx.clip();
      drawArt(ctx, 1.0);
      // Placed rim highlight
      ctx.strokeStyle = `hsla(${p.hue}, 90%, 65%, 0.8)`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw moving / snapping pieces
  for (const p of room.state.pieces) {
    if (p.placed && p.snapProgress < 1.0) {
      const cx = p.tx + cw * 0.5;
      const cy = p.ty + ch * 0.5;
      ctx.save();
      ctx.translate(p.currX + cw * 0.5, p.currY + ch * 0.5);
      ctx.rotate(p.currRot);
      ctx.translate(-cx, -cy);
      buildPiecePath(ctx, p, cw, ch);
      ctx.clip();
      drawArt(ctx, 1.0);
      ctx.restore();

      // Bright trail halo while snapping
      ctx.save();
      ctx.translate(p.currX + cw * 0.5, p.currY + ch * 0.5);
      ctx.rotate(p.currRot);
      ctx.translate(-cx, -cy);
      buildPiecePath(ctx, p, cw, ch);
      ctx.strokeStyle = `hsl(${p.hue}, 100%, 70%)`;
      ctx.shadowColor = `hsl(${p.hue}, 100%, 50%)`;
      ctx.shadowBlur = 25;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw loose unplaced pieces scattered on outer edge
  for (const p of room.state.pieces) {
    if (!p.placed) {
      const cx = p.tx + cw * 0.5;
      const cy = p.ty + ch * 0.5;
      ctx.save();
      ctx.translate(p.x + cw * 0.5, p.y + ch * 0.5);
      ctx.rotate(p.rot);
      ctx.translate(-cx, -cy);

      // Drop shadow for loose piece
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 6;
      ctx.shadowOffsetY = 6;

      buildPiecePath(ctx, p, cw, ch);
      ctx.clip();
      drawArt(ctx, 0.8);
      ctx.restore();

      // Outline for loose piece
      ctx.save();
      ctx.translate(p.x + cw * 0.5, p.y + ch * 0.5);
      ctx.rotate(p.rot);
      ctx.translate(-cx, -cy);
      buildPiecePath(ctx, p, cw, ch);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Particle updates and rendering
ctx.save();
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const s = room.state.sparks[i];
  s.t += frame.dt;
  if (s.t >= s.life) {
    room.state.sparks.splice(i, 1);
    continue;
  }
  s.x += s.vx * frame.dt;
  s.y += s.vy * frame.dt;
  s.vy += 80 * frame.dt;
  const alpha = 1 - (s.t / s.life);
  ctx.beginPath();
  ctx.arc(s.x, s.y, 3.5 * alpha + 1, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${s.hue}, 100%, 65%, ${alpha})`;
  ctx.shadowColor = `hsl(${s.hue}, 100%, 50%)`;
  ctx.shadowBlur = 10;
  ctx.fill();
}
ctx.restore();

// HUD & UI for wall display (Short, ultra-bold, legible)
ctx.save();
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Top status / Title banner
if (isComplete) {
  const winHue = room.state.lastWinner ? room.state.lastWinner.hue : 60;
  ctx.font = '900 64px -apple-system, BlinkMacSystemFont, "Impact", sans-serif';
  ctx.fillStyle = `hsl(${winHue}, 100%, 60%)`;
  ctx.shadowColor = `hsl(${winHue}, 100%, 50%)`;
  ctx.shadowBlur = 30;
  const pulseScale = 1 + Math.sin(frame.t * 8) * 0.08;
  ctx.save();
  ctx.translate(W * 0.5, 60);
  ctx.scale(pulseScale, pulseScale);
  ctx.fillText('PUZZLE COMPLETE! ALIVE!', 0, 0);
  ctx.restore();

  // Winner sublabel
  ctx.font = '800 32px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 10;
  const winTxt = room.state.lastWinner ? `ROUND MVP: ${room.state.lastWinner.label} (${room.state.lastWinner.score} PIECES)` : 'ALL TOGETHER!';
  ctx.fillText(winTxt, W * 0.5, 115);
} else {
  // Game In Progress HUD
  const unplacedCount = room.state.pieces.filter(p => !p.placed).length;
  ctx.font = '900 48px -apple-system, BlinkMacSystemFont, "Impact", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 240, 255, 0.7)';
  ctx.shadowBlur = 15;
  ctx.fillText(`ROUND ${room.state.round} : ${unplacedCount} PIECES REMAINING`, W * 0.5, 55);

  // Action banner or instructions
  ctx.font = '700 24px sans-serif';
  ctx.fillStyle = (frame.t - room.state.bannerT < 2.0) ? '#ffff00' : 'rgba(255,255,255,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillText(room.state.banner, W * 0.5, 96);
}
ctx.restore();

// Player roster / Leaderboard mini-rail on bottom bar
ctx.save();
const rosterY = H - 38;
ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
ctx.fillRect(0, rosterY - 20, W, 58);
ctx.strokeStyle = 'rgba(255,255,255,0.15)';
ctx.lineWidth = 1.5;
ctx.beginPath(); ctx.moveTo(0, rosterY - 20); ctx.lineTo(W, rosterY - 20); ctx.stroke();

const peopleList = room.people.length > 0 ? room.people : [{ id: 'solo', hue: 180, table: 'T1' }];
const slotW = Math.min(180, W / Math.max(1, peopleList.length));
const startX = (W - slotW * peopleList.length) * 0.5;

ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
peopleList.slice(0, 16).forEach((p, idx) => {
  const px = startX + idx * slotW + slotW * 0.5;
  const scoreObj = room.state.scores[p.id];
  const pScore = scoreObj ? scoreObj.score : 0;
  const isMe = true;

  // Player avatar dot
  ctx.beginPath();
  ctx.arc(px - 35, rosterY + 8, 10, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${p.hue}, 90%, 55%)`;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Tag and score
  ctx.font = '800 18px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(`P${idx + 1}: ${pScore}`, px + 12, rosterY + 8);
});
ctx.restore();

ctx.restore();