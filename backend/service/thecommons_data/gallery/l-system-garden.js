const themeName = getVar('flora_theme') ?? 'verdant';
const density = getVar('garden_density') ?? 10;
const breezeFactor = getVar('breeze_intensity') ?? 1.0;
const growFactor = getVar('growth_rate') ?? 1.0;
const canopy = getVar('canopy_style') ?? 'wild_mix';

const PALETTES = {
  verdant: {
    bgTop: '#040d0a', bgBot: '#0a1a12',
    ground: '#06130d',
    stems: ['#1d633f', '#2f855a', '#38a169', '#48bb78'],
    flowers: ['#ecc94b', '#f6ad55', '#faf089'],
    glow: 'rgba(72, 187, 120, 0.25)'
  },
  neon_twilight: {
    bgTop: '#090414', bgBot: '#150a2a',
    ground: '#0b0517',
    stems: ['#00b4d8', '#7209b7', '#f72585', '#4cc9f0'],
    flowers: ['#ff007f', '#00f5d4', '#fee440'],
    glow: 'rgba(247, 37, 133, 0.3)'
  },
  golden_hour: {
    bgTop: '#160a03', bgBot: '#2b1406',
    ground: '#1a0d04',
    stems: ['#9c4221', '#c05621', '#dd6b20', '#ed8936'],
    flowers: ['#fbd38d', '#feebc8', '#fffaf0'],
    glow: 'rgba(237, 137, 54, 0.25)'
  },
  bioluminescence: {
    bgTop: '#020b14', bgBot: '#051829',
    ground: '#030f1c',
    stems: ['#0077b6', '#0096c7', '#00b4d8', '#90e0ef'],
    flowers: ['#caf0f8', '#64dfdf', '#72efdd'],
    glow: 'rgba(0, 180, 216, 0.35)'
  }
};
const pal = PALETTES[themeName] ?? PALETTES.verdant;

// Precompiled compact bracketed L-system rule tables
// Tokens: 0:F (forward), 1:+(right), 2:-(left), 3:[(push), 4:](pop), 5:*(bud)
const SPECIES = {
  fern: {
    angle: 0.42,
    decay: 0.82,
    baseLen: 16,
    prog: [0,3,1,0,3,2,5,4,0,4,0,3,2,0,3,1,5,4,0,4,0,3,1,0,4,0,3,2,0,4,5]
  },
  bush: {
    angle: 0.48,
    decay: 0.74,
    baseLen: 22,
    prog: [0,3,1,0,3,1,5,4,2,0,5,4,0,3,2,0,3,2,5,4,1,0,5,4,0,3,1,0,4,5]
  },
  weed: {
    angle: 0.36,
    decay: 0.88,
    baseLen: 20,
    prog: [0,0,3,1,0,3,2,5,4,4,0,0,3,2,0,3,1,5,4,4,0,3,1,0,5,4,0,5]
  }
};

// Initialise fixed buffers in room.state
room.state.plants ??= [];
room.state.spores ??= [];
room.state.stackX ??= new Float32Array(64);
room.state.stackY ??= new Float32Array(64);
room.state.stackA ??= new Float32Array(64);
room.state.stackD ??= new Float32Array(64);

const plants = room.state.plants;
const spores = room.state.spores;

// Rebuild plants if density changes or first run
if (plants.length !== density) {
  plants.length = 0;
  for (let i = 0; i < density; i++) {
    let type = 'weed';
    if (canopy === 'ferns') type = 'fern';
    else if (canopy === 'flowering') type = 'bush';
    else {
      const pick = i % 3;
      type = pick === 0 ? 'fern' : (pick === 1 ? 'bush' : 'weed');
    }
    plants.push({
      type,
      rx: (i + 0.5 + (Math.sin(i * 99) * 0.35)) / density,
      scale: 0.75 + ((i * 37) % 50) * 0.01,
      phase: (i * 1.618) % (Math.PI * 2),
      grown: 0.15,
      speed: 0.18 + ((i * 13) % 20) * 0.01
    });
  }
}

// Spore / pollen system capped at 60
if (spores.length === 0) {
  for (let i = 0; i < 40; i++) {
    spores.push({
      x: Math.random() * frame.width,
      y: Math.random() * frame.height,
      vx: (Math.random() - 0.5) * 20,
      vy: -15 - Math.random() * 25,
      size: 1 + Math.random() * 2.5,
      life: Math.random()
    });
  }
}

// Audio influences
const bassKick = audio.bass * 0.8 + (audio.beat ? 0.4 : 0);
const audioBreeze = breezeFactor * (0.8 + audio.mid * 1.6 + bassKick * 0.6);
const windTime = frame.t * (0.9 + audio.level * 0.8);

ctx.save();

// Background gradient with bass breathing
const bgGrad = ctx.createLinearGradient(0, 0, 0, frame.height);
bgGrad.addColorStop(0, pal.bgTop);
bgGrad.addColorStop(1, pal.bgBot);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// Atmospheric glow at ground line
const groundY = frame.height * 0.94;
const auraGrad = ctx.createRadialGradient(frame.width * 0.5, groundY, 10, frame.width * 0.5, groundY, frame.width * 0.6);
auraGrad.addColorStop(0, pal.glow);
auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = auraGrad;
ctx.fillRect(0, 0, frame.width, frame.height);

// Render and update spores
ctx.save();
for (let i = 0; i < spores.length; i++) {
  const s = spores[i];
  s.x += (s.vx + Math.sin(frame.t + s.y * 0.01) * 25 * audioBreeze) * frame.dt;
  s.y += (s.vy - audio.treble * 30) * frame.dt;
  s.life += frame.dt * 0.25;
  if (s.y < groundY * 0.2 || s.life > 1 || s.x < 0 || s.x > frame.width) {
    s.x = Math.random() * frame.width;
    s.y = groundY - Math.random() * 40;
    s.life = 0;
  }
  const alpha = Math.sin(s.life * Math.PI) * (0.3 + audio.treble * 0.7);
  ctx.fillStyle = pal.flowers[i % pal.flowers.length];
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.size * (1 + bassKick * 0.5), 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// Reusable stack pointers
const sX = room.state.stackX;
const sY = room.state.stackY;
const sA = room.state.stackA;
const sD = room.state.stackD;

// Draw ground silhouette
ctx.fillStyle = pal.ground;
ctx.beginPath();
ctx.moveTo(0, frame.height);
ctx.lineTo(0, groundY);
for (let x = 0; x <= frame.width; x += 40) {
  const gy = groundY + Math.sin(x * 0.008 + frame.t * 0.3) * 6;
  ctx.lineTo(x, gy);
}
ctx.lineTo(frame.width, frame.height);
ctx.closePath();
ctx.fill();

// Draw each plant specimen
for (let i = 0; i < plants.length; i++) {
  const p = plants[i];
  const spec = SPECIES[p.type] ?? SPECIES.weed;
  const totalSteps = spec.prog.length;

  // Grow forward gradually, boosted by music
  p.grown = Math.min(1, p.grown + frame.dt * 0.05 * growFactor * p.speed * (1 + audio.level));
  const activeCount = Math.floor(p.grown * totalSteps);
  if (activeCount <= 0) continue;

  const rootX = p.rx * frame.width;
  const rootY = groundY + Math.sin(rootX * 0.008 + frame.t * 0.3) * 6;
  const scale = (frame.height / 700) * p.scale * (1 + bassKick * 0.08);
  const baseLen = spec.baseLen * scale;
  const baseAngle = spec.angle;

  let curX = rootX;
  let curY = rootY;
  let curA = -Math.PI * 0.5;
  let curD = 0;
  let sp = 0;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const stemColor = pal.stems[i % pal.stems.length];
  const flowerColor = pal.flowers[i % pal.flowers.length];

  for (let k = 0; k < activeCount; k++) {
    const op = spec.prog[k];
    // Wind deflection increases with height/branch depth
    const sway = Math.sin(windTime + p.phase + curD * 0.45) * 0.12 * audioBreeze;

    if (op === 0) {
      // Forward branch
      const len = baseLen * Math.pow(spec.decay, curD);
      const nextX = curX + Math.cos(curA) * len;
      const nextY = curY + Math.sin(curA) * len;

      ctx.strokeStyle = stemColor;
      ctx.lineWidth = Math.max(1, (4.5 - curD * 0.8) * scale);
      ctx.beginPath();
      ctx.moveTo(curX, curY);
      ctx.lineTo(nextX, nextY);
      ctx.stroke();

      curX = nextX;
      curY = nextY;
    } else if (op === 1) {
      // Turn Right
      curA += baseAngle + sway;
    } else if (op === 2) {
      // Turn Left
      curA -= baseAngle - sway;
    } else if (op === 3) {
      // Push stack
      if (sp < 63) {
        sX[sp] = curX; sY[sp] = curY;
        sA[sp] = curA; sD[sp] = curD;
        sp++;
      }
      curD++;
    } else if (op === 4) {
      // Pop stack
      if (sp > 0) {
        sp--;
        curX = sX[sp]; curY = sY[sp];
        curA = sA[sp]; curD = sD[sp];
      }
    } else if (op === 5) {
      // Bud / Blossom
      const budRad = (2.5 + audio.treble * 5 + bassKick * 2) * scale;
      ctx.fillStyle = flowerColor;
      ctx.beginPath();
      ctx.arc(curX, curY, budRad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Room people presence: ethereal spirits resting near blooms
if (room.people && room.people.length > 0) {
  ctx.save();
  for (let i = 0; i < room.people.length; i++) {
    const person = room.people[i];
    const px = ((i + 0.5) / room.people.length) * frame.width;
    const py = groundY - 80 - Math.sin(frame.t * 1.5 + i) * 30;
    const pHue = person.hue ?? (i * 45) % 360;
    ctx.fillStyle = `hsla(${pHue}, 90%, 65%, 0.7)`;
    ctx.shadowColor = `hsla(${pHue}, 90%, 65%, 0.9)`;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(px, py, 4 + audio.treble * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

ctx.restore();