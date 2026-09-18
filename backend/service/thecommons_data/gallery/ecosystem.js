const dt = Math.min(frame.dt, 0.1);
room.state.creatures ??= [];
room.state.food ??= [];

const climates = {
  "Lush": { rate: 6, max: 300 },
  "Temperate": { rate: 3, max: 150 },
  "Harsh": { rate: 1, max: 80 },
  "Drought": { rate: 0.2, max: 30 }
};
const climateKey = getVar('climate') ?? 'Temperate';
const env = climates[climateKey] ?? climates.Temperate;
const metab = getVar('metabolism') ?? 2;
const mut = getVar('mutation') ?? 15;
const bScale = getVar('boid_scale') ?? 10;

for (const e of room.events) {
  if (e.name === 'spawn_creature') {
    const p = (room.people || []).find(x => x.id === e.participantId);
    const hue = p ? p.hue : Math.random() * 360;
    for(let i=0; i<3; i++) {
      room.state.creatures.push({
        x: (Math.random()*0.8 + 0.1) * frame.width,
        y: (Math.random()*0.8 + 0.1) * frame.height,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        energy: 120,
        hue: (hue + (Math.random()-0.5)*mut + 360) % 360
      });
    }
  }
  if (e.name === 'feed_burst') {
    // Curation fix: natural growth stops at the climate's ceiling, but this
    // bypassed it -- a room mashing Feed could pile up thousands of pellets.
    // A burst may now at most double the climate's ceiling.
    for(let i=0; i<25 && room.state.food.length < env.max * 2; i++) {
       room.state.food.push({
         x: Math.random() * frame.width,
         y: Math.random() * frame.height,
         energy: 25
       });
    }
  }
  if (e.name === 'extinction') {
    const survivors = Math.max(2, Math.floor(room.state.creatures.length * 0.1));
    room.state.creatures = room.state.creatures.slice(0, survivors);
  }
}

if (room.state.creatures.length === 0) {
  for(let i=0; i<6; i++) {
    room.state.creatures.push({
      x: frame.width/2 + (Math.random()-0.5)*100,
      y: frame.height/2 + (Math.random()-0.5)*100,
      vx: (Math.random()-0.5)*2,
      vy: (Math.random()-0.5)*2,
      energy: 150,
      hue: Math.random()*360
    });
  }
}

let growth = env.rate * dt * 60;
if (audio.beat) growth += 3;
while (growth > 1 || Math.random() < growth) {
  if (room.state.food.length < env.max) {
     room.state.food.push({
       x: Math.random() * frame.width,
       y: Math.random() * frame.height,
       energy: 20 + Math.random()*20
     });
  }
  growth -= 1;
}

ctx.save();
ctx.fillStyle = 'rgba(10, 15, 20, 0.3)';
ctx.fillRect(0, 0, frame.width, frame.height);

ctx.globalCompositeOperation = 'screen';
for (const f of room.state.food) {
  ctx.beginPath();
  ctx.arc(f.x, f.y, 2 + audio.bass*6, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(100, 255, 150, 0.7)';
  ctx.fill();
}
ctx.restore();

const maxSpeed = 3 + audio.level * 4;
const speedScale = 60 * dt;

for (let i = room.state.creatures.length - 1; i >= 0; i--) {
  const c = room.state.creatures[i];
  let nearest = null;
  let minDist = 60000;
  let fIdx = -1;

  for (let j = 0; j < room.state.food.length; j++) {
     const f = room.state.food[j];
     const dx = f.x - c.x;
     const dy = f.y - c.y;
     const distSq = dx*dx + dy*dy;
     if (distSq < minDist) {
       minDist = distSq;
       nearest = f;
       fIdx = j;
     }
  }

  if (nearest) {
     const dist = Math.sqrt(minDist);
     if (dist < bScale * 1.5) {
       c.energy = Math.min(200, c.energy + nearest.energy);
       room.state.food.splice(fIdx, 1);
     } else {
       c.vx += ((nearest.x - c.x) / dist) * 0.4;
       c.vy += ((nearest.y - c.y) / dist) * 0.4;
     }
  } else {
     c.vx += (Math.random()-0.5) * 0.5;
     c.vy += (Math.random()-0.5) * 0.5;
  }

  const spd = Math.hypot(c.vx, c.vy);
  if (spd > maxSpeed) {
     c.vx = (c.vx / spd) * maxSpeed;
     c.vy = (c.vy / spd) * maxSpeed;
  }
  c.x += c.vx * speedScale;
  c.y += c.vy * speedScale;

  if (c.x < 0) c.x += frame.width;
  if (c.x > frame.width) c.x -= frame.width;
  if (c.y < 0) c.y += frame.height;
  if (c.y > frame.height) c.y -= frame.height;

  c.energy -= metab * dt * 10;

  if (c.energy > 170 && room.state.creatures.length < 350) {
     c.energy -= 90;
     room.state.creatures.push({
       x: c.x, y: c.y,
       vx: -c.vx, vy: -c.vy,
       energy: 90,
       hue: (c.hue + (Math.random()-0.5)*mut + 360) % 360
     });
  }

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(Math.atan2(c.vy, c.vx));
  
  let alpha = 1;
  if (c.energy < 40) alpha = 0.3 + 0.7 * Math.abs(Math.sin(frame.t * 8));

  ctx.fillStyle = `hsla(${c.hue}, 80%, 60%, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(bScale, 0);
  ctx.lineTo(-bScale, bScale * 0.6);
  ctx.lineTo(-bScale * 0.5, 0);
  ctx.lineTo(-bScale, -bScale * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (c.energy <= 0) {
     room.state.creatures.splice(i, 1);
  }
}
