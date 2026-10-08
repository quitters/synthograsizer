/**
 * keepAwake(reason) — hold a screen wake lock while long work runs in this tab; returns a function that lets go.
 *
 * A laptop that sleeps in the middle of a Veo render or a long workflow cuts every request it was waiting on (on 2026-10-07 one slept
 * for about two hours and a batch died). The Screen Wake Lock API keeps the display, and so the machine, awake while the tab is open.
 * The browser drops the lock when the tab is hidden, so it is taken again when the tab comes back. Where the API is missing or refuses
 * (Firefox before 126, an insecure page, battery saver) this does nothing and the work proceeds as before. Never throws.
 */
export function keepAwake(reason = '') {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return () => {};
  let sentinel = null;
  let released = false;

  async function acquire() {
    try {
      sentinel = await navigator.wakeLock.request('screen');
      if (released) { sentinel.release().catch(() => {}); sentinel = null; }
    } catch (_) {
      sentinel = null;   // refused: carry on without it
    }
  }
  const onVisible = () => {
    if (!released && document.visibilityState === 'visible' && (!sentinel || sentinel.released)) acquire();
  };

  document.addEventListener('visibilitychange', onVisible);
  acquire();
  return () => {
    if (released) return;
    released = true;
    document.removeEventListener('visibilitychange', onVisible);
    if (sentinel) sentinel.release().catch(() => {});
    sentinel = null;
  };
}
