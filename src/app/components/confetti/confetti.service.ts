import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';

export type ConfettiKind = 'confetti' | 'tears';

@Injectable({providedIn: 'root'})
export class ConfettiService {
  private triggerSubject = new Subject<ConfettiKind>();
  readonly trigger$ = this.triggerSubject.asObservable();

  trigger(kind: ConfettiKind): void {
    this.triggerSubject.next(kind);
  }
}
