import {
  activeStreak,
  addDays,
  countTotals,
  DAYS_LIMIT,
  dieSummaries,
  HISTORY_LIMIT,
  KeyValueStorage,
  LEGACY_LIFETIME_KEY,
  localDateKey,
  nudgeUsedThisWeek,
  sanitize,
  STATS_KEY,
  STATS_V1_KEY,
  StatsService,
  streakAtRisk,
  streakFromDates,
  todayRoll,
  weekKey,
} from './stats.service';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new DOMException('QuotaExceededError');
    }
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('StatsService', () => {
  const day = (d: number, hour = 9) => new Date(2026, 9, d, hour, 0);
  const morning = day(10);
  const evening = day(10, 21);
  const tomorrow = day(11);
  let storage: MemoryStorage;
  let service: StatsService;

  beforeEach(() => {
    storage = new MemoryStorage();
    service = new StatsService(storage);
  });

  it('starts empty', () => {
    const stats = service.load();
    expect(stats.lifetimeRolls).toBe(0);
    expect(stats.counts).toEqual({});
    expect(stats.days).toEqual([]);
  });

  it('records rolls and persists them', () => {
    service.record(20, 20, 'normal', morning);
    service.record(1, 20, 'disadvantage', evening);

    const reloaded = new StatsService(storage).load();
    expect(reloaded.lifetimeRolls).toBe(2);
    expect(reloaded.counts[20]![19]).toBe(1);
    expect(reloaded.counts[20]![0]).toBe(1);
    expect(reloaded.history.map(h => h.value)).toEqual([1, 20]);
  });

  it('counts each die separately', () => {
    service.record(4, 4, 'normal', morning);
    service.record(4, 20, 'normal', morning);
    const stats = service.record(1, 6, 'normal', morning);

    expect(dieSummaries(stats.counts).map(d => [d.sides, d.rolls])).toEqual([[20, 1], [6, 1], [4, 1]]);
    expect(countTotals(stats.counts)).toEqual({rolls: 3, crits: 1, critFails: 1});
    expect(stats.history[0]).toMatchObject({value: 1, sides: 6});
  });

  it('keeps the first roll of each day as that day\'s roll', () => {
    service.record(13, 20, 'normal', morning);
    const stats = service.record(2, 20, 'normal', evening);
    expect(todayRoll(stats, evening)?.value).toBe(13);
    expect(countTotals(stats.dailyCounts).rolls).toBe(1);

    const nextDay = service.record(3, 4, 'advantage', tomorrow);
    expect(todayRoll(nextDay, tomorrow)).toEqual({date: localDateKey(tomorrow), value: 3, sides: 4, mode: 'advantage'});
    expect(nextDay.days.map(d => d.value)).toEqual([3, 13]);
    expect(nextDay.dailyCounts).toEqual({20: faces(20, {13: 1}), 4: faces(4, {3: 1})});
  });

  it('caps the list of days', () => {
    for (let i = 0; i < DAYS_LIMIT + 5; i++) {
      service.record(10, 20, 'normal', new Date(2026, 0, 1 + i, 9));
    }
    const stats = service.load();
    expect(stats.days.length).toBe(DAYS_LIMIT);
    expect(countTotals(stats.dailyCounts).rolls).toBe(DAYS_LIMIT + 5);
  });

  it('does not lose rolls made in another tab', () => {
    const otherTab = new StatsService(storage);
    service.record(5, 20, 'normal', morning);
    otherTab.record(6, 20, 'normal', morning);
    service.record(7, 20, 'normal', morning);
    expect(service.load().lifetimeRolls).toBe(3);
  });

  it('migrates the legacy lifetime counter', () => {
    storage.setItem(LEGACY_LIFETIME_KEY, '41');
    expect(service.load().lifetimeRolls).toBe(41);
    expect(service.record(10, 20, 'normal', morning).lifetimeRolls).toBe(42);
  });

  it('migrates d20-only stats from version 1', () => {
    const at = (d: number, hour: number) => day(d, hour).getTime();
    storage.setItem(STATS_V1_KEY, JSON.stringify({
      version: 1,
      lifetimeRolls: 50,
      faceCounts: faces(20, {7: 2, 12: 1, 20: 1}),
      history: [
        {value: 12, mode: 'normal', at: at(10, 20)},
        {value: 7, mode: 'normal', at: at(10, 9)},
        {value: 20, mode: 'advantage', at: at(9, 9)},
        {value: 7, mode: 'normal', at: at(8, 9)},
      ],
      today: {date: '2026-10-10', value: 7, mode: 'normal'},
      streak: {current: 3, best: 5, lastDate: '2026-10-10'},
    }));

    const stats = service.load();
    expect(stats.lifetimeRolls).toBe(50);
    expect(stats.counts).toEqual({20: faces(20, {7: 2, 12: 1, 20: 1})});
    expect(stats.history.every(h => h.sides === 20)).toBe(true);
    expect(stats.days.map(d => [d.date, d.value])).toEqual([['2026-10-10', 7], ['2026-10-09', 20], ['2026-10-08', 7]]);
    expect(stats.dailyCounts).toEqual({20: faces(20, {7: 2, 20: 1})});
    expect(stats.streak).toEqual({current: 3, best: 5, lastDate: '2026-10-10'});

    // Saving moves it to the new key; the old one is left alone.
    service.record(9, 20, 'normal', evening);
    expect(JSON.parse(storage.getItem(STATS_KEY)!).lifetimeRolls).toBe(51);
    expect(JSON.parse(storage.getItem(STATS_V1_KEY)!).lifetimeRolls).toBe(50);
    expect(service.load().lifetimeRolls).toBe(51);
  });

  it('keeps counting in memory when storage is unavailable', () => {
    const noStorage = new StatsService(null);
    noStorage.record(3, 20, 'normal', morning);
    expect(noStorage.record(4, 20, 'normal', morning).lifetimeRolls).toBe(2);
  });

  it('keeps counting in memory when a write fails', () => {
    service.record(3, 20, 'normal', morning);
    storage.failWrites = true;
    expect(service.record(4, 20, 'normal', morning).lifetimeRolls).toBe(2);
    expect(service.load().lifetimeRolls).toBe(2);
  });

  it('recovers from corrupt data', () => {
    storage.setItem(STATS_KEY, '{not json');
    expect(service.load().lifetimeRolls).toBe(0);
    storage.setItem(STATS_KEY, JSON.stringify({
      lifetimeRolls: 'lots',
      counts: {20: [1, -2, 'x'], 7: [5], 4: 'nope'},
      history: [{value: 99, sides: 20, mode: 'normal', at: 1}, {value: 5, sides: 4, mode: 'normal', at: 1}],
      days: [{date: 'today', value: 3, sides: 6, mode: 'normal'}],
    }));
    const stats = service.load();
    expect(stats.counts).toEqual({20: faces(20, {1: 1}), 4: [0, 0, 0, 0]});
    expect(stats.lifetimeRolls).toBe(1);
    expect(stats.history).toEqual([]);
    expect(stats.days).toEqual([]);
  });

  it('caps history length', () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      service.record((i % 20) + 1, 20, 'normal', morning);
    }
    expect(service.load().history.length).toBe(HISTORY_LIMIT);
  });

  it('rejects impossible values', () => {
    expect(() => service.record(0, 20, 'normal')).toThrowError();
    expect(() => service.record(21, 20, 'normal')).toThrowError();
    expect(() => service.record(5, 4, 'normal')).toThrowError();
    expect(() => service.record(3, 7 as never, 'normal')).toThrowError();
  });

  it('reset clears everything, including older keys', () => {
    storage.setItem(LEGACY_LIFETIME_KEY, '41');
    storage.setItem(STATS_V1_KEY, JSON.stringify({lifetimeRolls: 3}));
    service.record(10, 20, 'normal', morning);
    service.reset();
    expect(service.load().lifetimeRolls).toBe(0);
    expect(storage.getItem(LEGACY_LIFETIME_KEY)).toBeNull();
    expect(storage.getItem(STATS_V1_KEY)).toBeNull();
  });

  it('summarizes each die', () => {
    const stats = sanitize({counts: {20: faces(20, {1: 2, 10: 1, 20: 1}), 6: faces(6, {6: 3})}});
    expect(dieSummaries(stats.counts)).toEqual([
      {sides: 20, rolls: 4, faces: faces(20, {1: 2, 10: 1, 20: 1}), average: (1 + 1 + 10 + 20) / 4},
      {sides: 6, rolls: 3, faces: faces(6, {6: 3}), average: 6},
    ]);
    expect(countTotals(stats.counts)).toEqual({rolls: 7, crits: 4, critFails: 2});
    expect(dieSummaries(sanitize(null).counts)).toEqual([]);
  });

  describe('nudges', () => {
    // 2026-10-10 is a Saturday; the 11th is the next Sunday.
    it('starts each week on Sunday', () => {
      expect(weekKey(day(10))).toBe('2026-10-04');
      expect(weekKey(day(11))).toBe('2026-10-11');
      expect(weekKey(day(17, 23))).toBe('2026-10-11');
    });

    it('replaces today\'s roll and keeps what it replaced', () => {
      service.record(4, 20, 'normal', morning);
      const stats = service.nudge(15, 20, 'normal', evening);

      expect(todayRoll(stats, evening)).toEqual({
        date: '2026-10-10', value: 15, sides: 20, mode: 'normal', nudgedFrom: {value: 4, sides: 20},
      });
      expect(stats.dailyCounts[20]![3]).toBe(0);
      expect(stats.dailyCounts[20]![14]).toBe(1);
      // It's still a roll, so it counts towards every-roll stats.
      expect(stats.lifetimeRolls).toBe(2);
      expect(stats.history[0]).toMatchObject({value: 15, nudge: true});
      expect(stats.nudges).toEqual({lastWeek: '2026-10-04', used: 1, better: 1, worse: 0});
    });

    it('allows one a week, back on Sunday', () => {
      service.record(4, 20, 'normal', day(9));
      service.nudge(2, 20, 'normal', day(9));
      expect(nudgeUsedThisWeek(service.load(), day(10))).toBe(true);
      service.record(6, 20, 'normal', day(10));
      expect(() => service.nudge(9, 20, 'normal', day(10))).toThrowError();

      service.record(6, 20, 'normal', day(11));
      expect(nudgeUsedThisWeek(service.load(), day(11))).toBe(false);
      const stats = service.nudge(3, 4, 'normal', day(11));
      // A 3 on a d4 beats a 6 on a d20.
      expect(stats.nudges).toEqual({lastWeek: '2026-10-11', used: 2, better: 1, worse: 1});
    });

    it('needs a roll today to nudge', () => {
      service.record(4, 20, 'normal', day(9));
      expect(() => service.nudge(9, 20, 'normal', day(10))).toThrowError();
    });
  });

  describe('streaks', () => {
    it('counts consecutive days, not rolls', () => {
      service.record(10, 20, 'normal', day(10));
      service.record(11, 20, 'normal', day(10, 22));
      service.record(12, 20, 'normal', day(11));
      const stats = service.record(13, 20, 'normal', day(12));
      expect(stats.streak).toEqual({current: 3, best: 3, lastDate: '2026-10-12'});
      expect(activeStreak(stats, day(12))).toBe(3);
    });

    it('stays alive through the next day, then breaks', () => {
      const stats = service.record(10, 20, 'normal', day(10));
      expect(activeStreak(stats, day(11, 23))).toBe(1);
      expect(streakAtRisk(stats, day(11))).toBe(true);
      expect(streakAtRisk(stats, day(10))).toBe(false);
      expect(activeStreak(stats, day(12))).toBe(0);
    });

    it('restarts after a missed day but remembers the best', () => {
      service.record(10, 20, 'normal', day(10));
      service.record(10, 20, 'normal', day(11));
      const stats = service.record(10, 20, 'normal', day(13));
      expect(stats.streak).toEqual({current: 1, best: 2, lastDate: '2026-10-13'});
    });

    it('crosses month boundaries and DST changes', () => {
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
      expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
      expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    });

    it('rebuilds streaks from the days rolled when none was stored', () => {
      expect(streakFromDates(['2026-10-12', '2026-10-12', '2026-10-11', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05']))
        .toEqual({current: 2, best: 4, lastDate: '2026-10-12'});
      expect(streakFromDates([])).toEqual({current: 0, best: 0, lastDate: null});

      const at = (d: number) => ({value: 10, mode: 'normal', at: day(d).getTime()});
      storage.setItem(STATS_V1_KEY, JSON.stringify({lifetimeRolls: 2, history: [at(11), at(10)]}));
      expect(service.record(4, 20, 'normal', day(12)).streak.current).toBe(3);
    });

    it('ignores a malformed stored streak', () => {
      storage.setItem(STATS_KEY, JSON.stringify({streak: {current: 'many', best: 2, lastDate: 'yesterday'}}));
      expect(service.load().streak).toEqual({current: 0, best: 0, lastDate: null});
    });
  });
});

/** A die's face counts with the given faces filled in, e.g. faces(6, {6: 3}). */
function faces(sides: number, set: Record<number, number>): number[] {
  return Array.from({length: sides}, (_, i) => set[i + 1] ?? 0);
}
