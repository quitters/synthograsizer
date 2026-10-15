const paletteMode = getVar('palette_style') ?? 'lightning_ridge';
const patternMode = getVar('pattern_type') ?? 'harlequin';
const speed = getVar('motion_speed') ?? 0.8;
const contrast = getVar('contrast') ?? 2.2;
const sparkle = getVar('sparkle_intensity') ?? 1.0;
const gemShape = getVar('cabochon_shape') ?? 'freeform_oval';
const audioFlare = getVar('light_reaction') ?? true;

const W = 192;
const H = 108;

room.state.buf ??= new OffscreenCanvas(W, H);
room.state.bCtx ??= room.state.buf.getContext('2d', { willReadFrequently: true });
room.state.img ??= room.state.bCtx.createImageData(W, H);
room.state.u32 ??= new Uint32Array(room.state.img.data.buffer);
room.state.cells ??= (() => {
  const c = new Float32Array(64 * 48 * 4);
  for (let i = 0; i < c.length; i += 4) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    c[i] = Math.sin(phi) * Math.cos(theta);
    c[i + 1] = Math.sin(phi) * Math.sin(theta);
    c[i + 2] = Math.cos(phi);
    c[i + 3] = Math.random() * 2.0;
  }
  return c;
})();

room.state.lutKey ??= '';
const curKey = paletteMode + '_' + contrast;
if (room.state.lutKey !== curKey) {
  room.state.lutKey = curKey;
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    let r = 0, g = 0, b = 0;
    if (paletteMode === 'fire_opal') {
      r = Math.pow(Math.sin(p * Math.PI * 0.9 + 0.2), 1.2) * 255;
      g = Math.pow(Math.max(0, Math.sin((p - 0.2) * Math.PI * 1.1)), 1.8) * 190;
      b = Math.pow(Math.max(0, p - 0.75) * 4, 2.5) * 120;
    } else if (paletteMode === 'peacock_feather') {
      r = Math.pow(Math.max(0, 0.3 - Math.abs(p - 0.7)), 2) * 200;
      g = Math.pow(Math.sin(p * Math.PI * 0.85 + 0.15), 1.4) * 240;
      b = Math.pow(Math.sin(p * Math.PI * 0.75 + 0.6), 1.1) * 255;
    } else if (paletteMode === 'spectral_rainbow') {
      const hp = (p * 5.2) % 6;
      const x = 1 - Math.abs((hp % 2) - 1);
      let cr = 0, cg = 0, cb = 0;
      if (hp < 1) { cr = 1; cg = x; }
      else if (hp < 2) { cr = x; cg = 1; }
      else if (hp < 3) { cg = 1; cb = x; }
      else if (hp < 4) { cg = x; cb = 1; }
      else if (hp < 5) { cr = x; cb = 1; }
      else { cr = 1; cb = x; }
      r = cr * 255; g = cg * 255; b = cb * 255;
    } else {
      r = Math.pow(Math.max(0, Math.sin(p * 3.8 - 0.4)), 1.6) * 255;
      g = Math.pow(Math.sin(p * Math.PI * 0.95 + 0.1), 1.3) * 245;
      b = Math.pow(Math.sin((1 - p) * Math.PI * 0.8 + 0.5), 1.2) * 255;
    }
    const ir = Math.min(255, Math.max(0, r | 0));
    const ig = Math.min(255, Math.max(0, g | 0));
    const ib = Math.min(255, Math.max(0, b | 0));
    lut[i] = (255 << 24) | (ib << 16) | (ig << 8) | ir;
  }
  room.state.lut = lut;
}

const lut = room.state.lut;
const cells = room.state.cells;
const u32 = room.state.u32;

room.state.theta ??= 0;
const beatKick = (audioFlare && audio.beat) ? 0.08 : 0.0;
room.state.theta += (frame.dt * speed * 0.45) + (audio.bass * 0.02) + beatKick;
const t = room.state.theta;

const lx = Math.cos(t * 1.1) * 0.65;
const ly = Math.sin(t * 0.85) * 0.55;
const lz = 0.85 + Math.sin(t * 0.5) * 0.15;
const lLen = Math.hypot(lx, ly, lz);
const nlx = lx / lLen, nly = ly / lLen, nlz = lz / lLen;

const gridScale = patternMode === 'pinfire' ? 36 : (patternMode === 'broad_flash' ? 10 : 20);
const warpAmt = patternMode === 'broad_flash' ? 0.28 : 0.12;
const bassBoost = audioFlare ? audio.bass * 0.6 : 0;
const trebleBoost = audioFlare ? audio.treble * 0.4 : 0;

let idx = 0;
for (let y = 0; y < H; y++) {
  const v = (y / H) * 2 - 1;
  for (let x = 0; x < W; x++) {
    const u = (x / W) * 2 - 1;

    let gemDist = 0;
    if (gemShape === 'round_gem') {
      gemDist = u * u + v * v;
    } else if (gemShape === 'cushion') {
      gemDist = Math.pow(Math.abs(u), 3.2) * 0.8 + Math.pow(Math.abs(v), 3.2) * 1.1;
    } else {
      const rad = 0.82 + 0.06 * Math.sin(Math.atan2(v, u) * 3 + 1.2);
      gemDist = (u * u * 0.72 + v * v * 1.35) / (rad * rad);
    }

    if (gemDist >= 1.0) {
      u32[idx++] = 0xFF030202;
      continue;
    }

    const nz = Math.sqrt(1.0 - gemDist);
    const nx = u * 0.85;
    const ny = v * 0.85;

    const wu = u + warpAmt * Math.sin(v * 7.0 + t * 0.9);
    const wv = v + warpAmt * Math.cos(u * 6.0 - t * 0.7);

    const gx = Math.min(63, Math.max(0, Math.floor((wu + 1.5) * gridScale * 0.4))) | 0;
    const gy = Math.min(47, Math.max(0, Math.floor((wv + 1.5) * gridScale * 0.4))) | 0;
    const cBase = (gy * 64 + gx) * 4;

    const cx = cells[cBase];
    const cy = cells[cBase + 1];
    const cz = cells[cBase + 2];
    const cd = cells[cBase + 3];

    const dotView = nx * cx + ny * cy + nz * cz;
    const dotLight = nlx * cx + nly * cy + nlz * cz;
    const bragg = (dotView * 1.85 + dotLight * 1.55 + cd + t * 0.25) % 1.0;
    const normBragg = bragg < 0 ? bragg + 1.0 : bragg;

    const halfWidth = 0.22 + bassBoost * 0.12;
    const dist = Math.abs(normBragg - 0.5);

    if (dist < halfWidth) {
      const q = 1.0 - dist / halfWidth;
      const flash = Math.pow(q, contrast);
      const spec = (normBragg - (0.5 - halfWidth)) / (2 * halfWidth);
      const lutIdx = Math.min(255, Math.max(0, Math.floor(spec * 255)));
      const baseCol = lut[lutIdx];

      const cr = (baseCol & 0xFF);
      const cg = ((baseCol >> 8) & 0xFF);
      const cb = ((baseCol >> 16) & 0xFF);

      const edgeFade = 1.0 - Math.pow(gemDist, 5);
      const lum = flash * edgeFade * (1.0 + trebleBoost);

      const fr = Math.min(255, Math.floor(cr * lum));
      const fg = Math.min(255, Math.floor(cg * lum));
      const fb = Math.min(255, Math.floor(cb * lum));
      u32[idx++] = (255 << 24) | (fb << 16) | (fg << 8) | fr;
    } else {
      const rim = Math.pow(gemDist, 7) * 14;
      u32[idx++] = (255 << 24) | (((rim * 0.8) | 0) << 16) | (((rim * 0.5) | 0) << 8) | ((rim | 0));
    }
  }
}

room.state.bCtx.putImageData(room.state.img, 0, 0);

ctx.save();
ctx.fillStyle = '#020104';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.drawImage(room.state.buf, 0, 0, frame.width, frame.height);

ctx.globalCompositeOperation = 'screen';
const cx = frame.width * 0.5;
const cy = frame.height * 0.5;
const minDim = Math.min(frame.width, frame.height);

const specX = cx + (nlx * minDim * 0.32);
const specY = cy + (nly * minDim * 0.32);
const glossRad = minDim * (0.35 + (audioFlare ? audio.mid * 0.15 : 0));
const gloss = ctx.createRadialGradient(specX, specY, 0, specX, specY, glossRad);
gloss.addColorStop(0, 'rgba(230, 245, 255, 0.42)');
gloss.addColorStop(0.2, 'rgba(120, 200, 240, 0.18)');
gloss.addColorStop(0.6, 'rgba(30, 60, 100, 0.04)');
gloss.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = gloss;
ctx.fillRect(0, 0, frame.width, frame.height);

if (sparkle > 0.05) {
  const numGlints = Math.floor(sparkle * 12);
  for (let i = 0; i < numGlints; i++) {
    const seed = (i * 97.13 + Math.floor(t * 1.8) * 13.57);
    const sx = Math.sin(seed * 11.3) * 0.65;
    const sy = Math.cos(seed * 7.9) * 0.65;
    if (sx * sx + sy * sy > 0.65) continue;

    const px = cx + sx * minDim * 0.45;
    const py = cy + sy * minDim * 0.45;
    const pulse = Math.pow(Math.max(0, Math.sin(t * 4.0 + i * 1.7)), 6) * sparkle;
    if (pulse < 0.1) continue;

    const glintSize = (4 + pulse * 14) * (1.0 + (audioFlare ? audio.treble * 1.5 : 0));
    const hue = (seed * 83) % 360;
    ctx.fillStyle = `hsla(${hue}, 95%, 75%, ${pulse * 0.8})`;
    ctx.beginPath();
    ctx.arc(px, py, glintSize * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsla(${hue}, 100%, 85%, ${pulse * 0.7})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px - glintSize, py);
    ctx.lineTo(px + glintSize, py);
    ctx.moveTo(px, py - glintSize);
    ctx.lineTo(px, py + glintSize);
    ctx.stroke();
  }
}

if (room.people && room.people.length > 0) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const ang = (i / room.people.length) * Math.PI * 2 + t * 0.3;
    const r = minDim * 0.42;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    ctx.fillStyle = `hsla(${p.hue}, 85%, 60%, 0.18)`;
    ctx.beginPath();
    ctx.arc(px, py, 6 + (audio.beat ? 4 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
}

ctx.globalCompositeOperation = 'multiply';
const vig = ctx.createRadialGradient(cx, cy, minDim * 0.28, cx, cy, minDim * 0.68);
vig.addColorStop(0, 'rgba(255,255,255,1)');
vig.addColorStop(0.7, 'rgba(240,240,245,0.95)');
vig.addColorStop(1, 'rgba(0,0,0,1)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.restore();