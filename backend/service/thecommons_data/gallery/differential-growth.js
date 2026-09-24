const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;

const styleKey = getVar('form_style') ?? 'brain_sulci';
const palKey = getVar('palette') ?? 'bioluminescence';
const growthMul = getVar('growth_speed') ?? 1.0;
const lineW = getVar('line_weight') ?? 2.5;

const MAX_NODES = 560;
const GRID_RES = 36;

if (!room.state.init) {
  room.state.init = true;
  room.state.x = new Float32Array(MAX_NODES);
  room.state.y = new Float32Array(MAX_NODES);
  room.state.vx = new Float32Array(MAX_NODES);
  room.state.vy = new Float32Array(MAX_NODES);
  room.state.count = 28;
  
  const initR = Math.min(W, H) * 0.12;
  for (let i = 0; i < room.state.count; i++) {
    const a = (i / room.state.count) * Math.PI * 2;
    room.state.x[i] = cx + Math.cos(a) * initR;
    room.state.y[i] = cy + Math.sin(a) * initR;
    room.state.vx[i] = 0;
    room.state.vy[i] = 0;
  }
  
  room.state.head = new Int16Array(GRID_RES * GRID_RES);
  room.state.next = new Int16Array(MAX_NODES);
  room.state.splitCooldown = 0;
}

const xs = room.state.x;
const ys = room.state.y;
const vxs = room.state.vx;
const vys = room.state.vy;
let n = room.state.count;

const styles = {
  brain_sulci:  { rRepel: 28, fRepel: 0.85, fSpring: 0.38, maxDist: 18, damp: 0.72 },
  coral_reef:   { rRepel: 36, fRepel: 1.10, fSpring: 0.28, maxDist: 22, damp: 0.68 },
  lichen_edge:  { rRepel: 22, fRepel: 0.65, fSpring: 0.44, maxDist: 14, damp: 0.78 },
  deep_meander: { rRepel: 44, fRepel: 1.30, fSpring: 0.22, maxDist: 26, damp: 0.64 }
};
const cfg = styles[styleKey] ?? styles.brain_sulci;

const bassBoost = (audio?.bass ?? 0) * 1.6;
const repelDist = cfg.rRepel * (1 + bassBoost * 0.35);
const repelDistSq = repelDist * repelDist;
const targetLen = cfg.maxDist * 0.75;
const splitLen = cfg.maxDist * (1.25 - (audio?.mid ?? 0) * 0.35);

// Spatial grid binning
const head = room.state.head;
const next = room.state.next;
head.fill(-1);
const cellW = W / GRID_RES;
const cellH = H / GRID_RES;
const invCellW = 1 / cellW;
const invCellH = 1 / cellH;

for (let i = 0; i < n; i++) {
  let gx = (xs[i] * invCellW) | 0;
  let gy = (ys[i] * invCellH) | 0;
  if (gx < 0) gx = 0; else if (gx >= GRID_RES) gx = GRID_RES - 1;
  if (gy < 0) gy = 0; else if (gy >= GRID_RES) gy = GRID_RES - 1;
  const idx = gy * GRID_RES + gx;
  next[i] = head[idx];
  head[idx] = i;
}

// Forces: Repulsion from spatial neighbors
const fRepel = cfg.fRepel * growthMul;
for (let i = 0; i < n; i++) {
  const px = xs[i];
  const py = ys[i];
  let gx = (px * invCellW) | 0;
  let gy = (py * invCellH) | 0;
  const minGx = Math.max(0, gx - 1);
  const maxGx = Math.min(GRID_RES - 1, gx + 1);
  const minGy = Math.max(0, gy - 1);
  const maxGy = Math.min(GRID_RES - 1, gy + 1);

  for (let cyG = minGy; cyG <= maxGy; cyG++) {
    const rowOff = cyG * GRID_RES;
    for (let cxG = minGx; cxG <= maxGx; cxG++) {
      let other = head[rowOff + cxG];
      while (other !== -1) {
        if (other > i) {
          const dx = xs[other] - px;
          const dy = ys[other] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.001 && d2 < repelDistSq) {
            const d = Math.sqrt(d2);
            const f = ((repelDist - d) / repelDist) * fRepel;
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            vxs[i] -= fx;
            vys[i] -= fy;
            vxs[other] += fx;
            vys[other] += fy;
          }
        }
        other = next[other];
      }
    }
  }
}

// Spring attraction & neighbor clinging (closed loop)
const fSpring = cfg.fSpring;
for (let i = 0; i < n; i++) {
  const prev = (i - 1 + n) % n;
  const nxt = (i + 1) % n;
  
  let dx1 = xs[prev] - xs[i];
  let dy1 = ys[prev] - ys[i];
  let d1 = Math.hypot(dx1, dy1) || 0.001;
  let diff1 = d1 - targetLen;
  vxs[i] += (dx1 / d1) * diff1 * fSpring;
  vys[i] += (dy1 / d1) * diff1 * fSpring;

  let dx2 = xs[nxt] - xs[i];
  let dy2 = ys[nxt] - ys[i];
  let d2 = Math.hypot(dx2, dy2) || 0.001;
  let diff2 = d2 - targetLen;
  vxs[i] += (dx2 / d2) * diff2 * fSpring;
  vys[i] += (dy2 / d2) * diff2 * fSpring;

  // Soft containment toward center so form breathes
  const dcx = cx - xs[i];
  const dcy = cy - ys[i];
  const centerDist = Math.hypot(dcx, dcy);
  const maxRadius = Math.min(W, H) * 0.44;
  if (centerDist > maxRadius) {
    const push = (centerDist - maxRadius) * 0.08;
    vxs[i] += (dcx / centerDist) * push;
    vys[i] += (dcy / centerDist) * push;
  }
}

// Integrate motion
const damp = cfg.damp;
for (let i = 0; i < n; i++) {
  vxs[i] *= damp;
  vys[i] *= damp;
  xs[i] += vxs[i];
  ys[i] += vys[i];
}

// Node splitting when stretched
room.state.splitCooldown--;
const canSplit = n < MAX_NODES && room.state.splitCooldown <= 0;
if (canSplit) {
  let maxEdgeLen = 0;
  let bestIdx = -1;
  for (let i = 0; i < n; i++) {
    const nxt = (i + 1) % n;
    const d = Math.hypot(xs[nxt] - xs[i], ys[nxt] - ys[i]);
    if (d > maxEdgeLen) {
      maxEdgeLen = d;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0 && (maxEdgeLen > splitLen || audio?.beat)) {
    const nxt = (bestIdx + 1) % n;
    // Shift array to insert
    for (let k = n; k > bestIdx + 1; k--) {
      xs[k] = xs[k - 1];
      ys[k] = ys[k - 1];
      vxs[k] = vxs[k - 1];
      vys[k] = vys[k - 1];
    }
    const ins = bestIdx + 1;
    xs[ins] = (xs[bestIdx] + xs[nxt]) * 0.5 + (Math.random() - 0.5) * 2;
    ys[ins] = (ys[bestIdx] + ys[nxt]) * 0.5 + (Math.random() - 0.5) * 2;
    vxs[ins] = (vxs[bestIdx] + vxs[nxt]) * 0.5;
    vys[ins] = (vys[bestIdx] + vys[nxt]) * 0.5;
    n++;
    room.state.count = n;
    room.state.splitCooldown = audio?.beat ? 1 : 2;
  }
}

// Palettes
const palettes = {
  bioluminescence: {
    bg: '#040b14',
    fill: 'rgba(8, 48, 64, 0.18)',
    gradA: '#00ffa3',
    gradB: '#00d2ff',
    glow: 'rgba(0, 255, 180, 0.45)'
  },
  cerebral: {
    bg: '#12080c',
    fill: 'rgba(64, 18, 32, 0.22)',
    gradA: '#ff4b8b',
    gradB: '#ffaa64',
    glow: 'rgba(255, 80, 130, 0.4)'
  },
  synth_coral: {
    bg: '#08051a',
    fill: 'rgba(38, 14, 66, 0.2)',
    gradA: '#bf55ec',
    gradB: '#ff2a8d',
    glow: 'rgba(191, 85, 236, 0.42)'
  },
  deep_sea: {
    bg: '#02070d',
    fill: 'rgba(4, 30, 48, 0.24)',
    gradA: '#38ef7d',
    gradB: '#11998e',
    glow: 'rgba(56, 239, 125, 0.35)'
  }
};
const pal = palettes[palKey] ?? palettes.bioluminescence;

// Render backdrop with trailing fade
ctx.save();
ctx.fillStyle = pal.bg;
ctx.globalAlpha = 0.42;
ctx.fillRect(0, 0, W, H);
ctx.restore();

// Draw closed differential loop with cardinal/cubic spline
ctx.save();
ctx.beginPath();
for (let i = 0; i < n; i++) {
  const i0 = (i - 1 + n) % n;
  const i1 = i;
  const i2 = (i + 1) % n;
  const i3 = (i + 2) % n;
  const xc = (xs[i1] + xs[i2]) * 0.5;
  const yc = (ys[i1] + ys[i2]) * 0.5;
  if (i === 0) ctx.moveTo(xc, yc);
  else ctx.quadraticCurveTo(xs[i1], ys[i1], xc, yc);
}
ctx.closePath();

// Translucent coral fill
ctx.fillStyle = pal.fill;
ctx.fill();

// Linear gradient along diagonal
const grad = ctx.createLinearGradient(W * 0.2, H * 0.2, W * 0.8, H * 0.8);
grad.addColorStop(0, pal.gradA);
grad.addColorStop(1, pal.gradB);

// Ambient outer glow on bass beats
ctx.shadowColor = pal.glow;
ctx.shadowBlur = 12 + (audio?.bass ?? 0) * 24;
ctx.strokeStyle = grad;
ctx.lineWidth = lineW + (audio?.mid ?? 0) * 1.5;
ctx.stroke();

// Ambient room people presence (subtle spore nodes linked to audience hues)
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 32);
  for (let pi = 0; pi < pCount; pi++) {
    const person = room.people[pi];
    const targetNode = Math.floor((pi / pCount) * n);
    const px = xs[targetNode];
    const py = ys[targetNode];
    const rad = 2.5 + (audio?.treble ?? 0) * 4;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${person.hue}, 90%, 65%, 0.75)`;
    ctx.shadowColor = `hsla(${person.hue}, 90%, 65%, 0.8)`;
    ctx.shadowBlur = 8;
    ctx.fill();
  }
}

ctx.restore();