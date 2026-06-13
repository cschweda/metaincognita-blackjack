# Round-Outcome Presentation — Design

**Date:** 2026-06-13
**Status:** Approved (user, via design Q&A)
**Context:** v0.3.0 shipped the trainer; players' eyes go to the advisor, but round results are
only visible as small per-hand badges. The advisor must announce the result, explain it, show
the money, and recap the strategy of the round.

## User decisions

1. **Banner lifetime:** the big center-felt result stays visible until the next deal (never blocks clicks).
2. **Recap scope:** both mistakes and correct plays — mistakes first with cost, confirmations after.
3. **Exam mode:** shows outcome + why + bankroll change only; strategy commentary stays hidden
   (grading remains exam-silent until History).

## Architecture — one pure summarizer, two surfaces

### 1. `summarizeRound(record: RoundRecord): RoundSummary | null` (`app/utils/advisor.ts`)

Pure, unit-tested. Input is the already-recorded round; output:

```ts
interface RoundSummary {
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'mixed'
  netCents: number          // hero hands + side bets + insurance
  headline: string          // "Won $50" · "Lost $25" · "Push — bet returned" · "Blackjack! +$37.50" · "Split hands: +$25"
  why: string               // "Dealer busted with 23 — your 18 stands." · "Dealer's 20 beats your 18."
  moments: string[]         // mistakes first: "Book: draw on hard 12 vs 10 — you stood (cost $5.40)"
                            // confirmations: "Optimal: stand on hard 16 vs 6 ✓"
                            // insurance note when present; capped at 4 lines
}
```

- Outcome classification: hands' outcomes; `mixed` for split rounds with differing results; the
  headline verb follows the NET sign (a split can lose one hand and still be "Won").
- Action phrasing uses the trainer's voice: *stand on / draw on / double / split / surrender*.
- Old persisted rounds lacking the new per-hand totals degrade gracefully (why omits hand totals).

### 2. `RoundOutcome.vue` — center-felt banner

WIN / LOSE / PUSH / BLACKJACK in display type + signed amount beneath (gold for win/blackjack,
red for loss, neutral push). `pointer-events-none`, absolute center of the felt, pop-in keyframe
(globally disarmed by the reduced-motion rule), rendered while `phase === 'complete' && queueIdle`
— i.e. appears after settlement is fully presented, disappears when the next round begins.

### 3. AdvisorPanel post-round section

Between rounds the panel's "Waiting for your turn…" slot becomes the recap: headline, why,
**"Bankroll +$50 → $550"** (new `bankrollCents` prop), then `moments`. Intensity gates: coach and
feedback render everything; exam renders headline/why/bankroll but not `moments`.

### 4. aria-live

`finalizeRound` pushes the headline through the existing announcements feed (dealer-area live region).

## Data changes (additive only)

- `RoundRecord` hero hand entries gain `total?: number`, `soft?: boolean`, written at settlement
  from engine state. Storage version unchanged; old payloads remain valid.

## Testing

- Unit: `summarizeRound` — dealer-bust win, dealer-higher loss, push, hero bust, surrender,
  dealer blackjack, hero blackjack, split mixed, insurance note, moments ordering + cap, old-record
  (no totals) degradation.
- Component: AdvisorPanel recap rendering per intensity; RoundOutcome null/win/lose rendering.
- Integration: quick-mode round through the table page → banner visible with outcome word; advisor
  shows headline.
- Full gates (vitest + lint + typecheck) before commit.
