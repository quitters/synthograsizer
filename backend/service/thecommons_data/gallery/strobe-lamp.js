ctx.save();

const style = getVar('lamp_style') ?? 'rocket';
const palChoice = getVar('palette') ?? 'sunset';
const viscChoice = getVar('viscosity') ?? 'buoyant';
const targetBlobs = getVar('blob_count') ?? 12;
const glowLevel = getVar('glow_intensity') ?? 3;
const strobeEnabled = getVar('strobe_mode') ?? false;

const palettes = {
  sunset: {
    fluidTop: '#2d0838', fluidBot: '#150020',
    waxA: '#ff2d55', waxB: '#ff9500', waxCore: '#fff0a6',
    metal: '#202028', metalRim: '#66667a', glow: 'rgba(255, 60, 40, 0.45)'
  },
  neon_psyche: {
    fluidTop: '#061a30', fluidBot: '#18042b',
    waxA: '#00f5d4', waxB: '#7b2cbf', waxCore: '#f15bb5',
    metal: '#1b1e2e', metalRim: '#7080a0', glow: 'rgba(0, 245, 212, 0.45)'
  },
  toxic_ooze: {
    fluidTop: '#0a1d08', fluidBot: '#020d04',
    waxA: '#38b000', waxB: '#ccff33', waxCore: '#ffffaa',
    metal: '#1a1f18', metalRim: '#5b6b55', glow: 'rgba(112, 224, 0, 0.45)'
  },
  electric_violet: {
    fluidTop: '#100b2b', fluidBot: '#260430',
    waxA: '#7209b7', waxB: '#f72585', waxCore: '#4cc9f0',
    metal: '#221c2e', metalRim: '#7f6f96', glow: 'rgba(247, 37, 133, 0.45)'
  }
};
const pal = palettes[palChoice] ?? palettes.sunset;

const speedMults = { syrupy: 0.5, buoyant: 1.0, surging: 1.7 };
const speed = speedMults[viscChoice] ?? 1.0;

// Persistent state
room.state.blobs ??= [];
room.state.strobeTimer ??= 0;
room.state.heatCoil ??= 0;

if (audio.beat) {
  room.state.strobeTimer = 1.0;
} else {
  room.state.strobeTimer = Math.max(0, room.state.strobeTimer - frame.dt * 4.5);
}

// Init / update blob list
while (room.state.blobs.length < targetBlobs) {
  room.state.blobs.push({
    x: (Math.random() - 0.5) * 0.7,
    y: 0.1 + Math.random() * 0.8,
    vy: (Math.random() > 0.5 ? -1 : 1) * (0.04 + Math.random() * 0.08),
    rad: 0.08 + Math.random() * 0.08,
    seed: Math.random() * 100,
    wobble: 1 + Math.random() * 3
  });
}
if (room.state.blobs.length > targetBlobs) {
  room.state.blobs.length = targetBlobs;
}

// Canvas layout
const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const lampH = Math.min(H * 0.88, W * 1.6);
const lampW = lampH * 0.44;
const topY = (H - lampH) * 0.5 + lampH * 0.12;
const botY = topY + lampH * 0.72;
const midY = (topY + botY) * 0.5;
const innerH = botY - topY;

// Strobe trigger logic
const isStrobeFrame = strobeEnabled && (room.state.strobeTimer > 0.15 && Math.sin(frame.t * 40) > -0.2);
const bgTone = isStrobeFrame ? '#f0f4ff' : '#07060a';
ctx.fillStyle = bgTone;
ctx.fillRect(0, 0, W, H);

// Room ambience glow
const ambientGlow = ctx.createRadialGradient(cx, midY, lampW * 0.3, cx, midY, lampW * 2.2);
ambientGlow.addColorStop(0, pal.glow);
ambientGlow.addColorStop(0.5, isStrobeFrame ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0)');
ambientGlow.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = ambientGlow;
ctx.fillRect(0, 0, W, H);

// Glass vessel path generator
function getVesselRadius(normY) {
  // normY: 0 at top, 1 at bottom
  if (style === 'cylinder') {
    return lampW * 0.42;
  } else if (style === 'hourglass') {
    const curve = Math.cos(normY * Math.PI * 2);
    return lampW * (0.34 + 0.14 * curve);
  } else {
    // Classic rocket
    const taper = Math.sin(normY * Math.PI * 0.9 + 0.15);
    return lampW * (0.24 + 0.26 * taper);
  }
}

function traceVesselPath(context) {
  const steps = 36;
  context.beginPath();
  // Right side going down
  for (let i = 0; i <= steps; i++) {
    const ny = i / steps;
    const py = topY + ny * innerH;
    const rx = getVesselRadius(ny);
    if (i === 0) context.moveTo(cx + rx, py);
    else context.lineTo(cx + rx, py);
  }
  // Bottom arc
  context.bezierCurveTo(cx + lampW * 0.2, botY + lampH * 0.03, cx - lampW * 0.2, botY + lampH * 0.03, cx - getVesselRadius(1), botY);
  // Left side going up
  for (let i = steps; i >= 0; i--) {
    const ny = i / steps;
    const py = topY + ny * innerH;
    const rx = getVesselRadius(ny);
    context.lineTo(cx - rx, py);
  }
  // Top arc
  context.bezierCurveTo(cx - lampW * 0.15, topY - lampH * 0.02, cx + lampW * 0.15, topY - lampH * 0.02, cx + getVesselRadius(0), topY);
  context.closePath();
}

// Metal Cap & Base dimensions
const capTop = topY - lampH * 0.08;
const baseBot = botY + lampH * 0.14;

// Draw lamp interior (Clipped to vessel glass)
ctx.save();
traceVesselPath(ctx);
ctx.clip();

// Glass inner liquid background
const fluidGrad = ctx.createLinearGradient(0, topY, 0, botY);
if (isStrobeFrame) {
  fluidGrad.addColorStop(0, '#ffffff');
  fluidGrad.addColorStop(0.5, '#e2e8f0');
  fluidGrad.addColorStop(1, '#94a3b8');
} else {
  fluidGrad.addColorStop(0, pal.fluidTop);
  fluidGrad.addColorStop(1, pal.fluidBot);
}
ctx.fillStyle = fluidGrad;
ctx.fill();

// Bottom heating coil element
const coilGrad = ctx.createRadialGradient(cx, botY, 5, cx, botY, lampW * 0.5);
coilGrad.addColorStop(0, isStrobeFrame ? '#fff' : (pal.waxCore));
coilGrad.addColorStop(0.4 + audio.bass * 0.3, pal.waxB);
coilGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = coilGrad;
ctx.beginPath();
ctx.ellipse(cx, botY, lampW * 0.45, lampH * 0.08, 0, 0, Math.PI * 2);
ctx.fill();

// Update & Draw Blobs
const bassBoost = 1 + audio.bass * 0.6;
const blobRenderData = [];

for (let i = 0; i < room.state.blobs.length; i++) {
  const b = room.state.blobs[i];
  const speedEff = speed * (b.vy < 0 ? 1.0 + audio.bass * 0.5 : 0.85);
  b.y += b.vy * speedEff * frame.dt;

  // Buoyancy turnaround at extremes
  if (b.y < 0.08) {
    b.y = 0.08;
    b.vy = Math.abs(b.vy) * (0.8 + Math.random() * 0.4);
  } else if (b.y > 0.92) {
    b.y = 0.92;
    b.vy = -Math.abs(b.vy) * (0.8 + Math.random() * 0.4);
  }

  // Subtle lateral drift towards center
  b.x += Math.sin(frame.t * b.wobble + b.seed) * 0.0018 * speedEff;
  b.x *= 0.985;

  const ny = b.y;
  const maxRx = getVesselRadius(ny) * 0.78;
  const px = cx + b.x * maxRx * 2;
  const py = topY + ny * innerH;
  const r = b.rad * lampW * bassBoost;

  blobRenderData.push({ x: px, y: py, r: r, ny: ny, seed: b.seed });
}

// Draw gooey connector bridges between close blobs
ctx.fillStyle = isStrobeFrame ? '#ffffff' : pal.waxA;
for (let i = 0; i < blobRenderData.length; i++) {
  for (let j = i + 1; j < blobRenderData.length; j++) {
    const b1 = blobRenderData[i];
    const b2 = blobRenderData[j];
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.hypot(dx, dy);
    const maxDist = (b1.r + b2.r) * 1.35;

    if (dist < maxDist && dist > Math.abs(b1.r - b2.r)) {
      const angle = Math.atan2(dy, dx);
      const pinch = Math.max(0.1, dist / maxDist);
      const spread1 = Math.acos(Math.min(1, Math.max(-1, (b1.r - b2.r) / dist))) * 0.7;
      const spread2 = Math.PI - spread1;

      const u1x = b1.x + Math.cos(angle + spread1) * b1.r;
      const u1y = b1.y + Math.sin(angle + spread1) * b1.r;
      const u2x = b2.x + Math.cos(angle + spread2) * b2.r;
      const u2y = b2.y + Math.sin(angle + spread2) * b2.r;

      const v1x = b1.x + Math.cos(angle - spread1) * b1.r;
      const v1y = b1.y + Math.sin(angle - spread1) * b1.r;
      const v2x = b2.x + Math.cos(angle - spread2) * b2.r;
      const v2y = b2.y + Math.sin(angle - spread2) * b2.r;

      const midX = (b1.x + b2.x) * 0.5;
      const midY2 = (b1.y + b2.y) * 0.5;

      ctx.beginPath();
      ctx.moveTo(u1x, u1y);
      ctx.quadraticCurveTo(midX + Math.sin(angle) * b1.r * pinch * 0.6, midY2 - Math.cos(angle) * b1.r * pinch * 0.6, u2x, u2y);
      ctx.lineTo(v2x, v2y);
      ctx.quadraticCurveTo(midX - Math.sin(angle) * b1.r * pinch * 0.6, midY2 + Math.cos(angle) * b1.r * pinch * 0.6, v1x, v1y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Draw Individual Blobs with layered 3D wax shading
for (let i = 0; i < blobRenderData.length; i++) {
  const b = blobRenderData[i];
  const deformY = 1.0 + Math.sin(frame.t * 3 + b.seed) * 0.12;
  const deformX = 1.0 / deformY;

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(deformX, deformY);

  const blobGrad = ctx.createRadialGradient(-b.r * 0.25, -b.r * 0.25, b.r * 0.05, 0, 0, b.r);
  if (isStrobeFrame) {
    blobGrad.addColorStop(0, '#ffffff');
    blobGrad.addColorStop(0.5, '#000000');
    blobGrad.addColorStop(1, '#ffffff');
  } else {
    blobGrad.addColorStop(0, pal.waxCore);
    blobGrad.addColorStop(0.35, pal.waxB);
    blobGrad.addColorStop(0.85, pal.waxA);
    blobGrad.addColorStop(1.0, pal.waxA);
  }

  ctx.fillStyle = blobGrad;
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, Math.PI * 2);
  ctx.fill();

  // Glossy highlight reflection
  ctx.fillStyle = isStrobeFrame ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-b.r * 0.32, -b.r * 0.35, b.r * 0.35, b.r * 0.16, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Floating micro-bubbles for audience connected presence
const people = room.people ?? [];
const bubbleCount = Math.max(8, people.length);
for (let i = 0; i < bubbleCount; i++) {
  const person = people[i % (people.length || 1)];
  const pSeed = (i * 47.19) % 1;
  const bSpeed = 0.15 + pSeed * 0.25;
  const byNorm = (1.0 - ((frame.t * bSpeed * speed + pSeed) % 1.0));
  const by = topY + byNorm * innerH;
  const maxR = getVesselRadius(byNorm) * 0.8;
  const bx = cx + Math.sin(frame.t * 2 + i * 3) * maxR * 0.7;
  const bRadius = 2.5 + (audio.treble * 3);

  ctx.fillStyle = person ? `hsla(${person.hue}, 90%, 75%, 0.7)` : 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(bx, by, bRadius, 0, Math.PI * 2);
  ctx.fill();
}

// Glass surface reflections (specular vertical glares)
const glassReflect = ctx.createLinearGradient(cx - lampW * 0.5, 0, cx + lampW * 0.5, 0);
glassReflect.addColorStop(0, 'rgba(255,255,255,0.0)');
glassReflect.addColorStop(0.18, 'rgba(255,255,255,0.18)');
glassReflect.addColorStop(0.24, 'rgba(255,255,255,0.0)');
glassReflect.addColorStop(0.82, 'rgba(255,255,255,0.08)');
glassReflect.addColorStop(0.92, 'rgba(255,255,255,0.22)');
glassReflect.addColorStop(1, 'rgba(255,255,255,0.0)');
ctx.fillStyle = glassReflect;
traceVesselPath(ctx);
ctx.fill();

ctx.restore(); // End vessel clipping

// Glass Outline
ctx.save();
ctx.lineWidth = 2.5;
ctx.strokeStyle = isStrobeFrame ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
traceVesselPath(ctx);
ctx.stroke();
ctx.restore();

// Lamp Metal Cap & Base Drawing
function drawMetalPart(y1, y2, rTop, rBot, withVents) {
  const grad = ctx.createLinearGradient(cx - lampW * 0.5, 0, cx + lampW * 0.5, 0);
  grad.addColorStop(0, pal.metal);
  grad.addColorStop(0.25, pal.metalRim);
  grad.addColorStop(0.55, '#f5f5ff');
  grad.addColorStop(0.75, pal.metalRim);
  grad.addColorStop(1, pal.metal);

  ctx.fillStyle = isStrobeFrame ? '#222' : grad;
  ctx.beginPath();
  ctx.moveTo(cx - rTop, y1);
  ctx.lineTo(cx + rTop, y1);
  ctx.lineTo(cx + rBot, y2);
  ctx.lineTo(cx - rBot, y2);
  ctx.closePath();
  ctx.fill();

  // Rim highlights
  ctx.strokeStyle = isStrobeFrame ? '#fff' : 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (withVents) {
    ctx.fillStyle = isStrobeFrame ? '#fff' : pal.waxB;
    const ventY = y1 + (y2 - y1) * 0.38;
    for (let k = -2; k <= 2; k++) {
      ctx.fillRect(cx + k * 14 - 4, ventY, 8, 3);
    }
  }
}

// Draw Top Cap
const topCapR = getVesselRadius(0);
drawMetalPart(capTop, topY, topCapR * 0.45, topCapR * 1.05, false);

// Draw Cap Tip
ctx.fillStyle = pal.metalRim;
ctx.beginPath();
ctx.arc(cx, capTop, topCapR * 0.4, Math.PI, 0);
ctx.fill();

// Draw Sturdy Metal Base
const botCapR = getVesselRadius(1);
drawMetalPart(botY, baseBot, botCapR * 1.04, lampW * 0.65, true);

// Base Foot / Stand
ctx.fillStyle = '#0a0a0f';
ctx.beginPath();
ctx.ellipse(cx, baseBot + 4, lampW * 0.68, lampH * 0.024, 0, 0, Math.PI * 2);
ctx.fill();

// Overall Glow overlay according to glow_intensity knob
if (glowLevel > 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glowAlpha = (glowLevel - 1) * 0.08 * (1 + audio.bass * 0.4);
  ctx.fillStyle = isStrobeFrame ? `rgba(255,255,255,${glowAlpha * 1.5})` : pal.glow.replace('0.45', glowAlpha.toFixed(2));
  ctx.beginPath();
  ctx.ellipse(cx, midY, lampW * 0.8, innerH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

ctx.restore();