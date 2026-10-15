ctx.save();
const W = frame.width, H = frame.height;
const cx = W * 0.5, cy = H * 0.5;
const minDim = Math.min(W, H);
const maxR = minDim * 0.46;

room.state.breath ??= 0;
room.state.audioBass ??= 0;
room.state.audioLevel ??= 0;

const breathRate = getVar('breathing_rate') ?? 0.6;
const sym = Math.floor(getVar('symmetry') ?? 6);
const showHalo = getVar('mystic_halo') ?? true;
const showDiagram = getVar('diagram_lines') ?? true;
const geomMode = getVar('geometry') ?? 'botanical_bloom';
const palMode = getVar('palette_mode') ?? 'ten_largest';

const dt = Math.min(frame.dt || 0.016, 0.05);
room.state.breath += dt * breathRate * (1 + (audio.bass || 0) * 0.8);
room.state.audioBass += ((audio.bass || 0) - room.state.audioBass) * 0.15;
room.state.audioLevel += ((audio.level || 0) - room.state.audioLevel) * 0.12;

const breath = room.state.breath;
const bass = room.state.audioBass;
const lvl = room.state.audioLevel;
const pulse = Math.sin(breath) * 0.06 + Math.sin(breath * 0.5) * 0.03 + bass * 0.12;

const palettes = {
  ten_largest: {
    bg: '#0c0b0e',
    halo: 'rgba(235, 172, 162, ',
    p1: 'rgba(238, 185, 180, ',
    p2: 'rgba(244, 219, 142, ',
    p3: 'rgba(152, 193, 196, ',
    p4: 'rgba(206, 172, 211, ',
    p5: 'rgba(224, 114, 85, ',
    accent: '#f2ecd9'
  },
  primordial_duality: {
    bg: '#08080a',
    halo: 'rgba(120, 150, 190, ',
    p1: 'rgba(240, 240, 245, ',
    p2: 'rgba(25, 30, 42, ',
    p3: 'rgba(214, 182, 110, ',
    p4: 'rgba(178, 76, 60, ',
    p5: 'rgba(74, 110, 155, ',
    accent: '#f8f4eb'
  },
  altar_gold: {
    bg: '#0a0907',
    halo: 'rgba(245, 190, 80, ',
    p1: 'rgba(248, 222, 126, ',
    p2: 'rgba(218, 145, 62, ',
    p3: 'rgba(242, 184, 180, ',
    p4: 'rgba(188, 143, 143, ',
    p5: 'rgba(110, 145, 130, ',
    accent: '#fff9e6'
  }
};
const pal = palettes[palMode] || palettes.ten_largest;

ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

if (showHalo) {
  const haloGrad = ctx.createRadialGradient(cx, cy, maxR * 0.1, cx, cy, maxR * 1.35);
  haloGrad.addColorStop(0, pal.halo + (0.28 + bass * 0.25) + ')');
  haloGrad.addColorStop(0.45, pal.halo + (0.10 + lvl * 0.15) + ')');
  haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 1.35, 0, Math.PI * 2);
  ctx.fill();
}

if (showDiagram) {
  ctx.save();
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.22 + bass * 0.18;
  
  ctx.beginPath();
  ctx.moveTo(cx - maxR * 1.15, cy);
  ctx.lineTo(cx + maxR * 1.15, cy);
  ctx.moveTo(cx, cy - maxR * 1.15);
  ctx.lineTo(cx, cy + maxR * 1.15);
  ctx.stroke();

  for (let i = 1; i <= 4; i++) {
    const r = (maxR * i) / 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.setLineDash([3, 6]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const ticks = sym * 4;
  const tR1 = maxR * 1.02;
  const tR2 = maxR * 1.05;
  ctx.beginPath();
  for (let i = 0; i < ticks; i++) {
    const th = (i / ticks) * Math.PI * 2 + frame.t * 0.02;
    const cosT = Math.cos(th), sinT = Math.sin(th);
    ctx.moveTo(cx + cosT * tR1, cy + sinT * tR1);
    ctx.lineTo(cx + cosT * tR2, cy + sinT * tR2);
  }
  ctx.stroke();
  ctx.restore();
}

ctx.save();
ctx.translate(cx, cy);

if (geomMode === 'botanical_bloom') {
  const layers = 5;
  for (let l = layers; l >= 1; l--) {
    const layerFrac = l / layers;
    const rad = maxR * (0.35 + layerFrac * 0.65) * (1 + pulse * 0.4);
    const rot = (breath * 0.15 * (l % 2 === 0 ? 1 : -1)) + (l * 0.35);
    const col = l === 5 ? pal.p5 : l === 4 ? pal.p4 : l === 3 ? pal.p3 : l === 2 ? pal.p2 : pal.p1;
    
    ctx.save();
    ctx.rotate(rot);
    ctx.fillStyle = col + (0.55 - l * 0.06) + ')';
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.2;

    for (let s = 0; s < sym; s++) {
      const ang = (s / sym) * Math.PI * 2;
      ctx.save();
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const cp1x = rad * 0.35, cp1y = -rad * 0.22;
      const cp2x = rad * 0.75, cp2y = -rad * 0.35;
      const ptx = rad, pty = 0;
      const cp3x = rad * 0.75, cp3y = rad * 0.35;
      const cp4x = rad * 0.35, cp4y = rad * 0.22;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ptx, pty);
      ctx.bezierCurveTo(cp3x, cp3y, cp4x, cp4y, 0, 0);
      ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
} else if (geomMode === 'spiral_evolution') {
  const arms = Math.min(sym, 4);
  const steps = 90;
  for (let a = 0; a < arms; a++) {
    const baseAng = (a / arms) * Math.PI * 2 + breath * 0.12;
    ctx.save();
    ctx.rotate(baseAng);
    const col = a % 2 === 0 ? pal.p1 : pal.p3;
    
    for (let i = 0; i < steps; i++) {
      const tNorm = i / steps;
      const spiralR = Math.pow(tNorm, 1.3) * maxR * (0.95 + pulse * 0.3);
      const spiralTh = tNorm * Math.PI * 4.5;
      const px = Math.cos(spiralTh) * spiralR;
      const py = Math.sin(spiralTh) * spiralR;
      const nodeR = (1.8 + tNorm * 11) * (1 + bass * 0.3);
      
      ctx.beginPath();
      ctx.arc(px, py, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = col + (0.2 + tNorm * 0.6) + ')';
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  }
} else {
  const rings = 12;
  for (let i = rings; i >= 1; i--) {
    const frac = i / rings;
    const r = maxR * frac * (1 + pulse * 0.5 * (1 - frac));
    const wobble = Math.sin(breath * 1.5 + i * 0.8) * 0.08;
    const col = (i % 3 === 0) ? pal.p1 : (i % 3 === 1) ? pal.p2 : pal.p4;
    
    ctx.save();
    ctx.scale(1 + wobble, 1 - wobble * 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = col + (0.25 + (rings - i) * 0.04) + ')';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = (i % 2 === 0) ? pal.accent : pal.p5 + '0.9)';
    ctx.stroke();
    ctx.restore();
  }
}

const coreR = maxR * 0.22 * (1 + pulse * 0.6);
const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
coreGrad.addColorStop(0, pal.accent);
coreGrad.addColorStop(0.4, pal.p2 + '0.95)');
coreGrad.addColorStop(0.85, pal.p5 + '0.85)');
coreGrad.addColorStop(1, 'rgba(0,0,0,0.1)');

ctx.beginPath();
ctx.arc(0, 0, coreR, 0, Math.PI * 2);
ctx.fillStyle = coreGrad;
ctx.fill();
ctx.lineWidth = 1.8;
ctx.strokeStyle = pal.accent;
ctx.stroke();

const people = room.people || [];
if (people.length > 0) {
  const orbitR = maxR * 1.08 * (1 + pulse * 0.15);
  ctx.save();
  people.forEach((p, idx) => {
    const pAng = (idx / people.length) * Math.PI * 2 + breath * 0.08;
    const px = Math.cos(pAng) * orbitR;
    const py = Math.sin(pAng) * orbitR;
    const hue = (p.hue !== undefined && !isNaN(p.hue)) ? p.hue : (idx * 37) % 360;
    const pSize = 5 + (bass * 4);
    
    ctx.beginPath();
    ctx.arc(px, py, pSize + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(' + hue + ', 80%, 65%, 0.85)';
    ctx.fill();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, pSize * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = pal.bg;
    ctx.fill();
  });
  ctx.restore();
}

ctx.restore();
ctx.restore();