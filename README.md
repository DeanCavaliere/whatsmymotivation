# What's My Motivation Today?

Roll a d20 to find out how motivated you'll be today. Natural 20? Carpe diem. Natural 1? Back to bed.

Live at [whatsmymotivation.today](https://whatsmymotivation.today).

## Features

- 3D physics dice via [@3d-dice/dice-box](https://fantasticdice.games/), with a plain random roll as a fallback when WebGL isn't available
- Normal, advantage (2d20 keep highest) and disadvantage (2d20 keep lowest) rolls
- The first roll of each day is "today's roll"; later rolls are re-rolls
- Daily streaks (current and best), with a nudge when today's roll would keep one going
- Installable and works offline: a service worker (`ngsw-config.json`) caches the app, artwork and dice physics. It is only enabled in production builds
- Pick your die (d4 to d20) in Settings (the cog button), with each one's odds of a crit, a good day and a bad day. Smaller dice are swingier; every die crits on its top face and fails on a 1
- Stats stored in `localStorage`, in two tabs: daily rolls (each day's first roll: streaks, days rolled, a month calendar going back about a year, distribution) and all rolls (lifetime/session counts, crits, distribution, recent rolls). Distributions are per die
- Share the day's roll with a seven-day emoji strip and the streak (Web Share API, or copy to clipboard)
- Nudge the table: once a week, re-roll today's roll. It comes back every Sunday, and the daily stats track how often nudges helped or backfired. Can be switched off in Settings
- Accent colors (Copper, Arcane, Ember, Jade, Rose), table themes and dice colors (Settings). The felt is one neutral texture tinted with CSS `background-blend-mode`, so a new table color is a one-line addition to `prefs.service.ts`
- Seasonal tables (on by default): Spooky in October, Festive in December, Valentine's Feb 10–14 and Lucky Mar 15–17 each bring their own felt, chalk, dice color, corner doodles and messages. Picking your own table or dice turns the current season off until it ends. Seasons are data in `seasons.ts`
- Rolls only happen from the Roll button, so a stray key press or tap can't replace the day's roll
- A natural top face bursts confetti from the number; a natural 1 jolts the table, drains its color and leaves a crack that stays all day while that 1 is the day's roll
- Accessible: text meets WCAG AA contrast on every table theme, chosen options are marked by more than color, results are announced to screen readers, the chart has a table equivalent, and it supports keyboard focus, forced colors and reduced motion

## Development

Requires Node 22 or 24 (see `.nvmrc`).

```bash
npm install
npm start          # dev server on http://localhost:4405
npm test           # unit tests (Vitest + jsdom)
# Dev server only: /?rolls=20,1 queues the next results, /?season=festive previews a season
npm run build      # production build into dist/whatsmymotivation
```

Pushing to `master` deploys to GitHub Pages via `.github/workflows/workflow.yml`.

## Project layout

| Path | What it is |
| --- | --- |
| `src/app/motivation.ts` | Pure game logic: tiers, messages, advantage/disadvantage |
| `src/app/stats.service.ts` | Persistent stats (versioned key, migrates older versions, multi-tab safe) |
| `src/panels.css` | Styles for the stats and settings dialogs |
| `src/app/prefs.service.ts` | Die choice, table themes, dice colors and the saved choice |
| `src/app/dice.service.ts` | dice-box wrapper: init, physics tuning, fallback |
| `src/app/components/confetti` | Canvas confetti bursts (and a falling mode, kept for weather) |
| `src/assets/img` | Table artwork (WebP). The frame is drawn as a CSS 9-slice `border-image` |
| `src/assets/icons`, `src/manifest.webmanifest` | App icons and web app manifest for installing to a home screen |
| `node_modules/@3d-dice/dice-box/dist/assets` | dice-box physics (Ammo WASM) and dice themes, copied to `assets/dice-box` at build time |
