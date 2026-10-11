import {conditionChance, conditionWeights, DayCondition, MONTHLY_TARGET, pruneConditions, rollCondition} from './conditions';
import {seededRandom} from './crack';
import {addDays} from './stats.service';

describe('rollCondition', () => {
  /** Plays every day for `days` days and returns the history. */
  function simulate(days: number, seed: string): [string, DayCondition][] {
    const random = seededRandom(seed);
    const history: Record<string, DayCondition> = {};
    let date = '2026-01-01';
    for (let i = 0; i < days; i++) {
      history[date] = rollCondition(history, date, random);
      date = addDays(date, 1);
    }
    return Object.entries(history);
  }

  const days = simulate(10_000, 'simulation');

  it('averages about MONTHLY_TARGET conditions a month', () => {
    const months = new Map<string, number>();
    for (const [date, c] of days) {
      months.set(date.slice(0, 7), (months.get(date.slice(0, 7)) ?? 0) + (c === 'clear' ? 0 : 1));
    }
    const counts = [...months.values()];
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(Math.abs(mean - MONTHLY_TARGET)).toBeLessThan(0.6);
    // The rubber band keeps months from running far off target.
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts)).toBeLessThanOrEqual(14);
  });

  it('makes a clear day the likeliest thing after a condition, and a repeat rare', () => {
    let afterCondition = 0;
    let conditionAgain = 0;
    let sameAgain = 0;
    let afterClear = 0;
    let conditionAfterClear = 0;
    for (let i = 1; i < days.length; i++) {
      const [prev, now] = [days[i - 1][1], days[i][1]];
      if (prev === 'clear') {
        afterClear++;
        conditionAfterClear += now === 'clear' ? 0 : 1;
      } else {
        afterCondition++;
        conditionAgain += now === 'clear' ? 0 : 1;
        sameAgain += now === prev ? 1 : 0;
      }
    }
    expect(conditionAgain / afterCondition).toBeLessThan(conditionAfterClear / afterClear);
    expect(conditionAgain / afterCondition).toBeLessThan(0.5);
    expect(sameAgain / afterCondition).toBeLessThan(0.03);
  });

  it('gives each condition a share in line with its weight', () => {
    const tally = (id: DayCondition) => days.filter(([, c]) => c === id).length;
    expect(tally('foggy')).toBeGreaterThan(tally('blessed') * 2);
    expect(tally('blessed')).toBeGreaterThan(0);
    expect(tally('hexed')).toBeGreaterThan(0);
  });

  it('only snows in December to February, and only rains outside it', () => {
    for (const [date, c] of days) {
      const winter = [12, 1, 2].includes(Number(date.slice(5, 7)));
      if (c === 'snowy') expect(winter).toBe(true);
      if (c === 'rainy') expect(winter).toBe(false);
    }
  });

  it('is clear when the first random number misses the chance', () => {
    expect(rollCondition({}, '2026-10-10', () => 0.99)).toBe('clear');
    expect(rollCondition({}, '2026-10-10', () => 0)).not.toBe('clear');
  });
});

describe('conditionChance', () => {
  const base = MONTHLY_TARGET / 31;

  it('starts at the target spread over the month', () => {
    expect(conditionChance({}, '2026-10-01')).toBeCloseTo(base);
  });

  it('rises when the month is behind and falls when it is ahead', () => {
    const clearWeek = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(d => [`2026-10-0${d}`, 'clear' as DayCondition]));
    expect(conditionChance(clearWeek, '2026-10-10')).toBeGreaterThan(base * 1.3);
    const busyWeek = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(d => [`2026-10-0${d}`, (d % 2 ? 'foggy' : 'stormy') as DayCondition]));
    expect(conditionChance(busyWeek, '2026-10-10')).toBeCloseTo(base * 0.25);
  });

  it('drops the day after a condition, and a gap resets it', () => {
    // On the 1st, last month's days don't count toward the rubber band, so only the cooldown differs.
    expect(conditionChance({'2026-09-30': 'foggy'}, '2026-10-01')).toBeCloseTo(base * 0.6);
    expect(conditionChance({'2026-09-29': 'foggy'}, '2026-10-01')).toBeCloseTo(base);
  });
});

describe('conditionWeights', () => {
  it('makes yesterday\'s condition much rarer today', () => {
    const weights = new Map(conditionWeights({'2026-10-09': 'blessed'}, '2026-10-10'));
    expect(weights.get('blessed')).toBeCloseTo(0.1);
    expect(weights.get('hexed')).toBe(1);
  });

  it('treats snow after rain as the same weather', () => {
    const weights = new Map(conditionWeights({'2026-11-30': 'rainy'}, '2026-12-01'));
    expect(weights.has('rainy')).toBe(false);
    expect(weights.get('snowy')).toBeCloseTo(0.3);
  });
});

describe('pruneConditions', () => {
  it('drops days older than the limit', () => {
    expect(pruneConditions({'2025-01-01': 'foggy', '2026-10-01': 'clear'}, '2026-10-10', 400)).toEqual({'2026-10-01': 'clear'});
  });
});
