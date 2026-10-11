import {Stats} from '../../app/stats.service';
import {PlannedDay, replay} from '../replay';

/**
 * About a month up to yesterday, with every condition on the calendar (Snowy in place of Rainy in Dec–Feb),
 * two missed days, a few rerolls, 2 ✦ left, notes and badges. Today is still to roll.
 */
const DAYS: PlannedDay[] = [
  {ago: 31, value: 11, quest: true, note: 'Started small. Made the bed.'},
  {ago: 30, value: 6, quest: true},
  {ago: 29, value: 14, condition: 'foggy', quest: true},
  {ago: 28, value: 9, condition: 'rainy'},
  {ago: 27, value: 18, quest: true, note: 'Cleared the whole inbox', extra: [4, 15]},
  {ago: 26, value: 3, reroll: 13, quest: true},
  {ago: 25, value: 20, quest: true, note: 'Nat 20. Went for a run before work.'},
  {ago: 23, value: 16, condition: 'inspired', quest: true},
  {ago: 22, value: 8, sides: 12},
  {ago: 21, value: 12, condition: 'low-gravity', quest: true},
  {ago: 20, value: 15, condition: 'blessed', quest: true, note: 'Everything just went right'},
  {ago: 19, value: 4, condition: 'hexed'},
  {ago: 18, value: 10, quest: true},
  {ago: 17, value: 13, condition: 'foggy', quest: true, note: 'Couldn\'t see a thing until noon'},
  {ago: 16, value: 5, sides: 6},
  {ago: 15, value: 19, quest: true},
  {ago: 14, value: 20, condition: 'stormy', quest: true, note: 'Called down the lightning', extra: [8]},
  {ago: 13, value: 1, note: 'Stayed in bed. Fair.'},
  {ago: 11, value: 11, quest: true},
  {ago: 10, value: 17, condition: 'rainy', quest: true},
  {ago: 9, value: 5, reroll: 20, quest: true, note: 'Rerolled a 5 into a 20!'},
  {ago: 8, value: 14, condition: 'foggy', quest: true},
  {ago: 7, value: 9},
  {ago: 6, value: 12, condition: 'inspired'},
  {ago: 5, value: 16, quest: true, note: 'Finally fixed the bike'},
  {ago: 4, value: 2, condition: 'hexed', reroll: 7},
  {ago: 3, value: 18, condition: 'blessed', quest: true},
  {ago: 2, value: 10, condition: 'low-gravity', quest: true, note: 'Floaty sort of day'},
  {ago: 1, value: 13},
];

export function month(now: Date): Stats {
  return replay(DAYS, now);
}
