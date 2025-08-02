import {AfterViewInit, ChangeDetectorRef, Component,  HostListener, OnInit} from '@angular/core';
import DiceBox from '@3d-dice/dice-box';
import {Observable, Subject, throttleTime} from "rxjs";
import {ConfettiService} from "./components/confetti/confetti.service";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {
  private diceBox = new DiceBox();
  disableButton: boolean = false;
  showText: boolean = false;
  text: string = '';

  lifetimeRolls: number = 0;
  rollsThisSession: number = 0;
  currentDieValue: number = 0;

  private keydownSubject = new Subject<KeyboardEvent>();
  @HostListener('window:keydown.space', ['$event']) onSpaceChange(event: KeyboardEvent) {
    this.keydownSubject.next(event);
  }

  constructor(private cdRef: ChangeDetectorRef, private confettiService: ConfettiService) {
    this.lifetimeRolls = (localStorage.getItem('lifetimeRolls') ?? 0) as number;
  }

  ngOnInit() {
    this.keydownSubject.pipe(
      throttleTime(5000) // Adjust debounce time (in milliseconds) as needed
    ).subscribe(event => {
      // Your debounced keydown handling logic here
      this.showText = false;
      this.rollsThisSession++;
      this.lifetimeRolls++;
      localStorage.setItem('lifetimeRolls', JSON.stringify(this.lifetimeRolls));
      this.rollDice();
    });
  }

  ngAfterViewInit(): void {
    this.diceBox = new DiceBox({
      id: 'dice-box',
      assetPath: '/assets/dice-box/', // Path to your copied assets
      theme: "default",
      offscreen: true,
      scale: 6
    });

    this.diceBox.init().then(({ config, world }: {config:any, world: any}) => {
      // DiceBox is ready to use
    });

    this.diceBox.onRollComplete = (rollResult: any) => {
      let dieValue = (rollResult[0] ?? {})?.rolls[0]?.value ?? 0;
      this.currentDieValue = dieValue;
      console.log('dieValue: ' + dieValue);
      this.showText = true;
      if (dieValue <= 1) {
        this.text = 'Critical fail! Don\'t even try to work.';
        this.confettiService.triggerConfetti(['crying_emoji.png']);
      } else if (dieValue >= 20) {
        this.text = 'Critical success! Carpe diem!';
        this.confettiService.triggerConfetti(['confetti.png']);
      } else if (dieValue <= 5) {
        this.text = 'You\'re going to be very unmotivated today...';
        this.confettiService.triggerConfetti(['crying_emoji.png']);
      } else if (dieValue >= 15) {
        this.text = 'You\'re gonna be very productive today!';
        this.confettiService.triggerConfetti(['confetti.png']);
      } else if (dieValue >= 9 && dieValue <= 11) {
        this.text = 'Today is going to be mid.';
      } else if (dieValue < 9) {
        this.text = 'You\'re not going to be very productive today...';
      } else if (dieValue > 11) {
        this.text = 'Today is a great day to get some work done!';
      }
      this.disableButton = false;
    };
  }

  rollDice(): void {
    this.disableButton = true;

    if (this.diceBox) {
      this.diceBox.roll('1d20');
    }
  }
}
