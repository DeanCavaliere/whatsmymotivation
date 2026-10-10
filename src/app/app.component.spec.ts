import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AppComponent} from './app.component';
import {ConfettiComponent} from './components/confetti/confetti.component';
import {DiceService} from './dice.service';
import {RollMode} from './motivation';
import {KeyValueStorage, STATS_STORAGE} from './stats.service';

class FakeDiceService {
  next: number[] = [12];

  async init(): Promise<'fallback'> {
    return 'fallback';
  }

  async roll(_mode: RollMode): Promise<number[]> {
    return this.next;
  }
}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let app: AppComponent;
  let dice: FakeDiceService;
  let store: Map<string, string>;

  beforeEach(async () => {
    store = new Map();
    const storage: KeyValueStorage = {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: k => store.delete(k),
    };
    dice = new FakeDiceService();
    await TestBed.configureTestingModule({
      declarations: [AppComponent, ConfettiComponent],
      providers: [
        {provide: DiceService, useValue: dice},
        {provide: STATS_STORAGE, useValue: storage},
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppComponent);
    app = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('becomes ready once the dice are set up', () => {
    expect(app.ready).toBeTrue();
  });

  it('counts rolls from the button, not just the keyboard', async () => {
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-primary');
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(app.sessionRolls).toBe(1);
    expect(app.stats.lifetimeRolls).toBe(1);
    expect(fixture.nativeElement.querySelector('.result-value').textContent.trim()).toBe('12');
  });

  it('rolls on Space when nothing interactive is focused', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', {key: ' '}));
    await fixture.whenStable();
    expect(app.sessionRolls).toBe(1);
  });

  it('ignores Space on a focused button so the press is not counted twice', async () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-primary');
    button.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
    await fixture.whenStable();
    expect(app.sessionRolls).toBe(0);
  });

  it('keeps the higher die with advantage and shows the dropped one', async () => {
    dice.next = [4, 17];
    app.setMode('advantage');
    await app.roll();
    expect(app.result?.value).toBe(17);
    expect(app.result?.dropped).toBe(4);
  });

  it('marks only the first roll of the day as today\'s roll', async () => {
    await app.roll();
    expect(app.result?.isToday).toBeTrue();
    dice.next = [3];
    await app.roll();
    expect(app.result?.isToday).toBeFalse();
    expect(app.today?.value).toBe(12);
  });
});
