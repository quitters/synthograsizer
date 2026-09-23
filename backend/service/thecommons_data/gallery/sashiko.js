ctx.save();

// Persistent demoscene state & pre-allocated lookup buffers
room.state.H ??= new Uint8Array(256);
room.state.V ??= new Uint8Array(256);
room.state.primes ??= (() => {
  const p = new Uint8Array(256);
  for (let i = 2; i < 256; i++) {
    let isP = 1;
    for (let f = 2; f * f <= i; f++) {
      if (i % f === 0) { isP = 0; break; }
    }
    p[i] = isP;
  }
  return p;
})();
room.state.caBuffer ??= new Uint8Array(256);
room.state.headX ??= 0;
room.state.headY ??= 0;
room.state.phase ??= 0;

// Configuration & Variable parsing
const pitch = getVar('grid_density') ?? 24;
const tempo = getVar('tempo_drift') ?? 0.5;
const threadWidth = getVar('thread_weight') ?? 2.5;
const pattern = getVar('pattern_seed') ?? 'Thue-Morse';
const style = getVar('stitch_style') ?? 'Hand Stitched';
const depth = getVar('indigo_depth') ?? 'Deep Tokushima';

const { width, height, t, dt } = frame;
room.state.phase += dt * tempo;
const phase = room.state.phase;

// Ground palettes: [deepBg, midBg, weaveLine, shadow]
const grounds = {
  'Deep Tokushima': ['#091124', '#0d1a38', 'rgba(25, 45, 85, 0.4)', 'rgba(3, 7, 18, 0.8)'],
  'Faded Kasuri':   ['#131e2c', '#1b2d3f', 'rgba(38, 62, 85, 0.4)', 'rgba(5, 10, 16, 0.7)'],
  'Night Denim':    ['#070b14', '#0d1527', 'rgba(20, 36, 68, 0.4)', 'rgba(2, 4, 10, 0.85)'],
  'Black Ash':      ['#0d0e12', '#15161d', 'rgba(35, 37, 45, 0.4)', 'rgba(2, 2, 4, 0.9)']
};
const gPal = grounds[depth] ?? grounds['Deep Tokushima'];

// Thread palettes: [coreColor, highlightColor, punctureColor, glowColor]
const threads = {
  'Hand Stitched':     ['#eae4d3', '#ffffff', '#060912', 'rgba(255, 250, 240, 0.15)'],
  'Crisp Cotton':      ['#f2f5fa', '#ffffff', '#050a14', 'rgba(230, 240, 255, 0.25)'],
  'Luminescent Silk':  ['#8be9fd', '#f8f8f2', '#031a26', 'rgba(139, 233, 253, 0.45)'],
  'Golden Sashiko':    ['#f1c40f', '#fff4a3', '#1c1300', 'rgba(241, 196, 15, 0.35)']
};
const tPal = threads[style] ?? threads['Hand Stitched'];

// 1. Draw Textured Indigo Background with subtle slub grain
const bgGrad = ctx.createRadialGradient(
  width * 0.5, height * 0.5, width * 0.1,
  width * 0.5, height * 0.5, Math.hypot(width, height) * 0.55
);
bgGrad.addColorStop(0, gPal[1]);
bgGrad.addColorStop(1, gPal[0]);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, width, height);

// Subtle textile weave guidelines
const bassBoost = audio.bass * 2.0;
ctx.lineWidth = 0.5;
ctx.strokeStyle = gPal[2];
ctx.beginPath();
const xCount = Math.ceil(width / pitch) + 2;
const yCount = Math.ceil(height / pitch) + 2;
for (let i = 0; i < xCount; i += 2) {
  const gx = i * pitch;
  ctx.moveTo(gx, 0);
  ctx.lineTo(gx, height);
}
for (let j = 0; j < yCount; j += 2) {
  const gy = j * pitch;
  ctx.moveTo(0, gy);
  ctx.lineTo(width, gy);
}
ctx.stroke();

// 2. Compute Hitomezashi Binary Sequences H[] and V[]
const H = room.state.H;
const V = room.state.V;
const shift = Math.floor(phase * 1.5);

if (pattern === 'Thue-Morse') {
  for (let k = 0; k < 256; k++) {
    let n = k + shift;
    let c = 0;
    while (n > 0) { c += n & 1; n >>= 1; }
    H[k] = c & 1;
    let nv = (k + shift * 2) ^ 0x5a;
    let cv = 0;
    while (nv > 0) { cv += nv & 1; nv >>= 1; }
    V[k] = cv & 1;
  }
} else if (pattern === 'Fibonacci Woven') {
  const phi = 0.61803398875;
  for (let k = 0; k < 256; k++) {
    H[k] = (((k + shift) * phi) % 1.0 > 0.5) ? 1 : 0;
    V[k] = (((k + shift * 3) * (1.0 - phi)) % 1.0 > 0.5) ? 1 : 0;
  }
} else if (pattern === 'Rule 30 CA') {
  const ca = room.state.caBuffer;
  if (ca[128] === 0) ca[128] = 1;
  const step = Math.floor(t * 8) % 256;
  for (let k = 0; k < 256; k++) {
    H[k] = ca[k];
    V[k] = ca[(k + step) & 255];
  }
  // Step CA occasionally
  if (audio.beat || Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
    let left = ca[255];
    for (let k = 0; k < 256; k++) {
      const mid = ca[k];
      const right = ca[(k + 1) & 255];
      ca[k] = (left ^ (mid | right)) & 1;
      left = mid;
    }
  }
} else if (pattern === 'Prime Parity') {
  const p = room.state.primes;
  for (let k = 0; k < 256; k++) {
    H[k] = p[(k + shift) % 255];
    V[k] = p[(k * 3 + shift) % 255];
  }
} else {
  // Audio Reactive mode
  const thres = 0.45 - audio.mid * 0.25;
  for (let k = 0; k < 256; k++) {
    const wave = Math.sin((k + shift) * 0.18) * 0.4 + Math.cos(k * 0.07 + phase) * 0.4;
    H[k] = (wave + audio.bass * 0.3) > thres ? 1 : 0;
    const waveV = Math.sin((k * 1.3 - shift * 0.8) * 0.15) * 0.5;
    V[k] = (waveV + audio.treble * 0.3) > thres ? 1 : 0;
  }
}

// Integrate audience into sequence mutations
if (room.people && room.people.length > 0) {
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const colIdx = Math.floor((p.hue / 360) * xCount) % 256;
    const rowIdx = (colIdx * 7) % 256;
    V[colIdx] ^= 1;
    H[rowIdx] ^= 1;
  }
}

// 3. Render Sashiko Stitches
// Traditional Hitomezashi: stitches span grid intervals [k, k+1]
// A stitch is drawn slightly shorter than pitch, leaving empty needle holes at junctions.
const margin = pitch * 0.16;
const stitchLen = pitch - margin * 2;

// Sewing progressive wave: stitches appear line-by-line / wave-swept
const maxStitchDist = xCount + yCount;
const sewProgress = ((phase * 4.0) % (maxStitchDist + 20));

// Pass 1: Drop shadows beneath stitches for thread elevation / tactile depth
ctx.lineCap = 'round';
ctx.lineWidth = threadWidth + 1.2;
ctx.strokeStyle = gPal[3];
ctx.beginPath();

for (let r = 0; r < yCount; r++) {
  const y = r * pitch;
  const offset = H[r & 255];
  for (let c = 0; c < xCount; c++) {
    if (((c + offset) & 1) === 0) {
      if ((c + r) <= sewProgress) {
        const x1 = c * pitch + margin;
        const x2 = x1 + stitchLen;
        ctx.moveTo(x1, y + 1.6);
        ctx.lineTo(x2, y + 1.6);
      }
    }
  }
}

for (let c = 0; c < xCount; c++) {
  const x = c * pitch;
  const offset = V[c & 255];
  for (let r = 0; r < yCount; r++) {
    if (((r + offset) & 1) === 0) {
      if ((c + r) <= sewProgress) {
        const y1 = r * pitch + margin;
        const y2 = y1 + stitchLen;
        ctx.moveTo(x + 0.8, y1 + 1.6);
        ctx.lineTo(x + 0.8, y2 + 1.6);
      }
    }
  }
}
ctx.stroke();

// Pass 2: Main white / dyed Sashiko stitches
ctx.lineWidth = threadWidth + bassBoost * 0.8;
ctx.strokeStyle = tPal[0];
ctx.beginPath();

for (let r = 0; r < yCount; r++) {
  const y = r * pitch;
  const offset = H[r & 255];
  for (let c = 0; c < xCount; c++) {
    if (((c + offset) & 1) === 0) {
      if ((c + r) <= sewProgress) {
        const x1 = c * pitch + margin;
        const x2 = x1 + stitchLen;
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
      }
    }
  }
}

for (let c = 0; c < xCount; c++) {
  const x = c * pitch;
  const offset = V[c & 255];
  for (let r = 0; r < yCount; r++) {
    if (((r + offset) & 1) === 0) {
      if ((c + r) <= sewProgress) {
        const y1 = r * pitch + margin;
        const y2 = y1 + stitchLen;
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
      }
    }
  }
}
ctx.stroke();

// Pass 3: Thread sheen & needle punctures at stitch endpoints
ctx.lineWidth = Math.max(1, threadWidth * 0.45);
ctx.strokeStyle = tPal[1];
ctx.beginPath();
for (let r = 0; r < yCount; r += 2) {
  const y = r * pitch - 0.4;
  const offset = H[r & 255];
  for (let c = 0; c < xCount; c += 2) {
    if (((c + offset) & 1) === 0 && (c + r) <= sewProgress) {
      ctx.moveTo(c * pitch + margin + 2, y);
      ctx.lineTo(c * pitch + pitch - margin - 2, y);
    }
  }
}
ctx.stroke();

// Needle punctures (small dots at fabric puncture points)
ctx.fillStyle = tPal[2];
ctx.beginPath();
for (let r = 0; r < yCount; r++) {
  const y = r * pitch;
  for (let c = 0; c < xCount; c++) {
    if ((c + r) <= sewProgress && ((c + r) % 3 === 0)) {
      const x = c * pitch;
      ctx.rect(x - 0.9, y - 0.9, 1.8, 1.8);
    }
  }
}
ctx.fill();

// 4. Working needle cursor & sound-reactive thread glow
const sewHeadIndex = Math.min(xCount + yCount, Math.floor(sewProgress));
const needleCol = Math.min(xCount - 1, sewHeadIndex % xCount);
const needleRow = Math.min(yCount - 1, Math.floor(sewHeadIndex / xCount) * 2 + 1);
const needleX = needleCol * pitch;
const needleY = needleRow * pitch;

// Active needle gleam
const glowRad = 16 + audio.mid * 24;
const nGrad = ctx.createRadialGradient(needleX, needleY, 2, needleX, needleY, glowRad);
nGrad.addColorStop(0, '#ffffff');
nGrad.addColorStop(0.3, tPal[1]);
nGrad.addColorStop(1, 'rgba(255,255,255,0)');
ctx.fillStyle = nGrad;
ctx.beginPath();
ctx.arc(needleX, needleY, glowRad, 0, Math.PI * 2);
ctx.fill();

// Needle stitch spark
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 1.8;
ctx.beginPath();
ctx.moveTo(needleX - 6, needleY);
ctx.lineTo(needleX + 6, needleY);
ctx.moveTo(needleX, needleY - 6);
ctx.lineTo(needleX, needleY + 6);
ctx.stroke();

// 5. Ambient woven boundary frame
ctx.lineWidth = 4;
ctx.strokeStyle = gPal[1];
ctx.strokeRect(8, 8, width - 16, height - 16);
ctx.lineWidth = 1;
ctx.strokeStyle = tPal[3];
ctx.strokeRect(14, 14, width - 28, height - 28);

ctx.restore();