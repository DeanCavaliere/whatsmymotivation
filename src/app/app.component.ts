import {AfterViewInit, Component, ElementRef, HostListener, isDevMode, NgZone, OnDestroy, Optional, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {SwUpdate} from '@angular/service-worker';
import {ConfettiComponent} from './components/confetti/confetti.component';
import {TableWeatherComponent} from './components/table-weather/table-weather.component';
import {ConditionInfo, CONDITIONS, DayCondition, forcedMode, isDayCondition} from './conditions';
import {ConfettiService} from './components/confetti/confetti.service';
import {Badge, BADGES, newBadges, Progress} from './achievements';
import {CalendarDay, CalendarMonth, calendarMonth, earliestMonth, shiftMonth} from './calendar';
import {CrackPath, crackPaths} from './crack';
import {formatAverage, formatCount, formatDate, formatPercent} from './format';
import {NOTE_LIMIT, questById} from './quests';
import {TourItem, tourDone, tourItems} from './tour';
import {activeSeason, Season, seasonKey, SEASONS} from './seasons';
import {shareText} from './share';
import {DiceService} from './dice.service';
import {SoundService} from './sound.service';
import {Celebration, DieSides, dieOdds, keptValue, RollMode, Tier, tierFor, Verdict, verdictFor} from './motivation';
import {
  accentColor,
  ACCENTS,
  DICE_COLORS,
  diceColor,
  DIE_OPTIONS,
  Prefs,
  PREFS_KEY,
  PrefsService,
  TABLE_THEMES,
  tableTheme,
} from './prefs.service';
import {
  activeStreak,
  addDays,
  CountTotals,
  countTotals,
  dateFromKey,
  DayRoll,
  DieSummary,
  dieSummaries,
  INSPIRATION_CAP,
  InspirationReason,
  inspirationReasons,
  localDateKey,
  Stats,
  STATS_KEY,
  StatsService,
  streakAtRisk,
  STREAK_STEP,
  todayRoll,
} from './stats.service';

interface RollResult {
  value: number;
  sides: DieSides;
  /** The other die when rolling with advantage/disadvantage. */
  dropped: number | null;
  mode: RollMode;
  verdict: Verdict;
  isToday: boolean;
  /** The roll a reroll replaced. */
  rerolledFrom: { value: number; sides: DieSides } | null;
  /** Streak length after this roll, when it was today's roll. */
  streak: number;
  newBest: boolean;
  /** Badges this roll unlocked. */
  badges: Badge[];
  inspiration: InspirationGain | null;
}

/** ✦ this roll earned. */
interface InspirationGain {
  reasons: InspirationReason[];
  /** How many were kept; any more were over the cap. */
  kept: number;
  /** The first ✦ ever earned, which points at the counter. */
  first: boolean;
}

interface BadgeView {
  badge: Badge;
  /** The date it was earned, YYYY-MM-DD. */
  earned: string | null;
  progress: Progress | null;
}

interface ChartBar {
  face: number;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Whether the face gets a label under the axis. */
  labeled: boolean;
}

export type StatsTab = 'daily' | 'all' | 'badges';

const STATS_TABS: readonly StatsTab[] = ['daily', 'all', 'badges'];

interface StatsView {
  /** Dice with rolls in the current tab. */
  dice: DieSummary[];
  /** The die whose distribution is charted. */
  die: DieSummary | null;
  bars: ChartBar[];
}

/** Chromium's install prompt event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOption = 'prompt' | 'ios' | 'installed' | null;

const SITE_URL = 'https://whatsmymotivation.today';
const CHART = {width: 400, height: 120, gap: 2, maxBarWidth: 40};
/** Crack paths are drawn this far out, then scaled to the table. */
const CRACK_REACH = 1000;

/** Where the crack starts (the result number), in the felt's own pixels. */
interface CrackBox {
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
}

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ConfettiComponent, TableWeatherComponent]
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('table', {static: true}) tableRef!: ElementRef<HTMLElement>;
  @ViewChild('diceBox', {static: true}) diceBoxRef!: ElementRef<HTMLElement>;
  @ViewChild('statsDialog', {static: true}) statsDialogRef!: ElementRef<HTMLDialogElement>;
  @ViewChild('settingsDialog', {static: true}) settingsDialogRef!: ElementRef<HTMLDialogElement>;
  @ViewChild('rerollDialog', {static: true}) rerollDialogRef!: ElementRef<HTMLDialogElement>;
  @ViewChild('inspirationDialog', {static: true}) inspirationDialogRef!: ElementRef<HTMLDialogElement>;
  @ViewChild('conditionDialog', {static: true}) conditionDialogRef!: ElementRef<HTMLDialogElement>;
  @ViewChild('tourDialog', {static: true}) tourDialogRef!: ElementRef<HTMLDialogElement>;
  @ViewChild(TableWeatherComponent) weather?: TableWeatherComponent;

  /** `label` is shortened to fit the top bar; screen readers get `name`. */
  readonly modes: { value: RollMode, label: string, name: string, hint: string }[] = [
    {value: 'disadvantage', label: 'Disadv.', name: 'Disadvantage', hint: 'Roll two dice, keep the lower'},
    {value: 'normal', label: 'Normal', name: 'Normal', hint: 'Roll one die'},
    {value: 'advantage', label: 'Adv.', name: 'Advantage', hint: 'Roll two dice, keep the higher'},
  ];
  readonly chart = CHART;
  readonly tableThemes = TABLE_THEMES;
  readonly diceColors = DICE_COLORS;
  readonly accents = ACCENTS;
  readonly dieOptions = DIE_OPTIONS.map(d => ({...d, odds: dieOdds(d.sides)}));
  readonly dateFromKey = dateFromKey;
  readonly formatDate = formatDate;
  readonly formatCount = formatCount;
  readonly formatAverage = formatAverage;
  readonly formatPercent = formatPercent;
  readonly diceColorOf = diceColor;
  readonly tableThemeOf = tableTheme;
  readonly accentOf = accentColor;
  readonly inspirationCap = INSPIRATION_CAP;
  readonly streakStep = STREAK_STEP;
  /** Today's table condition. */
  condition: DayCondition = 'clear';
  /** Counts throws, so a foggy table fogs over again for each one. */
  throwCount = 0;
  readonly noteLimit = NOTE_LIMIT;
  /** Whether today's saved note is open for editing on the felt. */
  editingNote = false;
  /** Getting started, while it's under way; null once it's finished or skipped. */
  tour: TourItem[] | null = null;
  /** Briefly true when a step of Getting started ticks off. */
  tourTicked = false;
  /** Briefly true when the ✦ counter first appears. */
  inspirationNew = false;
  /** How many steps of Getting started were ticked last time, so a new tick can show itself. */
  private tourSeen = 0;

  ready = false;
  rolling = false;
  mode: RollMode = 'normal';
  result: RollResult | null = null;
  stats: Stats;
  totals!: CountTotals;
  daysRolled = 0;
  today: DayRoll | null = null;
  streak = 0;
  streakAtRisk = false;
  /** Briefly true while the table shakes for a reroll. */
  tableShaken = false;
  /** Briefly true while the table jolts and loses its color on a natural 1. */
  tableJolted = false;
  tableDrained = false;
  /** The crack left by a natural 1. It stays all day while that 1 is the day's roll. */
  crack: CrackPath[] | null = null;
  crackBox: CrackBox | null = null;
  /** Whether the crack just appeared, so it spreads instead of being already there. */
  crackFresh = false;
  sessionRolls = 0;
  statsTab: StatsTab = 'daily';
  /** The die picked in the stats dialog, when rolls span more than one. */
  chartSides: DieSides | null = null;
  statsView: StatsView = {dice: [], die: null, bars: []};
  /** The month shown in Stats › Daily, and the day picked in it. */
  calendar: CalendarMonth | null = null;
  calendarDay = localDateKey(new Date());
  readonly weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  badgeList: BadgeView[] = [];
  badgeCount = 0;
  hoveredBar: ChartBar | null = null;
  confirmingReset = false;
  prefs: Prefs;
  /** The season on today's date, when seasonal themes are on. */
  seasonAvailable: Season | null = null;
  /** The season dressing the table: available, and not turned off by picking another table or dice. */
  season: Season | null = null;
  install: InstallOption = null;
  toast = '';
  /** What screen readers hear when the dice land. */
  announcement = '';
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private shakeTimer?: ReturnType<typeof setTimeout>;
  private joltTimer?: ReturnType<typeof setTimeout>;
  private drainTimer?: ReturnType<typeof setTimeout>;
  private tourTimer?: ReturnType<typeof setTimeout>;
  private inspirationTimer?: ReturnType<typeof setTimeout>;
  private resizeObserver?: ResizeObserver;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  constructor(private dice: DiceService,
              private statsService: StatsService,
              private confetti: ConfettiService,
              private prefsService: PrefsService,
              readonly sound: SoundService,
              private zone: NgZone,
              @Optional() swUpdate: SwUpdate | null) {
    // A cached version whose files are gone from the server can't recover on its own.
    swUpdate?.unrecoverable.subscribe(() => document.location.reload());
    this.prefs = this.prefsService.load();
    this.applyTable();
    this.install = detectInstallOption();
    this.condition = previewCondition() ?? this.statsService.condition();
    this.stats = this.statsService.load();
    this.refreshDerived();
    this.tourSeen = this.tour ? tourDone(this.tour) : 0;
    const today = this.today;
    if (today) {
      this.result = {
        value: today.value,
        sides: today.sides,
        dropped: null,
        mode: today.mode,
        verdict: verdictFor(today.value, today.sides, Math.random, this.season?.messages),
        isToday: true,
        rerolledFrom: today.rerolledFrom ?? null,
        streak: this.streak,
        newBest: false,
        badges: [],
        inspiration: null,
      };
    }
    this.refreshCrack();
  }

  ngAfterViewInit(): void {
    this.dice.init(this.diceBoxRef.nativeElement).then(() => this.zone.run(() => {
      this.ready = true;
      this.applyGravity();
    }));
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.zone.run(() => this.measureCrack()));
      this.resizeObserver.observe(this.tableRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    clearTimeout(this.shakeTimer);
    clearTimeout(this.joltTimer);
    clearTimeout(this.drainTimer);
    clearTimeout(this.tourTimer);
    clearTimeout(this.inspirationTimer);
    this.resizeObserver?.disconnect();
  }

  /** Keeps counters in sync when another tab rolls. */
  @HostListener('window:storage', ['$event'])
  onStorage(event: StorageEvent): void {
    if (event.key === STATS_KEY || event.key === null) {
      this.stats = this.statsService.load();
      this.refreshDerived();
    }
    if (event.key === PREFS_KEY || event.key === null) {
      this.prefs = this.prefsService.load();
      this.applyTable();
    }
  }

  /** Chromium browsers offer an install prompt that we can trigger from our own button. */
  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: Event): void {
    this.installPrompt = event as BeforeInstallPromptEvent;
    this.install = 'prompt';
  }

  @HostListener('window:appinstalled')
  onAppInstalled(): void {
    this.installPrompt = null;
    this.install = 'installed';
  }

  /** The app may sit open (or installed) across midnight; refresh day-based state on return. */
  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState !== 'visible') {
      return;
    }
    // A new day brings a new condition, and a season may have started or ended overnight.
    this.condition = previewCondition() ?? this.statsService.condition();
    this.applyGravity();
    this.stats = this.statsService.load();
    this.refreshDerived();
    this.applyTable();
    if (this.result?.isToday && !this.today && !this.rolling) {
      this.result = null;
    }
  }

  roll(): Promise<void> {
    return this.throwDice(false);
  }

  /** Rerolling costs a ✦, so it always asks first. */
  askReroll(): void {
    if (this.canReroll) {
      this.rerollDialogRef.nativeElement.showModal();
    }
  }

  /** Spends a ✦: shakes the table and rerolls today's roll. */
  reroll(): Promise<void> {
    this.rerollDialogRef.nativeElement.close();
    if (!this.canReroll) {
      return Promise.resolve();
    }
    this.tableShaken = true;
    clearTimeout(this.shakeTimer);
    this.shakeTimer = setTimeout(() => this.tableShaken = false, 500);
    return this.throwDice(true);
  }

  get canReroll(): boolean {
    return this.prefs.rerolls && !!this.today && this.stats.inspiration.held >= 1;
  }

  /** The ✦ counter stays out of the header until the first ✦ is earned. */
  get showInspiration(): boolean {
    return this.prefs.rerolls && (this.stats.tour.finished || this.stats.inspiration.earned > 0);
  }

  /** The checklist sits on the empty felt, until the dice are thrown. */
  get showTourCard(): boolean {
    return !!this.tour && !this.result && !this.rolling;
  }

  get tourStepsDone(): number {
    return this.tour ? tourDone(this.tour) : 0;
  }

  openTour(): void {
    this.tourDialogRef.nativeElement.showModal();
  }

  /** For anyone who already knows the game: hands over the first ✦ and hides the checklist. */
  skipTour(): void {
    this.tourDialogRef.nativeElement.close();
    this.stats = this.statsService.finishTour();
    this.refreshDerived();
    this.flashInspiration();
    this.announcement = 'Getting started skipped. You have your first Inspiration.';
    this.showToast('Here\'s your first ✦ Inspiration.');
  }

  openInspiration(): void {
    this.inspirationDialogRef.nativeElement.showModal();
  }

  private async throwDice(reroll: boolean): Promise<void> {
    if (!this.ready || this.rolling) {
      return;
    }
    this.rolling = true;
    this.throwCount++;
    this.editingNote = false;
    this.result = null;
    this.refreshCrack();
    this.announcement = '';
    // Blessed and Hexed decide the mode for the day's roll, rerolls included.
    const mode = (reroll || !this.today ? forcedMode(this.condition) : null) ?? this.mode;
    const sides = this.prefs.sides;
    // Still inside the click, so the browser lets audio start.
    this.sound.diceThrown(mode === 'normal' ? 1 : 2);
    try {
      const values = await this.dice.roll(mode, sides, this.diceTint);
      const value = keptValue(values, mode);
      const before = todayRoll(this.stats);
      const previousBest = this.stats.streak.best;
      const {held, earned} = this.stats.inspiration;
      try {
        this.stats = reroll
          ? this.statsService.reroll(value, sides, mode, new Date(), this.condition)
          : this.statsService.record(value, sides, mode, new Date(), this.condition);
      } catch {
        // Another tab spent the last ✦ (or rolled over midnight) while the dice were in the air.
        this.stats = this.statsService.load();
        this.refreshDerived();
        this.showToast('No Inspiration left to spend.');
        return;
      }
      this.sessionRolls++;
      const isDayRoll = reroll || !before;
      const reasons = isDayRoll ? inspirationReasons(value, sides, this.stats.streak.current, !reroll, this.condition) : [];
      const badges = newBadges(this.stats, {
        values, value, sides, mode, isDayRoll, rerolledFrom: reroll && before ? before.value : null,
        condition: this.condition, date: localDateKey(new Date()),
      });
      if (badges.length) {
        this.stats = this.statsService.award(badges.map(b => b.id));
      }
      this.refreshDerived();
      // The day's roll can tick off Getting started, and finishing it brings the first ✦.
      if (!reroll && !before && this.advanceTour() !== null) {
        reasons.push('tour');
      }
      const kept = this.stats.inspiration.held - (held - (reroll ? 1 : 0));

      const verdict = verdictFor(value, sides, Math.random, this.season?.messages);
      this.result = {
        value,
        sides,
        dropped: values.length > 1 ? values.find((v, i) => i !== values.indexOf(value)) ?? null : null,
        mode,
        verdict,
        isToday: isDayRoll,
        rerolledFrom: reroll && before ? {value: before.value, sides: before.sides} : null,
        streak: this.streak,
        newBest: !reroll && !before && this.streak > 1 && this.streak > previousBest,
        badges,
        inspiration: reasons.length ? {reasons, kept, first: earned === 0 && kept > 0} : null,
      };
      this.announcement = announce(this.result, this.resultLabel(this.result, ', '));
      this.refreshCrack();
      this.celebrate(verdict.celebration);
    } finally {
      this.rolling = false;
    }
  }

  setMode(mode: RollMode): void {
    this.mode = mode;
  }

  tierOf(value: number, sides: DieSides): Tier {
    return tierFor(value, sides);
  }

  get rollLabel(): string {
    if (!this.ready) return 'Setting up…';
    if (this.rolling) return 'Rolling…';
    return this.today ? 'Roll again' : 'Roll for motivation';
  }

  resultLabel(result: RollResult, separator = ' · '): string {
    return [
      result.isToday ? 'Today\'s roll' : 'Re-roll',
      result.rerolledFrom ? 'rerolled' : '',
      result.sides === 20 ? '' : `d${result.sides}`,
      result.mode === 'normal' ? '' : result.mode,
    ].filter(Boolean).join(separator);
  }

  /** Shares the day's roll and the last week, not a practice roll. */
  async share(): Promise<void> {
    if (!this.today) {
      return;
    }
    const text = shareText(this.today, this.stats.days, this.streak);
    try {
      if (navigator.share) {
        await navigator.share({text, url: SITE_URL});
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${SITE_URL}`);
      this.showToast('Copied to clipboard');
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        this.showToast('Couldn\'t share. Try copying the page link instead.');
      }
    }
  }

  openStats(): void {
    this.confirmingReset = false;
    this.chartSides = null;
    this.calendarDay = localDateKey(new Date());
    this.calendar = null;
    this.refreshStatsView();
    this.statsDialogRef.nativeElement.showModal();
    if (this.tour && !this.stats.tour.sawStats) {
      this.stats = this.statsService.sawStats();
      this.announcement = '';
      this.rewardTour(this.advanceTour());
    }
  }

  setStatsTab(tab: StatsTab): void {
    this.statsTab = tab;
    this.refreshStatsView();
  }

  /** Arrow keys move between tabs, as in any tablist. */
  onTabKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    this.setStatsTab(STATS_TABS[(STATS_TABS.indexOf(this.statsTab) + step + STATS_TABS.length) % STATS_TABS.length]);
    document.getElementById(`tab-${this.statsTab}`)?.focus();
  }

  /** Pages the calendar, keeping the same day of the month where it exists and isn't in the future. */
  shiftCalendar(by: number): void {
    if (!this.calendar || !this.canShiftCalendar(by)) {
      return;
    }
    const {year, month} = shiftMonth(this.calendar.year, this.calendar.month, by);
    const day = Math.min(Number(this.calendarDay.slice(8)), new Date(year, month + 1, 0).getDate());
    const date = localDateKey(new Date(year, month, day));
    const today = localDateKey(new Date());
    this.calendarDay = date > today ? today : date;
    this.refreshStatsView();
  }

  canShiftCalendar(by: number): boolean {
    if (!this.calendar) {
      return false;
    }
    const target = shiftMonth(this.calendar.year, this.calendar.month, by);
    const now = new Date();
    const earliest = earliestMonth(this.stats.days, now);
    const index = (m: { year: number, month: number }) => m.year * 12 + m.month;
    return index(target) >= index(earliest) && index(target) <= index({year: now.getFullYear(), month: now.getMonth()});
  }

  selectCalendarDay(date: string): void {
    this.calendarDay = date;
    this.refreshStatsView();
  }

  /** Arrow keys move by day and week, Page Up/Down by month, as in a date picker. */
  onCalendarKey(event: KeyboardEvent): void {
    const steps: Record<string, number> = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7};
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      this.shiftCalendar(event.key === 'PageUp' ? -1 : 1);
    } else if (event.key in steps) {
      event.preventDefault();
      const date = addDays(this.calendarDay, steps[event.key]);
      const {year, month} = earliestMonth(this.stats.days);
      if (date > localDateKey(new Date()) || date < localDateKey(new Date(year, month, 1))) {
        return;
      }
      this.selectCalendarDay(date);
    } else {
      return;
    }
    setTimeout(() => document.getElementById('day-' + this.calendarDay)?.focus());
  }

  /** "For a natural 20 and a 14-day streak" */
  inspirationReason(gain: InspirationGain, sides: DieSides): string {
    const text = {
      natural: `a natural ${sides}`,
      streak: `a ${this.streak}-day streak`,
      inspired: 'a high roll on an Inspired day',
      tour: 'finishing Getting started',
    };
    return 'For ' + gain.reasons.map(r => text[r]).join(' and ');
  }

  /** "Natural" or "On a roll and Collector" */
  badgeNames(badges: readonly Badge[]): string {
    const names = badges.map(b => b.name);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
  }

  get conditionInfo(): ConditionInfo | null {
    return this.condition === 'clear' ? null : CONDITIONS[this.condition];
  }

  /** The mode Blessed or Hexed sets, while the day's roll is still to come. */
  get lockedMode(): RollMode | null {
    return this.today ? null : forcedMode(this.condition);
  }

  openCondition(): void {
    this.conditionDialogRef.nativeElement.showModal();
  }

  questText(id: string): string {
    return questById(id)?.text ?? '';
  }

  setQuestDone(done: boolean): void {
    if (!this.today) {
      return;
    }
    this.stats = this.statsService.setQuestDone(this.today.date, done);
    this.refreshDerived();
    this.announcement = '';
    this.awardBadges();
    if (done) {
      this.rewardTour(this.advanceTour());
      // The note field appears once the quest is ticked.
      setTimeout(() => document.getElementById('quest-note')?.focus());
    }
  }

  /** Saves a day's note: today's from the felt, or any day's from the calendar. */
  saveNote(event: Event, note: string, date = this.today?.date): void {
    event.preventDefault();
    if (!date) {
      return;
    }
    this.stats = this.statsService.setNote(date, note);
    this.editingNote = false;
    this.refreshDerived();
    this.awardBadges();
  }

  /**
   * Moves Getting started along after something its checklist counts. Finishing it gives the first ✦;
   * returns how many ✦ that added (0 when full), or null when it isn't finished.
   */
  private advanceTour(): number | null {
    const items = tourItems(this.stats, this.prefs.quests);
    if (!items) {
      return null;
    }
    const done = tourDone(items);
    if (done === items.length) {
      const held = this.stats.inspiration.held;
      this.stats = this.statsService.finishTour();
      this.refreshDerived();
      this.flashInspiration();
      return this.stats.inspiration.held - held;
    }
    if (done > this.tourSeen) {
      this.tourTicked = true;
      clearTimeout(this.tourTimer);
      this.tourTimer = setTimeout(() => this.tourTicked = false, 900);
    }
    this.tourSeen = done;
    this.tour = items;
    return null;
  }

  /** Shows the first ✦ when Getting started finishes away from a roll, e.g. on ticking the quest. */
  private rewardTour(kept: number | null): void {
    if (kept === null) {
      return;
    }
    if (this.result) {
      this.result = {...this.result, inspiration: {reasons: ['tour'], kept, first: true}};
    }
    this.announcement = `${this.announcement} Getting started done. Plus ${kept} Inspiration.`.trim();
    this.sound.badgeUnlocked();
  }

  private flashInspiration(): void {
    this.inspirationNew = true;
    clearTimeout(this.inspirationTimer);
    this.inspirationTimer = setTimeout(() => this.inspirationNew = false, 800);
  }

  /** Badges that come from quests and notes rather than a roll. */
  private awardBadges(): void {
    const badges = newBadges(this.stats, null);
    if (!badges.length) {
      return;
    }
    this.stats = this.statsService.award(badges.map(b => b.id));
    this.refreshDerived();
    if (this.result) {
      this.result = {...this.result, badges: [...this.result.badges, ...badges]};
    }
    this.announcement = `${badges.length === 1 ? 'Badge' : 'Badges'} unlocked: ${this.badgeNames(badges)}.`;
    this.sound.badgeUnlocked();
  }

  /** A day's condition, for the calendar. */
  conditionOn(date: string): ConditionInfo | null {
    const condition = this.stats.conditions[date];
    return condition && condition !== 'clear' ? CONDITIONS[condition] : null;
  }

  get calendarRoll(): DayRoll | null {
    return this.stats.days.find(d => d.date === this.calendarDay) ?? null;
  }

  /** What a screen reader hears for a day: "Thursday, October 1, rolled 13, rerolled from 4". */
  calendarDayLabel(day: CalendarDay): string {
    const date = dateFromKey(day.date).toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
    const r = day.roll;
    return [
      date,
      day.isToday ? 'today' : '',
      r ? `rolled ${r.value}${r.sides === 20 ? '' : ' on the d' + r.sides}` : day.isFuture ? '' : 'no roll',
      day.tier === 'crit-success' ? 'natural top face' : day.tier === 'crit-fail' ? 'natural 1' : '',
      r?.rerolledFrom ? `rerolled from ${r.rerolledFrom.value}` : '',
    ].filter(Boolean).join(', ');
  }

  setChartSides(sides: DieSides): void {
    this.chartSides = sides;
    this.refreshStatsView();
  }

  openSettings(): void {
    this.settingsDialogRef.nativeElement.showModal();
  }

  /** Clicks on the backdrop land on the dialog element itself. */
  onDialogClick(event: MouseEvent): void {
    if (event.target instanceof HTMLDialogElement && event.target === event.currentTarget) {
      event.target.close();
    }
  }

  /** Picking your own table or dice turns the current season off until it ends. */
  setTable(id: string): void {
    this.prefs = {...this.prefs, table: id, seasonOff: this.availableSeasonKey()};
    this.prefsService.save(this.prefs);
    this.applyTable();
  }

  setAccent(id: string): void {
    this.prefs = {...this.prefs, accent: id};
    this.prefsService.save(this.prefs);
    this.applyTable();
  }

  setDice(id: string): void {
    this.prefs = {...this.prefs, dice: id, seasonOff: this.availableSeasonKey()};
    this.prefsService.save(this.prefs);
    this.applyTable();
  }

  /** Picking the season's swatch brings a season back after it was turned off. */
  useSeason(): void {
    this.prefs = {...this.prefs, seasonOff: null};
    this.prefsService.save(this.prefs);
    this.applyTable();
  }

  setSeasonal(seasonal: boolean): void {
    this.prefs = {...this.prefs, seasonal, seasonOff: null};
    this.prefsService.save(this.prefs);
    this.applyTable();
  }

  get diceTint(): string {
    return this.season?.dice ?? diceColor(this.prefs.dice).color;
  }

  /** "Oct 31" */
  seasonEnd(season: Season): string {
    return new Date(2000, season.end[0] - 1, season.end[1]).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  }

  private availableSeasonKey(): string | null {
    return this.seasonAvailable ? seasonKey(this.seasonAvailable, new Date()) : this.prefs.seasonOff;
  }

  setSides(sides: DieSides): void {
    this.prefs = {...this.prefs, sides};
    this.prefsService.save(this.prefs);
  }

  /** The header's mute button. */
  toggleSound(): void {
    this.setSound(!this.prefs.sound);
  }

  setSound(sound: boolean): void {
    this.prefs = {...this.prefs, sound};
    this.prefsService.save(this.prefs);
    this.applyTable();
  }

  setVibration(vibration: boolean): void {
    this.prefs = {...this.prefs, vibration};
    this.prefsService.save(this.prefs);
    this.applyTable();
  }

  setQuests(quests: boolean): void {
    this.prefs = {...this.prefs, quests};
    this.prefsService.save(this.prefs);
    // Getting started swaps its quest step for a stats step.
    this.refreshDerived();
    this.announcement = '';
    this.rewardTour(this.advanceTour());
  }

  setRerolls(rerolls: boolean): void {
    this.prefs = {...this.prefs, rerolls};
    this.prefsService.save(this.prefs);
  }

  async installApp(): Promise<void> {
    const prompt = this.installPrompt;
    if (!prompt) {
      return;
    }
    await prompt.prompt();
    const {outcome} = await prompt.userChoice;
    // The event can only be used once.
    this.installPrompt = null;
    this.install = outcome === 'accepted' ? 'installed' : null;
  }

  resetStats(): void {
    if (!this.confirmingReset) {
      this.confirmingReset = true;
      return;
    }
    this.stats = this.statsService.reset();
    this.sessionRolls = 0;
    this.result = null;
    this.confirmingReset = false;
    this.refreshDerived();
  }

  private refreshDerived(): void {
    this.totals = countTotals(this.stats.counts);
    this.daysRolled = countTotals(this.stats.dailyCounts).rolls;
    this.today = todayRoll(this.stats);
    this.streak = activeStreak(this.stats);
    this.streakAtRisk = streakAtRisk(this.stats);
    this.tour = tourItems(this.stats, this.prefs.quests);
    this.refreshStatsView();
    this.refreshCrack();
  }

  /** Charts the picked die, else the one being rolled now, else whichever has rolls. */
  private refreshStatsView(): void {
    const dice = dieSummaries(this.statsTab === 'daily' ? this.stats.dailyCounts : this.stats.counts);
    const die = dice.find(d => d.sides === this.chartSides) ?? dice.find(d => d.sides === this.prefs.sides) ?? dice[0] ?? null;
    this.statsView = {dice, die, bars: die ? chartBars(die.faces) : []};
    this.hoveredBar = null;
    const [year, month] = this.calendarDay.split('-').map(Number);
    this.calendar = this.statsTab === 'daily' ? calendarMonth(this.stats.days, year, month - 1) : null;
    this.badgeList = BADGES.map(badge => ({
      badge,
      earned: this.stats.achievements[badge.id] ?? null,
      progress: badge.progress?.(this.stats) ?? null,
    }));
    this.badgeCount = this.badgeList.filter(b => b.earned).length;
  }

  /** Shows the crack while a natural 1 is on the table or is the day's roll. */
  private refreshCrack(): void {
    const dayIsOne = !!this.today && tierFor(this.today.value, this.today.sides) === 'crit-fail';
    if (!dayIsOne && this.result?.verdict.tier !== 'crit-fail') {
      this.crack = null;
      return;
    }
    this.crack ??= crackPaths(localDateKey(new Date()), CRACK_REACH);
  }

  /** The crack starts under the result number; offsets ignore transforms, so the landing animation doesn't move it. */
  private measureCrack(): void {
    const table = this.tableRef.nativeElement;
    const width = table.clientWidth;
    const height = table.clientHeight;
    const value = table.querySelector<HTMLElement>('.result-value');
    const parent = value?.offsetParent as HTMLElement | null;
    this.crackBox = {
      width,
      height,
      x: value && parent ? parent.offsetLeft + value.offsetLeft + value.offsetWidth / 2 : width / 2,
      y: value && parent ? parent.offsetTop + value.offsetTop + value.offsetHeight / 2 : height / 2,
      scale: Math.hypot(width, height) / 2 / CRACK_REACH,
    };
  }

  /** Runs after the result renders, so effects can start from the number. */
  private celebrate(celebration: Celebration): void {
    this.sound.landed(celebration);
    if (this.result?.badges.length || this.result?.inspiration?.kept) {
      // After the fanfare or trombone, if there is one.
      this.sound.badgeUnlocked(celebration === 'big-burst' || celebration === 'crack' ? 1.8 : 0.3);
    }
    if (celebration === 'crack' && !this.reducedMotion?.matches) {
      this.crackFresh = true;
      this.tableJolted = this.tableDrained = true;
      clearTimeout(this.joltTimer);
      clearTimeout(this.drainTimer);
      this.joltTimer = setTimeout(() => this.tableJolted = false, 450);
      this.drainTimer = setTimeout(() => this.tableDrained = false, 2600);
    }
    requestAnimationFrame(() => {
      this.measureCrack();
      if (celebration === 'burst' || celebration === 'big-burst') {
        const rect = this.tableRef.nativeElement.querySelector('.result-value')?.getBoundingClientRect();
        this.confetti.trigger(celebration, rect ? {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2} : undefined);
        if (rect && celebration === 'big-burst' && this.condition === 'stormy') {
          this.weather?.strike(rect.left + rect.width / 2, rect.top);
        }
      }
    });
  }

  private applyGravity(): void {
    this.dice.setGravity(this.condition === 'low-gravity' ? 0.35 : 1);
  }

  private applyTable(): void {
    this.sound.sound = this.prefs.sound;
    this.sound.vibration = this.prefs.vibration;
    const now = new Date();
    this.seasonAvailable = this.prefs.seasonal ? previewSeason() ?? activeSeason(now) : null;
    this.season = this.seasonAvailable && this.prefs.seasonOff !== seasonKey(this.seasonAvailable, now) ? this.seasonAvailable : null;
    const theme = tableTheme(this.prefs.table);
    const root = document.documentElement.style;
    root.setProperty('--felt', this.season?.felt ?? theme.felt);
    root.setProperty('--chalk', this.season?.chalk ?? theme.chalk);
    root.setProperty('--accent', accentColor(this.prefs.accent).color);
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast = '', 2500);
  }
}

/** The live-region text for a roll: the result, the message, the streak and any badges. */
function announce(r: RollResult, label: string): string {
  const badges = r.badges.map(b => b.name);
  return [
    `${label}: ${r.value}.`,
    r.dropped === null ? '' : `Dropped ${r.dropped}.`,
    r.rerolledFrom ? `Was ${r.rerolledFrom.value}.` : '',
    r.verdict.message,
    r.isToday && r.streak > 1 ? `${r.streak}-day streak${r.newBest ? ', a new best!' : '.'}` : '',
    badges.length ? `${badges.length === 1 ? 'Badge' : 'Badges'} unlocked: ${badges.join(', ')}.` : '',
    r.inspiration ? (r.inspiration.kept ? `Plus ${r.inspiration.kept} Inspiration.` : 'Inspiration is full, so none was added.') : '',
  ].filter(Boolean).join(' ');
}

/** Bars for each face, centered, and at most `maxBarWidth` wide so a d4 doesn't look like a wall. */
function chartBars(faces: number[]): ChartBar[] {
  const {width, height, gap, maxBarWidth} = CHART;
  const n = faces.length;
  const barWidth = Math.min(maxBarWidth, (width - gap * (n - 1)) / n);
  const offset = (width - n * barWidth - (n - 1) * gap) / 2;
  const max = Math.max(1, ...faces);
  return faces.map((count, i) => {
    const h = count ? Math.max(4, (count / max) * height) : 0;
    const face = i + 1;
    return {
      face,
      count,
      x: offset + i * (barWidth + gap),
      y: height - h,
      width: barWidth,
      height: h,
      labeled: n <= 12 || face === 1 || face % 5 === 0,
    };
  });
}

/** Dev builds only: ?condition=foggy sets today's table condition. */
function previewCondition(): DayCondition | null {
  if (!isDevMode()) {
    return null;
  }
  const id = new URLSearchParams(location.search).get('condition');
  return isDayCondition(id) ? id : null;
}

/** Dev builds only: ?season=festive shows that season on any date. */
function previewSeason(): Season | null {
  if (!isDevMode()) {
    return null;
  }
  const id = new URLSearchParams(location.search).get('season');
  return SEASONS.find(s => s.id === id) ?? null;
}

function detectInstallOption(): InstallOption {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone || window.matchMedia?.('(display-mode: standalone)').matches) {
    return 'installed';
  }
  // iOS has no install prompt; installing is done from Safari's share sheet.
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return ios ? 'ios' : null;
}
