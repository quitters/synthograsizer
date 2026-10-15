ctx.save();

const wallArch = getVar('wall_architecture') ?? 'monolith';
const synthFeed = getVar('synth_feed') ?? 'paik_abe_synth';
const phosphorPal = getVar('phosphor_palette') ?? 'hyper_trinitron';
const vRollAmt = getVar('vertical_roll') ?? 0.4;
const bloomGlow = getVar('bloom_glow') ?? 0.8;
const scanDensity = getVar('scanline_density') ?? 1.0;
const cabinetFinish = getVar('cabinet_finish') ?? 'sony_trinitron_dark';
const staticFlicker = getVar('static_flicker') ?? true;

const aLevel = audio ? (audio.level ?? 0) : 0;
const aBass = audio ? (audio.bass ?? 0) : 0;
const aMid = audio ? (audio.mid ?? 0) : 0;
const aTreb = audio ? (audio.treble ?? 0) : 0;
const aBeat = Boolean(audio && audio.beat);

// --- PALETTES ---
const palettes = {
  hyper_trinitron: {
    c: ['#00f5d4', '#ff007f', '#ffe600', '#0038ff', '#ffffff'],
    halo: '0, 245, 212',
    bgDark: '#040508'
  },
  solar_ultraviolet: {
    c: ['#9b5de5', '#f15bb5', '#00f0ff', '#ff9e00', '#ffffff'],
    halo: '155, 93, 229',
    bgDark: '#06020c'
  },
  amber_phosphor: {
    c: ['#ffaa00', '#ff5500', '#ffd166', '#552200', '#fff4d0'],
    halo: '255, 170, 0',
    bgDark: '#080400'
  }
};
const pal = palettes[phosphorPal] ?? palettes.hyper_trinitron;

// --- OFFSCREEN MASTER BROADCAST (512x384) ---
room.state.srcCanvas ??= new OffscreenCanvas(512, 384);
const sctx = room.state.srcCanvas.getContext('2d');

// Trail persistence on synth feed
sctx.fillStyle = 'rgba(6, 6, 10, 0.32)';
sctx.fillRect(0, 0, 512, 384);

// Generate Master Synthesizer Feed
if (synthFeed === 'paik_abe_synth') {
  // Abe Wobbulator & Solarized Raster Bands
  const bands = 7;
  for (let b = 0; b < bands; b++) {
    const bx = (b / bands) * 512;
    const bw = 512 / bands + 2;
    const wave = Math.sin(frame.t * 2.2 + b * 0.9) * 25 * (0.3 + aBass);
    sctx.fillStyle = pal.c[b % pal.c.length];
    sctx.globalAlpha = 0.42;
    sctx.fillRect(bx + wave, 0, bw, 384);
  }
  sctx.globalAlpha = 1.0;

  // Sweeping Lissajous Electron Beam Loops
  sctx.save();
  sctx.globalCompositeOperation = 'lighter';
  for (let l = 0; l < 3; l++) {
    sctx.strokeStyle = pal.c[(l + 1) % pal.c.length];
    sctx.lineWidth = 2.5 + aBass * 7;
    sctx.beginPath();
    const fx = 1 + l;
    const fy = 2 + l;
    const phase = frame.t * (1.1 + l * 0.35);
    const radX = 140 + Math.sin(phase * 0.6) * 35 + aMid * 40;
    const radY = 90 + Math.cos(phase * 0.8) * 30 + aBass * 35;
    for (let p = 0; p <= 80; p++) {
      const th = (p / 80) * Math.PI * 2;
      const qx = 256 + Math.sin(th * fx + phase) * radX + Math.sin(th * 6) * (8 + aTreb * 20);
      const qy = 192 + Math.cos(th * fy + phase * 0.75) * radY;
      if (p === 0) sctx.moveTo(qx, qy); else sctx.lineTo(qx, qy);
    }
    sctx.stroke();
  }
  sctx.restore();

  // Audience Silhouettes / Carrier Signals
  const people = room.people || [];
  if (people.length > 0) {
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      const px = ((i + 0.5) / people.length) * 512;
      sctx.strokeStyle = 'hsl(' + (p.hue || 0) + ', 95%, 65%)';
      sctx.lineWidth = 2 + aLevel * 3;
      sctx.beginPath();
      for (let y = 0; y < 384; y += 12) {
        const dx = Math.sin(y * 0.05 + frame.t * 4 + i) * (10 + aMid * 30);
        if (y === 0) sctx.moveTo(px + dx, y); else sctx.lineTo(px + dx, y);
      }
      sctx.stroke();
    }
  }
} else if (synthFeed === 'electromagnetic_moire') {
  // Paik's Magnet TV: Dynamic Electromagnetic Interference
  const mx1 = 256 + Math.sin(frame.t * 0.85) * 110 * (1 + aBass * 0.4);
  const my1 = 192 + Math.cos(frame.t * 0.65) * 80;
  const mx2 = 256 - Math.cos(frame.t * 1.1) * 100;
  const my2 = 192 - Math.sin(frame.t * 0.9) * 75;

  sctx.save();
  sctx.globalCompositeOperation = 'lighter';
  // Warp raster lines
  for (let r = 20; r < 370; r += 9) {
    sctx.strokeStyle = pal.c[r % pal.c.length];
    sctx.lineWidth = 1.5 + (r % 3 === 0 ? aBass * 3 : 0);
    sctx.beginPath();
    for (let x = 0; x <= 512; x += 16) {
      const d1 = Math.hypot(x - mx1, r - my1) + 20;
      const d2 = Math.hypot(x - mx2, r - my2) + 20;
      const warp = (Math.sin(d1 * 0.08 - frame.t * 3) / d1) * 1200 - (Math.sin(d2 * 0.07 + frame.t * 2) / d2) * 1100;
      const y = r + warp * (0.5 + aMid * 0.8);
      if (x === 0) sctx.moveTo(x, y); else sctx.lineTo(x, y);
    }
    sctx.stroke();
  }
  sctx.restore();
} else {
  // Satellite Kaleidoscope (Paik 1984 Orwell Broadcast)
  sctx.save();
  sctx.translate(256, 192);
  const spokes = 8;
  const rot = frame.t * 0.4 + (aBeat ? 0.3 : 0);
  for (let s = 0; s < spokes; s++) {
    sctx.save();
    sctx.rotate(rot + (s * Math.PI * 2) / spokes);
    sctx.fillStyle = pal.c[s % pal.c.length];
    sctx.fillRect(20 + aBass * 30, -10, 160, 20 + aTreb * 25);
    sctx.strokeStyle = '#ffffff';
    sctx.lineWidth = 2;
    sctx.strokeRect(30, -15, 140, 30);
    // Target reticle
    sctx.beginPath();
    sctx.arc(120, 0, 15 + aMid * 20, 0, Math.PI * 2);
    sctx.stroke();
    sctx.restore();
  }
  sctx.restore();
}

// --- SCANLINE REPEATING PATTERN ---
if (!room.state.scanPattern || room.state.lastScanDensity !== scanDensity) {
  const pHeight = Math.max(3, Math.round(5 / scanDensity));
  const pcan = new OffscreenCanvas(2, pHeight);
  const pctx = pcan.getContext('2d');
  pctx.fillStyle = 'rgba(0, 0, 0, 0)';
  pctx.fillRect(0, 0, 2, pHeight);
  pctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
  pctx.fillRect(0, Math.floor(pHeight * 0.5), 2, Math.ceil(pHeight * 0.5));
  room.state.scanPattern = ctx.createPattern(pcan, 'repeat');
  room.state.lastScanDensity = scanDensity;
}

// --- TV LAYOUTS CACHE ---
if (!room.state.tvs || room.state.lastArch !== wallArch) {
  const list = [];
  if (wallArch === 'irregular_stack') {
    // 5 Asymmetric Sculptural Columns
    const cols = [
      { x: 0.03, w: 0.16, ys: [0.18, 0.45, 0.73], hs: [0.25, 0.26, 0.26] },
      { x: 0.21, w: 0.17, ys: [0.08, 0.30, 0.53, 0.76], hs: [0.20, 0.21, 0.21, 0.23] },
      { x: 0.40, w: 0.27, ys: [0.02, 0.21, 0.46], hs: [0.17, 0.23, 0.53] },
      { x: 0.69, w: 0.15, ys: [0.14, 0.42, 0.71], hs: [0.26, 0.27, 0.28] },
      { x: 0.86, w: 0.11, ys: [0.10, 0.31, 0.53, 0.76], hs: [0.19, 0.20, 0.21, 0.23] }
    ];
    let idx = 0;
    for (const c of cols) {
      for (let j = 0; j < c.ys.length; j++) {
        list.push({
          x: c.x, y: c.ys[j], w: c.w, h: c.hs[j],
          model: (idx % 3),
          led: idx % 2 === 0 ? '#00ff66' : (idx % 3 === 0 ? '#ff9900' : '#ff3300')
        });
        idx++;
      }
    }
  } else if (wallArch === 'pyramid_shrine') {
    // Stepped Paik Ziggurat
    const rows = [
      [{ x: 0.37, y: 0.03, w: 0.26, h: 0.22 }],
      [{ x: 0.23, y: 0.27, w: 0.25, h: 0.22 }, { x: 0.51, y: 0.27, w: 0.25, h: 0.22 }],
      [{ x: 0.13, y: 0.51, w: 0.23, h: 0.22 }, { x: 0.38, y: 0.51, w: 0.24, h: 0.22 }, { x: 0.63, y: 0.51, w: 0.23, h: 0.22 }],
      [
        { x: 0.02, y: 0.75, w: 0.18, h: 0.23 }, { x: 0.21, y: 0.75, w: 0.18, h: 0.23 },
        { x: 0.41, y: 0.75, w: 0.18, h: 0.23 }, { x: 0.60, y: 0.75, w: 0.18, h: 0.23 },
        { x: 0.80, y: 0.75, w: 0.18, h: 0.23 }
      ]
    ];
    let idx = 0;
    for (const r of rows) {
      for (const t of r) {
        list.push({
          x: t.x, y: t.y, w: t.w, h: t.h,
          model: idx === 0 ? 1 : (idx % 3),
          led: idx % 2 === 0 ? '#00ff66' : '#ff9900'
        });
        idx++;
      }
    }
  } else {
    // Monolith: 20-screen dense Paik wall
    const rows = [
      [{ x: 0.02, w: 0.23 }, { x: 0.26, w: 0.25 }, { x: 0.52, w: 0.24 }, { x: 0.77, w: 0.21 }],
      [{ x: 0.01, w: 0.19 }, { x: 0.21, w: 0.21 }, { x: 0.43, w: 0.20 }, { x: 0.64, w: 0.19 }, { x: 0.84, w: 0.15 }],
      [{ x: 0.01, w: 0.34 }, { x: 0.36, w: 0.32 }, { x: 0.69, w: 0.30 }],
      [{ x: 0.01, w: 0.19 }, { x: 0.21, w: 0.21 }, { x: 0.43, w: 0.20 }, { x: 0.64, w: 0.19 }, { x: 0.84, w: 0.15 }],
      [{ x: 0.02, w: 0.23 }, { x: 0.26, w: 0.24 }, { x: 0.51, w: 0.24 }, { x: 0.76, w: 0.22 }]
    ];
    const yPos = [0.01, 0.20, 0.39, 0.64, 0.82];
    const yH = [0.18, 0.18, 0.24, 0.17, 0.17];
    let idx = 0;
    for (let r = 0; r < rows.length; r++) {
      for (const t of rows[r]) {
        list.push({
          x: t.x, y: yPos[r], w: t.w, h: yH[r],
          model: (idx % 3),
          led: idx % 3 === 0 ? '#00ff66' : (idx % 3 === 1 ? '#ff3300' : '#ff9900')
        });
        idx++;
      }
    }
  }

  // Init dynamic sync variables
  for (let i = 0; i < list.length; i++) {
    const tv = list[i];
    tv.u0 = tv.x;
    tv.v0 = tv.y;
    tv.uw = tv.w;
    tv.uh = tv.h;
    tv.rollOffset = 0;
    tv.rollSpeed = 0;
    tv.staticLevel = 0;
    tv.desyncProne = 0.3 + ((i * 17) % 70) / 100;
    tv.hasSideControls = (tv.w > 0.16 && tv.model !== 1);
    tv.hasBottomControls = (tv.model === 1);
  }
  room.state.tvs = list;
  room.state.lastArch = wallArch;
}

// --- DYNAMIC ROLL & GLITCH UPDATES ---
const tvs = room.state.tvs;
for (let i = 0; i < tvs.length; i++) {
  const tv = tvs[i];
  if (aBeat && Math.random() < vRollAmt * 0.7 * tv.desyncProne) {
    tv.rollSpeed = (Math.random() < 0.5 ? 1 : -1) * (1.8 + Math.random() * 3.2) * vRollAmt;
    tv.staticLevel = 0.65;
  }
  if (Math.abs(tv.rollSpeed) > 0.01) {
    tv.rollOffset = (tv.rollOffset + tv.rollSpeed * frame.dt) % 1;
    if (tv.rollOffset < 0) tv.rollOffset += 1;
    tv.rollSpeed *= Math.pow(0.12, frame.dt);
  } else {
    tv.rollSpeed = 0;
    if (tv.rollOffset > 0.002) {
      tv.rollOffset *= Math.pow(0.04, frame.dt);
      if (tv.rollOffset < 0.003) tv.rollOffset = 0;
    }
  }
  if (tv.staticLevel > 0) {
    tv.staticLevel -= frame.dt * 2.2;
  }
}

// --- WALL COORDINATE BOUNDS ---
const wallW = Math.min(frame.width * 0.94, frame.height * 1.72);
const wallH = wallW * 0.57;
const wallX = (frame.width - wallW) * 0.5;
const wallY = (frame.height - wallH) * 0.46;
const floorY = wallY + wallH + 10;

// --- ROOM DRAW: GALLERY VOID & REFLECTION ---
ctx.fillStyle = '#06070a';
ctx.fillRect(0, 0, frame.width, frame.height);

// Ambient Neon Halo behind TVs
const haloGrad = ctx.createRadialGradient(
  wallX + wallW * 0.5, wallY + wallH * 0.45, 40,
  wallX + wallW * 0.5, wallY + wallH * 0.45, wallW * 0.65
);
haloGrad.addColorStop(0, 'rgba(' + pal.halo + ',' + (0.16 * bloomGlow * (1 + aBass * 0.6)) + ')');
haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = haloGrad;
ctx.fillRect(0, 0, frame.width, floorY + 20);

// Polished Museum Gallery Floor
const floorGrad = ctx.createLinearGradient(0, floorY, 0, frame.height);
floorGrad.addColorStop(0, '#101219');
floorGrad.addColorStop(0.3, '#08090c');
floorGrad.addColorStop(1, '#030406');
ctx.fillStyle = floorGrad;
ctx.fillRect(0, floorY, frame.width, frame.height - floorY);

// Floor reflections
for (let i = 0; i < tvs.length; i += 3) {
  const tv = tvs[i];
  const fx = wallX + (tv.x + tv.w * 0.5) * wallW;
  const fw = tv.w * wallW * 1.1;
  const fSheen = ctx.createLinearGradient(0, floorY, 0, floorY + 120);
  fSheen.addColorStop(0, 'rgba(' + pal.halo + ',' + (0.14 * bloomGlow * (1 + aBass * 0.8)) + ')');
  fSheen.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fSheen;
  ctx.fillRect(fx - fw * 0.5, floorY, fw, 120);
}

// --- CABINET STYLES ---
const chassisStyles = {
  sony_trinitron_dark: { base: '#16181d', hi: '#2b2f38', lo: '#090a0d', rim: '#1f2229' },
  vintage_teak: { base: '#341d11', hi: '#58321d', lo: '#170c06', rim: '#422516' },
  industrial_gray: { base: '#262930', hi: '#424854', lo: '#121417', rim: '#30343d' }
};
const ch = chassisStyles[cabinetFinish] ?? chassisStyles.sony_trinitron_dark;

// Helper for CRT curved tube
function pathCurvedTube(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) {
    c.roundRect(x, y, w, h, r);
  } else {
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
}

// --- DRAW MONITORS ---
for (let i = 0; i < tvs.length; i++) {
  const tv = tvs[i];
  const tvX = wallX + tv.x * wallW;
  const tvY = wallY + tv.y * wallH;
  const tvW = tv.w * wallW;
  const tvH = tv.h * wallH;

  // Chassis Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(tvX + 4, tvY + 6, tvW, tvH);

  // Chassis Body
  ctx.fillStyle = ch.base;
  ctx.fillRect(tvX, tvY, tvW, tvH);

  // Bevel Highlights & Shadows
  ctx.fillStyle = ch.hi;
  ctx.fillRect(tvX, tvY, tvW, 1.5);
  ctx.fillRect(tvX, tvY, 1.5, tvH);
  ctx.fillStyle = ch.lo;
  ctx.fillRect(tvX, tvY + tvH - 1.5, tvW, 1.5);
  ctx.fillRect(tvX + tvW - 1.5, tvY, 1.5, tvH);

  // Calculate Screen Area inside Bezel
  const bezel = Math.max(3, Math.min(tvW * 0.05, 8));
  let scrX = tvX + bezel;
  let scrY = tvY + bezel;
  let scrW = tvW - bezel * 2;
  let scrH = tvH - bezel * 2;

  let ctlX = 0, ctlY = 0, ctlW = 0, ctlH = 0;
  if (tv.hasSideControls && scrW > 45) {
    ctlW = Math.max(12, Math.min(tvW * 0.16, 26));
    ctlX = scrX + scrW - ctlW;
    ctlY = scrY;
    ctlH = scrH;
    scrW -= ctlW + 2;
  } else if (tv.hasBottomControls && scrH > 40) {
    ctlH = Math.max(9, Math.min(tvH * 0.14, 18));
    ctlX = scrX;
    ctlY = scrY + scrH - ctlH;
    ctlW = scrW;
    scrH -= ctlH + 2;
  }

  // Curved Screen Clipping
  const cr = Math.min(scrW, scrH) * 0.08;
  ctx.save();
  pathCurvedTube(ctx, scrX, scrY, scrW, scrH, cr);
  ctx.clip();

  // Tube Base Black
  ctx.fillStyle = '#050608';
  ctx.fillRect(scrX, scrY, scrW, scrH);

  // Map to Master Feed
  const su = tv.u0 * 512;
  const sv = tv.v0 * 384;
  const suw = tv.uw * 512;
  const suh = tv.uh * 384;
  const roll = tv.rollOffset || 0;

  if (roll > 0.002) {
    const rollPx = roll * scrH;
    ctx.drawImage(room.state.srcCanvas, su, sv, suw, suh, scrX, scrY + rollPx, scrW, scrH);
    ctx.drawImage(room.state.srcCanvas, su, sv, suw, suh, scrX, scrY + rollPx - scrH, scrW, scrH);

    // CRT Vertical Blanking Bar
    const barY = scrY + rollPx;
    const barH = Math.max(4, scrH * 0.11);
    ctx.fillStyle = '#020204';
    ctx.fillRect(scrX, barY - barH, scrW, barH);
    ctx.fillStyle = 'rgba(210, 230, 255, 0.75)';
    ctx.fillRect(scrX + scrW * 0.15, barY - barH * 0.5, scrW * 0.7, 1.8);
  } else {
    ctx.drawImage(room.state.srcCanvas, su, sv, suw, suh, scrX, scrY, scrW, scrH);
  }

  // Cathode Static / Noise Band
  if (staticFlicker && (tv.staticLevel > 0.05 || (aBeat && Math.random() < 0.08))) {
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.15 + Math.random() * 0.25) + ')';
    const ny = scrY + Math.random() * (scrH - 10);
    ctx.fillRect(scrX, ny, scrW, 2 + Math.random() * 8);
  }

  // Scanlines Overlay
  if (room.state.scanPattern) {
    ctx.fillStyle = room.state.scanPattern;
    ctx.fillRect(scrX, scrY, scrW, scrH);
  }

  // Curved Tube Glass Specular Glare
  const glare = ctx.createLinearGradient(scrX, scrY, scrX + scrW * 0.75, scrY + scrH * 0.75);
  glare.addColorStop(0, 'rgba(255, 255, 255, ' + (0.22 * bloomGlow) + ')');
  glare.addColorStop(0.25, 'rgba(255, 255, 255, 0.03)');
  glare.addColorStop(0.65, 'rgba(0, 0, 0, 0)');
  glare.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = glare;
  ctx.fillRect(scrX, scrY, scrW, scrH);

  // Gasket Shadow Rim
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.lineWidth = Math.max(2, scrW * 0.04);
  ctx.stroke();

  ctx.restore(); // Unclip screen

  // Chassis Controls & Hardware Accents
  if (ctlW > 0 && ctlH > 0) {
    if (tv.hasSideControls) {
      // Rotary knobs
      ctx.fillStyle = '#111215';
      ctx.beginPath();
      ctx.arc(ctlX + ctlW * 0.5, ctlY + ctlH * 0.3, Math.min(ctlW * 0.35, 7), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ctlX + ctlW * 0.5, ctlY + ctlH * 0.6, Math.min(ctlW * 0.35, 7), 0, Math.PI * 2);
      ctx.fill();
      // Power LED
      ctx.fillStyle = tv.led;
      ctx.beginPath();
      ctx.arc(ctlX + ctlW * 0.5, ctlY + ctlH * 0.88, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (tv.hasBottomControls) {
      // Trinitron speaker grille lines
      ctx.fillStyle = '#0f1013';
      for (let g = ctlY + 3; g < ctlY + ctlH - 3; g += 3) {
        ctx.fillRect(ctlX + 4, g, ctlW - 18, 1.2);
      }
      // Power LED
      ctx.fillStyle = tv.led;
      ctx.beginPath();
      ctx.arc(ctlX + ctlW - 8, ctlY + ctlH * 0.5, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Minimal corner LED
    ctx.fillStyle = tv.led;
    ctx.beginPath();
    ctx.arc(tvX + tvW - 6, tvY + tvH - 6, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Industrial rack screws
  if (cabinetFinish === 'industrial_gray' && tvW > 60) {
    ctx.fillStyle = '#656b78';
    ctx.fillRect(tvX + 3, tvY + 3, 2.5, 2.5);
    ctx.fillRect(tvX + tvW - 5.5, tvY + 3, 2.5, 2.5);
    ctx.fillRect(tvX + 3, tvY + tvH - 5.5, 2.5, 2.5);
    ctx.fillRect(tvX + tvW - 5.5, tvY + tvH - 5.5, 2.5, 2.5);
  }
}

ctx.restore();