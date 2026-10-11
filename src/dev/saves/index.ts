import {Stats} from '../../app/stats.service';
import {day2} from './day2';
import {fresh} from './fresh';
import {month} from './month';
import {year} from './year';

/** A dev save, built fresh from today's date each time it loads so the calendar always lines up. */
export type DevSave = (now: Date) => Stats;

/** Loaded with ?save=<name>. */
export const SAVES: Readonly<Record<string, DevSave>> = {fresh, day2, month, year};
