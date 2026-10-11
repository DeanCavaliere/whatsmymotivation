import {DIE_SIDES, DieSides, RollMode} from './motivation';
import {addDays, INSPIRATION_CAP, Stats} from './stats.service';

/** The roll that was just recorded, with both dice when rolling with advantage or disadvantage. */
export interface RollContext {
  /** Every die thrown. */
  values: readonly number[];
  /** The die that counts. */
  value: number;
  sides: DieSides;
  mode: RollMode;
  /** Whether this became the day's roll (a first roll or a reroll). */
  isDayRoll: boolean;
  /** The day's roll this one replaced, when it was a reroll. */
  rerolledFrom: number | null;
  /** Local date, YYYY-MM-DD. */
  date: string;
}

export interface Progress {
  current: number;
  goal: number;
  /** "days", "dice", "rolls" */
  unit: string;
}

export interface Badge {
  id: string;
  icon: string;
  name: string;
  /** How to earn it, shown whether or not it's earned. */
  description: string;
  /** Checked after each roll, with the stats already updated. */
  earned(stats: Stats, roll: RollContext): boolean;
  /** For badges earned by counting up. */
  progress?(stats: Stats): Progress;
}

const twoDice = (roll: RollContext) => roll.values.length === 2;
const diceRolled = (stats: Stats) => DIE_SIDES.filter(sides => (stats.counts[sides] ?? []).some(n => n > 0)).length;

function streakBadge(id: string, icon: string, name: string, days: number): Badge {
  return {
    id, icon, name,
    description: `Keep a ${days}-day streak.`,
    earned: stats => stats.streak.current >= days,
    progress: stats => ({current: Math.min(stats.streak.current, days), goal: days, unit: 'days'}),
  };
}

function rollCountBadge(id: string, icon: string, name: string, rolls: number): Badge {
  return {
    id, icon, name,
    description: `Roll ${rolls.toLocaleString('en-US')} times, practice rolls included.`,
    earned: stats => stats.lifetimeRolls >= rolls,
    progress: stats => ({current: Math.min(stats.lifetimeRolls, rolls), goal: rolls, unit: 'rolls'}),
  };
}

export const BADGES: readonly Badge[] = [
  {
    id: 'first-roll', icon: '🎲', name: 'First roll',
    description: 'Roll for motivation for the first time.',
    earned: stats => stats.lifetimeRolls >= 1,
  },
  {
    id: 'natural', icon: '🌟', name: 'Natural',
    description: 'Roll your die\'s top face.',
    earned: (_, roll) => roll.value === roll.sides,
  },
  {
    id: 'rock-bottom', icon: '💀', name: 'Rock bottom',
    description: 'Roll a natural 1.',
    earned: (_, roll) => roll.value === 1,
  },
  {
    id: 'snake-eyes', icon: '🐍', name: 'Snake eyes',
    description: 'Both dice show 1 with advantage or disadvantage.',
    earned: (_, roll) => twoDice(roll) && roll.values.every(v => v === 1),
  },
  {
    id: 'double-crit', icon: '✨', name: 'Double crit',
    description: 'Both dice show the top face with advantage or disadvantage.',
    earned: (_, roll) => twoDice(roll) && roll.values.every(v => v === roll.sides),
  },
  {
    id: 'collector', icon: '🧰', name: 'Collector',
    description: 'Roll every kind of die at least once: d4, d6, d8, d10, d12 and d20.',
    earned: stats => diceRolled(stats) === DIE_SIDES.length,
    progress: stats => ({current: diceRolled(stats), goal: DIE_SIDES.length, unit: 'dice'}),
  },
  streakBadge('streak-7', '🔥', 'On a roll', 7),
  streakBadge('streak-30', '📅', 'Habit', 30),
  streakBadge('streak-100', '💯', 'Centurion', 100),
  {
    id: 'comeback', icon: '🔄', name: 'Comeback',
    description: 'A natural 1 one day, then the top face the next.',
    earned: (stats, roll) => {
      if (!roll.isDayRoll || roll.value !== roll.sides) {
        return false;
      }
      const yesterday = stats.days.find(d => d.date === addDays(roll.date, -1));
      return yesterday?.value === 1;
    },
  },
  rollCountBadge('rolls-100', '🎯', 'Regular', 100),
  rollCountBadge('rolls-1000', '🏆', 'Devoted', 1000),
  {
    id: 'hoarder', icon: '💰', name: 'Hoarder',
    description: `Hold ${INSPIRATION_CAP} ✦ Inspiration at once.`,
    earned: stats => stats.inspiration.held >= INSPIRATION_CAP,
    progress: stats => ({current: stats.inspiration.held, goal: INSPIRATION_CAP, unit: '✦'}),
  },
  {
    id: 'big-spender', icon: '💸', name: 'Big spender',
    description: 'Spend 5 ✦ Inspiration on rerolls.',
    earned: stats => stats.rerolls.used >= 5,
    progress: stats => ({current: Math.min(stats.rerolls.used, 5), goal: 5, unit: '✦'}),
  },
  {
    id: 'lucky-reroll', icon: '🍀', name: 'Lucky reroll',
    description: 'Reroll a natural 1 into the top face.',
    earned: (_, roll) => roll.rerolledFrom === 1 && roll.value === roll.sides,
  },
];

/** Badges this roll earns that weren't earned before. */
export function newBadges(stats: Stats, roll: RollContext): Badge[] {
  return BADGES.filter(b => !stats.achievements[b.id] && b.earned(stats, roll));
}
