import {Inject, Injectable} from '@angular/core';
import {DieSides, isDieSides} from './motivation';
import {KeyValueStorage, STATS_STORAGE} from './stats.service';

export interface TableTheme {
  id: string;
  label: string;
  /** Tints the neutral felt texture (see `.table` in app.component.css). */
  felt: string;
  /** The curved table lettering. */
  chalk: string;
}

export interface DiceColor {
  id: string;
  label: string;
  color: string;
}

export const TABLE_THEMES: readonly TableTheme[] = [
  {id: 'classic', label: 'Classic', felt: '#10422f', chalk: 'rgba(150, 230, 210, 0.6)'},
  {id: 'royal', label: 'Royal', felt: '#143a66', chalk: 'rgba(170, 205, 255, 0.6)'},
  {id: 'crimson', label: 'Crimson', felt: '#5e1a20', chalk: 'rgba(255, 196, 186, 0.6)'},
  {id: 'plum', label: 'Plum', felt: '#3e2350', chalk: 'rgba(225, 196, 255, 0.6)'},
  {id: 'teal', label: 'Teal', felt: '#0f4a4f', chalk: 'rgba(160, 238, 238, 0.6)'},
  {id: 'midnight', label: 'Midnight', felt: '#1d1f24', chalk: 'rgba(220, 222, 232, 0.5)'},
];

export const DICE_COLORS: readonly DiceColor[] = [
  {id: 'gold', label: 'Gold', color: '#d9a13b'},
  {id: 'ivory', label: 'Ivory', color: '#e8e0cc'},
  {id: 'ruby', label: 'Ruby', color: '#b3262d'},
  {id: 'sapphire', label: 'Sapphire', color: '#2b5fb8'},
  {id: 'emerald', label: 'Emerald', color: '#2e8555'},
  {id: 'amethyst', label: 'Amethyst', color: '#7b4bb3'},
  {id: 'obsidian', label: 'Obsidian', color: '#2a2a2e'},
];

/** The app's accent. Each passes 4.5:1 on both dark surfaces and under dark button text. */
export interface AccentColor {
  id: string;
  label: string;
  color: string;
}

export const ACCENTS: readonly AccentColor[] = [
  {id: 'copper', label: 'Copper', color: '#e0905a'},
  {id: 'arcane', label: 'Arcane', color: '#a58bff'},
  {id: 'ember', label: 'Ember', color: '#ff8466'},
  {id: 'jade', label: 'Jade', color: '#3ecf8e'},
  {id: 'rose', label: 'Rose', color: '#f472b6'},
];

export interface DieOption {
  sides: DieSides;
  blurb: string;
}

export const DIE_OPTIONS: readonly DieOption[] = [
  {sides: 20, blurb: 'The classic. Crits are rare, so they count.'},
  {sides: 12, blurb: 'A touch swingier than the d20.'},
  {sides: 10, blurb: 'Even odds of a good day.'},
  {sides: 8, blurb: 'Expect a crit about once a week.'},
  {sides: 6, blurb: 'Big swings, with a crit every few days.'},
  {sides: 4, blurb: 'All or nothing: half of all rolls are crits.'},
];

export const PREFS_KEY = 'wmm.prefs.v1';

export interface Prefs {
  table: string;
  /** Accent color id. */
  accent: string;
  /** Dice color id. */
  dice: string;
  sides: DieSides;
  /** Show the once-a-week "Nudge the table" re-roll. */
  nudge: boolean;
  /** Switch to the seasonal table, dice and messages on their dates. */
  seasonal: boolean;
  /** A season the player turned off by picking their own table or dice (see `seasonKey`). */
  seasonOff: string | null;
  sound: boolean;
  /** Buzz the phone when the dice land (where the browser allows it). */
  vibration: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  table: 'classic', accent: 'copper', dice: 'gold', sides: 20, nudge: true, seasonal: true, seasonOff: null, sound: true, vibration: true,
};

export function tableTheme(id: string): TableTheme {
  return TABLE_THEMES.find(t => t.id === id) ?? TABLE_THEMES[0];
}

export function accentColor(id: string): AccentColor {
  return ACCENTS.find(a => a.id === id) ?? ACCENTS[0];
}

export function diceColor(id: string): DiceColor {
  return DICE_COLORS.find(d => d.id === id) ?? DICE_COLORS[0];
}

/** Look-and-feel choices, kept apart from stats so resetting stats doesn't reset them. */
@Injectable({providedIn: 'root'})
export class PrefsService {
  private memory: Prefs | null = null;

  constructor(@Inject(STATS_STORAGE) private storage: KeyValueStorage | null) {
  }

  load(): Prefs {
    if (this.memory) {
      return {...this.memory};
    }
    try {
      const raw = JSON.parse(this.storage?.getItem(PREFS_KEY) ?? 'null') as Record<string, unknown> | null;
      const table = raw?.['table'];
      const accent = raw?.['accent'];
      const dice = raw?.['dice'];
      const sides = raw?.['sides'];
      return {
        table: TABLE_THEMES.some(t => t.id === table) ? table as string : DEFAULT_PREFS.table,
        accent: ACCENTS.some(a => a.id === accent) ? accent as string : DEFAULT_PREFS.accent,
        dice: DICE_COLORS.some(d => d.id === dice) ? dice as string : DEFAULT_PREFS.dice,
        sides: isDieSides(sides) ? sides : DEFAULT_PREFS.sides,
        nudge: typeof raw?.['nudge'] === 'boolean' ? raw['nudge'] as boolean : DEFAULT_PREFS.nudge,
        seasonal: typeof raw?.['seasonal'] === 'boolean' ? raw['seasonal'] as boolean : DEFAULT_PREFS.seasonal,
        seasonOff: typeof raw?.['seasonOff'] === 'string' ? raw['seasonOff'] as string : null,
        sound: typeof raw?.['sound'] === 'boolean' ? raw['sound'] as boolean : DEFAULT_PREFS.sound,
        vibration: typeof raw?.['vibration'] === 'boolean' ? raw['vibration'] as boolean : DEFAULT_PREFS.vibration,
      };
    } catch {
      return {...DEFAULT_PREFS};
    }
  }

  save(prefs: Prefs): void {
    try {
      if (this.storage && !this.memory) {
        this.storage.setItem(PREFS_KEY, JSON.stringify(prefs));
        return;
      }
    } catch {
      // Fall through to memory.
    }
    this.memory = {...prefs};
  }
}
