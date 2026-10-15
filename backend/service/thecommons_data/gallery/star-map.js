ctx.save();

const W = frame.width;
const H = frame.height;
const cx = W * 0.5;
const cy = H * 0.5;
const minDim = Math.min(W, H);
const t = frame.t;

const proj = getVar('projection') ?? 'deep cosmos';
const glowStyle = getVar('glow_style') ?? 'soft starlight';
const lineStyle = getVar('line_style') ?? 'delicate thread';
const starDensity = getVar('star_density') ?? 150;
const reach = getVar('connection_reach') ?? 180;
const driftSpeed = getVar('drift_speed') ?? 0.6;

const bass = audio?.bass ?? 0;
const mid = audio?.mid ?? 0;
const treble = audio?.treble ?? 0;
const beat = audio?.beat ?? false;

// Init persistent state
room.state.bgStars ??= [];
if (room.state.bgStars.length !== starDensity) {
  const arr = [];
  for (let i = 0; i < starDensity; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * 0.5;
    arr.push({
      ang,
      rad,
      baseSize: 0.6 + Math.random() * 1.6,
      twinkleSpeed: 1.5 + Math.random() * 4.0,
      phase: Math.random() * Math.PI * 2,
      hue: 200 + Math.random() * 50
    });
  }
  room.state.bgStars = arr;
}

room.state.personOrbits ??= {};
room.state.pulse ??= 0;
if (beat) {
  room.state.pulse = 1.0;
} else {
  room.state.pulse = Math.max(0, room.state.pulse - (frame.dt ?? 0.016) * 2.8);
}

// Clear background to deep midnight indigo
ctx.fillStyle = '#03050c';
ctx.fillRect(0, 0, W, H);

// Faint nebula backdrop glow reacting to bass
const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, minDim * 0.65);
bgGrad.addColorStop(0, `rgba(18, 26, 52, ${0.45 + bass * 0.25})`);
bgGrad.addColorStop(0.5, `rgba(9, 14, 30, ${0.3 + mid * 0.15})`);
bgGrad.addColorStop(1, 'rgba(3, 5, 12, 0)');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Draw astrolabe / coordinate grids if requested
ctx.lineWidth = 1;
if (proj === 'astrolabe rings') {
  ctx.strokeStyle = 'rgba(160, 190, 240, 0.08)';
  for (let r = 0.15; r <= 0.48; r += 0.11) {
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a + t * 0.02 * driftSpeed) * minDim * 0.48, cy + Math.sin(a + t * 0.02 * driftSpeed) * minDim * 0.48);
    ctx.stroke();
  }
} else if (proj === 'celestial sphere') {
  ctx.strokeStyle = 'rgba(120, 160, 220, 0.07)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, minDim * 0.46, minDim * 0.22, t * 0.04 * driftSpeed, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, minDim * 0.46, minDim * 0.38, -t * 0.03 * driftSpeed, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, minDim * 0.46, 0, Math.PI * 2);
  ctx.stroke();
}

// Render ambient distant stars
for (let i = 0; i < room.state.bgStars.length; i++) {
  const s = room.state.bgStars[i];
  const driftAng = s.ang + t * 0.015 * driftSpeed;
  const dist = s.rad * minDim;
  const sx = cx + Math.cos(driftAng) * dist;
  const sy = cy + Math.sin(driftAng) * dist;
  const twinkle = Math.sin(t * s.twinkleSpeed + s.phase);
  const alpha = Math.max(0.1, 0.35 + twinkle * 0.25 + treble * 0.3);
  const sz = s.baseSize * (1 + (beat ? 0.3 : 0));
  
  ctx.fillStyle = `hsla(${s.hue}, 60%, 80%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(sx, sy, sz, 0, Math.PI * 2);
  ctx.fill();
}

// Build active list of people-stars (synthesize placeholders if room is quiet)
const rawPeople = (room.people && room.people.length > 0) ? room.people : null;
const personCount = rawPeople ? rawPeople.length : 14;
const nodes = [];

for (let i = 0; i < personCount; i++) {
  const id = rawPeople ? rawPeople[i].id : `guest_${i}`;
  const baseHue = rawPeople ? (rawPeople[i].hue ?? ((i * 47) % 360)) : ((i * 53 + 20) % 360);
  
  if (!room.state.personOrbits[id]) {
    // deterministic seed per id
    let hash = 0;
    for (let c = 0; c < String(id).length; c++) {
      hash = (hash * 31 + String(id).charCodeAt(c)) & 0xffffffff;
    }
    const norm1 = Math.abs((hash % 1000) / 1000);
    const norm2 = Math.abs(((hash >> 3) % 1000) / 1000);
    room.state.personOrbits[id] = {
      radFactor: 0.12 + norm1 * 0.34,
      baseSpeed: (0.15 + norm2 * 0.35) * (norm1 > 0.5 ? 1 : -1),
      initialAng: norm2 * Math.PI * 2,
      wobbleSeed: norm1 * 10
    };
  }
  
  const orb = room.state.personOrbits[id];
  const curAng = orb.initialAng + t * orb.baseSpeed * driftSpeed * 0.35;
  const wobble = Math.sin(t * 1.1 + orb.wobbleSeed) * 0.04;
  let rad = (orb.radFactor + wobble) * minDim;
  
  if (proj === 'astrolabe rings') {
    // Snap slightly toward astrolabe concentric tracks
    const trackStep = minDim * 0.11;
    rad = Math.round(rad / trackStep) * trackStep;
  }
  
  const px = cx + Math.cos(curAng) * rad;
  const py = cy + Math.sin(curAng) * rad * (proj === 'celestial sphere' ? 0.8 : 1.0);
  
  nodes.push({
    id,
    x: px,
    y: py,
    hue: baseHue,
    pulseOffset: orb.wobbleSeed
  });
}

// Prune old orbits
if (Object.keys(room.state.personOrbits).length > 150) {
  room.state.personOrbits = {};
}

// Constellation connecting lines
ctx.save();
if (lineStyle === 'pulsing ether') {
  ctx.globalCompositeOperation = 'lighter';
}

const reachSq = reach * reach;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const dx = nodes[i].x - nodes[j].x;
    const dy = nodes[i].y - nodes[j].y;
    const dSq = dx * dx + dy * dy;
    
    if (dSq < reachSq) {
      const dist = Math.sqrt(dSq);
      const normDist = 1 - (dist / reach);
      const midHue = (nodes[i].hue + nodes[j].hue) * 0.5;
      
      let alpha = normDist * (0.2 + bass * 0.3 + room.state.pulse * 0.25);
      let width = 0.8 + normDist * 1.4;
      
      if (lineStyle === 'delicate thread') {
        ctx.lineWidth = width * 0.75;
        ctx.strokeStyle = `hsla(${midHue}, 65%, 75%, ${alpha * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      } else if (lineStyle === 'pulsing ether') {
        ctx.lineWidth = width * 1.5;
        const pulseWave = Math.sin(t * 3 - dist * 0.03) * 0.3 + 0.7;
        ctx.strokeStyle = `hsla(${midHue}, 90%, 70%, ${alpha * pulseWave})`;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      } else if (lineStyle === 'etched brass') {
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = `rgba(230, 205, 140, ${alpha * 0.85})`;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}
ctx.restore();

// Draw stars representing people
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i];
  const beatKick = room.state.pulse * 2.8;
  const twinkle = Math.sin(t * 3.5 + n.pulseOffset) * 0.5 + 0.5;
  const starRadius = 3.5 + twinkle * 2.0 + beatKick + mid * 2.5;
  
  ctx.save();
  
  if (glowStyle === 'soft starlight') {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, starRadius * 5.5);
    g.addColorStop(0, `hsla(${n.hue}, 95%, 85%, 0.95)`);
    g.addColorStop(0.3, `hsla(${n.hue}, 90%, 65%, ${0.45 + bass * 0.3})`);
    g.addColorStop(1, `hsla(${n.hue}, 90%, 50%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x, n.y, starRadius * 5.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (glowStyle === 'aurora haze') {
    ctx.globalCompositeOperation = 'screen';
    const hazeRad = starRadius * (7.0 + bass * 4.0);
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, hazeRad);
    g.addColorStop(0, `hsla(${n.hue}, 100%, 90%, 0.8)`);
    g.addColorStop(0.4, `hsla(${(n.hue + 35) % 360}, 85%, 60%, 0.35)`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x, n.y, hazeRad, 0, Math.PI * 2);
    ctx.fill();
  } else if (glowStyle === 'crystal flare') {
    // 4-pointed radiant flare spikes
    ctx.strokeStyle = `hsla(${n.hue}, 95%, 88%, ${0.7 + room.state.pulse * 0.3})`;
    ctx.lineWidth = 1.2;
    const spike = starRadius * (4.0 + treble * 3.5);
    ctx.beginPath();
    ctx.moveTo(n.x - spike, n.y);
    ctx.lineTo(n.x + spike, n.y);
    ctx.moveTo(n.x, n.y - spike);
    ctx.lineTo(n.x, n.y + spike);
    ctx.stroke();
    
    // Diagonal faint sub-spikes
    ctx.lineWidth = 0.6;
    const subSpike = spike * 0.45;
    ctx.beginPath();
    ctx.moveTo(n.x - subSpike, n.y - subSpike);
    ctx.lineTo(n.x + subSpike, n.y + subSpike);
    ctx.moveTo(n.x - subSpike, n.y + subSpike);
    ctx.lineTo(n.x + subSpike, n.y - subSpike);
    ctx.stroke();
  }
  
  // Brilliant star core
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(n.x, n.y, starRadius * 0.7, 0, Math.PI * 2);
  ctx.fill();
  
  // Chromatic rim
  ctx.fillStyle = `hsl(${n.hue}, 90%, 65%)`;
  ctx.beginPath();
  ctx.arc(n.x, n.y, starRadius * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore();
}

ctx.restore();