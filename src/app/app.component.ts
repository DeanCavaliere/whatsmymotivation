import {AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild} from '@angular/core';
import {ConfettiService} from './components/confetti/confetti.service';
import {DiceService} from './dice.service';
import {keptValue, RollMode, Tier, tierFor, Verdict, verdictFor} from './motivation';
import {Stats, StatsService, STATS_KEY, StatsSummary, summarize, TodayRoll, todayRoll} from './stats.service';

interface RollResult {
  value: number;
  /** The other die when rolling with advantage/disadvantage. */
  dropped: number | null;
  mode: RollMode;
  verdict: Verdict;
  isToday: boolean;
}

interface ChartBar {
  face: number;
  count: number;
  x: number;
  y: number;
  height: number;
}

const SITE_URL = 'https://whatsmymotivation.today';
const CHART = {width: 400, height: 120, gap: 2, barWidth: 18};

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    standalone: false
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('diceBox', {static: true}) diceBoxRef!: ElementRef<HTMLElement>;
  @ViewChild('statsDialog', {static: true}) statsDialogRef!: ElementRef<HTMLDialogElement>;

  readonly modes: { value: RollMode, label: string, hint: string }[] = [
    {value: 'disadvantage', label: 'Disadv.', hint: 'Roll two dice, keep the lower'},
    {value: 'normal', label: 'Normal', hint: 'Roll one die'},
    {value: 'advantage', label: 'Adv.', hint: 'Roll two dice, keep the higher'},
  ];
  readonly chart = CHART;

  ready = false;
  rolling = false;
  mode: RollMode = 'normal';
  result: RollResult | null = null;
  stats: Stats;
  summary: StatsSummary;
  today: TodayRoll | null = null;
  sessionRolls = 0;
  bars: ChartBar[] = [];
  hoveredBar: ChartBar | null = null;
  confirmingReset = false;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(private dice: DiceService,
              private statsService: StatsService,
              private confetti: ConfettiService,
              private zone: NgZone) {
    this.stats = this.statsService.load();
    this.summary = summarize(this.stats);
    this.refreshDerived();
    const today = todayRoll(this.stats);
    if (today) {
      this.result = {
        value: today.value,
        dropped: null,
        mode: today.mode,
        verdict: verdictFor(today.value),
        isToday: true,
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
  }

  async roll(): Promise<void> {
    if (!this.ready || this.rolling) {
      return;
    }
    this.rolling = true;
    this.result = null;
    const mode = this.mode;
    try {
      const values = await this.dice.roll(mode);
      const value = keptValue(values, mode);
      const hadToday = !!todayRoll(this.stats);
      this.stats = this.statsService.record(value, mode);
      this.sessionRolls++;
      this.refreshDerived();

      const verdict = verdictFor(value);
      this.result = {
        value,
        dropped: values.length > 1 ? values.find((v, i) => i !== values.indexOf(value)) ?? null : null,
        mode,
        verdict,
        isToday: !hadToday,
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

  tierOf(value: number): Tier {
    return tierFor(value);
  }

  get rollLabel(): string {
    if (!this.ready) return 'Setting up…';
    if (this.rolling) return 'Rolling…';
    return this.today ? 'Roll again' : 'Roll for motivation';
  }

  resultLabel(result: RollResult): string {
    const prefix = result.isToday ? 'Today\'s roll' : 'Re-roll';
    if (result.mode === 'advantage') return `${prefix} · advantage`;
    if (result.mode === 'disadvantage') return `${prefix} · disadvantage`;
    return prefix;
  }

  async share(): Promise<void> {
    if (!this.result) {
      return;
    }
    const {value, mode, verdict} = this.result;
    const how = mode === 'normal' ? '' : ` with ${mode}`;
    const text = `I rolled a ${value}${how} for motivation today 🎲 "${verdict.message}"`;
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
    this.hoveredBar = null;
    this.statsDialogRef.nativeElement.showModal();
  }

  closeStats(): void {
    this.statsDialogRef.nativeElement.close();
  }

  /** Clicks on the backdrop land on the dialog element itself. */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.statsDialogRef.nativeElement) {
      this.closeStats();
    }
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
    this.summary = summarize(this.stats);
    this.today = todayRoll(this.stats);

    const max = Math.max(1, ...this.stats.faceCounts);
    const {height, barWidth, gap} = CHART;
    this.bars = this.stats.faceCounts.map((count, i) => {
      const h = count ? Math.max(4, (count / max) * height) : 0;
      return {face: i + 1, count, x: i * (barWidth + gap), y: height - h, height: h};
    });
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast = '', 2500);
  }
}
