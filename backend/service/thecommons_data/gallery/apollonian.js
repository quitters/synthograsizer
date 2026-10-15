ctx.save();
const w = frame.width;
const h = frame.height;
const minDim = Math.min(w, h);
const cx = w * 0.5;
const cy = h * 0.5;

// Deep celestial navy background
const bgGrad = ctx.createRadialGradient(cx, cy, minDim * 0.05, cx, cy, minDim * 0.72);
bgGrad.addColorStop(0, '#0b162c');
bgGrad.addColorStop(0.55, '#040917');
bgGrad.addColorStop(1, '#01040d');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, w, h);

// One-time generation of Apollonian packing via Descartes' circle theorem
if (!room.state.circles) {
  const maxC = 1200;
  const bx = new Float32Array(maxC);
  const by = new Float32Array(maxC);
  const br = new Float32Array(maxC);
  const bk = new Float32Array(maxC);
  const bg = new Uint8Array(maxC);

  // Outer boundary circle (curvature k0 = -1)
  bx[0] = 0; by[0] = 0; br[0] = 1; bk[0] = -1; bg[0] = 0;

  // Three mutually tangent inner circles
  const r1 = 2 * Math.sqrt(3) - 3;
  const k1 = 1 / r1;
  const d = 1 - r1;
  for (let i = 0; i < 3; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    bx[i + 1] = d * Math.cos(ang);
    by[i + 1] = d * Math.sin(ang);
    br[i + 1] = r1;
    bk[i + 1] = k1;
    bg[i + 1] = 1;
  }
  let count = 4;

  // Apollonian quad branch queue: [i0, i1, i2, i3, lastReplacedIndex, depth]
  const queue = [0, 1, 2, 3, -1, 1];
  let qHead = 0;
  while (qHead < queue.length && count < maxC) {
    const i0 = queue[qHead++];
    const i1 = queue[qHead++];
    const i2 = queue[qHead++];
    const i3 = queue[qHead++];
    const last = queue[qHead++];
    const depth = queue[qHead++];
    if (depth >= 6) continue;

    const quad = [i0, i1, i2, i3];
    for (let j = 0; j < 4; j++) {
      if (j === last || count >= maxC) continue;
      const a = quad[(j + 1) % 4];
      const b = quad[(j + 2) % 4];
      const c = quad[(j + 3) % 4];
      const e = quad[j];

      const kn = 2 * (bk[a] + bk[b] + bk[c]) - bk[e];
      if (kn <= 0.001) continue;
      const xn = (2 * (bx[a] * bk[a] + bx[b] * bk[b] + bx[c] * bk[c]) - bx[e] * bk[e]) / kn;
      const yn = (2 * (by[a] * bk[a] + by[b] * bk[b] + by[c] * bk[c]) - by[e] * bk[e]) / kn;
      const rn = 1 / kn;
      if (rn < 0.003) continue;

      // Deduplicate overlapping circles
      let match = -1;
      for (let k = 0; k < count; k++) {
        if (Math.abs(bx[k] - xn) < 0.0015 && Math.abs(by[k] - yn) < 0.0015 && Math.abs(br[k] - rn) < 0.0015) {
          match = k;
          break;
        }
      }
      const nextIdx = match >= 0 ? match : count;
      if (match < 0) {
        bx[count] = xn;
        by[count] = yn;
        br[count] = rn;
        bk[count] = kn;
        bg[count] = depth + 1;
        count++;
      }

      const nextQuad = [quad[0], quad[1], quad[2], quad[3]];
      nextQuad[j] = nextIdx;
      queue.push(nextQuad[0], nextQuad[1], nextQuad[2], nextQuad[3], j, depth + 1);
    }
  }

  room.state.bx = bx;
  room.state.by = by;
  room.state.br = br;
  room.state.bg = bg;
  room.state.count = count;
  room.state.circles = true;
}

// Read steering parameters
const depthLimit = Math.round(getVar('reveal_depth') ?? 5);
const glowMult = getVar('glow_intensity') ?? 1.4;
const baseWeight = getVar('line_weight') ?? 1.2;
const tintVar = getVar('palette_tint') ?? 'Classic Gold';
const motionVar = getVar('motion_style') ?? 'Slow Orbit';
const echoVar = getVar('echo_layers') ?? 'Dual Rim';

// Palettes: [coreRgb, glowRgb, highRgb]
const palettes = {
  'Classic Gold':    ['228, 182, 75',  '255, 196, 50',  '255, 242, 180'],
  'Rose Aurum':      ['238, 150, 130', '255, 130, 110', '255, 222, 215'],
  'Electric Amber':  ['255, 162, 36',  '255, 130, 10',  '255, 228, 140'],
  'Celestial Brass': ['196, 204, 126', '180, 210, 80',  '245, 252, 205']
};
const pal = palettes[tintVar] ?? palettes['Classic Gold'];

// Motion calculation
const bass = audio.bass || 0;
const mid = audio.mid || 0;
const treb = audio.treble || 0;
const beatPunch = audio.beat ? 0.08 : 0.0;

let rot = 0;
if (motionVar === 'Slow Orbit') {
  rot = frame.t * 0.075;
} else if (motionVar === 'Liquid Drift') {
  rot = Math.sin(frame.t * 0.25) * 0.35 + frame.t * 0.03;
} else if (motionVar === 'Pulsing Gyro') {
  rot = Math.sin(frame.t * 0.6) * 0.7 + bass * 0.15;
} else {
  rot = frame.t * 0.22 + bass * 0.1;
}

const masterScale = (minDim * 0.455) * (1.0 + bass * 0.05 + beatPunch * 0.04);
const { bx, by, br, bg, count } = room.state;

ctx.translate(cx, cy);
ctx.rotate(rot);

// Echo layer passes configuration: scale multiplier & relative alpha
const echoPasses = echoVar === 'Harmonic Echo'
  ? [{ s: 1.0, a: 1.0 }, { s: 0.93, a: 0.45 }, { s: 0.85, a: 0.22 }]
  : echoVar === 'Dual Rim'
    ? [{ s: 1.0, a: 1.0 }, { s: 0.935, a: 0.38 }]
    : [{ s: 1.0, a: 1.0 }];

// Draw circles batched generation by generation for high performance
for (let pass = 0; pass < echoPasses.length; pass++) {
  const ep = echoPasses[pass];
  for (let g = 0; g <= depthLimit; g++) {
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      if (bg[i] !== g) continue;
      const rad = br[i] * masterScale * ep.s;
      if (rad < 0.8) continue;
      const px = bx[i] * masterScale;
      const py = by[i] * masterScale;
      ctx.moveTo(px + rad, py);
      ctx.arc(px, py, rad, 0, Math.PI * 2);
    }

    const genAlpha = Math.max(0.18, 1.0 - g * 0.13) * ep.a;
    const reactiveWeight = (baseWeight * (g === 0 ? 1.6 : 1.0)) * (1.0 + (g > 2 ? treb * 0.4 : bass * 0.3));

    // Glow pass for prominent rings
    if (pass === 0 && g <= 3 && glowMult > 0.6) {
      ctx.save();
      ctx.shadowColor = `rgba(${pal[1]}, ${0.45 * glowMult})`;
      ctx.shadowBlur = (8 + g * 3) * glowMult * (1 + bass * 0.5);
      ctx.strokeStyle = `rgba(${pal[0]}, ${genAlpha * 0.5})`;
      ctx.lineWidth = reactiveWeight * 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // Core crisp stroke
    ctx.strokeStyle = g === 0
      ? `rgba(${pal[2]}, ${0.95 * ep.a})`
      : `rgba(${pal[0]}, ${genAlpha})`;
    ctx.lineWidth = reactiveWeight;
    ctx.stroke();
  }
}

// Dynamic room presence: connected people drawn as golden orbital nodes on the outer rim
const people = room.people;
if (people && people.length > 0) {
  const pCount = Math.min(people.length, 36);
  for (let pIdx = 0; pIdx < pCount; pIdx++) {
    const p = people[pIdx];
    const baseAng = (pIdx / pCount) * Math.PI * 2 + frame.t * 0.12;
    const ringRad = masterScale;
    const px = Math.cos(baseAng) * ringRad;
    const py = Math.sin(baseAng) * ringRad;

    ctx.beginPath();
    ctx.arc(px, py, 3.5 + mid * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.shadowColor = `hsl(${p.hue}, 100%, 75%)`;
    ctx.shadowBlur = 9;
    ctx.fill();
  }
}

ctx.restore();