import {
  HISTORY_LIMIT,
  KeyValueStorage,
  LEGACY_LIFETIME_KEY,
  localDateKey,
  sanitize,
  STATS_KEY,
  StatsService,
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
});
