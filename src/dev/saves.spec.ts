import {CONDITIONS} from '../app/conditions';
import {emptyStats, localDateKey, sanitize, STATS_KEY, todayRoll} from '../app/stats.service';
import {SAVES} from './saves';
import {BACKUP_KEY, seedDevSave} from './seed';

describe('dev saves', () => {
  const now = new Date(2026, 9, 11, 12);
  const yesterday = '2026-10-10';

  it('each save survives a load unchanged', () => {
    for (const [name, save] of Object.entries(SAVES)) {
      const stats = save(now);
      expect(sanitize(JSON.parse(JSON.stringify(stats))), name).toEqual(stats);
      expect(todayRoll(stats, now), name).toBeNull();
    }
  });

  it('fresh is a new player', () => {
    expect(SAVES['fresh'](now)).toEqual(emptyStats());
  });

  it('day2 is one step from finishing Getting started', () => {
    const stats = SAVES['day2'](now);
    expect(stats.days.map(d => d.date)).toEqual([yesterday]);
    expect(stats.days[0].quest?.done).toBe(true);
    expect(stats.tour.finished).toBe(false);
    expect(stats.inspiration.held).toBe(0);
  });

  it('month has a streak up to yesterday, rerolls, room for ✦ and every condition', () => {
    const stats = SAVES['month'](now);
    expect(stats.tour.finished).toBe(true);
    expect(stats.streak.lastDate).toBe(yesterday);
    expect(stats.streak.current).toBe(11);
    expect(stats.rerolls.used).toBe(3);
    // Room to earn one more.
    expect(stats.inspiration.held).toBe(2);
    expect(Object.keys(stats.achievements)).toContain('storm-chaser');
    const seen = new Set(Object.values(stats.conditions));
    for (const id of Object.keys(CONDITIONS).filter(id => id !== 'snowy')) {
      expect(seen, id).toContain(id);
    }
  });

  it('month snows instead of raining in winter', () => {
    const conditions = Object.values(SAVES['month'](new Date(2027, 0, 20)).conditions);
    expect(conditions).toContain('snowy');
    expect(conditions).not.toContain('rainy');
  });

  it('year goes back more than a year', () => {
    const stats = SAVES['year'](now);
    expect(stats.days.length).toBeGreaterThan(300);
    expect(stats.days.at(-1)!.date < localDateKey(new Date(2025, 9, 11))).toBe(true);
    expect(stats.dailyCounts[12]).toBeDefined();
  });
});

describe('seedDevSave', () => {
  let storage: Storage;

  beforeEach(() => {
    const store = new Map<string, string>();
    storage = {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: key => void store.delete(key),
    } as Storage;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('does nothing without ?save=', () => {
    seedDevSave('?season=spooky', storage);
    expect(storage.getItem(STATS_KEY)).toBeNull();
  });

  it('keeps the player\'s own save aside and puts it back', () => {
    storage.setItem(STATS_KEY, 'mine');
    seedDevSave('?save=month', storage);
    seedDevSave('?save=year', storage);
    expect(JSON.parse(storage.getItem(STATS_KEY)!).days.length).toBeGreaterThan(300);

    seedDevSave('?save=mine', storage);
    expect(storage.getItem(STATS_KEY)).toBe('mine');
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
  });

  it('puts back having no save at all', () => {
    seedDevSave('?save=month', storage);
    seedDevSave('?save=mine', storage);
    expect(storage.getItem(STATS_KEY)).toBeNull();
  });

  it('leaves the save alone for a name it doesn\'t know', () => {
    storage.setItem(STATS_KEY, 'mine');
    seedDevSave('?save=nope', storage);
    expect(storage.getItem(STATS_KEY)).toBe('mine');
    expect(console.warn).toHaveBeenCalled();
  });
});
