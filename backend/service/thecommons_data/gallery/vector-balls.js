// VECTOR BALLS -- a shape made of shaded balls, spun in 3D, perspective
// projected, and painted back to front. Each ball is ONE pre-rendered sprite
// scaled by depth; that trick is why these could run on 1990s hardware.
const S = room.state;
const W = frame.width, H = frame.height;
const dt = Math.min(frame.dt, 0.1);

const shape = getVar('shape') ?? 'cube';
if (S.shapeKey !== shape) {
  const pts = [];
  if (shape === 'sphere') {
    const n = 90, g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * g;
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
  } else if (shape === 'torus') {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 7; j++) {
      const a = (i / 16) * Math.PI * 2, b = (j / 7) * Math.PI * 2, r = 0.72 + 0.28 * Math.cos(b);
      pts.push([Math.cos(a) * r, 0.28 * Math.sin(b), Math.sin(a) * r]);
    }
  } else if (shape === 'double helix') {
    for (let i = 0; i < 40; i++) {
      const y = (i / 39) * 2 - 1, a = i * 0.45;
      pts.push([Math.cos(a) * 0.55, y, Math.sin(a) * 0.55]);
      pts.push([Math.cos(a + Math.PI) * 0.55, y, Math.sin(a + Math.PI) * 0.55]);
    }
  } else {
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
      pts.push([x / 1.5 - 1, y / 1.5 - 1, z / 1.5 - 1]);
    }
  }
  S.pts = pts;
  S.shapeKey = shape;
}

// Pre-render one sprite per colour: a ball with its highlight painted in.
const PALETTES = {
  chrome: [['#ffffff', '#8ecbff', '#0d2240']],
  gold:   [['#fffbe0', '#ffb300', '#4a2400']],
  rgb:    [['#ffd0d0', '#ff2a2a', '#400000'], ['#d0ffd0', '#22dd44', '#003300'], ['#d0e0ff', '#2a6bff', '#000a40']],
  sunset: [['#ffe0f0', '#ff3d8b', '#3a0020'], ['#fff0d0', '#ff8a1f', '#401800']],
};
const palName = getVar('palette') ?? 'chrome';
if (S.palKey !== palName) {
  S.sprites = (PALETTES[palName] ?? PALETTES.chrome).map(([hi, mid, lo]) => {
    const c = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(64, 64)
      : Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(24, 22, 3, 32, 32, 31);
    grad.addColorStop(0, hi);
    grad.addColorStop(0.35, mid);
    grad.addColorStop(1, lo);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
    return c;
  });
  S.palKey = palName;
}

S.ax = (S.ax ?? 0) + dt * (getVar('spin_x') ?? 0.7) + (audio.beat ? 0.15 : 0);
S.ay = (S.ay ?? 0) + dt * (getVar('spin_y') ?? 1.1);
S.az = (S.az ?? 0) + dt * 0.2;
const [cx1, sx1, cy1, sy1, cz1, sz1] = [Math.cos(S.ax), Math.sin(S.ax), Math.cos(S.ay), Math.sin(S.ay),
                                        Math.cos(S.az), Math.sin(S.az)];

// Backdrop: a dark gradient with a floor line, the way most intros framed these.
ctx.save();
const bg = ctx.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, '#03030f');
bg.addColorStop(0.72, '#0b0a2a');
bg.addColorStop(0.73, '#1d0f3a');
bg.addColorStop(1, '#040208');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

const R = Math.min(W, H) * 0.3;
const cx = W / 2, cy = H * 0.44 + Math.sin(frame.t * 1.3) * H * 0.03;
const unit = Math.min(W, H) / 360;
const base = (getVar('ball_size') ?? 8) * unit * (1 + audio.bass * 0.35);
const projected = S.pts.map(([x, y, z], i) => {
  let a = x * cz1 - y * sz1, b = x * sz1 + y * cz1;           // z-axis
  let y2 = b * cx1 - z * sx1, z2 = b * sx1 + z * cx1;         // x-axis
  const x3 = a * cy1 + z2 * sy1, z3 = -a * sy1 + z2 * cy1;    // y-axis
  const f = 2.6 / (2.6 + z3);
  return { x: cx + x3 * f * R, y: cy + y2 * f * R, z: z3, f, i };
});
projected.sort((p, q) => q.z - p.z);   // far first, so near balls paint over them

for (const p of projected) {
  const r = base * p.f * 1.4;
  ctx.globalAlpha = 0.45 + 0.55 * Math.min(1, Math.max(0, (1.2 - p.z) / 2.4));
  ctx.drawImage(S.sprites[p.i % S.sprites.length], p.x - r, p.y - r, r * 2, r * 2);
}
ctx.restore();
