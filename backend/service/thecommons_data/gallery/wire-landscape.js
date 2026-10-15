ctx.save();

const style = getVar('render_style') ?? 'shaded';
const palChoice = getVar('palette') ?? 'synthwave';
const speedMult = getVar('speed') ?? 1.0;
const audioBoost = getVar('audio_boost') ?? 1.5;
const showVerticals = getVar('vertical_mesh') ?? true;
const sunStyle = getVar('sun_style') ?? 'radiant';

const w = frame.width;
const h = frame.height;
const cx = w * 0.5;
const horizon = h * 0.38;

// Palettes
const palettes = {
  synthwave: {
    skyTop: '#08011c',
    skyBot: '#2c0c45',
    sunA: '#ffe853',
    sunB: '#ff007f',
    grid: '#00f7ff',
    wireAlpha: 0.8,
    fillBase: [25, 10, 48],
    fillPeak: [255, 0, 140],
    glow: 'rgba(0, 247, 255, 0.4)'
  },
  monochrome: {
    skyTop: '#050505',
    skyBot: '#151515',
    sunA: '#ffffff',
    sunB: '#555555',
    grid: '#ffffff',
    wireAlpha: 0.75,
    fillBase: [10, 10, 10],
    fillPeak: [220, 220, 220],
    glow: 'rgba(255, 255, 255, 0.3)'
  },
  aurora: {
    skyTop: '#011317',
    skyBot: '#052924',
    sunA: '#5bfbaf',
    sunB: '#097063',
    grid: '#36f1cd',
    wireAlpha: 0.85,
    fillBase: [4, 25, 30],
    fillPeak: [80, 240, 170],
    glow: 'rgba(54, 241, 205, 0.4)'
  },
  desert: {
    skyTop: '#1a0d0a',
    skyBot: '#451f15',
    sunA: '#ff9d42',
    sunB: '#b32210',
    grid: '#ffaa5e',
    wireAlpha: 0.8,
    fillBase: [35, 15, 12],
    fillPeak: [255, 120, 50],
    glow: 'rgba(255, 150, 70, 0.35)'
  }
};
const pal = palettes[palChoice] ?? palettes.synthwave;

// Sky gradient
const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon + 80);
skyGrad.addColorStop(0, pal.skyTop);
skyGrad.addColorStop(1, pal.skyBot);
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, w, h);

// Ambient Stars
room.state.stars ??= Array.from({ length: 60 }, (_, i) => ({
  x: (Math.sin(i * 127.1) * 0.5 + 0.5),
  y: (Math.cos(i * 311.7) * 0.5 + 0.5) * 0.35,
  size: (i % 3 === 0 ? 1.8 : 1.0),
  phase: i * 1.7
}));
ctx.fillStyle = '#ffffff';
for (const star of room.state.stars) {
  const twinkle = 0.3 + 0.7 * Math.sin(frame.t * 1.5 + star.phase);
  ctx.globalAlpha = twinkle * 0.6;
  ctx.fillRect(star.x * w, star.y * h, star.size, star.size);
}
ctx.globalAlpha = 1.0;

// Horizon Celestial / Sun
if (sunStyle !== 'none') {
  const sunR = Math.min(w, h) * 0.18;
  const sunY = horizon - sunR * 0.25;
  const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sunGrad.addColorStop(0, pal.sunA);
  sunGrad.addColorStop(1, pal.sunB);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, sunY, sunR, 0, Math.PI * 2);
  ctx.fillStyle = sunGrad;
  ctx.shadowColor = pal.sunA;
  ctx.shadowBlur = sunStyle === 'radiant' ? 40 + audio.bass * 30 : 15;
  ctx.fill();

  // Retro blind slats cut through sun
  if (sunStyle === 'radiant') {
    ctx.shadowBlur = 0;
    ctx.fillStyle = pal.skyBot;
    const slats = 9;
    for (let s = 1; s <= slats; s++) {
      const sy = sunY + (s / slats) * (sunR * 0.95);
      const sh = 1.5 + s * 0.6;
      ctx.fillRect(cx - sunR - 10, sy, (sunR + 10) * 2, sh);
    }
  }
  ctx.restore();
}

// Persistent smooth travel offset
room.state.travel ??= 0;
room.state.travel += frame.dt * speedMult * (0.8 + audio.level * 0.6);

// Dimensions for the terrain mesh
const rows = 34;
const cols = 42;
const bassAmp = audio.bass * 85 * audioBoost;
const midAmp = audio.mid * 50 * audioBoost;
const trebAmp = audio.treble * 30 * audioBoost;

// Height function in normalized space
function getHeight(nx, nz, t) {
  const distFromCenter = Math.abs(nx);
  // Channeling valley in center, mountains on edges
  const valley = Math.pow(distFromCenter, 1.4) * 1.4 + 0.15;
  
  const wave1 = Math.sin(nx * 5.0 + t * 0.9 + nz * 4.0) * 0.4;
  const wave2 = Math.cos(nx * 11.0 - t * 1.4 + nz * 7.0) * 0.25;
  const wave3 = Math.sin(nx * 22.0 + t * 2.2 - nz * 12.0) * 0.12;
  const ridge = Math.abs(Math.sin(nx * 3.5 + nz * 2.5 + t * 0.4));
  
  // Audio react: Bass pulses rolling swells; treble creates jagged peaks
  const audioSwell = Math.sin(nz * 8.0 - t * 3.0) * (bassAmp * 0.008);
  const trebleCrackle = Math.sin(nx * 28.0 + nz * 18.0) * (trebAmp * 0.004);

  const rawH = (wave1 + wave2 + wave3 + ridge * 0.6) * valley + audioSwell + trebleCrackle;
  return rawH * (65 + bassAmp * 0.8 + midAmp * 0.4);
}

// Compute grid points row-by-row (from far z=0 down to near z=1)
// Using non-linear perspective mapping
const grid = [];
for (let r = 0; r <= rows; r++) {
  const rowArr = [];
  const v = r / rows; // 0 (far) to 1 (near)
  const z = Math.pow(v, 2.1); // depth factor
  const screenYBase = horizon + z * (h - horizon + 50);
  const spread = w * (0.1 + 0.98 * z);
  const effT = room.state.travel + (1.0 - v) * 4.0;

  for (let c = 0; c <= cols; c++) {
    const u = (c / cols) * 2.0 - 1.0; // -1 to 1
    const px = cx + u * (spread * 0.58);
    const elevation = getHeight(u, v, effT);
    const py = screenYBase - elevation * (0.15 + 0.85 * z);
    rowArr.push({ x: px, y: py, elev: elevation, z: z, u: u });
  }
  grid.push(rowArr);
}

// Drawing: Back-to-front (r = 0 to rows - 1)
for (let r = 0; r < rows; r++) {
  const r0 = grid[r];
  const r1 = grid[r + 1];
  const depthFactor = (r / rows);

  if (style === 'shaded') {
    // Draw filled quads between r and r+1
    for (let c = 0; c < cols; c++) {
      const p00 = r0[c];
      const p10 = r0[c + 1];
      const p11 = r1[c + 1];
      const p01 = r1[c];

      const avgElev = (p00.elev + p10.elev + p11.elev + p01.elev) * 0.25;
      const peakRatio = Math.max(0, Math.min(1, avgElev / 90));
      
      // Shade interpolation
      const cr = Math.round(pal.fillBase[0] + (pal.fillPeak[0] - pal.fillBase[0]) * peakRatio);
      const cg = Math.round(pal.fillBase[1] + (pal.fillPeak[1] - pal.fillBase[1]) * peakRatio);
      const cb = Math.round(pal.fillBase[2] + (pal.fillPeak[2] - pal.fillBase[2]) * peakRatio);
      const depthShade = 0.25 + 0.75 * depthFactor;
      
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      
      ctx.fillStyle = `rgb(${Math.round(cr * depthShade)}, ${Math.round(cg * depthShade)}, ${Math.round(cb * depthShade)})`;
      ctx.fill();

      if (showVerticals && r % 2 === 0) {
        ctx.strokeStyle = pal.grid;
        ctx.globalAlpha = 0.15 * depthFactor;
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }
  } else if (style === 'neon_contour') {
    // Solid dark body masking behind, bright glowing edge on crest
    ctx.beginPath();
    ctx.moveTo(r1[0].x, h + 30);
    ctx.lineTo(r1[0].x, r1[0].y);
    for (let c = 1; c <= cols; c++) {
      ctx.lineTo(r1[c].x, r1[c].y);
    }
    ctx.lineTo(r1[cols].x, h + 30);
    ctx.closePath();
    ctx.fillStyle = '#06030c';
    ctx.fill();
  } else if (style === 'retro_vector') {
    // Black underside mask to keep wireframe clean & legible
    ctx.beginPath();
    ctx.moveTo(r1[0].x, h + 30);
    ctx.lineTo(r1[0].x, r1[0].y);
    for (let c = 1; c <= cols; c++) {
      ctx.lineTo(r1[c].x, r1[c].y);
    }
    ctx.lineTo(r1[cols].x, h + 30);
    ctx.closePath();
    ctx.fillStyle = '#07080b';
    ctx.fill();
  }

  // Horizontal rib stroke
  ctx.beginPath();
  ctx.moveTo(r1[0].x, r1[0].y);
  for (let c = 1; c <= cols; c++) {
    ctx.lineTo(r1[c].x, r1[c].y);
  }
  ctx.strokeStyle = pal.grid;
  ctx.globalAlpha = style === 'wireframe' ? 0.35 + 0.65 * depthFactor : (0.4 + 0.6 * depthFactor);
  ctx.lineWidth = style === 'neon_contour' ? 1.5 + depthFactor * 1.8 : 1.0 + depthFactor * 1.2;
  if (style === 'neon_contour' && r === rows - 1) {
    ctx.shadowColor = pal.grid;
    ctx.shadowBlur = 12;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;
}

// Vertical longitudinal grid lines if wireframe / toggle enabled
if (showVerticals && style !== 'shaded') {
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1.0;
  for (let c = 0; c <= cols; c += (style === 'retro_vector' ? 2 : 1)) {
    ctx.beginPath();
    for (let r = 0; r <= rows; r++) {
      const pt = grid[r][c];
      if (r === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.globalAlpha = 0.25 * (pal.wireAlpha ?? 0.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;
}

// Presence Beacons from connected room people
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 24);
  for (let i = 0; i < pCount; i++) {
    const person = room.people[i];
    const pRow = 6 + (i * 5) % (rows - 8);
    const pCol = 4 + (i * 7) % (cols - 8);
    const pt = grid[pRow][pCol];
    
    // Projected audio monolith / beam
    const beamH = 30 + audio.bass * 50 + ((person.hue % 40));
    ctx.save();
    ctx.strokeStyle = `hsl(${person.hue}, 90%, 65%)`;
    ctx.lineWidth = 2.0;
    ctx.shadowColor = `hsl(${person.hue}, 100%, 50%)`;
    ctx.shadowBlur = 10;
    
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x, pt.y - beamH);
    ctx.stroke();

    // Top diamond head
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y - beamH, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Beat surge ripple along the bottom edge
if (audio.beat) {
  ctx.save();
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 3.0;
  ctx.globalAlpha = 0.8;
  ctx.shadowColor = pal.grid;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(0, h - 4);
  ctx.lineTo(w, h - 4);
  ctx.stroke();
  ctx.restore();
}

ctx.restore();