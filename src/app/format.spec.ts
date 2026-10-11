import {formatAverage, formatCount, formatDate, formatPercent} from './format';

describe('format', () => {
  const date = new Date(2026, 9, 11, 15, 4, 5);

  it('formats dates the way the old Angular pipes did', () => {
    expect(formatDate(date, 'day')).toBe('Oct 11, 2026');
    expect(formatDate(date, 'month')).toBe('October 2026');
    expect(formatDate(date, 'weekday')).toBe('Sunday, October 11');
    // Some ICU versions put a narrow no-break space before PM.
    expect(formatDate(date.getTime(), 'moment')).toMatch(/^Oct 11, 2026, 3:04:05\sPM$/);
  });

  it('formats numbers', () => {
    expect(formatCount(1000)).toBe('1,000');
    expect(formatAverage(10)).toBe('10.0');
    expect(formatAverage(10.46)).toBe('10.5');
    expect(formatPercent(0.25)).toBe('25%');
    expect(formatPercent(1 / 3)).toBe('33%');
  });
});
