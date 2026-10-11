// Small Intl formatters in place of Angular's date, number and percent pipes, which bring in all of @angular/common.

const LOCALE = 'en-US';

const DATES = {
  /** Oct 11, 2026 */
  day: new Intl.DateTimeFormat(LOCALE, {month: 'short', day: 'numeric', year: 'numeric'}),
  /** October 2026 */
  month: new Intl.DateTimeFormat(LOCALE, {month: 'long', year: 'numeric'}),
  /** Sunday, October 11 */
  weekday: new Intl.DateTimeFormat(LOCALE, {weekday: 'long', month: 'long', day: 'numeric'}),
  /** Oct 11, 2026, 3:04:05 PM */
  moment: new Intl.DateTimeFormat(LOCALE, {dateStyle: 'medium', timeStyle: 'medium'}),
};

export type DateFormat = keyof typeof DATES;

const WHOLE = new Intl.NumberFormat(LOCALE);
const ONE_DECIMAL = new Intl.NumberFormat(LOCALE, {minimumFractionDigits: 1, maximumFractionDigits: 1});
const PERCENT = new Intl.NumberFormat(LOCALE, {style: 'percent'});

export function formatDate(date: Date | number, format: DateFormat): string {
  return DATES[format].format(date);
}

/** Grouped thousands, e.g. 1,000. */
export function formatCount(value: number): string {
  return WHOLE.format(value);
}

/** Exactly one decimal place, e.g. 10.5. */
export function formatAverage(value: number): string {
  return ONE_DECIMAL.format(value);
}

/** A 0–1 fraction as a whole percent, e.g. 0.25 → 25%. */
export function formatPercent(value: number): string {
  return PERCENT.format(value);
}
