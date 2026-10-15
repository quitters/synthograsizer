ctx.save();

const muralTheme = getVar('mural_theme') ?? 'risograph';
const markShape = getVar('mark_shape') ?? 'organic_blobs';
const roundDuration = getVar('round_duration') ?? 20;
const autoDoodle = getVar('auto_doodle') ?? 'ambient_flow';

const palettes = {
  risograph: {
    bg: '#f4ede2',
    easelBg: '#faf5ed',
    colors: ['#e93f33', '#1e488f', '#ffc83b', '#109b67', '#0e1111'],
    frameColor: '#2b231d'
  },
  neon_cyber: {
    bg: '#0a0914',
    easelBg: '#121124',
    colors: ['#ff007f', '#00f0ff', '#ffe600', '#7b2cbf', '#ffffff'],
    frameColor: '#1d1933'
  },
  earth_ochre: {
    bg: '#1c1613',
    easelBg: '#2a211c',
    colors: ['#e07a5f', '#3d5a80', '#ee6c4d', '#f4f1de', '#f2cc8f'],
    frameColor: '#3d3029'
  },
  ultramarine_gold: {
    bg: '#0d1322',
    easelBg: '#111a30',
    colors: ['#0038a8', '#ffd700', '#48cae4', '#ffffff', '#ff9e00'],
    frameColor: '#1e2b4d'
  }
};
const curPal = palettes[muralTheme] ?? palettes.risograph;

// Init persistent state
room.state.init ??= false;
const MW = 960;
const MH = 540;

if (!room.state.init) {
  room.state.init = true;
  room.state.muralCanvas = new OffscreenCanvas(MW, MH);
  room.state.muralCtx = room.state.muralCanvas.getContext('2d');
  room.state.round = 1;
  room.state.roundStart = frame.t;
  room.state.gallery = [];
  room.state.archivedThisRound = false;
  room.state.doodlers = [
    { x: MW * 0.3, y: MH * 0.4, vx: 0.8, vy: 0.6, seed: 1 },
    { x: MW * 0.7, y: MH * 0.6, vx: -0.7, vy: 0.5, seed: 42 },
    { x: MW * 0.5, y: MH * 0.5, vx: 0.5, vy: -0.8, seed: 99 }
  ];
  
  // Initial clear of easel
  const mctx = room.state.muralCtx;
  mctx.fillStyle = curPal.easelBg;
  mctx.fillRect(0, 0, MW, MH);
}

const mctx = room.state.muralCtx;

// Helper to draw stamps on offscreen mural
function drawStamp(gx, gy, scale, hue, shape, dynamic) {
  mctx.save();
  mctx.translate(gx, gy);
  mctx.rotate(dynamic * 3.1415);
  mctx.fillStyle = hue;
  mctx.strokeStyle = hue;
  mctx.lineWidth = Math.max(2, scale * 0.1);

  if (shape === 'organic_blobs') {
    mctx.beginPath();
    const points = 7;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = scale * (0.65 + 0.35 * Math.sin(angle * 3 + dynamic * 4));
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) mctx.moveTo(px, py); else mctx.lineTo(px, py);
    }
    mctx.closePath();
    mctx.fill();
  } else if (shape === 'geometric_sigils') {
    mctx.strokeRect(-scale * 0.6, -scale * 0.6, scale * 1.2, scale * 1.2);
    mctx.beginPath();
    mctx.arc(0, 0, scale * 0.4, 0, Math.PI * 2);
    mctx.stroke();
    mctx.beginPath();
    mctx.moveTo(-scale * 0.8, 0);
    mctx.lineTo(scale * 0.8, 0);
    mctx.moveTo(0, -scale * 0.8);
    mctx.lineTo(0, scale * 0.8);
    mctx.stroke();
  } else if (shape === 'brush_strokes') {
    mctx.lineCap = 'round';
    mctx.beginPath();
    mctx.moveTo(-scale, -scale * 0.3);
    mctx.bezierCurveTo(-scale * 0.2, scale * 0.5, scale * 0.3, -scale * 0.6, scale, scale * 0.2);
    mctx.stroke();
  } else {
    // starbursts
    mctx.beginPath();
    const rays = 8;
    for (let i = 0; i < rays * 2; i++) {
      const rad = (i / (rays * 2)) * Math.PI * 2;
      const d = i % 2 === 0 ? scale : scale * 0.35;
      const px = Math.cos(rad) * d;
      const py = Math.sin(rad) * d;
      if (i === 0) mctx.moveTo(px, py); else mctx.lineTo(px, py);
    }
    mctx.closePath();
    mctx.fill();
  }
  mctx.restore();
}

// Handle interactive triggers
const transitionDuration = 2.4;
let timeInRound = frame.t - room.state.roundStart;
const isPaintingPhase = timeInRound < roundDuration;

for (const ev of room.events) {
  if (ev.name === 'next_round' && isPaintingPhase) {
    // force freeze immediately
    room.state.roundStart = frame.t - roundDuration;
    timeInRound = roundDuration;
  }
  if (isPaintingPhase) {
    const person = room.people.find(p => p.id === ev.participantId);
    const hueStr = person ? `hsl(${person.hue}, 85%, 55%)` : curPal.colors[Math.floor(Math.random() * curPal.colors.length)];
    const hash = (ev.participantId ? ev.participantId.charCodeAt(0) : 50) + frame.t * 11;
    const stampX = (Math.sin(hash * 0.17) * 0.4 + 0.5) * MW;
    const stampY = (Math.cos(hash * 0.23) * 0.4 + 0.5) * MH;

    if (ev.name === 'stamp') {
      const size = 35 + (audio.bass * 45);
      drawStamp(stampX, stampY, size, hueStr, markShape, frame.t);
    } else if (ev.name === 'burst') {
      // Splatter burst
      const splatCount = 12;
      for (let s = 0; s < splatCount; s++) {
        const a = (s / splatCount) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 20 + Math.random() * 80 * (1 + audio.mid);
        const sx = stampX + Math.cos(a) * dist;
        const sy = stampY + Math.sin(a) * dist;
        drawStamp(sx, sy, 8 + Math.random() * 16, hueStr, markShape, hash + s);
      }
    }
  }
}

// Autonomous doodlers reacting to music
if (isPaintingPhase && autoDoodle !== 'none') {
  const doodlerSpeed = autoDoodle === 'rhythmic_swarms' ? 2.5 : 1.2;
  const bMod = 1 + audio.bass * 2;
  room.state.doodlers.forEach((d, idx) => {
    d.vx += (Math.sin(frame.t * 1.5 + d.seed) * 0.3);
    d.vy += (Math.cos(frame.t * 1.3 + d.seed) * 0.3);
    const speed = Math.hypot(d.vx, d.vy);
    if (speed > 4) { d.vx = (d.vx / speed) * 4; d.vy = (d.vy / speed) * 4; }
    d.x += d.vx * doodlerSpeed * bMod;
    d.y += d.vy * doodlerSpeed * bMod;

    if (d.x < 30) { d.x = 30; d.vx *= -1; }
    if (d.x > MW - 30) { d.x = MW - 30; d.vx *= -1; }
    if (d.y < 30) { d.y = 30; d.vy *= -1; }
    if (d.y > MH - 30) { d.y = MH - 30; d.vy *= -1; }

    if (audio.beat || idx === 0) {
      const col = curPal.colors[idx % curPal.colors.length];
      drawStamp(d.x, d.y, 14 + audio.level * 22, col, markShape, frame.t + idx);
    }
  });
}

// Check round transition and archiving
if (timeInRound >= roundDuration && !room.state.archivedThisRound) {
  // Snapshot canvas to thumbnail
  const thumbW = 160;
  const thumbH = 90;
  const thumb = new OffscreenCanvas(thumbW, thumbH);
  const tctx = thumb.getContext('2d');
  tctx.drawImage(room.state.muralCanvas, 0, 0, thumbW, thumbH);
  
  room.state.gallery.unshift({
    canvas: thumb,
    round: room.state.round,
    time: frame.t
  });
  if (room.state.gallery.length > 12) {
    room.state.gallery.pop();
  }
  room.state.archivedThisRound = true;
}

// Advance to fresh new round
if (timeInRound >= roundDuration + transitionDuration) {
  room.state.round++;
  room.state.roundStart = frame.t;
  room.state.archivedThisRound = false;
  timeInRound = 0;
  // Clear canvas with next round easel color
  mctx.fillStyle = curPal.easelBg;
  mctx.fillRect(0, 0, MW, MH);
  // Reset doodlers towards center
  room.state.doodlers.forEach((d, i) => {
    d.x = MW * (0.3 + 0.2 * i);
    d.y = MH * 0.5;
  });
}

// ================== RENDERING TO SCREEN ==================
ctx.fillStyle = curPal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

// Layout dimensions
const galleryHeight = Math.max(100, frame.height * 0.18);
const easelAreaHeight = frame.height - galleryHeight - 40;
const easelAreaWidth = frame.width - 60;

let easelW = easelAreaWidth;
let easelH = easelW * (MH / MW);
if (easelH > easelAreaHeight) {
  easelH = easelAreaHeight;
  easelW = easelH * (MW / MH);
}
const easelX = (frame.width - easelW) / 2;
const easelY = 25 + (easelAreaHeight - easelH) / 2;

// Animation properties when freezing & shrinking into gallery
let curX = easelX;
let curY = easelY;
let curW = easelW;
let curH = easelH;
let curAlpha = 1;

if (timeInRound >= roundDuration) {
  const progress = Math.min(1, (timeInRound - roundDuration) / transitionDuration);
  // Smooth step
  const ease = progress * progress * (3 - 2 * progress);
  
  // Target destination in bottom gallery
  const targetThumbW = 120;
  const targetThumbH = targetThumbW * (MH / MW);
  const targetX = 30;
  const targetY = frame.height - galleryHeight + 15;

  curX = easelX + (targetX - easelX) * ease;
  curY = easelY + (targetY - easelY) * ease;
  curW = easelW + (targetThumbW - easelW) * ease;
  curH = easelH + (targetThumbH - easelH) * ease;
  curAlpha = 1 - ease * 0.3;
}

// Draw active/transitioning easel background board and shadow
ctx.shadowColor = 'rgba(0,0,0,0.35)';
ctx.shadowBlur = 24;
ctx.shadowOffsetY = 10;
ctx.fillStyle = curPal.frameColor;
ctx.beginPath();
ctx.roundRect(curX - 6, curY - 6, curW + 12, curH + 12, 10);
ctx.fill();
ctx.shadowColor = 'transparent';

// Draw the mural canvas onto screen
ctx.save();
ctx.globalAlpha = curAlpha;
ctx.beginPath();
ctx.roundRect(curX, curY, curW, curH, 6);
ctx.clip();
ctx.drawImage(room.state.muralCanvas, curX, curY, curW, curH);

// Audio reactive border accent during painting
if (isPaintingPhase) {
  ctx.strokeStyle = curPal.colors[0];
  ctx.lineWidth = 2 + audio.bass * 6;
  ctx.strokeRect(curX, curY, curW, curH);
}
ctx.restore();

// Top status bar & round timer
ctx.fillStyle = curPal.colors[1] ?? '#ffffff';
ctx.font = '600 16px sans-serif';
ctx.textAlign = 'left';
const remaining = Math.max(0, Math.ceil(roundDuration - timeInRound));
const statusText = isPaintingPhase
  ? `ROUND ${room.state.round} • STAMP NOW (${remaining}s)`
  : `ARCHIVING ROUND ${room.state.round}...`;
ctx.fillText(statusText, 32, 22);

// Round progress bar
const pBarW = 180;
const pBarH = 6;
const pBarX = frame.width - pBarW - 32;
const pBarY = 14;
ctx.fillStyle = 'rgba(128,128,128,0.25)';
ctx.fillRect(pBarX, pBarY, pBarW, pBarH);
const pRatio = Math.min(1, timeInRound / roundDuration);
ctx.fillStyle = isPaintingPhase ? (curPal.colors[2] ?? '#f39c12') : '#e74c3c';
ctx.fillRect(pBarX, pBarY, pBarW * (1 - (isPaintingPhase ? pRatio : 0)), pBarH);

// Draw participant cursors hovering around the easel
if (isPaintingPhase && room.people.length > 0) {
  room.people.forEach((person, idx) => {
    const angle = (idx / room.people.length) * Math.PI * 2 + frame.t * 0.6;
    const hx = easelX + easelW * 0.5 + Math.cos(angle) * (easelW * 0.38);
    const hy = easelY + easelH * 0.5 + Math.sin(angle * 1.3) * (easelH * 0.38);
    ctx.save();
    ctx.fillStyle = `hsl(${person.hue}, 80%, 60%)`;
    ctx.shadowColor = `hsl(${person.hue}, 80%, 50%)`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(hx, hy, 5 + audio.level * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ================== GALLERY STRIP AT BOTTOM ==================
const gY = frame.height - galleryHeight;
ctx.fillStyle = 'rgba(0,0,0,0.18)';
ctx.fillRect(0, gY, frame.width, galleryHeight);

ctx.fillStyle = 'rgba(150,150,150,0.65)';
ctx.font = '12px sans-serif';
ctx.textAlign = 'left';
ctx.fillText('COLLECTED MURALS', 30, gY + 16);

const thumbGap = 16;
const cardW = Math.min(140, (frame.width - 60) / 7 - thumbGap);
const cardH = cardW * (MH / MW);
let gx = 30;

room.state.gallery.forEach((item) => {
  if (gx + cardW < frame.width - 20) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = curPal.frameColor;
    ctx.beginPath();
    ctx.roundRect(gx - 3, gY + 24 - 3, cardW + 6, cardH + 6, 6);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.beginPath();
    ctx.roundRect(gx, gY + 24, cardW, cardH, 4);
    ctx.clip();
    ctx.drawImage(item.canvas, gx, gY + 24, cardW, cardH);
    ctx.restore();

    // Label round number badge
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(`R${item.round}`, gx + 4, gY + 24 + cardH - 6);

    gx += cardW + thumbGap;
  }
});

ctx.restore();