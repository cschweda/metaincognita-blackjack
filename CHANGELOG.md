# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

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
