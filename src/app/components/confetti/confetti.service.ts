import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';

/**
 * `burst` and `big-burst` fly out from a point; `fall` drifts down from the top of the screen
 * (kept for weather effects).
 */
export type ConfettiKind = 'burst' | 'big-burst' | 'fall';

export interface ConfettiTrigger {
  kind: ConfettiKind;
  /** Where a burst starts, in viewport pixels. Defaults to the middle of the screen. */
  origin?: { x: number; y: number };
}

@Injectable({providedIn: 'root'})
export class ConfettiService {
  private triggerSubject = new Subject<ConfettiTrigger>();
  readonly trigger$ = this.triggerSubject.asObservable();

  trigger(kind: ConfettiKind, origin?: { x: number; y: number }): void {
    this.triggerSubject.next({kind, origin});
  }
}
