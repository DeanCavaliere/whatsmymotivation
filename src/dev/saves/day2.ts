import {Stats} from '../../app/stats.service';
import {replay} from '../replay';

/** Rolled yesterday and finished the quest, so today's roll finishes Getting started and earns the first ✦. */
export function day2(now: Date): Stats {
  return replay([
    {ago: 1, value: 14, quest: true, note: 'Took the long way home'},
  ], now);
}
