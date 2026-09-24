ctx.save();

if (!room.state.lut) {
  room.state.lut = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) {
    room.state.lut[i] = Math.sin(i * 12.9898 + (i % 37) * 78.233) * 43758.5453;
    room.state.lut[i] -= Math.floor(room.state.lut[i]);
    room.state.lut[i] = room.state.lut[i] * 2 - 1;
  }
  room.state.beatDecay = 0;
}

if (audio && audio.beat) {
  room.state.beatDecay = 1.0;
} else {
  room.state.beatDecay = Math.max(0, (room.state.beatDecay || 0) - frame.dt * 2.5);
}

const cols = getVar('column_count') ?? 14;
const chaos = getVar('chaos_factor') ?? 1.5;
const speed = getVar('cycle_speed') ?? 0.4;
const paletteName = getVar('palette_mode') || 'schotter_1968';
const styleName = getVar('render_style') || 'fine_ink';

const bass = audio ? audio.bass : 0;
const treble = audio ? audio.treble : 0;
const level = audio ? audio.level : 0;

const breathe = (Math.sin(frame.t * speed * Math.PI) * 0.5 + 0.5);
const totalChaos = chaos * (0.35 + 0.65 * breathe + bass * 0.55 + room.state.beatDecay * 0.4);

let bg = '#ebe5d8';
let strokeCol = '#1a1917';
let accentCol = '#c4281c';
let fillCol = 'rgba(26, 25, 23, 0.04)';

if (paletteName === 'phosphor_mono') {
  bg = '#080d09';
  strokeCol = '#38e359';
  accentCol = '#9efcb0';
  fillCol = 'rgba(56, 227, 89, 0.06)';
} else if (paletteName === 'constructivist') {
  bg = '#dfd7c5';
  strokeCol = '#141414';
  accentCol = '#cc2a1a';
  fillCol = 'rgba(204, 42, 26, 0.08)';
} else if (paletteName === 'deep_spectral') {
  bg = '#0b0f19';
  strokeCol = '#47b0e8';
  accentCol = '#f26488';
  fillCol = 'rgba(71, 176, 232, 0.07)';
}

ctx.fillStyle = bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const rows = Math.round(cols * 1.8);
const marginY = frame.height * 0.08;
const usableH = frame.height - marginY * 2;
const cellSize = usableH / rows;
const usableW = cols * cellSize;
const originX = (frame.width - usableW) * 0.5 + cellSize * 0.5;
const originY = marginY + cellSize * 0.5;
const halfSize = cellSize * 0.44;

const lut = room.state.lut;
const people = room.people || [];
const hasPeople = people.length > 0;

ctx.lineWidth = Math.max(1, cellSize * 0.045);
ctx.strokeStyle = strokeCol;

for (let r = 0; r < rows; r++) {
  const rowProgress = r / (rows - 1);
  const scatterAmp = Math.pow(rowProgress, 1.7) * totalChaos;
  const maxAngle = scatterAmp * 1.3;
  const maxDisp = scatterAmp * cellSize * 0.85;

  for (let c = 0; c < cols; c++) {
    const idx = (r * cols + c) & 2047;
    const lutA = lut[idx];
    const lutB = lut[(idx + 431) & 2047];
    const lutC = lut[(idx + 997) & 2047];

    const dynamicNoise = Math.sin(frame.t * 1.2 + r * 0.25 + c * 0.35);
    const dx = (lutA * 0.8 + dynamicNoise * 0.2) * maxDisp;
    const dy = (lutB * 0.8 + Math.cos(frame.t * 1.5 + c) * 0.2) * maxDisp * 0.7;
    const angle = (lutC + dynamicNoise * 0.25 + (treble - 0.2) * 0.5) * maxAngle;

    const cx = originX + c * cellSize + dx;
    const cy = originY + r * cellSize + dy;

    let cellStroke = strokeCol;
    let cellFill = fillCol;

    if (hasPeople) {
      const pIdx = (r * cols + c) % people.length;
      if ((r + c) % 5 === 0) {
        const pHue = people[pIdx].hue;
        cellStroke = `hsl(${pHue}, 75%, ${paletteName === 'phosphor_mono' || paletteName === 'deep_spectral' ? '65%' : '42%'})`;
      }
    } else if (paletteName === 'constructivist' && (r > rows * 0.6) && ((c + r) % 7 === 0)) {
      cellStroke = accentCol;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    if (styleName === 'ghost_fill') {
      ctx.fillStyle = cellFill;
      ctx.fillRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
    }

    ctx.strokeStyle = cellStroke;
    ctx.strokeRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);

    if (styleName === 'nested_frames') {
      const innerScale = 0.58 + 0.15 * Math.sin(frame.t * 2 + rowProgress * 4);
      ctx.strokeRect(-halfSize * innerScale, -halfSize * innerScale, halfSize * 2 * innerScale, halfSize * 2 * innerScale);
    }

    ctx.restore();
  }
}

ctx.restore();