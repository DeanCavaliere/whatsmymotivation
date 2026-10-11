import {calendarMonth, earliestMonth, shiftMonth} from './calendar';
import {DayRoll} from './stats.service';

const NOW = new Date(2026, 9, 10, 9);

function day(date: string, value: number, sides: DayRoll['sides'] = 20): DayRoll {
  return {date, value, sides, mode: 'normal'};
}

describe('calendarMonth', () => {
  it('lays out the month from Sunday, with each day\'s roll and tier', () => {
    const month = calendarMonth([day('2026-10-01', 13), day('2026-10-08', 1), day('2026-09-30', 20)], 2026, 9, NOW);
    // October 1, 2026 is a Thursday.
    expect(month.leading).toBe(4);
    expect(month.days.length).toBe(31);
    expect(month.days[0]).toEqual(expect.objectContaining({date: '2026-10-01', day: 1, tier: 'high'}));
    expect(month.days[7].tier).toBe('crit-fail');
    expect(month.days[1].roll).toBeNull();
  });

  it('marks today and the days after it', () => {
    const month = calendarMonth([], 2026, 9, NOW);
    expect(month.days.filter(d => d.isToday).map(d => d.day)).toEqual([10]);
    expect(month.days[9].isFuture).toBe(false);
    expect(month.days[10].isFuture).toBe(true);
  });

  it('sums up the month', () => {
    const month = calendarMonth([day('2026-10-01', 10), day('2026-10-02', 20), day('2026-10-03', 15)], 2026, 9, NOW);
    expect(month.rolled).toBe(3);
    expect(month.average).toBe(15);
    expect(month.averageSides).toBe(20);
    expect(month.crits).toBe(1);
  });

  it('leaves out the average when the month mixes dice', () => {
    const month = calendarMonth([day('2026-10-01', 10), day('2026-10-02', 6, 6)], 2026, 9, NOW);
    expect(month.average).toBeNull();
    expect(month.crits).toBe(1);
  });

  it('has no average for an empty month', () => {
    expect(calendarMonth([], 2026, 1, NOW).average).toBeNull();
    expect(calendarMonth([], 2026, 1, NOW).days.length).toBe(28);
  });
});

describe('earliestMonth', () => {
  it('finds the month of the oldest day', () => {
    expect(earliestMonth([day('2026-10-02', 3), day('2025-11-30', 4), day('2026-01-01', 5)], NOW)).toEqual({year: 2025, month: 10});
  });

  it('is this month with no days', () => {
    expect(earliestMonth([], NOW)).toEqual({year: 2026, month: 9});
  });
});

describe('shiftMonth', () => {
  it('crosses years', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({year: 2025, month: 11});
    expect(shiftMonth(2026, 11, 1)).toEqual({year: 2027, month: 0});
  });
});

