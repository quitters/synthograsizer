ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;

// 1. Controls & config
const pStyle = getVar('pattern_style') ?? 'circuit';
const palName = getVar('palette') ?? 'cyber_amber';
const optMode = getVar('refraction_mode') ?? 'fisheye_bulge';
const radius = Math.floor(getVar('lens_radius') ?? 140);
const zoom = getVar('lens_zoom') ?? 1.8;
const chroma = Math.floor(getVar('aberration') ?? 3);
const speed = getVar('lens_speed') ?? 0.8;

const PALETTES = {
  cyber_amber:  { bg: '#080603', grid1: '#3d2507', grid2: '#ff9d00', glow: '#ffe29a', rim: '#ffffff' },
  deep_emerald: { bg: '#020a06', grid1: '#0a3821', grid2: '#00ff88', glow: '#a3ffd5', rim: '#eafff5' },
  sapphire_neon:{ bg: '#02050e', grid1: '#0c224a', grid2: '#00b4ff', glow: '#bde7ff', rim: '#ffffff' },
  solar_flare:  { bg: '#0d0202', grid1: '#4a0808', grid2: '#ff3b14', glow: '#ffb380', rim: '#fff4ea' }
};
const pal = PALETTES[palName] ?? PALETTES.cyber_amber;

// 2. Precomputed displacement lookup tables (LUT) in room.state
const S = radius * 2;
const lutKey = `${radius}_${zoom.toFixed(2)}_${optMode}`;
room.state.lutKey ??= '';

if (room.state.lutKey !== lutKey || !room.state.dxLut || room.state.lutSize !== S) {
  room.state.lutKey = lutKey;
  room.state.lutSize = S;
  const total = S * S;
  const dx = new Int16Array(total);
  const dy = new Int16Array(total);
  const mask = new Uint8Array(total);
  const r2 = radius * radius;
  const invR = 1 / radius;

  for (let y = 0; y < S; y++) {
    const py = y - radius;
    const row = y * S;
    for (let x = 0; x < S; x++) {
      const px = x - radius;
      const d2 = px * px + py * py;
      const idx = row + x;
      if (d2 <= r2) {
        mask[idx] = 255;
        const dist = Math.sqrt(d2);
        const norm = dist * invR;
        let factor = 1;
        if (optMode === 'fisheye_bulge') {
          const theta = norm * (Math.PI * 0.5);
          factor = (Math.sin(theta) / (norm || 0.0001)) * (1 / zoom);
        } else if (optMode === 'spherical_pinch') {
          const z = Math.sqrt(Math.max(0, 1 - norm * norm));
          factor = (1 / zoom) * (0.6 + 0.4 * z);
        } else {
          factor = (1 / zoom) * (1 + 0.45 * Math.sin(norm * Math.PI * 2));
        }
        const sx = px * factor;
        const sy = py * factor;
        dx[idx] = Math.round(sx - px);
        dy[idx] = Math.round(sy - py);
      } else {
        mask[idx] = 0;
        dx[idx] = 0;
        dy[idx] = 0;
      }
    }
  }
  room.state.dxLut = dx;
  room.state.dyLut = dy;
  room.state.maskLut = mask;
}

// Allocate reusable buffers on room.state to prevent garbage collection spikes
if (!room.state.patchCanvas || room.state.patchCanvas.width !== S || room.state.patchCanvas.height !== S) {
  room.state.patchCanvas = new OffscreenCanvas(S, S);
  room.state.patchCtx = room.state.patchCanvas.getContext('2d', { willReadFrequently: true });
}

// 3. Draw Background Field
ctx.fillStyle = pal.bg;
ctx.fillRect(0, 0, W, H);

const bassKick = audio.bass * 14;
const tMove = t * speed;

if (pStyle === 'circuit') {
  ctx.lineWidth = 1.2;
  const step = 44;
  ctx.strokeStyle = pal.grid1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += step) {
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let y = 0; y <= H; y += step) {
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();

  ctx.strokeStyle = pal.grid2;
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  const cols = Math.ceil(W / step);
  const rows = Math.ceil(H / step);
  for (let i = 0; i < cols; i += 2) {
    const gx = i * step;
    const phase = Math.sin(i * 1.5 + tMove * 0.7);
    const yTarget = ((phase + 1) * 0.5) * H;
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, yTarget);
    ctx.lineTo(gx + step, yTarget + step);
  }
  ctx.stroke();

  ctx.fillStyle = pal.glow;
  for (let j = 0; j < rows; j += 3) {
    for (let i = 0; i < cols; i += 3) {
      const px = i * step;
      const py = j * step;
      const pulse = 2 + 3 * Math.sin(tMove * 2 + i + j) + audio.treble * 4;
      ctx.fillRect(px - pulse * 0.5, py - pulse * 0.5, pulse, pulse);
    }
  }
} else if (pStyle === 'islamic_grid') {
  const s = 64;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = pal.grid1;
  ctx.beginPath();
  for (let x = -s; x < W + s; x += s) {
    for (let y = -s; y < H + s; y += s) {
      ctx.strokeRect(x, y, s, s);
      ctx.moveTo(x, y + s * 0.5);
      ctx.lineTo(x + s * 0.5, y);
      ctx.lineTo(x + s, y + s * 0.5);
      ctx.lineTo(x + s * 0.5, y + s);
      ctx.closePath();
    }
  }
  ctx.stroke();

  ctx.strokeStyle = pal.grid2;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let x = 0; x < W + s; x += s * 2) {
    for (let y = 0; y < H + s; y += s * 2) {
      const rRad = (s * 0.38) + Math.sin(tMove + (x + y) * 0.01) * 6 + audio.mid * 8;
      ctx.moveTo(x + rRad, y);
      ctx.arc(x, y, Math.max(2, rRad), 0, Math.PI * 2);
    }
  }
  ctx.stroke();
} else if (pStyle === 'topography') {
  ctx.lineWidth = 1.8;
  const bands = 24;
  for (let b = 0; b < bands; b++) {
    ctx.strokeStyle = (b % 4 === 0) ? pal.grid2 : pal.grid1;
    ctx.beginPath();
    const yBase = (H / bands) * b;
    for (let x = 0; x <= W; x += 40) {
      const wav = Math.sin(x * 0.007 + b * 0.4 + tMove) * 35 +
                  Math.cos(x * 0.018 - tMove * 0.5) * 20 +
                  Math.sin((x + b * 20) * 0.03) * (audio.bass * 30);
      if (x === 0) ctx.moveTo(x, yBase + wav); else ctx.lineTo(x, yBase + wav);
    }
    ctx.stroke();
  }
} else {
  // moire_weave
  const lines = 70;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = pal.grid1;
  const cx = W * 0.5, cy = H * 0.5;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / lines) {
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a + tMove * 0.2) * (W + H), cy + Math.sin(a + tMove * 0.2) * (W + H));
  }
  ctx.stroke();
  ctx.strokeStyle = pal.grid2;
  ctx.beginPath();
  const offX = Math.sin(tMove * 0.6) * 160;
  const offY = Math.cos(tMove * 0.4) * 120;
  for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / lines) {
    ctx.moveTo(cx + offX, cy + offY);
    ctx.lineTo(cx + offX + Math.cos(a - tMove * 0.15) * (W + H), cy + offY + Math.sin(a - tMove * 0.15) * (W + H));
  }
  ctx.stroke();
}

// Represent room participants as small orbital data nodes on the circuit
if (room.people && room.people.length > 0) {
  for (let i = 0; i < room.people.length; i++) {
    const p = room.people[i];
    const ang = (i / room.people.length) * Math.PI * 2 + t * 0.5;
    const orbitDist = 220 + (i * 27) % 260;
    const px = W * 0.5 + Math.cos(ang) * orbitDist;
    const py = H * 0.5 + Math.sin(ang * 1.3) * (orbitDist * 0.6);
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, 4 + audio.mid * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 4. Lens trajectory (Lissajous figure)
const lx = Math.round(W * 0.5 + Math.sin(tMove * 0.72) * (W * 0.33) + Math.cos(tMove * 1.41) * (W * 0.08));
const ly = Math.round(H * 0.5 + Math.cos(tMove * 0.51) * (H * 0.31) + Math.sin(tMove * 1.13) * (H * 0.07));

const rx0 = lx - radius;
const ry0 = ly - radius;

// Safe bounds clamping
if (rx0 >= 0 && ry0 >= 0 && (rx0 + S) <= W && (ry0 + S) <= H) {
  const pCtx = room.state.patchCtx;
  // Grab unmagnified region underneath lens
  pCtx.drawImage(ctx.canvas, rx0, ry0, S, S, 0, 0, S, S);
  const srcImg = pCtx.getImageData(0, 0, S, S);
  const srcData = srcImg.data;

  // Allocate destination image buffer if not cached
  if (!room.state.outImg || room.state.outImg.width !== S || room.state.outImg.height !== S) {
    room.state.outImg = pCtx.createImageData(S, S);
  }
  const outData = room.state.outImg.data;
  const dxLut = room.state.dxLut;
  const dyLut = room.state.dyLut;
  const maskLut = room.state.maskLut;
  const chr = chroma + Math.floor(audio.bass * 4);

  // Pixel refraction pass with chromatic aberration and masking
  let pIdx = 0;
  for (let y = 0; y < S; y++) {
    const rowOffset = y * S;
    for (let x = 0; x < S; x++) {
      if (maskLut[pIdx] > 0) {
        const dX = dxLut[pIdx];
        const dY = dyLut[pIdx];

        // Red channel (shifted by +chroma)
        const rxClamped = Math.min(S - 1, Math.max(0, x + dX + chr));
        const ryClamped = Math.min(S - 1, Math.max(0, y + dY));
        const rSrc = (ryClamped * S + rxClamped) << 2;

        // Green channel (nominal displacement)
        const gxClamped = Math.min(S - 1, Math.max(0, x + dX));
        const gyClamped = Math.min(S - 1, Math.max(0, y + dY));
        const gSrc = (gyClamped * S + gxClamped) << 2;

        // Blue channel (shifted by -chroma)
        const bxClamped = Math.min(S - 1, Math.max(0, x + dX - chr));
        const byClamped = Math.min(S - 1, Math.max(0, y + dY));
        const bSrc = (byClamped * S + bxClamped) << 2;

        const dPos = pIdx << 2;
        outData[dPos]     = srcData[rSrc];
        outData[dPos + 1] = srcData[gSrc + 1];
        outData[dPos + 2] = srcData[bSrc + 2];
        outData[dPos + 3] = 255;
      } else {
        const dPos = pIdx << 2;
        outData[dPos + 3] = 0; // Transparent outside lens circle
      }
      pIdx++;
    }
  }

  pCtx.putImageData(room.state.outImg, 0, 0);
  ctx.drawImage(room.state.patchCanvas, rx0, ry0);
}

// 5. Bright specular rim, lens reflections, and outer shadow
ctx.save();
// Soft glass body highlight
const grad = ctx.createRadialGradient(lx - radius * 0.35, ly - radius * 0.35, 10, lx, ly, radius);
grad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.02)');
grad.addColorStop(0.92, 'rgba(0, 0, 0, 0.25)');
grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');

ctx.fillStyle = grad;
ctx.beginPath();
ctx.arc(lx, ly, radius, 0, Math.PI * 2);
ctx.fill();

// High-contrast bright glass rim & bevel
ctx.lineWidth = 4 + bassKick * 0.3;
ctx.strokeStyle = pal.rim;
ctx.shadowColor = pal.glow;
ctx.shadowBlur = 16 + audio.mid * 20;
ctx.beginPath();
ctx.arc(lx, ly, radius - 1.5, 0, Math.PI * 2);
ctx.stroke();

// Crescent specular reflection along top-left curve
ctx.shadowBlur = 0;
ctx.lineWidth = 3.5;
ctx.strokeStyle = '#ffffff';
ctx.beginPath();
ctx.arc(lx, ly, radius - 6, Math.PI * 1.05, Math.PI * 1.55);
ctx.stroke();

// Opposite faint counter-reflection along bottom-right
ctx.lineWidth = 1.8;
ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
ctx.beginPath();
ctx.arc(lx, ly, radius - 7, Math.PI * 0.15, Math.PI * 0.45);
ctx.stroke();
ctx.restore();

ctx.restore();