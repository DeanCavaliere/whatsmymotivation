import {Tier} from './motivation';

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface DoodlePath {
  d: string;
  /** Solid chalk instead of an outline (berries, eyes). */
  fill?: boolean;
  /** Line width in the doodle's 120-unit box, in place of the usual 5. */
  width?: number;
  /** Its own line color, in place of the doodle's chalk (a spider's silk). */
  tint?: string;
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
  /** Sits right in its corner of the felt instead of inset from it, like a cobweb. */
  flush?: boolean;
  /** Its own chalk color, in place of the season's. */
  tint?: string;
  /**
   * Hangs on a thread tied at this height in its box, and now and then drops a little and climbs back.
   * Nothing shows above the tie, so the thread drawn above it pays out as it drops.
   */
  hangsFrom?: number;
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
  /** Something extra on the felt: a dark vignette, or hearts floating up. */
  effect?: 'vignette' | 'hearts';
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
/** Hearts drifting up the felt in Valentine's week: where each starts, how big, how slow, and its color. */
export const HEART_PATH = HEART;
export const FLOATING_HEARTS = Array.from({length: 14}, (_, i) => ({
  x: (i * 37 + 11) % 100,
  size: 12 + (i * 7) % 16,
  seconds: 14 + (i * 5) % 11,
  // Negative, so the hearts are already spread up the felt when it appears.
  delay: -((i * 3.7) % 24),
  sway: (i % 2 ? 1 : -1) * (10 + (i * 13) % 20),
  color: ['#ff5c8a', '#ff9bbb', '#e8335f', '#ffc2d4'][i % 4],
}));
const BAT = 'M-58 0 C-40 -24 -20 -24 -10 -5 C-6 -14 6 -14 10 -5 C20 -24 40 -24 58 0 C40 -5 30 4 26 14 C18 5 12 9 4 18 '
  + 'L0 12 L-4 18 C-12 9 -18 5 -26 14 C-30 4 -40 -5 -58 0 Z';
const SHAMROCK_LEAF = 'M0 0 C-8 -24 -36 -32 -36 -10 C-36 0 -24 5 0 0 Z';
/** A $ for the gold coin. */
const DOLLAR = 'M10 -9 C8 -15 -10 -16 -10 -7 C-10 1 10 -2 10 7 C10 16 -9 16 -11 9 M0 -21 L0 21';
/** A wrapped present: box, lid, ribbon and bow. */
const PRESENT: DoodlePath[] = [
  {d: 'M-36 -6 L-36 44 L36 44 L36 -6'},
  {d: 'M-42 -20 L42 -20 L42 -6 L-42 -6 Z'},
  {d: 'M-7 -20 L-7 44 M7 -20 L7 44'},
  {d: 'M0 -20 C-6 -36 -30 -42 -28 -28 C-27 -20 -12 -20 0 -20 C12 -20 27 -20 28 -28 C30 -42 6 -36 0 -20 Z'},
];

function rotated(d: string, degrees: number): string {
  return d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => {
    const a = degrees * Math.PI / 180;
    return `${+(x * Math.cos(a) - y * Math.sin(a)).toFixed(1)} ${+(x * Math.sin(a) + y * Math.cos(a)).toFixed(1)}`;
  });
}

/**
 * The cobweb's frame threads, in the top-right corner of its box: along the top, down to an anchor, a
 * long diagonal across, and back to the side. The hub sits just in from the corner.
 */
const WEB_HUB: [number, number] = [38, -40];
/** The open ring at the hub, which the spokes and threads start outside of. */
const WEB_HUB_RADIUS = 5;
const WEB_FRAME: [number, number][] = [[60, -60], [-8, -60], [-13, -43], [34, 8], [60, 14]];
/** Where the frame's two corners are tied off, far out along the felt. */
const WEB_TIES: [number, number][] = [[-56, -60], [60, 56]];

/** Where a spoke from the hub at `degrees` meets the frame. */
function toFrame(degrees: number): [number, number] {
  const a = degrees * Math.PI / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const [hx, hy] = WEB_HUB;
  let nearest = Infinity;
  WEB_FRAME.forEach(([px, py], i) => {
    const [qx, qy] = WEB_FRAME[(i + 1) % WEB_FRAME.length];
    const [ex, ey] = [qx - px, qy - py];
    const cross = dx * ey - dy * ex;
    if (Math.abs(cross) < 1e-9) {
      return;
    }
    const s = ((px - hx) * ey - (py - hy) * ex) / cross;
    const u = ((px - hx) * dy - (py - hy) * dx) / cross;
    if (s > 0 && u >= 0 && u <= 1) {
      nearest = Math.min(nearest, s);
    }
  });
  return [+(hx + dx * nearest).toFixed(1), +(hy + dy * nearest).toFixed(1)];
}

/** A point `t` of the way along a spoke, from the hub's ring (0) out to the frame (1). */
function alongSpoke(degrees: number, t: number): [number, number] {
  const [x, y] = toFrame(degrees);
  const [hx, hy] = WEB_HUB;
  const length = Math.hypot(x - hx, y - hy);
  const r = WEB_HUB_RADIUS + (length - WEB_HUB_RADIUS) * t;
  return [+(hx + (x - hx) * r / length).toFixed(1), +(hy + (y - hy) * r / length).toFixed(1)];
}

/** Silk: paler than the season's orange chalk. */
const WEB_TINT = 'rgba(235, 232, 245, 0.75)';
const WEB_SPOKES = Array.from({length: 16}, (_, i) => i * 22.5 + 8);
/** Close together by the hub and further apart toward the frame, so the outer rings follow its shape. */
const WEB_RINGS = Array.from({length: 11}, (_, k) => 0.08 + 0.86 * (k / 10) ** 1.15);
/** Where the spider's thread leaves the long diagonal. */
const SPIDER_DROP: [number, number] = [1, -27];
/** Thread drawn above the tie, which pays out as the spider drops (see `Doodle.hangsFrom`). */
const SPIDER_SLACK = 30;

/** A cobweb in the corner: spokes out to the frame, threads sagging toward the hub between them. */
function cobweb(): DoodlePath[] {
  const xy = ([x, y]: [number, number]) => `${x} ${y}`;
  const frame = 'M' + WEB_FRAME.slice(1).map(xy).join(' L')
    + ` M${xy(WEB_FRAME[2])} L${xy(WEB_TIES[0])} M${xy(WEB_FRAME[3])} L${xy(WEB_TIES[1])}`;
  const spokes = WEB_SPOKES.map(a => `M${xy(alongSpoke(a, 0))} L${xy(toFrame(a))}`).join(' ');
  let rings = '';
  for (const t of WEB_RINGS) {
    WEB_SPOKES.forEach((a1, i) => {
      const a2 = WEB_SPOKES[(i + 1) % WEB_SPOKES.length];
      const [from, to] = [alongSpoke(a1, t), alongSpoke(a2, t)];
      const [hx, hy] = WEB_HUB;
      const r = (Math.hypot(from[0] - hx, from[1] - hy) + Math.hypot(to[0] - hx, to[1] - hy)) / 2;
      const [sx, sy] = polar(WEB_HUB_RADIUS + (r - WEB_HUB_RADIUS) * 0.88, a1 + 11.25);
      rings += ` M${xy(from)} Q${+(hx + sx).toFixed(1)} ${+(hy + sy).toFixed(1)} ${xy(to)}`;
    });
  }
  const [hx, hy] = WEB_HUB;
  return [
    {d: frame, width: 1.6},
    {d: spokes, width: 1.2},
    {d: rings.trim() + ' ' + circle(hx, hy, WEB_HUB_RADIUS), width: 1},
  ];
}

/** A spider hanging from the cobweb's diagonal on its own thread: front legs reaching up, back legs down. */
function spider(): DoodlePath[] {
  const [x, y] = [SPIDER_DROP[0], SPIDER_DROP[1] + 33];
  const place = (d: string) => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, px, py) => `${+(+px + x).toFixed(1)} ${+(+py + y).toFixed(1)}`);
  const legs = 'M-2 -5 L-10 -13 L-11 -23 M-3 -3 L-13 -8 L-19 -4 M-3 0 L-13 5 L-17 13 M-2 3 L-9 12 L-10 23';
  const [tx, ty] = SPIDER_DROP;
  return [
    {d: `M${tx} ${ty - SPIDER_SLACK} L${tx} ${ty + 26}`, width: 0.9, tint: WEB_TINT},
    {d: place(legs + ' ' + mirror(legs)), width: 1.8},
    {d: circle(x, y + 6, 6), fill: true},
    {d: circle(x, y - 3, 3.6), fill: true},
  ];
}

/** With a stem, the two lower leaves fan apart so the stem runs between them without touching either. */
const shamrock = (stem: boolean): DoodlePath[] => [
  ...(stem ? [45, 135, 217, 323] : [45, 135, 225, 315]).map(a => ({d: rotated(SHAMROCK_LEAF, a)})),
  ...(stem ? [{d: 'M0 0 C-10 20 -14 34 -10 52'}] : []),
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
    effect: 'vignette',
    doodles: [
      {corner: 'top-left', paths: [{d: BAT}], size: 1, rotate: -12, dx: 10, dy: 25},
      {corner: 'bottom-left', size: 0.75, rotate: 8, dx: 25, dy: 20, paths: [
        {d: 'M-28 46 L-28 -6 C-28 -48 28 -48 28 -6 L28 46 L17 36 L6 46 L-6 36 L-17 46 Z'},
        {d: circle(-10, -8, 5), fill: true},
        {d: circle(10, -8, 5), fill: true},
      ]},
      {corner: 'bottom-right', size: 0.9, rotate: -8, dx: 5, dy: 10, paths: [
        {d: 'M-50 6 C-50 -26 -26 -36 0 -36 C26 -36 50 -26 50 6 C50 34 26 42 0 42 C-26 42 -50 34 -50 6 Z'},
        {d: 'M-18 -34 C-28 -8 -28 18 -18 41 M18 -34 C28 -8 28 18 18 41'},
        {d: 'M-3 -36 C-4 -46 2 -52 12 -55'},
      ]},
      {corner: 'top-right', paths: cobweb(), size: 2.1, rotate: 0, dx: 0, dy: 0, flush: true, tint: WEB_TINT},
      // In the same box as the cobweb so it hangs from its thread, and in the season's own chalk.
      {corner: 'top-right', paths: spider(), size: 2.1, rotate: 0, dx: 0, dy: 0, flush: true, hangsFrom: SPIDER_DROP[1]},
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
      {corner: 'bottom-left', paths: PRESENT, size: 0.75, rotate: -8, dx: 22, dy: -10},
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
    effect: 'hearts',
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
      {corner: 'bottom-right', size: 1.1, rotate: -6, dx: 12, dy: 12, paths: [
        {d: HEART},
        {d: 'M-46 27 L54 -27 M54 -27 L40 -27 M54 -27 L49 -14 M-46 27 L-54 24 M-46 27 L-48 36 M-38 23 L-46 20 M-38 23 L-40 32'},
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
      {corner: 'top-right', paths: [{d: circle(0, 0, 40)}, {d: circle(0, 0, 31)}, {d: DOLLAR}], size: 0.7, rotate: 10, dx: 30, dy: 35},
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
