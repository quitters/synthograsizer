// STARFIELD -- the hello-world of 90s demo coding: a sea of dots rushing
// past, behind nearly every crack intro. Hyperspace is shared -- anyone in the
// room can punch it, and the streaks take the colour of whoever did.
const S = room.state;
const W = frame.width, H = frame.height;
const count = Math.round(getVar('star_count') ?? 600);
const warp = getVar('warp_speed') ?? 1.2;
const flight = getVar('flight') ?? 'forward warp';
const tint = getVar('star_color') ?? 'white';
const dt = Math.min(frame.dt, 0.05);

function spawn(s, far) {
  s.x = Math.random() * 2 - 1;
  s.y = Math.random() * 2 - 1;
  s.z = far ? 1 : 0.05 + Math.random() * 0.95;
  s.hue = Math.random() * 360;
  s.slot = (Math.random() * 3) | 0;
  s.lx = null;
  return s;
}
S.stars ??= [];
while (S.stars.length < count) S.stars.push(spawn({}, false));
if (S.stars.length > count) S.stars.length = count;

S.boost ??= 0;
S.boostHue ??= 200;
for (const e of room.events) {
  if (e.name !== 'hyperspace') continue;
  S.boost = Math.min(S.boost + 1.5, 4);
  const who = room.people.find((p) => p.id === e.participantId);
  if (who) S.boostHue = who.hue;
}
S.boost = Math.max(0, S.boost - dt * 0.8);
const boosting = S.boost > 0.05;
const v = (warp * (1 + audio.bass * 0.7) + S.boost * 2.5) * dt;

// Trails while in hyperspace, a clean black sky otherwise.
ctx.fillStyle = boosting ? 'rgba(0, 0, 10, 0.22)' : '#00000a';
ctx.fillRect(0, 0, W, H);

const cx = W / 2, cy = H / 2, scale = Math.max(W, H) * 0.5;
const spin = flight === 'spiral dive' ? frame.t * 0.3 : 0;
const CGA = ['#55ffff', '#ff55ff', '#ffffff'];
const buckets = new Map();
const streaks = [];

for (const s of S.stars) {
  let x, y, depth;
  if (flight === 'side scroll') {
    // Horizontal parallax: nearer layers move faster.
    s.x += v * (1.6 - s.z) * 0.6;
    if (s.x > 1) { s.x -= 2; s.y = Math.random() * 2 - 1; s.lx = null; }
    x = (s.x + 1) / 2 * W;
    y = (s.y + 1) / 2 * H;
    depth = 1 - s.z;
  } else {
    s.z -= v * 0.5;
    if (s.z <= 0.02) spawn(s, true);
    let sx = s.x, sy = s.y;
    if (spin) {
      const a = spin + s.z * 2, c = Math.cos(a), n = Math.sin(a);
      const rx = sx * c - sy * n;
      sy = sx * n + sy * c;
      sx = rx;
    }
    x = cx + sx / s.z * scale * 0.5;
    y = cy + sy / s.z * scale * 0.5;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) { spawn(s, true); continue; }
    depth = 1 - s.z;
  }
  if (boosting && s.lx !== null) streaks.push(s.lx, s.ly, x, y);
  s.lx = x; s.ly = y;

  // Bucket stars by colour so the fill style changes a few times a frame, not thousands.
  const level = Math.min(5, (depth * 6) | 0);
  let key;
  if (tint === 'amber monitor') key = `hsl(38, 100%, ${22 + level * 8}%)`;
  else if (tint === 'cga cyan') key = CGA[s.slot];
  else if (tint === 'rainbow') key = `hsl(${((s.hue + frame.t * 40) / 30 | 0) * 30 % 360}, 90%, ${35 + level * 6}%)`;
  else { const g = 90 + level * 33; key = `rgb(${g}, ${g}, ${g})`; }
  const size = flight === 'side scroll' ? 1 + depth * 2.5 : 0.6 + depth * 3;
  let list = buckets.get(key);
  if (!list) buckets.set(key, list = []);
  list.push(x - size / 2, y - size / 2, size);
}

if (streaks.length) {
  ctx.save();
  ctx.strokeStyle = `hsla(${S.boostHue}, 90%, 70%, ${Math.min(1, S.boost / 2)})`;
  ctx.lineWidth = Math.max(1, Math.min(W, H) / 400);
  ctx.beginPath();
  for (let i = 0; i < streaks.length; i += 4) {
    ctx.moveTo(streaks[i], streaks[i + 1]);
    ctx.lineTo(streaks[i + 2], streaks[i + 3]);
  }
  ctx.stroke();
  ctx.restore();
}
for (const [colour, list] of buckets) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let i = 0; i < list.length; i += 3) ctx.rect(list[i], list[i + 1], list[i + 2], list[i + 2]);
  ctx.fill();
}
