import {AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, Optional, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {DatePipe, DecimalPipe, PercentPipe} from '@angular/common';
import {SwUpdate} from '@angular/service-worker';
import {ConfettiComponent} from './components/confetti/confetti.component';
import {ConfettiService} from './components/confetti/confetti.service';
import {DiceService} from './dice.service';
import {DieSides, dieOdds, keptValue, RollMode, Tier, tierFor, Verdict, verdictFor} from './motivation';
import {DICE_COLORS, diceColor, DIE_OPTIONS, Prefs, PREFS_KEY, PrefsService, TABLE_THEMES, tableTheme} from './prefs.service';
import {
  activeStreak,
  CountTotals,
  countTotals,
  dateFromKey,
  DayRoll,
  DieSummary,
  dieSummaries,
  Stats,
  STATS_KEY,
  StatsService,
  streakAtRisk,
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
  /** Streak length after this roll, when it was today's roll. */
  streak: number;
  newBest: boolean;
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

export type StatsTab = 'daily' | 'all';

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

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ConfettiComponent, DecimalPipe, DatePipe, PercentPipe]
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('diceBox', {static: true}) diceBoxRef!: ElementRef<HTMLElement>;
  @ViewChild('statsDialog', {static: true}) statsDialogRef!: ElementRef<HTMLDialogElement>;
  @ViewChild('customizeDialog', {static: true}) customizeDialogRef!: ElementRef<HTMLDialogElement>;

  readonly modes: { value: RollMode, label: string, hint: string }[] = [
    {value: 'disadvantage', label: 'Disadv.', hint: 'Roll two dice, keep the lower'},
    {value: 'normal', label: 'Normal', hint: 'Roll one die'},
    {value: 'advantage', label: 'Adv.', hint: 'Roll two dice, keep the higher'},
  ];
  readonly chart = CHART;
  readonly tableThemes = TABLE_THEMES;
  readonly diceColors = DICE_COLORS;
  readonly dieOptions = DIE_OPTIONS.map(d => ({...d, odds: dieOdds(d.sides)}));
  readonly dateFromKey = dateFromKey;

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
  sessionRolls = 0;
  statsTab: StatsTab = 'daily';
  /** The die picked in the stats dialog, when rolls span more than one. */
  chartSides: DieSides | null = null;
  statsView: StatsView = {dice: [], die: null, bars: []};
  hoveredBar: ChartBar | null = null;
  confirmingReset = false;
  prefs: Prefs;
  install: InstallOption = null;
  toast = '';
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(private dice: DiceService,
              private statsService: StatsService,
              private confetti: ConfettiService,
              private prefsService: PrefsService,
              private zone: NgZone,
              @Optional() swUpdate: SwUpdate | null) {
    // A cached version whose files are gone from the server can't recover on its own.
    swUpdate?.unrecoverable.subscribe(() => document.location.reload());
    this.prefs = this.prefsService.load();
    this.applyTable();
    this.install = detectInstallOption();
    this.stats = this.statsService.load();
    this.refreshDerived();
    const today = todayRoll(this.stats);
    if (today) {
      this.result = {
        value: today.value,
        sides: today.sides,
        dropped: null,
        mode: today.mode,
        verdict: verdictFor(today.value, today.sides),
        isToday: true,
        streak: this.streak,
        newBest: false,
      };
    }
  }

  ngAfterViewInit(): void {
    this.dice.init(this.diceBoxRef.nativeElement).then(() => this.zone.run(() => this.ready = true));
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }
    // Let focused buttons handle their own activation, otherwise one press would roll twice.
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, select, textarea, dialog')) {
      return;
    }
    event.preventDefault();
    if (!event.repeat) {
      this.roll();
    }
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
    this.stats = this.statsService.load();
    this.refreshDerived();
    if (this.result?.isToday && !this.today && !this.rolling) {
      this.result = null;
    }
  }

  async roll(): Promise<void> {
    if (!this.ready || this.rolling) {
      return;
    }
    this.rolling = true;
    this.result = null;
    const mode = this.mode;
    const sides = this.prefs.sides;
    try {
      const values = await this.dice.roll(mode, sides, diceColor(this.prefs.dice).color);
      const value = keptValue(values, mode);
      const hadToday = !!todayRoll(this.stats);
      const previousBest = this.stats.streak.best;
      this.stats = this.statsService.record(value, sides, mode);
      this.sessionRolls++;
      this.refreshDerived();

      const verdict = verdictFor(value, sides);
      this.result = {
        value,
        sides,
        dropped: values.length > 1 ? values.find((v, i) => i !== values.indexOf(value)) ?? null : null,
        mode,
        verdict,
        isToday: !hadToday,
        streak: this.streak,
        newBest: !hadToday && this.streak > 1 && this.streak > previousBest,
      };
      if (verdict.celebration) {
        this.confetti.trigger(verdict.celebration);
      }
    } finally {
      this.rolling = false;
    }
  }

  onTableClick(event: MouseEvent): void {
    if (!(event.target instanceof Element && event.target.closest('button'))) {
      this.roll();
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

  resultLabel(result: RollResult): string {
    return [
      result.isToday ? 'Today\'s roll' : 'Re-roll',
      result.sides === 20 ? '' : `d${result.sides}`,
      result.mode === 'normal' ? '' : result.mode,
    ].filter(Boolean).join(' · ');
  }

  async share(): Promise<void> {
    if (!this.result) {
      return;
    }
    const {value, sides, mode, verdict} = this.result;
    const die = sides === 20 ? '' : ` on a d${sides}`;
    const how = mode === 'normal' ? '' : ` with ${mode}`;
    const text = `I rolled a ${value}${die}${how} for motivation today 🎲 "${verdict.message}"`;
    try {
      if (navigator.share) {
        await navigator.share({text, url: SITE_URL});
        return;
      }
      await navigator.clipboard.writeText(`${text} ${SITE_URL}`);
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
    this.refreshStatsView();
    this.statsDialogRef.nativeElement.showModal();
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
    this.setStatsTab(this.statsTab === 'daily' ? 'all' : 'daily');
    document.getElementById(`tab-${this.statsTab}`)?.focus();
  }

  setChartSides(sides: DieSides): void {
    this.chartSides = sides;
    this.refreshStatsView();
  }

  openCustomize(): void {
    this.customizeDialogRef.nativeElement.showModal();
  }

  /** Clicks on the backdrop land on the dialog element itself. */
  onDialogClick(event: MouseEvent): void {
    if (event.target instanceof HTMLDialogElement && event.target === event.currentTarget) {
      event.target.close();
    }
  }

  setTable(id: string): void {
    this.prefs = {...this.prefs, table: id};
    this.prefsService.save(this.prefs);
    this.applyTable();
  }

  setDice(id: string): void {
    this.prefs = {...this.prefs, dice: id};
    this.prefsService.save(this.prefs);
  }

  setSides(sides: DieSides): void {
    this.prefs = {...this.prefs, sides};
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
    this.refreshStatsView();
  }

  /** Charts the picked die, else the one being rolled now, else whichever has rolls. */
  private refreshStatsView(): void {
    const dice = dieSummaries(this.statsTab === 'daily' ? this.stats.dailyCounts : this.stats.counts);
    const die = dice.find(d => d.sides === this.chartSides) ?? dice.find(d => d.sides === this.prefs.sides) ?? dice[0] ?? null;
    this.statsView = {dice, die, bars: die ? chartBars(die.faces) : []};
    this.hoveredBar = null;
  }

  private applyTable(): void {
    const theme = tableTheme(this.prefs.table);
    const root = document.documentElement.style;
    root.setProperty('--felt', theme.felt);
    root.setProperty('--chalk', theme.chalk);
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast = '', 2500);
  }
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

function detectInstallOption(): InstallOption {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone || window.matchMedia?.('(display-mode: standalone)').matches) {
    return 'installed';
  }
  // iOS has no install prompt; installing is done from Safari's share sheet.
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return ios ? 'ios' : null;
}
