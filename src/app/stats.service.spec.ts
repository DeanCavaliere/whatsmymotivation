import {
  activeStreak,
  addDays,
  countTotals,
  DAYS_LIMIT,
  dieSummaries,
  HISTORY_LIMIT,
  INSPIRATION_CAP,
  inspirationReasons,
  KeyValueStorage,
  localDateKey,
  sanitize,
  STATS_KEY,
  StatsService,
  streakAtRisk,
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
    expect(todayRoll(nextDay, tomorrow)).toMatchObject({date: localDateKey(tomorrow), value: 3, sides: 4, mode: 'advantage'});
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

  it('reset clears everything', () => {
    service.record(10, 20, 'normal', morning);
    service.reset();
    expect(service.load()).toEqual(sanitize({}));
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

  describe('Getting started', () => {
    it('starts with no ✦, and finishing gives the first one, once', () => {
      expect(service.load().inspiration).toEqual({held: 0, earned: 0});
      expect(service.finishTour().inspiration).toEqual({held: 1, earned: 1});
      expect(service.finishTour().inspiration).toEqual({held: 1, earned: 1});
      expect(service.load().tour).toEqual({finished: true, sawStats: false});
    });

    it('notes when the stats were looked at', () => {
      expect(service.sawStats().tour).toEqual({finished: false, sawStats: true});
    });

    it('keeps the table clear until it is finished', () => {
      expect(service.condition(day(10), () => 0)).toBe('clear');
      service.finishTour();
      // Today's stays clear; the next day can bring a condition.
      expect(service.condition(day(10), () => 0)).toBe('clear');
      expect(service.condition(day(11), () => 0)).not.toBe('clear');
    });

    it('reads a stored tour, ignoring junk', () => {
      expect(sanitize({tour: {finished: true, sawStats: 'yes'}}).tour).toEqual({finished: true, sawStats: false});
      expect(sanitize({tour: 3}).tour).toEqual({finished: false, sawStats: false});
    });
  });

  describe('Inspiration and rerolls', () => {
    // Getting started hands over the first ✦.
    beforeEach(() => service.finishTour());

    it('spends a ✦ to replace today\'s roll and keeps what it replaced', () => {
      service.record(4, 20, 'normal', morning);
      const stats = service.reroll(15, 20, 'normal', evening);

      expect(todayRoll(stats, evening)).toMatchObject({
        date: '2026-10-10', value: 15, sides: 20, mode: 'normal', rerolledFrom: {value: 4, sides: 20},
      });
      expect(stats.dailyCounts[20]![3]).toBe(0);
      expect(stats.dailyCounts[20]![14]).toBe(1);
      // It's still a roll, so it counts towards every-roll stats.
      expect(stats.lifetimeRolls).toBe(2);
      expect(stats.history[0]).toMatchObject({value: 15, reroll: true});
      expect(stats.rerolls).toEqual({used: 1, better: 1, worse: 0});
      expect(stats.inspiration.held).toBe(0);
    });

    it('needs a ✦ and a roll today to reroll', () => {
      service.record(4, 20, 'normal', day(9));
      expect(() => service.reroll(9, 20, 'normal', day(10))).toThrowError();
      service.record(6, 20, 'normal', day(10));
      service.reroll(3, 4, 'normal', day(10));
      expect(() => service.reroll(9, 20, 'normal', day(10))).toThrowError();
      // A 3 on a d4 beats a 6 on a d20.
      expect(service.load().rerolls).toEqual({used: 1, better: 1, worse: 0});
    });

    it('earns a ✦ for a natural top face as the day\'s roll, not a practice roll', () => {
      service.record(20, 20, 'normal', morning);
      expect(service.load().inspiration).toEqual({held: 2, earned: 2});
      service.record(20, 20, 'normal', evening);
      expect(service.load().inspiration.held).toBe(2);
    });

    it('earns a ✦ back when a reroll lands the top face', () => {
      service.record(2, 20, 'normal', morning);
      expect(service.reroll(20, 20, 'normal', evening).inspiration).toEqual({held: 1, earned: 2});
    });

    it('earns a ✦ on every 7th day of a streak', () => {
      for (let d = 1; d <= 14; d++) {
        service.record(10, 20, 'normal', day(d));
      }
      expect(service.load().inspiration).toEqual({held: 3, earned: 3});
    });

    it('holds at most three', () => {
      for (let d = 1; d <= 5; d++) {
        service.record(20, 20, 'normal', day(d));
      }
      expect(service.load().inspiration).toEqual({held: INSPIRATION_CAP, earned: 3});
    });

    it('names why a roll earned ✦', () => {
      expect(inspirationReasons(20, 20, 14, true)).toEqual(['natural', 'streak']);
      expect(inspirationReasons(20, 20, 14, false)).toEqual(['natural']);
      expect(inspirationReasons(6, 6, 3, true)).toEqual(['natural']);
      expect(inspirationReasons(12, 20, 6, true)).toEqual([]);
    });
  });

  describe('quests and notes', () => {
    it('gives the day\'s roll a quest sized to it', () => {
      const stats = service.record(3, 20, 'normal', morning, 'clear', () => 0);
      expect(todayRoll(stats, morning)!.quest).toEqual({id: 'one-email', done: false});
      // Practice rolls don't change it.
      expect(todayRoll(service.record(20, 20, 'normal', evening, 'clear', () => 0), evening)!.quest!.id).toBe('one-email');
    });

    it('brings a new quest with a reroll, and keeps the note', () => {
      service.finishTour();
      service.record(3, 20, 'normal', morning, 'clear', () => 0);
      service.setQuestDone('2026-10-10', true);
      service.setNote('2026-10-10', 'Inbox zero');
      const stats = service.reroll(18, 20, 'normal', evening, 'clear', () => 0);
      expect(todayRoll(stats, evening)).toMatchObject({quest: {id: 'avoided-task', done: false}, note: 'Inbox zero'});
    });

    it('ticks quests and saves notes, trimmed to 80 characters', () => {
      service.record(12, 20, 'normal', morning);
      expect(todayRoll(service.setQuestDone('2026-10-10', true), morning)!.quest!.done).toBe(true);
      expect(todayRoll(service.setNote('2026-10-10', '  ' + 'x'.repeat(100)), morning)!.note).toBe('x'.repeat(80));
      expect(todayRoll(service.setNote('2026-10-10', '   '), morning)!.note).toBeUndefined();
    });

    it('drops unknown quests and blank notes from storage', () => {
      const day = {date: '2026-10-10', value: 5, sides: 20, mode: 'normal'};
      const stats = sanitize({days: [{...day, quest: {id: 'nope', done: true}, note: '  '}]});
      expect(stats.days[0]).toEqual(day);
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
