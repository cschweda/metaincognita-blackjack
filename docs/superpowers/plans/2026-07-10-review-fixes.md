# Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the five approved review fixes: authentic hole-card muck procedure (+ training toggle), between-rounds shoe/count persistence, training-data backup/migration seam, drill verdict live-region + focus, and a dedicated round-outcome live region.

**Architecture:** Engine-first (pure TS `app/utils/engine/`, no Vue imports — CI greps for violations), then store, then the `useGameLoop` presentation loop, then UI components. The engine emits typed events; the loop drains them through a pacing queue; counting derives ONLY from `count-visible-card` events, so hole-count fidelity is fixed at the emit site. Persistence is one versioned localStorage key per concern (`blackjack-session-v1`, `blackjack-training-v1`).

**Tech Stack:** Nuxt 4, Vue 3, Pinia, TypeScript strict, Vitest (projects: `unit`, `nuxt` via `mountSuspended`), Playwright, happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-10-review-fixes-design.md`

## Global Constraints

- Engine purity: nothing under `app/utils/engine/` may import Vue, Nuxt, or Pinia.
- Money is integer cents; no floats in wagers/payouts.
- Conventional commits; **NO AI attribution trailers of any kind** (no `Co-Authored-By`, no session links) — user rule overrides all defaults.
- TDD: write the failing test first, watch it fail, implement, watch it pass, commit.
- Run single files with `pnpm vitest run <path>`; full gates are `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`.
- Nuxt component tests: `mountSuspended` from `@nuxt/test-utils/runtime`; do NOT call `setActivePinia(createPinia())` in nuxt-project component tests (repo precedent in `drillsStrategy.test.ts:8-11`); loop/store nuxt tests DO use it (see `gameLoop.test.ts:17-22`).
- `test/nuxt/*` runs in the `nuxt` vitest project; `test/unit/*` in `unit`.

---

### Task 1: Engine — muck the unseen hole by default; deferred Lucky Ladies forces the natural check

**Files:**
- Modify: `app/utils/engine/round.ts` (class field ~line 75, `playDealerAndSettle` ~line 477, `completeRound` ~line 531)
- Test: `test/unit/engine/round.test.ts` (append a new `describe` block)

**Interfaces:**
- Produces: `BlackjackGame.exposeHoleAtCleanup: boolean` (public, mutable, default `false`). Task 3's loop sets it.
- Behavior contract: `hole-revealed` + `count-visible-card`(hole) are emitted ONLY when (a) dealer natural at peek, (b) dealer plays out / Buster forces completion, (c) no-peek natural check needed by held blackjacks, pending insurance, **or a pending deferred Lucky Ladies wager (new)**, or (d) `exposeHoleAtCleanup === true` at cleanup.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/engine/round.test.ts` (uses the file's existing `c`, `game`, `StackedShoe`, `RULES` helpers; add `GameEvent` to the existing type-import from `'../../../app/utils/engine/round'`):

```ts
describe('BlackjackGame — hole-card muck procedure', () => {
  function collect(g: BlackjackGame): GameEvent[] {
    const events: GameEvent[] = []
    g.on(e => events.push(e))
    return events
  }

  it('mucks the unseen hole when every hand busts — no reveal, no count, no announce', () => {
    // hero 10,6 vs dealer 7 up / 10 hole; hero hits a 10 → bust 26
    const g = game([c(10), c(7, 'hearts'), c(6), c(10, 'clubs'), c(10, 'diamonds')])
    const events = collect(g)
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'hit')
    expect(g.phase).toBe('complete')
    expect(g.holeRevealed).toBe(false)
    expect(events.some(e => e.type === 'hole-revealed')).toBe(false)
    // counted: hero 10, up 7, hero 6, hit 10 — never the hole
    const counted = events.filter(e => e.type === 'count-visible-card')
    expect(counted).toHaveLength(4)
  })

  it('mucks the hole after a lone surrender', () => {
    const g = game([c(10), c(9, 'hearts'), c(6), c(10, 'clubs')])
    const events = collect(g)
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'surrender')
    expect(g.phase).toBe('complete')
    expect(g.holeRevealed).toBe(false)
    expect(events.some(e => e.type === 'hole-revealed')).toBe(false)
  })

  it('exposeHoleAtCleanup = true restores the show-and-count study behavior', () => {
    const g = game([c(10), c(7, 'hearts'), c(6), c(10, 'clubs'), c(10, 'diamonds')])
    g.exposeHoleAtCleanup = true
    const events = collect(g)
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'hit')
    expect(g.phase).toBe('complete')
    expect(g.holeRevealed).toBe(true)
    expect(events.filter(e => e.type === 'hole-revealed')).toHaveLength(1)
    expect(events.filter(e => e.type === 'count-visible-card')).toHaveLength(5)
  })

  it('a deferred Lucky Ladies wager forces the natural check even when all hands bust (MA §24(f))', () => {
    const r = cloneRules(PRESETS.MA_205CMR!)
    r.dealerPeek = false // ten-up defers Lucky Ladies until the hole is checked
    r.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'MA-A', matchTheDealer: false, buster: 'off' }
    // hero 10,6 vs dealer 10 up / 5 hole; hero hits a 10 → bust
    const g = game([c(10), c(10, 'hearts'), c(6), c(5, 'clubs'), c(10, 'diamonds')], r)
    const events = collect(g)
    g.beginRound([{ spotId: 0, mainBet: 1000, sideBets: { luckyLadies: 500 } }])
    g.act(0, 'hit')
    expect(g.phase).toBe('complete')
    // the dealer must check the hole to settle the LL dealer-blackjack tier
    expect(g.holeRevealed).toBe(true)
    expect(events.filter(e => e.type === 'hole-revealed')).toHaveLength(1)
    const ll = g.spots[0]!.sideBetResults.filter(x => x.name === 'Lucky Ladies')
    expect(ll).toHaveLength(1)
    expect(ll[0]!.net).toBe(-500) // 16 is not a twenty
    // no dealer draw happened — natural check only
    expect(g.dealerCards).toHaveLength(2)
  })

  it('still reveals when the dealer must play out (regression)', () => {
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs')]) // hero 19 stands vs 17
    const events = collect(g)
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'stand')
    expect(g.holeRevealed).toBe(true)
    expect(events.filter(e => e.type === 'hole-revealed')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm vitest run test/unit/engine/round.test.ts`
Expected: the first, second, and fourth new tests FAIL (`holeRevealed` is `true` / `hole-revealed` emitted / counted has 5 not 4). The third and fifth PASS against current behavior (that is fine — they are the regression guards). If `GameEvent`/`cloneRules`/`PRESETS` are unimported, add them to the existing import lines first.

- [ ] **Step 3: Implement**

In `app/utils/engine/round.ts`:

(a) Add the public field after `holeRevealed = false` (~line 75):

```ts
  holeRevealed = false
  /** Training aid: expose (and count) a mucked hole at cleanup. Real US procedure keeps a
   *  hole the round never forced face-up mucked face-down — counters never see it. */
  exposeHoleAtCleanup = false
```

(b) Add a private getter next to `holeCouldMakeNatural` (~line 330):

```ts
  /** A deferred Lucky Ladies wager (no-peek T/A up, §24(f) 1000:1 tier) still needs the
   *  natural check — the dealer physically turns the hole to settle it. */
  private get luckyLadiesPending(): boolean {
    if (this.rules.sideBets.luckyLadies === 'off') return false
    return this.spots.some(s =>
      (s.sideBets.luckyLadies ?? 0) > 0 && !s.sideBetResults.some(r => r.name === 'Lucky Ladies'))
  }
```

(c) Extend the no-draw reveal branch in `playDealerAndSettle` (~line 477):

```ts
    } else if (pendingBlackjacks.length > 0 || insurancePending || this.luckyLadiesPending) {
      this.revealHole() // no draw — only the natural check matters (MA §12(c), §24(f))
    }
```

(d) Gate the cleanup reveal in `completeRound` (~line 531):

```ts
  private completeRound(): void {
    // real procedure mucks an unseen hole face-down; the toggle exposes it for study
    if (this.exposeHoleAtCleanup) this.revealHole()
    const all = [
```

- [ ] **Step 4: Run the engine suite**

Run: `pnpm vitest run test/unit/engine/`
Expected: ALL PASS. If any existing test fails, it was asserting the old unconditional cleanup reveal — re-read it against the behavior contract above; the reveal paths (a)-(c) are unchanged, so a failure means the test's round genuinely ends all-bust/surrender, and its expectation should flip to muck (update the assertion, citing the contract). Known-checked call sites that must stay green untouched: `round.test.ts:49`, `:188-198`, `:514`, `serialize.test.ts:45`.

- [ ] **Step 5: Run the full unit + nuxt suites (loop-level fallout check)**

Run: `pnpm test`
Expected: ALL PASS. `test/nuxt/gameLoop.test.ts:36` (`dealerRow.every(faceUp)`) stays green because that round stands → dealer plays out → legitimate reveal. If a nuxt test fails on hole visibility, apply the same contract reasoning as Step 4.

- [ ] **Step 6: Commit**

```bash
git add app/utils/engine/round.ts test/unit/engine/round.test.ts
git commit -m "fix(engine): muck the unseen hole at cleanup — count fidelity; deferred Lucky Ladies forces the natural check"
```

---

### Task 2: Store — `exposeMuckedHole` lifetime training field

**Files:**
- Modify: `app/stores/useBlackjackStore.ts` (`TrainingStats` ~line 63, `freshTraining` ~line 124, `loadTraining` field mapping ~line 179, actions ~line 262, store return ~line 405)
- Test: `test/nuxt/store.test.ts` (append to the `drill times and bet ramp` describe, ~line 171)

**Interfaces:**
- Consumes: nothing new.
- Produces: `TrainingStats.exposeMuckedHole: boolean` (default `false`) and store action `setExposeMuckedHole(enabled: boolean): void`. Task 3 consumes both.

- [ ] **Step 1: Write the failing test**

Append inside `describe('useBlackjackStore — drill times and bet ramp', …)` in `test/nuxt/store.test.ts`:

```ts
  it('persists exposeMuckedHole lifetime and backfills old payloads to false', () => {
    const store = useBlackjackStore()
    expect(store.training.exposeMuckedHole).toBe(false)
    store.setExposeMuckedHole(true)

    setActivePinia(createPinia())
    const fresh = useBlackjackStore()
    expect(fresh.training.exposeMuckedHole).toBe(true)

    const raw = JSON.parse(localStorage.getItem(TRAINING_KEY)!)
    delete raw.exposeMuckedHole
    localStorage.setItem(TRAINING_KEY, JSON.stringify(raw))
    setActivePinia(createPinia())
    expect(useBlackjackStore().training.exposeMuckedHole).toBe(false)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/nuxt/store.test.ts`
Expected: FAIL — `setExposeMuckedHole is not a function`.

- [ ] **Step 3: Implement**

In `app/stores/useBlackjackStore.ts`:

(a) `TrainingStats` — after `keyboardShortcuts: boolean`:

```ts
  /** Training aid: expose (and count) the mucked hole at cleanup — off = real procedure. */
  exposeMuckedHole: boolean
```

(b) `freshTraining()` — after `keyboardShortcuts: true`:

```ts
    keyboardShortcuts: true,
    exposeMuckedHole: false
```

(c) `loadTraining()` field mapping — after the `keyboardShortcuts` line:

```ts
        keyboardShortcuts: data.keyboardShortcuts !== false,
        exposeMuckedHole: data.exposeMuckedHole === true
```

(d) New action after `setKeyboardShortcuts` (~line 265):

```ts
  function setExposeMuckedHole(enabled: boolean): void {
    training.value.exposeMuckedHole = enabled
    persistTraining()
  }
```

(e) Add `setExposeMuckedHole` to the store's return object (beside `setKeyboardShortcuts`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/nuxt/store.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add app/stores/useBlackjackStore.ts test/nuxt/store.test.ts
git commit -m "feat(store): exposeMuckedHole lifetime training toggle (additive, no version bump)"
```

---

### Task 3: Loop + table — apply the muck preference; "Hole" toolbar toggle

**Files:**
- Modify: `app/composables/useGameLoop.ts` (`attach` ~line 436, public API return ~line 699)
- Modify: `app/pages/table.vue` (toolbar ~line 244, insert after the Keys button)
- Test: `test/nuxt/gameLoop.test.ts` (append)

**Interfaces:**
- Consumes: `BlackjackGame.exposeHoleAtCleanup` (Task 1), `store.training.exposeMuckedHole` + `store.setExposeMuckedHole` (Task 2).
- Produces: `useGameLoop().setExposeMuckedHole(enabled: boolean): void` — sets the store field AND the live game's field.

- [ ] **Step 1: Write the failing tests**

Append inside the main describe of `test/nuxt/gameLoop.test.ts` (after the existing `playFullRound` helper, which stays untouched):

```ts
  function playHitOnlyRound(loop: ReturnType<typeof useGameLoop>): void {
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    let guard = 0
    while (loop.phase.value === 'playerTurns' && guard++ < 12) {
      loop.act(loop.legalActions.value.includes('hit') ? 'hit' : 'stand')
    }
    expect(loop.phase.value).toBe('complete')
  }

  /** First seed whose hit-only first round ends with the dealer never drawing (hero busts,
   *  no dealer play needed) — the muck case. */
  function findBustSeed(): number {
    for (let s = 1; s < 80; s++) {
      freshHarness()
      const probe = useGameLoop()
      probe.startSession(settings({ count: 'shown' }), 100_000, s)
      playHitOnlyRound(probe)
      const rec = useBlackjackStore().history[0]!
      const hero = rec.spots.find(x => x.occupant === 'hero')!
      if (rec.dealer.cards.length === 2 && hero.hands.every(h => h.outcome === 'lose')) return s
    }
    throw new Error('no bust seed found under 80')
  }

  it('does not count or reveal a mucked hole (authentic default)', () => {
    const seed = findBustSeed()
    freshHarness()
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, seed)
    playHitOnlyRound(loop)
    expect(loop.dealerRow.value[1]!.faceUp).toBe(false) // hole stays down through cleanup
    const rec = store.history[0]!
    const heroCards = rec.spots.find(x => x.occupant === 'hero')!.hands[0]!.cards.length
    // counted: dealer up + every hero card — never the hole
    expect(store.countState!.cardsSeen).toBe(1 + heroCards)
    expect(rec.visibleCards).toHaveLength(1 + heroCards)
  })

  it('setExposeMuckedHole(true) exposes and counts the hole at cleanup', () => {
    const seed = findBustSeed()
    freshHarness()
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, seed)
    loop.setExposeMuckedHole(true)
    playHitOnlyRound(loop)
    expect(store.training.exposeMuckedHole).toBe(true)
    expect(loop.dealerRow.value[1]!.faceUp).toBe(true)
    const heroCards = store.history[0]!.spots.find(x => x.occupant === 'hero')!.hands[0]!.cards.length
    expect(store.countState!.cardsSeen).toBe(2 + heroCards) // up + hole + hero cards
  })
```

Note: `freshHarness` already exists at `gameLoop.test.ts:198`; if it is declared below the insertion point, place these tests after it (order within the describe does not matter).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/nuxt/gameLoop.test.ts`
Expected: FAIL — `loop.setExposeMuckedHole is not a function` (second test); first test may already pass (engine default is authentic since Task 1) — that is expected.

- [ ] **Step 3: Implement**

In `app/composables/useGameLoop.ts`:

(a) `attach()` applies the persisted preference to every new/restored game:

```ts
function attach(g: BlackjackGame): void {
  unsubscribe?.()
  game = g
  g.exposeHoleAtCleanup = useBlackjackStore().training.exposeMuckedHole
  gameGen.value++
  unsubscribe = g.on((e) => {
    eventQueue.push(e)
  })
}
```

(b) Inside `useGameLoop()`, after `setExposeMuckedHole` consumers — add the API function next to `endSession`:

```ts
  function setExposeMuckedHole(enabled: boolean): void {
    store.setExposeMuckedHole(enabled)
    if (game) game.exposeHoleAtCleanup = enabled
  }
```

(c) Add `setExposeMuckedHole` to the returned object (line ~699-703).

In `app/pages/table.vue`, insert after the Keys `UButton` (line ~244, before the Study button):

```vue
          <UButton
            size="xs"
            :variant="store.training.exposeMuckedHole ? 'solid' : 'outline'"
            color="neutral"
            icon="i-lucide-eye"
            :aria-pressed="store.training.exposeMuckedHole"
            aria-label="Expose the mucked hole card at cleanup"
            title="Real tables muck an unseen hole face-down — turn on to see and count it as a study aid"
            data-testid="hole-toggle"
            @click="loop.setExposeMuckedHole(!store.training.exposeMuckedHole)"
          >
            Hole
          </UButton>
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run test/nuxt/gameLoop.test.ts && pnpm vitest run test/nuxt/table.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useGameLoop.ts app/pages/table.vue test/nuxt/gameLoop.test.ts
git commit -m "feat(table): Hole toggle — authentic muck by default, opt-in exposed hole for study"
```

---

### Task 4: Loop — between-rounds snapshot; e2e reload coverage

**Files:**
- Modify: `app/composables/useGameLoop.ts` (`finalizeRound` tail ~line 418, `fastForwardPresentation` announcement ~line 587)
- Test: `test/nuxt/gameLoop.test.ts` (append), `test/e2e/restore.spec.ts` (append)

**Interfaces:**
- Consumes: existing `BlackjackGame.snapshot()/restore()` (any-phase), `store.saveSnapshot`, `restoreCounting`.
- Produces: refresh contract — mid-decision: exact table; between rounds: same shoe + count at the betting screen; during the opening deal: rewind to round start.

- [ ] **Step 1: Write the failing tests**

Append to the main describe in `test/nuxt/gameLoop.test.ts`:

```ts
  it('a between-rounds refresh keeps the shoe and the count (README claim)', () => {
    // control: two rounds uninterrupted
    freshHarness()
    const control = useGameLoop()
    control.startSession(settings({ count: 'shown' }), 100_000, 7)
    playFullRound(control)
    playFullRound(control)
    const controlRec = useBlackjackStore().history[1]!
    const controlCards = JSON.stringify({
      dealer: controlRec.dealer.cards,
      hero: controlRec.spots.map(s => s.hands.map(h => h.cards))
    })

    // same seed, refreshed between rounds
    freshHarness()
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, 7)
    playFullRound(loop)
    const countBefore = { ...store.countState! }
    expect(store.roundSnapshot).not.toBeNull() // the between-rounds checkpoint exists

    __resetGameLoopForTests() // refresh: module state gone, store survives
    const loop2 = useGameLoop()
    expect(loop2.restoreSession()).toBe(true)
    expect(store.countState).toEqual(countBefore) // count survived
    playFullRound(loop2)
    const rec = store.history[1]!
    expect(rec.round).toBe(2)
    expect(JSON.stringify({
      dealer: rec.dealer.cards,
      hero: rec.spots.map(s => s.hands.map(h => h.cards))
    })).toBe(controlCards) // identical shoe continuation
  })

  it('a refresh during the opening deal rewinds to the round start on the same shoe', async () => {
    vi.useFakeTimers()
    freshHarness()
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ mode: 'casino' }), 100_000, 7)
    loop.beginRound(1000, {})
    await vi.runAllTimersAsync()
    while (loop.phase.value === 'insurance' || loop.phase.value === 'playerTurns') {
      if (loop.phase.value === 'insurance') loop.heroInsurance(null)
      else loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
      await vi.runAllTimersAsync()
    }
    expect(loop.phase.value).toBe('complete')
    const bankrollAfterRound1 = store.bankroll
    const countAfterRound1 = { ...store.countState! }

    loop.beginRound(1000, {}) // round 2 deal starts pacing…
    await vi.advanceTimersByTimeAsync(100) // …and is interrupted mid-presentation
    vi.useRealTimers()

    __resetGameLoopForTests()
    const loop2 = useGameLoop()
    expect(loop2.restoreSession()).toBe(true)
    // rewound to the round-1-complete checkpoint: same bankroll, same count, betting UI
    expect(store.bankroll).toBe(bankrollAfterRound1)
    expect(store.countState).toEqual(countAfterRound1)
    expect(loop2.phase.value).toBe('complete')
    expect(loop2.queueIdle.value).toBe(true)
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/nuxt/gameLoop.test.ts`
Expected: first new test FAILS at `expect(store.roundSnapshot).not.toBeNull()` (finalizeRound nulls it today). Second may fail on count/phase (fresh-shoe fallback path).

- [ ] **Step 3: Implement**

In `app/composables/useGameLoop.ts`, replace the last two lines of `finalizeRound` (`store.setRoundTrail(null)` / `store.saveSnapshot(null)`, ~lines 418-419) with:

```ts
  store.setRoundTrail(null)
  // between-rounds checkpoint: the shoe and count survive a refresh at the betting screen
  // (mid-decision checkpoints are written by snapshotToStore; this one covers settlement →
  // next deal, and doubles as the rewind point for a refresh during the next opening deal)
  try {
    store.saveSnapshot(game.snapshot())
  } catch {
    store.saveSnapshot(null) // test CardSources are not serializable
  }
```

In `fastForwardPresentation` (~line 587), make the announcement phase-aware:

```ts
    pushAnnouncement(game.phase === 'complete' ? 'Table restored — place your bet' : 'Table restored — your move')
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run test/nuxt/gameLoop.test.ts`
Expected: ALL PASS — including the pre-existing corrupt-snapshot and round-numbering tests.

- [ ] **Step 5: Extend the e2e spec**

Append to `test/e2e/restore.spec.ts`:

```ts
test('a between-rounds reload restores the same shoe and lets play continue', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await standUntilComplete(page)

  await page.reload()
  await expect(page.locator('main')).toContainText('Table restored', { timeout: 15_000 })
  await expect(page.getByTestId('deal')).toBeVisible()

  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await standUntilComplete(page)
})
```

- [ ] **Step 6: Run the e2e file**

Run: `pnpm playwright test test/e2e/restore.spec.ts`
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add app/composables/useGameLoop.ts test/nuxt/gameLoop.test.ts test/e2e/restore.spec.ts
git commit -m "fix(loop): persist a between-rounds checkpoint — shoe and count survive any refresh"
```

---

### Task 5: Store — training `.bak` + migration seam

**Files:**
- Modify: `app/stores/useBlackjackStore.ts` (`loadTraining` ~line 172)
- Test: `test/nuxt/store.test.ts` (append to the `persistence hardening` describe)

**Interfaces:**
- Produces: on `TRAINING_KEY` version mismatch or corrupt JSON, the raw payload is stashed at `blackjack-training-v1.bak` before fresh data is returned; `migrateTraining` is the future-version seam.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('useBlackjackStore — persistence hardening', …)`:

```ts
  it('stashes a training backup before discarding an unknown-version payload', () => {
    localStorage.setItem(TRAINING_KEY, JSON.stringify({ version: 999, drillBests: { 'strategy-flash': 9 } }))
    const store = useBlackjackStore()
    expect(store.training.drillBests['strategy-flash']).toBeUndefined() // fresh
    expect(localStorage.getItem(`${TRAINING_KEY}.bak`)).toContain('999')
  })

  it('stashes a training backup before discarding a corrupt payload', () => {
    localStorage.setItem(TRAINING_KEY, '{not json')
    const store = useBlackjackStore()
    expect(store.training.countChecks).toEqual([])
    expect(localStorage.getItem(`${TRAINING_KEY}.bak`)).toBe('{not json')
  })
```

`TRAINING_KEY` is already exported; ensure it is in the test file's import from the store (it appears at `store.test.ts:196`, so it already is).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/nuxt/store.test.ts`
Expected: both FAIL — `.bak` is null.

- [ ] **Step 3: Implement**

In `app/stores/useBlackjackStore.ts`, add two helpers above `loadTraining` (module scope, beside `freshTraining`):

```ts
/** Version-mismatch seam: map an older payload forward, or return null when unknown
 *  (→ backup + fresh). A future TRAINING_VERSION bump adds its `case` here so a bump
 *  can never silently destroy lifetime stats. */
function migrateTraining(data: { version?: number } & Partial<TrainingStats>): TrainingStats | null {
  switch (data.version) {
    default:
      return null
  }
}

function backupTraining(raw: string): void {
  try {
    localStorage.setItem(`${TRAINING_KEY}.bak`, raw)
  } catch { /* backup is best-effort */ }
}
```

Rework `loadTraining` to hold `raw` outside the try and route both failure paths through the backup:

```ts
  function loadTraining(): TrainingStats {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(TRAINING_KEY)
      if (!raw) return freshTraining()
      const data = JSON.parse(raw) as { version?: number } & Partial<TrainingStats>
      if (data.version !== TRAINING_VERSION) {
        const migrated = migrateTraining(data)
        if (migrated) return migrated
        backupTraining(raw)
        return freshTraining()
      }
      const base = freshTraining()
      return {
        // …the existing field mapping, byte-for-byte unchanged (adherence, mistakeBag,
        // countChecks, drillBests, drillTimes, betRamp, betHintsEnabled,
        // keyboardShortcuts, exposeMuckedHole)…
      }
    } catch {
      if (raw) backupTraining(raw)
      return freshTraining()
    }
  }
```

(Only the wrapper changes; keep the existing validated field mapping exactly as it is after Task 2.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run test/nuxt/store.test.ts`
Expected: ALL PASS (including the Task 2 backfill test — valid v1 payloads take the unchanged path).

- [ ] **Step 5: Commit**

```bash
git add app/stores/useBlackjackStore.ts test/nuxt/store.test.ts
git commit -m "fix(store): back up training data before any discard; add version-migration seam"
```

---

### Task 6: `useDrillFeedback` composable + StrategyFlash + PairCancel

**Files:**
- Create: `app/composables/useDrillFeedback.ts`
- Modify: `app/components/drills/StrategyFlash.vue`, `app/components/drills/PairCancel.vue`
- Test: `test/nuxt/drillsStrategy.test.ts` (StrategyFlash case), the file that mounts PairCancel — `test/nuxt/drillsCancelCountdown.test.ts` (verify with `grep -l PairCancel test/nuxt/`)

**Interfaces:**
- Produces: `useDrillFeedback(): { srText: Ref<string>, focusEl: Ref<FocusTarget>, announce(text: string): void, clear(): void }` — Task 7 reuses it in the other four drills.
- Pattern per drill: one persistent `<p class="sr-only" role="status">{{ srText }}</p>`; `announce(verdict text)` on reveal; `clear()` on next; `ref="focusEl"` on the Next/Again button.

- [ ] **Step 1: Write the failing tests**

Append to the `StrategyFlash` describe in `test/nuxt/drillsStrategy.test.ts` (add `import { nextTick } from 'vue'` at the top):

```ts
  it('announces the verdict in a live region and moves focus to Next', async () => {
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(42) } })
    const sr = w.find('[data-testid="flash-sr"]')
    expect(sr.attributes('role')).toBe('status')
    expect(sr.text()).toBe('')
    await w.find('button[data-testid^="flash-"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="flash-sr"]').text()).toMatch(/book play|Book:/)
    expect(document.activeElement?.getAttribute('data-testid')).toBe('flash-next')
    await w.find('[data-testid="flash-next"]').trigger('click')
    expect(w.find('[data-testid="flash-sr"]').text()).toBe('')
  })
```

Append to the file that mounts `PairCancel` (same imports pattern; `mulberry32` from `../../app/utils/engine/rng`):

```ts
  it('announces the pair verdict and moves focus to Next pair', async () => {
    const w = await mountSuspended(PairCancel, { props: { rng: mulberry32(5) } })
    expect(w.find('[data-testid="pair-sr"]').attributes('role')).toBe('status')
    await w.find('[data-testid="pair-btn-0"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="pair-sr"]').text()).toMatch(/net/)
    expect(document.activeElement?.getAttribute('data-testid')).toBe('pair-next')
    await w.find('[data-testid="pair-next"]').trigger('click')
    expect(w.find('[data-testid="pair-sr"]').text()).toBe('')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/nuxt/drillsStrategy.test.ts test/nuxt/drillsCancelCountdown.test.ts`
Expected: FAIL — no `[data-testid="flash-sr"]` / `[data-testid="pair-sr"]` elements.

- [ ] **Step 3: Create the composable**

`app/composables/useDrillFeedback.ts`:

```ts
import { nextTick, ref } from 'vue'
import type { Ref } from 'vue'

type FocusTarget = HTMLElement | { $el?: HTMLElement } | null

/** Drill verdict feedback (WCAG 4.1.3): each drill renders ONE persistent sr-only
 *  role="status" region bound to srText — a region that mounts already containing its
 *  message is unreliably announced, so the node persists and only the text changes.
 *  announce() also hands focus to the Next/Again button: the answered button unmounts
 *  with the v-if swap, and without the hand-off focus falls to <body>. */
export function useDrillFeedback(): {
  srText: Ref<string>
  focusEl: Ref<FocusTarget>
  announce: (text: string) => void
  clear: () => void
} {
  const srText = ref('')
  const focusEl = ref<FocusTarget>(null)

  function announce(text: string): void {
    srText.value = text
    void nextTick(() => {
      const target = focusEl.value
      const el = (target as { $el?: HTMLElement } | null)?.$el ?? (target as HTMLElement | null)
      el?.focus?.()
    })
  }

  function clear(): void {
    srText.value = ''
  }

  return { srText, focusEl, announce, clear }
}
```

- [ ] **Step 4: Wire StrategyFlash**

In `app/components/drills/StrategyFlash.vue`:

(a) Script — add after `const { streak, grade } = useDrillStreak('strategy-flash')`:

```ts
const { srText, focusEl, announce, clear } = useDrillFeedback()

const verdictMessage = computed(() => {
  const v = verdict.value
  if (!v) return ''
  if (v.correct) return `✓ ${ACTION_LABEL[v.chosen!]} is the book play`
  if (v.chosen === null) return `⏱ Too slow — book: ${ACTION_LABEL[v.book]}`
  return `✗ Book: ${ACTION_LABEL[v.book]}`
})
```

(b) The timeout branch inside `startClock`'s interval gains an announce after `grade(false)`:

```ts
      verdict.value = { chosen: null, correct: false, book: bookAction.value }
      grade(false)
      announce(verdictMessage.value)
```

(c) `answer()` gains an announce after `grade(correct)`:

```ts
  grade(correct)
  announce(verdictMessage.value)
```

(d) `next()` starts with `clear()`:

```ts
function next(): void {
  clear()
  verdict.value = null
  situation.value = randomSituation()
  startClock()
}
```

(e) Template — first child of the root `div`:

```vue
    <p
      class="sr-only"
      role="status"
      data-testid="flash-sr"
    >
      {{ srText }}
    </p>
```

(f) The verdict `<p>`'s interpolation body (the whole `{{ verdict.correct ? … }}` ternary) becomes `{{ verdictMessage }}`; the Next button gains `ref="focusEl"`:

```vue
      <UButton
        ref="focusEl"
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        data-testid="flash-next"
        @click="next"
      >
        Next hand
      </UButton>
```

- [ ] **Step 5: Wire PairCancel**

In `app/components/drills/PairCancel.vue`:

(a) Script — after the `useDrillStreak` line:

```ts
const { srText, focusEl, announce, clear } = useDrillFeedback()

const verdictHeadline = computed(() => correct.value
  ? `✓ net ${net.value > 0 ? '+' : ''}${net.value}`
  : `✗ you said ${picked.value > 0 ? '+' : ''}${picked.value} — net is ${net.value > 0 ? '+' : ''}${net.value}`)
```

(b) `answer()` announces the headline plus the lesson:

```ts
function answer(value: number): void {
  picked.value = value
  correct.value = value === net.value
  grade(correct.value)
  phase.value = 'verdict'
  announce(`${verdictHeadline.value}. ${explanation.value}`)
}
```

(c) `nextPair()` starts with `clear()`.

(d) Template — sr region as first child of the root `div` (`data-testid="pair-sr"`, same markup as Step 4e); the verdict headline `<p>`'s interpolation becomes `{{ verdictHeadline }}`; the Next button gains `ref="focusEl"`.

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run test/nuxt/drillsStrategy.test.ts test/nuxt/drillsCancelCountdown.test.ts`
Expected: ALL PASS. If the `document.activeElement` assertion is flaky under happy-dom, insert one more `await nextTick()` after the click before asserting (announce focuses on the tick after the text lands).

- [ ] **Step 7: Commit**

```bash
git add app/composables/useDrillFeedback.ts app/components/drills/StrategyFlash.vue app/components/drills/PairCancel.vue test/nuxt/drillsStrategy.test.ts test/nuxt/drillsCancelCountdown.test.ts
git commit -m "fix(a11y): drill verdicts announce via role=status and hand focus to Next (StrategyFlash, PairCancel)"
```

---

### Task 7: Wire the remaining four drills

**Files:**
- Modify: `app/components/drills/TrueCountDrill.vue`, `app/components/drills/DeviationQuiz.vue`, `app/components/drills/CountDrill.vue`, `app/components/drills/DeckCountdown.vue`
- Test: the files that mount each (verify with `grep -rl "TrueCountDrill\|DeviationQuiz\|CountDrill\|DeckCountdown" test/nuxt/`)

**Interfaces:**
- Consumes: `useDrillFeedback()` from Task 6, exactly the Task 6 pattern.

- [ ] **Step 1: Write the failing tests** (one per drill, in whichever test file already mounts it; identical shape — shown for TrueCountDrill and CountDrill, replicate for DeviationQuiz with `quiz-` testids and DeckCountdown with `countdown-` testids):

```ts
  it('announces the TC verdict and moves focus to Next', async () => {
    const w = await mountSuspended(TrueCountDrill, { props: { rng: mulberry32(3) } })
    expect(w.find('[data-testid="tc-sr"]').attributes('role')).toBe('status')
    await w.find('[data-testid="tc-answer"] input, input[data-testid="tc-answer"]').setValue('0')
    await w.find('[data-testid="tc-submit"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="tc-sr"]').text()).toContain('TC =')
    expect(document.activeElement?.getAttribute('data-testid')).toBe('tc-next')
  })
```

```ts
  it('announces the count verdict and moves focus to Again', async () => {
    const w = await mountSuspended(CountDrill, { props: { rng: mulberry32(3) } })
    await w.find('[data-testid="count-start"]').trigger('click')
    // …drive the existing flash-to-answer path the way this file's current tests do…
    await w.find('[data-testid="count-answer"] input, input[data-testid="count-answer"]').setValue('0')
    await w.find('[data-testid="count-submit"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="count-sr"]').text()).toMatch(/RC/)
    expect(document.activeElement?.getAttribute('data-testid')).toBe('count-again')
  })
```

(Reuse each test file's existing fake-timer/reduced-motion driving pattern to reach the answer phase — `drillsCount.test.ts` already walks CountDrill to `answer`; copy its arrangement lines verbatim, then add the sr/focus assertions. DeviationQuiz: click `quiz-deviate`, assert `quiz-sr` contains `applies at`, focus is `quiz-next`. DeckCountdown: reach `enter` via its existing test pattern, submit, assert `countdown-sr` matches `/count/` and focus is `countdown-again`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/nuxt/drillsCount.test.ts test/nuxt/drillsCancelCountdown.test.ts test/nuxt/drillsStrategy.test.ts`
Expected: new cases FAIL on missing sr testids.

- [ ] **Step 3: Wire each drill** (Task 6 pattern; per drill):

**TrueCountDrill.vue** — script after `useDrillStreak`:

```ts
const { srText, focusEl, announce, clear } = useDrillFeedback()

const verdictText = computed(() => verdict.value
  ? `${verdict.value.correct ? '✓' : '✗'} TC = ${question.value.rc} ÷ ${question.value.decksRemaining} = ${verdict.value.actual.toFixed(1)}`
  : '')
```

`submit()` appends `announce(verdictText.value)` after `grade(correct)`; `next()` starts with `clear()`. Template: sr region first child (`data-testid="tc-sr"`); verdict `<p>` body becomes `{{ verdictText }}`; Next button (`tc-next`) gains `ref="focusEl"`.

**DeviationQuiz.vue** — script after `useDrillStreak`:

```ts
const { srText, focusEl, announce, clear } = useDrillFeedback()
```

`answer()` appends after `grade(correct)`:

```ts
  announce(`${correct ? '✓ Correct' : '✗ Not this time'}. ${verdict.value!.explanation}`)
```

`next()` starts with `clear()`. Template: sr region (`data-testid="quiz-sr"`); `quiz-next` button gains `ref="focusEl"` (visible verdict markup unchanged — headline and explanation are separate `<p>`s).

**CountDrill.vue** — script after `useDrillStreak`:

```ts
const { srText, focusEl, announce, clear } = useDrillFeedback()

const verdictText = computed(() => phase.value === 'result'
  ? (correct.value ? `✓ RC ${actual.value}` : `✗ you said ${entered.value} — RC was ${actual.value}`)
  : '')
```

`submit()` appends `announce(verdictText.value)` after `phase.value = 'result'`; `reset()` gains `clear()` after `stopTimer()`. Template: sr region (`data-testid="count-sr"`); result `<p>` body becomes `{{ verdictText }}`; the Again button gains `ref="focusEl"` and `data-testid="count-again"`.

**DeckCountdown.vue** — script after the `tier` computed:

```ts
const { srText, focusEl, announce, clear } = useDrillFeedback()

const verdictText = computed(() => {
  if (phase.value !== 'verdict') return ''
  return correct.value
    ? `✓ count ${expected.value > 0 ? '+' : ''}${expected.value} — deck verified in ${fmt(elapsedMs.value)}`
    : `✗ you said ${entered.value} — the count was ${expected.value > 0 ? '+' : ''}${expected.value}`
})
```

`submit()` appends after `phase.value = 'verdict'`:

```ts
  announce(`${verdictText.value}. The hidden card: ${hidden.value ? displayCard(hidden.value) : ''}.`)
```

`reset()` gains `clear()` after `stopTicker()`. Template: sr region (`data-testid="countdown-sr"`); verdict `<p>` body becomes `{{ verdictText }}`; the Again button gains `ref="focusEl"` and `data-testid="countdown-again"`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:nuxt`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/drills/ test/nuxt/
git commit -m "fix(a11y): verdict live regions + focus hand-off for the remaining four drills"
```

---

### Task 8: Round outcome gets its own live region

**Files:**
- Modify: `app/composables/useGameLoop.ts` (module refs ~line 66, `pushAnnouncement` ~line 242, `finalizeRound` ~line 385, `beginRound` ~line 592, `resetPresentation` ~line 551, `__resetGameLoopForTests` ~line 111, return object ~line 700)
- Modify: `app/pages/table.vue` (destructure ~line 15, template beside `<RoundOutcome>` ~line 219)
- Test: `test/nuxt/gameLoop.test.ts` (append)

**Interfaces:**
- Produces: `useGameLoop().outcomeLive: Ref<string>` — settled-round headline; empty between deals.
- Changes: `pushAnnouncement(text, opts?: { live?: boolean })` — `live: false` updates the visible strip only.

- [ ] **Step 1: Write the failing test**

Append to `test/nuxt/gameLoop.test.ts` (add `import { summarizeRound } from '../../app/utils/advisor'` at the top):

```ts
  it('announces the round outcome in its own live region, immune to flair overwrites', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ flair: true }), 100_000, 7)
    playFullRound(loop)
    const headline = summarizeRound(store.history[0]!)!.headline
    expect(loop.outcomeLive.value).toBe(headline)
    // the visible strip still carries the headline even when flair lines follow it
    expect(loop.announcements.value.some(a => a.text === headline)).toBe(true)
    loop.beginRound(1000, {})
    expect(loop.outcomeLive.value).toBe('') // cleared so the next identical outcome re-announces
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/nuxt/gameLoop.test.ts`
Expected: FAIL — `loop.outcomeLive` is undefined.

- [ ] **Step 3: Implement**

In `app/composables/useGameLoop.ts`:

(a) Module ref beside `liveText` (~line 66):

```ts
const liveText = ref('')
/** Settled-round headline for the dedicated outcome live region — flair lines flow through
 *  liveText and can never overwrite this. */
const outcomeLive = ref('')
```

(b) `pushAnnouncement` gains the opt (~line 242):

```ts
function pushAnnouncement(text: string, opts: { live?: boolean } = {}): void {
  announcements.value.push({ id: ++announceId, text })
  if (announcements.value.length > 4) announcements.value.shift()
  if (opts.live !== false) liveText.value = text
}
```

(c) `finalizeRound` (~line 385) — replace the comment + headline push:

```ts
  // the outcome speaks through its own live region (outcomeLive) so the flair lines below
  // can never overwrite it; the visible dealer strip still shows the headline first
  const summary = summarizeRound(record)
  if (summary) {
    pushAnnouncement(summary.headline, { live: false })
    outcomeLive.value = summary.headline
  }
```

(d) `beginRound` — add `outcomeLive.value = ''` beside `visibleThisRound = []`.

(e) `resetPresentation` and `__resetGameLoopForTests` — add `outcomeLive.value = ''` beside `liveText.value = ''` / `announcements.value = []`.

(f) Add `outcomeLive` to the `return` object beside `liveText`.

In `app/pages/table.vue`:

(g) Destructure `outcomeLive` from the loop (line ~16, beside `liveText`).

(h) Template — insert directly above `<RoundOutcome :summary="roundSummary" />`:

```vue
      <p
        class="sr-only"
        role="status"
        data-testid="outcome-live"
      >
        {{ outcomeLive }}
      </p>
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run test/nuxt/gameLoop.test.ts && pnpm vitest run test/nuxt/table.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useGameLoop.ts app/pages/table.vue test/nuxt/gameLoop.test.ts
git commit -m "fix(a11y): dedicated outcome live region — milestone flair can no longer swallow the round result"
```

---

### Task 9: CHANGELOG, README link, full verification

**Files:**
- Modify: `CHANGELOG.md` (Unreleased section), `README.md:202`

**Interfaces:** none — documentation + gates.

- [ ] **Step 1: CHANGELOG entries**

Under `## [Unreleased]`, add to the existing subsections (create the subsection only if absent):

```markdown
### Fixed (training correctness)
- Authentic hole-card procedure: a hole the round never forced face-up is mucked unseen —
  not revealed, not counted (real US procedure; previously every cleanup exposed and counted
  it, inflating the trained count ~1 round in 6 heads-up and biasing the Bet Lab's TC
  distribution). A "Hole" table toggle (lifetime, off by default) restores show-and-count as
  a study aid. A deferred Lucky Ladies wager still forces the natural check (MA §24(f))
- Between-rounds persistence: settlement now writes a shoe+count checkpoint, so a refresh at
  the betting screen restores the same shoe and running count (previously: silent fresh shoe
  and a zeroed count — the README's "count included" claim was only true mid-decision); a
  refresh during the opening deal rewinds cleanly to the round start on the same shoe

### Fixed (money & state integrity)
- Lifetime training data is backed up to `blackjack-training-v1.bak` before any discard
  (unknown version or corrupt payload), and a version-migration seam ensures a future
  schema bump maps old data forward instead of destroying it

### Accessibility
- All six drills announce their verdict through a persistent `role="status"` region and move
  focus to Next/Again (previously: the answer button unmounted, focus fell to `<body>`, and
  screen readers heard nothing — WCAG 4.1.3)
- The settled round's WIN/LOSE headline announces through its own live region; milestone
  flair lines can no longer overwrite it in the same tick
```

- [ ] **Step 2: Fix the README guidelines link**

`README.md:202`: change both link text and target from `METAINCOGNITA-GUIDELINES-v1.0.md` to `METAINCOGNITA-GUIDELINES-v1.1.md`.

- [ ] **Step 3: Full gates**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: all suites pass (375 + the ~12 new tests), zero lint errors, zero type errors.

Run: `pnpm test:e2e`
Expected: 16 passed (15 existing + the new restore spec).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: changelog for review fixes; point README at guidelines v1.1"
```

---

## Plan Self-Review Notes

- Spec coverage: Fix 1 → Tasks 1-3; Fix 2 → Task 4; Fix 3 → Task 5; Fix 4 → Tasks 6-7; Fix 5 → Task 8; docs/gates → Task 9. Out-of-scope list untouched except the README link (explicitly allowed to ride along).
- Type consistency: `exposeHoleAtCleanup` (engine field), `exposeMuckedHole` (store/training field), `setExposeMuckedHole` (store action AND loop API — the loop one additionally pokes the live game), `useDrillFeedback` return names used identically in Tasks 6-7, `outcomeLive` in Task 8.
- Badges deliberately not bumped (release-time job per guidelines §6); test counts in README change at the next version cut.
