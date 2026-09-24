const count = Math.max(3, Math.min(6, Math.round(getVar('layer_count') ?? 4)));
const speed = getVar('drift_speed') ?? 0.8;
const tension = getVar('contrast_tension') ?? 0.5;
const themeKey = getVar('palette_theme') ?? 'amber_ochre';
const layoutKey = getVar('frame_weight') ?? 'bottom_heavy';

const PALETTES = {
  amber_ochre: [
    [38, 82, 54],   // Warm ochre
    [28, 92, 46],   // Cadmium orange
    [16, 78, 42],   // Burnt sienna
    [45, 96, 62],   // Sunlit saffron
    [12, 60, 28],   // Deep terra
    [52, 70, 72]    // Pale maize
  ],
  cyan_cadmium: [
    [186, 68, 38],  // Deep teal
    [14, 88, 52],   // Pure vermilion
    [174, 52, 58],  // Verdigris
    [24, 94, 60],   // Tangerine
    [198, 76, 24],  // Abyss slate
    [6, 80, 42]     // Brick carmine
  ],
  mineral_slate: [
    [212, 28, 44],  // Blue-grey basalt
    [32, 34, 58],   // Sandstone
    [224, 40, 28],  // Midnight shale
    [42, 48, 70],   // Limestone
    [200, 18, 52],  // Ash cyan
    [28, 22, 36]    // Raw umber
  ],
  violet_citron: [
    [274, 58, 36],  // Royal prune
    [68, 88, 52],   // Electric citron
    [288, 44, 24],  // Aubergine
    [56, 76, 64],   // Acid chartreuse
    [260, 62, 48],  // Iris violet
    [78, 92, 44]    // Golden olive
  ]
};

const palette = PALETTES[themeKey] ?? PALETTES.amber_ochre;

// Pre-allocated runtime state
room.state.phase ??= 0;
room.state.bassEnvelope ??= 0;
room.state.beatPulse ??= 0;

const dt = frame.dt || 0.016;
room.state.phase += dt * speed * 0.45;
room.state.bassEnvelope += ((audio.bass || 0) - room.state.bassEnvelope) * Math.min(1, dt * 14);
room.state.beatPulse = audio.beat ? 1.0 : Math.max(0, room.state.beatPulse - dt * 2.8);

// People presence subtly bias hues
let peopleHueShift = 0;
if (room.people && room.people.length > 0) {
  let sum = 0;
  for (let i = 0; i < room.people.length; i++) {
    sum += (room.people[i].hue || 0);
  }
  peopleHueShift = (sum / room.people.length) * 0.12;
}

ctx.save();

// Outer wall: pure architectural matting
ctx.fillStyle = '#0e0e11';
ctx.fillRect(0, 0, frame.width, frame.height);

const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const minDim = Math.min(frame.width, frame.height);
const baseSize = minDim * 0.82;

// Bottom weighting configurations matching Albers' structural balance
const layoutOffsets = {
  balanced:     0.00,
  bottom_heavy: 0.13,
  floating:    -0.08
};
const dropRatio = layoutOffsets[layoutKey] ?? 0.13;

const phase = room.state.phase;
const bass = room.state.bassEnvelope;
const pulse = room.state.beatPulse;

for (let i = 0; i < count; i++) {
  const tNorm = i / (count - 1 || 1);
  // Size progression: quadratic step to echo classic proportions
  const sizeRatio = 1.0 - tNorm * 0.72;
  const size = baseSize * sizeRatio;
  
  // Asymmetric downward drift (Albers hallmark: bottom border compresses faster)
  const yShift = (baseSize - size) * dropRatio * (1 + 0.08 * Math.sin(phase + i * 0.5));
  const left = cx - size * 0.5;
  const top = (cy - size * 0.5) + yShift;

  // Color interaction: slowly drifting hue & perceptual simultaneous contrast
  const baseHsl = palette[i % palette.length];
  const osc = Math.sin(phase + i * 1.35);
  const osc2 = Math.cos(phase * 0.7 - i * 0.9);
  
  // Tension pushes inner & outer values away from each other to stimulate eye vibrato
  const contrastDir = (i % 2 === 0) ? 1 : -1;
  const hueDrift = osc * (6 + tension * 12) + peopleHueShift;
  const h = (baseHsl[0] + hueDrift + (i === count - 1 ? pulse * 14 : 0) + 360) % 360;
  const s = Math.max(12, Math.min(100, baseHsl[1] + osc2 * 6 + bass * 12 * tension));
  const l = Math.max(10, Math.min(90, baseHsl[2] + contrastDir * (tension * 8) + (pulse * 4 * (1 - tNorm))));

  ctx.fillStyle = `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
  ctx.fillRect(left, top, size, size);

  // Micro-edge fluting: simulated Mach band illusion on the inner junction
  if (tension > 0.05 && i < count - 1) {
    ctx.strokeStyle = `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${Math.max(0, l - 10).toFixed(1)}%, ${(tension * 0.22).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left, top, size, size);
  }
}

// Minimalist peripheral witness: subtle registration ticks for connected room participants
if (room.people && room.people.length > 0) {
  const tickCount = Math.min(room.people.length, 32);
  const tickY = frame.height - 18;
  const span = Math.min(baseSize, 400);
  const startX = cx - span * 0.5;
  const stepX = span / (tickCount + 1);
  
  for (let p = 0; p < tickCount; p++) {
    const person = room.people[p];
    ctx.fillStyle = `hsla(${person.hue || 40}, 70%, 65%, 0.45)`;
    ctx.fillRect(startX + (p + 1) * stepX - 1.5, tickY, 3, 4);
  }
}

ctx.restore();