import {accentColor, DEFAULT_PREFS, diceColor, PREFS_KEY, PrefsService, tableTheme} from './prefs.service';
import {KeyValueStorage} from './stats.service';

describe('PrefsService', () => {
  let store: Map<string, string>;
  let storage: KeyValueStorage;

  beforeEach(() => {
    store = new Map();
    storage = {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: k => store.delete(k),
    };
  });

  it('defaults to the classic table, a gold d20 and seasonal themes on', () => {
    expect(new PrefsService(storage).load()).toEqual(DEFAULT_PREFS);
  });

  it('saves and reloads choices', () => {
    const saved = {
      table: 'royal', accent: 'jade', dice: 'ruby', sides: 6 as const, rerolls: false, seasonal: false, seasonOff: 'spooky-2026',
      sound: false, vibration: false,
    };
    new PrefsService(storage).save(saved);
    expect(new PrefsService(storage).load()).toEqual(saved);
  });

  it('ignores unknown or corrupt values', () => {
    store.set(PREFS_KEY, JSON.stringify({table: 'lava', accent: 'neon', dice: 'ruby', sides: 7, rerolls: 'yes', seasonal: 1, seasonOff: 3}));
    expect(new PrefsService(storage).load()).toEqual({...DEFAULT_PREFS, dice: 'ruby'});
    store.set(PREFS_KEY, '{oops');
    expect(new PrefsService(storage).load()).toEqual(DEFAULT_PREFS);
  });

  it('keeps choices for the session without storage', () => {
    const prefs = new PrefsService(null);
    const saved = {...DEFAULT_PREFS, table: 'plum', accent: 'rose', dice: 'ivory', sides: 4 as const};
    prefs.save(saved);
    expect(prefs.load()).toEqual(saved);
  });

  it('falls back to the first theme for unknown ids', () => {
    expect(tableTheme('nope').id).toBe('classic');
    expect(diceColor('nope').id).toBe('gold');
    expect(accentColor('nope').id).toBe('copper');
  });
});
