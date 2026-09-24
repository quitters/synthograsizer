ctx.save();

const W = 240;
const H = 135;

// Persistent buffers & lookups
if (!room.state.initialized) {
  room.state.offscreen = new OffscreenCanvas(W, H);
  room.state.offCtx = room.state.offscreen.getContext('2d');
  room.state.img = room.state.offCtx.createImageData(W, H);
  room.state.buf32 = new Uint32Array(room.state.img.data.buffer);
  room.state.lut = new Uint32Array(512);
  room.state.currentPal = '';
  room.state.phase = 0;
  room.state.initialized = true;
}

const curPal = getVar('palette') ?? 'neon_abyss';
const tempoMode = getVar('tempo') ?? 'adagio';
const zoomVal = getVar('fractal_zoom') ?? 1.2;
const maxIter = getVar('iterations') ?? 40;
const audioMode = getVar('audio_reactivity') ?? 'subtle';

const paceMap = { adagio: 0.18, moderato: 0.38, vivace: 0.72 };
const pace = paceMap[tempoMode] ?? 0.18;

const driveMap = { subtle: 0.015, pulsing: 0.038, overdrive: 0.08 };
const audioDrive = driveMap[audioMode] ?? 0.015;

// Integrate phase smoothly across frame times
const bassKick = (audio?.bass ?? 0) * audioDrive;
const level = audio?.level ?? 0;
room.state.phase += frame.dt * (pace + level * 0.25);
const theta = room.state.phase;

// Rebuild palette lookup table when mode changes or hue accents shift
if (room.state.currentPal !== curPal) {
  const lut = room.state.lut;
  for (let i = 0; i < 512; i++) {
    const u = i / 512;
    let r = 0, g = 0, b = 0;
    if (curPal === 'solar_flare') {
      r = Math.min(255, Math.floor(Math.pow(u, 0.7) * 255 * 1.3));
      g = Math.min(255, Math.floor(Math.pow(u, 1.8) * 230));
      b = Math.min(255, Math.floor(Math.pow(u, 3.2) * 160));
    } else if (curPal === 'cyber_amethyst') {
      r = Math.min(255, Math.floor((Math.sin(u * 6.283) * 0.4 + 0.6) * 220));
      g = Math.min(255, Math.floor(Math.pow(u, 2.2) * 90));
      b = Math.min(255, Math.floor(Math.pow(u, 0.8) * 255));
    } else if (curPal === 'phosphor_mono') {
      const br = Math.pow(u, 1.2);
      r = Math.floor(br * 40);
      g = Math.min(255, Math.floor(br * 255));
      b = Math.floor(br * 90);
    } else {
      // neon_abyss
      r = Math.min(255, Math.floor(Math.pow(u, 2.0) * 180));
      g = Math.min(255, Math.floor(Math.sin(u * 3.1415) * 240));
      b = Math.min(255, Math.floor(Math.pow(u, 0.6) * 255));
    }
    // Little endian ABGR
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  room.state.currentPal = curPal;
}

// Mandelbrot cardioid formula with breathing offset
// Parametric cardioid: c = e^(it)/2 - e^(2it)/4
const cost = Math.cos(theta);
const sint = Math.sin(theta);
const cos2t = Math.cos(2 * theta);
const sin2t = Math.sin(2 * theta);

// Radial shift slightly through boundary: dust (outside) <-> dendrites (boundary) <-> spirals (inside)
const radialOffset = Math.sin(theta * 3.0) * 0.018 + (audio?.beat ? 0.025 : 0.0) + bassKick;
const scaleC = 1.0 + radialOffset;
const cx = (0.5 * cost - 0.25 * cos2t) * scaleC;
const cy = (0.5 * sint - 0.25 * sin2t) * scaleC;

// Compute framing and view bounds
const zoom = zoomVal * (1.0 + (audio?.mid ?? 0) * 0.12);
const halfW = 1.5 / zoom;
const aspect = H / W;
const halfH = halfW * aspect;
const xMin = -halfW;
const xStep = (halfW * 2) / W;
const yMin = -halfH;
const yStep = (halfH * 2) / H;

const buf32 = room.state.buf32;
const lut = room.state.lut;
const ln2 = 0.69314718056;
const colorShift = (frame.t * 24 + (audio?.treble ?? 0) * 80) | 0;

// Core Julia evaluation: 0 heap allocations in inner loop
let pIdx = 0;
for (let py = 0; py < H; py++) {
  const zy0 = yMin + py * yStep;
  for (let px = 0; px < W; px++) {
    let zx = xMin + px * xStep;
    let zy = zy0;
    let i = 0;
    let zx2 = zx * zx;
    let zy2 = zy * zy;

    while (zx2 + zy2 <= 4.0 && i < maxIter) {
      zy = 2.0 * zx * zy + cy;
      zx = zx2 - zy2 + cx;
      zx2 = zx * zx;
      zy2 = zy * zy;
      i++;
    }

    if (i >= maxIter) {
      buf32[pIdx++] = 0xFF050302; // Deep abyss for interior
    } else {
      // Smooth normalized iteration count (demoscene continuous escape coloring)
      const magSq = zx2 + zy2;
      const logZn = Math.log(magSq) * 0.5;
      const nu = i + 1 - (Math.log(logZn / ln2) / ln2);
      const lutIdx = ((nu * 14 + colorShift) & 511);
      buf32[pIdx++] = lut[lutIdx];
    }
  }
}

// Push pixels to offscreen and upscale smoothly to display canvas
room.state.offCtx.putImageData(room.state.img, 0, 0);

ctx.fillStyle = '#020204';
ctx.fillRect(0, 0, frame.width, frame.height);
ctx.imageSmoothingEnabled = true;
ctx.drawImage(room.state.offscreen, 0, 0, frame.width, frame.height);

// Subtle vignette and presence echoes from connected visitors
const people = room.people ?? [];
if (people.length > 0) {
  ctx.globalCompositeOperation = 'screen';
  for (let k = 0; k < people.length; k++) {
    const p = people[k];
    const pAngle = (k / people.length) * Math.PI * 2 + theta * 0.5;
    const orbitRad = Math.min(frame.width, frame.height) * 0.36;
    const sx = frame.width * 0.5 + Math.cos(pAngle) * orbitRad;
    const sy = frame.height * 0.5 + Math.sin(pAngle) * (orbitRad * 0.6);
    const rad = 14 + (audio?.bass ?? 0) * 22;

    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    grad.addColorStop(0, `hsla(${p.hue}, 90%, 65%, 0.45)`);
    grad.addColorStop(1, `hsla(${p.hue}, 90%, 50%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Soft scanlines overlay for authentic demoscene CRT luster
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
for (let y = 0; y < frame.height; y += 4) {
  ctx.fillRect(0, y, frame.width, 1.5);
}

ctx.restore();