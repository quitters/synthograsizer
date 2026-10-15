ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;

// Read variables
const mode = getVar('laser_mode') ?? 'liquid_sky';
const palChoice = getVar('palette') ?? 'emerald_cyan';
const beamCount = getVar('beam_count') ?? 24;
const speed = getVar('scan_speed') ?? 1.0;
const haze = getVar('haze_density') ?? 0.6;
const showCrowd = getVar('crowd_silhouettes') ?? true;
const strobe = getVar('strobe_on_beat') ?? true;

// Color tables [primary hue, secondary hue, core tint]
const PALETTES = {
  emerald_cyan: { h1: 155, h2: 185, sat: 100, core: 'rgba(230,255,245,' },
  cyber_synth: { h1: 310, h2: 195, sat: 100, core: 'rgba(255,230,255,' },
  crimson_gold: { h1: 355, h2: 42, sat: 100, core: 'rgba(255,240,220,' },
  monochrome_white: { h1: 200, h2: 210, sat: 30, core: 'rgba(255,255,255,' }
};
const col = PALETTES[palChoice] ?? PALETTES.emerald_cyan;

// State setup: persistent haze drift & projector heads
room.state.phase ??= 0;
room.state.beatFlash ??= 0;
room.state.crowdSeeds ??= [];

if (room.state.crowdSeeds.length === 0) {
  for (let i = 0; i < 40; i++) {
    room.state.crowdSeeds.push({
      u: i / 40,
      h: 0.12 + ((i * 37) % 19) * 0.005,
      r: 12 + ((i * 13) % 10),
      arm: (i % 5 === 0)
    });
  }
}

// Advance synchronized scan phase
room.state.phase += frame.dt * speed * (1.0 + audio.mid * 0.8);
if (audio.beat) {
  room.state.beatFlash = 1.0;
} else {
  room.state.beatFlash = Math.max(0, room.state.beatFlash - frame.dt * 4.5);
}
const phase = room.state.phase;
const flash = strobe ? room.state.beatFlash : 0;

// 1. Atmosphere: deep stage dark with subtle smoke illumination
ctx.fillStyle = '#030307';
ctx.fillRect(0, 0, W, H);

// Subtle ambient smoke wash
const hazeGrad = ctx.createLinearGradient(0, 0, 0, H);
hazeGrad.addColorStop(0, `hsla(${col.h1}, ${col.sat * 0.4}%, 15%, ${0.08 * haze})`);
hazeGrad.addColorStop(0.6, `hsla(${col.h2}, ${col.sat * 0.5}%, 8%, ${0.05 * haze})`);
hazeGrad.addColorStop(1, '#020204');
ctx.fillStyle = hazeGrad;
ctx.fillRect(0, 0, W, H);

// Rig projector origins across top truss
const headCount = 5;
const heads = [];
const rigY = H * 0.12;
for (let i = 0; i < headCount; i++) {
  heads.push({
    x: W * (0.2 + 0.6 * (i / (headCount - 1))),
    y: rigY + Math.sin(phase * 0.8 + i) * 6
  });
}

// Draw stage truss structure
ctx.lineWidth = 2;
ctx.strokeStyle = 'rgba(40, 45, 60, 0.4)';
ctx.beginPath();
ctx.moveTo(W * 0.1, rigY - 14);
ctx.lineTo(W * 0.9, rigY - 14);
ctx.moveTo(W * 0.1, rigY + 2);
ctx.lineTo(W * 0.9, rigY + 2);
for (let x = W * 0.12; x < W * 0.88; x += 32) {
  ctx.moveTo(x, rigY - 14);
  ctx.lineTo(x + 16, rigY + 2);
  ctx.lineTo(x + 32, rigY - 14);
}
ctx.stroke();

// Laser drawing helper with volumetric glow pass & sharp white core pass
ctx.globalCompositeOperation = 'lighter';

function renderLaserBeam(x1, y1, x2, y2, hue, intensity = 1.0) {
  const alpha = Math.min(1, Math.max(0.1, intensity));
  // Haze glow sleeve
  ctx.lineWidth = 7 + audio.bass * 6;
  ctx.strokeStyle = `hsla(${hue}, ${col.sat}%, 50%, ${0.09 * haze * alpha})`;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Colored sheath
  ctx.lineWidth = 2.4 + audio.bass * 1.5;
  ctx.strokeStyle = `hsla(${hue}, ${col.sat}%, 65%, ${0.45 * alpha})`;
  ctx.stroke();

  // Razor core
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = `${col.core}${0.85 * alpha})`;
  ctx.stroke();
}

// 2. Geometry Modes
const doLiquid = mode === 'liquid_sky' || mode === 'all_systems';
const doTunnel = mode === 'tunnel_cone' || mode === 'all_systems';
const doFans   = mode === 'fan_scan' || mode === 'all_systems';

// --- Liquid Sky: undulating laser sheet cutting horizontally through haze ---
if (doLiquid) {
  const sheetY = H * 0.58 + Math.sin(phase * 0.5) * (H * 0.08);
  const slices = Math.min(beamCount * 2, 64);
  const leftOrigin = heads[0];
  const rightOrigin = heads[heads.length - 1];

  // Mesh of tightly scanned lines forming a sheet
  ctx.beginPath();
  for (let s = 0; s <= slices; s++) {
    const u = s / slices;
    const targetX = W * (-0.05 + 1.1 * u);
    const wave = Math.sin(u * 14 + phase * 2.8) * (18 + audio.bass * 35)
               + Math.cos(u * 7 - phase * 1.5) * 12;
    const targetY = sheetY + wave;
    const head = s % 2 === 0 ? leftOrigin : rightOrigin;
    const hue = (s % 4 < 2) ? col.h1 : col.h2;
    renderLaserBeam(head.x, head.y, targetX, targetY, hue, 0.45 + (flash * 0.4));
  }

  // Slicing edge bright border across haze
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = `${col.core}${0.8 + flash * 0.2})`;
  ctx.beginPath();
  for (let s = 0; s <= slices; s++) {
    const u = s / slices;
    const px = W * (-0.05 + 1.1 * u);
    const py = sheetY + Math.sin(u * 14 + phase * 2.8) * (18 + audio.bass * 35) + Math.cos(u * 7 - phase * 1.5) * 12;
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

// --- Tunnel / Cones: projected polygonal barrels expanding at the camera ---
if (doTunnel) {
  const centerHead = heads[Math.floor(headCount / 2)];
  const ringCount = 5;
  const vertices = Math.min(24, Math.max(8, Math.floor(beamCount / 2)));
  const rot = phase * 0.9;
  const fovW = W * 0.65;
  const fovH = H * 0.45;

  for (let r = 1; r <= ringCount; r++) {
    const depth = ((phase * 0.6 + r / ringCount) % 1.0);
    const radX = (depth * depth) * fovW + 20;
    const radY = (depth * depth) * fovH + 12;
    const ringAlpha = Math.sin(depth * Math.PI) * (0.5 + audio.bass * 0.5);
    const ringHue = (r % 2 === 0) ? col.h1 : col.h2;

    for (let v = 0; v < vertices; v++) {
      const angle = (v / vertices) * Math.PI * 2 + rot * (r % 2 === 0 ? 1 : -1);
      const cx = centerHead.x + Math.cos(angle) * radX;
      const cy = (H * 0.52) + Math.sin(angle) * radY;
      if (depth > 0.35 || v % 2 === 0) {
        renderLaserBeam(centerHead.x, centerHead.y, cx, cy, ringHue, ringAlpha);
      }
    }
  }
}

// --- Fan & Cross Scanning: synchronized sweeps from multiple heads ---
if (doFans) {
  const beamsPerHead = Math.max(4, Math.floor(beamCount / headCount));
  heads.forEach((head, hIdx) => {
    // Base scan angle oscillates
    const sweep = Math.sin(phase * 1.4 + hIdx * 1.1) * 0.7;
    const fanSpread = 0.55 + audio.treble * 0.35;
    const baseHue = (hIdx % 2 === 0) ? col.h1 : col.h2;

    for (let b = 0; b < beamsPerHead; b++) {
      const frac = (b / (beamsPerHead - 1)) - 0.5;
      const angle = Math.PI * 0.5 + sweep + (frac * fanSpread);
      const length = Math.max(W, H) * 1.2;
      const targetX = head.x + Math.cos(angle) * length;
      const targetY = head.y + Math.sin(angle) * length;
      const bHue = baseHue + (b * 6) % 30;
      renderLaserBeam(head.x, head.y, targetX, targetY, bHue, 0.7 + flash * 0.3);
    }
  });
}

// Incorporate room.people: individual audience member target beams
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 16);
  for (let i = 0; i < pCount; i++) {
    const p = room.people[i];
    const hIndex = i % headCount;
    const origin = heads[hIndex];
    const px = ((i + 0.5) / pCount) * W;
    const py = H * 0.88 + Math.sin(phase * 3 + i) * 14;
    renderLaserBeam(origin.x, origin.y, px, py, p.hue, 0.6 + audio.mid * 0.4);
  }
}

// Projector aperture lenses with high-intensity flares
heads.forEach((h, i) => {
  const flareGrad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 28 + audio.bass * 20);
  const flareHue = (i % 2 === 0) ? col.h1 : col.h2;
  flareGrad.addColorStop(0, `${col.core}1.0)`);
  flareGrad.addColorStop(0.2, `hsla(${flareHue}, 100%, 75%, 0.8)`);
  flareGrad.addColorStop(0.6, `hsla(${flareHue}, 100%, 50%, 0.2)`);
  flareGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = flareGrad;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 32 + audio.bass * 20, 0, Math.PI * 2);
  ctx.fill();
});

// 3. Floating atmospheric dust motes catching laser light
const moteCount = 36;
ctx.fillStyle = `${col.core}0.65)`;
for (let m = 0; m < moteCount; m++) {
  const mx = (Math.sin(m * 91 + phase * 0.3) * 0.5 + 0.5) * W;
  const my = (Math.cos(m * 47 + phase * 0.25) * 0.4 + 0.45) * H;
  const sz = 1.2 + ((m * 19) % 3) * 0.8;
  ctx.fillRect(mx, my, sz, sz);
}

// 4. Foreground Crowd Silhouettes
ctx.globalCompositeOperation = 'source-over';
if (showCrowd) {
  ctx.fillStyle = '#020204';
  ctx.beginPath();
  ctx.moveTo(0, H);

  const seeds = room.state.crowdSeeds;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const cx = s.u * W;
    const bob = Math.sin(phase * 4 + i * 2) * (4 + audio.bass * 14);
    const headY = H * (1.0 - s.h) + bob;
    const r = s.r;

    // Head profile
    ctx.lineTo(cx - r * 1.3, H);
    ctx.lineTo(cx - r, headY + r);
    ctx.arc(cx, headY, r, Math.PI, 0, false);
    ctx.lineTo(cx + r, headY + r);

    // Raised arms / cheering hands on music peaks
    if (s.arm || (audio.bass > 0.6 && i % 3 === 0)) {
      const armAngle = -0.3 + Math.sin(phase * 5 + i) * 0.2;
      const handX = cx + Math.cos(armAngle) * (r * 3.5);
      const handY = headY - 15 + Math.sin(armAngle) * (r * 3.5);
      ctx.lineTo(handX - 4, handY);
      ctx.lineTo(handX + 4, handY);
      ctx.lineTo(cx + r * 1.3, headY + r * 2);
    }
    ctx.lineTo(cx + r * 1.5, H);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Subtle crowd rim light caught from lasers
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = `hsla(${col.h1}, ${col.sat}%, 70%, ${0.22 + flash * 0.25})`;
  ctx.stroke();
}

// Full-frame blinding strobe burst on heavy beat downbeats
if (flash > 0.05 && strobe) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `hsla(${col.h1}, 90%, 95%, ${flash * 0.18})`;
  ctx.fillRect(0, 0, W, H);
}

ctx.restore();