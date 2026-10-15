ctx.save();

const w = frame.width;
const h = frame.height;
const dt = Math.min(frame.dt || 0.016, 0.05);
const t = frame.t;

// Audio reactivity with fallback
const bass = (audio && typeof audio.bass === 'number') ? audio.bass : 0;
const mid = (audio && typeof audio.mid === 'number') ? audio.mid : 0;
const treble = (audio && typeof audio.treble === 'number') ? audio.treble : 0;
const beat = (audio && audio.beat) ? true : false;

// Variables
const bloomChoice = getVar('bloom_color') ?? 'electric_cyan';
const waveEnergy = getVar('wave_energy') ?? 1.2;
const waveSpeed = getVar('wave_speed') ?? 0.8;
const glowIntensity = getVar('glow_intensity') ?? 1.4;
const shoreFoam = getVar('shore_foam') ?? 35;
const skyMode = getVar('sky_mode') ?? 'starlit_night';
const shoalSparks = getVar('shoal_sparks') ?? true;
const wetSandMirror = getVar('wet_sand_mirror') ?? true;

// Color Palettes
const PALETTES = {
  electric_cyan: {
    core: 'rgb(230, 255, 255)',
    mid: 'rgb(10, 235, 255)',
    deep: 'rgb(0, 95, 180)',
    foam: 'rgba(90, 245, 255, 0.85)',
    glowR: 0, glowG: 225, glowB: 255
  },
  neon_sapphire: {
    core: 'rgb(240, 245, 255)',
    mid: 'rgb(45, 140, 255)',
    deep: 'rgb(12, 50, 185)',
    foam: 'rgba(120, 195, 255, 0.85)',
    glowR: 40, glowG: 135, glowB: 255
  },
  ghost_emerald: {
    core: 'rgb(230, 255, 240)',
    mid: 'rgb(20, 255, 165)',
    deep: 'rgb(0, 130, 80)',
    foam: 'rgba(110, 255, 205, 0.85)',
    glowR: 15, glowG: 245, glowB: 155
  },
  deep_violet: {
    core: 'rgb(255, 235, 255)',
    mid: 'rgb(205, 75, 255)',
    deep: 'rgb(115, 20, 215)',
    foam: 'rgba(235, 165, 255, 0.85)',
    glowR: 195, glowG: 65, glowB: 255
  }
};
const pal = PALETTES[bloomChoice] ?? PALETTES.electric_cyan;

// State Persistence & Initialization (Zero allocations in hot loops)
room.state.stars ??= [];
if (room.state.stars.length === 0) {
  for (let i = 0; i < 160; i++) {
    room.state.stars.push({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.5 + 0.4,
      speed: 1.2 + Math.random() * 3.8,
      phase: Math.random() * Math.PI * 2,
      major: Math.random() < 0.14
    });
  }
}

room.state.sparks ??= [];
if (room.state.sparks.length === 0) {
  for (let i = 0; i < 160; i++) {
    room.state.sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 999, maxLife: 1, size: 1.5 });
  }
  room.state.sparkIdx = 0;
}

room.state.foamCells ??= [];
if (room.state.foamCells.length === 0) {
  for (let i = 0; i < 48; i++) {
    room.state.foamCells.push({
      rx: Math.random(),
      ry: Math.random(),
      len: 12 + Math.random() * 28,
      tilt: (Math.random() - 0.5) * 0.4,
      speed: 0.4 + Math.random() * 0.8
    });
  }
}

room.state.wavePhase ??= 0;
room.state.wavePhase = (room.state.wavePhase + dt * waveSpeed * 0.08) % 1.0;

const horizonY = h * 0.36;
const shoreY = h * 0.76;
const beachY = h * 0.98;

// --- PASS 1: SKY & HORIZON ---
const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
skyGrad.addColorStop(0, '#010205');
skyGrad.addColorStop(0.7, '#030711');
skyGrad.addColorStop(1, '#071224');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, w, horizonY + 2);

// Atmospheric dust ribbon (Milky Way)
if (skyMode === 'starlit_night') {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const mwGrad = ctx.createLinearGradient(w * 0.15, 0, w * 0.85, horizonY);
  mwGrad.addColorStop(0, 'rgba(15, 30, 60, 0)');
  mwGrad.addColorStop(0.5, 'rgba(40, 70, 110, 0.09)');
  mwGrad.addColorStop(1, 'rgba(25, 45, 80, 0)');
  ctx.fillStyle = mwGrad;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, 0);
  ctx.lineTo(w * 0.4, 0);
  ctx.lineTo(w * 0.9, horizonY);
  ctx.lineTo(w * 0.6, horizonY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Aurora shimmer option
if (skyMode === 'aurora_shimmer') {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let a = 0; a < 2; a++) {
    const aGrad = ctx.createLinearGradient(0, horizonY - 120, 0, horizonY);
    aGrad.addColorStop(0, 'rgba(0, 255, 180, 0)');
    aGrad.addColorStop(0.5, `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, 0.08)`);
    aGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aGrad;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x <= w; x += 30) {
      const ay = horizonY - 40 - Math.sin(x * 0.005 + t * 0.6 + a * 2) * 35 - Math.cos(x * 0.012 - t * 0.4) * 20;
      ctx.lineTo(x, ay);
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Stars rendering
ctx.save();
for (let i = 0; i < room.state.stars.length; i++) {
  const st = room.state.stars[i];
  const sx = st.x * w;
  const sy = st.y * (horizonY - 4);
  const twinkle = Math.sin(t * st.speed + st.phase) * 0.5 + 0.5;
  const starAlpha = (0.3 + 0.6 * twinkle + treble * 0.4);
  
  ctx.fillStyle = `rgba(220, 240, 255, ${Math.min(1, starAlpha)})`;
  ctx.fillRect(sx, sy, st.r, st.r);
  
  if (st.major && twinkle > 0.75) {
    ctx.fillStyle = `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, ${twinkle * 0.6})`;
    ctx.fillRect(sx - 3, sy, 7, 1);
    ctx.fillRect(sx, sy - 3, 1, 7);
  }
}
ctx.restore();

// --- PASS 2: DEEP OCEAN BODY ---
const seaGrad = ctx.createLinearGradient(0, horizonY, 0, shoreY);
seaGrad.addColorStop(0, '#040b17');
seaGrad.addColorStop(0.5, '#020d1c');
seaGrad.addColorStop(1, '#010813');
ctx.fillStyle = seaGrad;
ctx.fillRect(0, horizonY, w, shoreY - horizonY + 2);

// --- PASS 3: WET SAND BEACH (BASE) ---
const sandGrad = ctx.createLinearGradient(0, shoreY, 0, h);
sandGrad.addColorStop(0, '#020810');
sandGrad.addColorStop(0.3, '#040c14');
sandGrad.addColorStop(1, '#010307');
ctx.fillStyle = sandGrad;
ctx.fillRect(0, shoreY, w, h - shoreY);

// --- PASS 4: ADVANCING WAVES & BIOLUMINESCENT SURF ---
const WAVE_COUNT = 4;
const SEGMENTS = 44;
const crestPoints = []; // reuse array coordinates

for (let k = 0; k < WAVE_COUNT; k++) {
  const p = (room.state.wavePhase + k * (1.0 / WAVE_COUNT)) % 1.0;
  
  // Swell to shore progression
  if (p < 0.78) {
    // Wave rising and breaking in the ocean
    const depthT = p / 0.78;
    const yBase = horizonY + (shoreY - horizonY) * Math.pow(depthT, 1.35);
    const amp = (18 + 32 * depthT) * waveEnergy * (1 + bass * 0.45);
    const phi = room.state.wavePhase * 6.283 + k * 2.1;
    
    // Breaking agitation curve: peaks near shore
    const breakProg = Math.max(0, (p - 0.45) / 0.33);
    const agitation = Math.sin(breakProg * Math.PI);
    
    crestPoints.length = 0;
    for (let j = 0; j <= SEGMENTS; j++) {
      const x = (j / SEGMENTS) * w;
      const harmonic = Math.sin(x * 0.005 + phi) * 0.65 + Math.sin(x * 0.013 - phi * 0.7) * 0.35;
      const cy = yBase - amp * (harmonic + 0.3);
      crestPoints.push(x, cy);
    }
    
    // Dark ocean wave face silhouette
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, yBase + 35);
    for (let j = 0; j <= SEGMENTS; j++) {
      ctx.lineTo(crestPoints[j * 2], crestPoints[j * 2 + 1]);
    }
    ctx.lineTo(w, yBase + 35);
    ctx.closePath();
    const faceGrad = ctx.createLinearGradient(0, yBase - amp, 0, yBase + 35);
    faceGrad.addColorStop(0, `rgba(2, 22, 38, ${0.4 + 0.5 * depthT})`);
    faceGrad.addColorStop(1, 'rgba(1, 6, 14, 0.95)');
    ctx.fillStyle = faceGrad;
    ctx.fill();
    ctx.restore();
    
    // Bioluminescent bloom along crest if agitated
    if (agitation > 0.05) {
      const bloomAlpha = Math.min(1.0, agitation * glowIntensity * (1 + bass * 0.5));
      
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      
      // Broad atmospheric halo
      ctx.beginPath();
      ctx.moveTo(crestPoints[0], crestPoints[1]);
      for (let j = 1; j <= SEGMENTS; j++) {
        ctx.lineTo(crestPoints[j * 2], crestPoints[j * 2 + 1]);
      }
      ctx.strokeStyle = `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, ${0.16 * bloomAlpha})`;
      ctx.lineWidth = 32 * waveEnergy;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Vibrant electric core band
      ctx.beginPath();
      ctx.moveTo(crestPoints[0], crestPoints[1]);
      for (let j = 1; j <= SEGMENTS; j++) {
        ctx.lineTo(crestPoints[j * 2], crestPoints[j * 2 + 1]);
      }
      ctx.strokeStyle = `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, ${0.48 * bloomAlpha})`;
      ctx.lineWidth = 10 * waveEnergy;
      ctx.stroke();
      
      // Pure razor white/cyan highlight
      ctx.strokeStyle = pal.core;
      ctx.globalAlpha = Math.min(1.0, bloomAlpha * 0.95);
      ctx.lineWidth = 2.4;
      ctx.stroke();
      
      // Foam cascades dripping under curl
      if (agitation > 0.4) {
        ctx.fillStyle = pal.foam;
        for (let j = 2; j < SEGMENTS; j += 2) {
          const fx = crestPoints[j * 2];
          const fy = crestPoints[j * 2 + 1] + 4;
          const dropLen = (12 + Math.sin(j + t * 4) * 8) * waveEnergy;
          ctx.fillRect(fx - 1.5, fy, 3, dropLen);
        }
      }
      ctx.restore();
      
      // Wet sand specular reflection (anisotropic beam down wet beach)
      if (wetSandMirror && agitation > 0.25) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let j = 2; j < SEGMENTS; j += 3) {
          const rx = crestPoints[j * 2];
          const ry = crestPoints[j * 2 + 1];
          const lum = Math.max(0, agitation * (0.5 + 0.5 * Math.sin(j * 0.8 + phi)));
          if (lum > 0.2) {
            const specGrad = ctx.createLinearGradient(rx, shoreY, rx, h);
            specGrad.addColorStop(0, `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, ${0.25 * lum * glowIntensity})`);
            specGrad.addColorStop(0.4, `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, ${0.08 * lum * glowIntensity})`);
            specGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = specGrad;
            ctx.fillRect(rx - 16, shoreY, 32, h - shoreY);
          }
        }
        ctx.restore();
      }
      
      // Shoal Sparks spawn on breaking ridge
      if (shoalSparks && agitation > 0.45) {
        const spawnCount = (beat ? 5 : 2) + Math.floor(bass * 3);
        for (let s = 0; s < spawnCount; s++) {
          const sp = room.state.sparks[room.state.sparkIdx];
          room.state.sparkIdx = (room.state.sparkIdx + 1) % room.state.sparks.length;
          const segI = Math.floor(Math.random() * (SEGMENTS - 2)) + 1;
          sp.x = crestPoints[segI * 2] + (Math.random() - 0.5) * 24;
          sp.y = crestPoints[segI * 2 + 1] + (Math.random() - 0.5) * 6;
          sp.vx = (Math.random() - 0.45) * 75;
          sp.vy = -(25 + Math.random() * 80 + bass * 90);
          sp.life = 0;
          sp.maxLife = 0.5 + Math.random() * 0.7;
          sp.size = 1.0 + Math.random() * 2.2;
        }
      }
    }
  } else {
    // Wave in Shore Swash Zone: Water washes up onto sand and recedes
    const swashT = (p - 0.78) / 0.22; // 0 to 1
    const reach = Math.sin(swashT * Math.PI * 0.95);
    const currentY = shoreY + (beachY - shoreY) * reach;
    const foamDecay = Math.pow(1.0 - swashT, 0.75) * glowIntensity;
    
    if (foamDecay > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      
      // Foam margin curve
      ctx.beginPath();
      for (let j = 0; j <= SEGMENTS; j++) {
        const x = (j / SEGMENTS) * w;
        const scalloped = Math.sin(x * 0.02 + p * 12) * 5 + Math.sin(x * 0.007) * 14;
        const fy = currentY + scalloped;
        if (j === 0) ctx.moveTo(x, fy);
        else ctx.lineTo(x, fy);
      }
      
      // Broad foam wash glow
      ctx.strokeStyle = `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, ${0.28 * foamDecay})`;
      ctx.lineWidth = shoreFoam * 0.8;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Bright foamy lace contour
      ctx.strokeStyle = pal.mid;
      ctx.globalAlpha = Math.min(1.0, foamDecay * 0.8);
      ctx.lineWidth = 3.5;
      ctx.stroke();
      
      // Delicate filament streaks in retreating water
      if (swashT > 0.35) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, ${0.4 * foamDecay})`;
        for (let i = 0; i < room.state.foamCells.length; i++) {
          const fc = room.state.foamCells[i];
          const cellX = (fc.rx * w + Math.sin(t * fc.speed) * 20) % w;
          const cellY = shoreY + fc.ry * (currentY - shoreY);
          if (cellY > shoreY && cellY < currentY) {
            ctx.beginPath();
            ctx.moveTo(cellX, cellY);
            ctx.lineTo(cellX + fc.tilt * 30, cellY + fc.len * 0.5);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }
}

// --- PASS 5: ACTIVE PLANKTON SPARKS (SPRAY) ---
ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (let i = 0; i < room.state.sparks.length; i++) {
  const sp = room.state.sparks[i];
  if (sp.life < sp.maxLife) {
    sp.life += dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 120 * dt; // gravity brings water droplets back down
    
    const prog = sp.life / sp.maxLife;
    const sparkAlpha = Math.sin(prog * Math.PI) * glowIntensity;
    
    if (sparkAlpha > 0.02) {
      // Outer soft glow
      ctx.fillStyle = `rgba(${pal.glowR}, ${pal.glowG}, ${pal.glowB}, ${sparkAlpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * 3.2, 0, Math.PI * 2);
      ctx.fill();
      
      // Hot ember core
      ctx.fillStyle = pal.core;
      ctx.globalAlpha = Math.min(1.0, sparkAlpha);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
ctx.restore();

// --- PASS 6: ROOM PEOPLE AS SHORELINE TIDE EDDIES ---
const people = Array.isArray(room.people) ? room.people : [];
if (people.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pCount = Math.min(people.length, 24);
  
  for (let i = 0; i < pCount; i++) {
    const p = people[i];
    const userHue = (typeof p.hue === 'number') ? p.hue : ((i * 57) % 360);
    const px = ((i + 0.5) / pCount) * w + Math.sin(t * 0.4 + i) * 25;
    const py = shoreY + 30 + ((userHue * 19) % Math.floor(Math.max(20, h - shoreY - 65)));
    
    // Expanding bioluminescent ripple
    const cycle = (t * 0.5 + i * 0.35) % 1.0;
    const rippleR = 8 + cycle * 28 * (1 + (beat ? 0.6 : 0));
    const rippleA = (1.0 - cycle) * 0.55 * glowIntensity;
    
    ctx.strokeStyle = `hsla(${userHue}, 90%, 65%, ${rippleA})`;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(px, py, rippleR, 0, Math.PI * 2);
    ctx.stroke();
    
    // Central plankton motes orbiting presence
    for (let m = 0; m < 2; m++) {
      const mAngle = t * 1.8 + m * Math.PI + i;
      const mx = px + Math.cos(mAngle) * (rippleR * 0.5);
      const my = py + Math.sin(mAngle) * (rippleR * 0.25);
      ctx.fillStyle = `hsl(${userHue}, 100%, 75%)`;
      ctx.beginPath();
      ctx.arc(mx, my, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// --- PASS 7: CINEMATIC VIGNETTE & CONTRAST LOCK ---
const vigGrad = ctx.createRadialGradient(w * 0.5, h * 0.55, w * 0.32, w * 0.5, h * 0.55, w * 0.72);
vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
vigGrad.addColorStop(0.7, 'rgba(0, 2, 6, 0.25)');
vigGrad.addColorStop(1, 'rgba(0, 1, 3, 0.75)');
ctx.fillStyle = vigGrad;
ctx.fillRect(0, 0, w, h);

ctx.restore();