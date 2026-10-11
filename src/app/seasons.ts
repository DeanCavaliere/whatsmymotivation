import {Tier} from './motivation';

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface DoodlePath {
  d: string;
  /** Solid chalk instead of an outline (berries, eyes). */
  fill?: boolean;
}

/** A chalk drawing in one corner of the felt, drawn in a 120×120 box centered on (0, 0). */
export interface Doodle {
  corner: Corner;
  paths: DoodlePath[];
  /** Relative to the base doodle size. */
  size: number;
  /** Degrees. Every doodle is turned and nudged a little so they don't look stamped on. */
  rotate: number;
  /** Nudges as a percent of the doodle's own size, toward the middle for positive values. */
  dx: number;
  dy: number;
}

export interface Season {
  id: string;
  label: string;
  emoji: string;
  /** Inclusive local dates as [month (1-12), day]. */
  start: [number, number];
  end: [number, number];
  felt: string;
  chalk: string;
  dice: string;
  diceLabel: string;
  /** One themed line per tier; `{max}` is the die's top face. */
  messages: Record<Tier, string>;
  doodles: Doodle[];
}

// ---------- Doodle shapes ----------

function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

function polar(r: number, degrees: number): [number, number] {
  const a = degrees * Math.PI / 180;
  return [+(r * Math.cos(a)).toFixed(1), +(r * Math.sin(a)).toFixed(1)];
}

/** Six arms with matching V-shaped branches, so every arm is identical. */
function snowflake(branches: boolean): string {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const angle = k * 60 - 90;
    const [x, y] = polar(52, angle);
    d += `M0 0 L${x} ${y} `;
    if (branches) {
      for (const [r, length] of [[22, 13], [38, 10]]) {
        const [px, py] = polar(r, angle);
        const [ax, ay] = polar(length, angle - 45);
        const [bx, by] = polar(length, angle + 45);
        d += `M${+(px + ax).toFixed(1)} ${+(py + ay).toFixed(1)} L${px} ${py} L${+(px + bx).toFixed(1)} ${+(py + by).toFixed(1)} `;
      }
    }
  }
  return d.trim();
}

/** Mirrors a path left to right; works on the absolute M/L/C/Z paths used here. */
function mirror(d: string): string {
  return d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${-x} ${y}`);
}

const HOLLY_LEAF = 'M0 0 C-22 -6 -44 -4 -56 -22 C-45 -21 -41 -34 -30 -31 C-28 -41 -15 -41 -11 -30 C-4 -31 2 -20 0 0 Z';
const HEART = 'M0 30 C-45 0 -38 -34 -15 -34 C-6 -34 0 -26 0 -19 C0 -26 6 -34 15 -34 C38 -34 45 0 0 30 Z';
const BAT = 'M-58 0 C-40 -24 -20 -24 -10 -5 C-6 -14 6 -14 10 -5 C20 -24 40 -24 58 0 C40 -5 30 4 26 14 C18 5 12 9 4 18 '
  + 'L0 12 L-4 18 C-12 9 -18 5 -26 14 C-30 4 -40 -5 -58 0 Z';
const SHAMROCK_LEAF = 'M0 0 C-8 -24 -36 -32 -36 -10 C-36 0 -24 5 0 0 Z';
const STAR = 'M0 -46 L11 -15 L44 -14 L18 6 L27 37 L0 19 L-27 37 L-18 6 L-44 -14 L-11 -15 Z';

function rotated(d: string, degrees: number): string {
  return d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => {
    const a = degrees * Math.PI / 180;
    return `${+(x * Math.cos(a) - y * Math.sin(a)).toFixed(1)} ${+(x * Math.sin(a) + y * Math.cos(a)).toFixed(1)}`;
  });
}

const shamrock = (stem: boolean): DoodlePath[] => [
  ...[0, 90, 180, 270].map(a => ({d: rotated(SHAMROCK_LEAF, a + 45)})),
  ...(stem ? [{d: 'M0 0 C8 18 18 34 34 48'}] : []),
];

// ---------- Seasons ----------

export const SEASONS: readonly Season[] = [
  {
    id: 'spooky',
    label: 'Spooky',
    emoji: '🎃',
    start: [10, 1],
    end: [10, 31],
    felt: '#251433',
    chalk: 'rgba(255, 150, 60, 0.65)',
    dice: '#e8731c',
    diceLabel: 'Pumpkin',
    messages: {
      'crit-fail': 'Natural 1. The ghosts are getting more done than you today.',
      'very-low': 'Spooky low. Hide under a blanket and answer one email.',
      'low': 'A little cursed today. Pace yourself.',
      'mid': 'A perfectly average haunting.',
      'high': 'Good roll. Carve out some time for the big stuff.',
      'very-high': 'Monster motivation! Go wreak (productive) havoc.',
      'crit-success': 'Natural {max}! A frightfully productive day ahead.',
    },
    doodles: [
      {corner: 'top-left', paths: [{d: BAT}], size: 1, rotate: -12, dx: 10, dy: 25},
      {corner: 'top-right', paths: [{d: BAT}], size: 0.65, rotate: 16, dx: 30, dy: 45},
      {corner: 'bottom-right', size: 0.9, rotate: -8, dx: 5, dy: 10, paths: [
        {d: 'M-50 6 C-50 -26 -26 -36 0 -36 C26 -36 50 -26 50 6 C50 34 26 42 0 42 C-26 42 -50 34 -50 6 Z'},
        {d: 'M-18 -34 C-28 -8 -28 18 -18 41 M18 -34 C28 -8 28 18 18 41'},
        {d: 'M-3 -36 C-4 -46 2 -52 12 -55'},
      ]},
      {corner: 'bottom-left', size: 0.8, rotate: 10, dx: 20, dy: 5, paths: [
        {d: 'M-28 46 L-28 -6 C-28 -48 28 -48 28 -6 L28 46 L17 36 L6 46 L-6 36 L-17 46 Z'},
        {d: circle(-10, -8, 5), fill: true},
        {d: circle(10, -8, 5), fill: true},
      ]},
    ],
  },
  {
    id: 'festive',
    label: 'Festive',
    emoji: '🎄',
    start: [12, 1],
    end: [12, 31],
    felt: '#4e0f17',
    chalk: 'rgba(240, 248, 255, 0.65)',
    dice: '#2e8555',
    diceLabel: 'Pine',
    messages: {
      'crit-fail': 'Natural 1. Coal in your stocking. Back to bed.',
      'very-low': 'Low roll. Hot cocoa and a single to-do.',
      'low': 'Snowed in. Pick one small task and call it a win.',
      'mid': 'Merry and mid.',
      'high': 'Good roll. Sleigh that to-do list.',
      'very-high': 'You\'re on the nice list today. Go get it!',
      'crit-success': 'Natural {max}! A holiday miracle of productivity.',
    },
    doodles: [
      {corner: 'top-left', paths: [{d: snowflake(true)}], size: 1, rotate: 12, dx: 8, dy: 12},
      {corner: 'top-right', paths: [{d: snowflake(false)}], size: 0.5, rotate: -18, dx: 45, dy: 55},
      {corner: 'bottom-right', size: 1, rotate: -14, dx: 0, dy: 0, paths: [
        {d: HOLLY_LEAF},
        {d: mirror(HOLLY_LEAF)},
        {d: circle(-9, 6, 8.5), fill: true},
        {d: circle(9, 6, 8.5), fill: true},
        {d: circle(0, -8, 8.5), fill: true},
      ]},
      {corner: 'bottom-left', paths: [{d: STAR}], size: 0.75, rotate: 16, dx: 22, dy: -10},
    ],
  },
  {
    id: 'valentine',
    label: 'Valentine\'s',
    emoji: '💘',
    start: [2, 10],
    end: [2, 14],
    felt: '#4f1530',
    chalk: 'rgba(255, 185, 210, 0.6)',
    dice: '#f07aa5',
    diceLabel: 'Rose',
    messages: {
      'crit-fail': 'Natural 1. You and your bed are in a committed relationship today.',
      'very-low': 'Low roll. Show yourself some love and keep it light.',
      'low': 'Not feeling it today. Be gentle with yourself.',
      'mid': 'A lukewarm date with your to-do list.',
      'high': 'Good roll. Fall for a task you\'ve been avoiding.',
      'very-high': 'Head over heels motivated!',
      'crit-success': 'Natural {max}! Your to-do list never stood a chance.',
    },
    doodles: [
      {corner: 'top-left', paths: [{d: HEART}], size: 0.9, rotate: -14, dx: 12, dy: 15},
      {corner: 'top-right', paths: [{d: HEART}], size: 0.55, rotate: 18, dx: 40, dy: 45},
      {corner: 'bottom-right', size: 1.1, rotate: -6, dx: 5, dy: 5, paths: [
        {d: HEART},
        {d: 'M-54 30 L50 -26 M50 -26 L36 -26 M50 -26 L45 -13 M-54 30 L-62 27 M-54 30 L-56 39 M-46 26 L-54 23 M-46 26 L-48 35'},
      ]},
      {corner: 'bottom-left', paths: [{d: HEART}], size: 0.6, rotate: 12, dx: 30, dy: -15},
    ],
  },
  {
    id: 'lucky',
    label: 'Lucky',
    emoji: '🍀',
    start: [3, 15],
    end: [3, 17],
    felt: '#07452a',
    chalk: 'rgba(255, 215, 110, 0.65)',
    dice: '#d9a13b',
    diceLabel: 'Gold',
    messages: {
      'crit-fail': 'Natural 1. The luck of the Irish skipped you today.',
      'very-low': 'Low roll. Keep your four-leaf clover close.',
      'low': 'A bit unlucky. One small task, then call it a win.',
      'mid': 'Neither lucky nor unlucky. Just a regular day.',
      'high': 'Luck\'s on your side. Tackle something big.',
      'very-high': 'Pot-of-gold motivation today!',
      'crit-success': 'Natural {max}! You found the end of the rainbow.',
    },
    doodles: [
      {corner: 'top-left', paths: shamrock(true), size: 1, rotate: -16, dx: 10, dy: 10},
      {corner: 'top-right', paths: [{d: circle(0, 0, 30)}, {d: circle(0, 0, 19)}], size: 0.6, rotate: 0, dx: 40, dy: 45},
      // Pushed down and out, away from the chalk lettering.
      {corner: 'bottom-right', size: 1.15, rotate: 4, dx: -12, dy: -28, paths: [
        {d: 'M-55 30 A55 55 0 0 1 55 30'},
        {d: 'M-40 30 A40 40 0 0 1 40 30'},
        {d: 'M-25 30 A25 25 0 0 1 25 30'},
      ]},
      {corner: 'bottom-left', paths: shamrock(false), size: 0.7, rotate: 22, dx: 25, dy: -12},
    ],
  },
];

function dayOfYear(month: number, day: number): number {
  return month * 100 + day;
}

/** The season covering this local date, if any. */
export function activeSeason(date: Date): Season | null {
  const today = dayOfYear(date.getMonth() + 1, date.getDate());
  return SEASONS.find(s => today >= dayOfYear(...s.start) && today <= dayOfYear(...s.end)) ?? null;
}

/** Identifies one year's run of a season, so turning it off lasts until it ends. */
export function seasonKey(season: Season, date: Date): string {
  return `${season.id}-${date.getFullYear()}`;
}
