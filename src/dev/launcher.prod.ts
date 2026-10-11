import {Type} from '@angular/core';

/** Production stand-in for launcher.ts (see fileReplacements in angular.json), so the launcher doesn't ship. */
export const LAUNCHER_PATH = '';
export const LAUNCHER_TAB = '';

export function startFpsMeter(_el: HTMLElement): () => void {
  return () => {};
}

export function devLauncher(): Promise<Type<unknown>> | null {
  return null;
}
