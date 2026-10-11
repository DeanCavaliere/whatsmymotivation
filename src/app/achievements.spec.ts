import {BADGES, newBadges, RollContext} from './achievements';
import {emptyStats, Stats} from './stats.service';

function roll(value: number, extra: Partial<RollContext> = {}): RollContext {
  return {values: [value], value, sides: 20, mode: 'normal', isDayRoll: true, rerolledFrom: null, condition: 'clear', date: '2026-10-10', ...extra};
}

function stats(extra: Partial<Stats> = {}): Stats {
  return {...emptyStats(), lifetimeRolls: 5, counts: {20: new Array(20).fill(0).map((_, i) => i === 0 ? 5 : 0)}, ...extra};
}

const ids = (s: Stats, r: RollContext) => newBadges(s, r).map(b => b.id);

describe('badges', () => {
  it('have unique ids', () => {
    expect(new Set(BADGES.map(b => b.id)).size).toBe(BADGES.length);
  });

  it('give First roll on the first roll', () => {
    expect(ids(stats({lifetimeRolls: 1}), roll(10))).toContain('first-roll');
  });

  it('give Natural for the top face of any die, and Rock bottom for a 1', () => {
    expect(ids(stats(), roll(20))).toContain('natural');
    expect(ids(stats(), roll(6, {sides: 6}))).toContain('natural');
    expect(ids(stats(), roll(1))).toContain('rock-bottom');
    expect(ids(stats(), roll(19))).not.toContain('natural');
  });

  it('give Snake eyes and Double crit only when both dice match', () => {
    expect(ids(stats(), roll(1, {values: [1, 1], mode: 'disadvantage'}))).toContain('snake-eyes');
    expect(ids(stats(), roll(1, {values: [1, 7], mode: 'disadvantage'}))).not.toContain('snake-eyes');
    expect(ids(stats(), roll(20, {values: [20, 20], mode: 'advantage'}))).toContain('double-crit');
    expect(ids(stats(), roll(20, {values: [20, 3], mode: 'advantage'}))).not.toContain('double-crit');
  });

  it('give Collector once every die has been rolled', () => {
    const counts = {4: [1, 0, 0, 0], 6: [1, 0, 0, 0, 0, 0], 8: new Array(8).fill(1), 10: new Array(10).fill(1), 12: new Array(12).fill(1)};
    expect(ids(stats({counts}), roll(5))).not.toContain('collector');
    expect(ids(stats({counts: {...counts, 20: new Array(20).fill(1)}}), roll(5))).toContain('collector');
  });

  it('give streak badges at 7, 30 and 100 days, with progress', () => {
    const at = (current: number) => stats({streak: {current, best: current, lastDate: '2026-10-10'}});
    expect(ids(at(6), roll(10))).not.toContain('streak-7');
    expect(ids(at(30), roll(10))).toEqual(expect.arrayContaining(['streak-7', 'streak-30']));
    expect(BADGES.find(b => b.id === 'streak-100')!.progress!(at(42))).toEqual({current: 42, goal: 100, unit: 'days'});
  });

  it('give Comeback for the top face the day after a natural 1', () => {
    const days = [{date: '2026-10-10', value: 20, sides: 20 as const, mode: 'normal' as const},
      {date: '2026-10-09', value: 1, sides: 20 as const, mode: 'normal' as const}];
    expect(ids(stats({days}), roll(20))).toContain('comeback');
    expect(ids(stats({days}), roll(20, {isDayRoll: false}))).not.toContain('comeback');
    expect(ids(stats({days: [days[0]]}), roll(20))).not.toContain('comeback');
  });

  it('give Regular and Devoted at 100 and 1,000 rolls', () => {
    expect(ids(stats({lifetimeRolls: 99}), roll(10))).not.toContain('rolls-100');
    expect(ids(stats({lifetimeRolls: 1000}), roll(10))).toEqual(expect.arrayContaining(['rolls-100', 'rolls-1000']));
  });

  it('give Hoarder for holding three ✦ and Big spender for five rerolls', () => {
    expect(ids(stats({inspiration: {held: 3, earned: 2}}), roll(10))).toContain('hoarder');
    expect(ids(stats({inspiration: {held: 2, earned: 1}}), roll(10))).not.toContain('hoarder');
    expect(ids(stats({rerolls: {used: 5, better: 3, worse: 2}}), roll(10))).toContain('big-spender');
  });

  it('give Lucky reroll for rerolling a natural 1 into the top face', () => {
    expect(ids(stats(), roll(20, {rerolledFrom: 1}))).toContain('lucky-reroll');
    expect(ids(stats(), roll(20, {rerolledFrom: 2}))).not.toContain('lucky-reroll');
    expect(ids(stats(), roll(20))).not.toContain('lucky-reroll');
  });

  it('give Fogwalker for rolling on five foggy days', () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
    const days = dates.map(date => ({date, value: 10, sides: 20 as const, mode: 'normal' as const}));
    const foggy = (n: number) => Object.fromEntries(dates.slice(0, n).map(d => [d, 'foggy' as const]));
    expect(ids(stats({days, conditions: foggy(4)}), roll(10))).not.toContain('fogwalker');
    expect(ids(stats({days, conditions: foggy(5)}), roll(10))).toContain('fogwalker');
  });

  it('give Storm chaser for a natural top face as the day\'s roll in a storm', () => {
    expect(ids(stats(), roll(20, {condition: 'stormy'}))).toContain('storm-chaser');
    expect(ids(stats(), roll(20, {condition: 'stormy', isDayRoll: false}))).not.toContain('storm-chaser');
    expect(ids(stats(), roll(20, {condition: 'rainy'}))).not.toContain('storm-chaser');
  });

  it('give Blessed and cursed for both in one Sunday-to-Saturday week', () => {
    // 2026-10-04 is a Sunday.
    expect(ids(stats({conditions: {'2026-10-05': 'blessed', '2026-10-09': 'hexed'}}), roll(10))).toContain('blessed-and-cursed');
    expect(ids(stats({conditions: {'2026-10-03': 'blessed', '2026-10-09': 'hexed'}}), roll(10))).not.toContain('blessed-and-cursed');
  });

  it('give Questmaster and Chronicler for 10 finished quests and 10 notes, even without a roll', () => {
    const days = Array.from({length: 10}, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`, value: 10, sides: 20 as const, mode: 'normal' as const,
      quest: {id: 'walk', done: true}, note: 'Done',
    }));
    expect(newBadges(stats({days}), null).map(b => b.id)).toEqual(expect.arrayContaining(['questmaster', 'chronicler']));
    expect(newBadges(stats({days: days.slice(1)}), null).map(b => b.id)).not.toContain('questmaster');
  });

  it('give no roll badges when there is no roll', () => {
    // First roll only counts rolls, and these stats have some.
    expect(newBadges(stats(), null).map(b => b.id)).toEqual(['first-roll']);
  });

  it('are only new once', () => {
    expect(ids(stats({achievements: {'natural': '2026-10-01'}}), roll(20))).not.toContain('natural');
  });
});
