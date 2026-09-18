const dt = Math.min(frame.dt, 0.1);

room.state.shells ??= [];
room.state.embers ??= [];

const skies = {
  "Midnight Blue": [0, 10, 30],
  "Deep Purple": [20, 0, 30],
  "Pitch Black": [0, 0, 0],
  "Sunset Glow": [40, 20, 10]
};
const skyName = getVar('sky_palette');
const sky = skies[skyName] || skies["Midnight Blue"];

ctx.fillStyle = `rgba(${sky[0]}, ${sky[1]}, ${sky[2]}, 0.25)`;
ctx.fillRect(0, 0, frame.width, frame.height);

if (audio.bass > 0.85 && room.state.embers.length > 0) {
  ctx.fillStyle = `rgba(255, 255, 255, ${(audio.bass - 0.8) * 0.4})`;
  ctx.fillRect(0, 0, frame.width, frame.height);
}

ctx.globalCompositeOperation = "lighter";

const windAccel = (getVar('wind_speed') ?? 0) * frame.width * 0.05;
const emberLifeMult = (getVar('ember_life') ?? 5) / 5;
const style = getVar('shell_style') ?? "Peony";
const gravity = frame.height * 0.5;

for (const e of room.events) {
  if (e.name === 'launch' || e.name === 'finale') {
    const p = room.people?.find(x => x.id === e.participantId);
    const hue = p ? p.hue : Math.random() * 360;
    const count = e.name === 'finale' ? 15 : 1;

    for (let i = 0; i < count; i++) {
      room.state.shells.push({
        x: e.name === 'finale' ? frame.width * (0.1 + 0.8 * (i / (count - 1 || 1))) : frame.width * (0.2 + 0.6 * Math.random()),
        y: frame.height,
        vx: (Math.random() - 0.5) * frame.width * 0.1,
        vy: -frame.height * (0.6 + Math.random() * 0.45),
        hue: e.name === 'finale' ? (hue + i * (360 / count)) % 360 : hue,
        style: style,
        age: 0,
        fuse: 1.0 + Math.random() * 1.5
      });
    }
  }
}

if (room.state.shells.length === 0 && room.state.embers.length < 50 && audio.beat) {
  room.state.shells.push({
    x: frame.width * (0.2 + 0.6 * Math.random()),
    y: frame.height,
    vx: (Math.random() - 0.5) * frame.width * 0.1,
    vy: -frame.height * (0.6 + Math.random() * 0.4),
    hue: Math.random() * 360,
    style: style,
    age: 0,
    fuse: 1.0 + Math.random()
  });
}

for (let i = room.state.shells.length - 1; i >= 0; i--) {
  const s = room.state.shells[i];
  s.age += dt;
  s.vx += windAccel * 0.1 * dt;
  s.vy += gravity * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;

  ctx.fillStyle = `hsl(${s.hue}, 100%, 70%)`;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
  ctx.fill();

  if (s.vy >= 0 || s.age > s.fuse) {
    const emberCount = s.style === 'Willow' ? 45 : s.style === 'Crossette' ? 24 : 70;
    for (let j = 0; j < emberCount; j++) {
      let speed, angle;
      if (s.style === 'Peony') {
        speed = frame.height * (0.1 + Math.random() * 0.2);
        angle = Math.random() * Math.PI * 2;
      } else if (s.style === 'Willow') {
        speed = frame.height * (0.05 + Math.random() * 0.12);
        angle = Math.random() * Math.PI * 2;
      } else {
        speed = frame.height * (0.15 + Math.random() * 0.1);
        angle = (Math.PI * 2 / emberCount) * j;
      }

      room.state.embers.push({
        x: s.x,
        y: s.y,
        vx: Math.cos(angle) * speed + s.vx * 0.4,
        vy: Math.sin(angle) * speed + s.vy * 0.4,
        hue: s.hue + (Math.random() - 0.5) * 30,
        life: (0.8 + Math.random() * 1.5) * emberLifeMult * (s.style === 'Willow' ? 1.5 : 1.0),
        age: 0,
        style: s.style
      });
    }
    room.state.shells.splice(i, 1);
  }
}

const tremble = audio.level * 30;
for (let i = room.state.embers.length - 1; i >= 0; i--) {
  const e = room.state.embers[i];
  e.age += dt;

  if (e.age > e.life) {
    room.state.embers.splice(i, 1);
    continue;
  }

  const drag = e.style === 'Willow' ? 0.94 : 0.97;
  e.vx *= Math.pow(drag, dt * 60);
  e.vy *= Math.pow(drag, dt * 60);

  e.vx += windAccel * dt;
  const eGrav = e.style === 'Willow' ? gravity * 0.3 : gravity * 0.8;
  e.vy += eGrav * dt;

  e.x += e.vx * dt + (Math.random() - 0.5) * tremble;
  e.y += e.vy * dt + (Math.random() - 0.5) * tremble;

  const p = e.age / e.life;
  const alpha = Math.max(0, 1.0 - p);
  const l = 50 + (audio.treble * 30) + (Math.random() * 20 * (1 - p));

  ctx.fillStyle = `hsla(${e.hue}, 100%, ${l}%, ${alpha})`;
  ctx.beginPath();
  const size = (e.style === 'Crossette' ? 3 : 2) * (1 - p * 0.3);
  ctx.arc(e.x, e.y, size, 0, Math.PI * 2);
  ctx.fill();
}

if (room.state.embers.length > 800) {
  room.state.embers.splice(0, room.state.embers.length - 800);
}

// Curation fix: 'lighter' was never switched back off, so the NEXT frame's sky
// wash ran additively and the wall saturated to solid cyan. The runtime now
// resets this between frames too, but a curated piece shouldn't rely on that.
ctx.globalCompositeOperation = 'source-over';
