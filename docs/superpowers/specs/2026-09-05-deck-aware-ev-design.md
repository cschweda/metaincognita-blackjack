# Deck-Aware EV: Removal-Aware Draw Probabilities

**Date:** 2026-09-05 · **Status:** approved · **Source:** engine review of v0.5.0 (HEAD `901c74d`)

One change: the EV model learns the deck count. Everything else that review round four touched —
the true-count divisor, the Bet Lab statistics, the shoe's cursor and burn handling, Match the
Dealer validation — is **deliberately not here**. See *Scope* below for why.

---

## Problem

`PROB` was a fixed infinite-deck vector and `distFor`'s cache key was `` `${up}|${h17}|${peek}` ``,
so **`rules.decks` never entered the play model at all**. Verified: `generateChart(1 deck)` and
`generateChart(8 decks)` serialized byte-for-byte identically.

`houseEdge()` was deck-aware only in its three-card deal layer, which captures the dealer-natural
effect and none of the removal effects during play — where nearly all of single deck's player
advantage lives. The model was therefore inverted:

| decks (Vegas Strip otherwise) | before | published |
| --- | --- | --- |
| 1 | **0.8644%** | ≈0.00% |
| 8 | **0.5546%** | ≈0.43% |

Both consequences landed on teaching surfaces. The Learn page's Rule Explorer showed a red,
edge-*increasing* delta as the learner dragged toward single deck — the inverse of the single most
famous fact about deck count. And the strategy chart, labelled "generated for the active rules",
was an infinite-deck chart at every deck count: on the `SINGLE_DECK_65` preset, whose entire
purpose is teaching single-deck play, it coached `7,7 vs 10 → Hit` and `hard 8 vs 6 → Hit`.

## Design

**Composition is a value, not a parameter.** Draw probabilities come from `probsFor(decks, removed)`
— a shoe of N decks with the known cards taken out — and the composition that governs a decision is
built once and passed down:

```ts
export interface EvalContext { rules: RuleSet, up: Bucket, known: readonly Bucket[], key: string }
export function evalContext(rules, up, playerKnown?): EvalContext
export function contextForHand(rules, up, pair: Bucket | null): EvalContext  // THE rule
export function bookPlay(rules, up, hand: BookHand): Recommendation          // THE entry point

distFor(ctx) · dealerDistribution(ctx, conditionNoBlackjack)
actionEVs(state, ctx) · bestAction(state, ctx)
splitEV(pair, ctx, handsFormed?) · bestActionFull(state, ctx, flags?)
```

`contextForHand` is the single definition of which composition governs a hand: the upcard always,
plus the pair when a pair row governs. **`pair` is decided by what the player HOLDS, never by
whether Split happens to be legal** — keying it off legality grades the same two cards against two
different shoes depending on the bankroll or the split cap.

`bookPlay` is the one entry point. `generateChart`, `advisor.ts`, `bots.ts`, `StrategyFlash`,
`DeviationQuiz`, the chart's cell detail and the Bet Lab's affordability fallback all call it, so a
hand cannot be priced one way on the Learn page and another at the table.

An earlier attempt threaded composition as an optional trailing `removed` argument through seven
functions with per-call-site defaults. Six call sites then re-derived the same pair/non-pair branch
by hand and drifted. Carrying it as a value is what makes the drift unrepresentable rather than
merely fixed.

**Honest display.** The model resolves an edge to ~0.05pp from two decks up and ~0.2pp at one deck,
where removal-once-at-the-top overshoots by enough to flip the *sign* of a 1-deck 3:2 game.
`edgeResolution(rules)` states that, `formatHouseEdge`/`formatAdvantage` print `~even` inside it,
and `modelledEdge()` zeroes it so money math cannot inherit the artifact.

## Result

| decks | before | after | published |
| --- | --- | --- | --- |
| 1 | 0.8644% | **−0.1524%** (shown `~even`) | ≈0.00% |
| 2 | — | **0.1832%** | ≈0.19% |
| 4 | — | **0.3481%** | ≈0.35% |
| 6 | 0.5692% | **0.4025%** | ≈0.40% |
| 8 | 0.5546% | **0.4297%** | ≈0.43% |

Monotonic in the right direction, and 2/4/6/8 land on the published tables. Presets: MA 0.36%,
Bally's 0.36%, WA 0.34%, Vegas Strip 0.40%, single-deck 6:5 1.58%.

Chart changes: **6 and 8 decks move one cell** (`soft 15 v 4` H→D, which every published multi-deck
chart doubles); **2 decks move one** (`hard 15 v 10` Rh→H, a near-tie at 0.00247 recorded as a
divergence); **one deck moves seven**, six onto the published book and one off it
(`soft 18 v 2` Ds→S).

## Modeling honesty

A first-order model — removal is applied once at the top of the hand, not at every draw.

1. **One deck runs ~0.15pp player-favourable.** Pinned with published cross-checks, and the display
   refuses to resolve a sign the model cannot.
2. **`7,7 vs 10` at one deck stays Hit; the book stands.** A composition-dependent exception only
   full finite-deck recursion reaches. Named in the chart footnote.
3. **`soft 18 v 2` at one deck moves Ds→S — a cell this change LOSES.** Recorded as a regression,
   not dressed up as a pre-existing limitation.
4. **The dealer's hole card is sampled with replacement for its own draws.** Correct in isolation to
   fix, and it was implemented and measured rather than argued about: removing it fixes one deck
   (−0.150% → −0.060%) and reaches `7,7 v 10 = Stand`, but loses three published cells and moves
   every multi-deck edge ~0.02pp further from published. One gained, three lost. This model already
   ignores the player's continuing removal, a bias pointing the other way; one second-order
   correction without the others makes the whole worse. The numbers live at the call site.

## Scope

This branch replaces a 50-file, +3300-line branch that bundled this change with the divisor
unification, the Bet Lab statistics, the shoe rewrite and Match the Dealer validation. Four review
cycles found ~60 defects in it, and a majority of the later ones were introduced by fixes to the
earlier ones — the branch had grown past the size where a change could be verified against its own
blast radius.

The deck-aware model is the piece that was independently measured and is worth landing on its own.
The rest is preserved on `review-round-four-full` and should be re-landed one change at a time,
each small enough to review properly. Known-good work waiting there, roughly in order of value:

- the no-peek surrender escrow (a real bug: the chart recommends surrendering hard 5 under ENHC)
- the true-count divisor unification, paced to the presentation queue
- Bet Lab uncertainty bands (Wilson) and run-parameter snapshotting
- the shoe's burn reclaim, cursor and deck estimate
- Match the Dealer deck-count normalization and the voided-stake settlement

Separately and independently of any of this: `bots.ts`'s `bookAction` fallback ranks only stand vs
hit, so a bot holding split aces can choose an action the table refuses — `game.act` has no
try/catch and the round wedges. Reproduced in 54 configurations here and 12 on `main`; it is a
live defect on `main` today and should be fixed there directly.
