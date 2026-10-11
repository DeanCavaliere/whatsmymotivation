import {Type} from '@angular/core';

/** Where the dev launcher lives: opened from the Dev chip or the ` key on the table. */
export const LAUNCHER_PATH = '/?launcher';

/** The window name it opens in, so the chip and the key reuse one tab. */
export const LAUNCHER_TAB = 'wmm-launcher';

/** The frame rate readout in the Dev chip. */
export {startFpsMeter} from './fps';

/**
 * Dev builds only; production builds swap this file for launcher.prod.ts. On /?launcher, loads the dev
 * launcher (./launcher) to bootstrap in place of the app. Lazy, so the app's dev bundle doesn't carry it.
 */
export function devLauncher(search = location.search): Promise<Type<unknown>> | null {
  return new URLSearchParams(search).has('launcher')
    ? import('./launcher/launcher.component').then(m => m.LauncherComponent)
    : null;
}
