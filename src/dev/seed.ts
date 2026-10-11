import {STATS_KEY} from '../app/stats.service';
import {SAVES} from './saves';

/** The player's own save, kept aside by the first ?save= until ?save=mine puts it back. */
export const BACKUP_KEY = 'wmm.dev.backup';

/**
 * Dev builds only; production builds swap this file for seed.prod.ts. ?save=month replaces the save
 * with that preset from ./saves on every load, so a day can be rolled again and again. ?save=mine
 * puts back the save from before.
 */
export function seedDevSave(search = location.search, storage: Storage = localStorage, now = new Date()): void {
  const name = new URLSearchParams(search).get('save');
  if (name === null) {
    return;
  }
  if (name === 'mine') {
    const backup = storage.getItem(BACKUP_KEY);
    if (backup === null) {
      console.info('[dev save] Already on your own save.');
      return;
    }
    const {stats} = JSON.parse(backup) as {stats: string | null};
    if (stats === null) {
      storage.removeItem(STATS_KEY);
    } else {
      storage.setItem(STATS_KEY, stats);
    }
    storage.removeItem(BACKUP_KEY);
    console.info('[dev save] Your own save is back.');
    return;
  }
  const save = Object.hasOwn(SAVES, name) ? SAVES[name] : null;
  if (!save) {
    console.warn(`[dev save] No save called "${name}". Try ${Object.keys(SAVES).join(', ')}, or mine.`);
    return;
  }
  if (storage.getItem(BACKUP_KEY) === null) {
    storage.setItem(BACKUP_KEY, JSON.stringify({stats: storage.getItem(STATS_KEY)}));
  }
  storage.setItem(STATS_KEY, JSON.stringify(save(now)));
  console.info(`[dev save] Loaded "${name}". ?save=mine puts your own save back.`);
}
