export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20;

export const DIE_SIDES: readonly DieSides[] = [20, 12, 10, 8, 6, 4];

export function isDieSides(n: unknown): n is DieSides {
  return DIE_SIDES.includes(n as DieSides);
}

export type Tier = 'crit-fail' | 'very-low' | 'low' | 'mid' | 'high' | 'very-high' | 'crit-success';

export type Celebration = 'confetti' | 'tears' | null;

export interface Verdict {
  tier: Tier;
  message: string;
  celebration: Celebration;
}

export const MESSAGES: Record<Tier, readonly string[]> = {
  'crit-fail': [
    'Critical fail! Don\'t even try to work.',
    'Natural 1. Go back to bed.',
    'The dice have spoken: today is a write-off.',
  ],
  'very-low': [
    'You\'re going to be very unmotivated today...',
    'Low roll. Coffee won\'t save you.',
    'Maybe just answer a couple of emails.',
  ],
  'low': [
    'You\'re not going to be very productive today...',
    'Below average. Pick one small task and call it a win.',
    'A slow day. Pace yourself.',
  ],
  'mid': [
    'Today is going to be mid.',
    'Perfectly average. Nothing more, nothing less.',
    'A solid "fine". You\'ll get some stuff done.',
  ],
  'high': [
    'Today is a great day to get some work done!',
    'Above average. Tackle something you\'ve been putting off.',
    'Good roll. Momentum is on your side.',
  ],
  'very-high': [
    'You\'re gonna be very productive today!',
    'High roll! Nothing can stop you.',
    'You\'re on fire today. Use it wisely.',
  ],
  'crit-success': [
    'Critical success! Carpe diem!',
    'Natural {max}! Today is legendary.',
    'Max motivation unlocked. Go conquer the world.',
  ],
};

/**
 * 1 and the top face are always crits. Faces in between are placed on the d20's
 * scale, so a 3 on a d4 counts like a 14 on a d20.
 */
export function tierFor(value: number, sides: DieSides = 20): Tier {
  if (value <= 1) return 'crit-fail';
  if (value >= sides) return 'crit-success';
  const scaled = Math.round(1 + (value - 1) * 19 / (sides - 1));
  if (scaled <= 5) return 'very-low';
  if (scaled <= 8) return 'low';
  if (scaled <= 11) return 'mid';
  if (scaled <= 14) return 'high';
  return 'very-high';
}

/** Chance of each outcome on a single roll of the die. */
export function dieOdds(sides: DieSides): { crit: number; good: number; bad: number } {
  const tiers = Array.from({length: sides}, (_, i) => tierFor(i + 1, sides));
  const share = (match: Tier[]) => tiers.filter(t => match.includes(t)).length / sides;
  return {
    crit: 1 / sides,
    good: share(['high', 'very-high', 'crit-success']),
    bad: share(['crit-fail', 'very-low']),
  };
}

export function celebrationFor(tier: Tier): Celebration {
  switch (tier) {
    case 'crit-fail':
    case 'very-low':
      return 'tears';
    case 'very-high':
    case 'crit-success':
      return 'confetti';
    default:
      return null;
  }
}

/** `random` is injectable so the message choice is deterministic in tests. */
export function verdictFor(value: number, sides: DieSides = 20, random: () => number = Math.random): Verdict {
  const tier = tierFor(value, sides);
  const options = MESSAGES[tier];
  const message = options[Math.min(options.length - 1, Math.floor(random() * options.length))].replace('{max}', String(sides));
  return { tier, message, celebration: celebrationFor(tier) };
}

export function diceNotation(mode: RollMode, sides: DieSides = 20): string {
  return `${mode === 'normal' ? 1 : 2}d${sides}`;
}

/** Picks the die that counts: highest with advantage, lowest with disadvantage. */
export function keptValue(values: readonly number[], mode: RollMode): number {
  if (values.length === 0) {
    throw new Error('No dice values to choose from');
  }
  if (mode === 'advantage') return Math.max(...values);
  if (mode === 'disadvantage') return Math.min(...values);
  return values[0];
}

/** Uniform 1..sides, used when 3D dice are unavailable (no WebGL, failed init). */
export function randomFace(sides: DieSides = 20): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Rejection sampling avoids modulo bias.
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / sides) * sides;
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return (buf[0] % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}
