ctx.save();

// Persistent buffers & state
room.state.angle ??= 0;
room.state.px ??= new Float32Array(4);
room.state.pz ??= new Float32Array(4);
room.state.sineLUT ??= (() => {
  const lut = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) lut[i] = Math.sin((i / 1024) * Math.PI * 2);
  return lut;
})();

const lut = room.state.sineLUT;
const fastSin = (a) => {
  const idx = (((a * 162.97466) % 1024) + 1024) % 1024 | 0;
  return lut[idx];
};
const fastCos = (a) => fastSin(a + 1.5707963);

// Audio-driven speed update
const beatKick = audio.beat ? 4.5 : (audio.bass * 2.2);
const twistSpeed = 1.1 + beatKick;
room.state.angle += twistSpeed * frame.dt;

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;

// Variable reads with defaults
const sliceCount = getVar('slice_count') ?? 120;
const turns = getVar('twist_turns') ?? 3;
const colRadius = getVar('column_width') ?? 200;
const flare = (getVar('flare_intensity') ?? 5) / 10;
const paletteChoice = getVar('palette_mode') ?? 'copper';
const shadingChoice = getVar('shading_style') ?? 'classic_gouraud';

// Palette definitions [r, g, b] bases and highlights
const palettes = {
  copper: {
    bg: '#040108',
    faces: [
      [255, 110, 40],
      [210, 50, 20],
      [160, 25, 10],
      [255, 180, 80]
    ],
    rim: 'rgba(255, 170, 70, 0.4)'
  },
  cyber_neon: {
    bg: '#020612',
    faces: [
      [0, 240, 255],
      [240, 0, 180],
      [30, 80, 230],
      [180, 255, 230]
    ],
    rim: 'rgba(0, 255, 255, 0.35)'
  },
  monolith_gold: {
    bg: '#090806',
    faces: [
      [240, 200, 90],
      [130, 100, 35],
      [40, 35, 30],
      [255, 240, 170]
    ],
    rim: 'rgba(240, 210, 110, 0.3)'
  },
  toxic_acid: {
    bg: '#020902',
    faces: [
      [80, 255, 50],
      [20, 160, 40],
      [10, 60, 20],
      [200, 255, 120]
    ],
    rim: 'rgba(90, 255, 70, 0.35)'
  }
};
const pal = palettes[paletteChoice] ?? palettes.copper;

// Deep backdrop with subtle raster scan
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

// Atmospheric side-glow / beam
if (flare > 0) {
  const flareGrad = ctx.createRadialGradient(cx, H * 0.5, 30, cx, H * 0.5, W * 0.6);
  flareGrad.addColorStop(0, pal.rim);
  flareGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.2)');
  flareGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = flareGrad;
  ctx.fillRect(0, 0, W, H);
}

// Optional audience echoes in margin pillars
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 16);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const py = ((i + 0.5) / pCount) * H;
    ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${0.25 + audio.mid * 0.4})`;
    ctx.fillRect(18, py - 3, 6, 6);
    ctx.fillRect(W - 24, py - 3, 6, 6);
  }
}

// Light direction (front-left, slightly high)
const lx = -0.55;
const lz = 0.835;
const sliceH = Math.ceil(H / sliceCount) + 1;
const twistFactor = (turns * Math.PI * 2) / H;
const baseA = room.state.angle;

// Sine wobble on column center for dynamic curve
const wobbleAmp = W * 0.08 * (1.0 + audio.treble * 0.5);
const pxBuf = room.state.px;
const pzBuf = room.state.pz;

for (let s = 0; s < sliceCount; s++) {
  const y = (s / sliceCount) * H;
  const a = baseA + y * twistFactor;
  const sliceCx = cx + fastSin(a * 0.5 + frame.t * 0.8) * wobbleAmp;

  // Four rotating vertices of square cross section
  for (let k = 0; k < 4; k++) {
    const ang = a + k * 1.57079632679;
    pxBuf[k] = sliceCx + colRadius * fastSin(ang);
    pzBuf[k] = colRadius * fastCos(ang);
  }

  // Render front-facing edges (px[next] > px[k])
  for (let k = 0; k < 4; k++) {
    const next = (k + 1) & 3;
    const x0 = pxBuf[k];
    const x1 = pxBuf[next];

    if (x1 > x0) {
      const z0 = pzBuf[k];
      const z1 = pzBuf[next];
      const edgeW = x1 - x0;
      if (edgeW < 0.5) continue;

      // Face normal dot light
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const dot = Math.max(0.04, nx * lx + nz * lz);
      const shade = Math.min(1.0, dot * 1.2 + audio.mid * 0.2);

      const baseCol = pal.faces[k];
      const r = (baseCol[0] * shade) | 0;
      const g = (baseCol[1] * shade) | 0;
      const b = (baseCol[2] * shade) | 0;

      if (shadingChoice === 'classic_gouraud') {
        // Smooth horizontal fade across the slice face
        const grad = ctx.createLinearGradient(x0, y, x1, y);
        const rL = (r * 0.55) | 0;
        const gL = (g * 0.55) | 0;
        const bL = (b * 0.55) | 0;
        const rH = Math.min(255, (r * 1.45) | 0);
        const gH = Math.min(255, (g * 1.45) | 0);
        const bH = Math.min(255, (b * 1.45) | 0);
        grad.addColorStop(0, `rgb(${rL},${gL},${bL})`);
        grad.addColorStop(0.5, `rgb(${r},${g},${b})`);
        grad.addColorStop(1, `rgb(${rH},${gH},${bH})`);
        ctx.fillStyle = grad;
        ctx.fillRect(x0, y, edgeW, sliceH);
      } else if (shadingChoice === 'flat_faceted') {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x0, y, edgeW, sliceH);
      } else {
        // scanline_wire
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x0, y, edgeW, Math.max(1, sliceH - 2));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x0, y, 1.5, sliceH);
        ctx.fillRect(x1 - 1.5, y, 1.5, sliceH);
      }
    }
  }
}

// Center specular glint on beat
if (audio.beat) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + audio.bass * 0.25})`;
  ctx.fillRect(cx - colRadius * 0.6, 0, colRadius * 1.2, H);
  ctx.restore();
}

ctx.restore();