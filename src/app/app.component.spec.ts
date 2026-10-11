import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AppComponent} from './app.component';
import {DiceService} from './dice.service';
import {DieSides, RollMode} from './motivation';
import {DayCondition} from './conditions';
import {SEASONS} from './seasons';
import {addDays, KeyValueStorage, localDateKey, STATS_KEY, STATS_STORAGE, StatsService} from './stats.service';

class FakeDiceService {
  next: number[] = [12];
  lastSides?: DieSides;
  lastColor?: string;

  async init(): Promise<'fallback'> {
    return 'fallback';
  }

  lastMode?: RollMode;
  lowGravity = false;

  async roll(mode: RollMode, sides: DieSides, color?: string): Promise<number[]> {
    this.lastMode = mode;
    this.lastSides = sides;
    this.lastColor = color;
    return this.next;
  }

  setLowGravity(low: boolean): void {
    this.lowGravity = low;
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

  /** Today's table condition; clear unless a test says otherwise, since it's rolled at random. */
  let condition: DayCondition;

  beforeEach(async () => {
    condition = 'clear';
    vi.spyOn(StatsService.prototype, 'condition').mockImplementation(() => condition);
    // jsdom has no canvas; the confetti layer copes with a missing context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // Nor modal dialogs.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
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

    it('does not roll on Space, so a stray key press can\'t replace the day\'s roll', async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', {key: ' '}));
      await fixture.whenStable();
      expect(app.sessionRolls).toBe(0);
    });

    it('does not roll when the table is clicked', async () => {
      fixture.nativeElement.querySelector('.table').click();
      await fixture.whenStable();
      expect(app.sessionRolls).toBe(0);
    });

    it('shares the day\'s roll, not a later practice roll', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
      await app.roll();
      dice.next = [3];
      await app.roll();
      await app.share();
      expect(writeText.mock.calls[0][0]).toMatch(/🎲 12\n.*\nhttps:\/\/whatsmymotivation\.today$/);
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
      expect(live()).toBe(`Today's roll, advantage: 17. Dropped 4. ${app.result!.verdict.message} Badge unlocked: First roll.`);
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

    it('applies the chosen accent color', () => {
      (fixture.nativeElement.querySelector('input[name="accent"][value="arcane"]') as HTMLInputElement).click();
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#a58bff');
      expect(JSON.parse(store.get('wmm.prefs.v1')!)).toMatchObject({accent: 'arcane'});
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

    it('spends a ✦ to reroll today\'s roll, but only after confirming', async () => {
      app.skipTour();
      dice.next = [3];
      await app.roll();
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const rerollButton = () => [...el.querySelectorAll('.result-actions button')]
        .find(b => b.textContent!.includes('Reroll')) as HTMLButtonElement | undefined;
      const dialog = el.querySelector('dialog[aria-labelledby="reroll-title"]') as HTMLDialogElement;

      dice.next = [17];
      rerollButton()!.click();
      fixture.detectChanges();
      expect(dialog.open).toBe(true);
      expect(dialog.textContent).toContain('Reroll today\'s 3?');
      expect(dialog.textContent).toContain('It\'s your last one.');
      expect(app.today?.value).toBe(3);

      (dialog.querySelector('.btn-primary') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(dialog.open).toBe(false);
      expect(app.today?.value).toBe(17);
      expect(app.result?.rerolledFrom?.value).toBe(3);
      expect(app.stats.inspiration.held).toBe(0);
      expect(el.querySelector('.result-label')!.textContent).toContain('rerolled');
      expect(el.querySelector('.result-sub')!.textContent).toContain('was 3');
      expect(rerollButton()).toBeUndefined();
    });

    it('keeps the roll when the reroll is turned down', async () => {
      app.skipTour();
      dice.next = [3];
      await app.roll();
      fixture.detectChanges();
      app.askReroll();
      fixture.detectChanges();
      const dialog = fixture.nativeElement.querySelector('dialog[aria-labelledby="reroll-title"]') as HTMLDialogElement;
      const keep = dialog.querySelector('.btn-ghost') as HTMLButtonElement;
      expect(keep.hasAttribute('autofocus')).toBe(true);
      keep.click();
      expect(dialog.open).toBe(false);
      expect(app.today?.value).toBe(3);
      expect(app.stats.inspiration.held).toBe(1);
    });

    it('shows ✦ earned for a natural top face, with a pointer the first time', async () => {
      dice.next = [20];
      await app.roll();
      fixture.detectChanges();
      expect(app.result!.inspiration).toEqual({reasons: ['natural'], kept: 1, first: true});
      const earned = fixture.nativeElement.querySelector('.result-earned').textContent.replace(/\s+/g, ' ');
      expect(earned).toContain('+1 Inspiration');
      expect(earned).toContain('For a natural 20. Tap ✦ up top');
      // The ✦ counter shows up with the first ✦, even before Getting started is done.
      expect(fixture.nativeElement.querySelector('.hud-button').textContent).toContain('1');
    });

    it('keeps a natural 1\'s crack through practice rolls until a reroll replaces it', async () => {
      app.skipTour();
      dice.next = [1];
      await app.roll();
      expect(app.crack).not.toBeNull();
      dice.next = [15];
      await app.roll();
      expect(app.crack).not.toBeNull();
      await app.reroll();
      expect(app.crack).toBeNull();
    });

    it('cracks the table for a practice 1 only while it is shown', async () => {
      await app.roll();
      dice.next = [1];
      await app.roll();
      expect(app.crack).not.toBeNull();
      dice.next = [9];
      await app.roll();
      expect(app.crack).toBeNull();
    });

    it('plays the dice and crit sounds, and stops when muted', async () => {
      const thrown = vi.spyOn(app.sound, 'diceThrown');
      const landed = vi.spyOn(app.sound, 'landed');
      dice.next = [4, 20];
      app.setMode('advantage');
      await app.roll();
      expect(thrown).toHaveBeenCalledWith(2);
      expect(landed).toHaveBeenCalledWith('big-burst');

      fixture.detectChanges();
      const mute = fixture.nativeElement.querySelector('button[aria-label="Mute sounds"]') as HTMLButtonElement;
      expect(mute.getAttribute('aria-pressed')).toBe('false');
      mute.click();
      fixture.detectChanges();
      expect(mute.getAttribute('aria-pressed')).toBe('true');
      expect(app.sound.sound).toBe(false);
      expect(JSON.parse(store.get('wmm.prefs.v1')!).sound).toBe(false);
    });

    it('sets the volume, and plays a die at the new level once the slider is let go', () => {
      const thrown = vi.spyOn(app.sound, 'diceThrown');
      const volume = vi.spyOn(app.sound, 'volume', 'set');
      app.setVolume(0.3);
      expect(volume).toHaveBeenLastCalledWith(0.3);
      expect(thrown).not.toHaveBeenCalled();
      app.setVolume(0.8, true);
      expect(thrown).toHaveBeenCalledWith(1);
      expect(JSON.parse(store.get('wmm.prefs.v1')!).volume).toBe(0.8);
    });

    it('labels practice rolls apart from the day\'s roll', async () => {
      dice.next = [12];
      await app.roll();
      expect(app.resultLabel(app.result!)).toBe('Today\'s roll');
      dice.next = [5];
      await app.roll();
      expect(app.resultLabel(app.result!)).toBe('Practice roll');
    });

    it('unlocks badges once, shows them on the table and lists them in Stats', async () => {
      const tick = vi.spyOn(app.sound, 'badgeUnlocked');
      dice.next = [1, 1];
      app.setMode('disadvantage');
      await app.roll();
      fixture.detectChanges();
      expect(app.result!.badges.map(b => b.id)).toEqual(['first-roll', 'rock-bottom', 'snake-eyes']);
      const chips = [...fixture.nativeElement.querySelectorAll('.result-chips li')].map((li: Element) => li.textContent!.trim());
      expect(chips).toEqual(['🎲 First roll badge', '💀 Rock bottom badge', '🐍 Snake eyes badge']);
      expect(tick).toHaveBeenCalledWith(1.8);

      await app.roll();
      expect(app.result!.badges).toEqual([]);

      app.openStats();
      app.setStatsTab('badges');
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.badge-count')!.textContent!.replace(/\s+/g, ' ')).toContain('3 of 20 badges earned');
      expect(el.querySelectorAll('.badge:not(.is-locked)').length).toBe(3);
      expect(el.querySelector('.badge.is-locked .badge-progress')!.textContent).toContain('1 of 6 dice');
    });

    it('cycles through the three stats tabs with the arrow keys', () => {
      app.openStats();
      fixture.detectChanges();
      const tab = () => fixture.nativeElement.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement;
      tab().dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft'}));
      expect(app.statsTab).toBe('badges');
      fixture.detectChanges();
      tab().dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight'}));
      expect(app.statsTab).toBe('daily');
    });

    it('gives the day a quest to tick off, then a line to note what got done', async () => {
      dice.next = [12];
      await app.roll();
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const quest = app.today!.quest!;
      expect(el.querySelector('.quest-text')!.textContent).toContain(app.questText(quest.id));
      expect(el.querySelector('.quest-form')).toBeNull();

      (el.querySelector('.quest-check') as HTMLInputElement).click();
      fixture.detectChanges();
      expect(app.today!.quest!.done).toBe(true);
      const input = el.querySelector('.quest-form input') as HTMLInputElement;
      input.value = 'Shipped the slides';
      (el.querySelector('.quest-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(app.today!.note).toBe('Shipped the slides');
      expect(el.querySelector('.quest-note')!.textContent).toContain('Shipped the slides');
      expect(el.querySelector('.quest-form')).toBeNull();

      // Practice rolls show the practice result, not the day's quest.
      dice.next = [3];
      await app.roll();
      fixture.detectChanges();
      expect(el.querySelector('.quest')).toBeNull();
    });

    it('hides the quest when it is switched off', async () => {
      (fixture.nativeElement.querySelector('#quests-switch') as HTMLInputElement).click();
      await app.roll();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.quest')).toBeNull();
    });

    it('hides Inspiration when it is switched off', async () => {
      (fixture.nativeElement.querySelector('#rerolls-switch') as HTMLInputElement).click();
      await app.roll();
      fixture.detectChanges();
      expect(app.prefs.rerolls).toBe(false);
      expect(fixture.nativeElement.querySelector('.result-actions').textContent).not.toContain('Reroll');
      expect(fixture.nativeElement.querySelector('.hud-button')).toBeNull();
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
      expect(el.querySelectorAll('.calendar-day:not(.is-empty)').length).toBe(1);

      (el.querySelector('#tab-all') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(readout()).toContain('across 2 rolls on the d20');
      expect(el.querySelectorAll('.history li').length).toBe(2);
    });

    it('folds the chart and rerolls under More stats, staying open across tabs', async () => {
      await app.roll();
      app.openStats();
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const fold = () => el.querySelector('.more-stats') as HTMLDetailsElement;

      expect(fold().open).toBe(false);
      expect(fold().querySelector('.chart')).not.toBeNull();
      expect(fold().textContent).toContain('Rerolls');

      fold().open = true;
      fold().dispatchEvent(new Event('toggle'));
      (el.querySelector('#tab-all') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fold().open).toBe(true);
      expect(fold().textContent).not.toContain('Rerolls');
    });
  });

  describe('the dev launcher', () => {
    beforeEach(setup);

    it('has a Dev chip that opens it in its own tab', () => {
      const chip = fixture.nativeElement.querySelector('.dev-chip') as HTMLAnchorElement;
      expect(chip.getAttribute('href')).toBe('/?launcher');
      expect(chip.target).toBe('wmm-launcher');
    });

    it('opens on `, but not while typing', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      document.body.dispatchEvent(new KeyboardEvent('keydown', {key: '`', bubbles: true}));
      expect(open).toHaveBeenCalledWith('/?launcher', 'wmm-launcher');

      open.mockClear();
      const input = document.createElement('input');
      document.body.append(input);
      input.dispatchEvent(new KeyboardEvent('keydown', {key: '`', bubbles: true}));
      input.remove();
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('Getting started', () => {
    const el = () => fixture.nativeElement as HTMLElement;
    const steps = (root: Element) => [...root.querySelectorAll('.tour-list li')]
      .map(li => (li.classList.contains('is-done') ? '✓ ' : '') + li.firstChild!.textContent!.trim());

    beforeEach(async () => {
      vi.setSystemTime(new Date(2026, 8, 10, 9));
      await setup();
    });

    afterEach(() => vi.useRealTimers());

    it('walks a new player through a roll, the quest and a second day, then gives the first ✦', async () => {
      const card = el().querySelector('.tour-card')!;
      expect(card.textContent).toContain('Welcome to the table');
      expect(steps(card)).toEqual(['Roll for motivation', 'Finish today\'s quest', 'Come back tomorrow']);
      expect(el().querySelector('.hud-button')).toBeNull();
      expect(el().querySelector('.topbar .btn-primary')!.classList).toContain('is-calling');

      dice.next = [12];
      await app.roll();
      fixture.detectChanges();
      expect(el().querySelector('.tour-card')).toBeNull();
      expect(el().querySelector('.tour-pill')!.textContent).toContain('Getting started · 1 of 3');

      (el().querySelector('.quest-check') as HTMLInputElement).click();
      fixture.detectChanges();
      expect(el().querySelector('.tour-pill')!.textContent).toContain('2 of 3');
      expect(app.stats.inspiration.held).toBe(0);

      vi.setSystemTime(new Date(2026, 8, 11, 9));
      app.onVisibilityChange();
      fixture.detectChanges();
      expect(el().querySelector('.tour-card')!.textContent).toContain('Welcome back');

      await app.roll();
      fixture.detectChanges();
      expect(app.result!.inspiration).toEqual({reasons: ['tour'], kept: 1, first: true});
      expect(el().querySelector('.result-earned-hint')!.textContent).toContain('Save it for a day you don\'t like');
      expect(el().querySelector('.hud-button')!.textContent).toContain('1');
      expect(el().querySelector('.tour-pill')).toBeNull();
      expect(app.announcement).toContain('Plus 1 Inspiration');
    });

    it('can be finished in any order', async () => {
      await app.roll();
      vi.setSystemTime(new Date(2026, 8, 11, 9));
      await app.roll();
      expect(app.stats.tour.finished).toBe(false);
      fixture.detectChanges();
      (el().querySelector('.quest-check') as HTMLInputElement).click();
      fixture.detectChanges();
      expect(app.stats.tour.finished).toBe(true);
      expect(app.result!.inspiration).toEqual({reasons: ['tour'], kept: 1, first: true});
    });

    it('can be skipped, which still gives the first ✦', () => {
      (el().querySelector('.tour-skip') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el().querySelector('.tour-card')).toBeNull();
      expect(el().querySelector('.hud-button')!.textContent).toContain('1');
    });

    it('lists the steps in a dialog from the pill', async () => {
      await app.roll();
      fixture.detectChanges();
      (el().querySelector('.tour-pill') as HTMLButtonElement).click();
      fixture.detectChanges();
      const dialog = el().querySelector('dialog[aria-labelledby="tour-title"]') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
      expect(steps(dialog)).toEqual(['✓ Roll for motivation', 'Finish today\'s quest', 'Come back tomorrow']);
    });

    it('swaps the quest step for the stats when the daily quest is off', async () => {
      app.setQuests(false);
      fixture.detectChanges();
      expect(steps(el().querySelector('.tour-card')!)[1]).toBe('Look at your stats');
      app.openStats();
      fixture.detectChanges();
      expect(steps(el().querySelector('.tour-card')!)[1]).toBe('✓ Look at your stats');
    });
  });

  describe('the calendar', () => {
    const el = () => fixture.nativeElement as HTMLElement;
    const key = (k: string) => (el().querySelector('.calendar-day[tabindex="0"]') as HTMLElement)
      .dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true}));

    beforeEach(async () => {
      vi.setSystemTime(new Date(2026, 9, 10, 9));
      store.set(STATS_KEY, JSON.stringify({
        days: [
          {date: '2026-10-10', value: 17, sides: 20, mode: 'advantage', rerolledFrom: {value: 3, sides: 20}},
          {date: '2026-10-08', value: 1, sides: 20, mode: 'normal'},
          {date: '2026-09-20', value: 20, sides: 20, mode: 'normal'},
        ],
      }));
      await setup();
      app.openStats();
      fixture.detectChanges();
    });

    afterEach(() => vi.useRealTimers());

    it('opens on this month with today picked and the month summed up', () => {
      expect(el().querySelector('#calendar-title')!.textContent).toBe('October 2026');
      expect(el().querySelector('.calendar-summary')!.textContent!.replace(/\s+/g, ' ')).toContain('2 days rolled · average 9.0 · 0 crits');
      expect(el().querySelector('.calendar-day[aria-pressed="true"]')!.getAttribute('aria-label'))
        .toBe('Saturday, October 10, today, rolled 17, rerolled from 3');
      expect(el().querySelector('.calendar-details')!.textContent).toContain('Rerolled from a 3.');
    });

    it('marks crits, crit fails and rerolls', () => {
      expect(el().querySelector('#day-2026-10-08 .calendar-crack')).not.toBeNull();
      expect(el().querySelector('#day-2026-10-10 .calendar-reroll')).not.toBeNull();
    });

    it('moves by day and week with the arrow keys, but not into the future', () => {
      key('ArrowRight');
      expect(app.calendarDay).toBe('2026-10-10');
      key('ArrowLeft');
      key('ArrowLeft');
      fixture.detectChanges();
      expect(app.calendarDay).toBe('2026-10-08');
      expect(el().querySelector('.calendar-details')!.textContent).toContain('Rolled 1 on the d20');
      key('ArrowUp');
      expect(app.calendarDay).toBe('2026-10-01');
    });

    it('pages back to the oldest month with rolls, and no further', () => {
      expect(app.canShiftCalendar(1)).toBe(false);
      app.shiftCalendar(-1);
      fixture.detectChanges();
      expect(el().querySelector('#calendar-title')!.textContent).toBe('September 2026');
      expect(el().querySelector('#day-2026-09-20 .calendar-mark')!.textContent).toBe('★');
      expect(app.canShiftCalendar(-1)).toBe(false);
    });
  });

  describe('table conditions', () => {
    const pill = () => fixture.nativeElement.querySelector('.condition-pill') as HTMLButtonElement | null;

    it('shows nothing on a clear day', async () => {
      await setup();
      expect(pill()).toBeNull();
    });

    it('names the condition on the felt and explains it', async () => {
      condition = 'foggy';
      await setup();
      expect(pill()!.textContent).toContain('Foggy today');
      pill()!.click();
      fixture.detectChanges();
      const dialog = fixture.nativeElement.querySelector('dialog[aria-labelledby="condition-title"]') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
      expect(dialog.textContent).toContain('wipe the fog away');
    });

    it('rolls the day\'s roll with advantage when Blessed, then frees the mode', async () => {
      condition = 'blessed';
      await setup();
      const advantage = fixture.nativeElement.querySelector('.segmented button[aria-label="Advantage"]') as HTMLButtonElement;
      expect(advantage.getAttribute('aria-pressed')).toBe('true');
      expect(advantage.disabled).toBe(true);
      expect(advantage.querySelector('.mode-lock')).not.toBeNull();
      dice.next = [5, 14];
      await app.roll();
      expect(dice.lastMode).toBe('advantage');
      expect(app.today?.value).toBe(14);
      dice.next = [9];
      await app.roll();
      expect(dice.lastMode).toBe('normal');
    });

    it('rolls with disadvantage when Hexed', async () => {
      condition = 'hexed';
      await setup();
      dice.next = [5, 14];
      await app.roll();
      expect(dice.lastMode).toBe('disadvantage');
      expect(app.today?.value).toBe(5);
    });

    it('earns a ✦ for a roll of 15 or more on an Inspired day', async () => {
      condition = 'inspired';
      await setup();
      app.skipTour();
      dice.next = [15];
      await app.roll();
      expect(app.result!.inspiration).toEqual(expect.objectContaining({reasons: ['inspired'], kept: 1}));
      expect(app.stats.inspiration.held).toBe(2);
    });

    it('lowers the dice\'s gravity on a low-gravity day', async () => {
      condition = 'low-gravity';
      await setup();
      expect(dice.lowGravity).toBe(true);
    });
  });

  describe('during Spooky season', () => {
    const felt = () => document.documentElement.style.getPropertyValue('--felt');

    beforeEach(async () => {
      vi.setSystemTime(new Date(2026, 9, 10, 9));
      await setup();
    });

    afterEach(() => vi.useRealTimers());

    it('dresses the table, dice and corners for the season', async () => {
      fixture.detectChanges();
      expect(app.season?.id).toBe('spooky');
      expect(felt()).toBe('#251433');
      expect(fixture.nativeElement.querySelectorAll('.doodle').length).toBe(SEASONS.find(s => s.id === 'spooky')!.doodles.length);
      await app.roll();
      expect(dice.lastColor).toBe('#e8731c');
    });

    it('turns the season off until it ends when you pick your own table', () => {
      app.setTable('royal');
      expect(app.season).toBeNull();
      expect(app.prefs.seasonOff).toBe('spooky-2026');
      expect(felt()).toBe('#143a66');
      app.useSeason();
      expect(app.season?.id).toBe('spooky');
    });

    it('turns the season off when you pick your own dice', () => {
      app.setDice('ruby');
      expect(app.season).toBeNull();
      expect(app.diceTint).toBe('#b3262d');
    });

    it('can be switched off entirely', () => {
      app.setSeasonal(false);
      fixture.detectChanges();
      expect(app.season).toBeNull();
      expect(app.seasonAvailable).toBeNull();
      expect(fixture.nativeElement.querySelector('.doodles')).toBeNull();
    });
  });

  describe('outside a season', () => {
    beforeEach(async () => {
      vi.setSystemTime(new Date(2026, 10, 5, 9));
      await setup();
    });

    afterEach(() => vi.useRealTimers());

    it('uses your own table', () => {
      expect(app.season).toBeNull();
      expect(document.documentElement.style.getPropertyValue('--felt')).toBe('#10422f');
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
