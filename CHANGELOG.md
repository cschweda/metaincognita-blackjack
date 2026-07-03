# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Fixed (training correctness)
- Deviation Quiz derives the book play from the EV engine under the active rules instead of a
  hand-rolled reverse mapping — the five negative-count Illustrious-18 reversals no longer
  render two identical "hit" buttons, and deviations that are simply book under the active
  rules (e.g. 11vA-double at H17) leave the question pool
- Advisor deviation scope: total-based deviations no longer fire on splittable pairs
  (8,8 vs T is a split, never a 16vT stand); with late surrender legal, the stand deviations
  compete with surrender's fixed −0.50 EV via composite indices (16vT stands only at TC ≥ +4,
  16v9 at +5, 15vT never) — correct surrenders are no longer graded as mistakes
- Deviation boundary convention matches the published tables: negative-index reversals fire
  strictly below the index; Fab-4 15vT reversal uses its published index 0
- Mid-round rack reshuffles (MA §15(g)) now emit a shuffle event, so the running count resets
  instead of double-counting recycled discards

### Fixed (engine rules)
- No-peek games implement the documented full-loss model correctly end to end: blackjacks are
  held until the reveal (standoff vs a dealer natural, 3:2 after a miss), a multi-card 21
  loses to a revealed natural, insurance settles at the reveal instead of via a hidden peek,
  and a deferred Lucky Ladies Q♥ pair can still hit the 1000:1 dealer-BJ tier
- Five-card 21 vs a dealer 21 is a void wager (push) per MA §16(b), not a 2:1 win
- Buster-only forced dealer completion draws to hard 17 / soft 18 (MA §27(f)(3)(ii)) even at
  S17 tables
- Resplitting aces is optional — a re-paired split ace offers stand alongside split
- MA preset caps splits at three hands (§11(e) at a seven-box table); Bally's Lucky Ladies
  uses pay Table A per the gaming guide ("up to 125 to 1" + 1000:1 bonus)

### Fixed (money & state integrity)
- Double, split, and insurance are withheld when the bankroll cannot cover the extra stake —
  the bankroll can no longer go negative
- Insurance decisions are guarded against double-clicks and presentation races: nothing is
  recorded until the engine accepts the play, the buttons freeze while the table presents,
  and the offered amount comes from the live hand (correct after a mid-round refresh)
- Deal has a double-click cooldown; indexed hero actions drop stale double-clicks aimed at a
  hand that already advanced (plus a heroTurn reactivity fix so split-hand advances always
  recompute the live hand)
- Round numbering continues after a refresh; a corrupt mid-round snapshot falls back to a
  fresh shoe instead of bricking /table; the in-flight round's card/decision trail survives a
  refresh; lastDecision no longer leaks across sessions; the Resume banner shows even when
  another page restored the session first; old-version storage payloads are backed up before
  removal; cross-tab writes to the session key raise a warning at the table
- Bet Lab worker protocol keys every reply (a slow answer can never poison another preset's
  cache or display a stale simulation), recovers from worker errors via the main-thread
  fallback, and cancels an in-flight run on preset switch
- Ramp simulations size bets off a fresh shoe when the cut card is out, never let the sim
  player double/split money it doesn't have, and record a dead bankroll's true residue

### Accessibility
- Face-down cards no longer carry their identity in the DOM (the hole card was readable by
  find-in-page/screen readers before the reveal); cards expose natural accessible names
- Single-key table shortcuts can be turned off (WCAG 2.1.4) via a persisted "Keys" toggle
- Toggle/selection state exposed via aria-pressed across presets, bots, bet targets, and
  table toggles; ChipStack is a named image; the active split hand announces itself
- Muted informative text raised to the family contrast floor; the felt rule line passes AA
- New axe (WCAG 2.1 A/AA) Playwright scans over every user route

### Added (delivery infrastructure)
- GitHub Actions CI: lint, typecheck, unit/nuxt suites, production build, and the full
  Playwright suite with report artifacts
- Netlify deploys are gated on the test suites; Node `engines` field; coverage scoped to the
  TS logic layers with a ≥90% floor on the engine
- New e2e specs: double, late surrender, casino-paced round, Bet Lab worker simulation
  (the only place the real worker protocol runs), and the axe scans — 15 e2e tests total

### Changed
- One shared money formatter (`formatCents`/`signedCents`) replaces seven local variants;
  drill scoring runs through a shared `useDrillStreak` composable and score header;
  learn/study numbers (H17/6:5/DAS deltas, dealer bust rate, 16vT costs) are computed from
  the engine instead of transcribed; footer version reads from package.json; bottom
  navigation uses real links
- Bet Lab decomposed: the percentile fan chart (`FanChart`) and the closed-form stats panel
  (`RampStatsPanel`) are standalone components; the learn page's prose moved to a content
  module (`utils/learnContent`) parameterized by engine facts — the page is structure, the
  copy is data

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
