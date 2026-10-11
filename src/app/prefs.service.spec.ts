import {DEFAULT_PREFS, diceColor, PREFS_KEY, PrefsService, tableTheme} from './prefs.service';
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

  it('defaults to the classic table and a gold d20', () => {
    expect(new PrefsService(storage).load()).toEqual(DEFAULT_PREFS);
  });

  it('saves and reloads choices', () => {
    new PrefsService(storage).save({table: 'royal', dice: 'ruby', sides: 6, nudge: false});
    expect(new PrefsService(storage).load()).toEqual({table: 'royal', dice: 'ruby', sides: 6, nudge: false});
  });

  it('ignores unknown or corrupt values', () => {
    store.set(PREFS_KEY, JSON.stringify({table: 'lava', dice: 'ruby', sides: 7, nudge: 'yes'}));
    expect(new PrefsService(storage).load()).toEqual({table: 'classic', dice: 'ruby', sides: 20, nudge: true});
    store.set(PREFS_KEY, '{oops');
    expect(new PrefsService(storage).load()).toEqual(DEFAULT_PREFS);
  });

  it('keeps choices for the session without storage', () => {
    const prefs = new PrefsService(null);
    prefs.save({table: 'plum', dice: 'ivory', sides: 4, nudge: true});
    expect(prefs.load()).toEqual({table: 'plum', dice: 'ivory', sides: 4, nudge: true});
  });

  it('falls back to the first theme for unknown ids', () => {
    expect(tableTheme('nope').id).toBe('classic');
    expect(diceColor('nope').id).toBe('gold');
  });
});
