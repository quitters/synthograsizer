ctx.save();
const W = frame.width;
const H = frame.height;
const t = frame.t;
const dt = Math.min(frame.dt, 0.1);

// Read variables
const moodKey = getVar('dusk_mood') ?? 'twilight_violet';
const archStyle = getVar('gothic_arches') ?? 'ornate_belfry';
const bellScale = getVar('bell_size') ?? 1.0;
const resonance = getVar('resonance') ?? 2.5;
const mistDensity = getVar('mist_density') ?? 0.4;

// Mood palettes: [skyTop, skyMid, skyHorizon, glowTint]
const palettes = {
  twilight_violet: ['#05020c', '#1b0b2e', '#591f4b', '#e6739f'],
  deep_ember:      ['#080202', '#260a0a', '#681c0e', '#fca334'],
  midnight_aurora: ['#02090e', '#071f28', '#144d4b', '#48e5c2'],
  golden_hour:     ['#050814', '#1f1a3a', '#6b3624', '#ffb04f']
};
const pal = palettes[moodKey] ?? palettes.twilight_violet;

// Persistent room state
room.state.bells ??= [];
room.state.rings ??= [];
room.state.sparks ??= [];
room.state.lastBeat ??= 0;

// Determine active participant bells
const people = room.people && room.people.length > 0 ? room.people : null;
const bellCount = Math.max(5, Math.min(16, people ? people.length : 7));

// Synchronize bell array
while (room.state.bells.length < bellCount) {
  room.state.bells.push({ angle: 0, vel: 0, glow: 0, hue: (room.state.bells.length * 52) % 360 });
}
if (room.state.bells.length > bellCount) {
  room.state.bells.length = bellCount;
}

// Assign hues from people if present
for (let i = 0; i < bellCount; i++) {
  const b = room.state.bells[i];
  if (people && people[i]) {
    b.hue = people[i].hue;
    b.id = people[i].id;
  } else {
    b.hue = (i * (360 / bellCount)) % 360;
    b.id = null;
  }
}

// Helper to strike a specific bell
const strikeBell = (idx, force = 1.0) => {
  const b = room.state.bells[idx];
  if (!b) return;
  b.vel += (Math.random() > 0.5 ? 1 : -1) * (1.8 + force * 2.2);
  b.glow = 1.0;
  const bx = (W / (bellCount + 1)) * (idx + 1);
  const by = H * 0.42;
  if (room.state.rings.length < 80) {
    room.state.rings.push({
      x: bx, y: by, r: 12,
      dr: 120 + 80 * force,
      hue: b.hue,
      life: 1.0,
      decay: 0.22 / resonance,
      maxR: Math.max(W, H) * 0.95
    });
  }
  for (let s = 0; s < 6; s++) {
    if (room.state.sparks.length < 120) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 110;
      room.state.sparks.push({
        x: bx, y: by + 25 * bellScale,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd + 15,
        hue: b.hue, life: 1.0, decay: 0.8 + Math.random() * 0.6
      });
    }
  }
};

// Process incoming trigger events
if (room.events) {
  for (const e of room.events) {
    if (e.name === 'ring') {
      let target = -1;
      if (e.participantId && people) {
        target = people.findIndex(p => p.id === e.participantId);
      }
      if (target === -1) {
        target = Math.floor(Math.random() * bellCount);
      }
      strikeBell(target, 1.2);
    }
  }
}

// Audio beat auto-strike & ambient rhythm
if (audio && audio.beat && (t - room.state.lastBeat > 0.35)) {
  room.state.lastBeat = t;
  const idx = Math.floor((audio.bass * 7 + t * 2) % bellCount);
  strikeBell(idx, 0.6 + audio.bass * 0.7);
}

// 1. SKY BACKGROUND
const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
skyGrad.addColorStop(0, pal[0]);
skyGrad.addColorStop(0.45, pal[1]);
skyGrad.addColorStop(0.75, pal[2]);
skyGrad.addColorStop(1, '#020104');
ctx.fillStyle = skyGrad;
ctx.fillRect(0, 0, W, H);

// Stars in upper sky
ctx.fillStyle = '#ffffff';
for (let i = 0; i < 40; i++) {
  const sx = ((i * 197.3) % W);
  const sy = ((i * 71.9) % (H * 0.4));
  const twinkle = Math.sin(t * 2.5 + i) * 0.4 + 0.5;
  ctx.globalAlpha = twinkle * 0.7;
  ctx.fillRect(sx, sy, 1.5, 1.5);
}
ctx.globalAlpha = 1.0;

// 2. SOUND RINGS PROPAGATION (SCREEN BLEND)
ctx.save();
ctx.globalCompositeOperation = 'screen';
for (let i = room.state.rings.length - 1; i >= 0; i--) {
  const ring = room.state.rings[i];
  ring.r += ring.dr * dt;
  ring.life -= ring.decay * dt;
  if (ring.life <= 0 || ring.r > ring.maxR) {
    room.state.rings.splice(i, 1);
    continue;
  }
  const alpha = ring.life * 0.85;
  const lw = (3 + (1 - ring.life) * 14) * (1 + (audio ? audio.mid * 0.8 : 0));
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${ring.hue}, 95%, 65%, ${alpha})`;
  ctx.lineWidth = lw;
  ctx.stroke();

  // Subtle harmonic echo ring
  if (ring.r > 40) {
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r * 0.82, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${ring.hue + 25}, 100%, 75%, ${alpha * 0.4})`;
    ctx.lineWidth = lw * 0.4;
    ctx.stroke();
  }
}

// Sparks update and draw
for (let i = room.state.sparks.length - 1; i >= 0; i--) {
  const sp = room.state.sparks[i];
  sp.x += sp.vx * dt;
  sp.y += sp.vy * dt;
  sp.vy += 80 * dt; // gravity
  sp.life -= sp.decay * dt;
  if (sp.life <= 0) {
    room.state.sparks.splice(i, 1);
    continue;
  }
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, 2.2 * bellScale * sp.life, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${sp.hue}, 100%, 75%, ${sp.life})`;
  ctx.fill();
}
ctx.restore();

// 3. ARCHITECTURE SILHOUETTE & CARILLON GALLERY
const beamY = H * 0.35;
const floorY = H * 0.62;
const colWidth = Math.max(16, (W / (bellCount + 1)) * 0.22);

// Distant town & lower tower massive base
ctx.fillStyle = '#060408';
ctx.beginPath();
ctx.moveTo(0, floorY + 60);
for (let x = 0; x <= W; x += 40) {
  const hill = Math.sin(x * 0.004 + 1.2) * 25 + Math.cos(x * 0.012) * 10;
  ctx.lineTo(x, floorY + 40 + hill);
}
ctx.lineTo(W, H);
ctx.lineTo(0, H);
ctx.closePath();
ctx.fill();

// Belfry structure backdrop openings
ctx.fillStyle = '#020104';
// Draw massive side buttresses
ctx.fillRect(0, beamY - 60, W * 0.06, H);
ctx.fillRect(W * 0.94, beamY - 60, W * 0.06, H);

// Main timber architrave beam spanning across bells
const woodGrad = ctx.createLinearGradient(0, beamY - 18, 0, beamY + 12);
woodGrad.addColorStop(0, '#281c15');
woodGrad.addColorStop(0.4, '#150d08');
woodGrad.addColorStop(1, '#060302');
ctx.fillStyle = woodGrad;
ctx.fillRect(0, beamY - 14, W, 26);

// Stone arches framing each bell slot
for (let i = 0; i < bellCount; i++) {
  const cx = (W / (bellCount + 1)) * (i + 1);
  const archW = (W / (bellCount + 1)) * 0.78;
  const archH = floorY - beamY;
  
  ctx.save();
  ctx.fillStyle = '#0a070c';
  ctx.strokeStyle = '#201625';
  ctx.lineWidth = 3;

  if (archStyle === 'ornate_belfry') {
    // Pointed Gothic Arch silhouette top
    ctx.beginPath();
    ctx.moveTo(cx - archW * 0.5, beamY);
    ctx.quadraticCurveTo(cx - archW * 0.45, beamY - 70, cx, beamY - 95);
    ctx.quadraticCurveTo(cx + archW * 0.45, beamY - 70, cx + archW * 0.5, beamY);
    ctx.lineTo(cx + archW * 0.5, beamY - 10);
    ctx.lineTo(cx - archW * 0.5, beamY - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (archStyle === 'monolithic_spire') {
    // Sharp triangular pediment
    ctx.beginPath();
    ctx.moveTo(cx - archW * 0.5, beamY);
    ctx.lineTo(cx, beamY - 80);
    ctx.lineTo(cx + archW * 0.5, beamY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// 4. DRAW BELLS WITH PENDULUM MOTION
for (let i = 0; i < bellCount; i++) {
  const b = room.state.bells[i];
  const bx = (W / (bellCount + 1)) * (i + 1);
  const by = beamY + 6;

  // Damped pendulum physics
  const audioDrive = (audio ? (audio.bass * (i % 2 === 0 ? 0.3 : -0.3) + audio.treble * 0.1) : 0);
  const spring = -5.0 * b.angle;
  const damp = 0.94;
  b.vel = (b.vel + (spring + audioDrive) * dt * 4.0) * Math.pow(damp, dt * 60);
  b.angle += b.vel * dt;
  b.glow = Math.max(0, b.glow - dt * 1.5);

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(b.angle);
  ctx.scale(bellScale, bellScale);

  // Suspension yoke/crown ironwork
  ctx.fillStyle = '#141416';
  ctx.fillRect(-10, -6, 20, 10);
  ctx.fillStyle = '#3a342c';
  ctx.beginPath();
  ctx.arc(0, 4, 7, 0, Math.PI * 2);
  ctx.fill();

  // Clapper swinging with bell with slight phase lag
  const clapperAng = -b.angle * 0.6 + Math.sin(t * 3 + i) * 0.05;
  ctx.save();
  ctx.rotate(clapperAng);
  ctx.strokeStyle = '#18120e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(0, 48);
  ctx.stroke();
  ctx.fillStyle = '#36281e';
  ctx.beginPath();
  ctx.arc(0, 50, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bell Body Path
  // Flare out from head to shoulder, waist, and wide sound-bow
  const bw = 32;
  const bh = 54;
  ctx.beginPath();
  ctx.moveTo(-11, 6);
  ctx.bezierCurveTo(-14, 18, -16, 28, -bw * 0.58, 42);
  ctx.bezierCurveTo(-bw * 0.85, 48, -bw, 52, -bw, 56);
  ctx.quadraticCurveTo(0, 59, bw, 56);
  ctx.bezierCurveTo(bw, 52, bw * 0.85, 48, bw * 0.58, 42);
  ctx.bezierCurveTo(16, 28, 14, 18, 11, 6);
  ctx.closePath();

  // Bronze shaded gradient
  const bronzeGrad = ctx.createLinearGradient(-bw, 0, bw, 0);
  const litHue = b.glow > 0.05 ? b.hue : 38;
  bronzeGrad.addColorStop(0.0, '#100a06');
  bronzeGrad.addColorStop(0.2, '#382211');
  bronzeGrad.addColorStop(0.5, b.glow > 0.1 ? `hsl(${litHue}, 75%, 55%)` : '#9a6b32');
  bronzeGrad.addColorStop(0.75, '#5c3919');
  bronzeGrad.addColorStop(1.0, '#140c06');
  ctx.fillStyle = bronzeGrad;
  ctx.fill();
  ctx.strokeStyle = '#080503';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Lip / Sound-Bow highlight ring
  ctx.beginPath();
  ctx.ellipse(0, 56, bw * 0.94, 4.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = b.glow > 0.1 ? `hsl(${litHue}, 85%, 65%)` : '#b8863f';
  ctx.fill();
  ctx.stroke();

  // Active resonance rim glow
  if (b.glow > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `hsla(${b.hue}, 100%, 65%, ${b.glow * 0.8})`;
    ctx.beginPath();
    ctx.ellipse(0, 56, bw * 1.15, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// 5. FOREGROUND BALUSTRADE & MIST LAYERS
// Heavy lower stone balustrade
ctx.fillStyle = '#09060b';
ctx.fillRect(0, floorY, W, 22);
// Railing posts
for (let bx = 10; bx < W; bx += 28) {
  ctx.fillStyle = '#050307';
  ctx.fillRect(bx, floorY - 26, 8, 26);
}
ctx.fillStyle = '#0f0a14';
ctx.fillRect(0, floorY - 32, W, 8);

// Soft rolling dusk mist across the lower third
if (mistDensity > 0.01) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const mistLayers = 3;
  for (let m = 0; m < mistLayers; m++) {
    const speed = 0.08 + m * 0.05;
    const yOffset = floorY - 30 + m * 45;
    ctx.fillStyle = pal[3];
    ctx.globalAlpha = mistDensity * (0.07 + m * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 50) {
      const my = yOffset + Math.sin(x * 0.003 + t * speed + m * 2.1) * 35
                         + Math.cos(x * 0.007 - t * speed * 0.7) * 15;
      ctx.lineTo(x, my);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Vignette to anchor dramatic depth for a wall projection
const vig = ctx.createRadialGradient(W * 0.5, H * 0.48, W * 0.32, W * 0.5, H * 0.48, W * 0.75);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, 'rgba(2,1,4,0.75)');
ctx.fillStyle = vig;
ctx.fillRect(0, 0, W, H);

ctx.restore();