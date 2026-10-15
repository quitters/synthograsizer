ctx.save();
const W = frame.width;
const H = frame.height;

// Init persistent demoscene state
if (!room.state.init) {
  room.state.init = true;
  room.state.tags = [];      // Bounded list of active laser tag paths/bursts
  room.state.drips = [];     // Dripping particles running down the masonry
  room.state.beams = [];     // Sweeping projector beam heads
  room.state.windows = [];   // Facade window grid cache
  room.state.lastAutoTag = 0;
  
  // Seed deterministic facade window pattern
  for (let f = 0; f < 48; f++) {
    for (let c = 0; c < 24; c++) {
      room.state.windows.push({
        floor: f,
        col: c,
        lit: Math.random() > 0.45,
        warmth: 0.15 + Math.random() * 0.4,
        pulseOffset: Math.random() * Math.PI * 2
      });
    }
  }
}

// Knobs
const laserStyle = getVar('laser_style') ?? 'wildstyle';
const paletteMode = getVar('palette_mode') ?? 'cyberpunk';
const dripSpeed = getVar('drip_speed') ?? 1.2;
const glowIntensity = getVar('glow_intensity') ?? 1.4;
const windowDensity = getVar('window_density') ?? 'dense';
const beamSweep = getVar('beam_sweep') ?? true;

// Palette map
const palettes = {
  cyberpunk: [320, 180, 280, 50, 195],
  neon_acid: [110, 60, 290, 160, 45],
  infrared: [0, 25, 345, 45, 15],
  aurora: [160, 190, 220, 280, 140]
};
const activePalette = palettes[paletteMode] ?? palettes.cyberpunk;

// Palette color picker
function getTagHue(person, idx) {
  if (person && person.hue !== undefined) return person.hue;
  return activePalette[(idx || 0) % activePalette.length];
}

// Spawn a laser graffiti tag
function spawnTag(x, y, hue, style) {
  const pts = [];
  const strokes = style === 'calligraphy' ? 3 : (style === 'wildstyle' ? 5 : 4);
  const size = Math.min(W, H) * (0.12 + Math.random() * 0.16);
  
  for (let s = 0; s < strokes; s++) {
    const strokePts = [];
    let cx = x + (Math.random() - 0.5) * size * 0.7;
    let cy = y + (Math.random() - 0.5) * size * 0.5;
    const numNodes = style === 'stencil' ? 6 : 14;
    const angleBase = Math.random() * Math.PI * 2;
    
    for (let i = 0; i < numNodes; i++) {
      strokePts.push({ x: cx, y: cy });
      const a = angleBase + (i / numNodes) * Math.PI * (style === 'wildstyle' ? 3.5 : 2.0) + (Math.random() - 0.5) * 0.8;
      const step = (size / numNodes) * (0.8 + Math.random() * 0.9);
      cx += Math.cos(a) * step;
      cy += Math.sin(a) * step * 0.75;
    }
    pts.push(strokePts);
  }

  // Add tag
  if (room.state.tags.length > 35) room.state.tags.shift();
  room.state.tags.push({
    pts,
    hue,
    t: frame.t,
    life: 1.0,
    maxLife: 6.0 + Math.random() * 4.0,
    decay: 0.12 + Math.random() * 0.08,
    glowScale: 1.0,
    originX: x,
    originY: y
  });

  // Spawn associated drips
  const numDrips = Math.floor(6 + Math.random() * 8);
  for (let d = 0; d < numDrips; d++) {
    if (room.state.drips.length > 120) room.state.drips.shift();
    room.state.drips.push({
      x: x + (Math.random() - 0.5) * size * 0.8,
      y: y + (Math.random() - 0.2) * size * 0.4,
      vy: (15 + Math.random() * 35) * dripSpeed,
      length: 12 + Math.random() * 30,
      width: 1.5 + Math.random() * 2.5,
      hue,
      alpha: 1.0,
      decay: 0.15 + Math.random() * 0.2
    });
  }
}

// Handle interactive triggers
if (room.events && room.events.length > 0) {
  for (let i = 0; i < room.events.length; i++) {
    const ev = room.events[i];
    if (ev.name === 'tag_laser' || ev.name === 'bomb_facade') {
      const p = room.people ? room.people.find(person => person.id === ev.participantId) : null;
      const h = getTagHue(p, i);
      const tx = W * (0.2 + Math.random() * 0.6);
      const ty = H * (0.15 + Math.random() * 0.55);
      spawnTag(tx, ty, h, laserStyle);
      if (ev.name === 'bomb_facade') {
        for (let b = 0; b < 2; b++) {
          spawnTag(tx + (Math.random() - 0.5) * W * 0.25, ty + (Math.random() - 0.5) * H * 0.25, (h + 35 * (b + 1)) % 360, laserStyle);
        }
      }
    }
  }
}

// Auto-tagging rhythm from music or idle timer
const audioEnergy = (audio.bass * 1.5 + audio.mid * 0.8 + audio.level);
const tagThreshold = audio.beat ? 0.35 : 0.85;
if (frame.t - room.state.lastAutoTag > (audio.beat ? 1.4 : 3.2) || (audioEnergy > 1.4 && frame.t - room.state.lastAutoTag > 0.8)) {
  room.state.lastAutoTag = frame.t;
  const personIdx = room.people && room.people.length ? Math.floor(Math.random() * room.people.length) : 0;
  const person = room.people && room.people[personIdx];
  const h = getTagHue(person, Math.floor(frame.t * 3));
  const tx = W * (0.18 + Math.random() * 0.64);
  const ty = H * (0.15 + Math.random() * 0.6);
  spawnTag(tx, ty, h, laserStyle);
}

// 1. CLEAR & SKY / URBAN ATMOSPHERE
ctx.fillStyle = '#030408';
ctx.fillRect(0, 0, W, H);

// Atmospheric city fog gradient
const fogGrad = ctx.createLinearGradient(0, 0, 0, H);
fogGrad.addColorStop(0, '#020306');
fogGrad.addColorStop(0.7, '#070a12');
fogGrad.addColorStop(1, '#0e121c');
ctx.fillStyle = fogGrad;
ctx.fillRect(0, 0, W, H);

// 2. DRAW TALL BUILDING FACADE (Perspective & Windows)
const bLeft = W * 0.12;
const bRight = W * 0.88;
const bWidth = bRight - bLeft;
const vanishY = -H * 0.6;

// Base building shadow & concrete columns
ctx.fillStyle = '#06080d';
ctx.beginPath();
ctx.moveTo(bLeft, H);
ctx.lineTo(bLeft + W * 0.04, 0);
ctx.lineTo(bRight - W * 0.04, 0);
ctx.lineTo(bRight, H);
ctx.closePath();
ctx.fill();

// Masonry mullions / architectural relief lines
ctx.strokeStyle = '#0e131d';
ctx.lineWidth = 2;
ctx.beginPath();
const numCols = 16;
for (let c = 0; c <= numCols; c++) {
  const ratio = c / numCols;
  const topX = (bLeft + W * 0.04) + (bWidth - W * 0.08) * ratio;
  const botX = bLeft + bWidth * ratio;
  ctx.moveTo(topX, 0);
  ctx.lineTo(botX, H);
}
ctx.stroke();

// Windows rendering
const winProb = windowDensity === 'sparse' ? 0.2 : (windowDensity === 'glitch' ? 0.45 : 0.75);
const rows = 32;
const cols = 14;
const colStep = (bWidth * 0.86) / cols;
const rowStep = (H * 0.94) / rows;

for (let r = 0; r < rows; r++) {
  const rowProgress = r / rows;
  const y = H * 0.04 + r * rowStep;
  const curLeft = (bLeft + W * 0.04 * (1 - rowProgress)) + W * 0.03;
  
  for (let c = 0; c < cols; c++) {
    const idx = (r * cols + c) % room.state.windows.length;
    const win = room.state.windows[idx];
    if (!win.lit || (idx % 7 > Math.floor(winProb * 10))) continue;
    
    const x = curLeft + c * colStep;
    const w = colStep * 0.48;
    const h = rowStep * 0.52;
    
    // Window glow
    const flicker = Math.sin(frame.t * 2 + win.pulseOffset) * 0.15 + (windowDensity === 'glitch' && Math.random() > 0.96 ? 0.4 : 0);
    const baseLight = Math.max(0.08, win.warmth + flicker + audio.bass * 0.2);
    
    // Color variation: warm tungsten vs computer terminal cyan
    const isCyan = (idx % 5 === 0);
    ctx.fillStyle = isCyan 
      ? `rgba(140, 220, 255, ${baseLight * 0.45})`
      : `rgba(255, 210, 130, ${baseLight * 0.55})`;
    
    ctx.fillRect(x, y, w, h);
    
    // Faint window blind slat lines
    ctx.fillStyle = 'rgba(5, 7, 12, 0.45)';
    ctx.fillRect(x, y + h * 0.4, w, 1.5);
  }
}

// 3. LASER GRAFFITI DRAWING (Additive glow stacking)
ctx.globalCompositeOperation = 'lighter';

const dt = Math.min(frame.dt, 0.05);

// Draw Dripping Laser Paint down facade
for (let i = room.state.drips.length - 1; i >= 0; i--) {
  const d = room.state.drips[i];
  d.y += d.vy * dt;
  d.alpha -= d.decay * dt;
  
  if (d.alpha <= 0.01 || d.y > H) {
    room.state.drips.splice(i, 1);
    continue;
  }
  
  const rad = d.width * glowIntensity;
  // Glow core & bloom
  ctx.strokeStyle = `hsla(${d.hue}, 100%, 75%, ${d.alpha * 0.9})`;
  ctx.lineWidth = d.width;
  ctx.beginPath();
  ctx.moveTo(d.x, d.y - d.length);
  ctx.lineTo(d.x, d.y);
  ctx.stroke();

  // Halo around tear head
  ctx.fillStyle = `hsla(${d.hue}, 100%, 60%, ${d.alpha * 0.6})`;
  ctx.beginPath();
  ctx.arc(d.x, d.y, rad * 1.6, 0, Math.PI * 2);
  ctx.fill();
}

// Draw Tags (Multi-pass glow for laser projection look)
for (let tIdx = room.state.tags.length - 1; tIdx >= 0; tIdx--) {
  const tag = room.state.tags[tIdx];
  tag.life -= tag.decay * dt;
  
  if (tag.life <= 0.01) {
    room.state.tags.splice(tIdx, 1);
    continue;
  }
  
  const audioPulse = 1.0 + audio.mid * 0.4 + (audio.beat ? 0.3 : 0);
  const alpha = Math.min(1.0, tag.life * 1.2) * audioPulse;
  
  // Draw each stroke of the tag
  for (let s = 0; s < tag.pts.length; s++) {
    const pts = tag.pts[s];
    if (pts.length < 2) continue;
    
    // Pass 1: Wide laser bloom
    ctx.strokeStyle = `hsla(${tag.hue}, 100%, 55%, ${alpha * 0.18 * glowIntensity})`;
    ctx.lineWidth = 14 * glowIntensity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let p = 1; p < pts.length; p++) {
      ctx.lineTo(pts[p].x, pts[p].y);
    }
    ctx.stroke();

    // Pass 2: Intense neon body
    ctx.strokeStyle = `hsla(${tag.hue}, 100%, 65%, ${alpha * 0.6 * glowIntensity})`;
    ctx.lineWidth = 5 * glowIntensity;
    ctx.stroke();

    // Pass 3: Burning white-hot center core
    ctx.strokeStyle = `hsla(${tag.hue}, 40%, 96%, ${alpha * 0.95})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

// 4. SWEEPING LASER PROJECTOR BEAMS FROM GROUND
if (beamSweep) {
  const numBeams = 3;
  for (let b = 0; b < numBeams; b++) {
    const beamAngle = Math.sin(frame.t * 0.8 + b * 2.1) * 0.35 + (b - 1) * 0.3;
    const sourceX = W * (0.35 + b * 0.15);
    const sourceY = H * 1.05;
    const targetX = sourceX + Math.sin(beamAngle) * H * 1.2;
    const targetY = -H * 0.2;
    const beamHue = activePalette[(b * 2) % activePalette.length];
    
    // Volumetric laser cone
    const beamGrad = ctx.createLinearGradient(sourceX, sourceY, targetX, targetY);
    beamGrad.addColorStop(0, `hsla(${beamHue}, 100%, 70%, ${0.28 * glowIntensity})`);
    beamGrad.addColorStop(0.6, `hsla(${beamHue}, 100%, 60%, ${0.08 * glowIntensity})`);
    beamGrad.addColorStop(1, 'transparent');
    
    ctx.strokeStyle = beamGrad;
    ctx.lineWidth = 3.5 + audio.bass * 3.0;
    ctx.beginPath();
    ctx.moveTo(sourceX, sourceY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    
    // Hit-point flare where laser strikes building surface
    const hitY = H * (0.2 + 0.3 * Math.sin(frame.t * 1.4 + b));
    const hitX = sourceX + (targetX - sourceX) * ((sourceY - hitY) / (sourceY - targetY));
    
    if (hitX > bLeft && hitX < bRight) {
      const flareRad = (14 + audio.level * 22) * glowIntensity;
      const flareGrad = ctx.createRadialGradient(hitX, hitY, 0, hitX, hitY, flareRad);
      flareGrad.addColorStop(0, `hsla(${beamHue}, 100%, 95%, 0.9)`);
      flareGrad.addColorStop(0.3, `hsla(${beamHue}, 100%, 60%, 0.4)`);
      flareGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flareGrad;
      ctx.beginPath();
      ctx.arc(hitX, hitY, flareRad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 5. RESTORE CANVAS
ctx.restore();