ctx.save();

// --- Persistent Initialization & Lookup Tables ---
if (!room.state.curves) {
  room.state.curves = {};
  room.state.headProgress = 0;
  room.state.morphT = 0;

  // Compact L-system generator for Hilbert & Moore curves
  function buildLSystem(axiom, rules, depth) {
    let str = axiom;
    for (let d = 0; d < depth; d++) {
      let next = '';
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        next += rules[ch] || ch;
      }
      str = next;
    }
    let x = 0, y = 0, dir = 0;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    const coords = [0, 0];
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === 'F') {
        x += (dir === 0 ? 1 : dir === 2 ? -1 : 0);
        y += (dir === 1 ? 1 : dir === 3 ? -1 : 0);
        coords.push(x, y);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else if (c === '+') {
        dir = (dir + 1) & 3;
      } else if (c === '-') {
        dir = (dir + 3) & 3;
      }
    }
    const count = coords.length / 2;
    const pts = new Float32Array(count * 2);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    for (let i = 0; i < count; i++) {
      pts[i * 2] = (coords[i * 2] - minX) / spanX;
      pts[i * 2 + 1] = (coords[i * 2 + 1] - minY) / spanY;
    }
    return { pts, count };
  }

  const hRules = { L: '+RF-LFL-FR+', R: '-LF+RFR+FL-' };
  const mRules = { L: '-RF+LFL+FR-', R: '+LF-RFR-FL+' };

  for (let ord = 3; ord <= 6; ord++) {
    const h = buildLSystem('L', hRules, ord);
    const m = buildLSystem('LFL+F+LFL', mRules, ord - 1);
    const count = Math.min(h.count, m.count);
    room.state.curves[ord] = { hilbert: h.pts, moore: m.pts, count };
  }
}

// --- Knobs & Settings ---
const order = Math.round(getVar('order') ?? 5);
const morphMode = getVar('morph_mode') ?? 'auto_cycle';
const speed = getVar('draw_speed') ?? 1.0;
const paletteName = getVar('color_palette') ?? 'cyber_neon';
const baseWidth = getVar('line_width') ?? 3;
const bloomGlow = getVar('bloom_glow') ?? 'intense';
const roomEcho = getVar('room_echo') ?? 'connected';

// Determine morph weight [0: Hilbert, 1: Moore]
let targetMorph = 0.0;
if (morphMode === 'hilbert') targetMorph = 0.0;
else if (morphMode === 'moore') targetMorph = 1.0;
else if (morphMode === 'hybrid') targetMorph = 0.5;
else {
  // auto_cycle: smoothly breathes between curves
  targetMorph = 0.5 + 0.5 * Math.sin(frame.t * 0.7 + audio.bass * 0.6);
}

// Smooth morph state transition without sudden jumps
room.state.morphT += (targetMorph - room.state.morphT) * Math.min(1.0, frame.dt * 4.0);
const morph = room.state.morphT;

// Step-by-step drawing cursor progression
room.state.headProgress = (room.state.headProgress + frame.dt * speed * 0.18 + audio.bass * 0.002) % 1.0;
const headPos = room.state.headProgress;

// --- Viewport & Demoscene Canvas Setup ---
const W = frame.width;
const H = frame.height;

// Dark CRT backdrop trail
ctx.fillStyle = 'rgba(4, 6, 12, 0.28)';
ctx.fillRect(0, 0, W, H);

// Audio reactive scaling & framing
const bassBounce = 1.0 + audio.bass * 0.09;
const minDim = Math.min(W, H);
const curveSize = minDim * 0.78 * bassBounce;
const originX = (W - curveSize) * 0.5;
const originY = (H - curveSize) * 0.5;

// Retrieve curve dataset for active order
const curveData = room.state.curves[order] || room.state.curves[5];
const hPts = curveData.hilbert;
const mPts = curveData.moore;
const totalPoints = curveData.count;

// --- Palette Helper Function ---
function getCurveHue(frac, offset) {
  const p = (frac + offset) % 1.0;
  if (paletteName === 'amber_phosphor') {
    return 30 + Math.sin(p * Math.PI * 2) * 25;
  } else if (paletteName === 'aurora_borealis') {
    return (150 + p * 170) % 360;
  } else if (paletteName === 'solar_flare') {
    return (55 - p * 65 + 360) % 360;
  } else {
    // cyber_neon
    return (185 + p * 155) % 360;
  }
}

// --- Rendering the Curve in Batched Gradient Chunks ---
// Chunking into 48 sub-paths prevents context stalls and produces a rich smooth sweep
const CHUNKS = 48;
const ptsPerChunk = Math.max(1, Math.floor(totalPoints / CHUNKS));
const timeShift = frame.t * 0.15;
const activePointLimit = Math.floor(headPos * totalPoints);

// Bloom pass settings
const passes = bloomGlow === 'intense' ? [ { wMult: 3.5, alpha: 0.25, gco: 'lighter' }, { wMult: 1.0, alpha: 0.95, gco: 'source-over' } ]
             : bloomGlow === 'subtle'  ? [ { wMult: 2.2, alpha: 0.18, gco: 'lighter' }, { wMult: 1.0, alpha: 0.9, gco: 'source-over' } ]
             : [ { wMult: 1.0, alpha: 1.0, gco: 'source-over' } ];

for (let pass = 0; pass < passes.length; pass++) {
  const pConfig = passes[pass];
  ctx.save();
  ctx.globalCompositeOperation = pConfig.gco;
  ctx.lineWidth = Math.max(1, (baseWidth + audio.mid * 2.5) * pConfig.wMult);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let c = 0; c < CHUNKS; c++) {
    const startIdx = c * ptsPerChunk;
    const endIdx = Math.min(totalPoints - 1, (c + 1) * ptsPerChunk);
    if (startIdx >= endIdx) continue;

    const chunkFrac = c / CHUNKS;
    const hue = getCurveHue(chunkFrac, timeShift);
    
    // Highlight actively drawing head chunk
    const isNearHead = (startIdx <= activePointLimit && activePointLimit <= endIdx);
    const chunkAlpha = isNearHead ? Math.min(1.0, pConfig.alpha * 1.5) : pConfig.alpha;
    const light = isNearHead ? 75 : (50 + audio.treble * 20);

    ctx.strokeStyle = `hsla(${hue}, 92%, ${light}%, ${chunkAlpha})`;
    ctx.beginPath();

    for (let i = startIdx; i <= endIdx; i++) {
      const i2 = i * 2;
      // Linear blend between Hilbert and Moore vertices
      const nx = (1.0 - morph) * hPts[i2] + morph * mPts[i2];
      const ny = (1.0 - morph) * hPts[i2 + 1] + morph * mPts[i2 + 1];

      const px = originX + nx * curveSize;
      const py = originY + ny * curveSize;

      if (i === startIdx) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// --- Leading Head Tracer & Audio Spark ---
if (totalPoints > 0) {
  const headIdx = Math.min(totalPoints - 1, activePointLimit);
  const h2 = headIdx * 2;
  const headNx = (1.0 - morph) * hPts[h2] + morph * mPts[h2];
  const headNy = (1.0 - morph) * hPts[h2 + 1] + morph * mPts[h2 + 1];
  const hx = originX + headNx * curveSize;
  const hy = originY + headNy * curveSize;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  
  // Spark halo
  const sparkRadius = 6 + audio.bass * 14 + (audio.beat ? 8 : 0);
  const grad = ctx.createRadialGradient(hx, hy, 1, hx, hy, sparkRadius * 2.5);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.3, `hsla(${getCurveHue(headPos, timeShift)}, 100%, 65%, 0.8)`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(hx, hy, sparkRadius * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Audience Resonance (Room People on Curve Manifold) ---
if (roomEcho !== 'off' && room.people && room.people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const peopleCount = Math.min(room.people.length, 32);
  const stepOffset = Math.floor(totalPoints / (peopleCount + 1));

  for (let p = 0; p < peopleCount; p++) {
    const person = room.people[p];
    const sampleIdx = (Math.floor(p * stepOffset + frame.t * 30)) % totalPoints;
    const s2 = sampleIdx * 2;
    const nx = (1.0 - morph) * hPts[s2] + morph * mPts[s2];
    const ny = (1.0 - morph) * hPts[s2 + 1] + morph * mPts[s2 + 1];
    const px = originX + nx * curveSize;
    const py = originY + ny * curveSize;

    const nodeHue = (person.hue != null) ? person.hue : 200;
    const r = (roomEcho === 'connected' ? 4 : 2.5) + audio.mid * 3;

    ctx.fillStyle = `hsla(${nodeHue}, 100%, 70%, 0.85)`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    if (roomEcho === 'connected') {
      ctx.strokeStyle = `hsla(${nodeHue}, 90%, 60%, 0.3)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

ctx.restore();