import {newBadges} from '../app/achievements';
import {DayCondition, forcedMode} from '../app/conditions';
import {DieSides, RollMode} from '../app/motivation';
import {addDays, dateFromKey, KeyValueStorage, localDateKey, Stats, STATS_KEY, StatsService, todayRoll} from '../app/stats.service';
import {tourDone, tourItems} from '../app/tour';

/** One day of a dev save. */
export interface PlannedDay {
  /** Days before today; 1 is yesterday. */
  ago: number;
  /** The day's roll. */
  value: number;
  /** Defaults to 20. */
  sides?: DieSides;
  /** Defaults to clear. Rainy turns Snowy in Dec–Feb, as it does in the app. */
  condition?: DayCondition;
  /** Whether the day's quest got done. */
  quest?: boolean;
  note?: string;
  /** Spends a ✦ (when there is one) to reroll the day's roll into this. */
  reroll?: number;
  /** More rolls after the day's roll, which only count toward the totals. */
  extra?: number[];
}

/** A small seeded random source, so a save comes out the same on every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plays the days, oldest first, through the real StatsService, so the streak, ✦, quests, badges
 * and Getting started come out just as if someone had rolled them.
 */
export function replay(days: readonly PlannedDay[], now: Date, random: () => number = seeded(1)): Stats {
  const store = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: key => void store.delete(key),
  };
  const service = new StatsService(storage);
  const today = localDateKey(now);

  for (const day of [...days].sort((a, b) => b.ago - a.ago)) {
    const date = addDays(today, -day.ago);
    const at = dateFromKey(date);
    at.setHours(8, Math.floor(random() * 12 * 60));
    const sides = day.sides ?? 20;

    // Like the app: no conditions until Getting started is finished.
    const stats = service.load();
    const condition = stats.tour.finished ? seasonal(day.condition ?? 'clear', date) : 'clear';
    storage.setItem(STATS_KEY, JSON.stringify({...stats, conditions: {...stats.conditions, [date]: condition}}));

    const dayMode = forcedMode(condition) ?? 'normal';
    roll(service, day.value, sides, dayMode, condition, at, false, random);
    if (day.reroll !== undefined && service.load().inspiration.held > 0) {
      roll(service, day.reroll, sides, dayMode, condition, at, true, random);
    }
    for (const value of day.extra ?? []) {
      roll(service, value, sides, 'normal', condition, at, false, random);
    }
    if (day.quest) {
      service.setQuestDone(date, true);
    }
    if (day.note) {
      service.setNote(date, day.note);
    }
    award(service, newBadges(service.load(), null).map(b => b.id), at);

    const items = tourItems(service.load(), true);
    if (items && tourDone(items) === items.length) {
      service.finishTour();
    }
  }
  return service.load();
}

function roll(service: StatsService, value: number, sides: DieSides, mode: RollMode, condition: DayCondition,
              at: Date, reroll: boolean, random: () => number): void {
  const before = todayRoll(service.load(), at);
  const stats = reroll
    ? service.reroll(value, sides, mode, at, condition, random)
    : service.record(value, sides, mode, at, condition, random);
  const values = mode === 'normal' ? [value] : [value, otherDie(value, sides, mode, random)];
  const badges = newBadges(stats, {
    values, value, sides, mode, isDayRoll: reroll || !before, rerolledFrom: reroll && before ? before.value : null,
    condition, date: localDateKey(at),
  });
  award(service, badges.map(b => b.id), at);
}

function award(service: StatsService, ids: string[], at: Date): void {
  if (ids.length) {
    service.award(ids, at);
  }
}

/** The die that wasn't kept: no higher with advantage, no lower with disadvantage. */
function otherDie(kept: number, sides: DieSides, mode: RollMode, random: () => number): number {
  return mode === 'advantage'
    ? 1 + Math.floor(random() * kept)
    : kept + Math.floor(random() * (sides - kept + 1));
}

function seasonal(condition: DayCondition, date: string): DayCondition {
  const winter = [12, 1, 2].includes(Number(date.slice(5, 7)));
  return condition === 'rainy' && winter ? 'snowy' : condition;
}
