import {ChangeDetectionStrategy, Component, computed, HostListener, inject, OnDestroy, signal} from '@angular/core';
import {accentColor, PREFS_KEY, PrefsService, tableTheme} from '../../app/prefs.service';
import {CONDITION_OPTIONS, GROUPS, launchPath, LaunchParams, SAVE_OPTIONS, SEASON_OPTIONS} from './presets';

/** The builder's last choices, so a refresh keeps them. */
export const BUILDER_KEY = 'wmm.dev.launcher';

/**
 * Dev builds only, at /?launcher (see ../launcher.ts): ready-made dev URLs for saves, rolls, conditions
 * and seasons, each opened in a new tab, plus a builder for any other mix. Wears the player's accent.
 */
@Component({
  selector: 'app-root',
  templateUrl: './launcher.component.html',
  styleUrl: './launcher.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LauncherComponent implements OnDestroy {
  private readonly prefs = inject(PrefsService);

  readonly groups = GROUPS;
  readonly saveOptions = SAVE_OPTIONS;
  readonly conditionOptions = CONDITION_OPTIONS;
  readonly seasonOptions = SEASON_OPTIONS;

  readonly builder = signal<LaunchParams>(loadBuilder());
  readonly builderUrl = computed(() => this.url(this.builder()));
  readonly toast = signal('');
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    document.title = 'Dev launcher · Motivation';
    this.applyTheme();
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  /** Follows accent and table changes made in an app tab. */
  @HostListener('window:storage', ['$event'])
  onStorage(event: StorageEvent): void {
    if (event.key === PREFS_KEY || event.key === null) {
      this.applyTheme();
    }
  }

  url(params: LaunchParams): string {
    return location.origin + launchPath(params);
  }

  path(params: LaunchParams): string {
    return launchPath(params);
  }

  set(field: keyof LaunchParams, value: string): void {
    const next = {...this.builder(), [field]: field === 'rolls' ? value.replace(/\s+/g, '') : value};
    this.builder.set(next);
    try {
      localStorage.setItem(BUILDER_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the builder just starts over next time.
    }
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied');
    } catch {
      this.showToast('Copy blocked; select the URL instead');
    }
  }

  private applyTheme(): void {
    const prefs = this.prefs.load();
    const root = document.documentElement.style;
    root.setProperty('--accent', accentColor(prefs.accent).color);
    root.setProperty('--felt', tableTheme(prefs.table).felt);
    root.setProperty('--chalk', tableTheme(prefs.table).chalk);
  }

  private showToast(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 1400);
  }
}

function loadBuilder(): LaunchParams {
  try {
    const saved = JSON.parse(localStorage.getItem(BUILDER_KEY) ?? 'null') as LaunchParams | null;
    if (saved && typeof saved === 'object') {
      return saved;
    }
  } catch {
    // Fall through to the default.
  }
  return {save: 'month', rolls: '20'};
}
