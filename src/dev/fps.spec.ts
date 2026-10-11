import {SLOW_FPS, startFpsMeter} from './fps';

describe('startFpsMeter', () => {
  /** Runs the meter on a fake clock, one frame every `gap` ms. */
  function run(gaps: number[]) {
    const el = document.createElement('span');
    const queued: {next?: FrameRequestCallback} = {};
    const stop = startFpsMeter(el, cb => { queued.next = cb; return 1; }, () => queued.next = undefined);
    let now = 1000;
    for (const gap of gaps) {
      now += gap;
      queued.next?.(now);
    }
    return {el, stop, frame: () => queued.next?.(now += 16)};
  }

  it('reads 60 fps at a steady 60 Hz', () => {
    expect(run(Array(40).fill(1000 / 60)).el.textContent).toBe('60 fps');
  });

  it('flags a slow frame rate', () => {
    const {el} = run(Array(20).fill(50));
    expect(el.textContent).toBe('20 fps');
    expect(SLOW_FPS).toBeGreaterThan(20);
    expect(el.classList).toContain('is-slow');
  });

  it('ignores the gap while the tab was hidden', () => {
    const {el} = run([...Array(40).fill(1000 / 60), 10_000, ...Array(20).fill(1000 / 60)]);
    expect(el.textContent).toBe('60 fps');
    expect(el.classList).not.toContain('is-slow');
  });

  it('stops', () => {
    const {el, stop, frame} = run(Array(40).fill(1000 / 60));
    stop();
    el.textContent = '';
    frame();
    expect(el.textContent).toBe('');
  });
});
