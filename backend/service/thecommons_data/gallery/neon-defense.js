room.state.enemies ??= [];
room.state.projectiles ??= [];
room.state.particles ??= [];
// Curation fix: keyed by table name, which participants choose. On a plain
// object a table called "constructor" collided with Object's own property and
// put garbage on the scoreboard; a prototype-less map has no such keys.
room.state.scores ??= Object.create(null);
room.state.baseHues ??= Object.create(null);
room.state.lastSpawn ??= 0;

const speedMult = getVar('enemy_speed') ?? 1.0;
const difficulty = getVar('difficulty') ?? 'Standard';
const shape = getVar('enemy_shape') ?? 'Crystals';
const fireMode = getVar('fire_mode') ?? 'Homing';

// Process events (Firing)
for (const e of room.events) {
  if (e.name === 'fire') {
    const p = (room.people || []).find(person => person.id === e.participantId);
    const hue = p ? p.hue : Math.floor(Math.random() * 360);
    const table = p ? p.table : (e.table || 'Guest');
    
    room.state.scores[table] ??= 0;
    room.state.baseHues[table] = hue;
    
    const knownTables = Object.keys(room.state.scores).sort();
    let tableIdx = knownTables.indexOf(table);
    if (tableIdx === -1) tableIdx = knownTables.length;
    const startX = frame.width * (tableIdx + 1) / (knownTables.length + 1 || 2);
    
    const spawnProj = (vx) => {
      room.state.projectiles.push({
        x: startX, y: frame.height - 40,
        vx: vx, vy: -600, hue, table,
        type: fireMode, active: true
      });
    };
    
    if (fireMode === 'Spread') {
      spawnProj(-150); spawnProj(0); spawnProj(150);
    } else {
      spawnProj(0);
    }
  }
}

// Spawning Enemies
const diffRates = { 'Calm': 1.5, 'Standard': 0.8, 'Swarm': 0.35, 'Onslaught': 0.15 };
let spawnRate = diffRates[difficulty] ?? 0.8;
if (audio.beat) spawnRate *= 0.5;

if (frame.t - room.state.lastSpawn > spawnRate && room.state.enemies.length < 150) {
  room.state.enemies.push({
    x: 50 + Math.random() * (frame.width - 100),
    y: -50,
    vx: (Math.random() - 0.5) * 100,
    vy: 40 + Math.random() * 100,
    hp: 1, maxHp: 1,
    id: Math.random(),
    rot: Math.random() * Math.PI,
    rotSpeed: (Math.random() - 0.5) * 5
  });
  room.state.lastSpawn = frame.t;
}

// Update Phase
let breached = false;
for (let i = room.state.enemies.length - 1; i >= 0; i--) {
  let e = room.state.enemies[i];
  e.x += e.vx * speedMult * frame.dt;
  e.y += (e.vy + audio.bass * 100) * speedMult * frame.dt;
  e.rot += e.rotSpeed * frame.dt;
  
  if (e.y > frame.height - 40) {
    breached = true;
    room.state.enemies.splice(i, 1);
  }
}

for (let i = room.state.projectiles.length - 1; i >= 0; i--) {
  let p = room.state.projectiles[i];
  if (p.type === 'Homing' && room.state.enemies.length > 0) {
    let target = room.state.enemies.reduce((closest, e) => {
      let dist = Math.hypot(e.x - p.x, e.y - p.y);
      return dist < closest.dist ? {e, dist} : closest;
    }, {e: null, dist: Infinity}).e;
    
    if (target) {
      let dx = target.x - p.x;
      let dy = target.y - p.y;
      let dist = Math.hypot(dx, dy);
      if (dist > 0) {
        p.vx = p.vx * 0.85 + (dx/dist) * 600 * 0.15;
        p.vy = p.vy * 0.85 + (dy/dist) * 600 * 0.15;
      }
    }
  }
  
  p.x += p.vx * frame.dt;
  p.y += p.vy * frame.dt;
  
  if (p.y < -50 || p.x < -50 || p.x > frame.width + 50) {
    room.state.projectiles.splice(i, 1);
    continue;
  }
  
  let hitIdx = room.state.enemies.findIndex(e => Math.hypot(e.x - p.x, e.y - p.y) < 25);
  if (hitIdx !== -1) {
    let e = room.state.enemies[hitIdx];
    room.state.scores[p.table] += 10;
    room.state.enemies.splice(hitIdx, 1);
    room.state.projectiles.splice(i, 1);
    
    for (let k = 0; k < 12; k++) {
      room.state.particles.push({
        x: e.x, y: e.y,
        vx: (Math.random() - 0.5) * 300,
        vy: (Math.random() - 0.5) * 300,
        life: 1.0, hue: p.hue
      });
    }
  }
}

for (let i = room.state.particles.length - 1; i >= 0; i--) {
  let pt = room.state.particles[i];
  pt.x += pt.vx * frame.dt;
  pt.y += pt.vy * frame.dt;
  pt.life -= frame.dt * 2;
  if (pt.life <= 0) room.state.particles.splice(i, 1);
}

// Bounds management
if (room.state.enemies.length > 200) room.state.enemies = room.state.enemies.slice(-200);
if (room.state.projectiles.length > 200) room.state.projectiles = room.state.projectiles.slice(-200);
if (room.state.particles.length > 300) room.state.particles = room.state.particles.slice(-300);

// Draw Phase
ctx.save();
ctx.fillStyle = 'rgba(10, 12, 20, 0.4)';
ctx.fillRect(0, 0, frame.width, frame.height);

if (breached) {
  ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
  ctx.fillRect(0, frame.height - 40, frame.width, 40);
}

// Defense Line & Turret Bases
ctx.strokeStyle = `rgba(0, 255, 255, ${0.2 + audio.bass * 0.5})`;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(0, frame.height - 40);
ctx.lineTo(frame.width, frame.height - 40);
ctx.stroke();

const knownTables = Object.keys(room.state.scores).sort();
ctx.textAlign = 'center';
ctx.font = 'bold 12px sans-serif';
knownTables.forEach((k, i) => {
  let x = frame.width * (i + 1) / (knownTables.length + 1);
  let hue = room.state.baseHues[k];
  
  ctx.fillStyle = `hsl(${hue}, 80%, 25%)`;
  ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
  ctx.beginPath();
  ctx.moveTo(x - 20, frame.height);
  ctx.lineTo(x - 10, frame.height - 30);
  ctx.lineTo(x + 10, frame.height - 30);
  ctx.lineTo(x + 20, frame.height);
  ctx.fill(); ctx.stroke();
  
  ctx.fillStyle = '#fff';
  ctx.fillText(k.substring(0, 8), x, frame.height - 10);
});

// Enemies
ctx.lineWidth = 2;
for (let e of room.state.enemies) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rot);
  let scale = 1 + audio.bass * 0.3;
  ctx.scale(scale, scale);
  
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = `rgba(255, 40, 80, 0.6)`;
  ctx.beginPath();
  
  if (shape === 'Crystals') {
    ctx.moveTo(0, -20); ctx.lineTo(12, 0); 
    ctx.lineTo(0, 20); ctx.lineTo(-12, 0);
  } else if (shape === 'Drones') {
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.moveTo(-18, -10); ctx.lineTo(-18, 10);
    ctx.moveTo(18, -10); ctx.lineTo(18, 10);
    ctx.moveTo(-18, 0); ctx.lineTo(-8, 0);
    ctx.moveTo(18, 0); ctx.lineTo(8, 0);
  } else { // Asteroids
    for (let j = 0; j < 7; j++) {
      let a = (j / 7) * Math.PI * 2;
      let r = 12 + Math.sin(e.id * 20 + j * 3) * 6;
      if (j === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Projectiles
ctx.globalCompositeOperation = 'lighter';
for (let p of room.state.projectiles) {
  ctx.fillStyle = `hsl(${p.hue}, 100%, 70%)`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = `hsla(${p.hue}, 100%, 50%, 0.6)`;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
  ctx.stroke();
}

// Particles
for (let pt of room.state.particles) {
  ctx.fillStyle = `hsla(${pt.hue}, 100%, 60%, ${pt.life})`;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.life * 5, 0, Math.PI * 2);
  ctx.fill();
}

// Scoreboard
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = '#fff';
ctx.font = 'bold 20px sans-serif';
ctx.textAlign = 'left';
ctx.fillText("SCOREBOARD", 20, 40);
let sortedTables = [...knownTables].sort((a, b) => room.state.scores[b] - room.state.scores[a]).slice(0, 10);
sortedTables.forEach((k, i) => {
  ctx.fillStyle = `hsl(${room.state.baseHues[k]}, 100%, 70%)`;
  ctx.fillText(`${k}: ${room.state.scores[k]}`, 20, 75 + i * 30);
});
ctx.restore();
