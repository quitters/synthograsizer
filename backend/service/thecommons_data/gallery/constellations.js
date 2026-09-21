const speed = getVar('drift_speed') ?? 1;
const maxDist = getVar('connection_radius') ?? 150;
const sScale = getVar('star_scale') ?? 1.5;
const gravity = getVar('social_gravity') ?? 0.5;
const lineStyle = getVar('line_style') || 'delicate web';
const bgStyle = getVar('nebula_bg') || 'dark matter';

room.state.stars ??= {};
let people = room.people || [];

if (people.length === 0) {
  room.state.mockPeople ??= Array.from({length: 35}, (_, i) => ({
    id: 'mock_' + i,
    hue: (i * 137.5) % 360
  }));
  people = room.state.mockPeople;
}

const currentIds = new Set(people.map(p => String(p.id)));
for (const id in room.state.stars) {
  if (!currentIds.has(id)) delete room.state.stars[id];
}

const activeStars = [];
const cx = frame.width / 2;
const cy = frame.height / 2;
const dtBase = frame.dt * 60;

for (const p of people) {
  const id = String(p.id);
  if (!room.state.stars[id]) {
    room.state.stars[id] = {
      x: Math.random() * frame.width,
      y: Math.random() * frame.height,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      flash: 0
    };
  }
  
  const s = room.state.stars[id];
  
  s.vx += (Math.random() - 0.5) * 0.2 * dtBase;
  s.vy += (Math.random() - 0.5) * 0.2 * dtBase;
  
  if (gravity !== 0) {
    const dx = cx - s.x;
    const dy = cy - s.y;
    const dist = Math.hypot(dx, dy) || 1;
    s.vx += (dx / dist) * gravity * 0.05 * dtBase;
    s.vy += (dy / dist) * gravity * 0.05 * dtBase;
  }
  
  const margin = Math.max(100, maxDist * 0.5);
  if (s.x < margin) s.vx += 0.1 * dtBase;
  if (s.x > frame.width - margin) s.vx -= 0.1 * dtBase;
  if (s.y < margin) s.vy += 0.1 * dtBase;
  if (s.y > frame.height - margin) s.vy -= 0.1 * dtBase;
  
  const currentSpeed = Math.hypot(s.vx, s.vy) || 1;
  const targetSpeed = speed * (1 + audio.mid * 2);
  s.vx = (s.vx / currentSpeed) * targetSpeed;
  s.vy = (s.vy / currentSpeed) * targetSpeed;
  
  s.x += s.vx * dtBase;
  s.y += s.vy * dtBase;
  
  if (audio.beat) s.flash = 1;
  if (s.flash > 0) s.flash -= frame.dt * 1.5;
  if (s.flash < 0) s.flash = 0;
  
  activeStars.push({ ...s, hue: p.hue });
}

ctx.save();
if (bgStyle === 'deep trails') {
  ctx.fillStyle = `rgba(0, 0, 0, ${0.15 - audio.bass * 0.05})`;
  ctx.fillRect(0, 0, frame.width, frame.height);
} else {
  const bgs = {
    'dark matter': '#020204',
    'purple haze': '#0a0312',
    'midnight blue': '#020814'
  };
  ctx.fillStyle = bgs[bgStyle] || '#020204';
  ctx.fillRect(0, 0, frame.width, frame.height);
}
ctx.restore();

const maxDistSq = maxDist * maxDist;
ctx.lineCap = 'round';

for (let i = 0; i < activeStars.length; i++) {
  for (let j = i + 1; j < activeStars.length; j++) {
    const s1 = activeStars[i];
    const s2 = activeStars[j];
    const dx = s1.x - s2.x;
    const dy = s1.y - s2.y;
    const distSq = dx * dx + dy * dy;
    
    if (distSq < maxDistSq) {
      const dist = Math.sqrt(distSq);
      const baseAlpha = 1 - (dist / maxDist);
      const alpha = baseAlpha * (0.3 + audio.treble * 0.5 + audio.bass * 0.2);
      
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      
      if (lineStyle === 'laser links') {
        const grad = ctx.createLinearGradient(s1.x, s1.y, s2.x, s2.y);
        grad.addColorStop(0, `hsla(${s1.hue}, 80%, 60%, ${alpha})`);
        grad.addColorStop(1, `hsla(${s2.hue}, 80%, 60%, ${alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1 + audio.bass * 4;
        ctx.setLineDash([]);
      } else if (lineStyle === 'stardust trails') {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
        ctx.lineWidth = 1 + audio.mid * 2;
        ctx.setLineDash([2, 5]);
      } else {
        ctx.strokeStyle = `rgba(200, 220, 255, ${alpha * 0.6})`;
        ctx.lineWidth = 0.5 + audio.treble;
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }
  }
}

ctx.setLineDash([]);
for (const star of activeStars) {
  const flashPulse = star.flash * 2;
  const r = sScale * (1.5 + audio.bass * 1.5 + flashPulse);
  
  ctx.beginPath();
  ctx.arc(star.x, star.y, r * 3, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${star.hue}, 90%, 60%, ${0.15 + star.flash * 0.2})`;
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(star.x, star.y, r, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${star.hue}, 80%, ${60 + star.flash * 40}%)`;
  ctx.fill();
}
