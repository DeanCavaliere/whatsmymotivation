# What's My Motivation Today?

Roll a d20 to find out how motivated you'll be today. Natural 20? Carpe diem. Natural 1? Back to bed.

Live at [whatsmymotivation.today](https://whatsmymotivation.today).

## Features

- 3D physics dice via [@3d-dice/dice-box](https://fantasticdice.games/), with a plain random roll as a fallback when WebGL isn't available
- Normal, advantage (2d20 keep highest) and disadvantage (2d20 keep lowest) rolls
- The first roll of each day is "today's roll"; later rolls are re-rolls
- Daily streaks (current and best), with a nudge when today's roll would keep one going
- Installable and works offline: a service worker (`ngsw-config.json`) caches the app, artwork and dice physics. It is only enabled in production builds
- Pick your die (d4 to d20) in Customize, with each one's odds of a crit, a good day and a bad day. Smaller dice are swingier; every die crits on its top face and fails on a 1
- Stats stored in `localStorage`, in two tabs: daily rolls (each day's first roll: streaks, days rolled, distribution, recent days) and all rolls (lifetime/session counts, crits, distribution, recent rolls). Distributions are per die
- Share a roll (Web Share API, or copy to clipboard)
- Table themes and dice colors (Customize, the palette button). The felt is one neutral texture tinted with CSS `background-blend-mode`, so a new table color is a one-line addition to `prefs.service.ts`
- Roll with the button, Space/Enter, or by tapping the table

## Development

Requires Node 22 or 24 (see `.nvmrc`).

```bash
npm install
npm start          # dev server on http://localhost:4405
npm test           # unit tests (Vitest + jsdom)
npm run build      # production build into dist/whatsmymotivation
```

Pushing to `master` deploys to GitHub Pages via `.github/workflows/workflow.yml`.

## Project layout

| Path | What it is |
| --- | --- |
| `src/app/motivation.ts` | Pure game logic: tiers, messages, advantage/disadvantage |
| `src/app/stats.service.ts` | Persistent stats (versioned key, migrates older versions, multi-tab safe) |
| `src/app/prefs.service.ts` | Die choice, table themes, dice colors and the saved choice |
| `src/app/dice.service.ts` | dice-box wrapper: init, physics tuning, fallback |
| `src/app/components/confetti` | Canvas confetti / tears overlay |
| `src/assets/img` | Table artwork (WebP). The frame is drawn as a CSS 9-slice `border-image` |
| `src/assets/icons`, `src/manifest.webmanifest` | App icons and web app manifest for installing to a home screen |
| `node_modules/@3d-dice/dice-box/dist/assets` | dice-box physics (Ammo WASM) and dice themes, copied to `assets/dice-box` at build time |
