ctx.save();

const form = getVar('crystal_form') ?? 'dendrite';
const pal = getVar('palette') ?? 'ice_and_aurora';
const scaleMod = getVar('crystal_scale') ?? 1.0;
const driftSpeed = getVar('drift_speed') ?? 0.8;
const windSway = getVar('wind_sway') ?? 1.0;

const W = frame.width;
const H = frame.height;
const DT = Math.min(frame.dt, 0.05);
const BASS = audio.bass || 0;
const MID = audio.mid || 0;
const TREBLE = audio.treble || 0;

// Palettes mapping (base hue offset, secondary, bg top, bg bottom)
const PALETTES = {
  ice_and_aurora: { hBase: 185, hSpan: 50, top: '#030814', bot: '#021824' },
  deep_frost:     { hBase: 210, hSpan: 30, top: '#02040a', bot: '#081226' },
  ultraviolet:    { hBase: 275, hSpan: 60, top: '#080214', bot: '#1b082e' },
  golden_hour:    { hBase: 35,  hSpan: 45, top: '#100608', bot: '#25120c' }
};
const curPal = PALETTES[pal] ?? PALETTES.ice_and_aurora;

// Initialise fixed-size demoscene buffers in room.state
const POOL_SIZE = 48;
const SPRITE_SIZE = 160;

if (!room.state.init) {
  room.state.init = true;
  room.state.poolIndex = 0;
  room.state.growing = {
    stage: 0,
    hue: 195,
    seed: 42,
    branches: 4,
    spread: 0.6,
    plates: false,
    author: ''
  };
  
  room.state.flakes = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const canvas = new OffscreenCanvas(SPRITE_SIZE, SPRITE_SIZE);
    room.state.flakes.push({
      canvas,
      x: Math.random() * W,
      y: Math.random() * H,
      vx: 0,
      vy: 20 + Math.random() * 40,
      size: 24 + Math.random() * 36,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.8,
      swayPhase: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.6,
      active: true
    });
  }
}

// Helper to bake a snowflake into an offscreen canvas
function bakeFlake(c2d, seed, formType, hue) {
  c2d.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const cx = SPRITE_SIZE / 2;
  const cy = SPRITE_SIZE / 2;
  const maxR = SPRITE_SIZE * 0.44;
  
  // Pseudorandom generator using seed
  let s = (seed * 9301 + 49297) % 233280;
  function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }

  const nodeCount = formType === 'needle' ? 2 : (formType === 'fern' ? 6 : 4);
  const branchAngle = formType === 'stellar' ? Math.PI / 4 : Math.PI / 3;
  const hasPlates = formType === 'stellar';

  c2d.save();
  c2d.translate(cx, cy);
  c2d.lineCap = 'round';
  c2d.lineJoin = 'round';

  // Draw 6-fold dihedral symmetry (12 reflections)
  for (let rot = 0; rot < 6; rot++) {
    c2d.save();
    c2d.rotate((rot * Math.PI) / 3);

    for (let side = -1; side <= 1; side += 2) {
      c2d.save();
      c2d.scale(1, side);

      // Main spine
      c2d.strokeStyle = `hsla(${hue}, 85%, 90%, 0.85)`;
      c2d.lineWidth = 1.8;
      c2d.beginPath();
      c2d.moveTo(0, 0);
      c2d.lineTo(maxR, 0);
      c2d.stroke();

      // Side branches
      for (let n = 1; n <= nodeCount; n++) {
        const px = (n / (nodeCount + 0.8)) * maxR;
        const bLen = (1 - px / (maxR * 1.1)) * (maxR * 0.48) * (0.8 + rnd() * 0.4);
        const bx = px + Math.cos(branchAngle) * bLen;
        const by = Math.sin(branchAngle) * bLen;

        c2d.strokeStyle = `hsla(${hue + n * 4}, 90%, 82%, 0.75)`;
        c2d.lineWidth = Math.max(1, 1.8 - n * 0.2);
        c2d.beginPath();
        c2d.moveTo(px, 0);
        c2d.lineTo(bx, by);
        c2d.stroke();

        // Secondary sub-branch
        if (formType === 'fern' || (formType === 'dendrite' && n > 1)) {
          const sStart = 0.4;
          const subX1 = px + Math.cos(branchAngle) * (bLen * sStart);
          const subY1 = Math.sin(branchAngle) * (bLen * sStart);
          const subLen = bLen * 0.45;
          c2d.beginPath();
          c2d.moveTo(subX1, subY1);
          c2d.lineTo(subX1 + subLen, subY1);
          c2d.stroke();
        }

        // Stellar facets
        if (hasPlates && n === 2) {
          c2d.fillStyle = `hsla(${hue}, 95%, 92%, 0.35)`;
          c2d.beginPath();
          c2d.moveTo(px, 0);
          c2d.lineTo(bx * 0.8, by * 0.8);
          c2d.lineTo(px + bLen * 0.4, 0);
          c2d.closePath();
          c2d.fill();
        }
      }
      c2d.restore();
    }

    // Hexagonal central seed
    c2d.fillStyle = `hsla(${hue}, 80%, 95%, 0.4)`;
    c2d.beginPath();
    c2d.moveTo(0, 0);
    c2d.lineTo(maxR * 0.12, 0);
    c2d.lineTo(Math.cos(Math.PI / 6) * maxR * 0.12, Math.sin(Math.PI / 6) * maxR * 0.12);
    c2d.closePath();
    c2d.fill();

    c2d.restore();
  }
  c2d.restore();
}

// Handle events: someone triggers a new flake
for (const e of room.events) {
  if (e.name === 'crystallise') {
    const person = room.people ? room.people.find(p => p.id === e.participantId) : null;
    const userHue = person ? person.hue : Math.floor(Math.random() * 360);
    // Force current flake to finish and release, then seed new flake
    room.state.growing.stage = 1.0;
    room.state.growing.hue = userHue;
  }
}

// Background fill with demoscene vignette
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, curPal.top);
bgGrad.addColorStop(1, curPal.bot);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Crystallisation Chamber in the upper center
const chamberX = W * 0.5;
const chamberY = H * 0.32;
const grow = room.state.growing;

// Advance crystallisation stage with music reaction
const growSpeed = (0.28 + BASS * 0.45) * DT;
grow.stage += growSpeed;

if (grow.stage >= 1.0) {
  // Flake finished crystallising: bake into offscreen canvas and release as drifting flake
  const flk = room.state.flakes[room.state.poolIndex];
  bakeFlake(flk.canvas.getContext('2d'), grow.seed, form, grow.hue);
  flk.x = chamberX + (Math.random() - 0.5) * 40;
  flk.y = chamberY;
  flk.vx = (Math.random() - 0.5) * 30;
  flk.vy = 24 + Math.random() * 32;
  flk.size = (36 + Math.random() * 40) * scaleMod;
  flk.rot = 0;
  flk.vrot = (Math.random() - 0.5) * 0.6;
  flk.alpha = 0.85;
  
  room.state.poolIndex = (room.state.poolIndex + 1) % POOL_SIZE;

  // Start next flake seeded from room dynamics
  grow.stage = 0;
  grow.seed = Math.floor(frame.t * 1000) % 99991;
  const randomPerson = room.people && room.people.length > 0 
    ? room.people[Math.floor(Math.random() * room.people.length)] 
    : null;
  grow.hue = randomPerson ? randomPerson.hue : (curPal.hBase + Math.random() * curPal.hSpan);
}

// 1. Draw drifting flakes
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const windTime = frame.t * 0.8;

for (let i = 0; i < POOL_SIZE; i++) {
  const f = room.state.flakes[i];
  // Lateral sway influenced by wind_sway & audio mid
  f.swayPhase += DT * (1.2 + windSway * 0.8);
  const sway = Math.sin(f.swayPhase + f.y * 0.005) * (18 * windSway + MID * 25);
  f.x += (f.vx + sway) * DT;
  f.y += f.vy * driftSpeed * (1 + BASS * 0.5) * DT;
  f.rot += f.vrot * DT;

  // Wrap boundaries
  if (f.y > H + f.size) {
    f.y = -f.size;
    f.x = Math.random() * W;
  }
  if (f.x < -f.size) f.x = W + f.size;
  if (f.x > W + f.size) f.x = -f.size;

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  ctx.globalAlpha = f.alpha * (0.6 + TREBLE * 0.4);
  const half = f.size / 2;
  ctx.drawImage(f.canvas, -half, -half, f.size, f.size);
  ctx.restore();
}
ctx.restore();

// 2. Draw Active Flake Growing in Chamber (High detail vector rendering)
ctx.save();
ctx.translate(chamberX, chamberY);

// Ambient cold aura / backlight
const auraRad = (80 + BASS * 50) * scaleMod;
const aura = ctx.createRadialGradient(0, 0, 10, 0, 0, auraRad * 2.2);
aura.addColorStop(0, `hsla(${grow.hue}, 90%, 75%, ${0.28 + BASS * 0.25})`);
aura.addColorStop(0.5, `hsla(${grow.hue + 20}, 80%, 50%, 0.10)`);
aura.addColorStop(1, 'transparent');
ctx.fillStyle = aura;
ctx.beginPath();
ctx.arc(0, 0, auraRad * 2.2, 0, Math.PI * 2);
ctx.fill();

// Draw live crystallising structure with 6-fold symmetry
const currentR = (110 * scaleMod) * Math.min(1.0, grow.stage);
const activeSegments = form === 'needle' ? 2 : (form === 'fern' ? 6 : 4);
const activeBranchAngle = form === 'stellar' ? Math.PI / 4 : Math.PI / 3;

ctx.lineCap = 'round';
ctx.lineJoin = 'round';

for (let rot = 0; rot < 6; rot++) {
  ctx.save();
  ctx.rotate((rot * Math.PI) / 3);

  for (let side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.scale(1, side);

    // Growing primary spine
    ctx.strokeStyle = `hsla(${grow.hue}, 95%, 92%, 0.95)`;
    ctx.shadowColor = `hsla(${grow.hue}, 100%, 70%, 0.8)`;
    ctx.shadowBlur = 10 + TREBLE * 15;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(currentR, 0);
    ctx.stroke();

    // Growing side needles/branches
    for (let n = 1; n <= activeSegments; n++) {
      const frac = n / (activeSegments + 0.8);
      const px = frac * (110 * scaleMod);
      if (currentR > px) {
        const localGrowth = Math.min(1.0, (currentR - px) / 25);
        const fullLen = (1 - frac) * (52 * scaleMod);
        const bLen = fullLen * localGrowth;
        const bx = px + Math.cos(activeBranchAngle) * bLen;
        const by = Math.sin(activeBranchAngle) * bLen;

        ctx.strokeStyle = `hsla(${grow.hue + n * 6}, 90%, 85%, 0.9)`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(bx, by);
        ctx.stroke();

        // Secondary branching
        if ((form === 'fern' || form === 'dendrite') && localGrowth > 0.6) {
          const subFrac = (localGrowth - 0.6) / 0.4;
          const subX = px + Math.cos(activeBranchAngle) * (bLen * 0.45);
          const subY = Math.sin(activeBranchAngle) * (bLen * 0.45);
          const subLen = bLen * 0.4 * subFrac;
          ctx.beginPath();
          ctx.moveTo(subX, subY);
          ctx.lineTo(subX + subLen, subY);
          ctx.stroke();
        }

        // Diamond faceted plate
        if (form === 'stellar' && n === 2 && localGrowth > 0.5) {
          ctx.fillStyle = `hsla(${grow.hue}, 90%, 94%, ${0.35 * localGrowth})`;
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(bx * 0.85, by * 0.85);
          ctx.lineTo(px + bLen * 0.45, 0);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // Faceted hexagonal core
  ctx.fillStyle = `hsla(${grow.hue}, 100%, 95%, 0.6)`;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(14 * scaleMod, 0);
  ctx.lineTo(Math.cos(Math.PI / 6) * 14 * scaleMod, Math.sin(Math.PI / 6) * 14 * scaleMod);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// Outer boundary crystallisation ring shimmer
ctx.strokeStyle = `hsla(${grow.hue}, 80%, 90%, ${0.15 + TREBLE * 0.3})`;
ctx.lineWidth = 1;
ctx.beginPath();
ctx.arc(0, 0, (112 * scaleMod) * Math.min(1.0, grow.stage), 0, Math.PI * 2);
ctx.stroke();

ctx.restore();
ctx.restore();