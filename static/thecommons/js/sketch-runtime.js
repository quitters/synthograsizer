// The one place that decides how native sketch code is compiled, how much time
// a frame may report, and what canvas state is reset between frames. The wall
// (display.js) and the desk's gallery previews (gallery.js) both run sketches;
// if their rules drifted, a piece could look right in its thumbnail and wrong
// on the wall.

export const NATIVE_PARAMS = ['ctx', 'frame', 'getVar', 'audio', 'room'];

export function compileNative(code) {
  return new Function(...NATIVE_PARAMS, code);
}

// The most time one frame may report as frame.dt, in seconds. rAF stops in a
// backgrounded tab, so the first frame back can come tens of seconds after the
// last; a simulation integrating that in one step explodes, or goes NaN. Below
// 10 fps a piece slows down instead.
export const MAX_FRAME_DT = 0.1;

export function clampFrameDt(seconds) {
  if (!(seconds > 0)) return 0;   // negative and NaN both fail this
  return Math.min(seconds, MAX_FRAME_DT);
}

// The wall's clock, fed rAF timestamps; `origin` is the performance.now()
// reading frame.t counts from. A rAF timestamp is when the frame began, so the
// first one can be EARLIER than an origin read just before requesting it: the
// first frame got a negative t and dt, and a generated piece that grew a radius
// by dt threw "The radius provided is negative". So t never goes below zero or
// backwards, the first frame reports one 60 fps frame, and every dt is clamped.
// t itself is not clamped -- it stays wall time, as event.t is.
export function frameClock(origin) {
  let last = null, t = 0;
  return (now) => {
    const dt = last === null ? 1 / 60 : clampFrameDt((now - last) / 1000);
    last = now;
    const elapsed = (now - origin) / 1000;
    if (elapsed > t) t = elapsed;
    return { t, dt };
  };
}

// The context OUTLIVES the frame, so anything a sketch leaves set silently
// applies to the next frame's first draw -- including its own background. One
// live-generated piece left 'lighter' compositing on and turned its whole wall
// solid cyan; nothing about that code was invalid, so no validator could have
// caught it. It was 1 of 9 pieces measured, so this is rare -- but resetting is
// cheap, and one bad piece blanks a room's wall. imageSmoothingEnabled and
// shadows joined the list with the gallery: chunky-pixel pieces turn smoothing
// off, and a leaked shadowBlur is both wrong-looking and very expensive.
export function resetContext(ctx) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.setLineDash([]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
}
