# Review Fixes: Count Fidelity, Persistence, Training Backup, Live Feedback

**Date:** 2026-07-10 · **Status:** approved · **Source:** full-app review (four-dimension audit of v0.4.0 + unreleased sweep)

Five fixes, in two waves. Wave one (fixes 1–3) protects the product's soul — a count you could
actually keep at a real table, and learning data that survives. Wave two (fixes 4–5) closes the
two screen-reader gaps automated axe scans cannot see.

---

## Fix 1 — Authentic hole-card procedure (muck unseen holes), with training toggle

### Problem

`completeRound()` (`app/utils/engine/round.ts:531-532`) unconditionally reveals the dealer's
hole card at cleanup and emits `count-visible-card`. When the dealer never plays out the hand —
every player busted or surrendered — real US shoe procedure mucks the hole face-down; a counter
never sees it. Heads-up this is roughly 1 in 6 rounds. The trainer therefore teaches a running
count the player could not maintain in a casino, and `betRamp.tcFrequencies` inherits the same
bias into the Bet Lab's TC distribution.

### Design

**Engine** (`app/utils/engine/round.ts`):

- New public field on `BlackjackGame`: `exposeHoleAtCleanup = false`.
- `completeRound()` calls `revealHole()` only when `exposeHoleAtCleanup` is true. The three
  legitimate reveal paths are untouched and remain unconditional:
  1. dealer natural at the peek (`resolvePeekAndContinue`),
  2. dealer plays out the hand or a Buster wager forces completion (`playDealerAndSettle`),
  3. no-peek natural check when held blackjacks or insurance are pending (`playDealerAndSettle`).
- **New reveal condition:** the no-draw natural-check branch in `playDealerAndSettle` also fires
  when a **deferred Lucky Ladies wager is pending** (no-peek game, ten/ace up, LL stake riding,
  no LL result recorded yet). The dealer must physically check the hole to settle the 1000:1
  dealer-blackjack tier (MA §24(f)); without this, the LL payout would leak hole information
  with no visible card. Implemented as a private `luckyLadiesPending` getter.
- The hole card is still physically discarded with the round (tray fill stays accurate);
  `holeRevealed` stays false in the snapshot; no `hole-revealed`, `count-visible-card`, or
  "Dealer's card — N" announce events are emitted for a mucked hole.

**Setting** (`app/stores/useBlackjackStore.ts`):

- Additive lifetime-training field `exposeMuckedHole: boolean` (default **false**) in
  `TrainingStats`, following the `keyboardShortcuts` precedent. Additive booleans backfill in
  `loadTraining` — **no `TRAINING_VERSION` bump**.
- New action `setExposeMuckedHole(enabled: boolean)` (persists via `persistTraining`).

**Loop** (`app/composables/useGameLoop.ts`):

- `attach()` (or its call sites `startSession`/`restoreSession`) applies
  `store.training.exposeMuckedHole` to the game instance.
- New public API `setExposeMuckedHole(v: boolean)`: sets the store field and the live game's
  field, so mid-session toggling takes effect on the next cleanup.

**UI** (`app/pages/table.vue`):

- Third toolbar toggle ("Hole", `data-testid="hole-toggle"`) beside Keys/Study, `aria-pressed`,
  title: "Expose the mucked hole card at cleanup — real tables keep it face-down". Off by
  default. When off, the dealer's hole simply stays face-down through cleanup.

**Deliberate consequences:**

- `RoundRecord.dealer.cards` still records the true hole (engine truth) — the History page
  becomes a "what you couldn't see" study surface. `visibleCards` and the live count never
  include a mucked hole (they are event-derived, so this is automatic).
- Bet Lab `tcFrequencies` and ramp simulations construct their own `BlackjackGame` instances;
  the default false gives them authentic procedure with zero changes.
- Rejected alternative: a `RuleSet` field — this is not a casino rule; it would pollute the
  rulebook-cited presets, the rules editor, and the snapshot format.

---

## Fix 2 — Between-rounds shoe + count persistence

### Problem

The shoe snapshot exists only between the first hero decision and settlement; `finalizeRound`
nulls it (`useGameLoop.ts:419`). A refresh **between rounds** (or during the opening deal)
takes the fresh-shoe restore branch (`useGameLoop.ts:545`): new random seed, `resetCounting()`.
For a counting trainer, refreshing while decks deep at a high count silently erases the count.
The README's "mid-round refresh restores the exact table, count included" is only true
mid-decision.

### Design

- `finalizeRound()` ends with `store.setRoundTrail(null)` followed by
  `store.saveSnapshot(game.snapshot())` (phase `complete`), wrapped in the same try/catch that
  `snapshotToStore` uses for non-serializable test shoes (fallback: `saveSnapshot(null)`).
- The restore path needs no structural change: `BlackjackGame.restore` accepts any-phase
  snapshots, `fastForwardPresentation` renders them, `beginRound` is already legal from phase
  `complete`, and `restoreCounting()` picks up the persisted count.
- `fastForwardPresentation` announcement becomes phase-aware: restored phase `complete` says
  "Table restored — place your bet"; mid-round phases keep "Table restored — your move".

**Resulting refresh semantics (documented contract):**

| Refresh moment | Result |
|---|---|
| Mid-decision (snapshot at decision point) | Exact table, count included — unchanged |
| Between rounds / after settlement | **Same shoe, same count, betting UI — the fix** |
| During the opening deal, before first decision | Clean rewind to round start: money only moves at settlement and RNG state is snapshotted, so the identical cards come out on re-deal |

- Rejected alternative: snapshotting inside `beginRound` to cover the deal-animation window.
  The persisted count is presentation-synced; an engine-time snapshot would restore a table
  whose fast-forwarded cards were never counted. The rewind is honest and coherent.

---

## Fix 3 — Training-data backup + migration seam

### Problem

`loadTraining` (`useBlackjackStore.ts:177`) returns fresh data on any version mismatch; the
next `persistTraining()` overwrites the old blob. Unlike the session store (which stashes
`.bak` on mismatch, `:378-379`), lifetime learning — adherence, mistake bag, drill bests,
bet ramp — would be destroyed by the first `TRAINING_VERSION` bump. The corrupt-JSON catch
path has the same hole.

### Design

- On **version mismatch**: consult a new `migrateTraining(data: unknown): TrainingStats | null`
  seam. Today it knows no older versions and returns null; a future version bump adds its
  mapping here (the seam exists so destruction is never the silent default).
- When migration returns null, and on the **corrupt-JSON catch path**: best-effort
  `localStorage.setItem('blackjack-training-v1.bak', raw)` before returning `freshTraining()`.
  Backup failures are swallowed (same best-effort contract as the session `.bak`).
- Valid v1 payloads: unchanged behavior.

---

## Fix 4 — Drill feedback: announce + focus (all six drills)

### Problem

Every drill (`StrategyFlash`, `PairCancel`, `TrueCountDrill`, `DeviationQuiz`, `CountDrill`,
`DeckCountdown`) swaps its answer buttons for a verdict via `v-if`/`v-else`. The activated
button unmounts (focus falls to `<body>`) and the ✓/✗ verdict is a plain `<p>` — never
announced. WCAG 2.1 AA 4.1.3 gap in the core loop of the Drills page.

### Design

- New composable `app/composables/useDrillFeedback.ts`:
  `{ srText: Ref<string>, focusEl: Ref<…>, announce(text: string): void, clear(): void }`.
  `announce` sets `srText` and `nextTick`-focuses `focusEl` (unwrapping a component's `$el`
  when the ref is a Nuxt UI button). `clear()` empties `srText`.
- Each drill renders one **persistent** visually-hidden live region above the play/verdict
  area: `<p class="sr-only" role="status">{{ srText }}</p>`. Persistent because a region that
  mounts already containing content (the `v-else` pattern) is unreliably announced across
  screen readers; text changes inside an existing region are reliable.
- Answer/timeout paths call `announce()` with the same text the visible verdict shows;
  Next/Again handlers call `clear()`; the Next/Again button binds `focusEl`.
- Scope note: this deliberately does **not** absorb the drills' verdict state machines into a
  shared composable — that is the review's separate duplication cleanup, out of scope here.

---

## Fix 5 — Round outcome gets its own live region

### Problem

`finalizeRound` pushes the WIN/LOSE headline and then, with flair on (default), the milestone
lines through `pushAnnouncement` in the same tick — all writing the single `liveText` ref. On
milestone rounds the headline is overwritten before assistive tech reads it. The comment at
`useGameLoop.ts:385` asserts the opposite. The visual `RoundOutcome` banner has no live
semantics to compensate.

### Design

- New loop ref `outcomeLive` (exported from `useGameLoop()`), set to `summary.headline` in
  `finalizeRound`, cleared at the next `beginRound` (so identical consecutive headlines still
  re-announce).
- `pushAnnouncement(text, opts?: { live?: boolean })`: `live: false` adds to the visible
  announcements strip without touching `liveText`. `finalizeRound` uses it for the headline
  (headline now speaks through the outcome region); flair/milestone lines keep the default
  path through the dealer region.
- `table.vue` renders a second persistent `sr-only` `role="status"` region
  (`data-testid="outcome-live"`) beside `RoundOutcome`, bound to `outcomeLive`.
- The stale comment at `useGameLoop.ts:385` is corrected.

---

## Test plan (TDD, engine-first, per guidelines §3/§4)

- **Engine (unit):** muck/reveal matrix — all-bust round mucks (no `hole-revealed`, no
  `count-visible-card` for the hole, `holeRevealed` false, both dealer cards discarded);
  `exposeHoleAtCleanup = true` restores reveal+count; deferred-LL no-peek all-bust round
  reveals; held-blackjack and insurance-pending reveals unchanged; Buster completion unchanged.
- **Counting/loop (nuxt):** live count excludes a mucked hole; toggle mid-session takes effect
  next cleanup.
- **Persistence (nuxt):** seeded round to completion → simulated refresh → same shoe continues
  (next round's cards match the uninterrupted timeline), count survives, round numbering
  continues, betting UI restored. Opening-deal refresh rewinds to round start with coherent
  bankroll.
- **Store (nuxt/unit):** version-999 training payload → `.bak` written + fresh data; corrupt
  JSON → `.bak` + fresh; valid v1 untouched; `.bak` write failure swallowed.
- **Drills (nuxt):** per drill — wrong answer → `role="status"` region contains the verdict
  text; `document.activeElement` is the Next/Again button; next round clears the region.
- **Outcome region (nuxt):** flair-on milestone round → outcome region holds the headline
  while the dealer region holds the last flair line; flair-off round → headline present.
- **Existing tests** asserting the cleanup reveal are updated to the new default.
- Full `pnpm test`, `lint`, `typecheck`, Playwright e2e (extend `restore.spec` with a
  between-rounds reload asserting count survival); CHANGELOG entries for all five fixes.

## Out of scope (tracked review findings, not this change)

Advantage-formula alignment between count panel and Bet Lab; money-formatting unification;
`useGameLoop`/`learn.vue`/`round.ts` decomposition; side-bet settled-kind `Set`; coverage
enforcement in CI; Netlify headers; drill state-machine dedup; README guidelines-link fix
(may ride along as a one-liner).
