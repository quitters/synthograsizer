ctx.save();
const W = frame.width;
const H = frame.height;
const S = Math.min(W, H);

// --- State & Buffer Initialization (demoscene flat buffers, zero allocation in hot loops) ---
const MAX_NODES = 420;
const MAX_ATTR = 320;
const MAX_LEAVES = 300;

if (!room.state.ready) {
  room.state.ready = true;
  room.state.nX = new Float32Array(MAX_NODES);
  room.state.nY = new Float32Array(MAX_NODES);
  room.state.nP = new Int16Array(MAX_NODES);
  room.state.nD = new Int16Array(MAX_NODES);
  room.state.nW = new Float32Array(MAX_NODES);
  room.state.nChild = new Int16Array(MAX_NODES);
  room.state.nCount = 0;

  room.state.aX = new Float32Array(MAX_ATTR);
  room.state.aY = new Float32Array(MAX_ATTR);
  room.state.aLive = new Uint8Array(MAX_ATTR);
  room.state.aCount = 0;

  room.state.dirX = new Float32Array(MAX_NODES);
  room.state.dirY = new Float32Array(MAX_NODES);
  room.state.dirC = new Int16Array(MAX_NODES);

  room.state.lX = new Float32Array(MAX_LEAVES);
  room.state.lY = new Float32Array(MAX_LEAVES);
  room.state.lHue = new Float32Array(MAX_LEAVES);
  room.state.lScale = new Float32Array(MAX_LEAVES);
  room.state.lAge = new Float32Array(MAX_LEAVES);
  room.state.lCount = 0;

  room.state.seasonAge = 0;
  room.state.season = 0; // 0: grow, 1: bloom, 2: autumn, 3: rest
  room.state.needsSeed = true;
}

const st = room.state;
const rate = getVar('growth_rate') ?? 3;
const spread = getVar('branch_spread') ?? 60;
const shape = getVar('canopy_shape') || 'elm_dome';
const pal = getVar('season_palette') || 'verdant_spring';

const palettes = {
  verdant_spring: { trunk: '#2a1a0e', leafBase: 120, leafSpan: 40, sky: '#060907', glow: 'rgba(90, 220, 110, ' },
  sakura_twilight: { trunk: '#22161c', leafBase: 330, leafSpan: 35, sky: '#08060c', glow: 'rgba(255, 150, 200, ' },
  golden_autumn: { trunk: '#261408', leafBase: 35, leafSpan: 45, sky: '#0b0704', glow: 'rgba(255, 180, 60, ' },
  bioluminescent: { trunk: '#0a1424', leafBase: 180, leafSpan: 60, sky: '#02050e', glow: 'rgba(60, 230, 255, ' }
};
const theme = palettes[pal] ?? palettes.verdant_spring;

// --- Seeding Routine ---
function seedTree() {
  st.nCount = 0;
  st.aCount = 0;
  st.lCount = 0;
  st.season = 0;
  st.seasonAge = 0;

  // Trunk base and initial leader segments
  const rootX = W * 0.5;
  const rootY = H * 0.88;
  const segLen = S * 0.024;

  let p = -1;
  for (let i = 0; i < 4; i++) {
    const idx = st.nCount++;
    st.nX[idx] = rootX;
    st.nY[idx] = rootY - i * segLen;
    st.nP[idx] = p;
    st.nD[idx] = i;
    st.nW[idx] = 1;
    st.nChild[idx] = 0;
    p = idx;
  }

  // Distribute attractors by chosen canopy crown profile
  const crownY = H * 0.42;
  const rx = S * 0.36;
  const ry = S * 0.28;
  let placed = 0;
  let tries = 0;

  while (placed < MAX_ATTR && tries < 2000) {
    tries++;
    const u = (Math.random() - 0.5) * 2;
    const v = (Math.random() - 0.5) * 2;
    if (u * u + v * v > 1) continue;

    let px = rootX + u * rx;
    let py = crownY + v * ry;

    if (shape === 'tall_pine') {
      const t = (v + 1) * 0.5; // 0 top, 1 bottom
      const taper = 0.15 + t * 0.85;
      px = rootX + u * rx * taper * 0.7;
      py = crownY - S * 0.05 + (v * 1.2) * ry;
    } else if (shape === 'weeping_willow') {
      const drop = Math.pow(Math.abs(u), 1.5) * S * 0.25;
      py = crownY - S * 0.08 + (v * 0.7) * ry + drop;
      px = rootX + u * rx * 1.1;
    } else if (shape === 'sprawling_oak') {
      px = rootX + u * rx * 1.35;
      py = crownY + v * ry * 0.65 - S * 0.04;
    }

    // Keep canopy clear of ground
    if (py > rootY - S * 0.08) continue;

    st.aX[placed] = px;
    st.aY[placed] = py;
    st.aLive[placed] = 1;
    placed++;
  }
  st.aCount = placed;
}

if (st.needsSeed || st.nCount === 0) {
  seedTree();
  st.needsSeed = false;
}

// --- Space Colonization Growth Step ---
const killDist = S * 0.028;
const killDistSq = killDist * killDist;
const maxDist = (spread / 100) * S * 0.42;
const maxDistSq = maxDist * maxDist;
const stepLen = S * 0.022 * (1 + audio.bass * 0.35);

if (st.season === 0 && st.nCount < MAX_NODES - 10) {
  const subSteps = Math.min(rate, 4);
  for (let s = 0; s < subSteps && st.nCount < MAX_NODES - 10; s++) {
    // Reset influence accumulators
    st.dirX.fill(0);
    st.dirY.fill(0);
    st.dirC.fill(0);

    let liveCount = 0;
    for (let a = 0; a < st.aCount; a++) {
      if (!st.aLive[a]) continue;
      liveCount++;
      const ax = st.aX[a];
      const ay = st.aY[a];
      let nearestIdx = -1;
      let minDistSq = maxDistSq;

      for (let n = 0; n < st.nCount; n++) {
        const dx = ax - st.nX[n];
        const dy = ay - st.nY[n];
        const dsq = dx * dx + dy * dy;
        if (dsq < minDistSq) {
          minDistSq = dsq;
          nearestIdx = n;
        }
      }

      if (nearestIdx !== -1) {
        if (minDistSq < killDistSq) {
          st.aLive[a] = 0;
        } else {
          const dist = Math.sqrt(minDistSq);
          st.dirX[nearestIdx] += (ax - st.nX[nearestIdx]) / dist;
          st.dirY[nearestIdx] += (ay - st.nY[nearestIdx]) / dist;
          st.dirC[nearestIdx]++;
        }
      }
    }

    const currentNodes = st.nCount;
    for (let n = 0; n < currentNodes && st.nCount < MAX_NODES; n++) {
      if (st.dirC[n] > 0) {
        let vx = st.dirX[n] / st.dirC[n];
        let vy = st.dirY[n] / st.dirC[n];
        // Subtle natural curl via simplex proxy
        const curl = Math.sin(st.nX[n] * 0.02 + frame.t) * 0.15;
        const cx = vx - vy * curl;
        const cy = vy + vx * curl;
        const vlen = Math.sqrt(cx * cx + cy * cy) || 1;

        const nxt = st.nCount++;
        st.nX[nxt] = st.nX[n] + (cx / vlen) * stepLen;
        st.nY[nxt] = st.nY[n] + (cy / vlen) * stepLen;
        st.nP[nxt] = n;
        st.nD[nxt] = st.nD[n] + 1;
        st.nW[nxt] = 1;
        st.nChild[nxt] = 0;
        st.nChild[n]++;
      }
    }

    if (liveCount < 8 || st.nCount >= MAX_NODES - 12) {
      st.season = 1; // transition to bloom
      break;
    }
  }

  // Calculate branch thickening: accumulate child weight upwards
  for (let n = st.nCount - 1; n > 0; n--) {
    const parent = st.nP[n];
    if (parent >= 0) {
      st.nW[parent] = Math.min(st.nW[parent] + st.nW[n] * 0.14, 28);
    }
  }
}

// --- Season State Machine ---
st.seasonAge += frame.dt;
if (st.season === 0 && st.seasonAge > 14) st.season = 1;
else if (st.season === 1 && st.seasonAge > 24) st.season = 2;
else if (st.season === 2 && st.seasonAge > 34) st.season = 3;
else if (st.season === 3 && st.seasonAge > 40) {
  seedTree();
}

// Spawn leaves at tips during bloom
if (st.season >= 1 && st.season <= 2 && st.lCount < MAX_LEAVES) {
  const spawnRate = (st.season === 1 ? 4 : 1);
  for (let s = 0; s < spawnRate && st.lCount < MAX_LEAVES; s++) {
    const candidate = Math.floor(Math.random() * st.nCount);
    if (st.nChild[candidate] === 0 || st.nD[candidate] > 8) {
      const l = st.lCount++;
      st.lX[l] = st.nX[candidate] + (Math.random() - 0.5) * 14;
      st.lY[l] = st.nY[candidate] + (Math.random() - 0.5) * 14;
      const personHue = (room.people && room.people.length > 0)
        ? (room.people[l % room.people.length].hue ?? theme.leafBase)
        : theme.leafBase;
      st.lHue[l] = personHue + (Math.random() - 0.5) * theme.leafSpan;
      st.lScale[l] = 0.1;
      st.lAge[l] = 0;
    }
  }
}

// --- Rendering ---
// Deep atmospheric background
const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.55, S * 0.1, W * 0.5, H * 0.55, S * 0.85);
bgGrad.addColorStop(0, '#101622');
bgGrad.addColorStop(0.6, theme.sky);
bgGrad.addColorStop(1, '#020306');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Mote / spore dust in background reacting to treble
ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
for (let i = 0; i < 40; i++) {
  const mx = (Math.sin(i * 99 + frame.t * 0.2) * 0.5 + 0.5) * W;
  const my = (Math.cos(i * 33 + frame.t * 0.15) * 0.5 + 0.5) * H * 0.85;
  const sz = (Math.sin(i + frame.t * 2) * 0.5 + 0.5) * 2 + audio.treble * 3;
  ctx.beginPath();
  ctx.arc(mx, my, sz, 0, Math.PI * 2);
  ctx.fill();
}

// Draw remaining attraction points as faint guide stars in growth phase
if (st.season === 0) {
  ctx.fillStyle = theme.glow + (0.15 + audio.mid * 0.2) + ')';
  for (let a = 0; a < st.aCount; a++) {
    if (!st.aLive[a]) continue;
    ctx.fillRect(st.aX[a] - 1.2, st.aY[a] - 1.2, 2.4, 2.4);
  }
}

// Ground swell / hill
ctx.fillStyle = '#05070a';
ctx.beginPath();
ctx.ellipse(W * 0.5, H + S * 0.15, S * 0.55, S * 0.28, 0, 0, Math.PI * 2);
ctx.fill();

// Draw Tree Skeleton (Branches thickening towards root)
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

for (let n = 1; n < st.nCount; n++) {
  const p = st.nP[n];
  if (p < 0) continue;

  const w = Math.max(1.2, Math.sqrt(st.nW[n]) * (1.8 + audio.bass * 0.4));
  ctx.beginPath();
  ctx.moveTo(st.nX[p], st.nY[p]);
  ctx.lineTo(st.nX[n], st.nY[n]);

  // Subtle depth color shading
  const depthFactor = Math.min(st.nD[n] / 24, 1);
  ctx.lineWidth = w;
  ctx.strokeStyle = depthFactor > 0.6 ? '#4a382e' : theme.trunk;
  ctx.stroke();
}

// Draw Leaves and Blossoms
const wind = Math.sin(frame.t * 1.5) * 8 + (audio.beat ? 14 : 0);
const bassPulse = 1 + audio.bass * 0.45;

for (let l = 0; l < st.lCount; l++) {
  st.lAge[l] += frame.dt;
  if (st.lScale[l] < 1) st.lScale[l] = Math.min(1, st.lScale[l] + frame.dt * 1.5);

  let lx = st.lX[l];
  let ly = st.lY[l];
  let hue = st.lHue[l];
  let alpha = 0.85;

  // Autumn leaf drop physics
  if (st.season >= 2) {
    const fallT = Math.max(0, st.seasonAge - 24);
    ly += fallT * fallT * 8 + Math.sin(l + frame.t * 2) * 2;
    lx += Math.sin(l * 1.3 + frame.t) * 16 + wind * 0.5;
    hue = (hue + fallT * 6) % 360; // shift to rust/carmine
    if (ly > H * 0.9) {
      ly = H * 0.9 + Math.sin(l) * 6; // settle on mound
      alpha = Math.max(0.1, 0.9 - (st.seasonAge - 30) * 0.2);
    }
  }

  if (st.season === 3) {
    alpha = Math.max(0, 1 - (st.seasonAge - 34) * 0.35);
  }

  if (alpha <= 0.01) continue;

  const leafSize = (4 + Math.sin(l + frame.t * 2.5) * 1.5) * st.lScale[l] * bassPulse;
  const rot = Math.sin(frame.t * 1.2 + l) * 0.5;

  ctx.save();
  ctx.translate(lx, ly);
  ctx.rotate(rot);
  ctx.fillStyle = 'hsla(' + (hue % 360) + ', 75%, 58%, ' + alpha + ')';

  // Pointed almond leaf path
  ctx.beginPath();
  ctx.moveTo(0, -leafSize * 1.4);
  ctx.quadraticCurveTo(leafSize * 0.9, 0, 0, leafSize * 1.4);
  ctx.quadraticCurveTo(-leafSize * 0.9, 0, 0, -leafSize * 1.4);
  ctx.fill();

  // Luminous core for bloom or bioluminescence
  if (pal === 'bioluminescent' || pal === 'sakura_twilight') {
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.4 * alpha) + ')';
    ctx.beginPath();
    ctx.arc(0, 0, leafSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Ambient crown aura reacting to musical mid & bass
ctx.save();
ctx.globalCompositeOperation = 'screen';
const auraGrad = ctx.createRadialGradient(W * 0.5, H * 0.44, S * 0.05, W * 0.5, H * 0.44, S * 0.45);
auraGrad.addColorStop(0, theme.glow + ((0.08 + audio.mid * 0.12)) + ')');
auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = auraGrad;
ctx.fillRect(0, 0, W, H);
ctx.restore();

ctx.restore();