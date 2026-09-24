ctx.save();

const palettes = {
  parchment: { bg: '#f2ece0', ink: '#1c1b18', accent1: '#b63d27', accent2: '#284b63', rule: 'rgba(28,27,24,0.18)' },
  bauhaus:   { bg: '#eae7df', ink: '#101010', accent1: '#d62828', accent2: '#003049', rule: 'rgba(16,16,16,0.22)' },
  blueprint: { bg: '#0b1d3a', ink: '#9ae6ff', accent1: '#ffd166', accent2: '#ffffff', rule: 'rgba(154,230,255,0.25)' },
  monochrome:{ bg: '#fafafa', ink: '#0a0a0a', accent1: '#555555', accent2: '#888888', rule: 'rgba(10,10,10,0.15)' }
};
const pal = palettes[getVar('palette')] ?? palettes.parchment;
const baseHatch = getVar('hatch_spacing') ?? 8;
const jitterMax = getVar('jaggedness') ?? 20;
const scanMode = getVar('plotter_scan') ?? 'continuous';
const symDensity = { sparse: 0.18, balanced: 0.38, abundant: 0.65 }[getVar('symbol_density')] ?? 0.38;

// Precompute static pseudo-random lookup tables in room.state (demoscene economy)
if (!room.state.lut) {
  const lut = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    lut[i] = Math.sin(i * 12.9898 + (i % 17) * 78.233) * 43758.5453;
    lut[i] -= Math.floor(lut[i]);
  }
  room.state.lut = lut;
  room.state.penHead = 0;
  room.state.bandIdx = 0;
}
const lut = room.state.lut;

const W = frame.width;
const H = frame.height;

// Background fill
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Plotter head traversal timing
const dt = Math.min(frame.dt, 0.05);
if (scanMode === 'band by band') {
  room.state.bandIdx = (room.state.bandIdx + dt * (1.5 + audio.bass * 2)) % 14;
  room.state.penHead = (room.state.bandIdx / 14);
} else if (scanMode === 'staccato') {
  room.state.penHead = (room.state.penHead + (audio.beat ? 0.08 : dt * 0.12)) % 1;
} else {
  room.state.penHead = (room.state.penHead + dt * (0.08 + audio.mid * 0.12)) % 1;
}

// Grid layout: 14 horizontal bands with central pathway (Paul Klee's Hauptweg)
const bandCount = 14;
const bandH = H / bandCount;
const mainRoadCenter = W * (0.42 + Math.sin(frame.t * 0.1) * 0.04);
const mainRoadWidth = W * (0.20 + audio.bass * 0.06);

const bassJitter = audio.bass * jitterMax * 0.75;
const trebleFine = audio.treble * 3.5;

// Draw paper grain / register ticks
ctx.strokeStyle = pal.rule;
ctx.lineWidth = 1;
for (let i = 1; i < bandCount; i++) {
  const y = i * bandH;
  ctx.beginPath();
  ctx.moveTo(10, y);
  ctx.lineTo(24, y);
  ctx.moveTo(W - 24, y);
  ctx.lineTo(W - 10, y);
  ctx.stroke();
}

// Render bands
for (let b = 0; b < bandCount; b++) {
  const yTop = b * bandH;
  const yBot = yTop + bandH;
  const lutB = (b * 67) & 1023;
  
  // Pen plotter horizon cutoff based on scan
  const bandProgress = (room.state.penHead * bandCount) - b;
  const isScanned = bandProgress >= 0;
  const sweepX = scanMode === 'continuous' 
    ? Math.min(W, Math.max(0, (bandProgress < 1 ? bandProgress * W : W)))
    : W;
  if (!isScanned && scanMode !== 'continuous') continue;

  // Dividing jagged horizontal band lines
  ctx.beginPath();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.2;
  const cols = 24;
  const colW = W / cols;
  for (let c = 0; c <= cols; c++) {
    const x = c * colW;
    if (scanMode === 'continuous' && x > sweepX) break;
    const j = (lut[(lutB + c * 7) & 1023] - 0.5) * (jitterMax + bassJitter);
    const y = yTop + j;
    if (c === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Generate parcels inside band
  const parcels = 12;
  const parcelW = W / parcels;

  for (let p = 0; p < parcels; p++) {
    const pL = p * parcelW;
    const pR = pL + parcelW;
    if (pL > sweepX) break;
    const drawR = Math.min(pR, sweepX);
    
    const parcelSeed = (lutB + p * 23) & 1023;
    const rndVal = lut[parcelSeed];
    const inMainRoad = (pL + parcelW * 0.5) > (mainRoadCenter - mainRoadWidth * 0.5) && 
                       (pL + parcelW * 0.5) < (mainRoadCenter + mainRoadWidth * 0.5);

    // Hatching mode for this cell: 0 = dense, 1 = sparse, 2 = alternating, 3 = blank/symbol
    const densityMult = inMainRoad ? 0.55 : (0.75 + rndVal * 1.6);
    const step = Math.max(3, baseHatch * densityMult);
    const cellColor = (rndVal > 0.88) ? pal.accent1 : ((rndVal < 0.12) ? pal.accent2 : pal.ink);

    ctx.strokeStyle = cellColor;
    ctx.lineWidth = (inMainRoad ? 1.5 : 1.0) + (rndVal > 0.9 ? 0.8 : 0);

    // Vertical parallel hatch strokes
    if (rndVal < 0.82) {
      ctx.beginPath();
      for (let hx = pL + 2; hx < drawR - 2; hx += step) {
        const fineY1 = (lut[((parcelSeed + Math.floor(hx)) * 3) & 1023] - 0.5) * trebleFine;
        const fineY2 = (lut[((parcelSeed + Math.floor(hx)) * 5) & 1023] - 0.5) * trebleFine;
        const topJit = (lut[(lutB + Math.floor(hx / colW) * 7) & 1023] - 0.5) * (jitterMax + bassJitter);
        const botJit = (lut[((lutB + 67) + Math.floor(hx / colW) * 7) & 1023] - 0.5) * (jitterMax + bassJitter);
        
        const y1 = yTop + 2 + topJit + fineY1;
        const y2 = yBot - 2 + botJit + fineY2;
        
        ctx.moveTo(hx, y1);
        ctx.lineTo(hx, y2);
      }
      ctx.stroke();
    }

    // Scattered Klee geometric symbols: circle, triangle, or cross
    if (rndVal < symDensity && drawR >= pR) {
      const cx = pL + parcelW * 0.5 + (lut[(parcelSeed + 11) & 1023] - 0.5) * (parcelW * 0.35);
      const cy = yTop + bandH * 0.5 + (lut[(parcelSeed + 13) & 1023] - 0.5) * (bandH * 0.3);
      const sz = 3.5 + lut[(parcelSeed + 17) & 1023] * 6.0 + audio.mid * 4.0;
      const symType = Math.floor(lut[(parcelSeed + 29) & 1023] * 4);

      ctx.strokeStyle = cellColor;
      ctx.fillStyle = cellColor;
      ctx.lineWidth = 1.3;

      if (symType === 0) {
        // Circle / Disc
        ctx.beginPath();
        ctx.arc(cx, cy, sz, 0, Math.PI * 2);
        if (rndVal < symDensity * 0.4) ctx.fill();
        else ctx.stroke();
      } else if (symType === 1) {
        // Triangle (pointing up or down)
        const dir = (rndVal > symDensity * 0.5) ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx, cy - sz * dir);
        ctx.lineTo(cx - sz * 0.86, cy + sz * 0.6 * dir);
        ctx.lineTo(cx + sz * 0.86, cy + sz * 0.6 * dir);
        ctx.closePath();
        if (lut[(parcelSeed + 31) & 1023] > 0.5) ctx.fill();
        else ctx.stroke();
      } else if (symType === 2) {
        // Rotated Greek cross
        const arm = sz * 1.1;
        ctx.beginPath();
        ctx.moveTo(cx - arm, cy);
        ctx.lineTo(cx + arm, cy);
        ctx.moveTo(cx, cy - arm);
        ctx.lineTo(cx, cy + arm);
        ctx.stroke();
      } else {
        // Small solid tick / square
        ctx.fillRect(cx - sz * 0.5, cy - sz * 0.5, sz, sz);
      }
    }
  }
}

// Integrate Room People: mapped as discrete plotter annotation glyphs on side margins
const people = room.people;
if (people && people.length > 0) {
  ctx.lineWidth = 1.5;
  const maxDraw = Math.min(people.length, 24);
  for (let pi = 0; pi < maxDraw; pi++) {
    const p = people[pi];
    const pBand = pi % bandCount;
    const pSide = (pi % 2 === 0);
    const px = pSide ? (28 + (pi * 11) % 60) : (W - 28 - (pi * 11) % 60);
    const py = (pBand + 0.5) * bandH;
    
    ctx.strokeStyle = `hsl(${p.hue}, 85%, 45%)`;
    ctx.fillStyle = `hsl(${p.hue}, 85%, 45%)`;
    
    ctx.beginPath();
    ctx.arc(px, py, 3.5 + audio.bass * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 6, py);
    ctx.lineTo(px + 6, py);
    ctx.stroke();
  }
}

// Pen plotter carriage mechanism overlay
if (scanMode === 'continuous') {
  const activeBand = Math.floor(room.state.penHead * bandCount);
  const activeProgress = (room.state.penHead * bandCount) - activeBand;
  const penX = activeProgress * W;
  const penY = (activeBand + 0.5) * bandH;

  // Pen head crosshair
  ctx.strokeStyle = pal.accent1;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(penX, penY - 9);
  ctx.lineTo(penX, penY + 9);
  ctx.moveTo(penX - 9, penY);
  ctx.lineTo(penX + 9, penY);
  ctx.stroke();

  // Active pen point dot
  ctx.fillStyle = pal.accent1;
  ctx.beginPath();
  ctx.arc(penX, penY, 2 + audio.mid * 2, 0, Math.PI * 2);
  ctx.fill();
}

// Subtle plotter outer frame
ctx.strokeStyle = pal.ink;
ctx.lineWidth = 2;
ctx.strokeRect(6, 6, W - 12, H - 12);

ctx.restore();