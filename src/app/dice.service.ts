import {Injectable, NgZone} from '@angular/core';
import DiceBox from '@3d-dice/dice-box';
import {diceNotation, randomD20, RollMode} from './motivation';

/** A roll should settle in a few seconds; past this we stop waiting on the 3D dice. */
const ROLL_TIMEOUT_MS = 15000;

export type DiceRenderer = '3d' | 'fallback';

/**
 * Wraps @3d-dice/dice-box. Everything runs outside the Angular zone so the
 * render loop doesn't trigger change detection on every frame.
 */
@Injectable({providedIn: 'root'})
export class DiceService {
  private box: any = null;
  renderer: DiceRenderer = 'fallback';

  constructor(private zone: NgZone) {
  }

  async init(container: HTMLElement): Promise<DiceRenderer> {
    if (!supportsWebGL()) {
      return this.renderer = 'fallback';
    }
    try {
      await this.zone.runOutsideAngular(async () => {
        const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
        this.box = new DiceBox({
          container: '#' + container.id,
          id: 'dice-canvas',
          assetPath: '/assets/dice-box/',
          theme: 'default',
          // Gold reads clearly on the green felt (the library default is green).
          themeColor: '#d9a13b',
          offscreen: supportsOffscreenWebGL(),
          // Narrow (portrait) tables get a smaller die so it has room to tumble.
          scale: aspect < 0.8 ? 5 : 6,
          // The library freezes any die still moving after settleTimeout ms of wall-clock
          // time. On slow devices, or when the tab is backgrounded mid-roll, the default
          // 5s could freeze it mid-air outside the camera's view. A gentler throw also
          // keeps the die closer to the felt.
          settleTimeout: 12000,
          throwForce: 4,
          startingHeight: 7,
        });
        await this.box.init();
      });
      return this.renderer = '3d';
    } catch (err) {
      console.error('3D dice unavailable, falling back to plain rolls', err);
      this.box = null;
      return this.renderer = 'fallback';
    }
  }

  /** Resolves with every die's value (one for normal, two for advantage/disadvantage). */
  async roll(mode: RollMode): Promise<number[]> {
    const count = mode === 'normal' ? 1 : 2;
    const fallback = () => Array.from({length: count}, randomD20);

    if (!this.box) {
      await delay(450);
      return fallback();
    }

    const rolled: Promise<number[]> = this.zone.runOutsideAngular(() => this.box.roll(diceNotation(mode)))
      .then((dice: { value: number }[]) => dice.map(d => d.value));
    const timedOut = delay(ROLL_TIMEOUT_MS).then(() => null);
    const values = await Promise.race([rolled, timedOut]);

    if (!values || values.length !== count || values.some(v => !(v >= 1 && v <= 20))) {
      this.zone.runOutsideAngular(() => this.box?.clear());
      return fallback();
    }
    return values;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

/**
 * dice-box only checks that OffscreenCanvas exists, but some browsers (Safari 16.4-16.x)
 * ship OffscreenCanvas without WebGL support in it, which leaves the dice invisible.
 */
function supportsOffscreenWebGL(): boolean {
  try {
    return typeof OffscreenCanvas !== 'undefined'
      && 'transferControlToOffscreen' in HTMLCanvasElement.prototype
      && !!new OffscreenCanvas(1, 1).getContext('webgl');
  } catch {
    return false;
  }
}
