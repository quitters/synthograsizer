const W = frame.width;
const H = frame.height;

const PALETTES = {
  neon_arcade: {
    bg: '#070816',
    boardBg: '#0e1128',
    gridLine: 'rgba(80, 110, 255, 0.18)',
    border: '#00f0ff',
    textMain: '#ffffff',
    textSub: '#8ea2d8',
    pieces: ['#00f0ff', '#ffe600', '#c800ff', '#00ff66', '#ff1744', '#2979ff', '#ff9100']
  },
  cyber_grid: {
    bg: '#040e14',
    boardBg: '#081a24',
    gridLine: 'rgba(0, 255, 200, 0.18)',
    border: '#00ffcc',
    textMain: '#e8ffff',
    textSub: '#00bfa5',
    pieces: ['#00ffcc', '#76ff03', '#e040fb', '#00e5ff', '#ff1744', '#18ffff', '#ffd600']
  },
  acid_sunset: {
    bg: '#14061a',
    boardBg: '#220b2f',
    gridLine: 'rgba(255, 60, 160, 0.22)',
    border: '#ff007f',
    textMain: '#fff0f6',
    textSub: '#ff77a9',
    pieces: ['#ff007f', '#ffaa00', '#9d00ff', '#ffea00', '#ff2255', '#651fff', '#ff6d00']
  },
  monochrome_punk: {
    bg: '#0a0a0a',
    boardBg: '#151515',
    gridLine: 'rgba(255, 255, 255, 0.16)',
    border: '#ffffff',
    textMain: '#ffffff',
    textSub: '#aaaaaa',
    pieces: ['#ffffff', '#ffee00', '#00ffff', '#00ff66', '#ff3333', '#88bbff', '#ff8800']
  }
};

const SHAPES = [
  [[[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]], [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]],
  [[[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]]],
  [[[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]],
  [[[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]], [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]],
  [[[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]],
  [[[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]]],
  [[[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]]]
];

const DIGIT_MAP = [
  '111101101101111',
  '010110010010111',
  '111001111100111',
  '111001111001111',
  '101101111001001',
  '111100111001111',
  '111100111101111',
  '111001010010010',
  '111101111101111',
  '111101111001111'
];

const palChoice = getVar('palette') ?? 'neon_arcade';
const pal = PALETTES[palChoice] ?? PALETTES.neon_arcade;
const speedMult = getVar('game_speed') ?? 1.0;
const glowEnabled = getVar('grid_glow') ?? true;
const chaosSparks = getVar('chaos_particles') ?? true;

room.state.grid ??= new Array(200).fill(0);
room.state.piece ??= null;
room.state.nextType ??= Math.floor(Math.random() * 7);
room.state.score ??= 0;
room.state.lines ??= 0;
room.state.particles ??= [];
room.state.floaters ??= [];
room.state.beams ??= [];
room.state.dropTimer ??= 0;
room.state.lastInputTime ??= 0;
room.state.shake ??= 0;
room.state.balance ??= 0;
room.state.flashRows ??= [];
room.state.gameOver ??= false;
room.state.gameOverTimer ??= 0;
room.state.winnerHue ??= 180;
room.state.winnerLabel ??= 'THE ROOM';
room.state.bannerText ??= 'GO!';
room.state.bannerTimer ??= 2.0;
room.state.aiTimer ??= 0;
room.state.aiTargetCol ??= 3;
room.state.aiTargetRot ??= 0;
room.state.inputTally ??= { left: 0, right: 0, rot: 0 };
room.state.playerScores ??= {};

const st = room.state;

function collides(type, rot, px, py, grid) {
  const blocks = SHAPES[type][rot];
  for (let i = 0; i < 4; i++) {
    const gx = px + blocks[i][0];
    const gy = py + blocks[i][1];
    if (gx < 0 || gx >= 10 || gy >= 20) return true;
    if (gy >= 0 && grid[gy * 10 + gx] > 0) return true;
  }
  return false;
}

function spawnPiece() {
  st.piece = {
    type: st.nextType,
    rot: 0,
    x: 3,
    y: 0,
    lastHue: 190
  };
  st.nextType = Math.floor(Math.random() * 7);
  st.aiTargetCol = Math.floor(Math.random() * 7);
  st.aiTargetRot = Math.floor(Math.random() * 4);

  if (collides(st.piece.type, st.piece.rot, st.piece.x, st.piece.y, st.grid)) {
    triggerGameOver();
  }
}

function triggerGameOver() {
  if (st.gameOver) return;
  st.gameOver = true;
  st.gameOverTimer = 5.0;
  st.shake = 22;
  st.bannerText = 'GAME OVER!';
  st.bannerTimer = 5.0;

  let bestId = null;
  let maxMoves = -1;
  for (const [id, count] of Object.entries(st.playerScores)) {
    if (count > maxMoves) {
      maxMoves = count;
      bestId = id;
    }
  }

  const people = room.people || [];
  const winner = bestId ? people.find(p => p.id === bestId) : (people.length > 0 ? people[0] : null);
  if (winner) {
    st.winnerHue = winner.hue;
    st.winnerLabel = winner.table || ('PLAYER ' + (winner.id ? winner.id.slice(0, 4) : '1'));
  } else {
    st.winnerHue = 45;
    st.winnerLabel = 'THE ROOM';
  }

  for (let i = 0; i < (chaosSparks ? 70 : 30); i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 120 + Math.random() * 320;
    if (st.particles.length < 160) {
      st.particles.push({
        x: W * 0.5,
        y: H * 0.5,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 120,
        hue: (st.winnerHue + (Math.random() - 0.5) * 60 + 360) % 360,
        life: 1.6 + Math.random() * 1.2,
        maxLife: 2.8,
        size: 5 + Math.random() * 5
      });
    }
  }
}

if (!st.piece && !st.gameOver) {
  spawnPiece();
}

const cellSize = Math.min(Math.floor((H * 0.82) / 20), Math.floor((W * 0.42) / 10));
const boardW = 10 * cellSize;
const boardH = 20 * cellSize;
const boardX = Math.floor((W - boardW) / 2);
const boardY = Math.floor((H - boardH) / 2) + 15;

const wingLeft = 40;
const wingWidth = Math.max(160, boardX - 80);
const wingTop = 380;
const wingBottom = H - 50;

const people = room.people || [];
const playerPositions = new Map();
const numPeople = people.length;
if (numPeople > 0) {
  const cols = numPeople > 20 ? 3 : (numPeople > 8 ? 2 : 1);
  const rows = Math.ceil(Math.min(numPeople, 36) / cols);
  const colW = (wingWidth - (cols - 1) * 10) / cols;
  const rowH = Math.min(42, Math.max(20, (wingBottom - wingTop) / rows));
  for (let i = 0; i < Math.min(numPeople, 36); i++) {
    const p = people[i];
    const c = i % cols;
    const r = Math.floor(i / cols);
    playerPositions.set(p.id, {
      x: wingLeft + c * (colW + 10) + 16,
      y: wingTop + r * rowH + (rowH - 4) * 0.5
    });
  }
}

if (room.events && room.events.length > 0) {
  for (const e of room.events) {
    st.lastInputTime = frame.t;
    const person = people.find(p => p.id === e.participantId);
    const hue = person ? person.hue : Math.floor(Math.random() * 360);
    if (e.participantId) {
      st.playerScores[e.participantId] = (st.playerScores[e.participantId] || 0) + 1;
    }

    const origin = (e.participantId && playerPositions.get(e.participantId)) || { x: wingLeft + 20, y: wingTop + 20 };
    const pieceCX = boardX + (st.piece ? (st.piece.x + 1.5) * cellSize : boardW * 0.5);
    const pieceCY = boardY + (st.piece ? (st.piece.y + 1.5) * cellSize : boardH * 0.5);

    if (st.beams.length < 18) {
      st.beams.push({
        sx: origin.x,
        sy: origin.y,
        tx: pieceCX,
        ty: pieceCY,
        hue,
        life: 0.32,
        maxLife: 0.32
      });
    }

    if (st.gameOver) {
      st.gameOverTimer -= 0.6;
      continue;
    }
    if (!st.piece) continue;

    if (e.name === 'left') {
      st.inputTally.left++;
      st.balance = Math.max(-1.0, st.balance - 0.22);
      if (!collides(st.piece.type, st.piece.rot, st.piece.x - 1, st.piece.y, st.grid)) {
        st.piece.x--;
        st.piece.lastHue = hue;
        st.shake = Math.min(st.shake + 4.5, 18);
        if (st.floaters.length < 20) {
          st.floaters.push({ text: '← LEFT', hue, x: boardX + st.piece.x * cellSize, y: boardY + st.piece.y * cellSize, vx: -30, vy: -50, life: 0.7, maxLife: 0.7 });
        }
      } else {
        st.shake = Math.min(st.shake + 3, 14);
      }
    } else if (e.name === 'right') {
      st.inputTally.right++;
      st.balance = Math.min(1.0, st.balance + 0.22);
      if (!collides(st.piece.type, st.piece.rot, st.piece.x + 1, st.piece.y, st.grid)) {
        st.piece.x++;
        st.piece.lastHue = hue;
        st.shake = Math.min(st.shake + 4.5, 18);
        if (st.floaters.length < 20) {
          st.floaters.push({ text: 'RIGHT →', hue, x: boardX + (st.piece.x + 2) * cellSize, y: boardY + st.piece.y * cellSize, vx: 30, vy: -50, life: 0.7, maxLife: 0.7 });
        }
      } else {
        st.shake = Math.min(st.shake + 3, 14);
      }
    } else if (e.name === 'rotate') {
      st.inputTally.rot++;
      const nextRot = (st.piece.rot + 1) % 4;
      let kicked = false;
      const offsets = [0, -1, 1, -2, 2];
      for (const off of offsets) {
        if (!collides(st.piece.type, nextRot, st.piece.x + off, st.piece.y, st.grid)) {
          st.piece.rot = nextRot;
          st.piece.x += off;
          st.piece.lastHue = hue;
          kicked = true;
          break;
        }
      }
      if (kicked) {
        st.shake = Math.min(st.shake + 5, 18);
        if (st.floaters.length < 20) {
          st.floaters.push({ text: 'ROTATE ↻', hue, x: pieceCX, y: pieceCY, vx: 0, vy: -60, life: 0.7, maxLife: 0.7 });
        }
      }
    }
  }
}

st.balance *= Math.max(0, 1 - frame.dt * 1.1);

const attractMode = (frame.t - st.lastInputTime > 3.0) || numPeople === 0;
if (attractMode && !st.gameOver && st.piece && st.flashRows.length === 0) {
  st.aiTimer += frame.dt;
  if (st.aiTimer > 0.38) {
    st.aiTimer = 0;
    const botHue = Math.floor((frame.t * 50) % 360);
    if (st.piece.rot !== st.aiTargetRot) {
      const nRot = (st.piece.rot + 1) % 4;
      if (!collides(st.piece.type, nRot, st.piece.x, st.piece.y, st.grid)) {
        st.piece.rot = nRot;
      } else {
        st.aiTargetRot = st.piece.rot;
      }
    } else if (st.piece.x < st.aiTargetCol) {
      if (!collides(st.piece.type, st.piece.rot, st.piece.x + 1, st.piece.y, st.grid)) {
        st.piece.x++;
      } else {
        st.aiTargetCol = st.piece.x;
      }
    } else if (st.piece.x > st.aiTargetCol) {
      if (!collides(st.piece.type, st.piece.rot, st.piece.x - 1, st.piece.y, st.grid)) {
        st.piece.x--;
      } else {
        st.aiTargetCol = st.piece.x;
      }
    }
  }
}

if (st.flashRows.length > 0) {
  let allDone = false;
  for (const fr of st.flashRows) {
    fr.timer -= frame.dt;
    if (fr.timer <= 0) allDone = true;
  }
  if (allDone) {
    const rows = st.flashRows.map(f => f.row).sort((a, b) => a - b);
    for (const r of rows) {
      for (let y = r; y > 0; y--) {
        for (let x = 0; x < 10; x++) {
          st.grid[y * 10 + x] = st.grid[(y - 1) * 10 + x];
        }
      }
      for (let x = 0; x < 10; x++) {
        st.grid[x] = 0;
      }
    }
    st.flashRows = [];
  }
} else if (!st.gameOver && st.piece) {
  const dropInterval = Math.max(0.09, (0.65 - Math.min(st.lines * 0.02, 0.42)) / speedMult);
  st.dropTimer += frame.dt + (audio && audio.beat ? frame.dt * 0.4 : 0);
  if (st.dropTimer >= dropInterval) {
    st.dropTimer = 0;
    if (!collides(st.piece.type, st.piece.rot, st.piece.x, st.piece.y + 1, st.grid)) {
      st.piece.y++;
    } else {
      const blocks = SHAPES[st.piece.type][st.piece.rot];
      const pColor = st.piece.type + 1;
      const pHue = st.piece.lastHue ?? 190;
      for (let i = 0; i < 4; i++) {
        const gx = st.piece.x + blocks[i][0];
        const gy = st.piece.y + blocks[i][1];
        if (gy >= 0 && gy < 20 && gx >= 0 && gx < 10) {
          st.grid[gy * 10 + gx] = pHue * 10 + pColor;
        }
      }

      st.shake = Math.min(st.shake + 6, 20);

      const full = [];
      for (let r = 0; r < 20; r++) {
        let complete = true;
        for (let c = 0; c < 10; c++) {
          if (st.grid[r * 10 + c] === 0) {
            complete = false;
            break;
          }
        }
        if (complete) full.push(r);
      }

      if (full.length > 0) {
        st.flashRows = full.map(r => ({ row: r, timer: 0.32 }));
        const pts = [0, 100, 300, 600, 1200][full.length] || (full.length * 300);
        st.score += pts;
        st.lines += full.length;
        st.shake = 18;
        st.bannerText = full.length === 4 ? 'TETRIS! +1200' : (full.length >= 2 ? `COMBO +${pts}` : `ROW +${pts}`);
        st.bannerTimer = 1.8;

        for (const r of full) {
          for (let i = 0; i < (chaosSparks ? 24 : 12); i++) {
            if (st.particles.length < 160) {
              st.particles.push({
                x: boardX + Math.random() * boardW,
                y: boardY + r * cellSize + cellSize * 0.5,
                vx: (Math.random() - 0.5) * 360,
                vy: (Math.random() - 0.5) * 220 - 40,
                hue: Math.floor(Math.random() * 360),
                life: 0.6 + Math.random() * 0.6,
                maxLife: 1.2,
                size: 4 + Math.random() * 4
              });
            }
          }
        }
      }

      spawnPiece();
    }
  }
}

if (st.gameOver) {
  st.gameOverTimer -= frame.dt;
  if (st.gameOverTimer <= 0) {
    st.grid.fill(0);
    st.lines = 0;
    st.score = 0;
    st.playerScores = {};
    st.gameOver = false;
    st.bannerText = 'GO!';
    st.bannerTimer = 2.0;
    st.inputTally.left = 0;
    st.inputTally.right = 0;
    st.inputTally.rot = 0;
    spawnPiece();
  }
}

if (st.bannerTimer > 0) st.bannerTimer -= frame.dt;

let shakeX = 0;
let shakeY = 0;
if (st.shake > 0.1) {
  shakeX = (Math.random() - 0.5) * st.shake * 1.4;
  shakeY = (Math.random() - 0.5) * st.shake * 1.4;
  st.shake *= Math.max(0, 1 - frame.dt * 10);
}
if (audio && audio.bass > 0.6) {
  shakeY += (audio.bass - 0.6) * 8;
}

ctx.save();
ctx.translate(shakeX, shakeY);

ctx.fillStyle = pal.bg;
ctx.fillRect(-20, -20, W + 40, H + 40);

ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
ctx.lineWidth = 1;
for (let x = 0; x < W; x += 60) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
}
for (let y = 0; y < H; y += 60) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}

function drawSpeaker(cx, cy, radius, pulse) {
  ctx.save();
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal.border;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, radius * 0.45 * (1 + pulse * 0.5)), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const speakerBass = audio ? audio.bass : 0.2;
const speakerMid = audio ? audio.mid : 0.2;
drawSpeaker(boardX - 22, boardY + 70, 16, speakerBass);
drawSpeaker(boardX - 22, boardY + boardH * 0.5, 20, speakerMid);
drawSpeaker(boardX - 22, boardY + boardH - 70, 16, speakerBass);
drawSpeaker(boardX + boardW + 22, boardY + 70, 16, speakerBass);
drawSpeaker(boardX + boardW + 22, boardY + boardH * 0.5, 20, speakerMid);
drawSpeaker(boardX + boardW + 22, boardY + boardH - 70, 16, speakerBass);

ctx.save();
ctx.fillStyle = pal.boardBg;
ctx.fillRect(boardX, boardY, boardW, boardH);

ctx.strokeStyle = pal.gridLine;
ctx.lineWidth = 1;
for (let c = 1; c < 10; c++) {
  ctx.beginPath();
  ctx.moveTo(boardX + c * cellSize, boardY);
  ctx.lineTo(boardX + c * cellSize, boardY + boardH);
  ctx.stroke();
}
for (let r = 1; r < 20; r++) {
  ctx.beginPath();
  ctx.moveTo(boardX, boardY + r * cellSize);
  ctx.lineTo(boardX + boardW, boardY + r * cellSize);
  ctx.stroke();
}

ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
for (let y = boardY; y < boardY + boardH; y += 4) {
  ctx.fillRect(boardX, y, boardW, 2);
}

function drawCell(bx, by, size, color, glowCol, alpha = 1.0, isGhost = false) {
  if (alpha <= 0) return;
  const pad = 1.5;
  const x = bx + pad;
  const y = by + pad;
  const s = size - pad * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (isGhost) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, s, s);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.18;
    ctx.fillRect(x, y, s, s);
    ctx.restore();
    return;
  }

  ctx.fillStyle = color;
  ctx.fillRect(x, y, s, s);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x + s - 3.5, y + 3.5);
  ctx.lineTo(x + 3.5, y + 3.5);
  ctx.lineTo(x + 3.5, y + s - 3.5);
  ctx.lineTo(x, y + s);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.moveTo(x + s, y);
  ctx.lineTo(x + s, y + s);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x + 3.5, y + s - 3.5);
  ctx.lineTo(x + s - 3.5, y + s - 3.5);
  ctx.lineTo(x + s - 3.5, y + 3.5);
  ctx.closePath();
  ctx.fill();

  if (glowCol) {
    ctx.fillStyle = glowCol;
    ctx.fillRect(x + 5, y + 5, Math.max(2, s - 10), Math.max(2, s - 10));
  }
  ctx.restore();
}

for (let r = 0; r < 20; r++) {
  const flashing = st.flashRows.find(f => f.row === r);
  if (flashing) {
    const flashAlpha = 0.5 + 0.5 * Math.sin(frame.t * 35);
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
    ctx.fillRect(boardX, boardY + r * cellSize, boardW, cellSize);
    continue;
  }
  for (let c = 0; c < 10; c++) {
    const val = st.grid[r * 10 + c];
    if (val > 0) {
      const pColorIdx = (val % 10) - 1;
      const pHue = Math.floor(val / 10);
      const baseColor = pal.pieces[pColorIdx % 7];
      const glowColor = `hsl(${pHue}, 100%, 65%)`;
      drawCell(boardX + c * cellSize, boardY + r * cellSize, cellSize, baseColor, glowColor);
    }
  }
}

if (st.piece && !st.gameOver) {
  let ghostY = st.piece.y;
  while (!collides(st.piece.type, st.piece.rot, st.piece.x, ghostY + 1, st.grid)) {
    ghostY++;
  }
  const blocks = SHAPES[st.piece.type][st.piece.rot];
  const pColor = pal.pieces[st.piece.type % 7];
  const lastHueCol = `hsl(${st.piece.lastHue}, 100%, 60%)`;

  if (ghostY > st.piece.y) {
    for (let i = 0; i < 4; i++) {
      const gx = st.piece.x + blocks[i][0];
      const gy = ghostY + blocks[i][1];
      if (gy >= 0) {
        drawCell(boardX + gx * cellSize, boardY + gy * cellSize, cellSize, pColor, null, 0.7, true);
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    const gx = st.piece.x + blocks[i][0];
    const gy = st.piece.y + blocks[i][1];
    if (gy >= 0) {
      drawCell(boardX + gx * cellSize, boardY + gy * cellSize, cellSize, pColor, lastHueCol, 1.0, false);
    }
  }
}

ctx.strokeStyle = pal.border;
ctx.lineWidth = 3.5;
if (glowEnabled) {
  ctx.shadowColor = pal.border;
  ctx.shadowBlur = 12 + (audio && audio.beat ? 10 : 0);
}
ctx.strokeRect(boardX, boardY, boardW, boardH);
ctx.shadowBlur = 0;
ctx.restore();

function drawPixelDigits(str, startX, startY, pxSize, color, glowCol) {
  ctx.save();
  ctx.fillStyle = color;
  if (glowEnabled && glowCol) {
    ctx.shadowColor = glowCol;
    ctx.shadowBlur = 10;
  }
  let cx = startX;
  for (let i = 0; i < str.length; i++) {
    const d = str.charCodeAt(i) - 48;
    if (d >= 0 && d <= 9) {
      const map = DIGIT_MAP[d];
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (map[row * 3 + col] === '1') {
            ctx.fillRect(cx + col * pxSize, startY + row * pxSize, pxSize - 1, pxSize - 1);
          }
        }
      }
    }
    cx += 4 * pxSize;
  }
  ctx.restore();
}

ctx.save();
ctx.font = '900 28px "Impact", "Arial Black", sans-serif';
ctx.fillStyle = pal.border;
ctx.textAlign = 'left';
ctx.fillText('PARTY DROP', wingLeft, 70);

ctx.font = '900 15px "Impact", sans-serif';
ctx.fillStyle = pal.textSub;
ctx.fillText('LINES CLEARED', wingLeft, 115);
drawPixelDigits(String(st.lines).padStart(3, '0'), wingLeft, 130, 11, pal.textMain, pal.border);

ctx.font = '900 15px "Impact", sans-serif';
ctx.fillStyle = pal.textSub;
ctx.fillText('CO-OP SCORE', wingLeft, 225);
drawPixelDigits(String(st.score).padStart(6, '0'), wingLeft, 240, 8, pal.textMain, '#ffe600');

ctx.font = '900 16px "Impact", sans-serif';
ctx.fillStyle = pal.textSub;
ctx.fillText(`CONNECTED CREW (${numPeople})`, wingLeft, wingTop - 15);

if (numPeople === 0) {
  ctx.font = '700 14px monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillText('WAITING FOR PLAYERS...', wingLeft, wingTop + 24);
  ctx.fillText('JOIN TO STEER THE DROP!', wingLeft, wingTop + 48);
  const demoBots = [
    { name: 'AUTO PILOT 1', hue: 190, y: wingTop + 90 },
    { name: 'AUTO PILOT 2', hue: 45, y: wingTop + 135 }
  ];
  for (const b of demoBots) {
    ctx.fillStyle = `hsl(${b.hue}, 100%, 55%)`;
    ctx.beginPath();
    ctx.arc(wingLeft + 12, b.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.textMain;
    ctx.font = '900 15px "Impact", sans-serif';
    ctx.fillText(b.name, wingLeft + 28, b.y + 5);
  }
} else {
  const maxDisplay = Math.min(numPeople, 36);
  const cols = numPeople > 20 ? 3 : (numPeople > 8 ? 2 : 1);
  const rows = Math.ceil(maxDisplay / cols);
  const colW = (wingWidth - (cols - 1) * 10) / cols;
  const rowH = Math.min(42, Math.max(20, (wingBottom - wingTop) / rows));
  for (let i = 0; i < maxDisplay; i++) {
    const p = people[i];
    const c = i % cols;
    const r = Math.floor(i / cols);
    const px = wingLeft + c * (colW + 10);
    const py = wingTop + r * rowH;
    const touches = st.playerScores[p.id] || 0;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(px, py, colW, rowH - 4);

    const dotR = Math.min(8, (rowH - 6) * 0.5);
    ctx.fillStyle = `hsl(${p.hue}, 100%, 60%)`;
    if (glowEnabled) {
      ctx.shadowColor = `hsl(${p.hue}, 100%, 50%)`;
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.arc(px + 12, py + (rowH - 4) * 0.5, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = pal.textMain;
    ctx.font = rowH < 28 ? '700 11px monospace' : '900 14px "Impact", sans-serif';
    ctx.textAlign = 'left';
    const tag = p.table || `P${p.id ? p.id.slice(0, 4) : i}`;
    ctx.fillText(tag, px + 24, py + (rowH - 4) * 0.5 + 4);

    if (colW > 110 && rowH >= 28) {
      ctx.fillStyle = `hsl(${p.hue}, 90%, 75%)`;
      ctx.font = '700 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${touches}v`, px + colW - 6, py + (rowH - 4) * 0.5 + 4);
    }
  }
}
ctx.restore();

const rightX = boardX + boardW + 40;
const rightW = Math.max(160, W - rightX - 40);

ctx.save();
ctx.font = '900 15px "Impact", sans-serif';
ctx.fillStyle = pal.textSub;
ctx.textAlign = 'left';
ctx.fillText('NEXT PIECE', rightX, 70);

ctx.fillStyle = pal.boardBg;
ctx.fillRect(rightX, 85, rightW, 110);
ctx.strokeStyle = pal.border;
ctx.lineWidth = 2;
ctx.strokeRect(rightX, 85, rightW, 110);

const nextBlocks = SHAPES[st.nextType][0];
const nextColor = pal.pieces[st.nextType % 7];
const miniCell = Math.floor(cellSize * 0.75);
const previewOffsetX = rightX + (rightW - 4 * miniCell) * 0.5;
const previewOffsetY = 85 + (110 - 2 * miniCell) * 0.5;
for (let i = 0; i < 4; i++) {
  const bx = previewOffsetX + nextBlocks[i][0] * miniCell;
  const by = previewOffsetY + nextBlocks[i][1] * miniCell;
  drawCell(bx, by, miniCell, nextColor, '#ffffff', 1.0, false);
}

ctx.fillStyle = pal.textSub;
ctx.font = '900 15px "Impact", sans-serif';
ctx.fillText('ROOM ARGUMENT METER', rightX, 230);

ctx.fillStyle = pal.boardBg;
ctx.fillRect(rightX, 245, rightW, 60);
ctx.strokeStyle = pal.border;
ctx.lineWidth = 1.5;
ctx.strokeRect(rightX, 245, rightW, 60);

const meterMidX = rightX + rightW * 0.5;
ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
ctx.beginPath();
ctx.moveTo(meterMidX, 245);
ctx.lineTo(meterMidX, 305);
ctx.stroke();

const sliderX = meterMidX + st.balance * (rightW * 0.44);
ctx.fillStyle = st.balance < -0.1 ? '#00f0ff' : (st.balance > 0.1 ? '#ff1744' : '#ffe600');
if (glowEnabled) {
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
}
ctx.beginPath();
ctx.arc(sliderX, 275, 11, 0, Math.PI * 2);
ctx.fill();
ctx.shadowBlur = 0;

ctx.font = '900 12px "Impact", sans-serif';
ctx.fillStyle = '#00f0ff';
ctx.textAlign = 'left';
ctx.fillText(`← LEFT (${st.inputTally.left})`, rightX + 8, 298);
ctx.fillStyle = '#ff1744';
ctx.textAlign = 'right';
ctx.fillText(`(${st.inputTally.right}) RIGHT →`, rightX + rightW - 8, 298);

ctx.fillStyle = pal.textSub;
ctx.font = '900 15px "Impact", sans-serif';
ctx.textAlign = 'left';
ctx.fillText('AUDIO VISUALIZER', rightX, 340);

ctx.fillStyle = pal.boardBg;
ctx.fillRect(rightX, 355, rightW, 80);
ctx.strokeStyle = pal.border;
ctx.lineWidth = 1.5;
ctx.strokeRect(rightX, 355, rightW, 80);

const numBars = 12;
const barW = (rightW - 16) / numBars;
for (let i = 0; i < numBars; i++) {
  const freq = (i / numBars);
  const baseH = (audio ? (freq < 0.35 ? audio.bass : (freq < 0.7 ? audio.mid : audio.treble)) : 0.3);
  const h = Math.max(4, baseH * 64 * (0.6 + 0.4 * Math.sin(frame.t * 8 + i)));
  const hue = (i * 24 + frame.t * 30) % 360;
  ctx.fillStyle = `hsl(${hue}, 100%, 55%)`;
  ctx.fillRect(rightX + 8 + i * barW, 425 - h, barW - 2, h);
}

ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
ctx.fillRect(rightX, 465, rightW, 160);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
ctx.strokeRect(rightX, 465, rightW, 160);

ctx.textAlign = 'center';
ctx.fillStyle = pal.textMain;
ctx.font = '900 16px "Impact", sans-serif';
ctx.fillText('HOW TO PLAY', rightX + rightW * 0.5, 492);

ctx.font = '700 13px monospace';
ctx.fillStyle = pal.textSub;
ctx.fillText('EVERYONE CONTROLS', rightX + rightW * 0.5, 520);
ctx.fillText('THE SAME BLOCK!', rightX + rightW * 0.5, 538);

ctx.fillStyle = '#ffe600';
ctx.fillText('ARGUE OR COOPERATE', rightX + rightW * 0.5, 570);
ctx.fillStyle = attractMode ? '#00ffcc' : pal.textSub;
ctx.fillText(attractMode ? '★ AUTO ATTRACT MODE ★' : '● LIVE ROOM BATTLE ●', rightX + rightW * 0.5, 600);

ctx.restore();

for (let i = st.beams.length - 1; i >= 0; i--) {
  const b = st.beams[i];
  b.life -= frame.dt;
  if (b.life <= 0) {
    st.beams.splice(i, 1);
    continue;
  }
  const progress = b.life / b.maxLife;
  ctx.save();
  ctx.strokeStyle = `hsl(${b.hue}, 100%, 65%)`;
  ctx.lineWidth = Math.max(1, 3.5 * progress);
  if (glowEnabled) {
    ctx.shadowColor = `hsl(${b.hue}, 100%, 55%)`;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.moveTo(b.sx, b.sy);
  const mx = (b.sx + b.tx) * 0.5 + (Math.random() - 0.5) * 16;
  const my = (b.sy + b.ty) * 0.5 + (Math.random() - 0.5) * 16;
  ctx.lineTo(mx, my);
  ctx.lineTo(b.tx, b.ty);
  ctx.stroke();
  ctx.restore();
}

for (let i = st.particles.length - 1; i >= 0; i--) {
  const p = st.particles[i];
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  p.vy += 220 * frame.dt;
  p.life -= frame.dt;
  if (p.life <= 0) {
    st.particles.splice(i, 1);
    continue;
  }
  const pAlpha = p.life / p.maxLife;
  ctx.save();
  ctx.fillStyle = `hsl(${p.hue}, 100%, 60%)`;
  ctx.globalAlpha = pAlpha;
  if (glowEnabled) {
    ctx.shadowColor = `hsl(${p.hue}, 100%, 50%)`;
    ctx.shadowBlur = 6;
  }
  ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
  ctx.restore();
}

for (let i = st.floaters.length - 1; i >= 0; i--) {
  const f = st.floaters[i];
  f.x += f.vx * frame.dt;
  f.y += f.vy * frame.dt;
  f.life -= frame.dt;
  if (f.life <= 0) {
    st.floaters.splice(i, 1);
    continue;
  }
  const fAlpha = f.life / f.maxLife;
  ctx.save();
  ctx.font = '900 24px "Impact", "Arial Black", sans-serif';
  ctx.fillStyle = `hsl(${f.hue}, 100%, 70%)`;
  if (glowEnabled) {
    ctx.shadowColor = `hsl(${f.hue}, 100%, 50%)`;
    ctx.shadowBlur = 8;
  }
  ctx.globalAlpha = fAlpha;
  ctx.textAlign = 'center';
  ctx.fillText(f.text, f.x, f.y);
  ctx.restore();
}

if (st.gameOver) {
  ctx.save();
  ctx.fillStyle = 'rgba(5, 7, 20, 0.88)';
  ctx.fillRect(boardX - 10, boardY - 10, boardW + 20, boardH + 20);

  ctx.textAlign = 'center';
  ctx.font = '900 56px "Impact", "Arial Black", sans-serif';
  ctx.fillStyle = '#ff1744';
  if (glowEnabled) {
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = 18;
  }
  ctx.fillText('GAME OVER', boardX + boardW * 0.5, boardY + boardH * 0.28);
  ctx.shadowBlur = 0;

  ctx.font = '900 22px "Impact", sans-serif';
  ctx.fillStyle = pal.textSub;
  ctx.fillText('ROUND MVP', boardX + boardW * 0.5, boardY + boardH * 0.40);

  ctx.font = '900 44px "Impact", sans-serif';
  ctx.fillStyle = `hsl(${st.winnerHue}, 100%, 65%)`;
  if (glowEnabled) {
    ctx.shadowColor = `hsl(${st.winnerHue}, 100%, 50%)`;
    ctx.shadowBlur = 14;
  }
  ctx.fillText(st.winnerLabel, boardX + boardW * 0.5, boardY + boardH * 0.48);
  ctx.shadowBlur = 0;

  ctx.font = '900 24px monospace';
  ctx.fillStyle = '#ffe600';
  ctx.fillText(`SCORE: ${st.score}`, boardX + boardW * 0.5, boardY + boardH * 0.60);
  ctx.fillText(`LINES: ${st.lines}`, boardX + boardW * 0.5, boardY + boardH * 0.66);

  ctx.font = '900 20px "Impact", sans-serif';
  ctx.fillStyle = pal.textMain;
  const cd = Math.max(1, Math.ceil(st.gameOverTimer));
  ctx.fillText(`NEXT ROUND IN ${cd}...`, boardX + boardW * 0.5, boardY + boardH * 0.80);
  ctx.restore();
} else if (st.bannerTimer > 0) {
  ctx.save();
  const pulse = 1 + 0.06 * Math.sin(frame.t * 18);
  ctx.translate(boardX + boardW * 0.5, boardY + boardH * 0.42);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(-boardW * 0.48, -35, boardW * 0.96, 70);
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-boardW * 0.48, -35, boardW * 0.96, 70);
  ctx.textAlign = 'center';
  ctx.font = '900 42px "Impact", "Arial Black", sans-serif';
  ctx.fillStyle = '#ffe600';
  if (glowEnabled) {
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 14;
  }
  ctx.fillText(st.bannerText, 0, 14);
  ctx.restore();
}

ctx.restore();