import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AppComponent} from './app.component';
import {DiceService} from './dice.service';
import {RollMode} from './motivation';
import {addDays, KeyValueStorage, localDateKey, STATS_KEY, STATS_STORAGE} from './stats.service';

class FakeDiceService {
  next: number[] = [12];
  lastColor?: string;

  async init(): Promise<'fallback'> {
    return 'fallback';
  }

  async roll(_mode: RollMode, color?: string): Promise<number[]> {
    this.lastColor = color;
    return this.next;
  }
}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let app: AppComponent;
  let dice: FakeDiceService;
  let store: Map<string, string>;

  async function setup(): Promise<void> {
    fixture = TestBed.createComponent(AppComponent);
    app = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    // jsdom has no canvas; the confetti layer copes with a missing context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    store = new Map();
    const storage: KeyValueStorage = {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: k => store.delete(k),
    };
    dice = new FakeDiceService();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {provide: DiceService, useValue: dice},
        {provide: STATS_STORAGE, useValue: storage},
      ],
    }).compileComponents();
  });

  describe('with no saved stats', () => {
    beforeEach(setup);

    it('becomes ready once the dice are set up', () => {
      expect(app.ready).toBe(true);
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
      expect(app.result?.isToday).toBe(true);
      dice.next = [3];
      await app.roll();
      expect(app.result?.isToday).toBe(false);
      expect(app.today?.value).toBe(12);
    });

    it('rolls in the chosen dice color and tints the table', async () => {
      const ruby = fixture.nativeElement.querySelector('input[name="dice"][value="ruby"]') as HTMLInputElement;
      ruby.click();
      const royal = fixture.nativeElement.querySelector('input[name="table"][value="royal"]') as HTMLInputElement;
      royal.click();
      await app.roll();

      expect(dice.lastColor).toBe('#b3262d');
      expect(document.documentElement.style.getPropertyValue('--felt')).toBe('#143a66');
      expect(JSON.parse(store.get('wmm.prefs.v1')!)).toEqual({table: 'royal', dice: 'ruby'});
    });
  });

  describe('with a streak from yesterday', () => {
    beforeEach(async () => {
      const yesterday = addDays(localDateKey(new Date()), -1);
      store.set(STATS_KEY, JSON.stringify({streak: {current: 4, best: 4, lastDate: yesterday}}));
      await setup();
    });

    it('nudges the user to keep it going', () => {
      fixture.detectChanges();
      expect(app.streak).toBe(4);
      expect(fixture.nativeElement.querySelector('.result-status').textContent).toContain('4-day streak');
    });

    it("extends it with today's roll and calls out a new best", async () => {
      await app.roll();
      fixture.detectChanges();
      expect(app.streak).toBe(5);
      expect(app.streakAtRisk).toBe(false);
      expect(fixture.nativeElement.querySelector('.result-streak').textContent).toContain('5-day streak · new best!');
    });
  });
});
