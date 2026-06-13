# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

## [0.4.0] — 2026-06-12

### Added (0.4.0 — counting trainer, Bet Lab, presentation polish)
- Counting-trainer expansion: Pair Cancellation drill (read pairs, not cards — cancelling
  pairs are skipped, never summed) and the Full-Deck Countdown benchmark (one card set aside;
  the final count reveals it — self-verifying; best time persisted, correct runs only)
- The Bet Lab (`/lab`, fifth nav item): ramp editor with persistence, instant closed-form
  EV/SD/N₀/risk-of-ruin against an engine-measured TC distribution, on-demand simulation of
  bankroll lifetimes through the real engine in a cancellable web worker, percentile fan chart
- Opt-in table bet hints: with a saved ramp, coaching enabled, counting active, and advanced
  deviations on (never in exam mode), the advisor adds one bet-size line between rounds
- `recordDrillTime` store action (minimum semantics) and additive lifetime-training fields
  `drillTimes`, `betRamp`, `betHintsEnabled`
- Branded SPA loading screen — dark felt-chip boot spinner replaces the white flash while the
  bundle loads
- Round-outcome presentation: large center-felt WIN/LOSE/PUSH/BLACKJACK banner with the signed
  amount, and an advisor recap of every settled round — headline, why, bankroll change, and
  strategy moments in the trainer's voice; exam mode shows the outcome but keeps grading for History
- Learning scaffold: "Learn the Game" README section (sourced history essay, tidbits, variations
  table) and a History tab on the learn page (era timeline, floor variations, tidbits)
- Brand assets: Metaincognita branded og-image (SVG + PNG), og/twitter social meta, README hero
  image and badges
- `docs/METAINCOGNITA-GUIDELINES-v1.0.md` — the suite-wide standard for how every simulator looks,
  works, teaches, and explains (canonical home, pending the metaincognita.com umbrella)
- `start-dev-server.sh` — kills this repo's stale dev servers (by listening-port ownership),
  clears caches, starts fresh

### Fixed (0.4.0)
- Rebet clamps to the current bankroll; over-bankroll bets show a hint instead of silently
  disabling Deal
- Heads-up tables no longer render empty-seat markers
- History/analysis muted text lifted to AA contrast

### Added (0.3.0 — training surfaces)
- Advisor with three intensities (coach / feedback / exam): live recommendation + EV table,
  per-decision grading with mistake cost, deviation-aware at the count (Illustrious 18 + Fab 4,
  advanced toggle), insurance advice, side-bet caution
- Hi-Lo counting: presented-card running count, half-deck true count, self-check (C key),
  shuffle quizzes, count survives mid-round refresh
- History page (per-decision ✓/✗ vs book, cost, RC/TC, expandable EV tables) and Analysis page
  (adherence by category, top mistakes, EV lost vs actual P&L, count accuracy, side-bet ledger,
  bankroll sparkline, bot P&L)
- Learn page: interactive strategy chart generated from the engine (tap any cell for the EV math),
  rules lab with live house-edge deltas, Hi-Lo primer + deviation tables, official side-bet pay
  tables, myths, casino-procedure guide, glossary
- Drills: Strategy Flash (mistake-weighted), Count the Cards (3 speeds × 3 group sizes),
  True-Count Conversion, Deviation Quiz — bests persisted for life
- Study mode hotspots, training nav, pit-boss milestones, myth quips, payout flash, mobile pass
  (bots collapse to status chips), a11y fixes, Playwright E2E suite, Netlify deploy config
- Lifetime training stats under `blackjack-training-v1` (survive leaving the table)

### Changed (0.3.0)
- `Deviation.play` union gains `'surrender'`; `deviationFor` accepts a deviation pool
- Side-bet pay-table constants exported for the learn page

### Added (0.2.0 — playable game)
- Setup screen: five rulebook-cited presets with model-estimate house edges, full custom rules
  editor with engine validation, bot companion picker, bankroll/mode/speed selection
- Playable table: SVG felt with rules-driven arc text, paced casino-procedure dealing or instant
  quick play, chip betting with side-bet circles, insurance/even-money flow, keyboard play
  (H/S/D/P/R, B rebet, Space deal), bot companions acting and talking at the table
- Session persistence (`blackjack-session-v1`): bankroll, capped 500-round history, settings,
  and mid-round snapshots — a refresh restores the exact table (engine snapshot/restore with
  RNG continuity)
- Engine additions: `statefulMulberry32`, `Shoe.snapshot/restore` + `discardCount`,
  `BlackjackGame.snapshot/restore`, `hole-revealed` and `insurance-settled` events

### Added
- Project scaffold (Nuxt 4 family stack, craps-skeleton conventions)
- Pure TypeScript blackjack engine (`app/utils/engine/`): cards/shoe with burn + cut-card
  penetration, rulebook-cited rule presets (MA 205 CMR / Bally's AC / WA / Vegas Strip / single-deck 6:5),
  computed basic-strategy EV engine pinned to canonical charts, Hi-Lo counting with Illustrious 18,
  four side bets with official pay tables (21+3, Lucky Ladies, Match the Dealer, Buster),
  event-emitting round engine, five bot personas
- Statistical simulation test: 200k seeded rounds verify empirical house edge against theory
