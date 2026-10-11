import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AppComponent} from './app.component';
import {DiceService} from './dice.service';
import {DieSides, RollMode} from './motivation';
import {addDays, KeyValueStorage, localDateKey, STATS_KEY, STATS_STORAGE} from './stats.service';

class FakeDiceService {
  next: number[] = [12];
  lastSides?: DieSides;
  lastColor?: string;

  async init(): Promise<'fallback'> {
    return 'fallback';
  }

  async roll(_mode: RollMode, sides: DieSides, color?: string): Promise<number[]> {
    this.lastSides = sides;
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
    // Nor modal dialogs.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
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

    it('announces the result to screen readers', async () => {
      const live = () => fixture.nativeElement.querySelector('[aria-live="polite"]').textContent.trim();
      expect(live()).toBe('');
      dice.next = [4, 17];
      app.setMode('advantage');
      await app.roll();
      fixture.detectChanges();
      expect(live()).toBe(`Today's roll, advantage: 17. Dropped 4. ${app.result!.verdict.message}`);
    });

    it('marks the roll mode with aria-pressed', () => {
      app.setMode('disadvantage');
      fixture.detectChanges();
      const pressed = [...fixture.nativeElement.querySelectorAll('.segmented button[aria-pressed="true"]')]
        .map((b: HTMLButtonElement) => b.getAttribute('aria-label'));
      expect(pressed).toEqual(['Disadvantage']);
    });

    it('names each die by itself and describes its odds', () => {
      const d6 = fixture.nativeElement.querySelector('#die-6') as HTMLInputElement;
      const text = (ids: string) => ids.split(' ')
        .map(id => fixture.nativeElement.querySelector('#' + id).textContent.trim()).join(' ');
      expect(text(d6.getAttribute('aria-labelledby')!)).toBe('d6');
      expect(text(d6.getAttribute('aria-describedby')!)).toContain('Crit: 1 in 6');
    });

    it('rolls in the chosen dice color and tints the table', async () => {
      const ruby = fixture.nativeElement.querySelector('input[name="dice"][value="ruby"]') as HTMLInputElement;
      ruby.click();
      const royal = fixture.nativeElement.querySelector('input[name="table"][value="royal"]') as HTMLInputElement;
      royal.click();
      await app.roll();

      expect(dice.lastColor).toBe('#b3262d');
      expect(document.documentElement.style.getPropertyValue('--felt')).toBe('#143a66');
      expect(JSON.parse(store.get('wmm.prefs.v1')!)).toMatchObject({table: 'royal', dice: 'ruby', sides: 20});
    });

    it('rolls the chosen die and labels the result with it', async () => {
      const d6 = fixture.nativeElement.querySelector('input[name="sides"][value="6"]') as HTMLInputElement;
      d6.click();
      dice.next = [6];
      await app.roll();
      fixture.detectChanges();

      expect(dice.lastSides).toBe(6);
      expect(app.result?.verdict.tier).toBe('crit-success');
      expect(fixture.nativeElement.querySelector('.result-label').textContent).toContain('d6');
      expect(app.stats.counts[6]).toEqual([0, 0, 0, 0, 0, 1]);
    });

    it('nudges the table once a week to replace today\'s roll', async () => {
      dice.next = [3];
      await app.roll();
      fixture.detectChanges();
      const nudgeButton = () => [...fixture.nativeElement.querySelectorAll('.result-actions button')]
        .find((b: HTMLButtonElement) => b.textContent!.includes('Nudge')) as HTMLButtonElement | undefined;

      dice.next = [17];
      nudgeButton()!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(app.today?.value).toBe(17);
      expect(app.result?.nudgedFrom?.value).toBe(3);
      expect(fixture.nativeElement.querySelector('.result-label').textContent).toContain('nudged');
      expect(fixture.nativeElement.querySelector('.result-sub').textContent).toContain('was 3');
      expect(nudgeButton()).toBeUndefined();
    });

    it('hides the nudge when it is switched off', async () => {
      (fixture.nativeElement.querySelector('.switch') as HTMLInputElement).click();
      await app.roll();
      fixture.detectChanges();
      expect(app.prefs.nudge).toBe(false);
      expect(fixture.nativeElement.querySelector('.result-actions').textContent).not.toContain('Nudge');
    });

    it('shows daily and all-roll stats on separate tabs', async () => {
      await app.roll();
      dice.next = [3];
      await app.roll();
      app.openStats();
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const readout = () => el.querySelector('.chart-readout')!.textContent!.replace(/\s+/g, ' ');

      expect(el.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toContain('Daily');
      expect(readout()).toContain('across 1 day on the d20');
      expect(el.querySelectorAll('.history li').length).toBe(1);

      (el.querySelector('#tab-all') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(readout()).toContain('across 2 rolls on the d20');
      expect(el.querySelectorAll('.history li').length).toBe(2);
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
