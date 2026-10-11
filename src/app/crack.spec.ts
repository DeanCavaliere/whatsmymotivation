import {crackPaths, seededRandom} from './crack';

describe('crackPaths', () => {
  it('draws the same crack for the same day', () => {
    expect(crackPaths('2026-10-10', 500)).toEqual(crackPaths('2026-10-10', 500));
  });

  it('draws a different crack on a different day', () => {
    expect(crackPaths('2026-10-11', 500)).not.toEqual(crackPaths('2026-10-10', 500));
  });

  it('starts six arms at the origin, with thinner branches off them', () => {
    const paths = crackPaths('2026-10-10', 500);
    const arms = paths.filter(p => p.d.startsWith('M0.0 0.0 '));
    expect(arms.length).toBe(6);
    const thickest = Math.min(...arms.map(a => a.width));
    expect(paths.filter(p => !arms.includes(p)).every(p => p.width < thickest)).toBe(true);
  });

  it('keeps the arms within reach of the origin', () => {
    const points = crackPaths('2026-10-10', 500).flatMap(p => [...p.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(m => Math.hypot(+m[1], +m[2])));
    expect(Math.max(...points)).toBeLessThan(500 * 2.2);
  });
});

describe('seededRandom', () => {
  it('returns numbers in [0, 1)', () => {
    const random = seededRandom('x');
    for (let i = 0; i < 1000; i++) {
      const n = random();
      expect(n >= 0 && n < 1).toBe(true);
    }
  });
});
