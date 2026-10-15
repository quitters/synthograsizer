ctx.save();

room.state.init ??= false;
if (!room.state.init) {
  room.state.rot = 0;
  room.state.phase = 0;
  room.state.prevT = frame.t;
  room.state.flashes = [];
  room.state.init = true;
}

const dt = Math.min(frame.dt || 0.016, 0.05);
const drumSpeed = getVar('drum_speed') ?? 1.2;
const figureType = getVar('figure') ?? 'horse';
const palChoice = getVar('palette_style') ?? 'amber_lantern';
const slitN = Math.round(getVar('slit_count') ?? 16);
const strobeMode = getVar('strobe_sync') ?? 'sync_lock';
const phosphor = getVar('phosphor_glow') ?? true;

const palettes = {
  amber_lantern: { primary: '#ffaa33', secondary: '#ffdd77', rim: '#ff5500', shadow: '#1c0e04', glow: 'rgba(255,160,40,' },
  neon_cyan:     { primary: '#00e5ff', secondary: '#80ffff', rim: '#0077ff', shadow: '#031422', glow: 'rgba(0,229,255,' },
  crimson_fire:  { primary: '#ff3344', secondary: '#ffa066', rim: '#990022', shadow: '#1a0307', glow: 'rgba(255,51,68,' },
  monochrome_silver: { primary: '#d8e6f0', secondary: '#ffffff', rim: '#7b8f9e', shadow: '#0c1014', glow: 'rgba(220,235,245,' }
};
const pal = palettes[palChoice] ?? palettes.amber_lantern;

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.52;
const minDim = Math.min(W, H);
const R = minDim * 0.44;
const rY = R * 0.28;
const drumH = minDim * 0.42;

// Motion integration
const speedMult = drumSpeed * (1.0 + (audio.bass || 0) * 0.45);
room.state.rot += dt * speedMult * 2.2;
let framePhase = room.state.rot * (slitN / (Math.PI * 2));
if (strobeMode === 'sync_lock') {
  framePhase = Math.floor(framePhase) + Math.pow(framePhase % 1.0, 4.0) * 0.15;
} else if (strobeMode === 'audio_strobe') {
  if (audio.beat) room.state.phase += 1.0;
  framePhase = room.state.phase + (room.state.rot * 0.2);
}

// Background clear with dark atmospheric haze
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = phosphor ? 'rgba(5, 5, 8, 0.42)' : '#050508';
ctx.fillRect(0, 0, W, H);

// Volumetric backlight spill
const auraGrad = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.5);
auraGrad.addColorStop(0, pal.glow + (0.18 + (audio.mid || 0) * 0.15) + ')');
auraGrad.addColorStop(0.5, pal.glow + '0.04)');
auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = auraGrad;
ctx.fillRect(0, 0, W, H);

// Draw decorative pedestal stand
ctx.beginPath();
ctx.moveTo(cx - R * 0.6, cy + drumH * 0.85);
ctx.bezierCurveTo(cx - R * 0.2, cy + drumH * 0.7, cx - R * 0.08, cy + drumH * 0.55, cx, cy + drumH * 0.5);
ctx.bezierCurveTo(cx + R * 0.08, cy + drumH * 0.55, cx + R * 0.2, cy + drumH * 0.7, cx + R * 0.6, cy + drumH * 0.85);
ctx.lineTo(cx - R * 0.6, cy + drumH * 0.85);
ctx.fillStyle = '#0a0d12';
ctx.fill();
ctx.strokeStyle = '#1b222c';
ctx.lineWidth = 2;
ctx.stroke();

// BACK HALF of Zoetrope drum (slits and rim behind the subject)
ctx.save();
for (let i = 0; i < slitN; i++) {
  const ang = room.state.rot + (i * Math.PI * 2) / slitN;
  const sinA = Math.sin(ang);
  const cosA = Math.cos(ang);
  if (sinA < 0) {
    const x = cx + cosA * R;
    const yTop = cy - drumH * 0.5 + sinA * rY;
    const yBot = cy + drumH * 0.5 + sinA * rY;
    const slatW = (R / slitN) * 1.8 * (0.65 - sinA * 0.25);
    
    ctx.fillStyle = '#0c0e12';
    ctx.fillRect(x - slatW * 0.5, yTop, slatW, yBot - yTop);
    
    // Rim indicator inside
    ctx.strokeStyle = '#1e2430';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - slatW * 0.5, yTop, slatW, yBot - yTop);
  }
}
ctx.restore();

// CENTRAL ILLUMINATED FIGURE
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const figScale = (R * 0.42) * (1.0 + (audio.bass || 0) * 0.12);
const animF = (framePhase % 12 + 12) % 12;
const cycleT = (animF / 12) * Math.PI * 2;

// Strobe intensity calculation
const slitAlignment = Math.abs(Math.sin(room.state.rot * slitN * 0.5));
const strobeFlash = strobeMode === 'sync_lock' ? Math.pow(slitAlignment, 8) : 0.65;
const figAlpha = 0.55 + strobeFlash * 0.45 + (audio.treble || 0) * 0.2;

ctx.translate(cx, cy + rY * 0.25);

// Glowing core behind figure
const coreG = ctx.createRadialGradient(0, 0, 5, 0, 0, figScale * 1.2);
coreG.addColorStop(0, pal.glow + (0.5 * figAlpha) + ')');
coreG.addColorStop(0.6, pal.glow + (0.12 * figAlpha) + ')');
coreG.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = coreG;
ctx.beginPath();
ctx.arc(0, 0, figScale * 1.2, 0, Math.PI * 2);
ctx.fill();

ctx.strokeStyle = pal.primary;
ctx.fillStyle = pal.secondary;
ctx.lineWidth = Math.max(2, minDim * 0.005);
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

if (figureType === 'horse') {
  // Galloping horse kinematic model (12-phase gallop)
  const bob = Math.sin(cycleT * 2) * (figScale * 0.09);
  const spineAngle = Math.sin(cycleT) * 0.18;
  
  ctx.save();
  ctx.translate(0, bob);
  ctx.rotate(spineAngle);

  // Body torso
  ctx.beginPath();
  ctx.ellipse(0, 0, figScale * 0.42, figScale * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Neck & Head
  const neckX = figScale * 0.35;
  const neckY = -figScale * 0.15 + Math.sin(cycleT) * (figScale * 0.06);
  const headX = neckX + figScale * 0.18;
  const headY = neckY - figScale * 0.28;
  ctx.beginPath();
  ctx.moveTo(neckX - figScale * 0.1, 0);
  ctx.quadraticCurveTo(neckX, neckY, headX, headY);
  ctx.lineTo(headX + figScale * 0.14, headY + figScale * 0.05);
  ctx.lineTo(neckX + figScale * 0.05, figScale * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Four legs (pairs with realistic gallop phase shifts)
  const leg = (rootX, rootY, phaseOffset, isHind) => {
    const p = cycleT + phaseOffset;
    const upperAngle = Math.sin(p) * 0.7 + (isHind ? 0.2 : -0.2);
    const l1 = figScale * 0.32;
    const l2 = figScale * 0.30;
    const kx = rootX + Math.sin(upperAngle) * l1;
    const ky = rootY + Math.cos(upperAngle) * l1;
    const lowerAngle = upperAngle + Math.sin(p + 0.8) * 0.8 + (isHind ? -0.5 : 0.6);
    const hx = kx + Math.sin(lowerAngle) * l2;
    const hy = ky + Math.cos(lowerAngle) * l2;
    
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.lineTo(kx, ky);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    
    // Hoof bright spark
    ctx.beginPath();
    ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  };

  leg(-figScale * 0.28, figScale * 0.05, 0.0, true);       // hind left
  leg(-figScale * 0.24, figScale * 0.05, 0.7, true);       // hind right
  leg(figScale * 0.24, figScale * 0.05, 3.14 + 0.2, false); // fore left
  leg(figScale * 0.28, figScale * 0.05, 3.14 + 0.9, false); // fore right

  // Flowing tail
  ctx.beginPath();
  ctx.moveTo(-figScale * 0.4, -figScale * 0.05);
  const tailWave = Math.sin(cycleT - 1.2) * (figScale * 0.22);
  ctx.quadraticCurveTo(-figScale * 0.65, tailWave * 0.5, -figScale * 0.75, tailWave);
  ctx.stroke();
  ctx.restore();

} else if (figureType === 'dancer') {
  // Leaping grand jeté & pirouette sequence
  const lift = Math.abs(Math.sin(cycleT)) * (figScale * 0.25);
  const lean = Math.cos(cycleT) * 0.15;
  
  ctx.save();
  ctx.translate(0, -lift);
  ctx.rotate(lean);

  // Head
  ctx.beginPath();
  ctx.arc(0, -figScale * 0.65, figScale * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Torso / dress
  ctx.beginPath();
  ctx.moveTo(0, -figScale * 0.55);
  ctx.lineTo(-figScale * 0.08, -figScale * 0.2);
  ctx.lineTo(figScale * 0.08, -figScale * 0.2);
  ctx.closePath();
  ctx.stroke();

  // Tutu / skirt flourish
  ctx.beginPath();
  ctx.ellipse(0, -figScale * 0.18, figScale * 0.28, figScale * 0.1 + (audio.mid || 0) * figScale * 0.08, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Arms in lyrical arch
  const armWave = Math.sin(cycleT) * 0.4;
  ctx.beginPath();
  ctx.moveTo(-figScale * 0.35, -figScale * (0.45 + armWave));
  ctx.quadraticCurveTo(0, -figScale * 0.75, figScale * 0.35, -figScale * (0.45 - armWave));
  ctx.stroke();

  // Legs stretching in leaps
  const split = Math.sin(cycleT);
  ctx.beginPath();
  ctx.moveTo(0, -figScale * 0.18);
  ctx.lineTo(-figScale * (0.35 + split * 0.25), figScale * (0.35 - split * 0.15));
  ctx.moveTo(0, -figScale * 0.18);
  ctx.lineTo(figScale * (0.35 - split * 0.25), figScale * (0.35 + split * 0.15));
  ctx.stroke();
  ctx.restore();

} else if (figureType === 'phoenix') {
  // Wing-flapping firebird
  const flap = Math.sin(cycleT * 1.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, figScale * 0.14, figScale * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings sweeping
  for (let s = -1; s <= 1; s += 2) {
    ctx.beginPath();
    ctx.moveTo(s * figScale * 0.06, -figScale * 0.1);
    const tipX = s * figScale * 0.65;
    const tipY = flap * figScale * 0.45 - figScale * 0.15;
    ctx.quadraticCurveTo(s * figScale * 0.3, -figScale * 0.45, tipX, tipY);
    ctx.quadraticCurveTo(s * figScale * 0.25, 0, 0, figScale * 0.1);
    ctx.stroke();
  }

  // Plumed tail ribbons
  for (let k = -2; k <= 2; k++) {
    const trailLag = cycleT - Math.abs(k) * 0.4;
    ctx.beginPath();
    ctx.moveTo(k * 4, figScale * 0.25);
    ctx.quadraticCurveTo(Math.sin(trailLag) * figScale * 0.3 + (k * 12), figScale * 0.55, Math.sin(trailLag * 1.2) * figScale * 0.4, figScale * 0.85);
    ctx.stroke();
  }
} else {
  // Mechanical clockwork automaton runner
  const bob = Math.cos(cycleT * 2) * (figScale * 0.06);
  ctx.save();
  ctx.translate(0, bob);
  
  // Gears inside chest
  ctx.beginPath();
  ctx.arc(0, -figScale * 0.15, figScale * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -figScale * 0.42, figScale * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Piston legs
  const p1 = cycleT;
  const p2 = cycleT + Math.PI;
  ctx.beginPath();
  ctx.moveTo(-figScale * 0.08, 0);
  ctx.lineTo(-figScale * 0.08 + Math.sin(p1) * figScale * 0.28, figScale * 0.25);
  ctx.lineTo(-figScale * 0.08 + Math.sin(p1 - 0.7) * figScale * 0.35, figScale * 0.48);
  ctx.moveTo(figScale * 0.08, 0);
  ctx.lineTo(figScale * 0.08 + Math.sin(p2) * figScale * 0.28, figScale * 0.25);
  ctx.lineTo(figScale * 0.08 + Math.sin(p2 - 0.7) * figScale * 0.35, figScale * 0.48);
  ctx.stroke();
  ctx.restore();
}

// Room occupants represented as spectator talismans orbiting inside the base
if (room.people && room.people.length > 0) {
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const angP = (i / room.people.length) * Math.PI * 2 + room.state.rot * 0.3;
    const px = Math.cos(angP) * (figScale * 0.85);
    const py = Math.sin(angP) * (figScale * 0.35) + figScale * 0.45;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.fill();
  }
}
ctx.restore();

// FRONT HALF of Zoetrope drum (slits, front brass rim and stenciled cuts)
ctx.save();
for (let i = 0; i < slitN; i++) {
  const ang = room.state.rot + (i * Math.PI * 2) / slitN;
  const sinA = Math.sin(ang);
  const cosA = Math.cos(ang);
  
  if (sinA >= 0) {
    const x = cx + cosA * R;
    const yTop = cy - drumH * 0.5 + sinA * rY;
    const yBot = cy + drumH * 0.5 + sinA * rY;
    const slitWidth = (R / slitN) * 0.35;
    const slatWidth = (R / slitN) * 2.1 * (0.8 + sinA * 0.25);

    // Dark brass slat
    const slatGrad = ctx.createLinearGradient(x - slatWidth * 0.5, 0, x + slatWidth * 0.5, 0);
    slatGrad.addColorStop(0, '#0a0d11');
    slatGrad.addColorStop(0.5, '#171e27');
    slatGrad.addColorStop(1, '#050709');
    ctx.fillStyle = slatGrad;
    ctx.fillRect(x - slatWidth * 0.5, yTop, slatWidth, yBot - yTop);

    // Metallic highlight on edges
    ctx.strokeStyle = '#28323f';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - slatWidth * 0.5, yTop, slatWidth, yBot - yTop);

    // Projected light shaft beaming outward through slit opening
    const slitX = x + (slatWidth * 0.5) + (slitWidth * 0.5);
    const centerDist = Math.abs(cosA);
    const beamA = (1.0 - centerDist) * 0.35 * (0.4 + (audio.bass || 0) * 0.6);
    
    if (beamA > 0.03) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beamGrad = ctx.createRadialGradient(slitX, cy, 2, slitX + cosA * 120, cy + sinA * 70, R * 0.7);
      beamGrad.addColorStop(0, pal.glow + beamA + ')');
      beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(slitX - 2, yTop + drumH * 0.15);
      ctx.lineTo(slitX + 2, yTop + drumH * 0.15);
      ctx.lineTo(slitX + cosA * (R * 0.45), yBot + drumH * 0.2);
      ctx.lineTo(slitX - cosA * (R * 0.1), yBot + drumH * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// Top and bottom metallic rims
ctx.lineWidth = 4;
ctx.strokeStyle = '#2a3545';
ctx.beginPath();
ctx.ellipse(cx, cy - drumH * 0.5, R, rY, 0, 0, Math.PI * 2);
ctx.stroke();

ctx.strokeStyle = '#151b22';
ctx.beginPath();
ctx.ellipse(cx, cy + drumH * 0.5, R, rY, 0, 0, Math.PI * 2);
ctx.stroke();

// Vignette to frame the device on the dark gallery wall
const vig = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, Math.max(W, H) * 0.72);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, '#020305');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();
ctx.restore();