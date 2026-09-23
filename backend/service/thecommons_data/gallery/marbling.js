const paletteKey = getVar('palette') ?? 'venetian_ebru';
const combStyle = getVar('comb_style') ?? 'nonpareil';
const tineDensity = getVar('tine_density') ?? 'medium';
const flowSpeed = getVar('flow_speed') ?? 1;
const dropRhythm = getVar('drop_rhythm') ?? 'musical';

const PALETTES = {
  venetian_ebru: ['#0f1923', '#8b1d24', '#c97a3e', '#e3b873', '#2a5d67', '#0e3b43'],
  persian_lapis: ['#0a1128', '#1c3f60', '#0077b6', '#90e0ef', '#d4af37', '#f4ecd8'],
  suminagashi:   ['#111111', '#2f3542', '#747d8c', '#a4b0be', '#f1f2f6', '#c0392b'],
  malachite_gold:['#031d16', '#093a2e', '#137547', '#25a168', '#dfb15b', '#fbf4dd']
};
const colors = PALETTES[paletteKey] ?? PALETTES.venetian_ebru;

const TINE_SPACINGS = { wide: 72, medium: 46, dense: 28 };
const tineSpacing = TINE_SPACINGS[tineDensity] ?? 46;

const W = frame.width;
const H = frame.height;
const NUM_BANDS = 110;
const PTS_PER_BAND = 220;

room.state.bands ??= [];
room.state.phase ??= 0;
room.state.nextActionTime ??= 0;
room.state.dropQueue ??= [];
room.state.lastBeat ??= false;

if (room.state.bands.length !== NUM_BANDS || room.state.bands[0]?.pts?.length !== PTS_PER_BAND) {
  room.state.bands = [];
  for (let i = 0; i < NUM_BANDS; i++) {
    const y0 = (i / (NUM_BANDS - 1)) * (H * 1.3) - H * 0.15;
    const pts = new Float32Array(PTS_PER_BAND * 2);
    for (let j = 0; j < PTS_PER_BAND; j++) {
      const x0 = (j / (PTS_PER_BAND - 1)) * (W * 1.2) - W * 0.1;
      pts[j * 2] = x0;
      pts[j * 2 + 1] = y0;
    }
    room.state.bands.push({
      pts,
      colorIndex: i % colors.length
    });
  }
  room.state.phase = 0;
  room.state.nextActionTime = frame.t + 0.2;
}

function applyDrop(cx, cy, radius) {
  const r2 = radius * radius;
  const bands = room.state.bands;
  for (let b = 0; b < bands.length; b++) {
    const p = bands[b].pts;
    for (let j = 0; j < PTS_PER_BAND; j++) {
      const idx = j * 2;
      const dx = p[idx] - cx;
      const dy = p[idx + 1] - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.0001) {
        const factor = Math.sqrt(1 + r2 / d2);
        p[idx] = cx + dx * factor;
        p[idx + 1] = cy + dy * factor;
      }
    }
  }
}

function applyComb(axis, spacing, amplitude, feather, sigmaScale = 0.52) {
  const bands = room.state.bands;
  const sigma = spacing * sigmaScale;
  const twoSigma2 = 2 * sigma * sigma;
  const amp = amplitude;

  for (let b = 0; b < bands.length; b++) {
    const p = bands[b].pts;
    for (let j = 0; j < PTS_PER_BAND; j++) {
      const idx = j * 2;
      const u = (axis === 'x') ? p[idx] : p[idx + 1];
      const kCenter = Math.round(u / spacing);
      let disp = 0;

      for (let k = kCenter - 2; k <= kCenter + 2; k++) {
        const tinePos = k * spacing;
        const du = u - tinePos;
        const sign = (feather && (k & 1)) ? -1 : 1;
        disp += sign * Math.exp(-(du * du) / twoSigma2);
      }

      if (axis === 'x') {
        p[idx + 1] += disp * amp;
      } else {
        p[idx] += disp * amp;
      }
    }
  }
}

const isBeat = (audio?.beat && !room.state.lastBeat) || (audio?.bass ?? 0) > 0.72;
room.state.lastBeat = !!audio?.beat;

if (dropRhythm === 'musical') {
  if (isBeat && Math.random() < 0.75) {
    const cx = W * (0.2 + 0.6 * Math.random());
    const cy = H * (0.2 + 0.6 * Math.random());
    const rad = 25 + (audio?.bass ?? 0.5) * 55;
    applyDrop(cx, cy, rad);
  }
} else if (dropRhythm === 'continuous') {
  if (Math.random() < 0.12 * flowSpeed) {
    const cx = W * (0.15 + 0.7 * Math.sin(frame.t * 0.9));
    const cy = H * (0.2 + 0.6 * Math.cos(frame.t * 1.3));
    applyDrop(cx, cy, 32 + (audio?.bass ?? 0) * 40);
  }
} else if (dropRhythm === 'gentle') {
  if (Math.random() < 0.04 * flowSpeed) {
    const cx = W * (0.25 + 0.5 * Math.random());
    const cy = H * (0.25 + 0.5 * Math.random());
    applyDrop(cx, cy, 20 + 25 * Math.random());
  }
}

if (room.people && room.people.length > 0 && Math.random() < 0.05) {
  const person = room.people[Math.floor(Math.random() * room.people.length)];
  const px = ((person.hue * 5.43) % (W * 0.7)) + W * 0.15;
  const py = (((person.hue * 11.17) % (H * 0.7))) + H * 0.15;
  applyDrop(px, py, 22 + (person.hue % 30));
}

if (frame.t >= room.state.nextActionTime) {
  const phase = room.state.phase % 6;
  const audForce = 1 + (audio?.level ?? 0.2) * 0.8;

  if (phase === 0) {
    const drops = 3 + Math.floor(Math.random() * 3);
    for (let d = 0; d < drops; d++) {
      const cx = W * (0.18 + 0.64 * Math.random());
      const cy = H * (0.18 + 0.64 * Math.random());
      applyDrop(cx, cy, (35 + Math.random() * 45) * audForce);
    }
    room.state.nextActionTime = frame.t + 1.2 / flowSpeed;
  } else if (phase === 1) {
    const amp = (combStyle === 'feather' ? 36 : 28) * audForce;
    applyComb('y', tineSpacing * 1.6, amp, false, 0.48);
    room.state.nextActionTime = frame.t + 0.9 / flowSpeed;
  } else if (phase === 2) {
    const drops = 2;
    for (let d = 0; d < drops; d++) {
      const cx = W * (0.3 + 0.4 * Math.random());
      const cy = H * (0.3 + 0.4 * Math.random());
      applyDrop(cx, cy, 30 * audForce);
    }
    room.state.nextActionTime = frame.t + 0.8 / flowSpeed;
  } else if (phase === 3) {
    const isFeather = combStyle === 'feather' || combStyle === 'nonpareil' || combStyle === 'chevron';
    const amp = (isFeather ? 44 : 26) * audForce;
    applyComb('x', tineSpacing, amp, isFeather, 0.5);
    room.state.nextActionTime = frame.t + 1.1 / flowSpeed;
  } else if (phase === 4) {
    if (combStyle === 'nonpareil') {
      applyComb('x', tineSpacing * 0.5, -24 * audForce, true, 0.52);
    } else if (combStyle === 'bouquet') {
      applyComb('y', tineSpacing * 1.2, 38 * audForce, true, 0.55);
    } else {
      applyComb('y', tineSpacing * 2.0, 18 * audForce, false, 0.45);
    }
    room.state.nextActionTime = frame.t + 1.3 / flowSpeed;
  } else {
    const bands = room.state.bands;
    for (let b = 0; b < bands.length; b++) {
      const origY = (b / (NUM_BANDS - 1)) * (H * 1.3) - H * 0.15;
      const p = bands[b].pts;
      for (let j = 0; j < PTS_PER_BAND; j++) {
        const idx = j * 2;
        const origX = (j / (PTS_PER_BAND - 1)) * (W * 1.2) - W * 0.1;
        p[idx] += (origX - p[idx]) * 0.08;
        p[idx + 1] += (origY - p[idx + 1]) * 0.08;
      }
    }
    room.state.nextActionTime = frame.t + 0.6 / flowSpeed;
  }
  room.state.phase++;
}

ctx.save();
ctx.fillStyle = colors[0];
ctx.fillRect(0, 0, W, H);

const bands = room.state.bands;
const audShimmer = (audio?.treble ?? 0) * 0.25;

for (let b = 0; b < bands.length - 1; b++) {
  const b1 = bands[b];
  const b2 = bands[b + 1];
  const col = colors[(b1.colorIndex) % colors.length];

  ctx.beginPath();
  ctx.moveTo(b1.pts[0], b1.pts[1]);
  for (let j = 1; j < PTS_PER_BAND; j++) {
    ctx.lineTo(b1.pts[j * 2], b1.pts[j * 2 + 1]);
  }
  for (let j = PTS_PER_BAND - 1; j >= 0; j--) {
    ctx.lineTo(b2.pts[j * 2], b2.pts[j * 2 + 1]);
  }
  ctx.closePath();

  ctx.fillStyle = col;
  ctx.fill();

  if (b % 4 === 0 || audShimmer > 0.1) {
    ctx.strokeStyle = colors[(b1.colorIndex + 2) % colors.length];
    ctx.globalAlpha = 0.25 + audShimmer;
    ctx.lineWidth = 1.0;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }
}

const paperGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.2, W * 0.5, H * 0.5, W * 0.8);
paperGrad.addColorStop(0, 'rgba(255, 248, 235, 0.04)');
paperGrad.addColorStop(1, 'rgba(10, 5, 2, 0.35)');
ctx.fillStyle = paperGrad;
ctx.fillRect(0, 0, W, H);

ctx.restore();