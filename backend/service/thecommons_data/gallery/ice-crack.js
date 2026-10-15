const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- Persistent demo state ---
room.state.init ??= false;
if (!room.state.init) {
  room.state.init = true;
  // Fixed column pool for methane bubbles
  room.state.columns = [];
  for (let i = 0; i < 60; i++) {
    const col = {
      x: Math.random(),
      y: Math.random(),
      depth: 0.2 + Math.random() * 0.8,
      bubbles: []
    };
    const count = 5 + Math.floor(Math.random() * 9);
    let z = 0.05;
    for (let b = 0; b < count; b++) {
      z += 0.06 + Math.random() * 0.08;
      col.bubbles.push({
        z: z,
        r: 3 + Math.random() * 12,
        ox: (Math.random() - 0.5) * 8,
        oy: (Math.random() - 0.5) * 8,
        phase: Math.random() * Math.PI * 2
      });
    }
    room.state.columns.push(col);
  }
  // Crack fracture tree buffer
  room.state.cracks = [];
  room.state.lastBeatTime = 0;
  room.state.shockwave = 0;
  // Perimeter frost spicules (precomputed directions)
  room.state.frostSpikes = [];
  for (let i = 0; i < 120; i++) {
    const ang = (i / 120) * Math.PI * 2;
    room.state.frostSpikes.push({
      ang: ang,
      len: 25 + Math.random() * 70,
      w: 0.8 + Math.random() * 2.2,
      var1: Math.random(),
      var2: Math.random()
    });
  }
}

// Palettes
const PALETTES = {
  'Teal Abyss':      { deep: '#02080d', mid: '#062635', glow: '#38e4d8', rim: '#8affff' },
  'Midnight Indigo': { deep: '#030311', mid: '#0c1236', glow: '#5375fe', rim: '#b5c6ff' },
  'Emerald Trench':  { deep: '#010c08', mid: '#05291b', glow: '#2bfca3', rim: '#9effd7' },
  'Glacial Violet':  { deep: '#080210', mid: '#200c38', glow: '#c754fe', rim: '#f5c6ff' }
};
const pal = PALETTES[getVar('depth_tint')] || PALETTES['Teal Abyss'];
const crackEnergy = getVar('crack_energy') ?? 1.0;
const colCount = Math.min(getVar('bubble_density') ?? 35, 60);
const frostEnabled = getVar('bloom_frost') ?? true;
const snapStyle = getVar('snap_style') || 'Electric Snap';

// --- Audio Reactivity & Crack Spawning ---
const bass = audio.bass || 0;
const mid = audio.mid || 0;
const treble = audio.treble || 0;
const isBeat = (audio.beat && (t - room.state.lastBeatTime > 0.35)) || (t - room.state.lastBeatTime > (3.5 / crackEnergy));

if (isBeat) {
  room.state.lastBeatTime = t;
  room.state.shockwave = 1.0;
  // Spawn dynamic fracture
  const startX = (0.2 + Math.random() * 0.6) * W;
  const startY = (0.2 + Math.random() * 0.6) * H;
  const branches = snapStyle === 'Glass Shatter' ? 6 : (snapStyle === 'Glacial Drift' ? 2 : 4);
  
  for (let b = 0; b < branches; b++) {
    const baseAng = (b / branches) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    let currX = startX;
    let currY = startY;
    const segCount = snapStyle === 'Glass Shatter' ? 8 : 14;
    const pts = [{ x: currX, y: currY }];
    let ang = baseAng;
    
    for (let s = 0; s < segCount; s++) {
      ang += (Math.random() - 0.5) * 0.7;
      const segLen = (18 + Math.random() * 32) * (1 + bass * 0.5);
      currX += Math.cos(ang) * segLen;
      currY += Math.sin(ang) * segLen;
      pts.push({ x: currX, y: currY });
    }
    
    room.state.cracks.push({
      pts: pts,
      birth: t,
      life: snapStyle === 'Glacial Drift' ? 4.5 : 2.0,
      width: (snapStyle === 'Glass Shatter' ? 1.5 : 2.5) * (1 + bass)
    });
  }
  // Limit max cracks in memory
  if (room.state.cracks.length > 32) {
    room.state.cracks.splice(0, room.state.cracks.length - 32);
  }
}

// Decay shockwave
room.state.shockwave = Math.max(0, room.state.shockwave - dt * 2.5);

// --- Canvas Clearing with Ambient Black Depth ---
ctx.save();
ctx.fillStyle = pal.deep;
ctx.fillRect(0, 0, W, H);

// Under-ice deep radiant pool
const centerGrad = ctx.createRadialGradient(
  W * 0.5, H * 0.5, 30,
  W * 0.5, H * 0.5, Math.max(W, H) * 0.75
);
centerGrad.addColorStop(0, pal.mid);
centerGrad.addColorStop(0.5 + bass * 0.15, pal.deep);
centerGrad.addColorStop(1, '#000000');
ctx.fillStyle = centerGrad;
ctx.fillRect(0, 0, W, H);

// --- Render Methane Bubble Columns (stacked 3D disc illusion) ---
const cx = W * 0.5;
const cy = H * 0.5;

for (let i = 0; i < colCount; i++) {
  const col = room.state.columns[i];
  const rootX = col.x * W;
  const rootY = col.y * H;
  
  // Parallax shift toward/away from center based on bass and gentle wave
  const drift = Math.sin(t * 0.4 + col.depth * 10) * 8;
  
  for (let b = col.bubbles.length - 1; b >= 0; b--) {
    const bub = col.bubbles[b];
    // Visual depth mapping (z: 0.1 near, 1.0 deep down)
    const zScale = 1.0 / (1.0 + bub.z * 1.8);
    const bx = rootX + bub.ox * zScale + (rootX - cx) * (bub.z * 0.15) + drift * bub.z;
    const by = rootY + bub.oy * zScale + (rootY - cy) * (bub.z * 0.15);
    const rad = bub.r * zScale * (1.0 + Math.sin(t * 1.2 + bub.phase) * 0.08);
    
    // Ambient glow underneath deep bubbles
    const alpha = Math.max(0.1, (1.0 - bub.z * 0.75)) * (0.5 + mid * 0.5);
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(1, rad), 0, Math.PI * 2);
    
    // Rim & body styling of trapped frozen methane
    const bGrad = ctx.createRadialGradient(bx - rad * 0.3, by - rad * 0.3, rad * 0.1, bx, by, rad);
    bGrad.addColorStop(0, '#ffffff');
    bGrad.addColorStop(0.4, pal.glow);
    bGrad.addColorStop(0.85, 'rgba(10, 30, 45, 0.6)');
    bGrad.addColorStop(1, 'rgba(0, 5, 10, 0.0)');
    
    ctx.fillStyle = bGrad;
    ctx.globalAlpha = alpha;
    ctx.fill();
    
    // Sharp frozen bubble edge ring
    ctx.lineWidth = Math.max(0.6, 1.2 * zScale);
    ctx.strokeStyle = pal.rim;
    ctx.globalAlpha = alpha * 0.85;
    ctx.stroke();
    ctx.restore();
  }
}

// --- Connected People as deep trapped wisps / focal anchors ---
if (room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let p = 0; p < room.people.length; p++) {
    const person = room.people[p];
    const angle = (p / room.people.length) * Math.PI * 2 + t * 0.08;
    const radius = Math.min(W, H) * 0.32 + Math.sin(t + p) * 20;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    const phue = person.hue ?? 180;
    
    const wispGrad = ctx.createRadialGradient(px, py, 2, px, py, 35 + bass * 25);
    wispGrad.addColorStop(0, `hsla(${phue}, 100%, 85%, 0.8)`);
    wispGrad.addColorStop(0.4, `hsla(${phue}, 80%, 45%, 0.3)`);
    wispGrad.addColorStop(1, 'transparent');
    
    ctx.fillStyle = wispGrad;
    ctx.beginPath();
    ctx.arc(px, py, 40 + bass * 25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Racing Fracture Lines (Ice Cracks) ---
ctx.save();
for (let i = room.state.cracks.length - 1; i >= 0; i--) {
  const crk = room.state.cracks[i];
  const age = t - crk.birth;
  if (age >= crk.life) {
    room.state.cracks.splice(i, 1);
    continue;
  }
  
  // Dynamic racing speed forward
  const progress = Math.min(1.0, age * (snapStyle === 'Electric Snap' ? 8.0 : 4.0));
  const maxVisibleIndex = Math.floor(progress * (crk.pts.length - 1));
  const fade = 1.0 - (age / crk.life);
  
  if (maxVisibleIndex < 1) continue;
  
  // 1. Broad soft neon scatter under ice
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = pal.glow;
  ctx.lineWidth = crk.width * 3.5 * fade;
  ctx.globalAlpha = fade * 0.45;
  ctx.beginPath();
  ctx.moveTo(crk.pts[0].x, crk.pts[0].y);
  for (let j = 1; j <= maxVisibleIndex; j++) {
    ctx.lineTo(crk.pts[j].x, crk.pts[j].y);
  }
  ctx.stroke();
  ctx.restore();

  // 2. Razor white fracture core
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(0.8, crk.width * 0.9 * fade);
  ctx.globalAlpha = Math.min(1.0, fade * 1.5);
  ctx.beginPath();
  ctx.moveTo(crk.pts[0].x, crk.pts[0].y);
  for (let j = 1; j <= maxVisibleIndex; j++) {
    ctx.lineTo(crk.pts[j].x, crk.pts[j].y);
  }
  ctx.stroke();

  // Tip snap flash
  if (progress < 0.98) {
    const tip = crk.pts[maxVisibleIndex];
    const tipGlow = ctx.createRadialGradient(tip.x, tip.y, 1, tip.x, tip.y, 16);
    tipGlow.addColorStop(0, '#ffffff');
    tipGlow.addColorStop(0.5, pal.rim);
    tipGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = tipGlow;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
ctx.restore();

// --- Shockwave refraction ring on hard snaps ---
if (room.state.shockwave > 0.02) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const sRad = (1.0 - room.state.shockwave) * Math.max(W, H) * 0.6;
  ctx.lineWidth = 3.0 * room.state.shockwave;
  ctx.strokeStyle = pal.rim;
  ctx.globalAlpha = room.state.shockwave * 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, sRad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// --- Frost Blooming at Lake Edges ---
if (frostEnabled) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  
  const halfW = W * 0.5;
  const halfH = H * 0.5;
  const perimeterDist = Math.hypot(halfW, halfH);
  const spikes = room.state.frostSpikes;
  const count = spikes.length;
  
  // Treble & mid excite needle twinkle
  const frostPulse = 1.0 + treble * 0.4 + Math.sin(t * 1.8) * 0.08;
  
  ctx.strokeStyle = pal.rim;
  ctx.lineCap = 'round';
  
  for (let k = 0; k < count; k++) {
    const sp = spikes[k];
    const cosA = Math.cos(sp.ang);
    const sinA = Math.sin(sp.ang);
    
    // Map to frame boundary
    let bx, by;
    const tanA = Math.tan(sp.ang);
    if (Math.abs(cosA) * halfH > Math.abs(sinA) * halfW) {
      bx = cosA > 0 ? W : 0;
      by = cy + (cosA > 0 ? 1 : -1) * halfW * tanA;
    } else {
      by = sinA > 0 ? H : 0;
      bx = cx + (sinA > 0 ? 1 : -1) * (halfH / tanA);
    }
    
    const inwardLen = sp.len * frostPulse;
    const destX = bx - cosA * inwardLen;
    const destY = by - sinA * inwardLen;
    
    ctx.lineWidth = sp.w;
    ctx.globalAlpha = 0.35 + sp.var1 * 0.45;
    
    // Main crystalline spine
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(destX, destY);
    
    // Crystalline dendritic side-barbs
    const barbLen = inwardLen * 0.35;
    const midX = bx - cosA * inwardLen * 0.55;
    const midY = by - sinA * inwardLen * 0.55;
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX - Math.cos(sp.ang + 0.65) * barbLen, midY - Math.sin(sp.ang + 0.65) * barbLen);
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX - Math.cos(sp.ang - 0.65) * barbLen, midY - Math.sin(sp.ang - 0.65) * barbLen);
    
    ctx.stroke();
  }
  
  // Dark cold edge vignette to guarantee deep contrast & wall presence
  const edgeVignette = ctx.createRadialGradient(cx, cy, perimeterDist * 0.45, cx, cy, perimeterDist);
  edgeVignette.addColorStop(0, 'transparent');
  edgeVignette.addColorStop(0.7, 'rgba(2, 6, 12, 0.4)');
  edgeVignette.addColorStop(1, 'rgba(0, 1, 3, 0.9)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = edgeVignette;
  ctx.fillRect(0, 0, W, H);
  
  ctx.restore();
}

ctx.restore();