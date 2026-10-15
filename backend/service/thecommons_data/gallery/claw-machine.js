const W = frame.width;
const H = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.1);
const t = frame.t;

// Read variables with fallbacks
const clawSpeedMult = getVar('claw_speed') ?? 1.5;
const styleKey = getVar('plush_style') || 'neon_arcade';
const gripKey = getVar('claw_grip') || 'fair_play';
const toyCount = getVar('toys_density') ?? 35;
const showConfetti = getVar('confetti_burst') ?? true;

const gripChances = { arcade_rigged: 0.35, fair_play: 0.65, super_magnet: 0.95 };
const gripSuccessRate = gripChances[gripKey] ?? 0.65;

// Style Palettes
const stylePalettes = {
  neon_arcade: [330, 190, 120, 270, 45, 15],
  kawaii_pastel: [340, 200, 150, 280, 50, 100],
  cyber_gold: [42, 48, 180, 200, 30, 55]
};
const activeHues = stylePalettes[styleKey] || stylePalettes.neon_arcade;

// Machine geometry
const cabinet = {
  left: W * 0.08,
  right: W * 0.92,
  top: H * 0.09,
  bottom: H * 0.93,
  railY: H * 0.22,
  chuteX: W * 0.18,
  chuteW: W * 0.14,
  chuteY: H * 0.72,
  pileLeft: W * 0.28,
  pileRight: W * 0.89,
  pileBottom: H * 0.88
};

// Persistent game state
room.state.init ??= false;
room.state.plushies ??= [];
room.state.particles ??= [];
room.state.scores ??= {};
room.state.turnIndex ??= 0;
room.state.idleTimer ??= 0;
room.state.activePlayer ??= { id: 'bot', hue: 45, name: 'ATTRACT' };
room.state.statusBanner ??= { text: 'HIT DROP!', sub: 'TEST YOUR SKILL', timer: 2, hue: 60 };
room.state.claw ??= {
  x: (cabinet.pileLeft + cabinet.pileRight) * 0.5,
  y: cabinet.railY + 36,
  dir: 1,
  state: 'SWEEP',
  cableLen: 36,
  open: 0.65,
  heldIdx: -1,
  slipY: 0,
  targetY: 0,
  stateTimer: 0
};

const claw = room.state.claw;

// Reinitialize plush pile if count changed or first frame
if (!room.state.init || room.state.plushies.length !== toyCount) {
  room.state.plushies = [];
  const types = ['bear', 'bunny', 'star', 'squid', 'cat'];
  for (let i = 0; i < toyCount; i++) {
    const col = (i % 7) / 7;
    const row = Math.floor(i / 7);
    const px = cabinet.pileLeft + 40 + col * (cabinet.pileRight - cabinet.pileLeft - 80) + (Math.sin(i * 99) * 20);
    const py = cabinet.pileBottom - 30 - row * 28 + (Math.cos(i * 33) * 12);
    room.state.plushies.push({
      x: px,
      y: py,
      origX: px,
      origY: py,
      rot: (Math.sin(i * 4.7) * 0.4),
      type: types[i % types.length],
      hue: activeHues[i % activeHues.length],
      size: 26 + (i % 4) * 4,
      vy: 0,
      inChute: false,
      chuteProgress: 0
    });
  }
  room.state.init = true;
}

// Identify current player
const peopleList = Array.isArray(room.people) ? room.people : [];
let currentPlayer = null;
if (peopleList.length > 0) {
  const idx = Math.abs(room.state.turnIndex) % peopleList.length;
  const p = peopleList[idx];
  currentPlayer = {
    id: p.id,
    hue: typeof p.hue === 'number' ? p.hue : 180,
    name: p.table ? `TABLE ${p.table}` : `P${idx + 1}`
  };
} else {
  currentPlayer = {
    id: 'demo',
    hue: (Math.floor(t * 30)) % 360,
    name: 'ARCADE BOT'
  };
}

// Handle events: check for drop trigger
let dropRequested = false;
let dropOwner = currentPlayer;
if (Array.isArray(room.events)) {
  for (const ev of room.events) {
    if (ev.name === 'drop') {
      dropRequested = true;
      const finder = peopleList.find(p => p.id === ev.participantId);
      if (finder) {
        dropOwner = {
          id: finder.id,
          hue: typeof finder.hue === 'number' ? finder.hue : 200,
          name: finder.table ? `TABLE ${finder.table}` : 'PLAYER'
        };
      }
      room.state.idleTimer = 0;
      break;
    }
  }
}

// Attract mode: auto-drop if idle in SWEEP
if (claw.state === 'SWEEP') {
  room.state.idleTimer += dt;
  if (room.state.idleTimer > 4.8) {
    dropRequested = true;
    dropOwner = currentPlayer;
    room.state.idleTimer = 0;
  }
}

// Audio bounce reaction
const bassKick = audio.bass || 0;
const beat = audio.beat || false;

// CLAW STATE MACHINE
const sweepMinX = cabinet.pileLeft + 30;
const sweepMaxX = cabinet.pileRight - 30;

if (claw.state === 'SWEEP') {
  claw.open = 0.65;
  claw.y = cabinet.railY + 36;
  const sweepSpeed = (sweepMaxX - sweepMinX) * 0.45 * clawSpeedMult;
  claw.x += claw.dir * sweepSpeed * dt;
  if (claw.x >= sweepMaxX) {
    claw.x = sweepMaxX;
    claw.dir = -1;
  } else if (claw.x <= sweepMinX) {
    claw.x = sweepMinX;
    claw.dir = 1;
  }

  room.state.statusBanner.text = `${currentPlayer.name}'S TURN`;
  room.state.statusBanner.sub = 'PRESS DROP!';
  room.state.statusBanner.hue = currentPlayer.hue;

  if (dropRequested) {
    claw.state = 'DROP';
    claw.stateTimer = 0;
    room.state.activePlayer = dropOwner;
    claw.targetY = cabinet.pileBottom - 35 - Math.random() * 40;
    room.state.statusBanner.text = 'DROPPING!';
    room.state.statusBanner.sub = 'STEADY...';
    room.state.statusBanner.hue = dropOwner.hue;
  }
} else if (claw.state === 'DROP') {
  const dropSpeed = H * 0.55;
  claw.y += dropSpeed * dt;
  claw.open = 0.85;
  if (claw.y >= claw.targetY) {
    claw.y = claw.targetY;
    claw.state = 'GRAB';
    claw.stateTimer = 0.45;
  }
} else if (claw.state === 'GRAB') {
  claw.stateTimer -= dt;
  claw.open = Math.max(0.12, claw.open - dt * 2.2);
  if (claw.stateTimer <= 0) {
    // Find nearest plush
    let closestIdx = -1;
    let closestDist = 70;
    for (let i = 0; i < room.state.plushies.length; i++) {
      const p = room.state.plushies[i];
      if (p.inChute) continue;
      const d = Math.hypot(p.x - claw.x, p.y - (claw.y + 20));
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }

    const willWin = Math.random() < gripSuccessRate;
    if (closestIdx >= 0 && willWin) {
      claw.heldIdx = closestIdx;
      claw.slipY = -1;
      room.state.statusBanner.text = 'GOT ONE!';
      room.state.statusBanner.sub = 'HOLD TIGHT...';
    } else if (closestIdx >= 0 && !willWin && Math.random() < 0.7) {
      // Arcade tease: grabs but slips halfway
      claw.heldIdx = closestIdx;
      claw.slipY = cabinet.railY + (claw.targetY - cabinet.railY) * (0.35 + Math.random() * 0.3);
      room.state.statusBanner.text = 'LOOKS GOOD?!';
      room.state.statusBanner.sub = 'WOBBLY GRIP...';
    } else {
      claw.heldIdx = -1;
      room.state.statusBanner.text = 'MISSED!';
      room.state.statusBanner.sub = 'BETTER LUCK NEXT ROUND';
    }
    claw.state = 'LIFT';
  }
} else if (claw.state === 'LIFT') {
  const liftSpeed = H * 0.42;
  claw.y -= liftSpeed * dt;
  claw.open = 0.18;

  // Check slip tease
  if (claw.heldIdx >= 0 && claw.slipY > 0 && claw.y <= claw.slipY) {
    const slipped = room.state.plushies[claw.heldIdx];
    if (slipped) {
      slipped.vy = 80;
    }
    claw.heldIdx = -1;
    room.state.statusBanner.text = 'SLIPPED!';
    room.state.statusBanner.sub = 'SO CLOSE!';
    room.state.statusBanner.hue = 10;
  }

  if (claw.heldIdx >= 0) {
    const p = room.state.plushies[claw.heldIdx];
    if (p) {
      p.x = claw.x;
      p.y = claw.y + 26;
      p.rot = Math.sin(t * 14) * 0.25;
    }
  }

  if (claw.y <= cabinet.railY + 36) {
    claw.y = cabinet.railY + 36;
    if (claw.heldIdx >= 0) {
      claw.state = 'CARRY';
      room.state.statusBanner.text = 'GOING TO CHUTE!';
      room.state.statusBanner.sub = 'BRING IT HOME';
    } else {
      claw.state = 'COOLDOWN';
      claw.stateTimer = 1.0;
    }
  }
} else if (claw.state === 'CARRY') {
  const carrySpeed = W * 0.32;
  claw.x -= carrySpeed * dt;
  if (claw.heldIdx >= 0) {
    const p = room.state.plushies[claw.heldIdx];
    if (p) {
      p.x = claw.x;
      p.y = claw.y + 26;
      p.rot = Math.sin(t * 10) * 0.15;
    }
  }
  if (claw.x <= cabinet.chuteX) {
    claw.x = cabinet.chuteX;
    claw.state = 'RELEASE';
    claw.stateTimer = 0.8;
  }
} else if (claw.state === 'RELEASE') {
  claw.open = Math.min(0.85, claw.open + dt * 3.0);
  if (claw.heldIdx >= 0) {
    const won = room.state.plushies[claw.heldIdx];
    if (won) {
      won.inChute = true;
      won.vy = 260;
    }
    claw.heldIdx = -1;

    const pid = room.state.activePlayer.id;
    room.state.scores[pid] = (room.state.scores[pid] || 0) + 1;

    room.state.statusBanner.text = 'WINNER!';
    room.state.statusBanner.sub = `${room.state.activePlayer.name} WON A TOY!`;
    room.state.statusBanner.hue = room.state.activePlayer.hue;

    if (showConfetti) {
      for (let k = 0; k < 60; k++) {
        if (room.state.particles.length > 150) room.state.particles.shift();
        room.state.particles.push({
          x: cabinet.chuteX + (Math.random() - 0.5) * 40,
          y: cabinet.chuteY + 20,
          vx: (Math.random() - 0.5) * 450,
          vy: -200 - Math.random() * 380,
          hue: (room.state.activePlayer.hue + (Math.random() * 80 - 40) + 360) % 360,
          size: 6 + Math.random() * 8,
          rot: Math.random() * 6.28,
          vRot: (Math.random() - 0.5) * 12,
          life: 2.2
        });
      }
    }
  }

  claw.stateTimer -= dt;
  if (claw.stateTimer <= 0) {
    claw.state = 'COOLDOWN';
    claw.stateTimer = 1.4;
  }
} else if (claw.state === 'COOLDOWN') {
  claw.stateTimer -= dt;
  claw.open = 0.65;
  if (claw.stateTimer <= 0) {
    if (peopleList.length > 0) {
      room.state.turnIndex = (room.state.turnIndex + 1) % peopleList.length;
    }
    claw.state = 'SWEEP';
    claw.dir = 1;
    room.state.idleTimer = 0;
  }
}

// Update falling/tumbling plushies
for (let i = 0; i < room.state.plushies.length; i++) {
  const p = room.state.plushies[i];
  if (p.inChute) {
    p.y += p.vy * dt;
    p.vy += 650 * dt;
    p.rot += 4 * dt;
    p.size = Math.max(8, p.size - dt * 14);
    if (p.y > cabinet.bottom + 60) {
      p.inChute = false;
      p.y = cabinet.pileBottom - 30 - Math.random() * 70;
      p.x = cabinet.pileLeft + 40 + Math.random() * (cabinet.pileRight - cabinet.pileLeft - 80);
      p.origX = p.x;
      p.origY = p.y;
      p.vy = 0;
      p.size = 28;
    }
  } else if (i !== claw.heldIdx) {
    const bounce = Math.sin(t * 6 + p.origX * 0.05) * bassKick * 6;
    p.y = p.origY + bounce;
    if (p.vy > 0) {
      p.y += p.vy * dt;
      p.vy += 800 * dt;
      if (p.y >= p.origY) {
        p.y = p.origY;
        p.vy = 0;
      }
    }
  }
}

// Update Confetti
for (let i = room.state.particles.length - 1; i >= 0; i--) {
  const pt = room.state.particles[i];
  pt.x += pt.vx * dt;
  pt.y += pt.vy * dt;
  pt.vy += 520 * dt;
  pt.rot += pt.vRot * dt;
  pt.life -= dt;
  if (pt.life <= 0 || pt.y > H + 40) {
    room.state.particles.splice(i, 1);
  }
}

// ==================== RENDERING ====================
ctx.save();

// Dark arcade backdrop
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, '#090514');
bgGrad.addColorStop(0.5, '#120b24');
bgGrad.addColorStop(1, '#06030c');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Retro floor perspective lines
ctx.save();
ctx.strokeStyle = 'rgba(120, 50, 220, 0.12)';
ctx.lineWidth = 1.5;
for (let vx = -W; vx < W * 2; vx += 120) {
  ctx.beginPath();
  ctx.moveTo(vx, H);
  ctx.lineTo(W * 0.5 + (vx - W * 0.5) * 0.25, H * 0.65);
  ctx.stroke();
}
ctx.restore();

// Draw Cabinet Frame
ctx.save();
ctx.strokeStyle = `hsl(${(t * 20) % 360}, 90%, 65%)`;
ctx.lineWidth = 6;
ctx.shadowColor = `hsl(${(t * 20) % 360}, 100%, 60%)`;
ctx.shadowBlur = beat ? 24 : 14;

const cabX = cabinet.left - 16;
const cabY = cabinet.top - 10;
const cabW = (cabinet.right - cabinet.left) + 32;
const cabH = (cabinet.bottom - cabinet.top) + 20;
ctx.strokeRect(cabX, cabY, cabW, cabH);
ctx.restore();

// Cabinet interior glass panel
ctx.fillStyle = '#0f0c22';
ctx.fillRect(cabinet.left, cabinet.top + 34, cabinet.right - cabinet.left, cabinet.bottom - cabinet.top - 34);

// Interior neon back-grid
ctx.strokeStyle = 'rgba(80, 220, 255, 0.08)';
ctx.lineWidth = 1;
for (let gx = cabinet.left; gx <= cabinet.right; gx += 45) {
  ctx.beginPath();
  ctx.moveTo(gx, cabinet.top + 34);
  ctx.lineTo(gx, cabinet.bottom);
  ctx.stroke();
}
for (let gy = cabinet.top + 34; gy <= cabinet.bottom; gy += 45) {
  ctx.beginPath();
  ctx.moveTo(cabinet.left, gy);
  ctx.lineTo(cabinet.right, gy);
  ctx.stroke();
}

// Prize Chute Wall & Opening
ctx.save();
ctx.fillStyle = '#080512';
ctx.fillRect(cabinet.left, cabinet.chuteY, cabinet.chuteW + 18, cabinet.bottom - cabinet.chuteY);
ctx.strokeStyle = '#ff0077';
ctx.lineWidth = 3;
ctx.strokeRect(cabinet.left + 8, cabinet.chuteY + 8, cabinet.chuteW, cabinet.bottom - cabinet.chuteY - 16);

const arrowPhase = Math.floor(t * 4) % 2 === 0;
ctx.fillStyle = arrowPhase ? '#ff0077' : '#ffea00';
ctx.font = '900 18px Impact, Arial Black, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('PRIZE DROP', cabinet.left + cabinet.chuteW * 0.5 + 8, cabinet.chuteY + 34);
ctx.fillText('▼ ▼ ▼', cabinet.left + cabinet.chuteW * 0.5 + 8, cabinet.chuteY + 54);
ctx.restore();

// Helper to draw cute plush toys
function drawPlush(toy) {
  ctx.save();
  ctx.translate(toy.x, toy.y);
  ctx.rotate(toy.rot);
  const s = toy.size;
  const h = toy.hue;
  const isKawaii = styleKey === 'kawaii_pastel';
  const isCyber = styleKey === 'cyber_gold';

  const sat = isKawaii ? '70%' : isCyber ? '90%' : '85%';
  const lit = isKawaii ? '72%' : isCyber ? '55%' : '60%';
  const baseFill = `hsl(${h}, ${sat}, ${lit})`;

  ctx.fillStyle = baseFill;
  ctx.strokeStyle = '#100820';
  ctx.lineWidth = 2.5;

  if (toy.type === 'bear') {
    ctx.beginPath();
    ctx.arc(-s * 0.65, -s * 0.65, s * 0.35, 0, Math.PI * 2);
    ctx.arc(s * 0.65, -s * 0.65, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.25, s * 0.45, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, s * 0.15, s * 0.14, 0, Math.PI * 2);
    ctx.arc(-s * 0.38, -s * 0.12, s * 0.12, 0, Math.PI * 2);
    ctx.arc(s * 0.38, -s * 0.12, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (toy.type === 'bunny') {
    ctx.beginPath();
    ctx.ellipse(-s * 0.45, -s * 1.1, s * 0.22, s * 0.65, -0.15, 0, Math.PI * 2);
    ctx.ellipse(s * 0.45, -s * 1.1, s * 0.22, s * 0.65, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.9, s * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff88aa';
    ctx.beginPath();
    ctx.arc(-s * 0.5, s * 0.2, s * 0.16, 0, Math.PI * 2);
    ctx.arc(s * 0.5, s * 0.2, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-s * 0.35, -s * 0.05, s * 0.11, 0, Math.PI * 2);
    ctx.arc(s * 0.35, -s * 0.05, s * 0.11, 0, Math.PI * 2);
    ctx.arc(0, s * 0.15, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (toy.type === 'star') {
    ctx.beginPath();
    for (let p = 0; p < 5; p++) {
      const a = (p * Math.PI * 2) / 5 - Math.PI / 2;
      const ia = a + Math.PI / 5;
      const rx = Math.cos(a) * s * 1.25;
      const ry = Math.sin(a) * s * 1.25;
      const irx = Math.cos(ia) * s * 0.58;
      const iry = Math.sin(ia) * s * 0.58;
      if (p === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
      ctx.lineTo(irx, iry);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-s * 0.3, 0, s * 0.12, 0, Math.PI * 2);
    ctx.arc(s * 0.3, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, s * 0.15, s * 0.18, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (toy.type === 'squid') {
    ctx.beginPath();
    ctx.arc(0, -s * 0.2, s * 0.85, Math.PI, 0);
    ctx.lineTo(s * 0.85, s * 0.5);
    for (let k = 4; k >= -4; k -= 2) {
      ctx.quadraticCurveTo(s * (k * 0.1), s * 0.9, s * ((k - 1) * 0.1), s * 0.5);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-s * 0.35, 0, s * 0.22, 0, Math.PI * 2);
    ctx.arc(s * 0.35, 0, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-s * 0.35, 0, s * 0.12, 0, Math.PI * 2);
    ctx.arc(s * 0.35, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, -s * 0.3);
    ctx.lineTo(-s * 0.65, -s * 1.05);
    ctx.lineTo(-s * 0.15, -s * 0.6);
    ctx.lineTo(s * 0.15, -s * 0.6);
    ctx.lineTo(s * 0.65, -s * 1.05);
    ctx.lineTo(s * 0.8, -s * 0.3);
    ctx.arc(0, 0, s * 0.85, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-s * 0.32, -s * 0.05, s * 0.12, 0, Math.PI * 2);
    ctx.arc(s * 0.32, -s * 0.05, s * 0.12, 0, Math.PI * 2);
    ctx.arc(0, s * 0.16, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-s * 0.32 - s * 0.04, -s * 0.05 - s * 0.04, s * 0.04, 0, Math.PI * 2);
  ctx.arc(s * 0.32 - s * 0.04, -s * 0.05 - s * 0.04, s * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Render plushies pile
for (let i = 0; i < room.state.plushies.length; i++) {
  if (i !== claw.heldIdx) {
    drawPlush(room.state.plushies[i]);
  }
}

// Render Held Plush
if (claw.heldIdx >= 0) {
  const held = room.state.plushies[claw.heldIdx];
  if (held) drawPlush(held);
}

// Overhead Gantry Rail
ctx.save();
ctx.fillStyle = '#1f1a3a';
ctx.fillRect(cabinet.left, cabinet.railY - 8, cabinet.right - cabinet.left, 16);
ctx.strokeStyle = '#503580';
ctx.lineWidth = 2;
ctx.strokeRect(cabinet.left, cabinet.railY - 8, cabinet.right - cabinet.left, 16);

// Trolley Mechanism
const trolleyW = 44;
const trolleyH = 22;
ctx.fillStyle = '#392d5c';
ctx.fillRect(claw.x - trolleyW * 0.5, cabinet.railY - 11, trolleyW, trolleyH);
ctx.strokeStyle = '#00f0ff';
ctx.lineWidth = 2;
ctx.strokeRect(claw.x - trolleyW * 0.5, cabinet.railY - 11, trolleyW, trolleyH);

// Cable from trolley to claw hub
ctx.strokeStyle = '#d6d0ea';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(claw.x, cabinet.railY + 11);
const cableTremor = (audio.treble || 0) * Math.sin(t * 40) * 3;
ctx.lineTo(claw.x + cableTremor, claw.y);
ctx.stroke();

// Claw Hub Housing
ctx.translate(claw.x, claw.y);
ctx.fillStyle = '#261c47';
ctx.beginPath();
ctx.arc(0, 0, 16, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = '#ffea00';
ctx.lineWidth = 3;
ctx.stroke();

// Hub LED light status
ctx.fillStyle = claw.state === 'GRAB' ? '#ff0055' : claw.state === 'DROP' ? '#ffaa00' : '#00ff88';
ctx.beginPath();
ctx.arc(0, 0, 6, 0, Math.PI * 2);
ctx.fill();

// 3 Articulated Mechanical Prongs
const prongAngles = [-claw.open, 0, claw.open];
for (let i = 0; i < 3; i++) {
  ctx.save();
  const a = prongAngles[i];
  ctx.rotate(a);
  ctx.strokeStyle = '#e0daf5';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 8);
  const bendX = (i - 1) * 10;
  ctx.quadraticCurveTo(bendX * 1.5, 26, (i - 1) * 16, 44);
  ctx.stroke();
  ctx.fillStyle = '#ff0077';
  ctx.beginPath();
  ctx.arc((i - 1) * 16, 44, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
ctx.restore();

// Glass reflections
ctx.save();
ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
ctx.beginPath();
ctx.moveTo(cabinet.left, cabinet.top + 34);
ctx.lineTo(cabinet.left + 80, cabinet.top + 34);
ctx.lineTo(cabinet.left + 220, cabinet.bottom);
ctx.lineTo(cabinet.left + 140, cabinet.bottom);
ctx.closePath();
ctx.fill();

ctx.beginPath();
ctx.moveTo(cabinet.left + 240, cabinet.top + 34);
ctx.lineTo(cabinet.left + 380, cabinet.top + 34);
ctx.lineTo(cabinet.left + 580, cabinet.bottom);
ctx.lineTo(cabinet.left + 440, cabinet.bottom);
ctx.closePath();
ctx.fill();
ctx.restore();

// Top Marquee Sign: NEON CLAW
ctx.save();
ctx.fillStyle = '#110b24';
ctx.fillRect(cabinet.left, cabinet.top - 4, cabinet.right - cabinet.left, 42);

// Animated marquee bulbs
const bulbCount = 28;
for (let b = 0; b < bulbCount; b++) {
  const bx = cabinet.left + 14 + (b / (bulbCount - 1)) * (cabinet.right - cabinet.left - 28);
  const by = cabinet.top + 4;
  const on = (Math.floor(t * 8) + b) % 3 === 0;
  ctx.fillStyle = on ? '#00ffff' : '#ff0055';
  ctx.beginPath();
  ctx.arc(bx, by, 3, 0, Math.PI * 2);
  ctx.fill();
}

ctx.font = '900 24px Impact, Arial Black, sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = '#ffe600';
ctx.shadowColor = '#ffe600';
ctx.shadowBlur = 12;
ctx.fillText('★ NEON CLAW ARCADE ★', (cabinet.left + cabinet.right) * 0.5, cabinet.top + 28);
ctx.restore();

// HUD: Status Banner
ctx.save();
const banner = room.state.statusBanner;
ctx.font = '900 38px Impact, Arial Black, sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = `hsl(${banner.hue || 60}, 100%, 65%)`;
ctx.shadowColor = `hsl(${banner.hue || 60}, 100%, 50%)`;
ctx.shadowBlur = 16;
ctx.fillText(banner.text, W * 0.55, H * 0.38);

ctx.font = '700 18px Arial Black, sans-serif';
ctx.fillStyle = '#ffffff';
ctx.shadowBlur = 8;
ctx.shadowColor = '#000000';
ctx.fillText(banner.sub, W * 0.55, H * 0.42);
ctx.restore();

// Top-right Scoreboard
ctx.save();
ctx.textAlign = 'left';
const boardX = Math.min(W * 0.72, cabinet.right - 220);
const boardY = cabinet.top + 48;

ctx.fillStyle = 'rgba(10, 6, 22, 0.75)';
ctx.strokeStyle = '#4b327b';
ctx.lineWidth = 1.5;
ctx.fillRect(boardX - 8, boardY - 6, 210, 110);
ctx.strokeRect(boardX - 8, boardY - 6, 210, 110);

ctx.font = '900 13px Impact, sans-serif';
ctx.fillStyle = '#00f0ff';
ctx.fillText('LEADERBOARD / TURNS', boardX, boardY + 12);

if (peopleList.length === 0) {
  ctx.font = '600 12px sans-serif';
  ctx.fillStyle = '#9e8fc5';
  ctx.fillText('Attract Mode (0 connected)', boardX, boardY + 34);
  ctx.fillText('Trigger Drop to play!', boardX, boardY + 54);
} else {
  const displayCount = Math.min(3, peopleList.length);
  for (let pIdx = 0; pIdx < displayCount; pIdx++) {
    const person = peopleList[pIdx];
    const isTurn = person.id === currentPlayer.id;
    const score = room.state.scores[person.id] || 0;
    const py = boardY + 34 + pIdx * 22;

    ctx.fillStyle = `hsl(${person.hue ?? 180}, 90%, 60%)`;
    ctx.beginPath();
    ctx.arc(boardX + 8, py - 4, isTurn ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    if (isTurn) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.font = isTurn ? '700 13px Arial Black, sans-serif' : '500 12px sans-serif';
    ctx.fillStyle = isTurn ? '#ffffff' : '#cfc3eb';
    const label = person.table ? `Table ${person.table}` : `Player ${pIdx + 1}`;
    ctx.fillText(`${label}: ${score} pts ${isTurn ? '◀' : ''}`, boardX + 22, py);
  }
}
ctx.restore();

// Render Confetti Particles
if (room.state.particles.length > 0) {
  ctx.save();
  for (const pt of room.state.particles) {
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(pt.rot);
    ctx.fillStyle = `hsl(${pt.hue}, 95%, 60%)`;
    ctx.shadowColor = `hsl(${pt.hue}, 100%, 50%)`;
    ctx.shadowBlur = 8;
    ctx.fillRect(-pt.size * 0.5, -pt.size * 0.5, pt.size, pt.size * 0.6);
    ctx.restore();
  }
  ctx.restore();
}

ctx.restore();