import {addDays} from './stats.service';

export type ConditionId = 'foggy' | 'rainy' | 'snowy' | 'stormy' | 'low-gravity' | 'inspired' | 'blessed' | 'hexed';

/** A day's roll for its condition: one of the above, or a plain day. */
export type DayCondition = ConditionId | 'clear';

/** How common each condition is, relative to the others. Snowy takes Rainy's place in Dec–Feb. */
export const CONDITION_WEIGHTS: Readonly<Record<Exclude<ConditionId, 'snowy'>, number>> = {
  'foggy': 3,
  'rainy': 3,
  'stormy': 2,
  'low-gravity': 2,
  'inspired': 2,
  'blessed': 1,
  'hexed': 1,
};

/** About this many condition days a month. */
export const MONTHLY_TARGET = 8;
/** How far the catch-up can push the daily chance, relative to the base chance. */
const RUBBER_BAND = {min: 0.25, max: 2};
/** The day after a condition, any condition is this much less likely... */
const AFTER_CONDITION = 0.6;
/** ...and the same one again far less likely still. */
const SAME_AGAIN = 0.1;

const isWinter = (date: string) => [12, 1, 2].includes(Number(date.slice(5, 7)));

/** Rainy and Snowy are one condition in different seasons. */
const sameKind = (a: DayCondition, b: DayCondition) => a === b || (a !== 'clear' && b !== 'clear' && [a, b].every(c => c === 'rainy' || c === 'snowy'));

/**
 * The chance today has any condition. It starts at MONTHLY_TARGET spread over the month, then a
 * rubber band nudges it toward the target: higher when this month has had fewer conditions than
 * expected for the days opened so far, lower when it has had more. A condition yesterday makes
 * one today less likely.
 */
export function conditionChance(history: Readonly<Record<string, DayCondition>>, date: string): number {
  const daysInMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const base = MONTHLY_TARGET / daysInMonth;
  const month = date.slice(0, 7);
  const opened = Object.entries(history).filter(([d]) => d.startsWith(month) && d < date);
  const had = opened.filter(([, c]) => c !== 'clear').length;
  // Two conditions behind target doubles the chance; two ahead halves it.
  const band = Math.min(RUBBER_BAND.max, Math.max(RUBBER_BAND.min, 2 ** ((opened.length * base - had) / 2)));
  const yesterday = history[addDays(date, -1)];
  const cooldown = yesterday && yesterday !== 'clear' ? AFTER_CONDITION : 1;
  return Math.min(1, base * band * cooldown);
}

/** Each condition's weight for this date, after the winter swap and the repeat penalty. */
export function conditionWeights(history: Readonly<Record<string, DayCondition>>, date: string): [ConditionId, number][] {
  const yesterday = history[addDays(date, -1)] ?? 'clear';
  return Object.entries(CONDITION_WEIGHTS).map(([id, weight]) => {
    const condition = (id === 'rainy' && isWinter(date) ? 'snowy' : id) as ConditionId;
    return [condition, sameKind(condition, yesterday) ? weight * SAME_AGAIN : weight];
  });
}

/**
 * Today's condition, from this player's own history: every player rolls their own. `random` is
 * injectable so tests and simulations are repeatable.
 */
export function rollCondition(history: Readonly<Record<string, DayCondition>>, date: string,
                              random: () => number = Math.random): DayCondition {
  if (random() >= conditionChance(history, date)) {
    return 'clear';
  }
  const weights = conditionWeights(history, date);
  let pick = random() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, weight] of weights) {
    pick -= weight;
    if (pick < 0) {
      return id;
    }
  }
  return weights[weights.length - 1][0];
}

/** Keeps the condition history to about as long as the day history. */
export function pruneConditions(history: Readonly<Record<string, DayCondition>>, today: string, keepDays: number): Record<string, DayCondition> {
  const oldest = addDays(today, -keepDays);
  return Object.fromEntries(Object.entries(history).filter(([d]) => d >= oldest));
}

