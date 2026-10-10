export type RollMode = 'normal' | 'advantage' | 'disadvantage';

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
    'Natural 20! Today is legendary.',
    'Max motivation unlocked. Go conquer the world.',
  ],
};

export function tierFor(value: number): Tier {
  if (value <= 1) return 'crit-fail';
  if (value >= 20) return 'crit-success';
  if (value <= 5) return 'very-low';
  if (value <= 8) return 'low';
  if (value <= 11) return 'mid';
  if (value <= 14) return 'high';
  return 'very-high';
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
export function verdictFor(value: number, random: () => number = Math.random): Verdict {
  const tier = tierFor(value);
  const options = MESSAGES[tier];
  const message = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
  return { tier, message, celebration: celebrationFor(tier) };
}

export function diceNotation(mode: RollMode): string {
  return mode === 'normal' ? '1d20' : '2d20';
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

/** Uniform 1..20, used when 3D dice are unavailable (no WebGL, failed init). */
export function randomD20(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Rejection sampling avoids modulo bias.
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / 20) * 20;
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return (buf[0] % 20) + 1;
  }
  return Math.floor(Math.random() * 20) + 1;
}
