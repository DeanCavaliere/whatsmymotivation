import {Inject, Injectable, InjectionToken} from '@angular/core';
import {DayCondition, INSPIRED_AT, isDayCondition, pruneConditions, rollCondition} from './conditions';
import {d20Scale, DIE_SIDES, DieSides, isDieSides, RollMode} from './motivation';

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
export const HISTORY_LIMIT = 20;
/** About a year and a month, so the calendar can page back a full year. */
export const DAYS_LIMIT = 400;

export interface RollRecord {
  value: number;
  sides: DieSides;
  mode: RollMode;
  /** Epoch milliseconds. */
  at: number;
  /** Set when the roll was a reroll that replaced the day's roll. */
  reroll?: true;
}

/** The first roll of a day: the one that counts as that day's motivation. */
export interface DayRoll {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  value: number;
  sides: DieSides;
  mode: RollMode;
  /** The roll a reroll replaced. */
  rerolledFrom?: { value: number; sides: DieSides };
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

export interface Rerolls {
  used: number;
  /** Rerolls that landed higher, or lower, than the roll they replaced. */
  better: number;
  worse: number;
}

/** ✦ tokens: earned on good days, spent to reroll the day's roll. */
export interface Inspiration {
  /** 0 to INSPIRATION_CAP. Everyone starts with one. */
  held: number;
  /** All ✦ ever earned (not the starting one), so the first earn can explain itself. */
  earned: number;
}

/**
 * Why a roll earned ✦: a natural top face as the day's roll, every STREAK_STEP-th day of a streak,
 * or a high roll on an Inspired day.
 */
export type InspirationReason = 'natural' | 'streak' | 'inspired';

export const INSPIRATION_CAP = 3;
export const STREAK_STEP = 7;

export interface Stats {
  version: 2;
  /** Every roll, on any die. */
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
  rerolls: Rerolls;
  inspiration: Inspiration;
  /** Each day's table condition, rolled on the first visit that day. */
  conditions: Record<string, DayCondition>;
  /** Badge id → the local date it was earned. */
  achievements: Record<string, string>;
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
    rerolls: {used: 0, better: 0, worse: 0},
    inspiration: {held: 1, earned: 0},
    conditions: {},
    achievements: {},
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
 * What a day's roll earns. A reroll can't earn for the streak, since it doesn't move it.
 */
export function inspirationReasons(value: number, sides: DieSides, streak: number, firstRollOfDay: boolean,
                                   condition: DayCondition = 'clear'): InspirationReason[] {
  const reasons: InspirationReason[] = [];
  if (value === sides) {
    reasons.push('natural');
  }
  if (firstRollOfDay && streak > 0 && streak % STREAK_STEP === 0) {
    reasons.push('streak');
  }
  if (condition === 'inspired' && d20Scale(value, sides) >= INSPIRED_AT) {
    reasons.push('inspired');
  }
  return reasons;
}

/** Adds earned ✦ up to the cap; any over the cap are lost. */
function earn(inspiration: Inspiration, count: number): Inspiration {
  const held = Math.min(INSPIRATION_CAP, inspiration.held + count);
  return {held, earned: inspiration.earned + (held - inspiration.held)};
}

/** Where a roll sits between 0 (a 1) and 1 (the top face), so rolls on different dice compare. */
function rollScore(value: number, sides: DieSides): number {
  return (value - 1) / (sides - 1);
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

function bump(counts: FaceCounts, sides: DieSides, value: number, by = 1): void {
  const faces = counts[sides] ??= new Array(sides).fill(0);
  faces[value - 1] = Math.max(0, faces[value - 1] + by);
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

function sanitizeRoll(raw: unknown): (Roll & Record<string, unknown>) | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const sides = r['sides'];
  if (!isDieSides(sides) || !isFace(r['value'], sides) || !isMode(r['mode'])) {
    return null;
  }
  return {...r, value: r['value'], sides, mode: r['mode']};
}

function sanitizeRecord(raw: unknown): RollRecord | null {
  const r = sanitizeRoll(raw);
  if (!r || !isCount(r['at'])) {
    return null;
  }
  const record: RollRecord = {value: r.value, sides: r.sides, mode: r.mode, at: r['at']};
  if (r['reroll'] === true) {
    record.reroll = true;
  }
  return record;
}

function sanitizeDay(raw: unknown): DayRoll | null {
  const r = sanitizeRoll(raw);
  if (!r || !isDateKey(r['date'])) {
    return null;
  }
  const day: DayRoll = {date: r['date'], value: r.value, sides: r.sides, mode: r.mode};
  const from = r['rerolledFrom'] as Partial<DayRoll> | undefined;
  if (from && isDieSides(from.sides) && isFace(from.value, from.sides)) {
    day.rerolledFrom = {value: from.value, sides: from.sides};
  }
  return day;
}

const count = (v: unknown) => isCount(v) ? Math.floor(v) : 0;

function sanitizeRerolls(raw: unknown): Rerolls {
  const n = (raw && typeof raw === 'object' ? raw : {}) as Partial<Rerolls>;
  const used = count(n.used);
  return {used, better: Math.min(used, count(n.better)), worse: Math.min(used, count(n.worse))};
}

function sanitizeInspiration(raw: unknown): Inspiration {
  const n = raw && typeof raw === 'object' ? raw as Partial<Inspiration> : null;
  if (!n || !isCount(n.held)) {
    return emptyStats().inspiration;
  }
  return {held: Math.min(INSPIRATION_CAP, Math.floor(n.held)), earned: count(n.earned)};
}

function sanitizeConditions(raw: unknown): Record<string, DayCondition> {
  const conditions: Record<string, DayCondition> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [date, condition] of Object.entries(raw)) {
      if (isDateKey(date) && isDayCondition(condition)) {
        conditions[date] = condition;
      }
    }
  }
  return conditions;
}

function sanitizeAchievements(raw: unknown): Record<string, string> {
  const achievements: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [id, date] of Object.entries(raw)) {
      if (isDateKey(date)) {
        achievements[id] = date;
      }
    }
  }
  return achievements;
}

/** Coerces anything read from storage into a valid Stats, dropping whatever is malformed. */
export function sanitize(raw: unknown): Stats {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') {
    return stats;
  }
  const r = raw as Record<string, unknown>;
  stats.counts = sanitizeCounts(r['counts']);
  stats.lifetimeRolls = countTotals(stats.counts).rolls;
  if (Array.isArray(r['history'])) {
    stats.history = r['history'].map(sanitizeRecord).filter(h => !!h).slice(0, HISTORY_LIMIT);
  }
  if (Array.isArray(r['days'])) {
    stats.days = r['days'].map(sanitizeDay).filter(d => !!d).slice(0, DAYS_LIMIT);
  }
  stats.dailyCounts = sanitizeCounts(r['dailyCounts']);
  const k = r['streak'] as Partial<Streak> | null | undefined;
  if (k && isCount(k.current) && isCount(k.best) && (k.lastDate === null || isDateKey(k.lastDate))) {
    const current = Math.floor(k.current);
    stats.streak = {current, best: Math.max(current, Math.floor(k.best)), lastDate: k.lastDate};
  }
  stats.rerolls = sanitizeRerolls(r['rerolls']);
  stats.inspiration = sanitizeInspiration(r['inspiration']);
  stats.conditions = sanitizeConditions(r['conditions']);
  stats.achievements = sanitizeAchievements(r['achievements']);
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
      return raw === null ? emptyStats() : sanitize(JSON.parse(raw));
    } catch {
      return emptyStats();
    }
  }

  /**
   * Re-reads storage before writing so rolls made in another tab are not overwritten.
   * The first roll of each local day becomes that day's roll, extends the streak,
   * and may earn ✦ (see `inspirationReasons`).
   */
  record(value: number, sides: DieSides, mode: RollMode, now: Date = new Date(), condition: DayCondition = 'clear'): Stats {
    if (!isDieSides(sides) || !isFace(value, sides)) {
      throw new Error(`Not a d${sides} value: ${value}`);
    }
    const stats = this.load();
    stats.lifetimeRolls++;
    bump(stats.counts, sides, value);
    stats.history = [{value, sides, mode, at: now.getTime()}, ...stats.history].slice(0, HISTORY_LIMIT);
    const date = localDateKey(now);
    const firstRollOfDay = !todayRoll(stats, now);
    if (firstRollOfDay) {
      stats.days = [{date, value, sides, mode}, ...stats.days].slice(0, DAYS_LIMIT);
      bump(stats.dailyCounts, sides, value);
    }
    const {streak} = stats;
    if (streak.lastDate !== date) {
      streak.current = streak.lastDate === addDays(date, -1) ? streak.current + 1 : 1;
      streak.best = Math.max(streak.best, streak.current);
      streak.lastDate = date;
    }
    if (firstRollOfDay) {
      const reasons = inspirationReasons(value, sides, streak.current, true, condition);
      stats.inspiration = earn(stats.inspiration, reasons.length);
    }
    this.save(stats);
    return stats;
  }

  /**
   * Spends one ✦ to replace today's roll with a new one. The reroll counts as a roll like any
   * other; the daily stats swap the old roll for the new one. A natural top face earns a ✦ back.
   */
  reroll(value: number, sides: DieSides, mode: RollMode, now: Date = new Date(), condition: DayCondition = 'clear'): Stats {
    if (!isDieSides(sides) || !isFace(value, sides)) {
      throw new Error(`Not a d${sides} value: ${value}`);
    }
    const stats = this.load();
    const today = todayRoll(stats, now);
    if (!today || stats.inspiration.held < 1) {
      throw new Error('No Inspiration to spend');
    }
    stats.lifetimeRolls++;
    bump(stats.counts, sides, value);
    stats.history = [{value, sides, mode, at: now.getTime(), reroll: true as const}, ...stats.history].slice(0, HISTORY_LIMIT);

    bump(stats.dailyCounts, today.sides, today.value, -1);
    bump(stats.dailyCounts, sides, value);
    stats.days[stats.days.indexOf(today)] = {
      date: today.date, value, sides, mode, rerolledFrom: {value: today.value, sides: today.sides},
    };

    const change = rollScore(value, sides) - rollScore(today.value, today.sides);
    const {rerolls} = stats;
    stats.rerolls = {
      used: rerolls.used + 1,
      better: rerolls.better + (change > 0 ? 1 : 0),
      worse: rerolls.worse + (change < 0 ? 1 : 0),
    };
    const spent = {...stats.inspiration, held: stats.inspiration.held - 1};
    stats.inspiration = earn(spent, inspirationReasons(value, sides, stats.streak.current, false, condition).length);
    this.save(stats);
    return stats;
  }

  /** Today's table condition, rolled and stored on the first visit of the day. */
  condition(now: Date = new Date(), random: () => number = Math.random): DayCondition {
    const stats = this.load();
    const date = localDateKey(now);
    const known = stats.conditions[date];
    if (known) {
      return known;
    }
    const condition = rollCondition(stats.conditions, date, random);
    stats.conditions = {...pruneConditions(stats.conditions, date, DAYS_LIMIT), [date]: condition};
    this.save(stats);
    return condition;
  }

  /** Records badges as earned today. Re-reads storage first, like a roll. */
  award(ids: readonly string[], now: Date = new Date()): Stats {
    const stats = this.load();
    const date = localDateKey(now);
    for (const id of ids) {
      stats.achievements[id] ??= date;
    }
    this.save(stats);
    return stats;
  }

  reset(): Stats {
    const stats = emptyStats();
    this.save(stats);
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

}

function structuredCloneStats(stats: Stats): Stats {
  return sanitize(JSON.parse(JSON.stringify(stats)));
}
