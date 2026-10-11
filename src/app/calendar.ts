import {DieSides, Tier, tierFor} from './motivation';
import {DayRoll, localDateKey} from './stats.service';

export interface CalendarDay {
  /** YYYY-MM-DD. */
  date: string;
  /** Day of the month. */
  day: number;
  roll: DayRoll | null;
  tier: Tier | null;
  isToday: boolean;
  isFuture: boolean;
}

export interface CalendarMonth {
  year: number;
  /** 0-11, as in Date. */
  month: number;
  /** Empty cells before the 1st; weeks start on Sunday. */
  leading: number;
  days: CalendarDay[];
  rolled: number;
  /** The average roll, when every roll that month was on the same die. */
  average: number | null;
  averageSides: DieSides | null;
  /** Natural top faces. */
  crits: number;
}

export function calendarMonth(days: readonly DayRoll[], year: number, month: number, now: Date = new Date()): CalendarMonth {
  const byDate = new Map(days.map(d => [d.date, d]));
  const today = localDateKey(now);
  const count = new Date(year, month + 1, 0).getDate();
  const cells: CalendarDay[] = Array.from({length: count}, (_, i) => {
    const date = localDateKey(new Date(year, month, i + 1));
    const roll = byDate.get(date) ?? null;
    return {
      date,
      day: i + 1,
      roll,
      tier: roll ? tierFor(roll.value, roll.sides) : null,
      isToday: date === today,
      isFuture: date > today,
    };
  });
  const rolls = cells.flatMap(c => c.roll ? [c.roll] : []);
  const sameDie = rolls.length > 0 && rolls.every(r => r.sides === rolls[0].sides);
  return {
    year,
    month,
    leading: new Date(year, month, 1).getDay(),
    days: cells,
    rolled: rolls.length,
    average: sameDie ? rolls.reduce((sum, r) => sum + r.value, 0) / rolls.length : null,
    averageSides: sameDie ? rolls[0].sides : null,
    crits: rolls.filter(r => r.value === r.sides).length,
  };
}

/** The month of the oldest stored day, or this month when there are none. */
export function earliestMonth(days: readonly DayRoll[], now: Date = new Date()): { year: number; month: number } {
  const oldest = days.reduce<string | null>((min, d) => min === null || d.date < min ? d.date : min, null);
  if (!oldest) {
    return {year: now.getFullYear(), month: now.getMonth()};
  }
  const [y, m] = oldest.split('-').map(Number);
  return {year: y, month: m - 1};
}

/** The month `by` months before or after the given one. */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const date = new Date(year, month + by, 1);
  return {year: date.getFullYear(), month: date.getMonth()};
}
