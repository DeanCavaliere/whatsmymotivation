import {Tier, tierFor} from './motivation';
import {addDays, DayRoll, localDateKey} from './stats.service';

/** One square per tier, worst to best. */
export const TIER_EMOJI: Record<Tier, string> = {
  'crit-fail': '💀',
  'very-low': '🟥',
  'low': '🟧',
  'mid': '🟨',
  'high': '🟩',
  'very-high': '🟦',
  'crit-success': '🌟',
};

/** A day with no roll. */
export const MISSED_EMOJI = '⬛';

const MODE_TAG = {normal: '', advantage: ' (adv)', disadvantage: ' (dis)'} as const;

/** The last `length` days, oldest first and ending today, one emoji each. */
export function dayStrip(days: readonly DayRoll[], now: Date = new Date(), length = 7): string {
  const byDate = new Map(days.map(d => [d.date, d]));
  const today = localDateKey(now);
  return Array.from({length}, (_, i) => {
    const day = byDate.get(addDays(today, i - length + 1));
    return day ? TIER_EMOJI[tierFor(day.value, day.sides)] : MISSED_EMOJI;
  }).join('');
}

/**
 * What the Share button sends, e.g.
 * "What's my motivation? Oct 10 · 🎲 17 (adv)\n🟨🟩⬛🟩🟥🟩🟦 🔥4".
 * The site link is added by the caller.
 */
export function shareText(day: DayRoll, days: readonly DayRoll[], streak: number, now: Date = new Date()): string {
  const date = now.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  const die = day.sides === 20 ? '' : ` on d${day.sides}`;
  const fire = streak > 1 ? ` 🔥${streak}` : '';
  return `What's my motivation? ${date} · 🎲 ${day.value}${die}${MODE_TAG[day.mode]}\n${dayStrip(days, now)}${fire}`;
}
