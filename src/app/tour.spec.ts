import {emptyStats, Stats} from './stats.service';
import {tourDone, tourItems} from './tour';

describe('tourItems', () => {
  const day = (date: string, done = false) => ({date, value: 10, sides: 20 as const, mode: 'normal' as const, quest: {id: 'one-email', done}});
  const stats = (patch: Partial<Stats>): Stats => ({...emptyStats(), ...patch});

  it('starts with nothing done', () => {
    const items = tourItems(emptyStats(), true)!;
    expect(items.map(i => i.step)).toEqual(['roll', 'quest', 'return']);
    expect(tourDone(items)).toBe(0);
  });

  it('ticks steps from what has been done, in any order', () => {
    expect(tourDone(tourItems(stats({days: [day('2026-10-10')]}), true)!)).toBe(1);
    expect(tourDone(tourItems(stats({days: [day('2026-10-10', true)]}), true)!)).toBe(2);
    // Two days rolled counts as coming back, even with a gap.
    expect(tourItems(stats({days: [day('2026-10-14'), day('2026-10-10')]}), true)!.map(i => i.done)).toEqual([true, false, true]);
  });

  it('uses the stats step when quests are off', () => {
    const items = tourItems(stats({tour: {finished: false, sawStats: true}}), false)!;
    expect(items.map(i => i.step)).toEqual(['roll', 'stats', 'return']);
    expect(items[1].done).toBe(true);
  });

  it('is gone once finished', () => {
    expect(tourItems(stats({tour: {finished: true, sawStats: false}}), true)).toBeNull();
  });
});
