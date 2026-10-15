ctx.save();

const gridOrder = getVar('grid_order') ?? 0.7;
const density = getVar('tile_density') ?? 18;
const driftSpeed = getVar('motion_drift') ?? 0.8;
const paletteName = getVar('palette') ?? 'byzantine';
const shape = getVar('tile_shape') ?? 'square';
const showGrout = getVar('show_grout') ?? true;

// State setup for smooth shockwave ripple on beats
room.state.shockwaves ??= [];
if (audio.beat) {
  room.state.shockwaves.push({ t0: frame.t, x: frame.width * 0.5, y: frame.height * 0.5 });
  if (room.state.shockwaves.length > 8) room.state.shockwaves.shift();
}
// Prune old ripples
room.state.shockwaves = room.state.shockwaves.filter(s => (frame.t - s.t0) < 2.5);

// Background fill
const bgColors = {
  byzantine: '#0c0a10',
  mediterranean: '#06131d',
  terracotta: '#1a100a',
  neon_synth: '#080512'
};
ctx.fillStyle = bgColors[paletteName] ?? '#0c0a10';
ctx.fillRect(0, 0, frame.width, frame.height);

// Grid layout math
const cols = Math.max(6, Math.round(density));
const tileSize = frame.width / cols;
const rows = Math.ceil(frame.height / tileSize) + 1;

// Color generator
const getColor = (c, r, seed) => {
  const n = (Math.sin(c * 12.9898 + r * 78.233 + seed) * 43758.5453) % 1;
  const val = Math.abs(n);
  const bassLight = audio.bass * 18;
  const midLight = audio.mid * 12;

  if (paletteName === 'mediterranean') {
    if (val < 0.35) return `hsl(${190 + val * 40}, 85%, ${40 + bassLight}%)`;
    if (val < 0.65) return `hsl(${210 + val * 30}, 80%, ${52 + midLight}%)`;
    if (val < 0.85) return `hsl(${170 + val * 30}, 75%, 48%)`;
    return `hsl(24, 75%, ${55 + bassLight}%)`; // terracotta accent
  } else if (paletteName === 'terracotta') {
    if (val < 0.35) return `hsl(18, 70%, ${38 + bassLight}%)`;
    if (val < 0.65) return `hsl(30, 65%, ${48 + midLight}%)`;
    if (val < 0.85) return `hsl(42, 70%, 58%)`;
    return `hsl(95, 30%, ${32 + midLight}%)`; // olive accent
  } else if (paletteName === 'neon_synth') {
    if (val < 0.35) return `hsl(${280 + val * 40}, 95%, ${50 + bassLight}%)`;
    if (val < 0.70) return `hsl(${180 + val * 30}, 90%, ${48 + midLight}%)`;
    return `hsl(${330 + val * 30}, 95%, 55%)`;
  } else {
    // byzantine
    if (val < 0.40) return `hsl(${42 + val * 12}, 85%, ${50 + bassLight}%)`; // gold
    if (val < 0.70) return `hsl(${225 + val * 20}, 70%, ${40 + midLight}%)`; // deep lapis
    if (val < 0.88) return `hsl(${280 + val * 25}, 65%, 34%)`; // imperial purple
    return `hsl(4, 75%, ${46 + bassLight}%)`; // vermilion
  }
};

const peopleList = room.people || [];
const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const maxDist = Math.hypot(cx, cy);
const t = frame.t * driftSpeed;

// Iterate and render mosaic tiles
for (let r = -1; r <= rows; r++) {
  for (let c = -1; c <= cols; c++) {
    const gx = (c + 0.5) * tileSize;
    const gy = (r + 0.5) * tileSize;

    // Autonomous organic flow offset
    const flowAngle = Math.sin(r * 0.4 + t * 0.8) + Math.cos(c * 0.4 - t * 0.6);
    const floatAmp = tileSize * 1.8;
    const fx = gx + Math.cos(flowAngle * Math.PI) * floatAmp;
    const fy = gy + Math.sin(flowAngle * Math.PI) * floatAmp;

    // Interpolate between grid and float based on gridOrder
    let px = gx * gridOrder + fx * (1 - gridOrder);
    let py = gy * gridOrder + fy * (1 - gridOrder);

    // Shockwave push from beat center
    for (let i = 0; i < room.state.shockwaves.length; i++) {
      const sw = room.state.shockwaves[i];
      const age = frame.t - sw.t0;
      const waveR = age * (frame.width * 0.6);
      const d = Math.hypot(px - sw.x, py - sw.y);
      const diff = Math.abs(d - waveR);
      if (diff < tileSize * 3) {
        const push = Math.sin((1 - diff / (tileSize * 3)) * Math.PI) * (1 - age / 2.5) * (tileSize * 0.6);
        const angle = Math.atan2(py - sw.y, px - sw.x);
        px += Math.cos(angle) * push;
        py += Math.sin(angle) * push;
      }
    }

    // Rotation
    const floatRot = Math.sin(c * 0.7 + r * 0.5 + t) * Math.PI * 0.5;
    const snapRot = 0;
    const rot = snapRot * gridOrder + floatRot * (1 - gridOrder) + audio.bass * 0.3 * Math.sin(t * 2 + c);

    // Tile size variation & audio pulse
    const distToCenter = Math.hypot(px - cx, py - cy);
    const centerNorm = Math.min(1, distToCenter / maxDist);
    const pulse = 1 + audio.bass * 0.22 * Math.sin(t * 3 - centerNorm * 6);
    const renderSize = (tileSize * 0.88) * pulse;
    const half = renderSize * 0.5;

    // Check if this tile mirrors a connected person's hue
    const tileIndex = (r + 100) * 131 + (c + 100) * 17;
    let tileColor = '';
    let isPersonTile = false;
    if (peopleList.length > 0 && Math.abs(tileIndex % 23) === 0) {
      const person = peopleList[Math.abs(tileIndex) % peopleList.length];
      tileColor = `hsl(${person.hue}, 90%, ${55 + audio.mid * 25}%)`;
      isPersonTile = true;
    } else {
      tileColor = getColor(c, r, 0);
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);

    ctx.fillStyle = tileColor;
    if (showGrout) {
      ctx.strokeStyle = isPersonTile ? '#ffffff' : (paletteName === 'neon_synth' ? '#1b1236' : '#141414');
      ctx.lineWidth = isPersonTile ? 2.5 : Math.max(1, tileSize * 0.08);
    }

    ctx.beginPath();
    if (shape === 'square') {
      const rad = renderSize * 0.12;
      ctx.roundRect(-half, -half, renderSize, renderSize, rad);
    } else if (shape === 'lozenge') {
      ctx.moveTo(0, -half * 1.15);
      ctx.lineTo(half * 0.85, 0);
      ctx.lineTo(0, half * 1.15);
      ctx.lineTo(-half * 0.85, 0);
      ctx.closePath();
    } else if (shape === 'hex') {
      const rad = half * 1.05;
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3;
        const hx = Math.cos(ang) * rad;
        const hy = Math.sin(ang) * rad;
        if (a === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
    }

    ctx.fill();
    if (showGrout) {
      ctx.stroke();
    }

    // Subtle specular glaze highlight on top half
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.ellipse(0, -half * 0.35, half * 0.6, half * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

ctx.restore();