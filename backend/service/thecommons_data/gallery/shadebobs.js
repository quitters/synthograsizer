ctx.save();

const ratios = {
  classic_3_4: { fx: 3, fy: 4, fz: 2 },
  clover_5_6:   { fx: 5, fy: 6, fz: 3 },
  waltz_2_3:    { fx: 2, fy: 3, fz: 1 },
  dense_7_9:    { fx: 7, fy: 9, fz: 4 }
};
const decays = {
  fast_wash: 0.08,
  balanced: 0.035,
  deep_glow: 0.016,
  infinite_plasma: 0.005
};
const palettes = {
  amiga_copper: [
    [255, 60, 20], [255, 140, 30], [255, 220, 60], [255, 90, 40], [180, 20, 10]
  ],
  cyber_neon: [
    [0, 240, 255], [255, 0, 180], [120, 40, 255], [0, 255, 160], [255, 230, 0]
  ],
  solar_flare: [
    [255, 30, 0], [255, 120, 0], [255, 210, 40], [255, 255, 180], [220, 20, 60]
  ],
  deep_aurora: [
    [20, 255, 160], [0, 210, 255], [140, 60, 255], [30, 120, 255], [100, 255, 220]
  ]
};

const harm = ratios[getVar('lissajous_ratio')] ?? ratios.classic_3_4;
const fadeAlpha = decays[getVar('ribbon_decay')] ?? decays.balanced;
const palKey = getVar('color_scheme') ?? 'amiga_copper';
const pal = palettes[palKey] ?? palettes.amiga_copper;
const count = Math.round(getVar('bob_count') ?? 6);
const baseRadius = getVar('bob_size') ?? 45;
const speed = getVar('orbit_speed') ?? 1.0;

const W = frame.width;
const H = frame.height;

// Initialize persistent state & offscreen accumulation canvas
if (!room.state.acc || room.state.w !== W || room.state.h !== H) {
  room.state.acc = new OffscreenCanvas(W, H);
  room.state.accCtx = room.state.acc.getContext('2d');
  room.state.accCtx.fillStyle = '#05040a';
  room.state.accCtx.fillRect(0, 0, W, H);
  room.state.w = W;
  room.state.h = H;
  room.state.lastT = frame.t;
  room.state.sprites = null;
}

// Pre-render glowing bob lookup sprites when palette changes
if (!room.state.sprites || room.state.cachedPal !== palKey) {
  room.state.sprites = [];
  room.state.cachedPal = palKey;
  const spriteSize = 128;
  const half = spriteSize / 2;
  for (let c = 0; c < pal.length; c++) {
    const sc = new OffscreenCanvas(spriteSize, spriteSize);
    const sctx = sc.getContext('2d');
    const col = pal[c];
    const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, `rgba(255, 255, 255, 0.95)`);
    grad.addColorStop(0.25, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.5)`);
    grad.addColorStop(0.65, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.12)`);
    grad.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(half, half, half, 0, Math.PI * 2);
    sctx.fill();
    room.state.sprites.push(sc);
  }
}

const accCtx = room.state.accCtx;

// Controlled decay of accumulated ribbons
accCtx.save();
accCtx.globalCompositeOperation = 'source-over';
accCtx.fillStyle = `rgba(5, 4, 10, ${fadeAlpha})`;
accCtx.fillRect(0, 0, W, H);

// Music & reactive dynamics
const bassBoost = (audio.bass || 0) * 0.6;
const energy = (audio.level || 0) * 0.4;
const beatKick = audio.beat ? 1.35 : 1.0;
const bobR = baseRadius * (1 + bassBoost * 0.5) * beatKick;

// Sub-stepping interpolation for perfectly continuous shadebob trails
const dt = Math.min(frame.dt || 0.016, 0.05);
const tNow = frame.t * speed;
const tPrev = (room.state.lastT || frame.t - dt) * speed;
room.state.lastT = frame.t;

const subSteps = Math.max(6, Math.min(18, Math.round(speed * 10)));
const cx = W * 0.5;
const cy = H * 0.5;
const rx = W * 0.41;
const ry = H * 0.39;

accCtx.globalCompositeOperation = 'lighter';

const sprites = room.state.sprites;
const spriteCount = sprites.length;
const crowdCount = Math.min((room.people || []).length, 8);

for (let step = 1; step <= subSteps; step++) {
  const interp = step / subSteps;
  const t = tPrev + (tNow - tPrev) * interp;

  for (let i = 0; i < count; i++) {
    const bobPhase = (i / count) * Math.PI * 2;
    const pBass = Math.sin(t * 1.5 + bobPhase) * bassBoost * 0.3;

    const px = cx + Math.sin(t * harm.fx + bobPhase) * rx * (1 + pBass * 0.2);
    const py = cy + Math.sin(t * harm.fy + bobPhase * 1.5) * ry * (1 - pBass * 0.2);

    // Slight breathing in z-axis modulates bob scale
    const pz = (Math.sin(t * harm.fz + bobPhase * 0.7) + 1.0) * 0.5;
    const drawSize = bobR * (0.65 + pz * 0.7 + energy * 0.3);

    // Cycle smoothly through pre-baked gradient sprites
    const colorIdx = Math.floor((t * 0.8 + i * 0.9) % spriteCount);
    const spr = sprites[(colorIdx + spriteCount) % spriteCount];

    accCtx.globalAlpha = 0.28 + energy * 0.15;
    accCtx.drawImage(spr, px - drawSize, py - drawSize, drawSize * 2, drawSize * 2);
  }

  // Subtle crowd satellites responding to connected people
  for (let p = 0; p < crowdCount; p++) {
    const person = room.people[p];
    const pHuePhase = ((person.hue || (p * 55)) / 360) * Math.PI * 2;
    const satX = cx + Math.cos(t * harm.fy * 0.5 + pHuePhase) * (rx * 0.75);
    const satY = cy + Math.sin(t * harm.fx * 0.5 + pHuePhase * 1.3) * (ry * 0.75);
    const satSize = bobR * 0.45;
    const spr = sprites[p % spriteCount];
    accCtx.globalAlpha = 0.15 + (audio.treble || 0) * 0.15;
    accCtx.drawImage(spr, satX - satSize, satY - satSize, satSize * 2, satSize * 2);
  }
}
accCtx.restore();

// Blit the accumulated shadebob field to the screen
ctx.drawImage(room.state.acc, 0, 0);

// Subtle scanline overlay for demoscene CRT texture
ctx.save();
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
for (let y = 0; y < H; y += 4) {
  ctx.fillRect(0, y, W, 1.5);
}
ctx.restore();

ctx.restore();