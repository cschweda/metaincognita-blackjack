# Counting Trainer Expansion — Design

**Date:** 2026-06-13
**Status:** Approved (user, via design Q&A)
**Principle:** learning-maximal, casual-play-friendly — every addition is opt-in or lives on
its own page; a player who just sits down and plays sees nothing new unless they ask for it.

## User decisions

1. The Bet-Ramp & Risk-of-Ruin Lab gets **its own `/lab` page** (fifth nav item, "Bet Lab").
2. **Opt-in table hints**: when enabled in the lab AND counting is active AND advanced
   deviations are on, the advisor adds one bet-size line between rounds. Off by default;
   hidden in exam mode.
3. RoR computation is **instant closed-form + on-demand real simulation** (web worker driving
   the actual engine).

## Feature 1 — Pair Cancellation drill (`/drills` tab)

Teaches the counting technique real players use: read pairs, not cards.

- Two cards flash; the player answers the pair's net Hi-Lo tag on five buttons (−2 −1 0 +1 +2).
- Verdict explains the technique: cancelling pairs (one +1, one −1) are *skipped*, not summed.
- Streak; lifetime best via `recordDrillBest('pair-cancel', streak)`. Injectable `rng` prop.
- No timer — this drill builds the habit, not the speed.

## Feature 2 — Full-Deck Countdown (`/drills` tab)

The classic professional benchmark, self-verifying:

- One shuffled deck; ONE card set aside face down. The player flips through the remaining 51
  at their own pace (click or Space), with a running timer.
- At the end they enter the running count. Since a full deck sums to 0, the correct answer is
  **−(hidden card's tag)** — the drill cannot be gamed. The hidden card is revealed with the
  verdict.
- Best TIME among correct runs only, via a new store action `recordDrillTime(id, ms)`
  (minimum-semantics; existing `recordDrillBest` keeps maximums). Display tiers:
  ≤30s "the pro bar", ≤60s "casino ready".
- Pairs mode: flip two cards at a time (cancellation pays off). Keyboard: Space advances.

## Feature 3 — Bet Lab (`/lab`)

Three panels on one page; all numbers computed, never transcribed.

### Ramp editor
- Inputs: rules preset, unit size (cents), bankroll (cents), rounds/hour, wong-out toggle
  (sit out at TC ≤ −1), and bet-units per TC bucket: ≤0, +1, +2, +3, +4, ≥+5.
- A sensible default ramp pre-loads (1-2-4-6-8-12 units).
- "Save ramp" persists to the lifetime training key (`blackjack-training-v1`) as
  `training.betRamp` (additive field) together with the table-hints toggle.

### Instant math (closed form, updates live)
- Per-TC edge model: `edge(tc) ≈ −houseEdge(rules) + 0.005 × (tc − 1)` — the same advantage
  estimate the count panel shows, against the preset's computed house edge. Labeled a model.
- TC bucket frequencies are **measured, not assumed**: a fast engine pass (≈2,000 shoes,
  auto-played at basic strategy, in the worker) tallies the TC at each round start for the
  chosen rules/penetration; cached per rules signature for the session.
- Outputs: EV/round and per-hour EV ($), per-round and hourly standard deviation ($), N0
  (hands for expectation to outrun one standard deviation), and risk of ruin via the standard
  unit-normalized formula `RoR = ((1 − e/s) / (1 + e/s))^(B/s)` with e = EV/round,
  s = SD/round, B = bankroll (all in dollars). Clamped and labeled an estimate.

### Real simulation (on demand)
- "Simulate" runs N bankroll trajectories (default 500) of H hours each (default ~12 hours ≈
  1,000 rounds) through the REAL engine: seeded shoes, auto basic strategy (`bestAction` /
  `bestActionFull`), live `CountTracker`, bets from the ramp, wong-out honored by sitting out
  rounds at low counts.
- Runs in a web worker (`app/workers/ruin-sim.ts` thin wrapper); the core is a pure function
  `simulateTrajectories(params, rng, onProgress)` in `app/utils/betRamp.ts` — unit-testable
  without the worker.
- Output: empirical ruin rate beside the closed-form estimate, and a bankroll fan chart
  (p5/p25/p50/p75/p95 percentile bands over time) rendered as inline SVG. Progress bar during
  the run; cancellable.

## Feature 4 — Opt-in table bet hints

- Lab toggle "Coach my bets at the table" (persisted with the ramp).
- In `table.vue`, between rounds, when toggle ON ∧ `settings.count ≠ 'off'` ∧
  `settings.advancedDeviations` ∧ advisor intensity ≠ 'exam':
  the AdvisorPanel shows one extra line via a new optional prop `betHint`:
  `Ramp: bet 4 units ($100) — TC +2.1` (wong-out: `Ramp: sit out — TC −1.4`).
- No other gameplay change. Defaults never show it.

## Architecture units

| Unit | Responsibility |
|---|---|
| `app/utils/betRamp.ts` | Types (`BetRamp`, `RampStats`, `TrajectoryResult`), `DEFAULT_RAMP`, `tcFrequencies(rules, shoes, rng)`, `rampStats(ramp, freqs, houseEdgeValue)`, `betForTc(ramp, tc)`, `simulateTrajectories(params, rng, onProgress?)` — all pure, engine-driven, Vue-free |
| `app/workers/ruin-sim.ts` | postMessage wrapper around `tcFrequencies` + `simulateTrajectories` with progress events |
| `app/pages/lab.vue` | ramp editor, stats cards, fan chart SVG, simulate/cancel, save + hints toggle |
| `app/components/drills/PairCancel.vue` | Feature 1 |
| `app/components/drills/DeckCountdown.vue` | Feature 2 |
| `app/pages/drills.vue` | two new tabs (6 total) |
| `app/components/panels/AdvisorPanel.vue` | optional `betHint?: string` line |
| `app/pages/table.vue` | bet-hint computed (gates above) |
| Store | `recordDrillTime(id, ms)` (min-semantics), `training.betRamp` + `training.betHintsEnabled` (additive, lifetime) |
| Layout | nav gains `/lab` ("Bet Lab", `i-lucide-flask-conical`) |

## Testing

- Unit: ramp math pinned against hand-computed values (betForTc bucket edges, EV/SD math,
  RoR formula incl. e ≥ s and e ≤ 0 clamps); `tcFrequencies` sums to 1 and is deterministic
  under a seed; `simulateTrajectories` deterministic under a seed, ruin counted correctly,
  agreement smoke (empirical RoR within a loose band of closed form on a small run).
- Component: both drills (grading, countdown self-verification with the hidden card, best-time
  recording), lab page smoke (editor renders, stats react), AdvisorPanel betHint rendering.
- Integration: table shows the hint only when all gates pass.
- Full gates + E2E suite stays green.

## Suite-level note

The Lab is being added to `docs/METAINCOGNITA-GUIDELINES-v1.0.md` as an abstract standard: every
simulator should offer an experimentation surface with parameterized strategy, instant math,
and headless batch simulation through the real engine (e.g., "play 5,000 games at optimal
strategy and show me the distribution").
