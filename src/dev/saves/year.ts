import {DayCondition, rollCondition} from '../../app/conditions';
import {addDays, localDateKey, Stats} from '../../app/stats.service';
import {PlannedDay, replay, seeded} from '../replay';

const NOTES = [
  'Deep cleaned the kitchen',
  'Long walk, no phone',
  'Called home',
  'Shipped the thing',
  'Read for an hour',
  'Meal prepped for the week',
  'Nothing much, and that was fine',
  'Fixed the leaky tap',
  'Gym, then a nap',
  'Wrote three pages',
];

/**
 * A little over a year up to yesterday, for paging the calendar back and filling the stats. Conditions
 * are rolled the way the app rolls them; one stretch is on a d12. Today is still to roll.
 */
export function year(now: Date): Stats {
  const random = seeded(2026);
  const pick = (n: number) => 1 + Math.floor(random() * n);
  const today = localDateKey(now);
  const conditions: Record<string, DayCondition> = {};
  const days: PlannedDay[] = [];
  for (let ago = 380; ago >= 1; ago--) {
    // A missed day now and then.
    if (ago > 1 && random() < 0.12) {
      continue;
    }
    const date = addDays(today, -ago);
    // The first two days are Getting started, which is always clear.
    const condition = days.length < 2 ? 'clear' : rollCondition(conditions, date, random);
    conditions[date] = condition;
    const sides = ago >= 170 && ago <= 200 ? 12 : 20;
    const value = pick(sides);
    days.push({
      ago, value, sides, condition,
      quest: random() < 0.6,
      note: random() < 0.15 ? NOTES[pick(NOTES.length) - 1] : undefined,
      reroll: value <= 4 && random() < 0.5 ? pick(sides) : undefined,
      extra: random() < 0.25 ? [pick(sides)] : undefined,
    });
  }
  return replay(days, now, random);
}
