import {celebrationFor, DieSides, dieOdds, diceNotation, keptValue, MESSAGES, randomFace, Tier, tierFor, verdictFor} from './motivation';

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

    it('places smaller dice on the d20 scale, with crits on 1 and the top face', () => {
      expect([1, 2, 3, 4].map(v => tierFor(v, 4))).toEqual(['crit-fail', 'low', 'high', 'crit-success']);
      expect([1, 2, 3, 4, 5, 6].map(v => tierFor(v, 6)))
        .toEqual(['crit-fail', 'very-low', 'mid', 'high', 'very-high', 'crit-success']);
    });
  });

  it('works out the odds for each die', () => {
    expect(dieOdds(20)).toEqual({crit: 1 / 20, good: 9 / 20, bad: 5 / 20});
    expect(dieOdds(4)).toEqual({crit: 1 / 4, good: 2 / 4, bad: 1 / 4});
  });

  it('celebrates highs with confetti and lows with tears', () => {
    expect(celebrationFor('crit-success')).toBe('confetti');
    expect(celebrationFor('very-high')).toBe('confetti');
    expect(celebrationFor('crit-fail')).toBe('tears');
    expect(celebrationFor('very-low')).toBe('tears');
    expect(celebrationFor('mid')).toBeNull();
  });

  it('picks a message from the tier using the injected random source', () => {
    expect(verdictFor(20, 20, () => 0).message).toBe(MESSAGES['crit-success'][0]);
    expect(verdictFor(20, 20, () => 0.999).message).toBe(MESSAGES['crit-success'][2]);
    // Math.random() never returns 1, but a custom source might.
    expect(verdictFor(1, 20, () => 1).message).toBe(MESSAGES['crit-fail'][2]);
  });

  it('names the die in crit messages', () => {
    expect(verdictFor(20, 20, () => 0.5).message).toBe('Natural 20! Today is legendary.');
    expect(verdictFor(6, 6, () => 0.5).message).toBe('Natural 6! Today is legendary.');
  });

  it('rolls two dice for advantage and disadvantage', () => {
    expect(diceNotation('normal')).toBe('1d20');
    expect(diceNotation('advantage')).toBe('2d20');
    expect(diceNotation('disadvantage')).toBe('2d20');
    expect(diceNotation('advantage', 6)).toBe('2d6');
  });

  it('keeps the right die for each mode', () => {
    expect(keptValue([7], 'normal')).toBe(7);
    expect(keptValue([4, 17], 'advantage')).toBe(17);
    expect(keptValue([4, 17], 'disadvantage')).toBe(4);
    expect(() => keptValue([], 'normal')).toThrowError();
  });

  ([20, 4] as DieSides[]).forEach(sides => {
    it(`randomFace stays within 1..${sides} and hits both ends`, () => {
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) {
        const v = randomFace(sides);
        expect(Number.isInteger(v) && v >= 1 && v <= sides).toBe(true);
        seen.add(v);
      }
      expect(seen.has(1)).toBe(true);
      expect(seen.has(sides)).toBe(true);
    });
  });
});
