import {Inject, Injectable, InjectionToken} from '@angular/core';
import {DIE_SIDES, DieSides, isDieSides, RollMode} from './motivation';

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

/**
 * A new key rather than a new shape under the old one: after a deploy the service worker
 * can still serve the previous version once, and it would drop fields it doesn't know.
 */
export const STATS_KEY = 'wmm.stats.v2';
/** d20-only stats, before per-die and daily tracking. Migrated on first load. */
export const STATS_V1_KEY = 'wmm.stats.v1';
export const LEGACY_LIFETIME_KEY = 'lifetimeRolls';
export const HISTORY_LIMIT = 20;
export const DAYS_LIMIT = 30;

export interface RollRecord {
  value: number;
  sides: DieSides;
  mode: RollMode;
  /** Epoch milliseconds. */
  at: number;
}

/** The first roll of a day: the one that counts as that day's motivation. */
export interface DayRoll {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  value: number;
  sides: DieSides;
  mode: RollMode;
}

/** counts[sides][face - 1] is how many times that face was the kept roll on that die. */
export type FaceCounts = Partial<Record<DieSides, number[]>>;

export interface Streak {
  /** Consecutive local days with at least one roll, ending on `lastDate`. */
  current: number;
  best: number;
  /** Local calendar date of the most recent roll, YYYY-MM-DD. */
  lastDate: string | null;
}

export interface Stats {
  version: 2;
  /** Includes rolls made before per-face tracking existed, so it can exceed the tracked counts. */
  lifetimeRolls: number;
  /** Every roll. */
  counts: FaceCounts;
  /** Only each day's first roll. */
  dailyCounts: FaceCounts;
  /** Newest first. */
  history: RollRecord[];
  /** Each day's first roll, newest first. */
  days: DayRoll[];
  streak: Streak;
}

export interface DieSummary {
  sides: DieSides;
  rolls: number;
  /** faces[i] is how many times face i + 1 came up. */
  faces: number[];
  average: number;
}

export interface CountTotals {
  rolls: number;
  /** The die's top face. */
  crits: number;
  /** Natural 1s. */
  critFails: number;
}

export function emptyStats(): Stats {
  return {
    version: 2,
    lifetimeRolls: 0,
    counts: {},
    dailyCounts: {},
    history: [],
    days: [],
    streak: {current: 0, best: 0, lastDate: null},
  };
}

export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local midnight a YYYY-MM-DD key refers to. */
export function dateFromKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Shifts a YYYY-MM-DD key by whole local days (DST-safe). */
export function addDays(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/**
 * The streak as of `now`: still alive if the last roll was today or yesterday
 * (yesterday's streak can be kept by rolling today), otherwise broken.
 */
export function activeStreak(stats: Stats, now: Date = new Date()): number {
  const {current, lastDate} = stats.streak;
  const today = localDateKey(now);
  return lastDate === today || lastDate === addDays(today, -1) ? current : 0;
}

/** True when there is a streak that a roll today would extend, and no roll yet today. */
export function streakAtRisk(stats: Stats, now: Date = new Date()): boolean {
  return stats.streak.lastDate === addDays(localDateKey(now), -1) && stats.streak.current > 0;
}

/** Rebuilds a streak from the days rolled, for data saved before streaks were tracked. */
export function streakFromDates(dates: string[]): Streak {
  const days = [...new Set(dates)].sort().reverse();
  if (!days.length) {
    return {current: 0, best: 0, lastDate: null};
  }
  let run = 1;
  let best = 1;
  let current = 0;
  for (let i = 1; i <= days.length; i++) {
    if (i < days.length && days[i] === addDays(days[i - 1], -1)) {
      run++;
      continue;
    }
    current ||= run;
    best = Math.max(best, run);
    run = 1;
  }
  return {current, best, lastDate: days[0]};
}

/** Each die that has rolls, in the order dice are offered. */
export function dieSummaries(counts: FaceCounts): DieSummary[] {
  return DIE_SIDES.flatMap(sides => {
    const faces = counts[sides];
    const rolls = faces ? sum(faces) : 0;
    if (!faces || !rolls) {
      return [];
    }
    const total = faces.reduce((acc, count, i) => acc + count * (i + 1), 0);
    return [{sides, rolls, faces, average: total / rolls}];
  });
}

export function countTotals(counts: FaceCounts): CountTotals {
  return dieSummaries(counts).reduce((t, d) => ({
    rolls: t.rolls + d.rolls,
    crits: t.crits + d.faces[d.sides - 1],
    critFails: t.critFails + d.faces[0],
  }), {rolls: 0, crits: 0, critFails: 0});
}

export function todayRoll(stats: Stats, now: Date = new Date()): DayRoll | null {
  const today = localDateKey(now);
  return stats.days.find(d => d.date === today) ?? null;
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isFace = (n: unknown, sides: DieSides): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= sides;
const isDateKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMode = (m: unknown): m is RollMode => m === 'normal' || m === 'advantage' || m === 'disadvantage';

function bump(counts: FaceCounts, sides: DieSides, value: number): void {
  (counts[sides] ??= new Array(sides).fill(0))[value - 1]++;
}

function sanitizeFaces(raw: unknown, sides: DieSides): number[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({length: sides}, (_, i) => isCount(list[i]) ? Math.floor(list[i]) : 0);
}

function sanitizeCounts(raw: unknown): FaceCounts {
  const counts: FaceCounts = {};
  if (raw && typeof raw === 'object') {
    for (const sides of DIE_SIDES) {
      const faces = (raw as Record<string, unknown>)[sides];
      if (faces !== undefined) {
        counts[sides] = sanitizeFaces(faces, sides);
      }
    }
  }
  return counts;
}

type Roll = Pick<RollRecord, 'value' | 'sides' | 'mode'>;

/** Version 1 rolls had no `sides`: they were all d20s. */
function sanitizeRoll(raw: unknown): (Roll & Record<string, unknown>) | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const sides = r['sides'] === undefined ? 20 : r['sides'];
  if (!isDieSides(sides) || !isFace(r['value'], sides) || !isMode(r['mode'])) {
    return null;
  }
  return {...r, value: r['value'], sides, mode: r['mode']};
}

function sanitizeRecord(raw: unknown): RollRecord | null {
  const r = sanitizeRoll(raw);
  return r && isCount(r['at']) ? {value: r.value, sides: r.sides, mode: r.mode, at: r['at']} : null;
}

function sanitizeDay(raw: unknown): DayRoll | null {
  const r = sanitizeRoll(raw);
  return r && isDateKey(r['date']) ? {date: r['date'], value: r.value, sides: r.sides, mode: r.mode} : null;
}

/** For version 1 data: each day's earliest roll still in history, plus the stored "today". */
function daysFromHistory(history: RollRecord[], today: DayRoll | null): DayRoll[] {
  const byDate = new Map<string, DayRoll>();
  for (const h of history) {
    // History is newest first, so later entries for the same date are earlier rolls.
    const date = localDateKey(new Date(h.at));
    byDate.set(date, {date, value: h.value, sides: h.sides, mode: h.mode});
  }
  if (today) {
    byDate.set(today.date, today);
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, DAYS_LIMIT);
}

function countsFromDays(days: DayRoll[]): FaceCounts {
  const counts: FaceCounts = {};
  days.forEach(d => bump(counts, d.sides, d.value));
  return counts;
}

/**
 * Coerces anything read from storage into a valid Stats, dropping whatever is malformed.
 * Also upgrades version 1 data (d20 only, `faceCounts` and a single `today`).
 */
export function sanitize(raw: unknown): Stats {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') {
    return stats;
  }
  const r = raw as Record<string, unknown>;
  stats.counts = r['counts'] !== undefined
    ? sanitizeCounts(r['counts'])
    : Array.isArray(r['faceCounts']) ? {20: sanitizeFaces(r['faceCounts'], 20)} : {};
  stats.lifetimeRolls = Math.max(countTotals(stats.counts).rolls, isCount(r['lifetimeRolls']) ? Math.floor(r['lifetimeRolls']) : 0);
  if (Array.isArray(r['history'])) {
    stats.history = r['history'].map(sanitizeRecord).filter(h => !!h).slice(0, HISTORY_LIMIT);
  }
  if (Array.isArray(r['days'])) {
    stats.days = r['days'].map(sanitizeDay).filter(d => !!d).slice(0, DAYS_LIMIT);
  } else {
    stats.days = daysFromHistory(stats.history, sanitizeDay(r['today']));
  }
  stats.dailyCounts = r['dailyCounts'] !== undefined ? sanitizeCounts(r['dailyCounts']) : countsFromDays(stats.days);
  const k = r['streak'] as Partial<Streak> | null | undefined;
  if (k && isCount(k.current) && isCount(k.best) && (k.lastDate === null || isDateKey(k.lastDate))) {
    const current = Math.floor(k.current);
    stats.streak = {current, best: Math.max(current, Math.floor(k.best)), lastDate: k.lastDate};
  } else {
    stats.streak = streakFromDates([
      ...stats.days.map(d => d.date),
      ...stats.history.map(h => localDateKey(new Date(h.at))),
    ]);
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
      const raw = this.storage.getItem(STATS_KEY) ?? this.storage.getItem(STATS_V1_KEY);
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
   * The first roll of each local day becomes that day's roll and extends the streak.
   */
  record(value: number, sides: DieSides, mode: RollMode, now: Date = new Date()): Stats {
    if (!isDieSides(sides) || !isFace(value, sides)) {
      throw new Error(`Not a d${sides} value: ${value}`);
    }
    const stats = this.load();
    stats.lifetimeRolls++;
    bump(stats.counts, sides, value);
    stats.history = [{value, sides, mode, at: now.getTime()}, ...stats.history].slice(0, HISTORY_LIMIT);
    const date = localDateKey(now);
    if (!todayRoll(stats, now)) {
      stats.days = [{date, value, sides, mode}, ...stats.days].slice(0, DAYS_LIMIT);
      bump(stats.dailyCounts, sides, value);
    }
    const {streak} = stats;
    if (streak.lastDate !== date) {
      streak.current = streak.lastDate === addDays(date, -1) ? streak.current + 1 : 1;
      streak.best = Math.max(streak.best, streak.current);
      streak.lastDate = date;
    }
    this.save(stats);
    return stats;
  }

  reset(): Stats {
    const stats = emptyStats();
    this.save(stats);
    try {
      this.storage?.removeItem(STATS_V1_KEY);
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

  /** The first versions stored only a lifetime counter under `lifetimeRolls`. */
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
