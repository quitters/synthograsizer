ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// --- State & Lookup Buffers (Allocated once) ---
const MAX_LEAVES = 4096;
const st = room.state;
st.lx ??= new Float32Array(MAX_LEAVES);
st.ly ??= new Float32Array(MAX_LEAVES);
st.lr ??= new Float32Array(MAX_LEAVES);
st.lh ??= new Float32Array(MAX_LEAVES);
st.windTime = (st.windTime || 0);
st.bassPulse = (st.bassPulse || 0) * 0.9 + (audio.bass || 0) * 0.1;
st.beatPulse = (st.beatPulse || 0) * 0.88 + (audio.beat ? 0.35 : 0);

// --- Variable Lookups ---
const depthLimit = Math.floor(getVar('tree_depth') ?? 9);
const spreadVar = getVar('branch_spread') ?? 0.5;

const windConfigs = {
  'Gentle Sigh': { speed: 1.0, amp: 0.08, audioMod: 0.12 },
  'Ocean Gale': { speed: 2.2, amp: 0.18, audioMod: 0.22 },
  'Harmonic Pulse': { speed: 1.5, amp: 0.14, audioMod: 0.38 }
};
const wind = windConfigs[getVar('wind_force')] ?? windConfigs['Gentle Sigh'];
st.windTime += dt * wind.speed;

const palettes = {
  'Cherry Blossom': { baseH: 330, span: 45, sat: 85, lit: 65, glow: '#ff77aa' },
  'Bioluminescent': { baseH: 175, span: 50, sat: 90, lit: 60, glow: '#00ffee' },
  'Golden Autumn': { baseH: 35, span: 35, sat: 95, lit: 55, glow: '#ffaa22' },
  'Ghostly Silver': { baseH: 210, span: 30, sat: 25, lit: 80, glow: '#c8e0ff' }
};
const pal = palettes[getVar('palette')] ?? palettes['Cherry Blossom'];

const moons = {
  'Full Moon': { inner: '#fffcf0', outer: 'rgba(210, 230, 255, 0)', auraH: 210 },
  'Blood Moon': { inner: '#ff6644', outer: 'rgba(120, 20, 30, 0)', auraH: 0 },
  'Crescent Glow': { inner: '#cceeff', outer: 'rgba(50, 110, 200, 0)', auraH: 195 }
};
const moon = moons[getVar('moon_style')] ?? moons['Full Moon'];

// --- Background Sky & Celestial Body ---
const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
skyGrad.addColorStop(0, '#040714');
skyGrad.addColorStop(0.7, '#0c1328');
skyGrad.addColorStop(1.0, '#05070e');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// Moon Behind Tree
const moonX = W * 0.5;
const moonY = H * 0.38;
const moonRad = Math.min(W, H) * (0.2 + st.bassPulse * 0.04);

const moonGlow = ctx.createRadialGradient(moonX, moonY, moonRad * 0.2, moonX, moonY, moonRad * 2.2);
moonGlow.addColorStop(0, `hsla(${moon.auraH}, 80%, 75%, 0.45)`);
moonGlow.addColorStop(0.5, `hsla(${moon.auraH}, 70%, 50%, 0.12)`);
moonGlow.addColorStop(1, moon.outer);
ctx.fillStyle = moonGlow;
ctx.beginPath();
ctx.arc(moonX, moonY, moonRad * 2.2, 0, Math.PI * 2);
ctx.fill();

const moonBody = ctx.createRadialGradient(moonX - moonRad * 0.2, moonY - moonRad * 0.2, moonRad * 0.05, moonX, moonY, moonRad);
moonBody.addColorStop(0, moon.inner);
moonBody.addColorStop(0.85, `hsla(${moon.auraH}, 40%, 65%, 0.9)`);
moonBody.addColorStop(1, `hsla(${moon.auraH}, 50%, 40%, 0.7)`);
ctx.fillStyle = moonBody;
ctx.beginPath();
ctx.arc(moonX, moonY, moonRad, 0, Math.PI * 2);
ctx.fill();

// --- Recursive Branching Loop using Fixed Stack ---
let leafCount = 0;
const numPeople = room.people ? room.people.length : 0;

// Branch rendering split into thick trunk vs twigs for speed
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

const trunkLen = Math.min(H * 0.26, 260);
const rootX = W * 0.5;
const rootY = H * 0.98;

// Iterative DFS stack arrays in state for zero per-frame allocation
st.skX ??= new Float32Array(32);
st.skY ??= new Float32Array(32);
st.skLen ??= new Float32Array(32);
st.skAng ??= new Float32Array(32);
st.skD ??= new Int32Array(32);
st.skSide ??= new Int32Array(32);

let ptr = 0;
st.skX[0] = rootX;
st.skY[0] = rootY;
st.skLen[0] = trunkLen;
st.skAng[0] = -Math.PI * 0.5;
st.skD[0] = depthLimit;
st.skSide[0] = 0;
ptr = 1;

// Sway factors
const swayBase = Math.sin(st.windTime) * wind.amp + (audio.mid || 0) * wind.audioMod;
const beatKick = st.beatPulse * 0.08;

ctx.beginPath();
ctx.strokeStyle = '#181d28';

while (ptr > 0) {
  ptr--;
  const x0 = st.skX[ptr];
  const y0 = st.skY[ptr];
  const len = st.skLen[ptr];
  const ang = st.skAng[ptr];
  const d = st.skD[ptr];
  const side = st.skSide[ptr];

  const x1 = x0 + Math.cos(ang) * len;
  const y1 = y0 + Math.sin(ang) * len;

  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);

  if (d <= 1) {
    if (leafCount < MAX_LEAVES) {
      st.lx[leafCount] = x1;
      st.ly[leafCount] = y1;
      st.lr[leafCount] = 2.0 + (side & 3) * 1.0 + st.bassPulse * 2.5;
      // Room people hue tint or palette variation
      if (numPeople > 0 && (leafCount % 3 === 0)) {
        const p = room.people[leafCount % numPeople];
        st.lh[leafCount] = p.hue;
      } else {
        st.lh[leafCount] = (pal.baseH + Math.sin(x1 * 0.01 + y1 * 0.01) * pal.span + 360) % 360;
      }
      leafCount++;
    }
  } else {
    const nextLen = len * (0.72 + Math.sin(d + t) * 0.02);
    const depthFactor = (depthLimit - d + 1);
    const harmonic = Math.sin(st.windTime * 1.3 + depthFactor * 0.7) * (wind.amp * 0.8);
    const dynamicSpread = spreadVar + (audio.bass || 0) * 0.15;

    // Push right branch
    st.skX[ptr] = x1;
    st.skY[ptr] = y1;
    st.skLen[ptr] = nextLen;
    st.skAng[ptr] = ang + dynamicSpread + swayBase + harmonic + beatKick;
    st.skD[ptr] = d - 1;
    st.skSide[ptr] = side + 1;
    ptr++;

    // Push left branch
    st.skX[ptr] = x1;
    st.skY[ptr] = y1;
    st.skLen[ptr] = nextLen;
    st.skAng[ptr] = ang - dynamicSpread + swayBase * 0.85 + harmonic - beatKick;
    st.skD[ptr] = d - 1;
    st.skSide[ptr] = side;
    ptr++;
  }
}

ctx.lineWidth = Math.max(1.5, trunkLen * 0.045);
ctx.stroke();

// --- Glowing Leaves Draw Passes ---
ctx.globalCompositeOperation = 'screen';

// Outer bloom pass for canopy
ctx.beginPath();
ctx.fillStyle = pal.glow;
ctx.globalAlpha = 0.28 + (audio.treble || 0) * 0.3;
for (let i = 0; i < leafCount; i += 2) {
  const rad = st.lr[i] * 2.8;
  ctx.moveTo(st.lx[i] + rad, st.ly[i]);
  ctx.arc(st.lx[i], st.ly[i], rad, 0, Math.PI * 2);
}
ctx.fill();

// Sharp leaf centers
ctx.globalAlpha = 0.85;
for (let i = 0; i < leafCount; i++) {
  ctx.fillStyle = `hsl(${st.lh[i]}, ${pal.sat}%, ${pal.lit}%)`;
  ctx.beginPath();
  ctx.arc(st.lx[i], st.ly[i], st.lr[i], 0, Math.PI * 2);
  ctx.fill();
}

// Ground silhouette
ctx.globalCompositeOperation = 'source-over';
ctx.globalAlpha = 1.0;
ctx.fillStyle = '#04070d';
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(0, H * 0.94);
ctx.quadraticCurveTo(W * 0.5, H * 0.92 - st.bassPulse * 8, W, H * 0.95);
ctx.lineTo(W, H);
ctx.closePath();
ctx.fill();

ctx.restore();