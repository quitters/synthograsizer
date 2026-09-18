// The one place that decides how native sketch code is compiled and what
// canvas state is reset between frames. The wall (display.js) and the desk's
// gallery previews (gallery.js) both run sketches; if their rules drifted, a
// piece could look right in its thumbnail and wrong on the wall.

export const NATIVE_PARAMS = ['ctx', 'frame', 'getVar', 'audio', 'room'];

export function compileNative(code) {
  return new Function(...NATIVE_PARAMS, code);
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
