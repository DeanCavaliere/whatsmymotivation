import {CONDITIONS, ConditionId} from '../../app/conditions';
import {Season, SEASONS} from '../../app/seasons';
import {SAVES} from '../saves';

/** The dev URL params the launcher builds; an empty or missing value is left out of the URL. */
export interface LaunchParams {
  save?: string;
  rolls?: string;
  condition?: string;
  season?: string;
}

export interface Preset {
  name: string;
  sub: string;
  /** What the tab will show. */
  what: string;
  params: LaunchParams;
}

export interface PresetGroup {
  title: string;
  lede: string;
  rows: readonly Preset[];
}

export interface Option {
  value: string;
  label: string;
}

/** Shown for saves in ../saves; a save missing here still gets a row and an option, with no blurb. */
const SAVE_NOTES: Readonly<Record<string, {sub: string; what: string}>> = {
  fresh: {sub: 'brand-new player', what: 'Getting started card on the felt, Roll button glowing, no HUD ✦ yet.'},
  day2: {sub: 'tour almost done', what: 'Rolled and finished the quest yesterday. Today\'s roll finishes Getting started and gives the first ✦.'},
  month: {sub: 'established player', what: 'About 31 days with every condition, rerolls, notes, badges, an 11-day streak and 2 ✦ to spend.'},
  year: {sub: 'long history', what: 'A little over a year, for paging the calendar back and filling the stats. One stretch on a d12.'},
};

const MINE: Preset = {name: 'Mine', sub: 'restore', what: 'Puts back the save you had before the first ?save= link.', params: {save: 'mine'}};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 1–31" or "Dec 20–Jan 2", from a season's [month, day] dates. */
export function seasonDates({start: [sm, sd], end: [em, ed]}: Season): string {
  return sm === em ? `${MONTHS[sm - 1]} ${sd}–${ed}` : `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}`;
}

export const SAVE_OPTIONS: readonly Option[] = [
  {value: '', label: '(keep current)'},
  ...Object.keys(SAVES).map(name => ({value: name, label: SAVE_NOTES[name] ? `${name}: ${SAVE_NOTES[name].sub}` : name})),
  {value: 'mine', label: 'mine: restore your save'},
];

export const CONDITION_OPTIONS: readonly Option[] = [
  {value: '', label: '(as rolled)'},
  {value: 'clear', label: '☀️ Clear'},
  ...(Object.entries(CONDITIONS)).map(([id, c]) => ({value: id, label: `${c.icon} ${c.name}`})),
];

export const SEASON_OPTIONS: readonly Option[] = [
  {value: '', label: '(by date)'},
  ...SEASONS.map(s => ({value: s.id, label: `${s.emoji} ${s.label} (${seasonDates(s)})`})),
];

/** What each condition shows, and a roll that shows it off. A condition missing here gets a plain row. */
const CONDITION_NOTES: Readonly<Partial<Record<ConditionId, {sub: string; what: string; rolls?: string}>>> = {
  'foggy': {sub: 'hidden roll', what: 'The roll lands under fog; wipe it away to see the number.', rolls: '14'},
  'rainy': {sub: 'looks only', what: 'Rain on the table.'},
  'snowy': {sub: 'looks only', what: 'Snow drifts down and gathers along the edge.'},
  'stormy': {sub: 'with a natural 20', what: 'Rain and lightning; a top face calls down a strike.', rolls: '20'},
  'low-gravity': {sub: 'floaty dice', what: 'Dice float, bounce higher and take longer to settle.'},
  'inspired': {sub: 'with a 16', what: 'A 15 or higher earns a ✦.', rolls: '16'},
  'blessed': {sub: 'advantage locked', what: 'Roll mode locks to advantage, with a lock icon on the mode.'},
  'hexed': {sub: 'disadvantage, double 1', what: 'Mode locks to disadvantage; both dice show 1 for Snake eyes.', rolls: '1'},
};

/** Seasons look best with a condition to match. */
const SEASON_CONDITION: Readonly<Record<string, string>> = {festive: 'snowy'};

export const GROUPS: readonly PresetGroup[] = [
  {
    title: 'Saves',
    lede: 'Player states. Each one is rebuilt from today\'s date on every load, and today is always still to roll.',
    rows: [
      ...Object.keys(SAVES).map(name => ({
        // day2 reads "Day 2".
        name: name[0].toUpperCase() + name.slice(1).replace(/(\D)(\d)/, '$1 $2'),
        sub: SAVE_NOTES[name]?.sub ?? '',
        what: SAVE_NOTES[name]?.what ?? '',
        params: {save: name},
      })),
      MINE,
    ],
  },
  {
    title: 'Rolls, one per tier',
    lede: 'On the month save, so there\'s a streak, ✦ to reroll with, and no tour in the way. Each is the next result on a d20.',
    rows: [
      {name: 'Natural 20', sub: 'crit success', what: 'Gold number with a flare, big confetti burst, ✦ for a natural.', params: {save: 'month', rolls: '20'}},
      {name: '17', sub: 'very high', what: 'Small confetti burst.', params: {save: 'month', rolls: '17'}},
      {name: '13', sub: 'high', what: 'High-tier color and message, no burst.', params: {save: 'month', rolls: '13'}},
      {name: '10', sub: 'mid', what: 'The plain "mid" day.', params: {save: 'month', rolls: '10'}},
      {name: '7', sub: 'low', what: 'Low-tier color and message.', params: {save: 'month', rolls: '7'}},
      {name: '3', sub: 'very low', what: 'Very-low tier. Good one to try Reroll on.', params: {save: 'month', rolls: '3'}},
      {name: 'Natural 1', sub: 'crit fail', what: 'Table jolts, color drains, a crack stays on the felt all day.', params: {save: 'month', rolls: '1'}},
    ],
  },
  {
    title: 'Roll sequences',
    lede: 'Several queued results, used one throw at a time: the day\'s roll first, then Roll again or Reroll.',
    rows: [
      {name: '1, then reroll to 20', sub: 'Lucky reroll badge', what: 'Roll a natural 1, press Reroll (costs 1 ✦), land the top face.', params: {save: 'month', rolls: '1,20'}},
      {name: '3, then reroll to 18', sub: 'reroll flow', what: 'Shows "was 3" under the new number and the ✦ spent.', params: {save: 'month', rolls: '3,18'}},
      {name: '20, then practice 1', sub: 'practice rolls', what: 'The day\'s 20 stays; Roll again throws a practice 1 that cracks the table only while shown.', params: {save: 'month', rolls: '20,1'}},
      {name: '1, then practice 15', sub: 'crack persists', what: 'The day\'s natural 1 keeps its crack through practice rolls.', params: {save: 'month', rolls: '1,15'}},
    ],
  },
  {
    title: 'Conditions',
    lede: 'Today\'s table condition, on the month save. Some come with a roll that shows the condition\'s payoff.',
    rows: [
      {name: 'Clear', sub: 'no condition', what: 'Forces a plain day, even if one was rolled for today.', params: {save: 'month', condition: 'clear'}},
      ...(Object.entries(CONDITIONS) as [ConditionId, typeof CONDITIONS[ConditionId]][]).map(([id, c]) => ({
        name: c.name,
        sub: CONDITION_NOTES[id]?.sub ?? '',
        what: CONDITION_NOTES[id]?.what ?? c.description,
        params: {save: 'month', condition: id, rolls: CONDITION_NOTES[id]?.rolls},
      })),
    ],
  },
  {
    title: 'Seasons',
    lede: 'Seasonal doodles and themed messages, on the month save. Themed lines show on about half of rolls.',
    rows: SEASONS.map(s => ({
      name: s.label,
      sub: seasonDates(s),
      what: `${s.label} doodles, felt and ${s.diceLabel.toLowerCase()} dice${SEASON_CONDITION[s.id] ? `, with ${CONDITIONS[SEASON_CONDITION[s.id] as ConditionId].name} for the full look` : ''}.`,
      params: {save: 'month', season: s.id, condition: SEASON_CONDITION[s.id]},
    })),
  },
  {
    title: 'Getting started and the result plate',
    lede: 'The onboarding path and the quest / earned / actions plate under the result.',
    rows: [
      {name: 'First roll, natural 20', sub: 'big day', what: 'Plate with the quest, First roll + Natural badges, +1 ✦ and Share | Reroll.', params: {save: 'fresh', rolls: '20'}},
      {name: 'First roll, plain 9', sub: 'quiet first day', what: 'First roll badge only; no Reroll (no ✦ yet), so Share fills the footer.', params: {save: 'fresh', rolls: '9'}},
      {name: 'First roll, natural 1', sub: 'rough start', what: 'Crack on the felt, with the first-roll badge and Rock bottom.', params: {save: 'fresh', rolls: '1'}},
      {name: 'Day 2 finishes the tour', sub: 'first ✦', what: '+1 ✦ for finishing Getting started, the 2-day streak, and the "Save it for a day you don\'t like" hint.', params: {save: 'day2', rolls: '9'}},
      {name: 'Day 2 on a natural 20', sub: 'two ✦ at once', what: 'Tour ✦ and natural ✦ on the same roll.', params: {save: 'day2', rolls: '20'}},
    ],
  },
];

/** "/?save=month&rolls=1,20": the path and query for these params, with empty ones left out. */
export function launchPath(params: LaunchParams): string {
  const query = Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value as string).replace(/%2C/g, ',')}`)
    .join('&');
  return query ? `/?${query}` : '/';
}
