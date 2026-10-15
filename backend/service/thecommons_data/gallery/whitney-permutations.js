ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);
const maxRadius = minDim * 0.44;

// Read variables with strict fallbacks
const nDots = Math.floor(getVar('dot_count') ?? 360);
const geom = getVar('base_geometry') ?? 'spiral_bloom';
const palChoice = getVar('palette') ?? 'whitney_spectrum';
const trailMode = getVar('trail_persistence') ?? 'silky_trails';
const folds = Math.max(1, Math.floor(getVar('symmetry_folds') ?? 4));
const baseSpeed = getVar('speed') ?? 0.5;
const glowMult = getVar('glow_intensity') ?? 1.5;
const mirror = getVar('mirroring') ?? true;

// State management for time accumulator and buffers
room.state.harmonicPhase ??= 0;
room.state.beatPulse ??= 0;

// Integrate phase smoothly; speed modulates with bass
const speedMod = baseSpeed * (1 + (audio?.bass ?? 0) * 0.7);
room.state.harmonicPhase += frame.dt * speedMod * 0.22;
if (audio?.beat) room.state.beatPulse = 1.0;
room.state.beatPulse = Math.max(0, room.state.beatPulse - frame.dt * 2.8);

const phase = room.state.harmonicPhase;
const beat = room.state.beatPulse;
const bass = audio?.bass ?? 0;
const mid = audio?.mid ?? 0;
const treble = audio?.treble ?? 0;

// Trail backdrop handling
const clearAlphas = { crisp: 0.95, silky_trails: 0.16, deep_echo: 0.07 };
const bgAlpha = clearAlphas[trailMode] ?? 0.16;

ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = `rgba(3, 4, 8, ${bgAlpha})`;
ctx.fillRect(0, 0, W, H);

// Color palette generator
const getColor = (normI, total) => {
  if (palChoice === 'emerald_crt') {
    const g = 180 + Math.floor(75 * Math.sin(normI * 6.28 + phase));
    return `rgb(20, ${g}, ${Math.floor(g * 0.5)})`;
  } else if (palChoice === 'solar_ultraviolet') {
    const h = 260 + normI * 110 + bass * 30;
    const l = 48 + Math.sin(normI * 12.56 + phase * 2) * 16;
    return `hsl(${h % 360}, 92%, ${l}%)`;
  } else if (palChoice === 'cyan_amber') {
    const h = (normI < 0.5) ? (175 + normI * 40) : (35 + normI * 30);
    return `hsl(${h % 360}, 95%, ${55 + treble * 25}%)`;
  }
  // whitney_spectrum default: rich chromatic loop across the harmonics
  const hue = (normI * 360 * 1.5 + phase * 45 + bass * 40) % 360;
  return `hsl(${hue}, 92%, ${56 + beat * 18}%)`;
};

// People participation: inject room participant accents into harmonic rings
const peopleList = Array.isArray(room.people) ? room.people : [];
const nPeople = peopleList.length;

ctx.save();
ctx.translate(cx, cy);
ctx.globalCompositeOperation = 'lighter';

const angleStep = (Math.PI * 2) / folds;
const radiusScale = maxRadius * (1 + bass * 0.14 + beat * 0.08);
const dotRadiusBase = Math.max(1.2, (minDim / 900) * 1.8 * glowMult);

// Draw harmonic orbits
for (let i = 1; i <= nDots; i++) {
  const u = i / nDots;
  // Whitney's core harmonic equation: theta advances as an integer ratio of the fundamental
  const harmonicRatio = i;
  let theta = harmonicRatio * phase;
  let r = 0;

  if (geom === 'concentric_orbits') {
    r = radiusScale * Math.pow(u, 0.85);
    theta += Math.sin(phase * 0.5 + u * Math.PI * 4) * 0.3;
  } else if (geom === 'rose_curves') {
    const k = folds + 1;
    r = radiusScale * Math.abs(Math.cos(k * theta * 0.25)) * (0.2 + 0.8 * u);
  } else if (geom === 'lissajous_lattice') {
    const lx = Math.sin(theta * 1.0 + phase) * radiusScale * u;
    const ly = Math.cos(theta * (folds / 2) + phase * 1.3) * radiusScale * u;
    r = Math.hypot(lx, ly);
    theta = Math.atan2(ly, lx);
  } else {
    // spiral_bloom
    r = radiusScale * u;
    theta += u * Math.PI * 2;
  }

  // Audio modulation on higher harmonic shells
  r += Math.sin(i * 0.35 + phase * 3) * (treble * 14);

  // Check if this harmonic index anchors to a connected participant
  let dotCol = getColor(u, nDots);
  let pRadius = dotRadiusBase * (0.8 + 0.6 * Math.sin(u * Math.PI * 6 + phase * 2));
  if (nPeople > 0 && (i % Math.max(1, Math.floor(nDots / nPeople)) === 0)) {
    const person = peopleList[(i / Math.floor(nDots / nPeople)) % nPeople];
    if (person && typeof person.hue === 'number') {
      dotCol = `hsl(${person.hue}, 100%, 70%)`;
      pRadius *= 1.6;
    }
  }

  // Render across symmetry spokes
  for (let f = 0; f < folds; f++) {
    const foldAngle = f * angleStep;
    
    // Main point
    const ang1 = theta + foldAngle;
    const x1 = Math.cos(ang1) * r;
    const y1 = Math.sin(ang1) * r;

    ctx.fillStyle = dotCol;
    ctx.beginPath();
    ctx.arc(x1, y1, pRadius, 0, 6.28318);
    ctx.fill();

    // Whitney optical mirroring
    if (mirror) {
      const ang2 = -theta + foldAngle;
      const x2 = Math.cos(ang2) * r;
      const y2 = Math.sin(ang2) * r;

      ctx.beginPath();
      ctx.arc(x2, y2, pRadius * 0.85, 0, 6.28318);
      ctx.fill();
    }
  }
}

// Delicate focal central harmonic core
const coreRadius = (12 + bass * 26 + beat * 14) * (minDim / 800);
const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius * 2.2);
grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
grad.addColorStop(0.35, 'rgba(140, 200, 255, 0.45)');
grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = grad;
ctx.beginPath();
ctx.arc(0, 0, coreRadius * 2.2, 0, 6.28318);
ctx.fill();

ctx.restore();
ctx.restore();