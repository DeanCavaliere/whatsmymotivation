import {TestBed} from '@angular/core/testing';
import {CONDITIONS, isDayCondition} from '../../app/conditions';
import {PREFS_KEY} from '../../app/prefs.service';
import {SEASONS} from '../../app/seasons';
import {devLauncher} from '../launcher';
import {SAVES} from '../saves';
import {BUILDER_KEY, LauncherComponent} from './launcher.component';
import {CONDITION_OPTIONS, GROUPS, launchPath, SAVE_OPTIONS, SEASON_OPTIONS, seasonDates} from './presets';

describe('dev launcher', () => {
  it('builds paths with empty params left out and commas kept', () => {
    expect(launchPath({})).toBe('/');
    expect(launchPath({save: 'month', rolls: '1,20', condition: '', season: undefined})).toBe('/?save=month&rolls=1,20');
    expect(launchPath({condition: 'low-gravity', season: 'spooky'})).toBe('/?condition=low-gravity&season=spooky');
  });

  it('offers every save, condition and season', () => {
    expect(SAVE_OPTIONS.map(o => o.value)).toEqual(['', ...Object.keys(SAVES), 'mine']);
    expect(CONDITION_OPTIONS.map(o => o.value)).toEqual(['', 'clear', ...Object.keys(CONDITIONS)]);
    expect(SEASON_OPTIONS.map(o => o.value)).toEqual(['', ...SEASONS.map(s => s.id)]);
  });

  it('only links to params the app understands', () => {
    const saves = new Set([...Object.keys(SAVES), 'mine']);
    const seasons = new Set(SEASONS.map(s => s.id));
    for (const row of GROUPS.flatMap(g => g.rows)) {
      const {save, rolls, condition, season} = row.params;
      expect(save === undefined || saves.has(save), row.name).toBe(true);
      expect(rolls === undefined || /^\d+(,\d+)*$/.test(rolls), row.name).toBe(true);
      expect(condition === undefined || isDayCondition(condition), row.name).toBe(true);
      expect(season === undefined || seasons.has(season), row.name).toBe(true);
    }
  });

  it('writes season dates', () => {
    expect(seasonDates(SEASONS.find(s => s.id === 'spooky')!)).toBe('Oct 1–31');
    expect(seasonDates({...SEASONS[0], start: [12, 20], end: [1, 2]})).toBe('Dec 20–Jan 2');
  });

  it('only loads on /?launcher', () => {
    expect(devLauncher('?save=month')).toBeNull();
    expect(devLauncher('?launcher')).toBeInstanceOf(Promise);
  });

  describe('page', () => {
    beforeEach(() => {
      localStorage.clear();
      document.documentElement.removeAttribute('style');
    });

    function render() {
      const fixture = TestBed.createComponent(LauncherComponent);
      fixture.detectChanges();
      return {fixture, page: fixture.nativeElement as HTMLElement};
    }

    it('wears the player\'s accent', () => {
      localStorage.setItem(PREFS_KEY, JSON.stringify({accent: 'jade'}));
      render();
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#3ecf8e');
    });

    it('lists a row per preset, each linking to its URL', () => {
      const {page} = render();
      const links = [...page.querySelectorAll<HTMLAnchorElement>('td.link a')];
      expect(links.length).toBe(GROUPS.reduce((n, g) => n + g.rows.length, 0));
      expect(links[0].getAttribute('href')).toBe(`${location.origin}/?save=fresh`);
      expect(links[0].target).toBe('_blank');
    });

    it('builds a URL from the form and remembers it', () => {
      const {fixture, page} = render();
      const rolls = page.querySelector<HTMLInputElement>('input')!;
      rolls.value = '1, 20';
      rolls.dispatchEvent(new Event('input'));
      const condition = page.querySelectorAll<HTMLSelectElement>('select')[1];
      condition.value = 'hexed';
      condition.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(page.querySelector('output')!.textContent).toBe(`${location.origin}/?save=month&rolls=1,20&condition=hexed`);
      expect(JSON.parse(localStorage.getItem(BUILDER_KEY)!)).toEqual({save: 'month', rolls: '1,20', condition: 'hexed'});
    });
  });
});
