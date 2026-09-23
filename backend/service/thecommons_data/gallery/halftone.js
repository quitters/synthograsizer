const width = frame.width;
const height = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

const pitch = getVar('dot_pitch') ?? 26;
const regMode = getVar('registration') ?? 'gentle_drift';
const dotShape = getVar('dot_shape') ?? 'round_dots';
const paperChoice = getVar('paper_tone') ?? 'newsprint';
const subjectChoice = getVar('subject') ?? 'organic_blobs';
const paletteChoice = getVar('channel_palette') ?? 'classic_cmy';
const audioKick = getVar('audio_kick') ?? 1.0;

const papers = {
  newsprint: '#f4efe6',
  cream_vellum: '#fdf6e2',
  bleached: '#ffffff',
  riso_kraft: '#eedcc4'
};

const palettes = {
  classic_cmy: ['#009fe3', '#e5007d', '#fff100'],
  neon_punk: ['#00f0ff', '#ff0077', '#ffe600'],
  retro_screen: ['#1b75bb', '#ed1c24', '#fbb03b']
};

const regScales = {
  tight: 1.2,
  gentle_drift: 4.5,
  press_slip: 12.0,
  wild_offset: 24.0
};

const regMult = regScales[regMode] ?? regScales.gentle_drift;
const colors = palettes[paletteChoice] ?? palettes.classic_cmy;
const paperBg = papers[paperChoice] ?? papers.newsprint;

// Persistent physics for tactile press bounce
room.state.slip ??= { vx: 0, vy: 0, amp: 0 };
const slipState = room.state.slip;

if (audio.beat) {
  slipState.vx += (Math.sin(t * 19.3) * 6.0) * audioKick;
  slipState.vy += (Math.cos(t * 15.7) * 6.0) * audioKick;
  slipState.amp = Math.min(1.0, slipState.amp + 0.4 * audioKick);
}
slipState.vx *= Math.max(0, 1.0 - 5.0 * dt);
slipState.vy *= Math.max(0, 1.0 - 5.0 * dt);
slipState.amp *= Math.max(0, 1.0 - 3.0 * dt);

const bassKick = audio.bass * 0.28 * audioKick;
const trebleShimmer = audio.treble * 0.12 * audioKick;

// Screen rotation angles (15° Cyan, 75° Magenta, 0° Yellow) minimizing moire
const screenAngles = [0.261799, 1.308997, 0.0];

// Per-plate mechanical phase slip offsets
const slips = [
  {
    x: Math.sin(t * 0.73) * regMult + slipState.vx,
    y: Math.cos(t * 0.58) * regMult * 0.7 + slipState.vy
  },
  {
    x: Math.cos(t * 0.64 + 2.1) * regMult * 1.15 - slipState.vx * 0.7,
    y: Math.sin(t * 0.81 + 1.4) * regMult * 0.85 + slipState.vy * 0.5
  },
  {
    x: Math.sin(t * 0.49 + 4.2) * regMult * 0.9 + slipState.vy * 0.6,
    y: Math.cos(t * 0.77 + 3.6) * regMult * 1.1 - slipState.vx * 0.5
  }
];

ctx.save();
ctx.fillStyle = paperBg;
ctx.fillRect(0, 0, width, height);

// Geometry setup
const cx = width * 0.5;
const cy = height * 0.5;
const minDim = Math.min(width, height);
const scale = minDim * 0.5;
const boundDiag = Math.hypot(cx, cy) + pitch * 2;
const maxDots = Math.ceil(boundDiag / pitch);

// Precompute soft image anchor centers
let p0Hue = (room.people && room.people[0]) ? (room.people[0].hue / 360) : 0;
let p1Hue = (room.people && room.people[1]) ? (room.people[1].hue / 360) : 0.5;

const b1x = cx + Math.sin(t * 0.38 + p0Hue * 6.28) * scale * 0.5;
const b1y = cy + Math.cos(t * 0.31) * scale * 0.42;
const b2x = cx + Math.cos(t * 0.44 + 2.1 + p1Hue * 6.28) * scale * 0.52;
const b2y = cy + Math.sin(t * 0.49 + 1.3) * scale * 0.4;
const b3x = cx + Math.sin(t * 0.28 + 4.1) * scale * 0.46;
const b3y = cy + Math.cos(t * 0.36 + 3.2) * scale * 0.48;

const r1Sq = (scale * 0.72) ** 2;
const r2Sq = (scale * 0.78) ** 2;
const r3Sq = (scale * 0.68) ** 2;
const maxRadius = pitch * 0.64;

ctx.globalCompositeOperation = 'multiply';

// Render each CMY printing plate
for (let ch = 0; ch < 3; ch++) {
  const angle = screenAngles[ch];
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const slip = slips[ch];

  ctx.save();
  ctx.translate(cx + slip.x, cy + slip.y);
  ctx.rotate(angle);
  ctx.beginPath();

  // Demoscene scan: rectilinear screen coordinates stepped with constant delta
  for (let i = -maxDots; i <= maxDots; i++) {
    const u = i * pitch;
    const uSq = u * u;
    if (uSq >= boundDiag * boundDiag) continue;

    const vLimit = Math.sqrt(boundDiag * boundDiag - uSq);
    const jMax = Math.floor(vLimit / pitch);
    const vStart = -jMax * pitch;

    let wx = cx + slip.x + u * cosA - vStart * sinA;
    let wy = cy + slip.y + u * sinA + vStart * cosA;
    const dWx = -pitch * sinA;
    const dWy = pitch * cosA;

    for (let j = -jMax; j <= jMax; j++) {
      const v = j * pitch;

      // Fast distance fields
      const d1 = ((wx - b1x) ** 2 + (wy - b1y) ** 2) / r1Sq;
      const d2 = ((wx - b2x) ** 2 + (wy - b2y) ** 2) / r2Sq;
      const d3 = ((wx - b3x) ** 2 + (wy - b3y) ** 2) / r3Sq;

      let density = 0;
      if (subjectChoice === 'organic_blobs') {
        const v1 = 1.0 / (1.0 + d1 * 4.2);
        const v2 = 1.0 / (1.0 + d2 * 3.8);
        const v3 = 1.0 / (1.0 + d3 * 4.5);
        if (ch === 0) density = v1 * 0.95 + v2 * 0.25;
        else if (ch === 1) density = v2 * 0.95 + v3 * 0.25;
        else density = v3 * 0.92 + v1 * 0.35;
      } else if (subjectChoice === 'orbital_rings') {
        const q1 = Math.sqrt(d1);
        const q2 = Math.sqrt(d2);
        const q3 = Math.sqrt(d3);
        const w1 = 0.5 + 0.48 * Math.sin(q1 * 8.5 - t * 1.6);
        const w2 = 0.5 + 0.48 * Math.sin(q2 * 7.8 - t * 1.3 + 2.0);
        const w3 = 0.5 + 0.48 * Math.sin(q3 * 9.2 + t * 1.8 + 4.0);
        if (ch === 0) density = w1 * 0.85 + w2 * 0.15;
        else if (ch === 1) density = w2 * 0.85 + w3 * 0.15;
        else density = w3 * 0.85 + w1 * 0.2;
      } else {
        // fluid_harmonics
        const nx = (wx - cx) / scale;
        const ny = (wy - cy) / scale;
        const falloff = Math.max(0, 1.0 - (nx * nx + ny * ny) * 0.4);
        const h1 = 0.5 + 0.45 * Math.sin(nx * 3.2 + ny * 2.1 + t * 0.9);
        const h2 = 0.5 + 0.45 * Math.sin(-nx * 2.5 + ny * 3.3 - t * 0.8);
        const h3 = 0.5 + 0.45 * Math.sin(nx * 1.9 - ny * 3.1 + t * 0.7);
        if (ch === 0) density = (h1 * 0.8 + h2 * 0.2) * falloff;
        else if (ch === 1) density = (h2 * 0.8 + h3 * 0.2) * falloff;
        else density = (h3 * 0.8 + h1 * 0.25) * falloff;
      }

      density += bassKick * 0.35 + trebleShimmer;
      const dotR = Math.min(maxRadius, maxRadius * Math.max(0, density));

      if (dotR > 0.65) {
        if (dotShape === 'round_dots') {
          ctx.moveTo(u + dotR, v);
          ctx.arc(u, v, dotR, 0, 6.2831853);
        } else if (dotShape === 'diamond_screen') {
          ctx.moveTo(u, v - dotR);
          ctx.lineTo(u + dotR, v);
          ctx.lineTo(u, v + dotR);
          ctx.lineTo(u - dotR, v);
          ctx.closePath();
        } else {
          // square_halftone
          const half = dotR * 0.88;
          ctx.rect(u - half, v - half, half * 2, half * 2);
        }
      }

      wx += dWx;
      wy += dWy;
    }
  }

  ctx.fillStyle = colors[ch];
  ctx.fill();
  ctx.restore();
}

// Press registration crosshairs at the four corners
const margin = 32;
const corners = [
  [margin, margin],
  [width - margin, margin],
  [margin, height - margin],
  [width - margin, height - margin]
];

for (let ch = 0; ch < 3; ch++) {
  ctx.strokeStyle = colors[ch];
  ctx.lineWidth = 1.2;
  const slip = slips[ch];
  for (let k = 0; k < 4; k++) {
    const px = corners[k][0] + slip.x;
    const py = corners[k][1] + slip.y;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, 6.2831853);
    ctx.moveTo(px - 12, py);
    ctx.lineTo(px + 12, py);
    ctx.moveTo(px, py - 12);
    ctx.lineTo(px, py + 12);
    ctx.stroke();
  }
}

ctx.restore();