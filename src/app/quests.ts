import {d20Scale, DieSides} from './motivation';

export interface Quest {
  id: string;
  text: string;
}

/** Quests sized to the day's roll: small for a 1-8 on the d20 scale, medium for 9-14, large for 15-20. */
export const QUEST_POOLS: Readonly<Record<'small' | 'medium' | 'large', readonly Quest[]>> = {
  small: [
    {id: 'one-email', text: 'Answer one email'},
    {id: 'water', text: 'Drink a full glass of water'},
    {id: 'tidy', text: 'Tidy one surface'},
    {id: 'walk', text: 'Take a ten-minute walk'},
    {id: 'todo-list', text: 'Write tomorrow\'s to-do list'},
    {id: 'tabs', text: 'Close every tab you don\'t need'},
  ],
  medium: [
    {id: 'three-tasks', text: 'Clear three small tasks'},
    {id: 'finish-yesterday', text: 'Finish something you started yesterday'},
    {id: 'focus-25', text: 'Spend 25 focused minutes on one thing'},
    {id: 'reply', text: 'Reply to the message you\'ve been putting off'},
    {id: 'plan-week', text: 'Plan the rest of the week'},
  ],
  large: [
    {id: 'avoided-task', text: 'Tackle the task you\'ve been avoiding'},
    {id: 'ship', text: 'Ship something today'},
    {id: 'deep-work', text: 'Do two hours of deep work'},
    {id: 'start-it', text: 'Start the thing you keep saying you\'ll start'},
    {id: 'help', text: 'Help someone with their work'},
  ],
};

const ALL = Object.values(QUEST_POOLS).flat();

/** The longest a journal note can be. */
export const NOTE_LIMIT = 80;

export function questPool(value: number, sides: DieSides): readonly Quest[] {
  const scaled = d20Scale(value, sides);
  return scaled <= 8 ? QUEST_POOLS.small : scaled <= 14 ? QUEST_POOLS.medium : QUEST_POOLS.large;
}

/** A quest to match a day's roll. `random` is injectable so tests can pick. */
export function questFor(value: number, sides: DieSides, random: () => number = Math.random): Quest {
  const pool = questPool(value, sides);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function questById(id: string): Quest | null {
  return ALL.find(q => q.id === id) ?? null;
}
