const W = 224, H = 126;
room.state.off ??= new OffscreenCanvas(W, H);
room.state.offCtx ??= room.state.off.getContext('2d', { willReadFrequently: true });
room.state.imgData ??= room.state.offCtx.createImageData(W, H);
room.state.u32 ??= new Uint32Array(room.state.imgData.data.buffer);
room.state.sparkles ??= [];
room.state.time ??= 0;

if (!room.state.sinLUT) {
  room.state.sinLUT = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    room.state.sinLUT[i] = Math.sin((i / 1024) * Math.PI * 2);
  }
}
const sinLUT = room.state.sinLUT;
const fastSin = (a) => {
  const idx = ((a * 162.97466) | 0) & 1023;
  return sinLUT[idx < 0 ? idx + 1024 : idx];
};
const fastCos = (a) => fastSin(a + 1.5707963);

if (!room.state.palettes) {
  const hslToU32 = (h, s, l) => {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const R = Math.min(255, Math.max(0, ((r + m) * 255) | 0));
    const G = Math.min(255, Math.max(0, ((g + m) * 255) | 0));
    const B = Math.min(255, Math.max(0, ((b + m) * 255) | 0));
    return 0xff000000 | (B << 16) | (G << 8) | R;
  };

  const pals = {
    full_spectrum: new Uint32Array(256),
    deep_opal: new Uint32Array(256),
    neon_sunset: new Uint32Array(256),
    monochrome_silver: new Uint32Array(256)
  };

  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    pals.full_spectrum[i] = hslToU32(p * 360, 0.95, 0.52);
    const opalHue = (170 + fastSin(p * 6.28) * 110) % 360;
    pals.deep_opal[i] = hslToU32(opalHue, 0.85, 0.45 + 0.15 * fastCos(p * 6.28));
    const neonHue = (290 + p * 160) % 360;
    pals.neon_sunset[i] = hslToU32(neonHue, 0.95, 0.5 + 0.2 * fastSin(p * 6.28));
    const lum = Math.min(255, Math.max(0, ((Math.sin(p * Math.PI) * 0.75 + p * 0.25) * 255) | 0));
    const blueTint = Math.min(255, lum + 15);
    pals.monochrome_silver[i] = 0xff000000 | (blueTint << 16) | (lum << 8) | lum;
  }
  room.state.palettes = pals;
}

const depthVar = getVar('wrinkle_depth') ?? 1.0;
const speedVar = getVar('shimmer_speed') ?? 0.8;
const sparkleVar = getVar('sparkle_intensity') ?? 1.0;
const bloomVar = getVar('bloom_glow') ?? true;
const foilStyle = getVar('foil_style') ?? 'iridescent';
const creasePattern = getVar('crease_pattern') ?? 'curtain_drape';
const colorMode = getVar('color_mode') ?? 'full_spectrum';

const bass = audio.bass || 0;
const treble = audio.treble || 0;
const level = audio.level || 0;
const speed = speedVar * (0.8 + bass * 0.6);
room.state.time += (frame.dt || 0.016) * speed;
const t = room.state.time;

const activePal = room.state.palettes[colorMode] ?? room.state.palettes.full_spectrum;
const u32 = room.state.u32;

let gratingScale = 1.0;
if (foilStyle === 'prismatic') gratingScale = 2.2;
else if (foilStyle === 'cyber_foil') gratingScale = 3.4;
else if (foilStyle === 'liquid_chrome') gratingScale = 0.5;

const lx = fastCos(t * 0.7) * 0.7;
const ly = fastSin(t * 0.5) * 0.6;
const lz = 1.0;

let idx = 0;
for (let y = 0; y < H; y++) {
  const ny = (y / H) * 2 - 1;
  for (let x = 0; x < W; x++) {
    const nx = (x / W) * 2 - 1;

    let h0 = 0, hx = 0, hy = 0;
    if (creasePattern === 'curtain_drape') {
      const w1 = nx * 3.8 + fastSin(ny * 2.5 + t * 0.6) * 0.7;
      const w2 = nx * 8.5 + ny * 1.5 - t * 0.9;
      h0 = fastSin(w1) * 0.6 + fastSin(w2) * 0.25;
      const w1x = (nx + 0.03) * 3.8 + fastSin(ny * 2.5 + t * 0.6) * 0.7;
      const w2x = (nx + 0.03) * 8.5 + ny * 1.5 - t * 0.9;
      hx = fastSin(w1x) * 0.6 + fastSin(w2x) * 0.25;
      const w1y = nx * 3.8 + fastSin((ny + 0.03) * 2.5 + t * 0.6) * 0.7;
      const w2y = nx * 8.5 + (ny + 0.03) * 1.5 - t * 0.9;
      hy = fastSin(w1y) * 0.6 + fastSin(w2y) * 0.25;
    } else if (creasePattern === 'crumpled_facets') {
      const c1 = Math.abs(fastSin(nx * 4.2 + ny * 3.1 + t * 0.4));
      const c2 = Math.abs(fastSin(nx * 7.5 - ny * 5.2 - t * 0.6));
      h0 = (c1 * 0.5 + c2 * 0.5) * 1.2 - 0.6;
      const c1x = Math.abs(fastSin((nx + 0.03) * 4.2 + ny * 3.1 + t * 0.4));
      const c2x = Math.abs(fastSin((nx + 0.03) * 7.5 - ny * 5.2 - t * 0.6));
      hx = (c1x * 0.5 + c2x * 0.5) * 1.2 - 0.6;
      const c1y = Math.abs(fastSin(nx * 4.2 + (ny + 0.03) * 3.1 + t * 0.4));
      const c2y = Math.abs(fastSin(nx * 7.5 - (ny + 0.03) * 5.2 - t * 0.6));
      hy = (c1y * 0.5 + c2y * 0.5) * 1.2 - 0.6;
    } else if (creasePattern === 'origami_folds') {
      const f1 = ((nx * 4 + ny * 3 + t * 0.5) % 2 + 2) % 2 - 1;
      const f2 = ((nx * 3 - ny * 4 - t * 0.4) % 2 + 2) % 2 - 1;
      h0 = Math.abs(f1) * 0.7 + Math.abs(f2) * 0.4;
      const f1x = (((nx + 0.03) * 4 + ny * 3 + t * 0.5) % 2 + 2) % 2 - 1;
      const f2x = (((nx + 0.03) * 3 - ny * 4 - t * 0.4) % 2 + 2) % 2 - 1;
      hx = Math.abs(f1x) * 0.7 + Math.abs(f2x) * 0.4;
      const f1y = ((nx * 4 + (ny + 0.03) * 3 + t * 0.5) % 2 + 2) % 2 - 1;
      const f2y = ((nx * 3 - (ny + 0.03) * 4 - t * 0.4) % 2 + 2) % 2 - 1;
      hy = Math.abs(f1y) * 0.7 + Math.abs(f2y) * 0.4;
    } else {
      const r = Math.sqrt(nx * nx + ny * ny);
      h0 = fastSin(r * 7.0 - t * 2.0) * 0.6 + fastSin(nx * 3.0 + t) * 0.4;
      const rx = Math.sqrt((nx + 0.03) * (nx + 0.03) + ny * ny);
      hx = fastSin(rx * 7.0 - t * 2.0) * 0.6 + fastSin((nx + 0.03) * 3.0 + t) * 0.4;
      const ry = Math.sqrt(nx * nx + (ny + 0.03) * (ny + 0.03));
      hy = fastSin(ry * 7.0 - t * 2.0) * 0.6 + fastSin(nx * 3.0 + t) * 0.4;
    }

    const dhdx = (hx - h0) * 33.3 * depthVar;
    const dhdy = (hy - h0) * 33.3 * depthVar;
    let normX = -dhdx;
    let normY = -dhdy;
    let normZ = 1.0;
    const invLen = 1.0 / Math.sqrt(normX * normX + normY * normY + 1.0);
    normX *= invLen;
    normY *= invLen;
    normZ *= invLen;

    const diff = Math.max(0, normX * lx + normY * ly + normZ * lz);
    const vx = 0, vy = 0, vz = 1.0;
    const hxRay = lx + vx;
    const hyRay = ly + vy;
    const hzRay = lz + vz;
    const hLen = 1.0 / Math.sqrt(hxRay * hxRay + hyRay * hyRay + hzRay * hzRay);
    const specDot = Math.max(0, normX * hxRay * hLen + normY * hyRay * hLen + normZ * hzRay * hLen);
    let spec = specDot * specDot;
    spec = spec * spec;
    spec = spec * spec * spec;

    const phase = ((normX * 1.5 + normY * 1.2 + h0 * 0.8) * gratingScale + (nx * 0.4 + ny * 0.3) + t * 0.15);
    const lutIdx = (((phase * 255) | 0) & 255);
    const baseCol = activePal[lutIdx];

    let cr = baseCol & 255;
    let cg = (baseCol >> 8) & 255;
    let cb = (baseCol >> 16) & 255;

    const shade = 0.3 + 0.7 * diff;
    cr = (cr * shade) | 0;
    cg = (cg * shade) | 0;
    cb = (cb * shade) | 0;

    const sp = Math.min(255, (spec * 320 * (1 + bass * 0.8)) | 0);
    cr = Math.min(255, cr + sp);
    cg = Math.min(255, cg + sp);
    cb = Math.min(255, cb + sp);

    const vignette = 1.0 - (nx * nx * 0.18 + ny * ny * 0.28);
    cr = (cr * vignette) | 0;
    cg = (cg * vignette) | 0;
    cb = (cb * vignette) | 0;

    u32[idx++] = 0xff000000 | (cb << 16) | (cg << 8) | cr;
  }
}

room.state.offCtx.putImageData(room.state.imgData, 0, 0);

ctx.save();
ctx.fillStyle = '#020205';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'medium';
ctx.drawImage(room.state.off, 0, 0, frame.width, frame.height);

if (bloomVar) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.35 + bass * 0.3;
  ctx.filter = 'blur(18px)';
  ctx.drawImage(room.state.off, 0, 0, frame.width, frame.height);
  ctx.restore();
}

const spawnRate = (0.2 + treble * 0.5 + (audio.beat ? 0.8 : 0)) * sparkleVar;
if (Math.random() < spawnRate && room.state.sparkles.length < 120) {
  const px = Math.random() * frame.width;
  const py = Math.random() * frame.height;
  let hue = (Math.random() * 360) | 0;
  if (room.people && room.people.length > 0) {
    const person = room.people[(Math.random() * room.people.length) | 0];
    if (person && person.hue !== undefined) hue = person.hue;
  }
  room.state.sparkles.push({
    x: px,
    y: py,
    maxLife: 0.3 + Math.random() * 0.6,
    life: 0,
    size: (8 + Math.random() * 18) * sparkleVar,
    hue: hue
  });
}

ctx.save();
ctx.globalCompositeOperation = 'screen';
for (let i = room.state.sparkles.length - 1; i >= 0; i--) {
  const sp = room.state.sparkles[i];
  sp.life += frame.dt || 0.016;
  if (sp.life >= sp.maxLife) {
    room.state.sparkles.splice(i, 1);
    continue;
  }
  const progress = sp.life / sp.maxLife;
  const env = Math.sin(progress * Math.PI);
  const sz = sp.size * env;
  const alpha = env * 0.95;

  ctx.fillStyle = `hsla(${sp.hue}, 90%, 85%, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(sp.x - sz * 2.2, sp.y);
  ctx.lineTo(sp.x, sp.y - sz * 0.4);
  ctx.lineTo(sp.x + sz * 2.2, sp.y);
  ctx.lineTo(sp.x, sp.y + sz * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y - sz * 2.2);
  ctx.lineTo(sp.x + sz * 0.4, sp.y);
  ctx.lineTo(sp.x, sp.y + sz * 2.2);
  ctx.lineTo(sp.x - sz * 0.4, sp.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, sz * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

if (room.people && room.people.length > 0) {
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const ang = t * 0.5 + i * ((Math.PI * 2) / room.people.length);
    const radX = frame.width * 0.38;
    const radY = frame.height * 0.32;
    const cx = frame.width * 0.5 + fastCos(ang) * radX;
    const cy = frame.height * 0.5 + fastSin(ang * 1.3) * radY;
    const flareSz = (14 + bass * 22) * sparkleVar;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flareSz * 2.5);
    grad.addColorStop(0, `hsla(${p.hue}, 100%, 75%, 0.7)`);
    grad.addColorStop(0.4, `hsla(${p.hue}, 90%, 55%, 0.25)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, flareSz * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
ctx.restore();
ctx.restore();