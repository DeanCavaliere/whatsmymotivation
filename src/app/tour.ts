import type {Stats} from './stats.service';

/**
 * Getting started: a short checklist for new players. Finishing it (or skipping it) earns the first ✦.
 * With the daily quest switched off, looking at your stats takes the quest's place.
 */
export type TourStep = 'roll' | 'quest' | 'stats' | 'return';

export interface TourItem {
  step: TourStep;
  label: string;
  done: boolean;
}

/** Where a player is in Getting started. */
export interface Tour {
  /** Set once it's finished or skipped, so it only rewards once. */
  finished: boolean;
  /** For the stats step, when the daily quest is off. */
  sawStats: boolean;
}

export function newTour(): Tour {
  return {finished: false, sawStats: false};
}

const LABELS: Record<TourStep, string> = {
  roll: 'Roll for motivation',
  quest: 'Finish today\'s quest',
  stats: 'Look at your stats',
  return: 'Come back tomorrow',
};

/** The checklist, worked out from what the player has done; null once it's finished. */
export function tourItems(stats: Stats, quests: boolean): TourItem[] | null {
  if (stats.tour.finished) {
    return null;
  }
  const done: Record<TourStep, boolean> = {
    roll: stats.days.length > 0,
    quest: stats.days.some(d => d.quest?.done),
    stats: stats.tour.sawStats,
    // Any later day counts, so a missed day doesn't lock anyone out of the ✦.
    return: stats.days.length > 1,
  };
  const steps: TourStep[] = ['roll', quests ? 'quest' : 'stats', 'return'];
  return steps.map(step => ({step, label: LABELS[step], done: done[step]}));
}

export function tourDone(items: readonly TourItem[]): number {
  return items.filter(i => i.done).length;
}
