ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- Configuration & Lookups ---
const species = getVar('jelly_species') || 'Aurelia';
const glass = getVar('refraction_pane') || 'Pristine';
const tempo = getVar('pulse_tempo') ?? 1.0;
const ghostDepth = getVar('ghost_depth') ?? 0.6;
const tentLen = getVar('tentacle_length') ?? 140;
const hasDust = getVar('stage_dust') ?? true;

const palettes = {
  Aurelia:   { core: [140, 240, 255], rim: [70, 160, 255], glow: 'rgba(80,200,255,', beam: 'rgba(60,180,240,' },
  Pelagia:   { core: [255, 170, 255], rim: [190, 80, 240], glow: 'rgba(210,90,255,',  beam: 'rgba(160,60,220,' },
  Chrysaora: { core: [255, 220, 150], rim: [255, 110, 40], glow: 'rgba(255,140,40,',  beam: 'rgba(240,120,30,' }
};
const pal = palettes[species] || palettes.Aurelia;

// --- Persistent State Initialization ---
room.state.pulsePhase = (room.state.pulsePhase || 0) + dt * tempo * (1.8 + audio.bass * 2.2);
if (!room.state.tentacles) {
  room.state.tentacles = [];
  const count = 18;
  const segs = 14;
  for (let i = 0; i < count; i++) {
    const pts = [];
    for (let s = 0; s < segs; s++) pts.push({ x: 0, y: 0 });
    room.state.tentacles.push(pts);
  }
}
if (!room.state.motes) {
  room.state.motes = [];
  for (let i = 0; i < 70; i++) {
    room.state.motes.push({
      x: Math.random(),
      y: Math.random(),
      r: 0.8 + Math.random() * 2.2,
      spd: 0.02 + Math.random() * 0.05,
      seed: Math.random() * 20
    });
  }
}

// --- Dark Theatre Background ---
ctx.fillStyle = '#040407';
ctx.fillRect(0, 0, W, H);

// Vignette & Stage floor perspective
const floorY = H * 0.78;
const fGrad = ctx.createLinearGradient(0, floorY, 0, H);
fGrad.addColorStop(0, '#06060c');
fGrad.addColorStop(0.5, '#0a0a14');
fGrad.addColorStop(1, '#020204');
ctx.fillStyle = fGrad;
ctx.fillRect(0, floorY, W, H - floorY);

// Stage floorboards receding lines
ctx.strokeStyle = 'rgba(25, 25, 45, 0.35)';
ctx.lineWidth = 1.5;
ctx.beginPath();
for (let i = -10; i <= 10; i++) {
  const xTop = W * 0.5 + i * (W * 0.028);
  const xBot = W * 0.5 + i * (W * 0.08);
  ctx.moveTo(xTop, floorY);
  ctx.lineTo(xBot, H);
}
ctx.stroke();

// Spotlight beam on floor (empty illuminated circle beneath phantom)
const spotX = W * 0.5;
const spotY = floorY + (H - floorY) * 0.42;
const spotRx = W * 0.22;
const spotRy = (H - floorY) * 0.32;

// Floor spotlight wash
const spotGrad = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, spotRx);
spotGrad.addColorStop(0, pal.beam + (0.16 + audio.bass * 0.12) + ')');
spotGrad.addColorStop(0.5, pal.beam + '0.05)');
spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = spotGrad;
ctx.beginPath();
ctx.ellipse(spotX, spotY, spotRx, spotRy, 0, 0, Math.PI * 2);
ctx.fill();

// Subtle caustics ring on floor
ctx.strokeStyle = pal.glow + (0.12 + audio.mid * 0.18) + ')';
ctx.lineWidth = 1.8;
ctx.beginPath();
for (let a = 0; a < Math.PI * 2; a += 0.15) {
  const dist = spotRx * 0.65 + Math.sin(a * 7 + t * 2.5) * 8 * (1 + audio.bass);
  const px = spotX + Math.cos(a) * dist;
  const py = spotY + Math.sin(a) * (dist * 0.32);
  if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
}
ctx.closePath();
ctx.stroke();

// Soft down-light cone from flies
ctx.save();
ctx.globalCompositeOperation = 'screen';
const coneGrad = ctx.createLinearGradient(W * 0.5, 0, W * 0.5, spotY);
coneGrad.addColorStop(0, 'rgba(200,230,255,0.015)');
coneGrad.addColorStop(0.4, pal.glow + (0.02 + audio.bass * 0.03) + ')');
coneGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = coneGrad;
ctx.beginPath();
ctx.moveTo(W * 0.46, 0);
ctx.lineTo(W * 0.54, 0);
ctx.lineTo(spotX + spotRx * 1.1, spotY);
ctx.lineTo(spotX - spotRx * 1.1, spotY);
ctx.closePath();
ctx.fill();
ctx.restore();

// Floating stage dust motes inside spotlight
if (hasDust) {
  ctx.save();
  ctx.fillStyle = pal.glow + '0.4)';
  for (let i = 0; i < room.state.motes.length; i++) {
    const m = room.state.motes[i];
    m.y = (m.y - dt * m.spd * 0.18 + 1) % 1;
    m.x = (m.x + Math.sin(t * 0.7 + m.seed) * 0.0006 + 1) % 1;
    const mx = W * (0.35 + m.x * 0.3);
    const my = H * (0.15 + m.y * 0.65);
    const dCenter = Math.abs(mx - W * 0.5) / (W * 0.18);
    if (dCenter < 1.0) {
      const alpha = (1 - dCenter) * (0.15 + 0.35 * Math.sin(t * 2 + m.seed)) * (1 + audio.treble);
      ctx.fillStyle = pal.glow + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(mx, my, m.r * (glass === 'Dusty Victorian' ? 1.6 : 1.0), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// --- Pepper's Ghost Jellyfish Construction ---
// Pulse contraction kinematics
const phase = room.state.pulsePhase;
const contraction = Math.pow(Math.sin(phase) * 0.5 + 0.5, 2.5);
const expansion = 1.0 - contraction * 0.32 + audio.bass * 0.18;
const bellHScale = 0.85 + contraction * 0.45;
const hoverY = H * 0.42 + Math.sin(t * 0.8) * 16 - contraction * 22;
const jellyCenter = { x: W * 0.5, y: hoverY };
const bellRadius = (Math.min(W, H) * 0.16) * expansion;

// Helper to draw jellyfish at an offset (for primary & secondary ghost reflection)
function drawJellyfish(cx, cy, scale, alphaMult, isGhost) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.max(0, Math.min(1, alphaMult));

  // 1. Soft ambient glow aura behind bell
  const auraGrad = ctx.createRadialGradient(0, -bellRadius * 0.2, bellRadius * 0.1, 0, 0, bellRadius * 1.8);
  auraGrad.addColorStop(0, pal.glow + (0.28 * alphaMult) + ')');
  auraGrad.addColorStop(0.6, pal.glow + (0.08 * alphaMult) + ')');
  auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(0, 0, bellRadius * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // 2. Translucent Bell Dome (Parametric arches)
  const steps = 36;
  ctx.beginPath();
  for (let s = 0; s <= steps; s++) {
    const th = (s / steps) * Math.PI;
    const bx = -Math.cos(th) * bellRadius;
    // Dome parabolic curve with pulsating rim tuck
    const by = -Math.sin(th) * (bellRadius * 0.95 * bellHScale) + Math.pow(Math.cos(th), 2) * (12 * contraction);
    if (s === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
  }
  // Lappet scalloped rim
  const scallops = 14;
  for (let s = scallops; s >= 0; s--) {
    const th = (s / scallops) * Math.PI;
    const lx = Math.cos(th) * (bellRadius * 0.96);
    const ly = Math.sin(s * Math.PI) * 4 + Math.sin(th * 3 + phase * 2) * (4 * contraction);
    ctx.lineTo(lx, ly);
  }
  ctx.closePath();

  const domeGrad = ctx.createRadialGradient(0, -bellRadius * 0.4, 10, 0, 0, bellRadius);
  domeGrad.addColorStop(0, `rgba(${pal.core[0]}, ${pal.core[1]}, ${pal.core[2]}, ${0.45 * alphaMult})`);
  domeGrad.addColorStop(0.7, `rgba(${pal.rim[0]}, ${pal.rim[1]}, ${pal.rim[2]}, ${0.18 * alphaMult})`);
  domeGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = domeGrad;
  ctx.fill();

  ctx.strokeStyle = `rgba(${pal.core[0]}, ${pal.core[1]}, ${pal.core[2]}, ${0.7 * alphaMult})`;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 3. Radial Bell Ribs & Rhopalia (Light Sensors)
  ctx.lineWidth = 1.0;
  for (let r = 1; r < 9; r++) {
    const frac = r / 9;
    const radAng = (frac - 0.5) * Math.PI * 0.85;
    ctx.strokeStyle = pal.glow + (0.22 + audio.mid * 0.25) * alphaMult + ')';
    ctx.beginPath();
    ctx.moveTo(0, -bellRadius * 0.7 * bellHScale);
    const cpx = Math.sin(radAng) * bellRadius * 0.55;
    const cpy = -bellRadius * 0.2 * bellHScale;
    const endX = Math.sin(radAng) * bellRadius * 0.92;
    const endY = (1 - Math.cos(radAng)) * 14;
    ctx.quadraticCurveTo(cpx, cpy, endX, endY);
    ctx.stroke();

    // Rhopalium node (glowing pearl at margin)
    ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * alphaMult})`;
    ctx.beginPath();
    ctx.arc(endX, endY, 1.6 + audio.treble * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Inner Gonad Clover / Horseshoe Organs (Classic glowing Aurelia motif)
  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = `rgba(${pal.core[0]}, ${pal.core[1]}, ${pal.core[2]}, ${0.85 * alphaMult})`;
  for (let g = 0; g < 4; g++) {
    const ga = (g / 4) * Math.PI * 2 + 0.39;
    const gx = Math.cos(ga) * (bellRadius * 0.28);
    const gy = -bellRadius * 0.35 * bellHScale + Math.sin(ga) * (bellRadius * 0.18);
    ctx.beginPath();
    ctx.arc(gx, gy, bellRadius * 0.11, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 5. Central Oral Arms (Gossamer Ruffles hanging in center)
  ctx.save();
  ctx.lineWidth = 1.4;
  for (let a = -2; a <= 2; a++) {
    if (a === 0) continue;
    ctx.strokeStyle = pal.glow + (0.45 * alphaMult) + ')';
    ctx.beginPath();
    ctx.moveTo(a * 8, 0);
    const armLen = bellRadius * 0.95;
    const s1 = Math.sin(t * 2.2 + a) * 14;
    const s2 = Math.cos(t * 1.8 + a * 2) * 20;
    ctx.bezierCurveTo(a * 14 + s1, armLen * 0.35, a * 6 - s2, armLen * 0.7, a * 12 + s1 * 0.5, armLen);
    ctx.stroke();
  }
  ctx.restore();

  // 6. Trailing Bioluminescent Tentacles
  const tentCount = room.state.tentacles.length;
  const span = bellRadius * 1.7;
  for (let i = 0; i < tentCount; i++) {
    const pts = room.state.tentacles[i];
    const txFrac = i / (tentCount - 1);
    const rootX = (txFrac - 0.5) * span;
    const rootY = 2 + Math.pow(Math.abs(txFrac - 0.5) * 2, 2) * -6;

    // Segment physics update only on primary pass to keep synced
    if (!isGhost) {
      pts[0].x = rootX;
      pts[0].y = rootY;
      for (let s = 1; s < pts.length; s++) {
        const segDist = (tentLen / pts.length) * (0.85 + contraction * 0.25);
        const wave = Math.sin(t * 2.5 + i * 0.45 + s * 0.5) * (3.5 + s * 0.9 + audio.bass * 4);
        const prev = pts[s - 1];
        const curr = pts[s];
        const targetX = prev.x + wave * dt * 8;
        const targetY = prev.y + segDist;
        curr.x += (targetX - curr.x) * 0.32;
        curr.y += (targetY - curr.y) * 0.32;
      }
    }

    // Draw tentacle thread with glowing beads
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let s = 1; s < pts.length; s++) {
      ctx.lineTo(pts[s].x, pts[s].y);
    }
    ctx.strokeStyle = pal.glow + (0.32 * alphaMult) + ')';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Light pulses drifting down tentacles
    const pulseIndex = Math.floor(((t * 3.5 + i * 0.6) % 1) * (pts.length - 1));
    const pNode = pts[pulseIndex];
    if (pNode) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * alphaMult})`;
      ctx.beginPath();
      ctx.arc(pNode.x, pNode.y, 1.4 + audio.treble * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 7. Audience Presence: room.people as orbiting bioluminescent sprites
  if (room.people && room.people.length > 0) {
    ctx.save();
    const pCount = Math.min(room.people.length, 24);
    for (let p = 0; p < pCount; p++) {
      const person = room.people[p];
      const pHue = person.hue ?? ((p * 47) % 360);
      const pAngle = t * 0.9 + (p * Math.PI * 2) / pCount;
      const pOrbitR = bellRadius * (1.15 + 0.35 * Math.sin(t * 1.5 + p));
      const px = Math.cos(pAngle) * pOrbitR;
      const py = -bellRadius * 0.3 + Math.sin(pAngle * 2) * (bellRadius * 0.45);

      ctx.fillStyle = `hsla(${pHue}, 90%, 75%, ${0.85 * alphaMult})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Soft trailing comet tail
      ctx.strokeStyle = `hsla(${pHue}, 80%, 65%, ${0.35 * alphaMult})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.sin(pAngle) * 14, py + Math.cos(pAngle * 2) * 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}

// --- Glass Pane: Pepper's Ghost Reflection Mechanics ---
// The illusion relies on viewing the figure reflected off a 45-degree angled glass pane.
// Uncoated glass produces a sharp first-surface reflection AND a faint shifted secondary internal reflection.
const paneTiltX = W * 0.035 * ghostDepth;
const paneTiltY = -H * 0.02 * ghostDepth;

// 1. Secondary offset ghost reflection (Internal reflection off back surface of glass)
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const secAlpha = 0.28 * (ghostDepth + 0.2);
drawJellyfish(jellyCenter.x + paneTiltX * 1.4, jellyCenter.y + paneTiltY * 1.4, 0.985, secAlpha, true);

// 2. Primary Ghost Image (Front surface specular reflection)
const priAlpha = 0.88 + audio.bass * 0.12;
drawJellyfish(jellyCenter.x, jellyCenter.y, 1.0, priAlpha, false);
ctx.restore();

// --- Angled Glass Pane Overlay (Edges, reflections, scratches & refraction sheen) ---
ctx.save();
ctx.globalCompositeOperation = 'screen';

// Diagonal sheen across the glass sheet (45-degree angle typical of Pepper's Ghost stage setup)
const glassSheen = ctx.createLinearGradient(0, H * 0.15, W, H * 0.85);
glassSheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
glassSheen.addColorStop(0.46, 'rgba(180, 220, 255, 0.015)');
glassSheen.addColorStop(0.5, 'rgba(230, 245, 255, ' + (0.05 + audio.treble * 0.04) + ')');
glassSheen.addColorStop(0.54, 'rgba(160, 210, 255, 0.015)');
glassSheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
ctx.fillStyle = glassSheen;
ctx.fillRect(0, 0, W, H);

// Glass bevel or mounting clamp lines depending on setting
if (glass === 'Beveled Glass') {
  ctx.strokeStyle = 'rgba(220, 240, 255, 0.12)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(W * 0.08, H * 0.05);
  ctx.lineTo(W * 0.92, H * 0.95);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120, 180, 240, 0.08)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(W * 0.08 + 6, H * 0.05);
  ctx.lineTo(W * 0.92 + 6, H * 0.95);
  ctx.stroke();
} else if (glass === 'Dusty Victorian') {
  // Micro hairline scratches catching ambient light
  ctx.strokeStyle = 'rgba(210, 230, 255, 0.04)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let s = 0; s < 12; s++) {
    const sx = (W * 0.2) + s * (W * 0.05);
    const sy = (H * 0.3) + Math.sin(s * 3.7) * (H * 0.25);
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 35 + s * 4, sy - 15 + s * 2);
  }
  ctx.stroke();
}

// Frame border: Proscenium dark theatre vignette mask to sink deep into wall
const vignette = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.42, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
vignette.addColorStop(0, 'rgba(0,0,0,0)');
vignette.addColorStop(0.7, 'rgba(3,3,7,0.4)');
vignette.addColorStop(1, 'rgba(2,2,4,0.96)');
ctx.fillStyle = vignette;
ctx.fillRect(0, 0, W, H);

ctx.restore();
ctx.restore();