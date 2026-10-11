import {MESSAGES, Tier} from './motivation';
import {activeSeason, SEASONS, seasonKey} from './seasons';

const on = (month: number, day: number) => new Date(2026, month - 1, day, 12);

describe('activeSeason', () => {
  const cases: [number, number, string | null][] = [
    [9, 30, null], [10, 1, 'spooky'], [10, 31, 'spooky'], [11, 1, null],
    [11, 30, null], [12, 1, 'festive'], [12, 31, 'festive'], [1, 1, null],
    [2, 9, null], [2, 10, 'valentine'], [2, 14, 'valentine'], [2, 15, null],
    [3, 14, null], [3, 15, 'lucky'], [3, 17, 'lucky'], [3, 18, null],
  ];
  for (const [month, day, id] of cases) {
    it(`gives ${id ?? 'no season'} on ${month}/${day}`, () => {
      expect(activeSeason(on(month, day))?.id ?? null).toBe(id);
    });
  }

  it('counts the first and last minute of a season', () => {
    expect(activeSeason(new Date(2026, 9, 1, 0, 0))?.id).toBe('spooky');
    expect(activeSeason(new Date(2026, 9, 31, 23, 59))?.id).toBe('spooky');
  });
});

describe('seasonKey', () => {
  it('names the season and year, so a season turned off comes back next year', () => {
    const spooky = SEASONS[0];
    expect(seasonKey(spooky, on(10, 5))).toBe('spooky-2026');
    expect(seasonKey(spooky, new Date(2027, 9, 5))).toBe('spooky-2027');
  });
});

describe('SEASONS', () => {
  it('has a themed message for every tier', () => {
    for (const season of SEASONS) {
      expect(Object.keys(season.messages).sort()).toEqual(Object.keys(MESSAGES).sort());
      for (const tier of Object.keys(MESSAGES) as Tier[]) {
        expect(season.messages[tier].length).toBeGreaterThan(0);
      }
    }
  });

  it('dresses every corner', () => {
    for (const season of SEASONS) {
      expect([...new Set(season.doodles.map(d => d.corner))].sort()).toEqual(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
    }
  });

  it('draws the big snowflake with six identical arms', () => {
    const flake = SEASONS.find(s => s.id === 'festive')!.doodles[0].paths[0].d;
    const segments = flake.split('M').filter(Boolean);
    expect(segments.filter(s => s.startsWith('0 0 ')).length).toBe(6);
    // Each arm has two V branches.
    expect(segments.length).toBe(6 * 3);
  });
});
