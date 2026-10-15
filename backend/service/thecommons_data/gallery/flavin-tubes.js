ctx.save();
const W = frame.width, H = frame.height;

// Persistent state initialization
room.state.init ??= true;
room.state.curLayout ??= 0;
room.state.layoutTimer ??= 0;
room.state.tubes ??= [];
room.state.ignition ??= [];

// Inputs
const palChoice = getVar('palette_mode') ?? 'flavin_classic';
const geomChoice = getVar('geometry') ?? 'corner_barrier';
const tubePower = getVar('tube_power') ?? 1.2;
const ambientDark = getVar('ambient_darkness') ?? 0.85;
const ballastHum = getVar('ballast_hum') ?? true;
const rebuildRate = getVar('rebuild_rate') ?? 0.8;

// Palette sets (Dan Flavin curated industrial colors)
const palettes = {
  flavin_classic: [
    { r: 255, g: 35, b: 120, name: 'pink' },
    { r: 255, g: 200, b: 20, name: 'yellow' },
    { r: 195, g: 235, b: 255, name: 'daylight' },
    { r: 50, g: 230, b: 255, name: 'blue' }
  ],
  greens_blues: [
    { r: 50, g: 70, b: 255, name: 'ultraviolet' },
    { r: 35, g: 255, b: 110, name: 'green' },
    { r: 0, g: 235, b: 245, name: 'cyan' },
    { r: 215, g: 255, b: 245, name: 'cool_white' }
  ],
  monochrome_warm: [
    { r: 255, g: 30, b: 20, name: 'red' },
    { r: 255, g: 130, b: 10, name: 'amber' },
    { r: 255, g: 215, b: 120, name: 'gold' },
    { r: 255, g: 245, b: 230, name: 'warm_white' }
  ],
  synth_neon: [
    { r: 255, g: 20, b: 190, name: 'magenta' },
    { r: 180, g: 255, b: 0, name: 'acid_green' },
    { r: 0, g: 180, b: 255, name: 'electric_blue' },
    { r: 255, g: 240, b: 245, name: 'soft_white' }
  ]
};
const activePalette = palettes[palChoice] ?? palettes.flavin_classic;

// Layout generator
const cornerX = W * 0.5;
const ceilingY = H * 0.08;
const floorY = H * 0.88;

function makeLayout(type, idx) {
  const tubes = [];
  if (type === 'corner_barrier') {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const y = ceilingY + (floorY - ceilingY) * (0.2 + (i / (count - 1)) * 0.6);
      const span = W * (0.22 + (i % 2) * 0.08);
      tubes.push({
        x1: cornerX - span,
        y1: y - span * 0.12,
        x2: cornerX + span,
        y2: y + span * 0.12,
        colIdx: i % activePalette.length,
        dia: Math.max(8, W * 0.012),
        facing: (i % 2 === 0) ? 'corner' : 'room'
      });
    }
  } else if (type === 'monument_v') {
    // Central Tatlin-esque vertical spire
    const count = 6;
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) * 0.5) * (W * 0.045);
      const hRatio = 0.8 - Math.abs(i - (count - 1) * 0.5) * 0.18;
      const len = (floorY - ceilingY) * hRatio;
      const y2 = floorY - (floorY - ceilingY) * 0.05;
      const y1 = y2 - len;
      tubes.push({
        x1: cornerX + off,
        y1: y1,
        x2: cornerX + off,
        y2: y2,
        colIdx: (i + idx) % activePalette.length,
        dia: Math.max(7, W * 0.011),
        facing: 'room'
      });
    }
  } else if (type === 'grid_horizon') {
    // Cross horizontals and vertical bounds
    const leftWallX = cornerX - W * 0.28;
    const rightWallX = cornerX + W * 0.28;
    tubes.push({
      x1: cornerX - W * 0.38, y1: ceilingY + (floorY - ceilingY) * 0.4,
      x2: cornerX, y2: ceilingY + (floorY - ceilingY) * 0.48,
      colIdx: 0, dia: W * 0.012, facing: 'room'
    });
    tubes.push({
      x1: cornerX, y1: ceilingY + (floorY - ceilingY) * 0.48,
      x2: cornerX + W * 0.38, y2: ceilingY + (floorY - ceilingY) * 0.4,
      colIdx: 1, dia: W * 0.012, facing: 'room'
    });
    tubes.push({
      x1: leftWallX, y1: ceilingY + (floorY - ceilingY) * 0.15,
      x2: leftWallX, y2: floorY - (floorY - ceilingY) * 0.12,
      colIdx: 2, dia: W * 0.011, facing: 'room'
    });
    tubes.push({
      x1: rightWallX, y1: ceilingY + (floorY - ceilingY) * 0.15,
      x2: rightWallX, y2: floorY - (floorY - ceilingY) * 0.12,
      colIdx: 3, dia: W * 0.011, facing: 'room'
    });
    tubes.push({
      x1: cornerX, y1: ceilingY + (floorY - ceilingY) * 0.2,
      x2: cornerX, y2: floorY - (floorY - ceilingY) * 0.1,
      colIdx: 0, dia: W * 0.014, facing: 'corner'
    });
  } else {
    // Minimal bold diagonals crossing walls
    tubes.push({
      x1: cornerX - W * 0.35, y1: floorY - (floorY - ceilingY) * 0.15,
      x2: cornerX - W * 0.05, y2: ceilingY + (floorY - ceilingY) * 0.25,
      colIdx: 0, dia: W * 0.013, facing: 'room'
    });
    tubes.push({
      x1: cornerX + W * 0.05, y1: ceilingY + (floorY - ceilingY) * 0.25,
      x2: cornerX + W * 0.35, y2: floorY - (floorY - ceilingY) * 0.15,
      colIdx: 1, dia: W * 0.013, facing: 'room'
    });
    tubes.push({
      x1: cornerX - W * 0.15, y1: floorY - (floorY - ceilingY) * 0.05,
      x2: cornerX + W * 0.15, y2: floorY - (floorY - ceilingY) * 0.05,
      colIdx: 2, dia: W * 0.012, facing: 'corner'
    });
  }
  return tubes;
}

// Update rebuild lifecycle
room.state.layoutTimer += frame.dt * rebuildRate;
const cycleDuration = 10.0; // seconds per complete arrangement cycle
if (room.state.tubes.length === 0 || room.state.layoutTimer >= cycleDuration) {
  room.state.layoutTimer = 0;
  room.state.curLayout = (room.state.curLayout + 1) % 4;
  room.state.tubes = makeLayout(geomChoice, room.state.curLayout);
  room.state.ignition = room.state.tubes.map((_, i) => ({
    startTime: i * 0.9,
    flickerSeed: Math.random() * 100
  }));
}

// Background architecture (Gallery room with receding corner)
const wallBase = 12 * (1 - ambientDark);
ctx.fillStyle = `rgb(${wallBase}, ${wallBase + 1}, ${wallBase + 2})`;
ctx.fillRect(0, 0, W, H);

// Draw architectural planes (Left wall, Right wall, Floor, Ceiling)
// Ceiling
ctx.fillStyle = `rgba(5, 5, 7, 0.95)`;
ctx.beginPath();
ctx.moveTo(0, 0);
ctx.lineTo(W, 0);
ctx.lineTo(cornerX, ceilingY);
ctx.closePath();
ctx.fill();

// Floor plane
ctx.fillStyle = `rgba(10, 10, 12, 0.92)`;
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(W, H);
ctx.lineTo(cornerX, floorY);
ctx.closePath();
ctx.fill();

// Wall vertical divide guideline (corner crease)
ctx.strokeStyle = `rgba(0, 0, 0, 0.6)`;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(cornerX, ceilingY);
ctx.lineTo(cornerX, floorY);
ctx.stroke();

// Floor crease line
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(cornerX, floorY);
ctx.lineTo(W, H);
ctx.stroke();

// Compute dynamic light levels for each tube
const tubeStates = room.state.tubes.map((tube, i) => {
  const ign = room.state.ignition[i] || { startTime: 0, flickerSeed: 0 };
  const timeSince = room.state.layoutTimer - ign.startTime;
  let brightness = 0;
  let flicker = 1;

  if (timeSince > 0) {
    if (timeSince < 0.6) {
      // Fluorescent inductive pre-warm / stutter click
      const s = Math.sin((timeSince * 40) + ign.flickerSeed);
      brightness = (s > 0.3) ? 0.8 : (s > -0.4 ? 0.05 : 0.4);
      if (audio.beat) brightness = 1.0;
    } else {
      // Warmed up and steady
      brightness = Math.min(1.0, 0.7 + (timeSince - 0.6) * 0.8);
      if (ballastHum) {
        // 60Hz/120Hz micro-fluctuation + music reaction
        const buzz = Math.sin(frame.t * 75 + i * 2) * 0.035;
        const audioReact = (audio.bass * 0.18 + audio.level * 0.1);
        flicker = 1.0 + buzz + audioReact;
      }
    }
  }
  const power = brightness * flicker * tubePower;
  const col = activePalette[tube.colIdx % activePalette.length];
  return { tube, power, col, timeSince };
});

// PASS 1: Volumetric and plaster wash (Screen/Lighter blend onto matte surfaces)
ctx.save();
ctx.globalCompositeOperation = 'screen';

tubeStates.forEach(({ tube, power, col }) => {
  if (power <= 0.01) return;
  const mx = (tube.x1 + tube.x2) * 0.5;
  const my = (tube.y1 + tube.y2) * 0.5;
  const len = Math.hypot(tube.x2 - tube.x1, tube.y2 - tube.y1);
  const radius = Math.max(len * 1.4, W * 0.38);

  // Wall wash gradient
  const wash = ctx.createRadialGradient(mx, my, tube.dia * 0.5, mx, my, radius);
  const intensity = Math.min(0.75, power * 0.42);
  wash.addColorStop(0.0, `rgba(${col.r}, ${col.g}, ${col.b}, ${intensity})`);
  wash.addColorStop(0.3, `rgba(${col.r}, ${col.g}, ${col.b}, ${intensity * 0.45})`);
  wash.addColorStop(0.7, `rgba(${col.r * 0.6}, ${col.g * 0.6}, ${col.b * 0.6}, ${intensity * 0.12})`);
  wash.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // Special Dan Flavin Corner Flood: if tube spans or faces corner, flood deep behind
  if (tube.facing === 'corner') {
    const cWash = ctx.createRadialGradient(cornerX, my, 2, cornerX, my, W * 0.3);
    cWash.addColorStop(0.0, `rgba(${col.r}, ${col.g}, ${col.b}, ${intensity * 0.9})`);
    cWash.addColorStop(0.5, `rgba(${col.r}, ${col.g}, ${col.b}, ${intensity * 0.3})`);
    cWash.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cWash;
    ctx.fillRect(cornerX - W * 0.3, ceilingY, W * 0.6, floorY - ceilingY);
  }
});
ctx.restore();

// PASS 2: Floor specular reflection (Polished concrete / gallery varnish)
ctx.save();
ctx.globalCompositeOperation = 'lighter';
tubeStates.forEach(({ tube, power, col }) => {
  if (power <= 0.02) return;
  const mx = (tube.x1 + tube.x2) * 0.5;
  const distToFloor = floorY - ((tube.y1 + tube.y2) * 0.5);
  const reflY = floorY + distToFloor * 0.35;
  if (reflY > H) return;

  const reflGrad = ctx.createRadialGradient(mx, reflY, 4, mx, reflY, W * 0.22);
  const rAlpha = power * 0.18;
  reflGrad.addColorStop(0.0, `rgba(${col.r}, ${col.g}, ${col.b}, ${rAlpha})`);
  reflGrad.addColorStop(0.5, `rgba(${col.r}, ${col.g}, ${col.b}, ${rAlpha * 0.25})`);
  reflGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = reflGrad;
  ctx.fillRect(0, floorY, W, H - floorY);
});
ctx.restore();

// PASS 3: Render physical fixtures and intense fluorescent glow
tubeStates.forEach(({ tube, power, col, timeSince }) => {
  const dx = tube.x2 - tube.x1;
  const dy = tube.y2 - tube.y1;
  const angle = Math.atan2(dy, dx);
  const len = Math.hypot(dx, dy);
  const mx = (tube.x1 + tube.x2) * 0.5;
  const my = (tube.y1 + tube.y2) * 0.5;

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);

  const halfL = len * 0.5;
  const halfD = tube.dia * 0.5;

  // Behind-tube metal channel / ballast housing (Flavin white enameled steel fixture)
  ctx.fillStyle = '#141416';
  ctx.fillRect(-halfL - 8, -halfD - 4, len + 16, tube.dia + 8);
  ctx.fillStyle = '#222226';
  ctx.fillRect(-halfL - 6, -halfD - 2, len + 12, tube.dia + 4);

  // If tube is off or cold
  if (power <= 0.05) {
    // Glass tube in off state: milky dull grey-white with dark sockets
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(-halfL, -halfD, len, tube.dia);
    // Bi-pin end caps
    ctx.fillStyle = '#111';
    ctx.fillRect(-halfL - 4, -halfD - 1, 4, tube.dia + 2);
    ctx.fillRect(halfL, -halfD - 1, 4, tube.dia + 2);
    ctx.restore();
    return;
  }

  // Outer soft halo
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const haloGrad = ctx.createLinearGradient(0, -halfD * 6, 0, halfD * 6);
  const haloA = Math.min(0.9, power * 0.7);
  haloGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  haloGrad.addColorStop(0.3, `rgba(${col.r}, ${col.g}, ${col.b}, ${haloA * 0.5})`);
  haloGrad.addColorStop(0.5, `rgba(${col.r}, ${col.g}, ${col.b}, ${haloA})`);
  haloGrad.addColorStop(0.7, `rgba(${col.r}, ${col.g}, ${col.b}, ${haloA * 0.5})`);
  haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = haloGrad;
  ctx.fillRect(-halfL - 10, -halfD * 6, len + 20, tube.dia * 6);
  ctx.restore();

  // Chromatic aura immediately hugging the glass
  ctx.fillStyle = `rgb(${col.r}, ${col.g}, ${col.b})`;
  ctx.beginPath();
  ctx.roundRect(-halfL, -halfD - 2, len, tube.dia + 4, halfD + 2);
  ctx.fill();

  // Blinding white-hot phosphor core (hallmark of live fluorescent tube)
  const coreGrad = ctx.createLinearGradient(0, -halfD, 0, halfD);
  coreGrad.addColorStop(0.0, `rgba(255, 255, 255, 0.7)`);
  coreGrad.addColorStop(0.2, `rgba(255, 255, 255, 1.0)`);
  coreGrad.addColorStop(0.5, `rgba(255, 255, 255, 1.0)`);
  coreGrad.addColorStop(0.8, `rgba(255, 255, 255, 1.0)`);
  coreGrad.addColorStop(1.0, `rgba(255, 255, 255, 0.7)`);
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.roundRect(-halfL + 2, -halfD * 0.65, len - 4, tube.dia * 0.65, halfD * 0.35);
  ctx.fill();

  // Bi-pin socket caps (black metal / nickel ends)
  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(-halfL - 5, -halfD * 0.8, 5, tube.dia * 0.8);
  ctx.fillRect(halfL, -halfD * 0.8, 5, tube.dia * 0.8);

  ctx.restore();
});

// Audience presence: subtle reflective spectator floor markers
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const pCount = Math.min(room.people.length, 24);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const px = W * (0.15 + 0.7 * (i / Math.max(1, pCount - 1)));
    const py = floorY + (H - floorY) * 0.65 + Math.sin(frame.t * 1.5 + i) * 8;
    ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, 0.12)`;
    ctx.beginPath();
    ctx.ellipse(px, py, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

ctx.restore();