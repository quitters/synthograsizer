const W = 320, H = 180;

const RULES = {
  highway_9:    [3, 1, 1, 1, 1, 1, 3, 3, 1],
  chaos_4:      [3, 3, 1, 1],
  crystal_6:    [1, 3, 3, 1, 1, 3],
  labyrinth_12: [1, 1, 3, 3, 3, 1, 3, 3, 3, 1, 1, 1]
};

const PALETTES = {
  amiga_copper: [
    [8, 10, 20], [42, 18, 54], [92, 28, 80], [150, 40, 75],
    [200, 65, 52], [235, 110, 42], [250, 165, 45], [255, 215, 70],
    [255, 245, 140], [255, 255, 215], [175, 220, 245], [120, 160, 225]
  ],
  cyber_neon: [
    [6, 8, 18], [15, 45, 85], [0, 135, 195], [0, 220, 210],
    [50, 245, 160], [120, 255, 90], [225, 240, 50], [255, 175, 40],
    [255, 50, 130], [210, 35, 220], [130, 25, 240], [70, 20, 175]
  ],
  matrix_phosphor: [
    [4, 10, 6], [10, 32, 16], [14, 60, 25], [18, 92, 35],
    [24, 130, 48], [35, 172, 64], [60, 210, 85], [105, 238, 115],
    [165, 255, 170], [218, 255, 218], [95, 205, 165], [40, 145, 125]
  ],
  solar_plasma: [
    [12, 6, 10], [42, 12, 24], [85, 18, 30], [135, 30, 32],
    [185, 52, 32], [225, 88, 32], [248, 142, 38], [255, 192, 50],
    [255, 230, 85], [255, 252, 170], [255, 255, 235], [195, 135, 210]
  ]
};

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

if (!room.state.grid) {
  room.state.grid = new Uint8Array(W * H);
  room.state.offscreen = new OffscreenCanvas(W, H);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.imgData = room.state.offCtx.createImageData(W, H);
  const d = room.state.imgData.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  room.state.ants = [
    { x: 160, y: 90, dir: 0, hue: 195, tag: 'Alpha' },
    { x: 160, y: 90, dir: 1, hue: 45,  tag: 'Beta' },
    { x: 160, y: 90, dir: 2, hue: 320, tag: 'Gamma' }
  ];
  room.state.lastPalKey = '';
  room.state.pulses = [];
}

const grid = room.state.grid;
const imgData = room.state.imgData;
const imgBytes = imgData.data;
const ants = room.state.ants;

// Handle events
if (room.events) {
  for (const e of room.events) {
    if (e.name === 'clear_nest') {
      grid.fill(0);
      for (let i = 0; i < W * H; i++) {
        const px = i << 2;
        imgBytes[px] = 8; imgBytes[px + 1] = 10; imgBytes[px + 2] = 20;
      }
      ants.length = 0;
      ants.push(
        { x: 160, y: 90, dir: 0, hue: 195, tag: 'Alpha' },
        { x: 160, y: 90, dir: 1, hue: 45,  tag: 'Beta' }
      );
    } else if (e.name === 'spawn_ant') {
      const p = room.people ? room.people.find(person => person.id === e.participantId) : null;
      const hue = p ? p.hue : Math.floor((frame.t * 70) % 360);
      const tag = p ? (p.table || 'User') : 'Guest';
      if (ants.length >= 48) ants.shift();
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * 20;
      ants.push({
        x: Math.max(0, Math.min(W - 1, Math.floor(160 + Math.cos(ang) * rad))),
        y: Math.max(0, Math.min(H - 1, Math.floor(90 + Math.sin(ang) * rad))),
        dir: Math.floor(Math.random() * 4),
        hue,
        tag
      });
      room.state.pulses.push({ x: 160, y: 90, r: 0, hue });
      if (room.state.pulses.length > 8) room.state.pulses.shift();
    }
  }
}

const ruleKey = getVar('rule') ?? 'highway_9';
const currentRule = RULES[ruleKey] ?? RULES.highway_9;
const ruleLen = currentRule.length;

const palKey = getVar('palette') ?? 'amiga_copper';
const currentPal = PALETTES[palKey] ?? PALETTES.amiga_copper;
const palLen = currentPal.length;

if (room.state.lastPalKey !== palKey) {
  room.state.lastPalKey = palKey;
  for (let i = 0; i < W * H; i++) {
    const st = grid[i];
    const col = currentPal[st % palLen];
    const px = i << 2;
    imgBytes[px] = col[0];
    imgBytes[px + 1] = col[1];
    imgBytes[px + 2] = col[2];
  }
}

const baseSteps = getVar('steps_per_frame') ?? 300;
const boostMode = getVar('audio_boost') ?? 'balanced';
const boostMult = boostMode === 'overdrive' ? 2.5 : (boostMode === 'subtle' ? 0.6 : 1.4);
const audioBump = 1 + (audio.bass || 0) * boostMult + (audio.beat ? 0.4 : 0);
const stepsToRun = Math.floor(baseSteps * audioBump);

// Hot simulation step loop: pure indices, 0 allocations
const numAnts = ants.length;
if (numAnts > 0) {
  const stepsPerAnt = Math.max(1, Math.floor(stepsToRun / numAnts));
  for (let a = 0; a < numAnts; a++) {
    const ant = ants[a];
    let ax = ant.x;
    let ay = ant.y;
    let adir = ant.dir;

    for (let s = 0; s < stepsPerAnt; s++) {
      const idx = ay * W + ax;
      const state = grid[idx];
      const turn = currentRule[state % ruleLen];
      adir = (adir + turn) & 3;
      const nextState = (state + 1) % ruleLen;
      grid[idx] = nextState;

      const col = currentPal[nextState % palLen];
      const px = idx << 2;
      imgBytes[px] = col[0];
      imgBytes[px + 1] = col[1];
      imgBytes[px + 2] = col[2];

      const vec = DIRS[adir];
      ax = (ax + vec[0] + W) % W;
      ay = (ay + vec[1] + H) % H;
    }

    ant.x = ax;
    ant.y = ay;
    ant.dir = adir;
  }
}

room.state.offCtx.putImageData(imgData, 0, 0);

ctx.save();
ctx.fillStyle = '#05070d';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.imageSmoothingEnabled = false;
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

const glowSetting = getVar('glow_intensity') ?? 0.5;
if (glowSetting > 0.05) {
  ctx.save();
  ctx.globalAlpha = glowSetting * (0.28 + (audio.mid || 0) * 0.25);
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = 'blur(10px)';
  ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);
  ctx.restore();
}

// Render ant heads and interactive markers
const scaleX = frame.width / W;
const scaleY = frame.height / H;

ctx.save();
for (let a = 0; a < ants.length; a++) {
  const ant = ants[a];
  const sx = (ant.x + 0.5) * scaleX;
  const sy = (ant.y + 0.5) * scaleY;
  const pulse = 1 + (audio.treble || 0) * 0.6;
  const rad = 4 * pulse;

  ctx.fillStyle = `hsl(${ant.hue}, 100%, 65%)`;
  ctx.shadowColor = `hsl(${ant.hue}, 100%, 75%)`;
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.arc(sx, sy, rad, 0, Math.PI * 2);
  ctx.fill();

  // Heading chevron
  const v = DIRS[ant.dir];
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + v[0] * 12, sy + v[1] * 12);
  ctx.stroke();

  if (ants.length <= 16) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '10px monospace';
    ctx.shadowBlur = 0;
    ctx.fillText(ant.tag, sx + 8, sy - 6);
  }
}

// Shockwaves from recent triggers
const pulses = room.state.pulses;
for (let i = pulses.length - 1; i >= 0; i--) {
  const p = pulses[i];
  p.r += frame.dt * 450;
  const alpha = Math.max(0, 1 - p.r / 500);
  if (alpha <= 0) {
    pulses.splice(i, 1);
    continue;
  }
  ctx.strokeStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x * scaleX, p.y * scaleY, p.r, 0, Math.PI * 2);
  ctx.stroke();
}

// Retro demoscene overlay HUD
ctx.shadowBlur = 0;
ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
ctx.fillRect(16, 16, 420, 24);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
ctx.strokeRect(16, 16, 420, 24);

ctx.fillStyle = '#a0e0ff';
ctx.font = '11px monospace';
const hudText = `TURMITE CORE // RULE: ${ruleKey.toUpperCase()} // ANTS: ${ants.length} // SPEED: ${stepsToRun}/F`;
ctx.fillText(hudText, 24, 32);

// Audio VU bar
const vuW = 120 * (audio.level || 0);
ctx.fillStyle = audio.beat ? '#ff4070' : '#40ffb0';
ctx.fillRect(444, 20, vuW, 16);
ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
ctx.strokeRect(444, 20, 120, 16);

ctx.restore();
ctx.restore();