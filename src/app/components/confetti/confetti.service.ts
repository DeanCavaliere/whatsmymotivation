import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';

/** Both fly out from a point; the big one is for a natural top face. */
export type ConfettiKind = 'burst' | 'big-burst';

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
