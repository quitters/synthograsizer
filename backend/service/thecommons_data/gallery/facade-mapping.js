ctx.save();
const W = frame.width, H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);
const speedVar = getVar('transition_speed') ?? 1.0;
const lineWeight = getVar('architectural_detail') ?? 2.0;
const fogEnabled = getVar('atmosphere_fx') ?? true;
const themeName = getVar('facade_theme') || 'cathedral_dream';
const glowName = getVar('accent_glow') || 'electric_cyan';

// Palette lookup
const glowPals = {
  electric_cyan: { main: '#00f2ff', sec: '#0066ff', warm: '#ffe6aa', hi: '#d0ffff', rgb: '0, 242, 255' },
  amber_gold:    { main: '#ffaa00', sec: '#ff4400', warm: '#fff2cc', hi: '#fff8e7', rgb: '255, 170, 0' },
  emerald_jade:  { main: '#00ff88', sec: '#009944', warm: '#e6fffa', hi: '#aaffdd', rgb: '0, 255, 136' },
  amethyst_neon: { main: '#d000ff', sec: '#6a00ff', warm: '#ffe6ff', hi: '#f2b3ff', rgb: '208, 0, 255' }
};
const pal = glowPals[glowName] || glowPals.electric_cyan;

// Init persistent state
room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  room.state.phase = 0;       // 0: Wireframe, 1: Crumble, 2: Water Flood, 3: Vines, 4: Laser Rebuild
  room.state.phaseTime = 0;
  room.state.blocks = [];
  // Masonry grid blocks for crumble effect
  for (let r = 0; r < 14; r++) {
    for (let c = 0; c < 22; c++) {
      room.state.blocks.push({
        r, c,
        u: (c + 0.5) / 22,
        v: (r + 0.5) / 14,
        w: 1 / 22,
        h: 1 / 14,
        vy: 0,
        vx: (Math.random() - 0.5) * 0.4,
        rot: (Math.random() - 0.5) * 2,
        delay: (13 - r) * 0.08 + Math.random() * 0.3,
        seed: Math.random() * 1000
      });
    }
  }
  // Precompute vine nodes
  room.state.vines = [];
  for (let i = 0; i < 18; i++) {
    const colIdx = i % 8;
    const colU = (colIdx + 0.8) / 9;
    const pts = [];
    let vx = colU, vy = 0.88;
    for (let s = 0; s < 24; s++) {
      pts.push({ x: vx, y: vy });
      vx += (Math.sin(s * 1.3 + i * 2.1) * 0.012);
      vy -= 0.032;
    }
    room.state.vines.push(pts);
  }
}

// Track phase transitions synced with audio beat or fixed cycle
const phaseDuration = 7.5 / Math.max(0.2, speedVar);
room.state.phaseTime += dt;
if (room.state.phaseTime >= phaseDuration || (audio.beat && room.state.phaseTime > phaseDuration * 0.75)) {
  room.state.phaseTime = 0;
  room.state.phase = (room.state.phase + 1) % 5;
}
const phase = room.state.phase;
const pNorm = Math.min(1, room.state.phaseTime / phaseDuration);

// Deep black background with deep audio-reactive vignette
ctx.fillStyle = '#030509';
ctx.fillRect(0, 0, W, H);

// Architectural Layout Coordinates (proportional to canvas)
const marginX = W * 0.08;
const baseW = W * 0.84;
const baseH = H * 0.82;
const topY = H * 0.10;
const groundY = topY + baseH;
const plinthH = baseH * 0.10;
const colH = baseH * 0.56;
const entablatureH = baseH * 0.12;
const pedimentH = baseH * 0.22;

const pedY = topY + pedimentH;
const entabY = pedY + entablatureH;
const colBaseY = entabY + colH;

// 8 Grand Columns
const numCols = 8;
const colWidth = (baseW / numCols) * 0.36;
const colSpacing = baseW / (numCols - 1);

// Helpers for clipping compartments
function clipToFacade(c) {
  c.beginPath();
  // Base
  c.rect(marginX - 20, colBaseY, baseW + 40, plinthH + 10);
  // Portico body
  c.rect(marginX, entabY, baseW, colH);
  // Entablature
  c.rect(marginX - 10, pedY, baseW + 20, entablatureH);
  // Tympanum triangle
  c.moveTo(marginX - 15, pedY);
  c.lineTo(marginX + baseW * 0.5, topY);
  c.lineTo(marginX + baseW + 15, pedY);
  c.closePath();
  c.clip();
}

// Dynamic projection stage effects (inside architecture)
ctx.save();
clipToFacade(ctx);

// --- STATE 0: WIREFRAME / BLUEPRINT SCAN ---
if (phase === 0) {
  const scanY = topY + ((t * speedVar * 0.6) % 1) * (baseH + pedimentH);
  ctx.strokeStyle = `rgba(${pal.rgb}, 0.25)`;
  ctx.lineWidth = 1;
  const gridStep = 32;
  ctx.beginPath();
  for (let x = marginX; x <= marginX + baseW; x += gridStep) {
    ctx.moveTo(x, topY); ctx.lineTo(x, groundY);
  }
  for (let y = topY; y <= groundY; y += gridStep) {
    ctx.moveTo(marginX, y); ctx.lineTo(marginX + baseW, y);
  }
  ctx.stroke();

  // Scanning laser beam
  const grad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.5, `rgba(${pal.rgb}, ${0.5 + audio.bass * 0.4})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(marginX - 40, scanY - 40, baseW + 80, 80);
}

// --- STATE 1: MASONRY CRUMBLE & COLLAPSE ---
else if (phase === 1) {
  const progress = pNorm;
  ctx.save();
  for (let i = 0; i < room.state.blocks.length; i++) {
    const b = room.state.blocks[i];
    if (progress > b.delay) {
      const fallT = Math.pow(Math.max(0, (progress - b.delay) / (1 - b.delay + 0.001)), 2.5);
      const bx = marginX + b.u * baseW + b.vx * fallT * 260;
      const by = topY + b.v * baseH + fallT * (H * 0.95);
      const ang = b.rot * fallT * 4.0;
      const bw = b.w * baseW * 0.9;
      const bh = b.h * baseH * 0.9;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ang);
      ctx.fillStyle = '#060a12';
      ctx.fillRect(-bw * 0.5, -bh * 0.5, bw, bh);
      ctx.strokeStyle = `rgba(${pal.rgb}, ${Math.max(0.1, 1 - fallT)})`;
      ctx.lineWidth = lineWeight;
      ctx.strokeRect(-bw * 0.5, -bh * 0.5, bw, bh);
      ctx.restore();
    } else {
      // Stone in place with trembling on bass
      const jitter = audio.bass * (Math.sin(t * 40 + i) * 3);
      const bx = marginX + b.u * baseW + jitter;
      const by = topY + b.v * baseH;
      const bw = b.w * baseW * 0.94;
      const bh = b.h * baseH * 0.94;
      ctx.strokeStyle = `rgba(${pal.rgb}, 0.35)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - bw * 0.5, by - bh * 0.5, bw, bh);
    }
  }
  ctx.restore();
}

// --- STATE 2: RISING WATER / FLOOD ---
else if (phase === 2) {
  const fillHeight = baseH * Math.min(1.0, pNorm * 1.15);
  const waterLevel = groundY - fillHeight;

  // Caustic refraction backdrop inside facade
  ctx.fillStyle = '#02131e';
  ctx.fillRect(marginX - 20, waterLevel, baseW + 40, fillHeight + 50);

  // Water surface waves
  ctx.beginPath();
  ctx.moveTo(marginX - 40, waterLevel);
  const waveCount = 28;
  for (let k = 0; k <= waveCount; k++) {
    const wx = marginX - 40 + (k / waveCount) * (baseW + 80);
    const waveAmp = 10 + audio.bass * 25;
    const wy = waterLevel + Math.sin(k * 0.7 + t * 4.5) * waveAmp * 0.5 + Math.cos(k * 1.4 - t * 3.2) * (waveAmp * 0.4);
    ctx.lineTo(wx, wy);
  }
  ctx.lineTo(marginX + baseW + 50, groundY + 50);
  ctx.lineTo(marginX - 50, groundY + 50);
  ctx.closePath();

  const waterGrad = ctx.createLinearGradient(0, waterLevel, 0, groundY);
  waterGrad.addColorStop(0, `rgba(${pal.rgb}, 0.75)`);
  waterGrad.addColorStop(0.3, 'rgba(0, 110, 180, 0.6)');
  waterGrad.addColorStop(1, 'rgba(1, 15, 35, 0.95)');
  ctx.fillStyle = waterGrad;
  ctx.fill();

  // Surface foam line
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Floating audio-driven luminescent bubbles
  ctx.fillStyle = `rgba(${pal.rgb}, 0.8)`;
  for (let b = 0; b < 32; b++) {
    const bx = marginX + ((b * 67 + t * 30) % baseW);
    const by = groundY - ((b * 41 + t * 90) % Math.max(10, fillHeight));
    const rad = 2 + (b % 4) + audio.treble * 4;
    ctx.beginPath();
    ctx.arc(bx, by, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- STATE 3: BIOLUMINESCENT VINES OVERGROWTH ---
else if (phase === 3) {
  const growth = Math.min(1.0, pNorm * 1.25);
  ctx.shadowColor = pal.main;
  ctx.shadowBlur = 12 + audio.mid * 20;
  ctx.strokeStyle = pal.main;
  ctx.lineWidth = lineWeight * 1.5;
  ctx.lineCap = 'round';

  for (let i = 0; i < room.state.vines.length; i++) {
    const pts = room.state.vines[i];
    const numPts = Math.floor(pts.length * growth);
    if (numPts < 2) continue;

    ctx.beginPath();
    ctx.moveTo(marginX + pts[0].x * baseW, topY + pts[0].y * baseH);
    for (let p = 1; p < numPts; p++) {
      const px = marginX + pts[p].x * baseW + Math.sin(t * 3 + p) * (2 + audio.bass * 4);
      const py = topY + pts[p].y * baseH;
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Sprouting leaf pods on beat
    for (let p = 2; p < numPts; p += 3) {
      const lx = marginX + pts[p].x * baseW;
      const ly = topY + pts[p].y * baseH;
      const leafR = 3 + (audio.treble * 5);
      ctx.fillStyle = pal.hi;
      ctx.beginPath();
      ctx.arc(lx + 4, ly, leafR, 0, Math.PI * 2);
      ctx.arc(lx - 4, ly, leafR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
}

// --- STATE 4: LASER / TESLA RECONSTRUCTION ---
else if (phase === 4) {
  const sweep = pNorm;
  const beamX = marginX + sweep * baseW;
  // Vertical reconstitution scanline
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4 + audio.bass * 6;
  ctx.beginPath();
  ctx.moveTo(beamX, topY);
  ctx.lineTo(beamX, groundY);
  ctx.stroke();

  // Horizontal laser chords slicing across building
  ctx.strokeStyle = `rgba(${pal.rgb}, 0.7)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let l = 0; l < 8; l++) {
    const ly = topY + (l / 7) * baseH;
    const spark = Math.sin(l * 12 + t * 25) * 8 * audio.mid;
    ctx.moveTo(beamX - 80, ly + spark);
    ctx.lineTo(beamX + 80, ly - spark);
  }
  ctx.stroke();

  // Crystalline fill trailing the beam
  ctx.fillStyle = `rgba(${pal.rgb}, 0.08)`;
  ctx.fillRect(marginX, topY, beamX - marginX, baseH);
}
ctx.restore();

// ==========================================================================
// PERMANENT ARCHITECTURAL SKELETON (Always crisp & legible from a distance)
// ==========================================================================
ctx.save();
ctx.shadowColor = pal.main;
ctx.shadowBlur = 10 + audio.bass * 16;
ctx.strokeStyle = pal.hi;
ctx.lineWidth = lineWeight;
ctx.fillStyle = '#000000';

// 1. Plinth / Crepidoma Steps (Ground podium)
for (let step = 0; step < 3; step++) {
  const sx = marginX - 30 + step * 10;
  const sy = colBaseY + (step * (plinthH / 3));
  const sw = (baseW + 60) - step * 20;
  const sh = (plinthH / 3) + 1;
  ctx.strokeRect(sx, sy, sw, sh);
}

// 2. Entablature & Cornice moldings
ctx.strokeRect(marginX - 12, entabY, baseW + 24, entablatureH * 0.35); // Architrave
ctx.strokeRect(marginX - 16, entabY - entablatureH * 0.35, baseW + 32, entablatureH * 0.35); // Frieze
ctx.strokeRect(marginX - 24, pedY, baseW + 48, entablatureH * 0.30); // Projecting cornice

// Triglyphs along frieze
const numTriglyphs = 29;
const friezeY = entabY - entablatureH * 0.35;
const friezeH = entablatureH * 0.35;
ctx.beginPath();
for (let i = 0; i <= numTriglyphs; i++) {
  const tx = (marginX - 16) + (i / numTriglyphs) * (baseW + 32);
  ctx.moveTo(tx, friezeY);
  ctx.lineTo(tx, friezeY + friezeH);
}
ctx.stroke();

// 3. Triangular Pediment / Tympanum with central Oculus
ctx.beginPath();
const apexX = marginX + baseW * 0.5;
const apexY = topY;
ctx.moveTo(marginX - 28, pedY);
ctx.lineTo(apexX, apexY);
ctx.lineTo(marginX + baseW + 28, pedY);
ctx.closePath();
ctx.stroke();

// Inner tympanum frame
ctx.beginPath();
ctx.moveTo(marginX + 10, pedY - 6);
ctx.lineTo(apexX, apexY + 22);
ctx.lineTo(marginX + baseW - 10, pedY - 6);
ctx.closePath();
ctx.stroke();

// Central pediment medallion / oculus clock
const oculusY = pedY - pedimentH * 0.38;
const oculusR = 24 + audio.bass * 8;
ctx.beginPath();
ctx.arc(apexX, oculusY, oculusR, 0, Math.PI * 2);
ctx.stroke();
// Interior radial spokes of oculus
ctx.beginPath();
for (let a = 0; a < 8; a++) {
  const ang = (a / 8) * Math.PI * 2 + t * 0.4;
  ctx.moveTo(apexX, oculusY);
  ctx.lineTo(apexX + Math.cos(ang) * oculusR, oculusY + Math.sin(ang) * oculusR);
}
ctx.stroke();

// 4. Grand Columns & Capitals
for (let i = 0; i < numCols; i++) {
  const cx = marginX + i * colSpacing;
  const cy = entabY;
  const ch = colH;
  const cw = colWidth;

  // Column base plinth
  ctx.strokeRect(cx - cw * 0.65, colBaseY - 14, cw * 1.3, 14);
  ctx.strokeRect(cx - cw * 0.55, colBaseY - 24, cw * 1.1, 10);

  // Column Shaft (with slight classical entasis taper)
  ctx.beginPath();
  ctx.moveTo(cx - cw * 0.45, cy + 24);
  ctx.lineTo(cx - cw * 0.52, colBaseY - 24);
  ctx.lineTo(cx + cw * 0.52, colBaseY - 24);
  ctx.lineTo(cx + cw * 0.45, cy + 24);
  ctx.closePath();
  ctx.stroke();

  // Fluting lines along the column shaft
  ctx.beginPath();
  const numFlutes = 4;
  for (let f = 1; f < numFlutes; f++) {
    const fxFactor = (f / numFlutes) - 0.5;
    const topFx = cx + fxFactor * (cw * 0.82);
    const botFx = cx + fxFactor * (cw * 0.96);
    ctx.moveTo(topFx, cy + 24);
    ctx.lineTo(botFx, colBaseY - 24);
  }
  ctx.stroke();

  // Ionic/Corinthian Capital at top of column
  ctx.strokeRect(cx - cw * 0.7, cy + 10, cw * 1.4, 14);
  // Left & right scroll volutes
  ctx.beginPath();
  ctx.arc(cx - cw * 0.55, cy + 18, 9, 0, Math.PI * 2);
  ctx.arc(cx + cw * 0.55, cy + 18, 9, 0, Math.PI * 2);
  ctx.stroke();
}

// 5. Arched Windows in the inner bays (recessed between central columns)
for (let i = 1; i < numCols - 1; i++) {
  const winX = marginX + (i + 0.5) * colSpacing;
  if (i === 3 || i === 4) {
    // Grand central Portal
    const portW = colSpacing * 0.55;
    const portH = colH * 0.65;
    const portY = colBaseY - portH;
    ctx.strokeRect(winX - portW * 0.5, portY, portW, portH);
    ctx.beginPath();
    ctx.arc(winX, portY, portW * 0.5, Math.PI, 0);
    ctx.stroke();
    // Transom fanlight
    for (let ray = 1; ray < 5; ray++) {
      const ang = Math.PI + (ray / 5) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(winX, portY);
      ctx.lineTo(winX + Math.cos(ang) * portW * 0.5, portY + Math.sin(ang) * portW * 0.5);
      ctx.stroke();
    }
  } else {
    // Classical Tall Arched Windows
    const winW = colSpacing * 0.42;
    const winH = colH * 0.45;
    const winY = entabY + colH * 0.28;
    ctx.strokeRect(winX - winW * 0.5, winY, winW, winH);
    ctx.beginPath();
    ctx.arc(winX, winY, winW * 0.5, Math.PI, 0);
    ctx.stroke();
    // Window mullions
    ctx.beginPath();
    ctx.moveTo(winX, winY - winW * 0.5);
    ctx.lineTo(winX, winY + winH);
    ctx.moveTo(winX - winW * 0.5, winY + winH * 0.5);
    ctx.lineTo(winX + winW * 0.5, winY + winH * 0.5);
    ctx.stroke();
  }
}
ctx.restore();

// --- Connected Audience Totems / Spotlight Uplights at base ---
if (room.people && room.people.length > 0) {
  ctx.save();
  const pCount = room.people.length;
  for (let idx = 0; idx < pCount; idx++) {
    const person = room.people[idx];
    const u = (idx + 1) / (pCount + 1);
    const px = marginX + u * baseW;
    const py = groundY + 12;
    const pHue = person.hue ?? ((idx * 60) % 360);

    // Upward spotlight projection cone casting onto facade
    const spotH = colH * 0.8 + audio.mid * 120;
    const beamGrad = ctx.createRadialGradient(px, py, 2, px, py - spotH * 0.5, spotH);
    beamGrad.addColorStop(0, `hsla(${pHue}, 100%, 75%, 0.45)`);
    beamGrad.addColorStop(0.6, `hsla(${pHue}, 90%, 50%, 0.08)`);
    beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(px - 14, py);
    ctx.lineTo(px - 60, py - spotH);
    ctx.lineTo(px + 60, py - spotH);
    ctx.lineTo(px + 14, py);
    ctx.closePath();
    ctx.fill();

    // Physical fixture beacon
    ctx.fillStyle = `hsl(${pHue}, 100%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, 5 + audio.bass * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Atmospheric Projector Fog and Lens Flare ---
if (fogEnabled) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const fogGrad = ctx.createRadialGradient(W * 0.5, H * 0.45, baseW * 0.1, W * 0.5, H * 0.5, baseW * 0.7);
  fogGrad.addColorStop(0, `rgba(${pal.rgb}, ${0.08 + audio.bass * 0.07})`);
  fogGrad.addColorStop(0.7, `rgba(${pal.rgb}, 0.02)`);
  fogGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

ctx.restore();