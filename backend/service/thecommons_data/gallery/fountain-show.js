ctx.save();

const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt || 0.016, 0.05);

// Initialize persistent state once
if (!room.state.init) {
  room.state.init = true;
  room.state.particles = new Float32Array(300 * 6); // x, y, vx, vy, life, maxLife
  room.state.mist = [];
  for (let i = 0; i < 40; i++) {
    room.state.mist.push({
      x: Math.random(),
      y: Math.random(),
      r: 60 + Math.random() * 120,
      vx: 0.01 + Math.random() * 0.02,
      phase: Math.random() * 6.28
    });
  }
  room.state.bassImpulse = 0;
}

// Audio smoothing & impulse tracker
const bass = audio.bass || 0;
const mid = audio.mid || 0;
const treb = audio.treble || 0;
if (audio.beat) room.state.bassImpulse = 1.0;
else room.state.bassImpulse = Math.max(0, room.state.bassImpulse - dt * 2.5);

// Variable reads
const palChoice = getVar('palette') || 'Sapphire & Magenta';
const choreo = getVar('choreography') || 'Waltz Sway';
const heightMult = getVar('jet_height') ?? 1.0;
const mistChoice = getVar('fog_mist') || 'Lush Drift';
const shimmer = getVar('water_shimmer') ?? true;

// Color schemes: [primaryHue, secondaryHue, baseSat, baseLit]
const palettes = {
  'Sapphire & Magenta': { h1: 220, h2: 310, s: 95, l: 62 },
  'Emerald & Cyan': { h1: 160, h2: 195, s: 90, l: 58 },
  'Imperial Gold': { h1: 42, h2: 18, s: 98, l: 60 },
  'Prismatic Aurora': { h1: (t * 25) % 360, h2: (t * 25 + 90) % 360, s: 95, l: 64 }
};
const pal = palettes[palChoice] || palettes['Sapphire & Magenta'];

const mistAlphas = { 'Subtle Haze': 0.025, 'Lush Drift': 0.06, 'Dense Luminescence': 0.11 };
const mistAlpha = mistAlphas[mistChoice] ?? 0.06;

const waterY = H * 0.63;

// 1. Deep Midnight Lake Backdrop
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, '#020308');
bgGrad.addColorStop(waterY / H * 0.85, '#050a18');
bgGrad.addColorStop(waterY / H, '#081226');
bgGrad.addColorStop(waterY / H + 0.001, '#02050c');
bgGrad.addColorStop(1, '#010205');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// 2. Distant Horizon Shoreline & Architectural Silhouette
ctx.fillStyle = '#030610';
ctx.beginPath();
ctx.moveTo(0, waterY);
for (let x = 0; x <= W; x += 40) {
  const bump = Math.sin(x * 0.012) * 8 + Math.cos(x * 0.031) * 5;
  ctx.lineTo(x, waterY - 6 - Math.max(0, bump));
}
ctx.lineTo(W, waterY);
ctx.closePath();
ctx.fill();

// Shoreline pin-lights from room occupants
const occupants = room.people || [];
for (let i = 0; i < Math.max(occupants.length, 12); i++) {
  const person = occupants[i];
  const px = (W * 0.08) + ((i * 137.5) % (W * 0.84));
  const pHue = person ? person.hue : (i * 37) % 360;
  ctx.fillStyle = `hsla(${pHue}, 80%, 70%, 0.75)`;
  ctx.beginPath();
  ctx.arc(px, waterY - 3, 1.8, 0, 6.283);
  ctx.fill();
  // Subtle waterline reflection pin
  ctx.fillStyle = `hsla(${pHue}, 80%, 65%, 0.3)`;
  ctx.fillRect(px - 1, waterY + 1, 2, 8 + (i % 5) * 3);
}

// 3. Searchlight Cones sweeping the sky behind fountains
ctx.save();
ctx.globalCompositeOperation = 'screen';
const numBeams = 4;
for (let b = 0; b < numBeams; b++) {
  const bx = W * (0.2 + 0.2 * b);
  const sweep = Math.sin(t * 0.7 + b * 1.5) * 0.35 + (bass - 0.5) * 0.2;
  const beamGrad = ctx.createRadialGradient(bx, waterY, 10, bx + Math.sin(sweep) * H * 0.7, 0, W * 0.3);
  const bHue = (b % 2 === 0) ? pal.h1 : pal.h2;
  beamGrad.addColorStop(0, `hsla(${bHue}, ${pal.s}%, ${pal.l}%, 0.14)`);
  beamGrad.addColorStop(0.7, `hsla(${bHue}, ${pal.s}%, 50%, 0.02)`);
  beamGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(bx - 18, waterY);
  ctx.lineTo(bx + Math.sin(sweep) * H * 0.8 - W * 0.15, 0);
  ctx.lineTo(bx + Math.sin(sweep) * H * 0.8 + W * 0.15, 0);
  ctx.lineTo(bx + 18, waterY);
  ctx.closePath();
  ctx.fill();
}
ctx.restore();

// 4. Fountain Jet Parameters & Trajectories
const numJets = 28;
const jets = [];
const cx = W * 0.5;

for (let j = 0; j < numJets; j++) {
  const u = j / (numJets - 1); // 0 to 1
  const spreadX = (u - 0.5) * (W * 0.76);
  const jx = cx + spreadX;
  const distFromCenter = Math.abs(u - 0.5) * 2; // 0 (center) to 1 (edges)
  
  let angle = 0;
  let power = 1.0;
  
  if (choreo === 'Waltz Sway') {
    angle = Math.sin(t * 1.6 + u * 4.2) * 0.42;
    power = 0.7 + Math.cos(t * 1.2 + u * 6.28) * 0.28;
  } else if (choreo === 'Peacock Fan') {
    angle = (u - 0.5) * 0.85 + Math.sin(t * 2.5) * 0.12;
    power = Math.sin(u * Math.PI) * 1.1;
  } else if (choreo === 'Grand Geysers') {
    const pulse = Math.sin(t * 3.0 - distFromCenter * 5.0);
    angle = Math.sin(t + j) * 0.1;
    power = Math.max(0.2, pulse * pulse) * (1.2 - distFromCenter * 0.4);
  } else { // Crossing Cannons
    const dir = (j % 2 === 0) ? 1 : -1;
    angle = dir * (0.35 + Math.sin(t * 2.0) * 0.18);
    power = 0.8 + Math.sin(t * 2.5 + j * 0.4) * 0.25;
  }
  
  // Bass punch height boost
  power = (power + bass * 0.45 + room.state.bassImpulse * 0.3) * heightMult;
  
  const maxH = (H * 0.48) * power;
  const jHue = (pal.h1 + (pal.h2 - pal.h1) * u + treb * 30) % 360;
  
  jets.push({
    x: jx,
    y: waterY,
    angle,
    maxH,
    hue: jHue,
    power,
    distFromCenter
  });
}

// Center Mega-Geyser
const centerBoost = 1.0 + bass * 0.8 + room.state.bassImpulse * 0.5;
jets.push({
  x: cx,
  y: waterY,
  angle: Math.sin(t * 1.8) * 0.05,
  maxH: (H * 0.58) * heightMult * centerBoost,
  hue: (pal.h2 + 20) % 360,
  power: 1.4 * centerBoost,
  distFromCenter: 0,
  isCenter: true
});

// Draw Jet Streams & Dynamic Curves (both skyward and lake reflection)
function renderFountainPass(isReflection) {
  ctx.save();
  ctx.globalCompositeOperation = isReflection ? 'source-over' : 'screen';
  
  for (let i = 0; i < jets.length; i++) {
    const jet = jets[i];
    const steps = 24;
    const sign = isReflection ? 1 : -1;
    
    ctx.beginPath();
    ctx.moveTo(jet.x, jet.y);
    
    for (let s = 1; s <= steps; s++) {
      const prog = s / steps; // 0..1
      // Parabolic ballistic trajectory
      const vert = Math.sin(prog * Math.PI) * jet.maxH;
      const horiz = Math.sin(jet.angle) * prog * (jet.maxH * 1.1) + 
                    Math.sin(t * 3.0 + prog * 4.0 + i) * (prog * 12.0);
      
      let px = jet.x + horiz;
      let py = jet.y + vert * sign;
      
      if (isReflection) {
        // Horizontal wave distortion in the water
        const wave = Math.sin(py * 0.08 + t * 4.0 + px * 0.02) * (4.0 + prog * 10.0);
        px += wave;
      }
      
      ctx.lineTo(px, py);
    }
    
    // Illumination styling
    const alpha = isReflection ? 0.32 : 0.85;
    const coreWidth = (jet.isCenter ? 5.0 : 2.6) * (isReflection ? 1.6 : 1.0);
    
    // Outer Glow Stream
    ctx.strokeStyle = `hsla(${jet.hue}, ${pal.s}%, ${pal.l}%, ${alpha * 0.4})`;
    ctx.lineWidth = coreWidth * 2.8;
    ctx.stroke();
    
    // Core Luminous Stream
    ctx.strokeStyle = `hsla(${jet.hue}, 40%, 96%, ${alpha})`;
    ctx.lineWidth = coreWidth;
    ctx.stroke();
    
    // Apex Splash / Plume
    const apexProg = 0.5;
    const apexH = jet.maxH * 0.98;
    const apexX = jet.x + Math.sin(jet.angle) * apexProg * (jet.maxH * 1.1);
    const apexY = jet.y + apexH * sign;
    
    const plumeR = (12 + jet.power * 16) * (isReflection ? 1.4 : 1.0);
    const plumeGrad = ctx.createRadialGradient(apexX, apexY, 0, apexX, apexY, plumeR);
    plumeGrad.addColorStop(0, `hsla(${jet.hue}, 50%, 98%, ${alpha * 0.8})`);
    plumeGrad.addColorStop(0.4, `hsla(${jet.hue}, ${pal.s}%, ${pal.l}%, ${alpha * 0.45})`);
    plumeGrad.addColorStop(1, 'transparent');
    
    ctx.fillStyle = plumeGrad;
    ctx.beginPath();
    ctx.arc(apexX, apexY, plumeR, 0, 6.283);
    ctx.fill();
  }
  
  ctx.restore();
}

// 5. Draw Sky Streams
renderFountainPass(false);

// 6. Atmospheric Water Spray / Mist drifting across lights
ctx.save();
ctx.globalCompositeOperation = 'screen';
for (let m = 0; m < room.state.mist.length; m++) {
  const mist = room.state.mist[m];
  mist.x = (mist.x + mist.vx * dt + Math.sin(t + mist.phase) * 0.0004 + 1) % 1;
  const mx = mist.x * W;
  const my = waterY - (mist.y * H * 0.46);
  const mHue = (m % 2 === 0) ? pal.h1 : pal.h2;
  
  const mGrad = ctx.createRadialGradient(mx, my, 0, mx, my, mist.r);
  mGrad.addColorStop(0, `hsla(${mHue}, 85%, 65%, ${mistAlpha * (1.0 + mid * 0.5)})`);
  mGrad.addColorStop(0.6, `hsla(${mHue}, 80%, 50%, ${mistAlpha * 0.3})`);
  mGrad.addColorStop(1, 'transparent');
  
  ctx.fillStyle = mGrad;
  ctx.beginPath();
  ctx.arc(mx, my, mist.r, 0, 6.283);
  ctx.fill();
}
ctx.restore();

// 7. Base Nozzle Underwater Glow Lamps
ctx.save();
ctx.globalCompositeOperation = 'screen';
for (let j = 0; j < jets.length; j++) {
  const jet = jets[j];
  const glowGrad = ctx.createRadialGradient(jet.x, waterY, 1, jet.x, waterY, 26);
  glowGrad.addColorStop(0, `hsla(${jet.hue}, 30%, 100%, 0.9)`);
  glowGrad.addColorStop(0.35, `hsla(${jet.hue}, 95%, 60%, 0.6)`);
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(jet.x, waterY, 26, 0, 6.283);
  ctx.fill();
}
ctx.restore();

// 8. Lake Water Surface & Reflection
// Clip to the water lower plane to keep the mirror crisp
ctx.save();
ctx.beginPath();
ctx.rect(0, waterY, W, H - waterY);
ctx.clip();

// Mirror reflection draw
renderFountainPass(true);

// Horizontal rippling and dark water attenuation stripes
if (shimmer) {
  ctx.fillStyle = 'rgba(2, 6, 16, 0.4)';
  ctx.fillRect(0, waterY, W, H - waterY);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  const rippleStep = 6;
  for (let ry = waterY; ry < H; ry += rippleStep) {
    const depthFactor = (ry - waterY) / (H - waterY);
    const waveW = (Math.sin(ry * 0.15 - t * 5.0) + 1.0) * 0.5;
    if (waveW > 0.4) {
      const stripAlpha = (1.0 - depthFactor) * 0.18 * (0.6 + bass * 0.4);
      ctx.fillStyle = `rgba(220, 240, 255, ${stripAlpha})`;
      ctx.fillRect(0, ry, W, 1.5);
    }
  }
}

// Deep water gradient darkening toward front bottom edge
const lakeDarken = ctx.createLinearGradient(0, waterY, 0, H);
lakeDarken.addColorStop(0, 'rgba(3, 8, 20, 0.15)');
lakeDarken.addColorStop(0.5, 'rgba(1, 4, 10, 0.45)');
lakeDarken.addColorStop(1, 'rgba(0, 2, 6, 0.88)');
ctx.fillStyle = lakeDarken;
ctx.fillRect(0, waterY, W, H - waterY);

ctx.restore();

// 9. Waterline Luminous Rim
ctx.save();
ctx.globalCompositeOperation = 'screen';
const rimGrad = ctx.createLinearGradient(0, waterY - 2, 0, waterY + 2);
rimGrad.addColorStop(0, 'transparent');
rimGrad.addColorStop(0.5, 'rgba(230, 245, 255, 0.6)');
rimGrad.addColorStop(1, 'transparent');
ctx.fillStyle = rimGrad;
ctx.fillRect(0, waterY - 2, W, 4);
ctx.restore();

ctx.restore();