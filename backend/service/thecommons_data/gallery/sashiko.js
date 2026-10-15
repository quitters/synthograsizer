ctx.save();

const S = getVar('stitch_scale') ?? 22;
const speedMult = getVar('stitch_speed') ?? 1.5;
const seedKey = getVar('pattern_seed') ?? 'kigumi_weave';
const clothKey = getVar('cloth_tone') ?? 'deep_aizome';
const threadKey = getVar('thread_style') ?? 'bleached_sashiko';

const clothPalettes = {
  deep_aizome: { bg: '#0b1626', weave: '#11223a', shadow: '#050a12' },
  tokoname_indigo: { bg: '#081a2e', weave: '#0e2744', shadow: '#030b14' },
  midnight_wash: { bg: '#0e111d', weave: '#191d30', shadow: '#06070c' },
  sumi_ink: { bg: '#101214', weave: '#1a1d20', shadow: '#070809' }
};
const cloth = clothPalettes[clothKey] ?? clothPalettes.deep_aizome;

const threadPalettes = {
  bleached_sashiko: { thread: '#f4f6fa', core: '#ffffff', sheen: 'rgba(255, 255, 255, 0.45)' },
  raw_cotton: { thread: '#e9dec7', core: '#fdf7eb', sheen: 'rgba(255, 248, 230, 0.4)' },
  golden_silk: { thread: '#e5b747', core: '#fff2b3', sheen: 'rgba(255, 220, 100, 0.5)' },
  phosphor_cyan: { thread: '#62e8df', core: '#d6fffa', sheen: 'rgba(98, 232, 223, 0.6)' }
};
const thread = threadPalettes[threadKey] ?? threadPalettes.bleached_sashiko;

const cols = Math.ceil(frame.width / S) + 2;
const rows = Math.ceil(frame.height / S) + 2;

room.state.rowSeq ??= new Uint8Array(256);
room.state.colSeq ??= new Uint8Array(256);
room.state.lastSeed ??= '';
room.state.stitchPhase ??= 0;
room.state.beatFlash ??= 0;

if (audio.beat) room.state.beatFlash = 1.0;
room.state.beatFlash = Math.max(0, room.state.beatFlash - frame.dt * 2.5);
room.state.stitchPhase += frame.dt * speedMult * 2.2;

if (room.state.lastSeed !== seedKey) {
  room.state.lastSeed = seedKey;
  const R = room.state.rowSeq;
  const C = room.state.colSeq;
  const isPrime = (n) => {
    if (n < 2) return 0;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) return 0;
    return 1;
  };
  if (seedKey === 'rabbit_fibonacci') {
    for (let i = 0; i < 256; i++) {
      R[i] = Math.floor(i * 0.6180339887) % 2;
      C[i] = Math.floor((i + 3) * 0.6180339887) % 2;
    }
  } else if (seedKey === 'rule_thirty') {
    let ca = new Uint8Array(256);
    ca[128] = 1;
    for (let step = 0; step < 120; step++) {
      const next = new Uint8Array(256);
      for (let i = 1; i < 255; i++) {
        const p = (ca[i - 1] << 2) | (ca[i] << 1) | ca[i + 1];
        next[i] = (30 >> p) & 1;
      }
      ca = next;
      if (step < 256) R[step] = ca[128 + (step % 20) - 10] & 1;
      if (step < 256) C[step] = ca[128 - (step % 20) + 10] & 1;
    }
  } else if (seedKey === 'ulam_primes') {
    for (let i = 0; i < 256; i++) {
      R[i] = isPrime(i + 1) ? 1 : 0;
      C[i] = isPrime(i + 4) ? 1 : 0;
    }
  } else if (seedKey === 'binary_shoji') {
    for (let i = 0; i < 256; i++) {
      R[i] = ((i >> 1) ^ (i >> 3)) & 1;
      C[i] = ((i >> 2) ^ (i >> 4)) & 1;
    }
  } else {
    for (let i = 0; i < 256; i++) {
      R[i] = (i % 3 === 0 || i % 7 === 0) ? 1 : 0;
      C[i] = (i % 4 === 0 || i % 5 === 0) ? 1 : 0;
    }
  }
}

const R = room.state.rowSeq;
const C = room.state.colSeq;

if (room.people && room.people.length > 0) {
  for (let k = 0; k < Math.min(room.people.length, 12); k++) {
    const h = room.people[k].hue;
    const rIdx = (h >> 1) % 256;
    const cIdx = (h * 3) % 256;
    R[rIdx] ^= 1;
    C[cIdx] ^= 1;
  }
}

ctx.fillStyle = cloth.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const diagStep = S * 0.5;
ctx.strokeStyle = cloth.weave;
ctx.lineWidth = 1;
ctx.beginPath();
for (let d = -frame.height; d < frame.width + frame.height; d += diagStep) {
  ctx.moveTo(d, 0);
  ctx.lineTo(d + frame.height, frame.height);
}
ctx.stroke();

const pad = S * 0.16;
const stitchLen = S - pad * 2;
const bassPulse = audio.bass * 2.5 + room.state.beatFlash * 1.5;
const stitchWidth = Math.max(1.8, S * 0.14 + bassPulse * 0.8);
const waveFront = (room.state.stitchPhase * 4) % (cols + rows + 40);

const hPath = new Path2D();
const vPath = new Path2D();

for (let i = 0; i < rows; i++) {
  const y = i * S;
  const rBit = R[i % 256];
  for (let j = 0; j < cols; j++) {
    const diagPos = i + j;
    if (speedMult > 0 && diagPos > waveFront && diagPos < waveFront + 2) continue;
    const isDrawn = ((j + rBit) & 1) === 0;
    if (isDrawn) {
      const x0 = j * S + pad;
      hPath.moveTo(x0, y);
      hPath.lineTo(x0 + stitchLen, y);
    }
  }
}

for (let j = 0; j < cols; j++) {
  const x = j * S;
  const cBit = C[j % 256];
  for (let i = 0; i < rows; i++) {
    const diagPos = i + j;
    if (speedMult > 0 && diagPos > waveFront && diagPos < waveFront + 2) continue;
    const isDrawn = ((i + cBit) & 1) === 0;
    if (isDrawn) {
      const y0 = i * S + pad;
      vPath.moveTo(x, y0);
      vPath.lineTo(x, y0 + stitchLen);
    }
  }
}

ctx.save();
ctx.translate(1.2, 1.6);
ctx.strokeStyle = cloth.shadow;
ctx.lineWidth = stitchWidth + 0.8;
ctx.lineCap = 'round';
ctx.stroke(hPath);
ctx.stroke(vPath);
ctx.restore();

ctx.save();
ctx.strokeStyle = thread.sheen;
ctx.lineWidth = stitchWidth + 2.5 + audio.mid * 2.0;
ctx.lineCap = 'round';
ctx.stroke(hPath);
ctx.stroke(vPath);
ctx.restore();

ctx.strokeStyle = thread.thread;
ctx.lineWidth = stitchWidth;
ctx.lineCap = 'round';
ctx.stroke(hPath);
ctx.stroke(vPath);

ctx.strokeStyle = thread.core;
ctx.lineWidth = Math.max(1, stitchWidth * 0.45);
ctx.lineCap = 'round';
ctx.stroke(hPath);
ctx.stroke(vPath);

if (speedMult > 0) {
  const needleDiag = (waveFront % (cols + rows)) * S;
  const needleMidX = Math.min(frame.width, Math.max(0, needleDiag * 0.5));
  const needleMidY = Math.min(frame.height, Math.max(0, needleDiag * 0.5));
  ctx.save();
  ctx.fillStyle = thread.core;
  ctx.shadowColor = thread.thread;
  ctx.shadowBlur = 12 + audio.bass * 16;
  ctx.beginPath();
  ctx.arc(needleMidX, needleMidY, 3.5 + audio.treble * 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

ctx.restore();