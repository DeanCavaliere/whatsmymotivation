/** How often the reading updates, in milliseconds. */
const WINDOW = 500;

/** Below this, the reading is flagged, since the table's animations start to visibly stutter. */
export const SLOW_FPS = 50;

/**
 * Shows the frame rate in `el`, updated twice a second. Call from outside the Angular zone, or every
 * frame runs change detection. Returns a function that stops it.
 */
export function startFpsMeter(el: HTMLElement,
                              raf: (cb: FrameRequestCallback) => number = requestAnimationFrame,
                              cancel: (id: number) => void = cancelAnimationFrame): () => void {
  let start = -1;
  let frames = 0;
  let id = 0;
  const tick = (now: number) => {
    if (start < 0 || now - start > WINDOW * 4) {
      // First frame, or back from a hidden tab: start a fresh window rather than report the gap.
      start = now;
      frames = 0;
    } else {
      frames++;
      if (now - start >= WINDOW) {
        const fps = Math.round(frames * 1000 / (now - start));
        el.textContent = `${fps} fps`;
        el.classList.toggle('is-slow', fps < SLOW_FPS);
        start = now;
        frames = 0;
      }
    }
    id = raf(tick);
  };
  id = raf(tick);
  return () => cancel(id);
}
