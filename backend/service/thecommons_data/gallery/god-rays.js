ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.1);

// ---- CONTROLS & PALETTES ----
const palKey = getVar('palette') ?? 'golden_hour';
const cloudDensity = getVar('cloud_density') ?? 0.6;
const rayIntensity = getVar('ray_intensity') ?? 1.0;
const windSpeed = getVar('wind_speed') ?? 0.8;
const landStyle = getVar('landscape_style') ?? 'mountain_lake';
const showDust = getVar('dust_glint') ?? true;

const PALETTES = {
  golden_hour:     { sky: [12, 10, 20],   sun: [255, 225, 140], ray: [255, 190, 80],  cloud: [32, 28, 44],  fog: [220, 160, 80] },
  celestial_azure: { sky: [6, 12, 28],    sun: [210, 245, 255], ray: [120, 195, 255], cloud: [16, 26, 45],  fog: [100, 180, 240] },
  emerald_aurora:  { sky: [5, 18, 16],    sun: [190, 255, 220], ray: [70, 230, 160],  cloud: [14, 32, 28],  fog: [60, 200, 140] },
  crimson_dusk:    { sky: [22, 8, 14],    sun: [255, 190, 140], ray: [255, 90, 70],   cloud: [38, 18, 26],  fog: [230, 80, 70] }
};
const P = PALETTES[palKey] ?? PALETTES.golden_hour;

// ---- CACHED TABLES & STATE (DEMO ECONOMY) ----
if (!room.state.init) {
  room.state.init = true;
  room.state.sinTable = new Float32Array(512);
  for (let i = 0; i < 512; i++) room.state.sinTable[i] = Math.sin((i / 512) * Math.PI * 2);

  // Fixed pool of 180 dust particles
  room.state.motes = [];
  for (let i = 0; i < 180; i++) {
    room.state.motes.push({
      x: Math.random(),
      y: Math.random(),
      z: 0.2 + Math.random() * 0.8,
      size: 1 + Math.random() * 2.5,
      twinkle: Math.random() * 6.28
    });
  }
  room.state.phase = 0;
  room.state.bassSmooth = 0;
}

const sinTab = room.state.sinTable;
const fastSin = (a) => {
  const idx = Math.floor(((a % (Math.PI * 2)) / (Math.PI * 2)) * 512) & 511;
  return sinTab[idx < 0 ? idx + 512 : idx];
};

room.state.bassSmooth += (audio.bass - room.state.bassSmooth) * 0.2;
const bassBoost = 1 + room.state.bassSmooth * 0.85;
room.state.phase += dt * windSpeed * 0.45;
const ph = room.state.phase;

// Sun anchor behind cloud deck
const sunX = W * (0.5 + fastSin(ph * 0.2) * 0.12);
const sunY = H * 0.08;
const deckY = H * 0.26;

// 1. SKY GRADIENT (True deep blacks into luminous upper sky)
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, `rgb(${P.sky[0] * 1.8 | 0}, ${P.sky[1] * 1.8 | 0}, ${P.sky[2] * 1.8 | 0})`);
bgGrad.addColorStop(0.35, `rgb(${P.sky[0]}, ${P.sky[1]}, ${P.sky[2]})`);
bgGrad.addColorStop(0.85, '#040407');
bgGrad.addColorStop(1, '#000000');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// 2. SUN CORE GLOW
ctx.save();
ctx.globalCompositeOperation = 'screen';
const sunFlare = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, W * 0.45);
sunFlare.addColorStop(0, `rgba(${P.sun[0]}, ${P.sun[1]}, ${P.sun[2]}, ${0.9 * rayIntensity})`);
sunFlare.addColorStop(0.12, `rgba(${P.ray[0]}, ${P.ray[1]}, ${P.ray[2]}, ${0.45 * rayIntensity})`);
sunFlare.addColorStop(0.5, `rgba(${P.ray[0]}, ${P.ray[1]}, ${P.ray[2]}, 0.08)`);
sunFlare.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = sunFlare;
ctx.fillRect(0, 0, W, H * 0.8);
ctx.restore();

// 3. VOLUMETRIC GOD RAYS (Slits through cloud gaps)
// Compute active aperture beams
const numSlices = 28;
const activeBeams = [];
ctx.save();
ctx.globalCompositeOperation = 'lighter';

for (let i = 0; i < numSlices; i++) {
  const u = i / (numSlices - 1);
  const seamX = W * (u - 0.1 + fastSin(ph * 0.7 + i * 0.6) * 0.04);
  
  // Aperture churn equation: wave interference creates gaps that drift, breathe and close
  const gapA = fastSin(ph * 1.2 + u * 11.0);
  const gapB = fastSin(ph * 0.5 - u * 6.3 + 1.4);
  const gapC = fastSin(ph * 2.1 + i * 1.8);
  let aperture = (gapA * 0.5 + gapB * 0.35 + gapC * 0.15) - (cloudDensity - 0.55);
  aperture = Math.max(0, aperture) * bassBoost;

  if (aperture > 0.04) {
    const beamWidth = (W * 0.015 + aperture * W * 0.045);
    const x0 = seamX - beamWidth * 0.5;
    const x1 = seamX + beamWidth * 0.5;

    // Project downward cone from Sun through aperture
    const spread = 2.4 + (audio.mid * 0.6);
    const bx0 = sunX + (x0 - sunX) * spread;
    const bx1 = sunX + (x1 - sunX) * spread;
    const bottomY = H * (0.85 + (i % 3) * 0.06);

    // Alpha modulation with ray intensity & audio
    const beamAlpha = Math.min(0.55, aperture * 0.38 * rayIntensity);

    // Cone geometry
    const rayGrad = ctx.createLinearGradient(sunX, sunY, (bx0 + bx1) * 0.5, bottomY);
    rayGrad.addColorStop(0, `rgba(${P.sun[0]}, ${P.sun[1]}, ${P.sun[2]}, ${beamAlpha * 0.85})`);
    rayGrad.addColorStop(0.25, `rgba(${P.ray[0]}, ${P.ray[1]}, ${P.ray[2]}, ${beamAlpha})`);
    rayGrad.addColorStop(0.7, `rgba(${P.ray[0]}, ${P.ray[1]}, ${P.ray[2]}, ${beamAlpha * 0.35})`);
    rayGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(x0, deckY);
    ctx.lineTo(bx0, bottomY);
    ctx.lineTo(bx1, bottomY);
    ctx.lineTo(x1, deckY);
    ctx.closePath();
    ctx.fill();

    // Store beam bounds for dust mote illumination test
    activeBeams.push({ x0, x1, bx0, bx1, topY: deckY, bottomY, power: aperture });
  }
}
ctx.restore();

// 4. CHURNING CLOUD DECK (Multi-layered billows across upper canvas)
const drawCloudBank = (layerY, amplitude, freq, speedMult, colR, colG, colB, alpha) => {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, layerY);
  const steps = 36;
  for (let s = 0; s <= steps; s++) {
    const nx = (s / steps) * W;
    const angle = ph * speedMult + s * freq;
    const dy = fastSin(angle) * amplitude + fastSin(angle * 2.3) * (amplitude * 0.45);
    ctx.lineTo(nx, layerY + dy);
  }
  ctx.lineTo(W, 0);
  ctx.closePath();
  ctx.fillStyle = `rgba(${colR}, ${colG}, ${colB}, ${alpha})`;
  ctx.fill();
};

// Back cloud tier (diffuse silhouette catching silver lining)
ctx.save();
ctx.shadowColor = `rgba(${P.sun[0]}, ${P.sun[1]}, ${P.sun[2]}, ${0.4 * rayIntensity})`;
ctx.shadowBlur = 24;
drawCloudBank(deckY - H * 0.04, H * 0.05, 0.4, 0.6, P.cloud[0] * 1.5 | 0, P.cloud[1] * 1.4 | 0, P.cloud[2] * 1.6 | 0, 0.95);
ctx.restore();

// Foreground cloud tier (dense, rolling dark masses with churn)
drawCloudBank(deckY, H * 0.07, 0.32, 0.85, P.cloud[0], P.cloud[1], P.cloud[2], 0.98);
drawCloudBank(deckY * 0.65, H * 0.04, 0.55, 1.2, P.sky[0] * 0.8 | 0, P.sky[1] * 0.8 | 0, P.sky[2] * 0.8 | 0, 0.92);

// 5. GLINTING DUST MOTES (Floating in beam volumes)
if (showDust) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const motes = room.state.motes;
  const motesLen = motes.length;
  const numActiveBeams = activeBeams.length;

  for (let i = 0; i < motesLen; i++) {
    const m = motes[i];
    // Drift mechanics
    m.y += dt * (0.02 + m.z * 0.04);
    m.x += dt * fastSin(ph + i) * 0.015 * windSpeed;
    if (m.y > 1.0) { m.y = 0.28; m.x = Math.random(); }
    if (m.x < 0) m.x += 1; else if (m.x > 1) m.x -= 1;

    const px = m.x * W;
    const py = m.y * H;

    // Check if inside any sunbeam
    if (py > deckY) {
      let inRay = 0;
      for (let b = 0; b < numActiveBeams; b++) {
        const bm = activeBeams[b];
        if (py <= bm.bottomY) {
          const prog = (py - bm.topY) / (bm.bottomY - bm.topY);
          const leftX = bm.x0 + (bm.bx0 - bm.x0) * prog;
          const rightX = bm.x1 + (bm.bx1 - bm.x1) * prog;
          if (px >= leftX && px <= rightX) {
            inRay = bm.power;
            break;
          }
        }
      }

      if (inRay > 0.05) {
        m.twinkle += dt * (3.0 + m.z * 5.0);
        const spark = (0.5 + 0.5 * fastSin(m.twinkle)) * (1 + audio.treble * 1.5);
        const radius = m.size * (0.6 + m.z * 0.8);
        const moteAlpha = Math.min(1.0, inRay * spark * rayIntensity * 1.3);

        ctx.fillStyle = `rgba(${P.sun[0]}, ${P.sun[1]}, ${P.sun[2]}, ${moteAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, 6.283);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// 6. DARK LANDSCAPE SILHOUETTES & WATER REFLECTIONS
const groundBaseY = H * 0.72;

// Distant ridge / hills
ctx.fillStyle = `rgb(${P.cloud[0] * 0.35 | 0}, ${P.cloud[1] * 0.35 | 0}, ${P.cloud[2] * 0.45 | 0})`;
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(0, groundBaseY);
const hillSteps = 40;
for (let h = 0; h <= hillSteps; h++) {
  const hx = (h / hillSteps) * W;
  let elev = 0;
  if (landStyle === 'mountain_lake') {
    elev = fastSin(h * 0.4 + 1.2) * H * 0.09 + fastSin(h * 1.1) * H * 0.04;
  } else if (landStyle === 'craggy_peaks') {
    elev = Math.abs(fastSin(h * 0.7)) * H * 0.18 + fastSin(h * 1.7) * H * 0.05;
  } else {
    // Ocean abyss swells
    elev = fastSin(h * 0.25 + ph * 0.5) * H * 0.03;
  }
  ctx.lineTo(hx, groundBaseY - elev);
}
ctx.lineTo(W, H);
ctx.closePath();
ctx.fill();

// Water plane with shimmering light column / ground fog
if (landStyle === 'mountain_lake' || landStyle === 'ocean_abyss') {
  const waterY = H * 0.82;
  const waterGrad = ctx.createLinearGradient(0, waterY, 0, H);
  waterGrad.addColorStop(0, `rgba(${P.sky[0] * 0.4 | 0}, ${P.sky[1] * 0.5 | 0}, ${P.sky[2] * 0.7 | 0}, 0.8)`);
  waterGrad.addColorStop(1, '#000000');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, waterY, W, H - waterY);

  // Specular sheen reflecting rays onto water surface
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const sheenGrad = ctx.createRadialGradient(sunX, waterY + (H - waterY) * 0.4, 10, sunX, waterY + (H - waterY) * 0.4, W * 0.38);
  sheenGrad.addColorStop(0, `rgba(${P.fog[0]}, ${P.fog[1]}, ${P.fog[2]}, ${0.42 * rayIntensity * bassBoost})`);
  sheenGrad.addColorStop(0.4, `rgba(${P.ray[0]}, ${P.ray[1]}, ${P.ray[2]}, 0.12)`);
  sheenGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sheenGrad;
  ctx.fillRect(0, waterY, W, H - waterY);

  // Horizontal water ripples
  ctx.strokeStyle = `rgba(${P.sun[0]}, ${P.sun[1]}, ${P.sun[2]}, ${0.18 * rayIntensity})`;
  ctx.lineWidth = 1.2;
  const numRipples = 16;
  for (let r = 0; r < numRipples; r++) {
    const ry = waterY + ((r + 1) / (numRipples + 1)) * (H - waterY);
    const rw = (W * 0.15) * (1 + (ry - waterY) / (H - waterY) * 2.5);
    const roff = fastSin(ph * 1.5 + r * 1.8) * 18;
    ctx.beginPath();
    ctx.moveTo(sunX - rw * 0.5 + roff, ry);
    ctx.lineTo(sunX + rw * 0.5 + roff, ry);
    ctx.stroke();
  }
  ctx.restore();
}

// Foremost razor-sharp black crag silhouette (gives immense scale and true blacks)
ctx.fillStyle = '#010103';
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(0, H * 0.88);
ctx.lineTo(W * 0.16, H * 0.82);
ctx.lineTo(W * 0.28, H * 0.91);
ctx.lineTo(W * 0.48, H * 0.96);
ctx.lineTo(W * 0.72, H * 0.86);
ctx.lineTo(W * 0.88, H * 0.79);
ctx.lineTo(W, H * 0.84);
ctx.lineTo(W, H);
ctx.closePath();
ctx.fill();

// Foreground atmospheric ground fog
ctx.save();
ctx.globalCompositeOperation = 'screen';
const fogGrad = ctx.createLinearGradient(0, H * 0.75, 0, H);
fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
fogGrad.addColorStop(0.5, `rgba(${P.fog[0]}, ${P.fog[1]}, ${P.fog[2]}, ${0.09 * rayIntensity})`);
fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = fogGrad;
ctx.fillRect(0, H * 0.74, W, H * 0.26);

// Room connection: audience presence introduces subtle resonant glints along the horizon
if (room.people && room.people.length > 0) {
  const pCount = Math.min(room.people.length, 24);
  for (let p = 0; p < pCount; p++) {
    const person = room.people[p];
    const px = ((p + 0.5) / pCount) * W;
    const py = H * 0.85 + fastSin(p * 2.1 + ph) * H * 0.05;
    ctx.fillStyle = `hsla(${person.hue}, 80%, 70%, 0.4)`;
    ctx.beginPath();
    ctx.arc(px, py, 2.0 + audio.bass * 2.5, 0, 6.283);
    ctx.fill();
  }
}
ctx.restore();

// Subtle vignette to focus light cone on large projection walls
const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.45, W * 0.5, H * 0.5, W * 0.72);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(0,0,2,0.65)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();