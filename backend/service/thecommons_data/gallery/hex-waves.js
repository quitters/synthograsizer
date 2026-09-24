ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;

// Read variables
const hexR = getVar('hex_size') ?? 24;
const waveSpeed = getVar('wave_speed') ?? 350;
const maxLife = getVar('decay_rate') ?? 2.0;
const style = getVar('render_style') ?? 'Filled Mosaic';
const paletteChoice = getVar('palette') ?? 'Neon Cyber';

// Palette base hues
const PALETTES = {
  'Neon Cyber': [180, 290, 330, 140],
  'Deep Ocean': [190, 215, 240, 160],
  'Solar Flare': [15, 40, 345, 55],
  'Prism Acid': [60, 130, 280, 320]
};
const baseHues = PALETTES[paletteChoice] ?? PALETTES['Neon Cyber'];

// Persistent state
room.state.waves ??= [];
room.state.lastBeat ??= 0;
room.state.colorIdx ??= 0;
room.state.gridKey ??= '';

// Geometry setup
const sqrt3 = 1.7320508;
const stepX = sqrt3 * hexR;
const stepY = 1.5 * hexR;
const cols = Math.ceil(W / stepX) + 2;
const rows = Math.ceil(H / stepY) + 2;

// Rebuild lookup table of cell positions only when dimensions/size change
const gridKey = `${W}_${H}_${hexR}`;
if (room.state.gridKey !== gridKey || !room.state.cells) {
  room.state.gridKey = gridKey;
  const cells = [];
  for (let r = -1; r < rows; r++) {
    const y = r * stepY;
    const xOffset = (r & 1) ? stepX * 0.5 : 0;
    for (let c = -1; c < cols; c++) {
      cells.push({ x: c * stepX + xOffset, y, r, c });
    }
  }
  room.state.cells = cells;
}
const cells = room.state.cells;

// Trigger new wave on beat or periodic fallback
const beatCooldown = 0.22;
const isBeat = (audio.beat || audio.bass > 0.65) && (t - room.state.lastBeat > beatCooldown);
const fallbackTimer = (t - room.state.lastBeat > 1.2);
if (isBeat || fallbackTimer) {
  room.state.lastBeat = t;
  const target = cells[Math.floor(Math.random() * cells.length)];
  const hueList = room.people && room.people.length > 0 
    ? room.people.map(p => p.hue) 
    : baseHues;
  const hue = hueList[room.state.colorIdx % hueList.length];
  room.state.colorIdx++;

  if (room.state.waves.length >= 24) {
    room.state.waves.shift();
  }
  room.state.waves.push({
    x: target.x,
    y: target.y,
    t0: t,
    hue,
    thickness: hexR * (1.2 + audio.bass * 1.5),
    amp: 0.8 + audio.bass * 0.6
  });
}

// Update existing waves; cull expired
const waves = room.state.waves;
for (let i = waves.length - 1; i >= 0; i--) {
  if (t - waves[i].t0 > maxLife) {
    waves.splice(i, 1);
  }
}

// Fade background for high dynamic range & subtle phosphor persistence
ctx.fillStyle = '#06070d';
ctx.fillRect(0, 0, W, H);

// Precompute hexagon vertices template
const hexVerts = [];
for (let i = 0; i < 6; i++) {
  const ang = (Math.PI / 3) * i + (Math.PI / 6);
  hexVerts.push([Math.cos(ang), Math.sin(ang)]);
}

// Render pass
const numWaves = waves.length;
const globalBass = audio.bass || 0;
const globalTreble = audio.treble || 0;
const waveSpeedScaled = waveSpeed * (1 + globalBass * 0.35);

// Draw grid
for (let i = 0; i < cells.length; i++) {
  const cell = cells[i];
  let sumR = 0, sumG = 0, sumB = 0, totalEnergy = 0;

  // Interference accumulation from active waves
  for (let w = 0; w < numWaves; w++) {
    const wave = waves[w];
    const age = t - wave.t0;
    const currentRadius = age * waveSpeedScaled;
    const dx = cell.x - wave.x;
    const dy = cell.y - wave.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delta = Math.abs(dist - currentRadius);
    const halfThick = wave.thickness;

    if (delta < halfThick) {
      const envelope = 1 - (delta / halfThick);
      const lifeDecay = Math.max(0, 1 - (age / maxLife));
      const energy = envelope * envelope * lifeDecay * wave.amp;

      if (energy > 0.01) {
        totalEnergy += energy;
        // Convert hue to simple fast RGB approximation
        const hNorm = ((wave.hue % 360) + 360) % 360 / 60;
        const primary = Math.floor(hNorm);
        const f = hNorm - primary;
        let r = 0, g = 0, b = 0;
        if (primary === 0) { r = 1; g = f; }
        else if (primary === 1) { r = 1 - f; g = 1; }
        else if (primary === 2) { g = 1; b = f; }
        else if (primary === 3) { g = 1 - f; b = 1; }
        else if (primary === 4) { r = f; b = 1; }
        else { r = 1; b = 1 - f; }
        sumR += r * energy;
        sumG += g * energy;
        sumB += b * energy;
      }
    }
  }

  // Resting ambient shimmer when idle
  const ambient = 0.08 + 0.04 * Math.sin(cell.x * 0.01 + cell.y * 0.01 + t * 1.5);
  const displayEnergy = Math.min(1.0, totalEnergy + ambient);
  
  const finalR = Math.min(255, Math.floor((sumR * 1.4 + ambient * 0.3) * 255));
  const finalG = Math.min(255, Math.floor((sumG * 1.4 + ambient * 0.4) * 255));
  const finalB = Math.min(255, Math.floor((sumB * 1.4 + ambient * 0.7) * 255));

  // Cell radius scaling on excitement
  const activeR = hexR * (0.82 + Math.min(0.25, totalEnergy * 0.35));

  if (style === 'Quantum Dots') {
    const dotR = Math.max(1.5, activeR * 0.4 * displayEnergy);
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, dotR, 0, 6.28318);
    ctx.fillStyle = `rgb(${finalR},${finalG},${finalB})`;
    ctx.fill();
  } else if (style === 'Chroma Rings') {
    const ringR = Math.max(2, activeR * (0.3 + displayEnergy * 0.6));
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, ringR, 0, 6.28318);
    ctx.strokeStyle = `rgb(${finalR},${finalG},${finalB})`;
    ctx.lineWidth = 1.0 + totalEnergy * 2.5;
    ctx.stroke();
  } else {
    // Hexagon rendering
    ctx.beginPath();
    for (let v = 0; v < 6; v++) {
      const px = cell.x + hexVerts[v][0] * activeR;
      const py = cell.y + hexVerts[v][1] * activeR;
      if (v === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    if (style === 'Filled Mosaic') {
      ctx.fillStyle = `rgb(${finalR},${finalG},${finalB})`;
      ctx.fill();
      if (totalEnergy > 0.1) {
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.8, totalEnergy * 0.7)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      // Wire Pulse
      const alpha = Math.min(1.0, 0.15 + totalEnergy * 1.2 + globalTreble * 0.2);
      ctx.strokeStyle = `rgba(${finalR},${finalG},${finalB},${alpha})`;
      ctx.lineWidth = 1.0 + totalEnergy * 2.0;
      ctx.stroke();
      if (totalEnergy > 0.4) {
        ctx.fillStyle = `rgba(${finalR},${finalG},${finalB},${totalEnergy * 0.25})`;
        ctx.fill();
      }
    }
  }
}

ctx.restore();