const COLS = 32;
const ROWS = 6;
const CS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:./-!*#';

const palettes = {
  amber_terminal: {
    bg: '#070503', board: '#130f0a', flapTop: '#241c14', flapBot: '#1c1610',
    text: '#ffaa22', accent: '#ff4400', glow: '255, 170, 34',
    border: '#2c2217'
  },
  solari_classic: {
    bg: '#040608', board: '#0d1116', flapTop: '#1d232c', flapBot: '#171c23',
    text: '#f0f4f8', accent: '#ffb703', glow: '240, 244, 248',
    border: '#28313d'
  },
  matrix_emerald: {
    bg: '#020803', board: '#07150a', flapTop: '#102816', flapBot: '#0c2012',
    text: '#39ff88', accent: '#00dd55', glow: '57, 255, 136',
    border: '#183c20'
  },
  vapor_neon: {
    bg: '#08040f', board: '#130b22', flapTop: '#251542', flapBot: '#1d1034',
    text: '#ff2e93', accent: '#00f0ff', glow: '255, 46, 147',
    border: '#3c1f69'
  }
};

const pages = [
  [
    'TERMINUS MOODS // DEPARTURES   ',
    '128 BPM  EUPHORIA     P01 ON TIME',
    '084 BPM  MELANCHOLY   P04 DELAYED',
    '140 BPM  ECSTASY      P07 BOARD  ',
    '096 BPM  NOSTALGIA    P02 NOW    ',
    '174 BPM  FRENZY       P09 LASTCALL'
  ],
  [
    'TEMPO LINE // SYSTEM ACTIVE     ',
    '060 BPM  TRANQUILITY  P03 ON TIME',
    '132 BPM  WANDERLUST   P05 ON TIME',
    '110 BPM  SOLITUDE     P08 DELAYED',
    '160 BPM  CATHARSIS    P01 BOARD  ',
    '072 BPM  SERENITY     P06 ON TIME'
  ],
  [
    'PASSENGER LOG // PLATFORMS 1-9  ',
    '145 BPM  HYPNOSIS     P02 NOW    ',
    '090 BPM  REVERIE      P04 ON TIME',
    '120 BPM  VULNERABLE   P07 DELAYED',
    '104 BPM  LONGING      P03 BOARD  ',
    '130 BPM  ELEVATION    P09 ON TIME'
  ],
  [
    'FINAL CALLS // NIGHT EXPEDITION ',
    '135 BPM  BLISS        P05 ON TIME',
    '088 BPM  DAYDREAM     P02 ON TIME',
    '150 BPM  OBLIVION     P06 LASTCALL',
    '116 BPM  AWE          P08 NOW    ',
    '170 BPM  OVERDRIVE    P01 DELAYED'
  ]
];

const paletteKey = getVar('palette') ?? 'amber_terminal';
const pal = palettes[paletteKey] ?? palettes.amber_terminal;
const cascadeSpeed = getVar('cascade_speed') ?? 1.0;
const flapGlow = getVar('flap_glow') ?? 0.6;
const cycleMode = getVar('message_cycle') ?? 'bar_cascade';
const jitterOn = getVar('jitter') ?? true;
const vignette = getVar('wear_vignette') ?? 0.6;

room.state.cells ??= [];
room.state.page ??= 0;
room.state.timer ??= 0;
room.state.lastBeat ??= false;

if (room.state.cells.length !== ROWS * COLS) {
  room.state.cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      room.state.cells.push({
        ch: ' ',
        target: ' ',
        flip: 1.0,
        delay: 0
      });
    }
  }
}

const advancePage = () => {
  room.state.page = (room.state.page + 1) % pages.length;
  const pageLines = pages[room.state.page];
  for (let r = 0; r < ROWS; r++) {
    const line = (pageLines[r] || '').padEnd(COLS, ' ').substring(0, COLS);
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const cell = room.state.cells[idx];
      cell.target = line[c];
      const diag = (r * 0.16 + c * 0.022) / cascadeSpeed;
      cell.delay = diag;
    }
  }
};

if (room.state.timer === 0 && room.state.cells[0].target === ' ') {
  advancePage();
}

room.state.timer += frame.dt;
const cycleInterval = cycleMode === 'rapid_riffle' ? 4.5 : 8.5;
const beatTrigger = cycleMode === 'audio_sync' && audio.beat && !room.state.lastBeat && room.state.timer > 3.0;
room.state.lastBeat = audio.beat;

if (room.state.timer >= cycleInterval || beatTrigger) {
  room.state.timer = 0;
  advancePage();
}

const dt = Math.min(frame.dt, 0.05);
let activeFlips = 0;
for (let i = 0; i < room.state.cells.length; i++) {
  const cell = room.state.cells[i];
  if (cell.delay > 0) {
    cell.delay -= dt;
    continue;
  }
  if (cell.ch !== cell.target) {
    activeFlips++;
    const flipRate = 18 * cascadeSpeed * (1 + audio.bass * 0.6);
    cell.flip += dt * flipRate;
    if (cell.flip >= 1.0) {
      const currPos = CS.indexOf(cell.ch);
      const nextPos = (currPos === -1 ? 0 : currPos + 1) % CS.length;
      cell.ch = CS[nextPos];
      cell.flip = cell.ch === cell.target ? 1.0 : 0.0;
    }
  }
}

ctx.save();
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, frame.width, frame.height);

const marginX = frame.width * 0.04;
const marginY = frame.height * 0.05;
const maxW = frame.width - marginX * 2;
const maxH = frame.height - marginY * 2;
const aspect = 1.95;
let boardW = maxW;
let boardH = boardW / aspect;
if (boardH > maxH) {
  boardH = maxH;
  boardW = boardH * aspect;
}

const boardX = (frame.width - boardW) / 2;
const boardY = (frame.height - boardH) / 2;

const jMag = (jitterOn ? (audio.bass * 2.8 + activeFlips * 0.03) : 0);
const jx = (Math.random() - 0.5) * jMag;
const jy = (Math.random() - 0.5) * jMag;

ctx.translate(boardX + jx, boardY + jy);

ctx.fillStyle = pal.board;
ctx.beginPath();
ctx.roundRect(0, 0, boardW, boardH, 12);
ctx.fill();
ctx.strokeStyle = pal.border;
ctx.lineWidth = 3;
ctx.stroke();

const padX = boardW * 0.025;
const padY = boardH * 0.04;
const gridW = boardW - padX * 2;
const gridH = boardH - padY * 2;
const colW = gridW / COLS;
const rowH = gridH / ROWS;
const flapW = colW * 0.91;
const flapH = rowH * 0.88;
const fontSize = Math.floor(flapH * 0.76);

ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.font = `bold ${fontSize}px "Courier New", monospace`;

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const idx = r * COLS + c;
    const cell = room.state.cells[idx];
    const cx = padX + c * colW + colW * 0.5;
    const cy = padY + r * rowH + rowH * 0.5;
    const x0 = cx - flapW * 0.5;
    const y0 = cy - flapH * 0.5;
    const halfH = flapH * 0.5;

    ctx.fillStyle = pal.flapTop;
    ctx.beginPath();
    ctx.roundRect(x0, y0, flapW, halfH - 0.5, [2, 2, 0, 0]);
    ctx.fill();

    ctx.fillStyle = pal.flapBot;
    ctx.beginPath();
    ctx.roundRect(x0, cy + 0.5, flapW, halfH - 0.5, [0, 0, 2, 2]);
    ctx.fill();

    const isHeader = r === 0;
    const isAccentCol = (c >= 0 && c <= 6) || (c >= 21 && c <= 23);
    let textColor = pal.text;
    if (isHeader) {
      textColor = pal.accent;
    } else if (isAccentCol && pal.accent) {
      textColor = pal.accent;
    }

    if (cell.flip >= 1.0) {
      ctx.fillStyle = textColor;
      ctx.fillText(cell.ch, cx, cy);
    } else {
      const p = cell.flip;
      const currPos = CS.indexOf(cell.ch);
      const nextChar = CS[(currPos === -1 ? 0 : currPos + 1) % CS.length];

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, flapW, halfH);
      ctx.clip();
      ctx.fillStyle = textColor;
      ctx.fillText(nextChar, cx, cy);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, cy, flapW, halfH);
      ctx.clip();
      ctx.fillStyle = textColor;
      ctx.fillText(cell.ch, cx, cy);
      ctx.restore();

      ctx.save();
      if (p < 0.5) {
        const scaleY = Math.cos(p * Math.PI);
        ctx.translate(cx, cy);
        ctx.scale(1, Math.max(0.01, scaleY));
        ctx.translate(-cx, -cy);

        ctx.fillStyle = pal.flapTop;
        ctx.beginPath();
        ctx.roundRect(x0, y0, flapW, halfH, [2, 2, 0, 0]);
        ctx.fill();

        ctx.beginPath();
        ctx.rect(x0, y0, flapW, halfH);
        ctx.clip();
        ctx.fillStyle = textColor;
        ctx.fillText(cell.ch, cx, cy);

        ctx.fillStyle = `rgba(0, 0, 0, ${(1 - scaleY) * 0.7})`;
        ctx.fillRect(x0, y0, flapW, halfH);
      } else {
        const scaleY = -Math.cos(p * Math.PI);
        ctx.translate(cx, cy);
        ctx.scale(1, Math.max(0.01, scaleY));
        ctx.translate(-cx, -cy);

        ctx.fillStyle = pal.flapBot;
        ctx.beginPath();
        ctx.roundRect(x0, cy, flapW, halfH, [0, 0, 2, 2]);
        ctx.fill();

        ctx.beginPath();
        ctx.rect(x0, cy, flapW, halfH);
        ctx.clip();
        ctx.fillStyle = textColor;
        ctx.fillText(nextChar, cx, cy);

        ctx.fillStyle = `rgba(255, 255, 255, ${(1 - scaleY) * 0.25})`;
        ctx.fillRect(x0, cy, flapW, halfH);
      }
      ctx.restore();
    }

    ctx.fillStyle = '#080808';
    ctx.fillRect(x0, cy - 0.75, flapW, 1.5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x0, cy + 0.75, flapW, 0.6);
  }
}

if (flapGlow > 0.05) {
  const pulse = (0.5 + 0.5 * Math.sin(frame.t * 3)) * audio.mid * 0.5;
  const glowAlpha = (flapGlow * 0.25 + pulse * 0.2).toFixed(3);
  ctx.shadowColor = `rgba(${pal.glow}, ${glowAlpha})`;
  ctx.shadowBlur = 18 * flapGlow;
  ctx.strokeStyle = `rgba(${pal.glow}, ${glowAlpha})`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padX * 0.5, padY * 0.5, boardW - padX, boardH - padY);
  ctx.shadowBlur = 0;
}

if (room.people && room.people.length > 0) {
  const barY = boardH - padY * 0.5;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('DISPATCH OBSERVERS:', padX, barY);
  const dotR = 3.5;
  const startDotX = padX + 130;
  const pCount = Math.min(room.people.length, 24);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    ctx.fillStyle = `hsl(${p.hue}, 85%, 60%)`;
    ctx.beginPath();
    ctx.arc(startDotX + i * 11, barY - 3, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.restore();

if (vignette > 0.05) {
  ctx.save();
  const maxDim = Math.max(frame.width, frame.height);
  const vigGrad = ctx.createRadialGradient(
    frame.width * 0.5, frame.height * 0.5, maxDim * 0.35,
    frame.width * 0.5, frame.height * 0.5, maxDim * 0.75
  );
  vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vigGrad.addColorStop(1, `rgba(0, 0, 0, ${(vignette * 0.85).toFixed(2)})`);
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.restore();
}