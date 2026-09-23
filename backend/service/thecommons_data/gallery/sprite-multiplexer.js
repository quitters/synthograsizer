ctx.save();

const PAL = [
  '#000000', '#FFFFFF', '#880000', '#AAFFEE',
  '#CC44CC', '#00CC55', '#0000AA', '#EEEE77',
  '#DD8855', '#664400', '#FF7777', '#333333',
  '#777777', '#AAFF66', '#0088FF', '#BBBBBB'
];

const SW = 384, SH = 272;
const BX = 32, BY = 36, BW = 320, BH = 200;

if (!room.state.ready) {
  room.state.ready = true;
  room.state.buf = new OffscreenCanvas(SW, SH);
  room.state.bctx = room.state.buf.getContext('2d');
  room.state.sheet = new OffscreenCanvas(384, 96);
  const sctx = room.state.sheet.getContext('2d');

  for (let c = 0; c < 16; c++) {
    const col = PAL[c];
    const ox = c * 24;

    sctx.fillStyle = col;
    sctx.beginPath();
    sctx.arc(ox + 12, 10.5, 9, 0, Math.PI * 2);
    sctx.fill();
    sctx.fillStyle = PAL[1];
    sctx.beginPath();
    sctx.arc(ox + 9, 7.5, 2.5, 0, Math.PI * 2);
    sctx.fill();
    sctx.fillStyle = PAL[0];
    sctx.beginPath();
    sctx.arc(ox + 12, 10.5, 9, 0, Math.PI * 2);
    sctx.lineWidth = 1.5;
    sctx.stroke();

    const sy = 24;
    sctx.fillStyle = col;
    sctx.fillRect(ox + 5, sy + 3, 14, 9);
    sctx.fillRect(ox + 7, sy + 12, 10, 6);
    sctx.fillStyle = PAL[0];
    sctx.fillRect(ox + 7, sy + 6, 3, 4);
    sctx.fillRect(ox + 14, sy + 6, 3, 4);
    sctx.fillRect(ox + 11, sy + 9, 2, 2);
    sctx.fillStyle = PAL[1];
    sctx.fillRect(ox + 8, sy + 14, 2, 3);
    sctx.fillRect(ox + 11, sy + 14, 2, 3);
    sctx.fillRect(ox + 14, sy + 14, 2, 3);

    const ty = 48;
    sctx.fillStyle = col;
    sctx.beginPath();
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      const r = (a % 2 === 0) ? 10 : 4;
      const px = ox + 12 + Math.cos(ang) * r;
      const py = ty + 10.5 + Math.sin(ang) * r;
      if (a === 0) sctx.moveTo(px, py); else sctx.lineTo(px, py);
    }
    sctx.closePath();
    sctx.fill();
    sctx.fillStyle = PAL[1];
    sctx.fillRect(ox + 11, ty + 9, 2, 3);

    const dy = 72;
    sctx.fillStyle = col;
    sctx.beginPath();
    sctx.moveTo(ox + 12, dy + 2);
    sctx.lineTo(ox + 21, dy + 10.5);
    sctx.lineTo(ox + 12, dy + 19);
    sctx.lineTo(ox + 3, dy + 10.5);
    sctx.closePath();
    sctx.fill();
    sctx.fillStyle = PAL[1];
    sctx.beginPath();
    sctx.moveTo(ox + 12, dy + 2);
    sctx.lineTo(ox + 12, dy + 19);
    sctx.lineTo(ox + 3, dy + 10.5);
    sctx.closePath();
    sctx.fill();
  }

  room.state.order = new Uint8Array(64);
  room.state.spX = new Float32Array(64);
  room.state.spY = new Float32Array(64);
  room.state.spCol = new Uint8Array(64);
}

const bctx = room.state.bctx;
const speed = getVar('motion_speed') ?? 1.0;
const spread = getVar('trail_spread') ?? 1.6;
const waveType = getVar('wave_shape') ?? 'Sine Ribbon';
const spriteType = getVar('sprite_style') ?? 'Shaded Sphere';
const borderMode = getVar('border_mode') ?? 'Beat Strobe';
const tintMode = getVar('palette_tint') ?? 'Ocean Cyan';

const spriteRow = { 'Shaded Sphere': 0, 'Cyber Skull': 1, 'C64 Star': 2, 'Diamond Gem': 3 }[spriteType] ?? 0;

const tintPresets = {
  'Ocean Cyan': [6, 14, 3, 1, 3, 14, 6, 11],
  'Sunset SID': [2, 8, 10, 7, 1, 7, 10, 8],
  'Acid Phosphor': [0, 9, 5, 13, 1, 13, 5, 11],
  'Full Spectrum': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
};
const activeTint = tintPresets[tintMode] ?? tintPresets['Ocean Cyan'];

const t = frame.t * speed;
const bassBoost = audio.bass * 28;
const trebleShift = audio.treble * 16;

for (let i = 0; i < 64; i++) {
  let px = 0, py = 0;
  const fi = i * (spread * 0.08);

  if (waveType === 'Sine Ribbon') {
    px = 192 + Math.sin(t * 1.8 + fi) * (115 + bassBoost);
    py = 136 + Math.cos(t * 1.2 + fi * 0.8) * (68 + audio.mid * 20);
  } else if (waveType === 'Lissajous') {
    px = 192 + Math.sin(t * 2.1 + fi) * (120 + bassBoost * 0.5);
    py = 136 + Math.sin(t * 3.15 + fi * 1.2) * (74 + audio.mid * 15);
  } else if (waveType === 'Raster Helix') {
    const strand = (i % 2 === 0) ? 1 : -1;
    px = 192 + strand * Math.sin(t * 2.4 + fi) * (85 + bassBoost);
    py = 48 + (i / 64) * 176 + Math.sin(t * 3 + fi) * 8;
  } else {
    const bounce = Math.abs(Math.sin(t * 2 + fi * 0.6));
    px = 60 + ((i * 19 + t * 40) % 264);
    py = 200 - bounce * (140 + bassBoost);
  }

  room.state.spX[i] = px - 12;
  room.state.spY[i] = py - 10.5;
  room.state.spCol[i] = activeTint[(i + Math.floor(t * 4)) % activeTint.length];
  room.state.order[i] = i;
}

const order = room.state.order;
const spY = room.state.spY;
for (let i = 1; i < 64; i++) {
  const key = order[i];
  const valY = spY[key];
  let j = i - 1;
  while (j >= 0 && spY[order[j]] > valY) {
    order[j + 1] = order[j];
    j--;
  }
  order[j + 1] = key;
}

let borderColor = 0;
if (borderMode === 'Beat Strobe') {
  borderColor = audio.beat ? 1 : (audio.bass > 0.6 ? 14 : 0);
} else if (borderMode === 'Raster Copper') {
  borderColor = activeTint[Math.floor(t * 6) % activeTint.length];
} else if (borderMode === 'Classic VIC') {
  borderColor = 14;
} else {
  borderColor = 11;
}

bctx.fillStyle = PAL[borderColor];
bctx.fillRect(0, 0, SW, SH);

if (borderMode === 'Raster Copper') {
  for (let r = 0; r < SH; r += 4) {
    const barCol = activeTint[(Math.floor(r * 0.15 + t * 8)) % activeTint.length];
    bctx.fillStyle = PAL[barCol];
    bctx.fillRect(0, r, SW, 2);
  }
}

bctx.fillStyle = PAL[0];
bctx.fillRect(BX, BY, BW, BH);

for (let row = 0; row < 25; row++) {
  const rowCol = PAL[activeTint[(row + Math.floor(t * 3)) % activeTint.length]];
  bctx.fillStyle = rowCol;
  const wave = Math.sin(row * 0.4 + t * 3) * 6;
  for (let col = 0; col < 40; col += 2) {
    const cx = BX + col * 8 + wave;
    const cy = BY + row * 8;
    if ((col + row) % 3 === 0) {
      bctx.fillRect(cx + 2, cy + 2, 4, 4);
    } else if ((col + row) % 5 === 0) {
      bctx.fillRect(cx + 1, cy + 3, 6, 2);
    }
  }
}

if (borderMode !== 'Open Borders') {
  bctx.save();
  bctx.beginPath();
  bctx.rect(BX, BY, BW, BH);
  bctx.clip();
}

for (let i = 0; i < 64; i++) {
  const idx = order[i];
  const sx = Math.floor(room.state.spX[idx]);
  const sy = Math.floor(room.state.spY[idx]);
  const colIdx = room.state.spCol[idx] % 16;

  bctx.drawImage(room.state.sheet, colIdx * 24, spriteRow * 24, 24, 21, sx, sy, 24, 21);
}

if (borderMode !== 'Open Borders') {
  bctx.restore();
}

bctx.fillStyle = PAL[1];
bctx.fillRect(BX, BY - 14, BW, 1);
bctx.fillRect(BX, BY + BH + 13, BW, 1);

bctx.fillStyle = PAL[audio.beat ? 1 : 15];
bctx.font = '8px monospace';
bctx.textBaseline = 'top';
bctx.fillText('**** COMMODORE 64 SPRITE MULTIPLEXER (64/64) ****', BX + 8, BY - 11);

let roomText = 'ACTIVE SID VOICES: ' + (room.people ? room.people.length : 1);
if (room.people && room.people.length > 0) {
  const first = room.people[0];
  roomText += ' | TBL: ' + first.table;
}
bctx.fillText(roomText, BX + 8, BY + BH + 3);

const rasterY = Math.floor(BY + ((t * 80) % BH));
bctx.fillStyle = PAL[7];
bctx.fillRect(0, rasterY, 6, 1);
bctx.fillRect(SW - 6, rasterY, 6, 1);

ctx.imageSmoothingEnabled = false;
const scale = Math.min(frame.width / SW, frame.height / SH);
const dw = Math.floor(SW * scale);
const dh = Math.floor(SH * scale);
const dx = Math.floor((frame.width - dw) / 2);
const dy = Math.floor((frame.height - dh) / 2);

ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.drawImage(room.state.buf, 0, 0, SW, SH, dx, dy, dw, dh);

ctx.restore();