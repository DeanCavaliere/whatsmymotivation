import {celebrationFor, Tier, diceNotation, keptValue, MESSAGES, randomD20, tierFor, verdictFor} from './motivation';

describe('motivation', () => {
  describe('tierFor', () => {
    const cases: [number, Tier][] = [
      [1, 'crit-fail'],
      [2, 'very-low'], [5, 'very-low'],
      [6, 'low'], [8, 'low'],
      [9, 'mid'], [11, 'mid'],
      [12, 'high'], [14, 'high'],
      [15, 'very-high'], [19, 'very-high'],
      [20, 'crit-success'],
    ];
    cases.forEach(([value, tier]) => {
      it(`maps ${value} to ${tier}`, () => expect(tierFor(value)).toBe(tier));
    });
  });

  it('celebrates highs with confetti and lows with tears', () => {
    expect(celebrationFor('crit-success')).toBe('confetti');
    expect(celebrationFor('very-high')).toBe('confetti');
    expect(celebrationFor('crit-fail')).toBe('tears');
    expect(celebrationFor('very-low')).toBe('tears');
    expect(celebrationFor('mid')).toBeNull();
  });

  it('picks a message from the tier using the injected random source', () => {
    expect(verdictFor(20, () => 0).message).toBe(MESSAGES['crit-success'][0]);
    expect(verdictFor(20, () => 0.999).message).toBe(MESSAGES['crit-success'][2]);
    // Math.random() never returns 1, but a custom source might.
    expect(verdictFor(1, () => 1).message).toBe(MESSAGES['crit-fail'][2]);
  });

  it('rolls two dice for advantage and disadvantage', () => {
    expect(diceNotation('normal')).toBe('1d20');
    expect(diceNotation('advantage')).toBe('2d20');
    expect(diceNotation('disadvantage')).toBe('2d20');
  });

  it('keeps the right die for each mode', () => {
    expect(keptValue([7], 'normal')).toBe(7);
    expect(keptValue([4, 17], 'advantage')).toBe(17);
    expect(keptValue([4, 17], 'disadvantage')).toBe(4);
    expect(() => keptValue([], 'normal')).toThrowError();
  });

  it('randomD20 stays within 1..20 and hits both ends', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = randomD20();
      expect(Number.isInteger(v) && v >= 1 && v <= 20).toBe(true);
      seen.add(v);
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(20)).toBe(true);
  });
});
