# Counting Trainer Expansion — Implementation Plan

> Executes `docs/superpowers/specs/2026-06-13-counting-trainer-expansion-design.md`.
> Inline execution, TDD on every pure seam, full gates before each commit, branch
> `feature/counting-trainer`, merge to main when green.

**Spec correction noted during planning:** the per-TC edge model is
`edge(tc) = −houseEdge(rules) + 0.005 × tc` (baseline −he at TC 0; ≈ breakeven near TC +1).
The spec's `(tc − 1)` form double-counts the baseline; the count panel's quick
`(TC−1)×0.5%` heuristic stays as-is and the lab comments explain the difference.

## Task 1 — Store: drill times + ramp persistence
`recordDrillTime(id, ms)` keeps the MINIMUM (existing `recordDrillBest` keeps max) in a new
`training.drillTimes: Record<string, number>`; `training.betRamp: BetRamp | null` and
`training.betHintsEnabled: boolean` persist with the lifetime training payload (backfilled on
load). Tests: min-semantics, persistence round-trip, backfill defaults.
Commit: `feat(ui): store drill times and bet-ramp persistence`

## Task 2 — `app/utils/betRamp.ts` (pure, TDD)
Types: `BetRamp { unitCents, bankrollCents, roundsPerHour, wongOut, steps: number[] /* 6: ≤0,+1..≥+5 */ }`,
`TcFrequencies { freq: number[], meanTc: number[] }`, `RampStats`, `SimParams`, `SimResult`.
Functions:
- `DEFAULT_RAMP` (1-2-4-6-8-12 units, $25 unit, $10k bankroll, 70 rounds/hr, wongOut false)
- `bucketForTc(tc)` = clamp(floor(tc), 0, 5)
- `betForTc(ramp, tc, rules)` → cents, clamped to table limits
- `tcFrequencies(rules, rounds, seed)` — auto-play one continuous game (perfect book via
  `decideFor('bea', …)`, insurance declined), parallel `CountTracker` fed by
  `count-visible-card` events and reset on `shuffle`; decks-remaining via the half-deck
  cards-seen estimate; tally bucket + mean TC at each round start. Returns freq summing to 1.
- `rampStats(ramp, freqs, houseEdgeValue)` — edge per bucket from meanTc; EV/round, SD/round
  (per-round variance ≈ 1.33 bet² — documented constant), hourly EV/SD, N0, closed-form
  `RoR = ((1−e/s)/(1+e/s))^(B/s)` with e≤0→1, e≥s→0 clamps. Wong-out: bucket 0 contributes
  no EV/variance (time still passes).
- `simulateTrajectories(params, onProgress?)` — N independent games (seed+i), real engine +
  CountTracker + ramp bets (wonged-out rounds play a ghost minimum bet that moves cards but
  not the bankroll — back-counting model, documented); insurance taken at TC ≥ +3; ruin when
  bankroll < minBet; bankroll sampled every `sampleEvery` rounds; returns per-sample
  percentile bands (p5/p25/p50/p75/p95), empirical ruin rate, mean final bankroll.
Tests pin: bucket edges, bet clamping, freq normalization + determinism, rampStats against
hand-computed values incl. clamps, simulateTrajectories determinism + ruin counting + a loose
agreement smoke vs closed form.
Commit: `feat: bet-ramp math and engine-driven ruin simulation (pure module)`

## Task 3 — Drills: PairCancel + DeckCountdown
Per the spec; `recordDrillBest('pair-cancel')`, `recordDrillTime('deck-countdown')`; drills
page gains both tabs (6 total). Component tests: pair grading + technique text; countdown
hidden-card self-verification with elapsed timer (fake timers) + best-time recording; Space
advances.
Commit: `feat(ui): pair-cancellation and full-deck countdown drills`

## Task 4 — Bet Lab page + worker + nav
`app/workers/ruin-sim.ts` (module worker: `init` → tcFrequencies, `simulate` → progress +
result, `cancel`). `app/pages/lab.vue`: ramp editor (preset select, unit/bankroll/rounds-hour
inputs, six step steppers, wong-out switch), instant stats cards (recomputed on every edit
from cached freqs; freqs fetched once per rules signature — main-thread fallback when Worker
is unavailable, which also serves tests), Simulate button with progress + cancel, fan chart
(inline SVG bands), save-ramp + "coach my bets at the table" toggle (store). Nav gains
"Bet Lab" (`i-lucide-flask-conical`) between Drills and the version block.
Tests: lab smoke (editor renders, stats react to unit change), nav link present.
Commit: `feat(ui): the Bet Lab — ramp editor, instant math, engine simulation, fan chart`

## Task 5 — Opt-in table hints
`AdvisorPanel` optional `betHint?: string` (one mono line under the recap/waiting block);
`table.vue` computed gated on `training.betHintsEnabled ∧ count ≠ off ∧ advancedDeviations ∧
intensity ≠ exam ∧ betweenRounds`, text from `betForTc` (`Ramp: bet 4 units ($100) — TC +2.1`,
wong-out `Ramp: sit out — TC −1.4`). Integration test: hint appears only when all gates pass.
Commit: `feat(ui): opt-in ramp bet hints at the table`

## Task 6 — Wrap
CHANGELOG entries; README features bullet + drills count update (4 → 6, Bet Lab mention);
full gates + E2E; live browser verification (drills, lab simulate, table hint); merge.
Commit: `docs: changelog and README for the counting-trainer expansion` then merge.
