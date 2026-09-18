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
    B[ry * W + rx] = 1.0;
  }
}

(room.people || []).forEach((p) => {
  let time = frame.t + p.id * 100;
  let px = Math.floor((Math.sin(time * 0.3) * 0.4 + 0.5) * W);
  let py = Math.floor((Math.cos(time * 0.2 + p.id) * 0.4 + 0.5) * H);
  px = Math.max(2, Math.min(W - 3, px));
  py = Math.max(2, Math.min(H - 3, py));
  for(let dy = -1; dy <= 1; dy++) {
    for(let dx = -1; dx <= 1; dx++) {
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

      let abb = a * b * b;
      nA[i] = a + (1.0 * lA - abb + F * (1 - a));
      nB[i] = b + (0.5 * lB + abb - (K + F) * b);
    }
  }
  let tA = A; A = nA; nA = tA;
  let tB = B; B = nB; nB = tB;
}

room.state.A = A;
room.state.B = B;
room.state.nA = nA;
room.state.nB = nB;

ctx.save();
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

let cellW = frame.width / W;
let cellH = frame.height / H;

ctx.translate(frame.width / 2, frame.height / 2);
ctx.scale(zoom, zoom);
ctx.translate(-frame.width / 2, -frame.height / 2);

for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    let b = B[y * W + x];
    if (b > 0.03) {
      let cx = x * cellW;
      let cy = y * cellH;

      ctx.globalAlpha = Math.min(1, b * 2);
      ctx.fillStyle = pal.fg1;
      ctx.fillRect(cx, cy, cellW + 0.5, cellH + 0.5);

      if (b > 0.15) {
        ctx.globalAlpha = Math.min(1, (b - 0.15) * 3 + audio.level * reactivity);
        ctx.fillStyle = pal.fg2;
        ctx.fillRect(cx + cellW * 0.25, cy + cellH * 0.25, cellW * 0.5, cellH * 0.5);
      }
    }
  }
}

(room.people || []).forEach((p) => {
  let time = frame.t + p.id * 100;
  let px = Math.floor((Math.sin(time * 0.3) * 0.4 + 0.5) * W);
  let py = Math.floor((Math.cos(time * 0.2 + p.id) * 0.4 + 0.5) * H);

  ctx.globalAlpha = 0.6 + audio.bass * 0.4;
  ctx.fillStyle = `hsl(${p.hue}, 100%, 70%)`;
  ctx.beginPath();
  ctx.arc(px * cellW + cellW / 2, py * cellH + cellH / 2, Math.max(cellW, cellH) * 2, 0, Math.PI * 2);
  ctx.fill();
});

ctx.restore();
