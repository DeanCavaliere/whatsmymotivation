import {dayStrip, MISSED_EMOJI, shareText, TIER_EMOJI} from './share';
import {DayRoll} from './stats.service';

const NOW = new Date(2026, 9, 10, 9, 30);

function day(date: string, value: number, extra: Partial<DayRoll> = {}): DayRoll {
  return {date, value, sides: 20, mode: 'normal', ...extra};
}

describe('dayStrip', () => {
  it('shows the last seven days oldest first, with a gap for missed days', () => {
    const days = [day('2026-10-10', 20), day('2026-10-09', 1), day('2026-10-07', 10), day('2026-10-04', 15)];
    expect([...new Intl.Segmenter().segment(dayStrip(days, NOW))].map(s => s.segment)).toEqual([
      TIER_EMOJI['very-high'], MISSED_EMOJI, MISSED_EMOJI, TIER_EMOJI.mid, MISSED_EMOJI, TIER_EMOJI['crit-fail'], TIER_EMOJI['crit-success'],
    ]);
  });

  it('ignores days older than the strip', () => {
    expect(dayStrip([day('2026-10-03', 20)], NOW)).toBe(MISSED_EMOJI.repeat(7));
  });

  it('scales other dice to the d20 tiers', () => {
    expect(dayStrip([day('2026-10-10', 4, {sides: 4})], NOW).endsWith(TIER_EMOJI['crit-success'])).toBe(true);
  });
});

describe('shareText', () => {
  it('names the date, roll, mode and streak', () => {
    const today = day('2026-10-10', 17, {mode: 'advantage'});
    expect(shareText(today, [today], 4, NOW))
      .toBe(`What's my motivation? Oct 10 · 🎲 17 (adv)\n${MISSED_EMOJI.repeat(6)}${TIER_EMOJI['very-high']} 🔥4`);
  });

  it('names the die when it is not a d20 and leaves out a one-day streak', () => {
    const today = day('2026-10-10', 3, {sides: 6, mode: 'disadvantage'});
    expect(shareText(today, [today], 1, NOW).split('\n')[0]).toBe('What\'s my motivation? Oct 10 · 🎲 3 on d6 (dis)');
    expect(shareText(today, [today], 1, NOW)).not.toContain('🔥');
  });
});
