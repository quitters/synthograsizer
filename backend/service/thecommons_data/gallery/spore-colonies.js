const W = 160, H = 90;
room.state.A ??= new Float32Array(W * H).fill(1);
room.state.B ??= new Float32Array(W * H).fill(0);
room.state.nA ??= new Float32Array(W * H);
room.state.nB ??= new Float32Array(W * H);

if (!room.state.seeded) {
  room.state.seeded = true;
  for (let i = 0; i < W * H; i++) {
    if (Math.random() < 0.01) room.state.B[i] = 1.0;
  }
}

let { A, B, nA, nB } = room.state;

const patterns = {
  'Coral': { f: 0.0545, k: 0.0620 },
  'Maze': { f: 0.029, k: 0.057 },
  'Spots': { f: 0.03, k: 0.062 },
  'Mitosis': { f: 0.036, k: 0.065 }
};
const palettes = {
  'Bioluminescence': { bg: '#031221', fg1: '#00d2ff', fg2: '#3a7bd5' },
  'Coral Reef': { bg: '#0b2b26', fg1: '#ff7b54', fg2: '#ffd56b' },
  'Toxic': { bg: '#1a0b2e', fg1: '#39ff14', fg2: '#9d00ff' },
  'Magma': { bg: '#2b0000', fg1: '#ff4500', fg2: '#ffcc00' }
};

const pat = patterns[getVar('pattern')] ?? patterns['Coral'];
const pal = palettes[getVar('palette')] ?? palettes['Bioluminescence'];
const speed = getVar('growth_speed') ?? 4;
const reactivity = getVar('audio_reactivity') ?? 0.6;
const zoom = getVar('zoom') ?? 1.5;

const F = pat.f + audio.bass * 0.003 * reactivity;
const K = pat.k - audio.treble * 0.001 * reactivity;

if (audio.beat && reactivity > 0.1) {
  for(let k = 0; k < 3; k++) {
    let rx = Math.floor(Math.random() * (W - 4)) + 2;
    let ry = Math.floor(Math.random() * (H - 4)) + 2;
    A[ry * W + rx] = 0;   // seed with A consumed -- see the note on the update below
    B[ry * W + rx] = 1.0;
  }
}

// Curation fix: this used `p.id * 100`, but participant ids are hex strings,
// so every position came out NaN and nobody's seed point ever landed -- the
// piece's whole presence feature silently did nothing. Hash the id instead.
const seedOf = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0) % 1000;
};
const seedPoint = (p) => {
  const sid = seedOf(p.id);
  const time = frame.t + sid * 100;
  return [Math.floor((Math.sin(time * 0.3) * 0.4 + 0.5) * W),
          Math.floor((Math.cos(time * 0.2 + sid) * 0.4 + 0.5) * H)];
};

(room.people || []).forEach((p) => {
  let [px, py] = seedPoint(p);
  px = Math.max(2, Math.min(W - 3, px));
  py = Math.max(2, Math.min(H - 3, py));
  for(let dy = -1; dy <= 1; dy++) {
    for(let dx = -1; dx <= 1; dx++) {
      A[(py + dy) * W + (px + dx)] = 0;
      B[(py + dy) * W + (px + dx)] = 1.0;
    }
  }
});

for (let s = 0; s < speed; s++) {
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      let i = y * W + x;
      let a = A[i], b = B[i];

      let orthoA = A[i-1] + A[i+1] + A[i-W] + A[i+W];
      let diagA = A[i-W-1] + A[i-W+1] + A[i+W-1] + A[i+W+1];
      let lA = orthoA * 0.2 + diagA * 0.05 - a;

      let orthoB = B[i-1] + B[i+1] + B[i-W] + B[i+W];
      let diagB = B[i-W-1] + B[i-W+1] + B[i+W-1] + B[i+W+1];
      let lB = orthoB * 0.2 + diagB * 0.05 - b;

      // Curation fix: unclamped, a block of B=1 dropped into A=1 overshoots
      // (A went to -0.6, B to 1.9 on the first frame), the explicit update
      // blows up, and the NaN spreads through the neighbours until every cell
      // is NaN -- a permanently blank wall. Once the seeding above actually
      // worked, that happened within a second. Keep the chemistry in [0, 1].
      let abb = a * b * b;
      const na = a + (1.0 * lA - abb + F * (1 - a));
      const nb = b + (0.5 * lB + abb - (K + F) * b);
      nA[i] = na < 0 ? 0 : na > 1 ? 1 : na;
      nB[i] = nb < 0 ? 0 : nb > 1 ? 1 : nb;
    }
  }
  let tA = A; A = nA; nA = tA;
  let tB = B; B = nB; nB = tB;
}

room.state.A = A;
room.state.B = B;
room.state.nA = nA;
room.state.nB = nB;

// Curation fix: this drew every live cell with up to two fillRects and two
// globalAlpha changes -- around 28,000 canvas calls a frame on a busy field.
// Same picture, now written as pixels: each cell is 4x4, and its middle 2x2 is
// the inner fg2 square the original drew from 25% to 75% of the cell.
const CELL = 4, BW = W * CELL, BH = H * CELL;
const S = room.state;
if (!S.px) {
  S.buf = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(BW, BH)
    : Object.assign(document.createElement('canvas'), { width: BW, height: BH });
  S.bctx = S.buf.getContext('2d');
  S.img = S.bctx.createImageData(BW, BH);
  S.px = new Uint32Array(S.img.data.buffer);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pack = (r, g, b) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
const bg = hex(pal.bg), f1 = hex(pal.fg1), f2 = hex(pal.fg2);
const glow = audio.level * reactivity;
const pixels = S.px;
pixels.fill(pack(bg[0], bg[1], bg[2]));
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const b = B[y * W + x];
    if (b <= 0.03) continue;
    const a1 = Math.min(1, b * 2);
    const r1 = bg[0] + (f1[0] - bg[0]) * a1, g1 = bg[1] + (f1[1] - bg[1]) * a1, b1 = bg[2] + (f1[2] - bg[2]) * a1;
    const outer = pack(r1, g1, b1);
    let inner = outer;
    if (b > 0.15) {
      const a2 = Math.min(1, (b - 0.15) * 3 + glow);
      inner = pack(r1 + (f2[0] - r1) * a2, g1 + (f2[1] - g1) * a2, b1 + (f2[2] - b1) * a2);
    }
    let o = y * CELL * BW + x * CELL;
    for (let row = 0; row < CELL; row++, o += BW) {
      const mid = row === 1 || row === 2;
      pixels[o] = outer;
      pixels[o + 1] = mid ? inner : outer;
      pixels[o + 2] = mid ? inner : outer;
      pixels[o + 3] = outer;
    }
  }
}
S.bctx.putImageData(S.img, 0, 0);

ctx.save();
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const cellW = frame.width / W;
const cellH = frame.height / H;

ctx.translate(frame.width / 2, frame.height / 2);
ctx.scale(zoom, zoom);
ctx.translate(-frame.width / 2, -frame.height / 2);
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.buf, 0, 0, frame.width, frame.height);

(room.people || []).forEach((p) => {
  const [px, py] = seedPoint(p);

  ctx.globalAlpha = 0.6 + audio.bass * 0.4;
  ctx.fillStyle = `hsl(${p.hue}, 100%, 70%)`;
  ctx.beginPath();
  ctx.arc(px * cellW + cellW / 2, py * cellH + cellH / 2, Math.max(cellW, cellH) * 2, 0, Math.PI * 2);
  ctx.fill();
});

ctx.restore();
