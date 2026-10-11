# Daily-fun roadmap

Date: 2026-10-10. Status: roadmap approved in conversation. Each chunk gets its own short design (with a mock for anything visual) and approval before it is built.

## Goal

Make "What's my motivation?" a more fun daily ritual. Today it is one roll a day, a streak and stats. This roadmap adds:

- reasons to come back (quests, conditions, achievements);
- small RNG mechanics to play with (Inspiration, conditions);
- bigger moments when you roll a 1 or the die's top face (a "natural 20" on the d20).

All of it stays a single-device, offline, no-server PWA.

## Ground rules (every chunk)

- **No migrations.** There are no existing players. Storage shapes change in place, with no versioned keys, back-compat or back-filling. The old v1 and `lifetimeRolls` migration code in `stats.service.ts` is deleted the next time that file is touched.
- **Colors.** UI chrome uses the accent tokens (`--accent`, `--accent-fill`, `--focus`) on the near-black base. Contrast is checked numerically, including on the textured felt; text directly on the felt sits on a filled badge.
- **Accessibility.** axe reports 0 violations on desktop and phone. Every animation has a `prefers-reduced-motion` variant. Every new state is announced through the existing live region. Nothing is conveyed by color alone.
- **Process.** Mock visuals, then get approval. Build with Vitest specs, then run the build, axe, the contrast checks and screenshots. Commit locally on `cleanup-and-features` and never push.
- **Randomness** goes through an injectable `random` function, so tests are deterministic.

## Chunks

| # | Chunk | Size | Needs |
|---|---|---|---|
| 1 | Deliberate rolling, share card, natural 20 / natural 1 moments | M | – |
| 2 | Seasonal themes | M | – |
| 3 | Month calendar | M | – |
| 4 | Sound and haptics | M | – |
| 5 | Achievements | M | – |
| 6 | Inspiration (merged with the nudge) | M | 5 |
| 7 | Daily table conditions | L | 3, 5, 6 |
| 8 | Daily quest and one-line journal | M–L | 3, 5 |

Chunk 2 comes early because Halloween (October) is three weeks away.

### 1. Deliberate rolling, share card, natural 20 / natural 1 moments

**Deliberate rolling.** Accidental re-rolls were too easy, so:

- Remove roll-on-table-click (`onTableClick`) and the global Space/Enter shortcut (`onKeydown`).
- The header Roll button is the only way to roll. A focused button still responds to Space and Enter natively.
- The chalk hint on the felt now reads: Hit “Roll for Motivation” Above.

**Share card.** The text share gains a 7-day strip, one emoji per day by tier, plus the streak (from 2 days). Emoji: 🌟 natural top face, 🟦 15–19, 🟩 12–14, 🟨 9–11, 🟧 6–8, 🟥 2–5, 💀 natural 1, ⬛ no roll. Example: `What's my motivation? Oct 10 · 🎲 17 (adv)` / `🟨🟩⬛🟩💀🌟🟦 🔥2` / `whatsmymotivation.today`. (Built; the user may revisit the 7-day strip later.)

- It uses `navigator.share` on phones and the clipboard plus a toast on desktop.
- The emoji-per-tier mapping is a pure, tested function.

**Natural 20 (a crit success, on any die).** A confetti burst in the accent color and gold from the result number (dice-box renders in a worker, so the die's position isn't readable), plus a gold flare that settles into a halo. Rolls of 15–19 get a smaller burst. Nothing falls from the top of the screen any more; that falling mode is kept in the confetti layer for chunk 7's rain and snow.

**Natural 1.** The number thuds onto the felt, the table jolts, the felt briefly drains of color, and cracks spread from under the number. No tears or confetti. Rolls of 2–5 get no effect.

- The crack stays on the table for the rest of the day while that 1 is the day's roll.
- Practice rolls ("Roll again") don't clear it. Only replacing the day's roll does: a nudge now, a reroll after chunk 6.
- With reduced motion on, the crack appears as a still image, with no shake or spread.

### 2. Seasonal themes

- **Setting:** "Seasonal themes", on by default.
- **What changes during a season:** the felt, dice color and chalk color are overridden, and themed verdict messages are mixed in.
- **What doesn't change:** the user's accent color always stays. Their own table and dice choices return when the season ends.
- **Settings during a season:** the season appears as the chosen swatch in the Table and Dice pickers, with a note saying it runs until its end date. Picking any other table or dice turns the season off until it ends (stored as `seasonOff: "spooky-2026"`); picking the season swatch brings it back. The "Seasonal themes" switch turns all seasons off.
- **Look (built):** Spooky #251433 felt, pumpkin chalk and dice; Festive #4e0f17, snow chalk, pine dice; Valentine's #4f1530, pink chalk, rose dice; Lucky #07452a, gold chalk and dice. Each has four chalk doodles, one per corner, each turned and nudged a little. Themed messages show on half of rolls.

| Season | Dates (local, inclusive) |
|---|---|
| Spooky | Oct 1 – Oct 31 |
| Festive | Dec 1 – Dec 31 |
| Valentine's | Feb 10 – Feb 14 |
| Lucky | Mar 15 – Mar 17 |

- **Structure:** seasons are data: `{id, label, start, end, felt, chalk, dice, messages}`. A pure `activeSeason(date)` function picks one, and a spec covers each boundary date. More seasons can be added later as data only.

### 3. Month calendar

- **History length:** `DAYS_LIMIT` goes from 30 to 400.
- **Where:** Stats → Daily tab gets a month grid, with previous- and next-month arrows. The current month opens by default.
- **Each day cell:**
  - shaded with the result's tier color (the same colors as the number on the table) as a 14% tint, with the number in the tier color; every tier passes 4.5:1;
  - ★ for a natural 20, a crack mark for a natural 1;
  - small marks for a finished quest and for a note, once chunk 8 lands.
- **Month line:** under the month name, e.g. "9 days rolled · average 12.0 · 1 crit" (the average is left out when the month mixes dice).
- **Replaces** the "Recent days" list.
- **Interaction:** day cells are buttons. Arrow keys move around the grid, and each day's `aria-label` reads its date, roll and tier. Tapping a day shows its details below the grid: the roll, mode, die, whether it was rerolled, the condition, the quest and the note.

### 4. Sound and haptics

- **Defaults:** sound on and vibration on, each with a switch in Settings.
- **Mute button:** a header button mutes sound in one tap, because sound is on by default.
- **Sounds:**
  - a dice clatter when the dice are thrown;
  - a bright sting on a natural 20 and a sad "wah-wah" on a natural 1;
  - a quiet tick when a badge unlocks.
- **Sound source (built):** the dice are recordings from Kenney's CC0 Casino Audio pack (converted to 22 kHz WAV, ~180 KB), run through a low-pass "felt" filter, with a second quieter recording chained on for a ~1 s tumble; two-dice recordings for advantage/disadvantage. The synthesized dice clicks were rejected as tinny. The natural 20 chime, natural 1 trombone and badge tick are Web Audio synthesis.
- **iPhone silent switch:** set `navigator.audioSession.type = 'ambient'` where supported, so the ringer switch mutes the sound.
- **Vibration:** `navigator.vibrate` when the dice land, with a distinct pattern for crits.
  - iOS Safari has no vibration API, so the vibration switch is hidden where it isn't supported.
  - Vibration is suppressed under reduced motion.

### 5. Achievements

- **Structure:** a registry of `{id, name, description, icon, check(stats, lastRoll) → boolean}`. Checks run after each roll.
- **Storage:** unlocks are stored as `achievements: Record<id, dateKey>`. There's no back-fill, so achievements start counting from the first roll after this ships.
- **Unlocking:** shows a "Badge unlocked: Snake eyes" badge on the felt, plus a live-region announcement.
- **Where:** a third Stats tab, "Badges": a grid where locked badges are grayed out but still show how to earn them.
- **Initial set:**
  - First roll
  - Natural 20 (top face, any die)
  - Natural 1
  - Snake eyes (both dice show 1)
  - Double crit (both dice show the top face)
  - Collector (rolled every die type)
  - Streaks of 7, 30 and 100 days
  - Comeback (a day's roll of 1, then the top face the next day)
  - Regular (100 rolls) and Devoted (1,000 rolls), added at review; both count practice rolls
- **Built names:** First roll 🎲, Natural 🌟, Rock bottom 💀, Snake eyes 🐍, Double crit ✨, Collector 🧰, On a roll 🔥 (7), Habit 📅 (30), Centurion 💯 (100), Comeback 🔄, Regular 🎯, Devoted 🏆. Several unlocking at once share one pill ("3 badges unlocked"); the tick waits for a crit's fanfare.
- Later chunks add their own badges.

### 6. Inspiration (merged with the nudge)

The two become one mechanic: **Reroll** replaces today's roll, and it has two sources of charges:

1. **The free weekly nudge**, unchanged (one per ISO week).
2. **Inspiration tokens (✦)**:
   - Earned: one for a natural 20 on the day's roll, one for every 7th day of streak (7, 14, 21…).
   - Cap: 3. At the cap the counter reads "full", so the player knows to spend one.

**Spending is deliberate:**

- The Reroll button on the felt opens a confirmation dialog that names the cost:
  - "Use your free weekly nudge to reroll today's 3?" when the free nudge is available (it is used first);
  - otherwise "Spend 1 ✦ Inspiration to reroll today's 3? You'll have 1 left."
- The two buttons are **Reroll** and **Keep my 3**. Focus starts on **Keep my 3**, and Escape cancels.

**Clarity:**

- The header shows "✦ 2" as a HUD stat.
- Tapping it opens "How Inspiration works": how tokens are earned, what they do, the cap, and progress ("4 of 7 days to your next ✦").
- The first token ever earned triggers a one-time explanation on the felt.

**Settings and stats:**

- The existing nudge switch becomes "Rerolls (weekly nudge and Inspiration)".
- Rerolled days are marked in the stats and the calendar: ↻ for the free weekly nudge, ✦ for a reroll paid with Inspiration. Day records store which one was used.
- New badges: Hoarder (hold 3 ✦), Big spender (spend 5 ✦), Lucky nudge (a reroll turns a 1 into the top face).

### 7. Daily table conditions

Each player gets their own random condition each day. The condition is rolled the first time the app is opened on a local date and stored with that date (`conditions: Record<dateKey, conditionId | 'clear'>`), so reloading never changes it.

**Probability:** `rollCondition(history, date, random)` is a pure function.

- **Monthly target:** about 8 condition days per month. The base daily chance is 8 ÷ days in the month.
- **Rubber band:** the chance rises when this month is behind target (compared with the days opened so far) and falls when it is ahead. It is clamped to roughly 0.25×–2× the base.
- **Cooldown:**
  - If yesterday had a condition, today's chance of any condition is multiplied by about 0.6.
  - Yesterday's condition's own weight is multiplied by about 0.1.
  - So "Blessed, then clear" is most likely, "Blessed, then Stormy" is possible, and "Blessed, then Blessed" is very rare.
  - "Yesterday" means the previous calendar day; a gap resets the cooldown.
- **Rarity weights:**

| Condition | Weight | Effect |
|---|---|---|
| Foggy | 3 | Mist overlays the felt. The result stays hidden until you wipe or tap the fog away. |
| Rainy (Snowy in Dec–Feb) | 3 | Rain streaks over the table; in winter, snow drifts and settles. |
| Stormy | 2 | Occasional lightning flash. A natural 20 calls down a strike. |
| Low gravity | 2 | The dice float and bounce longer (dice-box physics). |
| Inspired | 2 | A day's roll of 15 or more on the d20 scale earns ✦. |
| Blessed | 1 | The day's roll is made with advantage; the mode toggle is locked for that roll. |
| Hexed | 1 | The day's roll is made with disadvantage; the mode toggle is locked for that roll. |

**Display:**

- A condition chip in the header; tapping it explains the effect.
- The effect is announced to screen readers.
- Reduced motion swaps the animated overlays for static ones.

**Tests:**

- Simulate 10,000 days with a seeded `random`, and assert that the monthly mean is about 8 and that the same condition repeats on back-to-back days rarely.
- Unit tests for the cooldown, the rubber band and the winter swap.

**New badges:** Fogwalker (5 foggy days), Storm chaser (a natural 20 in a storm), Blessed and cursed (a Blessed and a Hexed day in the same week).

### 8. Daily quest and one-line journal

**Quest:**

- After the day's roll, a chalk-style line with a checkbox appears under the verdict: "Quest: Pick one small task and finish it ☐".
- Quests come from small, medium and large pools that match the roll's tier.
- The quest is picked once per day and stored, so reloading doesn't change it.

**Journal:**

- Ticking the quest crosses it out in chalk and slides in one optional input: "What did you get done?" (up to 80 characters, saved with Enter, skippable).
- Notes are read back, and can be edited, in the calendar's day details.

**Phone fit:**

- The quest adds one row of about 44px. The felt's Share and Reroll buttons collapse into an icon row on phones to make room.
- Placement is mocked against the alternative, a "Today" sheet that slides up from the bottom, before building.

**Storage:** each day record gains `quest?: {id, done}` and `note?: string`.

**Setting:** "Daily quest", on by default.

**New badges:** Questmaster (10 quests done) and Chronicler (10 notes).

## Out of scope for now

- Push reminders (they need a push server, and iOS only allows them for apps installed to the home screen).
- Accounts and syncing between devices.
- Seasons beyond the four above.
- An image share card.
