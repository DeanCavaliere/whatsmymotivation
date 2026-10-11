import {
  activeStreak,
  addDays,
  HISTORY_LIMIT,
  KeyValueStorage,
  LEGACY_LIFETIME_KEY,
  localDateKey,
  sanitize,
  STATS_KEY,
  StatsService,
  streakAtRisk,
  streakFromHistory,
  summarize,
  todayRoll,
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
  const morning = new Date(2026, 9, 10, 9, 0);
  const evening = new Date(2026, 9, 10, 21, 0);
  const tomorrow = new Date(2026, 9, 11, 9, 0);
  let storage: MemoryStorage;
  let service: StatsService;

  beforeEach(() => {
    storage = new MemoryStorage();
    service = new StatsService(storage);
  });

  it('starts empty', () => {
    const stats = service.load();
    expect(stats.lifetimeRolls).toBe(0);
    expect(stats.faceCounts.length).toBe(20);
    expect(stats.today).toBeNull();
  });

  it('records rolls and persists them', () => {
    service.record(20, 'normal', morning);
    service.record(1, 'disadvantage', evening);

    const reloaded = new StatsService(storage).load();
    expect(reloaded.lifetimeRolls).toBe(2);
    expect(reloaded.faceCounts[19]).toBe(1);
    expect(reloaded.faceCounts[0]).toBe(1);
    expect(reloaded.history.map(h => h.value)).toEqual([1, 20]);
  });

  it('keeps the first roll of the day as today\'s roll', () => {
    service.record(13, 'normal', morning);
    const stats = service.record(2, 'normal', evening);
    expect(todayRoll(stats, evening)?.value).toBe(13);

    const nextDay = service.record(18, 'advantage', tomorrow);
    expect(todayRoll(nextDay, tomorrow)).toEqual({date: localDateKey(tomorrow), value: 18, mode: 'advantage'});
    expect(todayRoll(nextDay, morning)).toBeNull();
  });

  it('does not lose rolls made in another tab', () => {
    const otherTab = new StatsService(storage);
    service.record(5, 'normal', morning);
    otherTab.record(6, 'normal', morning);
    service.record(7, 'normal', morning);
    expect(service.load().lifetimeRolls).toBe(3);
  });

  it('migrates the legacy lifetime counter', () => {
    storage.setItem(LEGACY_LIFETIME_KEY, '41');
    expect(service.load().lifetimeRolls).toBe(41);
    expect(service.record(10, 'normal', morning).lifetimeRolls).toBe(42);
  });

  it('keeps counting in memory when storage is unavailable', () => {
    const noStorage = new StatsService(null);
    noStorage.record(3, 'normal', morning);
    expect(noStorage.record(4, 'normal', morning).lifetimeRolls).toBe(2);
  });

  it('keeps counting in memory when a write fails', () => {
    service.record(3, 'normal', morning);
    storage.failWrites = true;
    expect(service.record(4, 'normal', morning).lifetimeRolls).toBe(2);
    expect(service.load().lifetimeRolls).toBe(2);
  });

  it('recovers from corrupt data', () => {
    storage.setItem(STATS_KEY, '{not json');
    expect(service.load().lifetimeRolls).toBe(0);
    storage.setItem(STATS_KEY, JSON.stringify({lifetimeRolls: 'lots', faceCounts: [1, -2, 'x'], history: [{value: 99}]}));
    const stats = service.load();
    expect(stats.faceCounts.slice(0, 3)).toEqual([1, 0, 0]);
    expect(stats.lifetimeRolls).toBe(1);
    expect(stats.history).toEqual([]);
  });

  it('caps history length', () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      service.record((i % 20) + 1, 'normal', morning);
    }
    expect(service.load().history.length).toBe(HISTORY_LIMIT);
  });

  it('rejects impossible values', () => {
    expect(() => service.record(0, 'normal')).toThrowError();
    expect(() => service.record(21, 'normal')).toThrowError();
  });

  it('reset clears everything, including the legacy key', () => {
    storage.setItem(LEGACY_LIFETIME_KEY, '41');
    service.record(10, 'normal', morning);
    service.reset();
    expect(service.load().lifetimeRolls).toBe(0);
    expect(storage.getItem(LEGACY_LIFETIME_KEY)).toBeNull();
  });

  it('summarizes face counts', () => {
    const stats = sanitize({faceCounts: [2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]});
    expect(summarize(stats)).toEqual({trackedRolls: 4, nat20s: 1, nat1s: 2, average: (1 + 1 + 10 + 20) / 4});
    expect(summarize(sanitize(null)).average).toBeNull();
  });

  describe('streaks', () => {
    const day = (d: number, hour = 9) => new Date(2026, 9, d, hour, 0);

    it('counts consecutive days, not rolls', () => {
      service.record(10, 'normal', day(10));
      service.record(11, 'normal', day(10, 22));
      service.record(12, 'normal', day(11));
      const stats = service.record(13, 'normal', day(12));
      expect(stats.streak).toEqual({current: 3, best: 3, lastDate: '2026-10-12'});
      expect(activeStreak(stats, day(12))).toBe(3);
    });

    it('stays alive through the next day, then breaks', () => {
      const stats = service.record(10, 'normal', day(10));
      expect(activeStreak(stats, day(11, 23))).toBe(1);
      expect(streakAtRisk(stats, day(11))).toBe(true);
      expect(streakAtRisk(stats, day(10))).toBe(false);
      expect(activeStreak(stats, day(12))).toBe(0);
    });

    it('restarts after a missed day but remembers the best', () => {
      service.record(10, 'normal', day(10));
      service.record(10, 'normal', day(11));
      const stats = service.record(10, 'normal', day(13));
      expect(stats.streak).toEqual({current: 1, best: 2, lastDate: '2026-10-13'});
    });

    it('crosses month boundaries and DST changes', () => {
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
      expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
      expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    });

    it('rebuilds streaks from history saved before they were tracked', () => {
      const at = (d: number) => ({value: 10, mode: 'normal' as const, at: day(d).getTime()});
      expect(streakFromHistory([at(12), at(12), at(11), at(8), at(7), at(6), at(5)]))
        .toEqual({current: 2, best: 4, lastDate: '2026-10-12'});
      expect(streakFromHistory([])).toEqual({current: 0, best: 0, lastDate: null});

      storage.setItem(STATS_KEY, JSON.stringify({lifetimeRolls: 2, history: [at(11), at(10)]}));
      expect(service.record(4, 'normal', day(12)).streak.current).toBe(3);
    });

    it('ignores a malformed stored streak', () => {
      storage.setItem(STATS_KEY, JSON.stringify({streak: {current: 'many', best: 2, lastDate: 'yesterday'}}));
      expect(service.load().streak).toEqual({current: 0, best: 0, lastDate: null});
    });
  });
});
