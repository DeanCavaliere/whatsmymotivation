import {Observable, Subject} from "rxjs";

export class ConfettiService {
  private triggerConfettiSubject = new Subject<string[]>();
  public triggerConfettiObservable = new Observable<string[]>();

  constructor() {
    this.triggerConfettiObservable = this.triggerConfettiSubject.asObservable()
  }

  public triggerConfetti(fileNames: ("confetti.png" | "crying_emoji.png")[]): void {
    this.triggerConfettiSubject.next(fileNames);
  }
}
