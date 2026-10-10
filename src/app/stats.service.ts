import {Inject, Injectable, InjectionToken} from '@angular/core';
import {RollMode} from './motivation';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage when it is usable, otherwise null (private mode, blocked cookies, SSR). */
export const STATS_STORAGE = new InjectionToken<KeyValueStorage | null>('STATS_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      const storage = window.localStorage;
      const probe = '__wmm_probe__';
      storage.setItem(probe, probe);
      storage.removeItem(probe);
      return storage;
    } catch {
      return null;
    }
  },
});

export const STATS_KEY = 'wmm.stats.v1';
export const LEGACY_LIFETIME_KEY = 'lifetimeRolls';
export const HISTORY_LIMIT = 20;

export interface RollRecord {
  value: number;
  mode: RollMode;
  /** Epoch milliseconds. */
  at: number;
}

export interface TodayRoll {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  value: number;
  mode: RollMode;
}

export interface Stats {
  version: 1;
  /** Includes rolls made before per-face tracking existed, so it can exceed sum(faceCounts). */
  lifetimeRolls: number;
  /** faceCounts[i] is how many times face i + 1 was the kept roll. */
  faceCounts: number[];
  /** Newest first. */
  history: RollRecord[];
  today: TodayRoll | null;
}

export interface StatsSummary {
  trackedRolls: number;
  nat20s: number;
  nat1s: number;
  average: number | null;
}

export function emptyStats(): Stats {
  return {version: 1, lifetimeRolls: 0, faceCounts: new Array(20).fill(0), history: [], today: null};
}

export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function summarize(stats: Stats): StatsSummary {
  const trackedRolls = stats.faceCounts.reduce((a, b) => a + b, 0);
  const total = stats.faceCounts.reduce((sum, count, i) => sum + count * (i + 1), 0);
  return {
    trackedRolls,
    nat20s: stats.faceCounts[19],
    nat1s: stats.faceCounts[0],
    average: trackedRolls ? total / trackedRolls : null,
  };
}

export function todayRoll(stats: Stats, now: Date = new Date()): TodayRoll | null {
  return stats.today?.date === localDateKey(now) ? stats.today : null;
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isFace = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 20;
const isMode = (m: unknown): m is RollMode => m === 'normal' || m === 'advantage' || m === 'disadvantage';

/** Coerces anything read from storage into a valid Stats, dropping whatever is malformed. */
export function sanitize(raw: unknown): Stats {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') {
    return stats;
  }
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r['faceCounts'])) {
    stats.faceCounts = stats.faceCounts.map((_, i) => {
      const n = (r['faceCounts'] as unknown[])[i];
      return isCount(n) ? Math.floor(n) : 0;
    });
  }
  const tracked = stats.faceCounts.reduce((a, b) => a + b, 0);
  stats.lifetimeRolls = Math.max(tracked, isCount(r['lifetimeRolls']) ? Math.floor(r['lifetimeRolls']) : 0);
  if (Array.isArray(r['history'])) {
    stats.history = (r['history'] as Partial<RollRecord>[])
      .filter(h => h && isFace(h.value) && isMode(h.mode) && isCount(h.at))
      .slice(0, HISTORY_LIMIT) as RollRecord[];
  }
  const t = r['today'] as Partial<TodayRoll> | null | undefined;
  if (t && typeof t.date === 'string' && isFace(t.value) && isMode(t.mode)) {
    stats.today = {date: t.date, value: t.value, mode: t.mode};
  }
  return stats;
}

@Injectable({providedIn: 'root'})
export class StatsService {
  /** Used when storage is unavailable or a write fails, so counting still works for the session. */
  private memory: Stats | null = null;

  constructor(@Inject(STATS_STORAGE) private storage: KeyValueStorage | null) {
  }

  load(): Stats {
    if (this.memory) {
      return structuredCloneStats(this.memory);
    }
    if (!this.storage) {
      return emptyStats();
    }
    try {
      const raw = this.storage.getItem(STATS_KEY);
      if (raw !== null) {
        return sanitize(JSON.parse(raw));
      }
      return this.migrateLegacy();
    } catch {
      return emptyStats();
    }
  }

  /**
   * Re-reads storage before writing so rolls made in another tab are not overwritten.
   * The first roll of each local day becomes "today's roll".
   */
  record(value: number, mode: RollMode, now: Date = new Date()): Stats {
    if (!isFace(value)) {
      throw new Error(`Not a d20 value: ${value}`);
    }
    const stats = this.load();
    stats.lifetimeRolls++;
    stats.faceCounts[value - 1]++;
    stats.history = [{value, mode, at: now.getTime()}, ...stats.history].slice(0, HISTORY_LIMIT);
    if (!todayRoll(stats, now)) {
      stats.today = {date: localDateKey(now), value, mode};
    }
    this.save(stats);
    return stats;
  }

  reset(): Stats {
    const stats = emptyStats();
    this.save(stats);
    try {
      this.storage?.removeItem(LEGACY_LIFETIME_KEY);
    } catch {
      // Nothing else to clean up if storage is unavailable.
    }
    return stats;
  }

  private save(stats: Stats): void {
    if (this.storage && !this.memory) {
      try {
        this.storage.setItem(STATS_KEY, JSON.stringify(stats));
        return;
      } catch {
        // Quota exceeded or storage revoked mid-session: fall through to memory.
      }
    }
    this.memory = structuredCloneStats(stats);
  }

  /** Earlier versions stored only a lifetime counter under `lifetimeRolls`. */
  private migrateLegacy(): Stats {
    const stats = emptyStats();
    const legacy = Number(JSON.parse(this.storage?.getItem(LEGACY_LIFETIME_KEY) ?? '0'));
    if (isCount(legacy)) {
      stats.lifetimeRolls = Math.floor(legacy);
    }
    return stats;
  }
}

function structuredCloneStats(stats: Stats): Stats {
  return sanitize(JSON.parse(JSON.stringify(stats)));
}
