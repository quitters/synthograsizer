// Reference piece for room images, hand-written: each image drifts round the
// wall as a sprite over a ground tinted by the images' own colours. It shows
// the patterns an image piece needs -- work with none, draw by each image's
// own shape, sample pixels once per image id from its thumb, and forget
// images that have gone -- and it is what the wall is checked with by hand.
const S = room.state;
const images = room.images || [];
const W = frame.width, H = frame.height;
S.sprites ??= new Map();   // image id -> its motion
S.tints ??= new Map();     // image id -> average colour, sampled once from its thumb

const live = new Set(images.map((img) => img.id));
for (const id of S.sprites.keys()) if (!live.has(id)) S.sprites.delete(id);
for (const id of S.tints.keys()) if (!live.has(id)) S.tints.delete(id);

let r = 12, g = 14, b = 22;
if (images.length) {
  r = g = b = 0;
  for (const img of images) {
    let tint = S.tints.get(img.id);
    if (!tint) {
      const sampler = new OffscreenCanvas(8, 8).getContext('2d');
      sampler.drawImage(img.thumb, 0, 0, 8, 8);
      const px = sampler.getImageData(0, 0, 8, 8).data;
      let tr = 0, tg = 0, tb = 0;
      for (let i = 0; i < px.length; i += 4) { tr += px[i]; tg += px[i + 1]; tb += px[i + 2]; }
      tint = [tr / 64, tg / 64, tb / 64];
      S.tints.set(img.id, tint);
    }
    r += tint[0]; g += tint[1]; b += tint[2];
  }
  const dim = 0.22 / images.length;
  r *= dim; g *= dim; b *= dim;
}
ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
ctx.fillRect(0, 0, W, H);

if (!images.length) {
  // Nothing to show yet: slow rings, so the wall is never blank.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, (frame.t * 40 + i * 90) % 540 + 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  return;
}

const size = Math.min(W, H) * (getVar('size') ?? 0.4);
const speed = getVar('speed') ?? 1;
images.forEach((img, k) => {
  let s = S.sprites.get(img.id);
  if (!s) {
    const a = k * 2.399;   // golden angle: spread the sprites out
    s = { x: W * (0.5 + 0.3 * Math.cos(a)), y: H * (0.5 + 0.3 * Math.sin(a)),
          vx: Math.cos(a + 1) * 70, vy: Math.sin(a + 1) * 70, spin: k % 2 ? 0.23 : -0.19 };
    S.sprites.set(img.id, s);
  }
  s.x += s.vx * frame.dt * speed;
  s.y += s.vy * frame.dt * speed;
  if (s.x < 0 || s.x > W) { s.vx = -s.vx; s.x = Math.min(W, Math.max(0, s.x)); }
  if (s.y < 0 || s.y > H) { s.vy = -s.vy; s.y = Math.min(H, Math.max(0, s.y)); }
  const fit = size / Math.max(img.width, img.height) * (1 + audio.bass * 0.15);
  const w = img.width * fit, h = img.height * fit;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(Math.sin(frame.t * s.spin) * 0.3);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 24;
  ctx.drawImage(img.bitmap, -w / 2, -h / 2, w, h);
  ctx.restore();
});
