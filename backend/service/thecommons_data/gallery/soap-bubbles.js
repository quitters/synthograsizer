const W = frame.width, H = frame.height;
const PI = Math.PI, TAU = PI * 2;

// Lookups
const drafts = { calm: 0.4, gentle: 0.8, breezy: 1.5, turbulent: 2.3 };
const draftMul = drafts[getVar('draft')] ?? drafts.gentle;
const thickness = getVar('film_thickness') ?? 2.5;
const scheme = getVar('iridescence') ?? 'opal';
const tone = getVar('lighting') ?? 'deep_void';

const palettes = {
  opal: [200, 280, 340, 45, 170],
  oil_slick: [280, 45, 130, 320, 190],
  neon_prism: [310, 180, 55, 270, 140],
  hyper_pastel: [340, 200, 80, 260, 160]
};
const activeHues = palettes[scheme] ?? palettes.opal;

// Persistent buffers
const st = room.state;
st.bubbles ??= [];
st.pops ??= [];
st.lastSpawn ??= 0;

// Audio influences
const bass = audio.bass || 0;
const mid = audio.mid || 0;
const treble = audio.treble || 0;
const beat = audio.beat;

// Interactive actions: 'blow' trigger
for (const e of room.events) {
  if (e.name === 'blow' && st.bubbles.length < 50) {
    const person = room.people ? room.people.find(p => p.id === e.participantId) : null;
    const hueBias = person ? person.hue : Math.random() * 360;
    st.bubbles.push({
      x: W * 0.5 + (Math.random() - 0.5) * (W * 0.4),
      y: H + 30,
      vx: (Math.random() - 0.5) * 60 * draftMul,
      vy: -(90 + Math.random() * 80) * draftMul,
      r: 32 + Math.random() * 48,
      phase: Math.random() * TAU,
      wobbleFreq: 1.8 + Math.random() * 2,
      swirlSpeed: 0.6 + Math.random() * 0.8,
      hue: hueBias,
      life: 0,
      maxLife: 16 + Math.random() * 12
    });
  }
}

// Autonomous bubble generation keeping the wall alive
if (frame.t - st.lastSpawn > (beat ? 0.4 : 1.4) && st.bubbles.length < 32) {
  st.lastSpawn = frame.t;
  st.bubbles.push({
    x: Math.random() * W,
    y: H + 40,
    vx: (Math.random() - 0.5) * 45 * draftMul,
    vy: -(50 + Math.random() * 55) * draftMul,
    r: 28 + Math.random() * 52,
    phase: Math.random() * TAU,
    wobbleFreq: 1.5 + Math.random() * 2.2,
    swirlSpeed: 0.5 + Math.random() * 0.7,
    hue: activeHues[Math.floor(Math.random() * activeHues.length)],
    life: 0,
    maxLife: 14 + Math.random() * 14
  });
}

// Draw ambient dark background
ctx.save();
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
if (tone === 'dusk_indigo') {
  bgGrad.addColorStop(0, '#060614');
  bgGrad.addColorStop(1, '#0e1124');
} else if (tone === 'midnight_teal') {
  bgGrad.addColorStop(0, '#020d12');
  bgGrad.addColorStop(1, '#051b20');
} else {
  bgGrad.addColorStop(0, '#040407');
  bgGrad.addColorStop(1, '#0a0a0f');
}
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Gentle deep back-glow behind bubbles
const auraGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, 50, W * 0.5, H * 0.5, W * 0.75);
auraGrad.addColorStop(0, 'rgba(30, 45, 80, 0.15)');
auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = auraGrad;
ctx.fillRect(0, 0, W, H);

const dt = Math.min(frame.dt, 0.05);

// Update & Draw Pop Droplets
ctx.globalCompositeOperation = 'lighter';
for (let i = st.pops.length - 1; i >= 0; i--) {
  const p = st.pops[i];
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vy += 80 * dt;
  p.life += dt;
  const progress = p.life / p.maxLife;
  if (progress >= 1) {
    st.pops.splice(i, 1);
    continue;
  }
  const alpha = (1 - progress) * 0.8;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * (1 - progress * 0.5), 0, TAU);
  ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${alpha})`;
  ctx.fill();
}

// Update Bubbles (and resolve soft collisions/merges)
const bubbles = st.bubbles;
for (let i = 0; i < bubbles.length; i++) {
  const b = bubbles[i];
  // Turbulent wind field
  const windX = Math.sin(frame.t * 0.8 + b.y * 0.005) * 20 * draftMul;
  const windY = Math.cos(frame.t * 0.6 + b.x * 0.004) * 8;
  b.x += (b.vx + windX) * dt;
  b.y += (b.vy + windY) * dt;
  b.life += dt;

  // Soft repel or merge among bubbles
  for (let j = i + 1; j < bubbles.length; j++) {
    const b2 = bubbles[j];
    const dx = b2.x - b.x;
    const dy = b2.y - b.y;
    const dist = Math.hypot(dx, dy);
    const minDist = (b.r + b2.r) * 0.88;
    if (dist < minDist && dist > 1) {
      // Near-equal size coalescence on strong bass
      if (beat && Math.abs(b.r - b2.r) < 8 && bubbles.length > 6) {
        b.r = Math.min(100, Math.sqrt(b.r * b.r + b2.r * b2.r));
        b.hue = (b.hue + b2.hue) * 0.5;
        bubbles.splice(j, 1);
        break;
      }
      // Elastic surface repulsion
      const overlap = (minDist - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      b.x -= nx * overlap * 0.15;
      b.y -= ny * overlap * 0.15;
      b2.x += nx * overlap * 0.15;
      b2.y += ny * overlap * 0.15;
    }
  }
}

// Pop handling and drawing bubbles
for (let i = bubbles.length - 1; i >= 0; i--) {
  const b = bubbles[i];
  const shouldPop = (b.life > b.maxLife) || (b.y < -b.r * 2) || (b.x < -b.r * 2) || (b.x > W + b.r * 2);

  if (shouldPop) {
    // Burst into iridescent micro-droplets
    if (b.y > 0 && b.y < H + 50 && b.x > 0 && b.x < W) {
      const dropCount = Math.min(24, Math.floor(b.r * 0.35));
      for (let k = 0; k < dropCount; k++) {
        if (st.pops.length >= 160) break;
        const ang = Math.random() * TAU;
        const spd = 40 + Math.random() * 180;
        st.pops.push({
          x: b.x + Math.cos(ang) * b.r,
          y: b.y + Math.sin(ang) * b.r,
          vx: Math.cos(ang) * spd + b.vx * 0.2,
          vy: Math.sin(ang) * spd + b.vy * 0.2,
          r: 1.2 + Math.random() * 2.2,
          hue: (b.hue + k * 18) % 360,
          life: 0,
          maxLife: 0.4 + Math.random() * 0.35
        });
      }
    }
    bubbles.splice(i, 1);
    continue;
  }

  // Audio wobble & expansion
  const soundPulse = 1 + bass * 0.16;
  const currR = b.r * soundPulse;
  const wobble = (Math.sin(frame.t * b.wobbleFreq + b.phase) * (2.2 + treble * 6)) * (currR / 45);
  const rx = Math.max(8, currR + wobble);
  const ry = Math.max(8, currR - wobble);

  ctx.save();
  ctx.translate(b.x, b.y);

  // 1. Shadow / subtle refraction dark body
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fillStyle = 'rgba(10, 16, 28, 0.12)';
  ctx.fill();

  // 2. Multi-band Thin-Film Interference Rings (clipping to the bubble)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.clip();

  ctx.globalCompositeOperation = 'screen';
  const swirlAngle = frame.t * b.swirlSpeed + b.phase;
  const bandCount = Math.floor(4 + thickness * 2);
  const step = currR / (bandCount + 1);

  // Swirling iridescent contour stripes
  for (let k = bandCount; k >= 1; k--) {
    const ringR = k * step + Math.sin(swirlAngle * 1.5 + k) * (3 + mid * 4);
    if (ringR <= 2) continue;
    const ringHue = (b.hue + k * (50 / thickness) + frame.t * 22) % 360;
    ctx.lineWidth = 3 + (currR * 0.05);
    ctx.strokeStyle = `hsla(${ringHue}, 92%, 68%, ${0.28 + (k / bandCount) * 0.35})`;

    ctx.beginPath();
    ctx.ellipse(
      Math.cos(swirlAngle + k) * (currR * 0.12),
      Math.sin(swirlAngle + k * 0.8) * (currR * 0.14),
      Math.max(2, ringR),
      Math.max(2, ringR * (0.85 + Math.sin(swirlAngle + k) * 0.12)),
      swirlAngle * 0.4,
      0,
      TAU
    );
    ctx.stroke();
  }

  // 3. Glancing-angle Fresnel Edge Glow
  const edgeGrad = ctx.createRadialGradient(0, 0, Math.max(0, currR * 0.72), 0, 0, currR);
  const rimHue1 = (b.hue + 140) % 360;
  const rimHue2 = (b.hue + 220) % 360;
  edgeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  edgeGrad.addColorStop(0.65, `hsla(${rimHue1}, 95%, 72%, 0.35)`);
  edgeGrad.addColorStop(0.92, `hsla(${rimHue2}, 100%, 82%, 0.85)`);
  edgeGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.95)');
  ctx.fillStyle = edgeGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();

  // End clip
  ctx.restore();

  // 4. Specular Highlights (crisp skylight reflection at top-left)
  ctx.globalCompositeOperation = 'lighter';
  // Primary sharp crescent reflection
  ctx.save();
  ctx.translate(-rx * 0.38, -ry * 0.38);
  ctx.rotate(-PI * 0.25);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.3, ry * 0.12, 0, 0, TAU);
  const specGrad1 = ctx.createLinearGradient(0, -ry * 0.12, 0, ry * 0.12);
  specGrad1.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  specGrad1.addColorStop(0.6, 'rgba(255, 250, 240, 0.6)');
  specGrad1.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = specGrad1;
  ctx.fill();
  ctx.restore();

  // Secondary faint counter-reflection (ground bounce, bottom-right)
  ctx.save();
  ctx.translate(rx * 0.32, ry * 0.32);
  ctx.rotate(-PI * 0.25);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.18, ry * 0.07, 0, 0, TAU);
  ctx.fillStyle = 'rgba(230, 245, 255, 0.38)';
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

ctx.restore();