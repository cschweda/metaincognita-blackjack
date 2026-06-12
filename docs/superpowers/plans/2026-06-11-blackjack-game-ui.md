# Blackjack Playable Game UI Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the engine playable: setup screen (presets + custom rules editor + bots), the SVG felt table with chip betting and paced card play (casino/quick modes), bot companions acting at the table, bankroll/session tracking, and bulletproof localStorage persistence including mid-round refresh restore.

**Architecture:** The engine (`app/utils/engine/`) stays the only rules authority. A module-scoped `BlackjackGame` instance lives behind `useGameLoop`, which drains the engine's synchronous event stream into a paced presentation queue; Vue components render *presented* state (cards appear one by one in casino mode) while amounts/legality always come from engine state. Pinia (`useBlackjackStore`) holds only serializable session state (settings, bankroll, history, snapshots) and owns persistence.

**Tech Stack:** Nuxt 4 / Vue 3 / Pinia 3 / @nuxt/ui 4 / Tailwind 4 (existing scaffold), Vitest `nuxt` project (happy-dom) for component tests.

**Spec:** `docs/superpowers/specs/2026-06-11-blackjack-trainer-design.md` §§5–10. **Carry-forward obligations from Plan 1's final review** (plan 1 doc, final section): UI must label `houseEdge()` as a model estimate; `discardCount()` on Shoe; additive `hole-revealed` event; rules editor must not advertise no-peek as ENHC; UI must not allow side-bet stakes for bets disabled in rules; event-name mapping documented here.

**Out of scope (Plan 3):** Advisor/Count panels, history/analysis/learn/drills pages, study mode, fun-layer polish beyond bot quips, Playwright E2E, a11y audit pass, deploy.

---

## Architecture Notes (read first)

### Event → UI mapping (the contract)

| Engine event | UI consumer |
|---|---|
| `phase` | `useGameLoop.phase` ref; table.vue switches control surfaces |
| `card-dealt` | presentation queue → cards appear with pacing; `to` routes to dealer row or spot/hand |
| `count-visible-card` | ignored in Plan 2 (Plan 3's `useCounting` subscribes) |
| `announce` | gameLoop announcement feed → aria-live region (rendered by DealerArea) + on-felt line |
| `peek-result` | dealer area peek animation/text |
| `hole-revealed` (new, Task 3) | flips the hole card in the dealer row |
| `hand-settled` | outcome flash on the spot; bankroll/session/history bookkeeping in store |
| `side-bet-settled` | side-bet circle result chip + bookkeeping |
| `insurance-settled` | bookkeeping + announcement |
| `shuffle` | shuffle interstitial (casino mode) / toast (quick mode) |

Spec's `dealer-announces` ⇒ engine `announce`. Spec's `bot-quip` is synthesized in the UI (SpotSeat picks a persona quip when its hand settles) — the engine stays silent on flavor.

### Presented state vs engine state

`useGameLoop` applies queued events to a **view model** (dealer cards shown, per-spot hands shown, banners). Casino mode: one event per tick with per-type delays × a speed preset (`relaxed/normal/brisk`), `prefers-reduced-motion` collapses delays to 0. Quick mode: the queue flushes synchronously. Engine state (`game.state`-ish getters: `game.spots`, `game.phase`, `game.legalFor`) is used directly for *amounts, legality, and button enablement* — never for card visibility, so a paced deal can't leak the hole card or future cards.

**Input gating:** action buttons are disabled while the presentation queue is non-empty (you can't act on cards you haven't "seen"). Restore-from-snapshot fast-forwards: presented state is rebuilt directly from engine state, no replay.

### Money & bankroll

All cents. Bankroll changes ONLY at settlement events (`hand-settled`/`side-bet-settled`/`insurance-settled` nets). "In play" display = Σ current `hand.bet` + side stakes + insurance, computed from engine state. Busted = bankroll < `rules.minBet` at betting phase → busted modal → setup.

### File map (this plan)

| File | Responsibility |
|---|---|
| `app/utils/engine/rng.ts` (+) | `statefulMulberry32` — serializable RNG state |
| `app/utils/engine/shoe.ts` (+) | `discardCount()`, `snapshot()`/`Shoe.restore()` |
| `app/utils/engine/round.ts` (+) | `hole-revealed` event; `snapshot()`/`BlackjackGame.restore()` |
| `app/utils/engine/serializeTypes.ts` | Snapshot interfaces (versioned) |
| `app/stores/useBlackjackStore.ts` | Settings, bankroll, session stats, capped history, persistence v1 |
| `app/composables/useGameLoop.ts` | Game instance, event pacing, view model, bot driver, announcer feed (spec's `useAnnouncer` folded in; DealerArea renders the aria-live region) |
| `app/components/cards/PlayingCard.vue` | Ported from holdem (3D flip) |
| `app/components/table/ChipStack.vue`, `BetCircle.vue` | Chips and bet circles |
| `app/components/table/DealerArea.vue` | Shoe + cut card, dealer row, discard tray, announcements |
| `app/components/table/SpotSeat.vue` | Hands, totals, outcome flash, bot identity + quip |
| `app/components/table/BlackjackTable.vue` | SVG felt arc, spots layout, rules-driven felt text |
| `app/components/table/ActionBar.vue` | Bet controls, action buttons, insurance bar |
| `app/components/setup/PresetPicker.vue`, `RulesEditor.vue`, `BotPicker.vue` | Setup widgets |
| `app/layouts/default.vue` (replace) | Craps-style status bars + leave confirm |
| `app/pages/index.vue` (replace) | Setup screen |
| `app/pages/table.vue` | The game |
| `test/nuxt/*.test.ts`, `test/unit/engine/serialize.test.ts` | Tests |

### Conventions for every task

- TDD where a pure seam exists (engine additions, store, gameLoop logic); component tests follow implementation within the same task (red-green on behavior, not markup details).
- Commit messages exactly as given; **never add AI/Co-Authored-By trailers** (user convention).
- After every task: `pnpm test && pnpm lint && pnpm typecheck` clean before commit.
- Engine purity stands: nothing under `app/utils/engine/` may import Vue/Nuxt.

---

### Task 1: Stateful RNG + shoe serialization & discard count

**Files:**
- Modify: `app/utils/engine/rng.ts` (append)
- Modify: `app/utils/engine/shoe.ts`
- Create: `app/utils/engine/serializeTypes.ts`
- Test: `test/unit/engine/serialize.test.ts` (new), `test/unit/engine/shoe.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/engine/shoe.test.ts` (inside `describe('Shoe', ...)`):

```ts
  it('exposes discardCount for the tray UI (rack + burned)', () => {
    const shoe = makeShoe(6)
    expect(shoe.discardCount()).toBe(1) // burn card
    const drawn = Array.from({ length: 10 }, () => shoe.draw())
    shoe.discard(drawn)
    expect(shoe.discardCount()).toBe(11)
  })

  it('round-trips through snapshot/restore with identical continuation', () => {
    const a = makeShoe(2, 0.75, 123)
    for (let i = 0; i < 20; i++) a.draw()
    const snap = a.snapshot()
    const b = Shoe.restore(snap, mulberry32(999)) // restore takes a fresh RNG for FUTURE shuffles
    expect(b.cardsRemaining()).toBe(a.cardsRemaining())
    expect(b.discardCount()).toBe(a.discardCount())
    expect(b.needsShuffle()).toBe(a.needsShuffle())
    expect(Array.from({ length: 30 }, () => b.draw()))
      .toEqual(Array.from({ length: 30 }, () => a.draw()))
  })
```

Create `test/unit/engine/serialize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { statefulMulberry32 } from '../../../app/utils/engine/rng'

describe('statefulMulberry32', () => {
  it('matches mulberry32 output for the same seed', async () => {
    const { mulberry32 } = await import('../../../app/utils/engine/rng')
    const plain = mulberry32(42)
    const stateful = statefulMulberry32(42)
    for (let i = 0; i < 100; i++) expect(stateful.next()).toBe(plain())
  })

  it('resumes exactly from a captured state', () => {
    const a = statefulMulberry32(7)
    for (let i = 0; i < 10; i++) a.next()
    const resumed = statefulMulberry32(a.state())
    const tailA = Array.from({ length: 20 }, () => a.next())
    const tailB = Array.from({ length: 20 }, () => resumed.next())
    expect(tailB).toEqual(tailA)
  })
})
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm test:unit test/unit/engine/serialize.test.ts test/unit/engine/shoe.test.ts`
Expected: FAIL — `statefulMulberry32`, `discardCount`, `snapshot`, `Shoe.restore` missing.

- [ ] **Step 3: Implement**

Append to `app/utils/engine/rng.ts`:

```ts
export interface StatefulRNG {
  next: RNG
  /** Current internal mulberry32 state — pass back to statefulMulberry32 to resume. */
  state(): number
}

/** Mulberry32 with extractable state (seed and state share the same uint32 domain). */
export function statefulMulberry32(seedOrState: number): StatefulRNG {
  let a = seedOrState >>> 0
  return {
    next: () => {
      a = (a + 0x6D2B79F5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    state: () => a
  }
}
```

Note: `statefulMulberry32(seed).next` and `mulberry32(seed)` are intentionally the same algorithm — the matching-output test pins that.

Create `app/utils/engine/serializeTypes.ts`:

```ts
import type { Card } from './cards'

/** Versioned snapshot shapes for mid-round persistence (spec §9-10). */
export const SNAPSHOT_VERSION = 1

export interface ShoeSnapshot {
  v: typeof SNAPSHOT_VERSION
  decks: number
  penetration: number
  cards: Card[]
  rack: Card[]
  burned: Card[]
  reached: boolean
}
```

Modify `app/utils/engine/shoe.ts` — add import, two methods, and a static restore (constructor stays unchanged):

```ts
import type { ShoeSnapshot } from './serializeTypes'
import { SNAPSHOT_VERSION } from './serializeTypes'
```

Inside the class:

```ts
  /** Cards in the discard tray (rack + burned) — drives the visibly-filling tray UI. */
  discardCount(): number {
    return this.rack.length + this.burned.length
  }

  snapshot(): ShoeSnapshot {
    return {
      v: SNAPSHOT_VERSION,
      decks: this.decks,
      penetration: this.penetration,
      cards: this.cards.map(c => ({ ...c })),
      rack: this.rack.map(c => ({ ...c })),
      burned: this.burned.map(c => ({ ...c })),
      reached: this.reached
    }
  }

  /** Rebuild a shoe mid-state. The provided RNG drives FUTURE shuffles only. */
  static restore(snap: ShoeSnapshot, rng: RNG): Shoe {
    const shoe = new Shoe(snap.decks as 1 | 2 | 4 | 6 | 8, snap.penetration, rng)
    shoe.cards = snap.cards.map(c => ({ ...c }))
    shoe.rack = snap.rack.map(c => ({ ...c }))
    shoe.burned = snap.burned.map(c => ({ ...c }))
    shoe.reached = snap.reached
    shoe.cutIndex = Math.floor(snap.decks * 52 * snap.penetration)
    return shoe
  }
```

(`decks`/`penetration` are `private readonly` constructor params — confirm they're declared as `private readonly decks: number` so the cast above isn't needed; adjust typing minimally if the constructor uses the literal-union type. Static methods may assign private fields of their own class — TypeScript allows this.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:unit test/unit/engine/serialize.test.ts test/unit/engine/shoe.test.ts`
Expected: PASS (shoe file now 10 tests, serialize file 2). Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/rng.ts app/utils/engine/shoe.ts app/utils/engine/serializeTypes.ts test/unit/engine/serialize.test.ts test/unit/engine/shoe.test.ts
git commit -m "feat(engine): add stateful RNG, shoe snapshot/restore, and discardCount"
```

---

### Task 2: Game snapshot/restore (mid-round persistence core)

**Files:**
- Modify: `app/utils/engine/round.ts`, `app/utils/engine/serializeTypes.ts`
- Test: `test/unit/engine/serialize.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append to `serialize.test.ts`)

```ts
import { BlackjackGame } from '../../../app/utils/engine/round'
import type { GameSnapshot } from '../../../app/utils/engine/serializeTypes'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'

const RULES = (() => {
  const r = cloneRules(PRESETS.MA_205CMR!)
  r.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return r
})()

describe('BlackjackGame snapshot/restore', () => {
  it('restores a mid-round game that continues identically to the uninterrupted original', () => {
    const a = new BlackjackGame(RULES, { seed: 31415 })
    a.beginRound([{ spotId: 0, mainBet: 1000 }])
    if (a.phase === 'insurance') {
      a.insuranceDecision(0, null)
      a.finishInsurance()
    }
    const snap: GameSnapshot = a.snapshot()
    const b = BlackjackGame.restore(snap)

    expect(b.phase).toBe(a.phase)
    expect(b.dealerUp).toEqual(a.dealerUp)
    expect(b.spots).toEqual(a.spots)
    expect(b.holeRevealed).toBe(a.holeRevealed)

    // play both to completion with the same actions; outcomes and shoe draws must match
    const play = (g: BlackjackGame) => {
      while (g.phase === 'playerTurns') {
        const legal = g.legalFor(0)
        g.act(0, legal.includes('stand') ? 'stand' : legal[0]!)
      }
      return g.spots.map(s => s.hands.map(h => ({ net: h.netResult, outcome: h.outcome })))
    }
    expect(play(b)).toEqual(play(a))
    expect(b.shoe.cardsRemaining()).toBe(a.shoe.cardsRemaining())

    // and the NEXT full round (which may shuffle) must also match — proves RNG state survived
    const next = (g: BlackjackGame) => {
      g.beginRound([{ spotId: 0, mainBet: 1000 }])
      if (g.phase === 'insurance') {
        g.insuranceDecision(0, null)
        g.finishInsurance()
      }
      while (g.phase === 'playerTurns') g.act(0, g.legalFor(0).includes('stand') ? 'stand' : g.legalFor(0)[0]!)
      return g.spots.map(s => s.hands.map(h => h.netResult))
    }
    expect(next(b)).toEqual(next(a))
  })

  it('snapshot is JSON-safe (structured-clone/parse round trip)', () => {
    const g = new BlackjackGame(RULES, { seed: 99 })
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    if (g.phase === 'insurance') {
      g.insuranceDecision(0, null)
      g.finishInsurance()
    }
    const snap = JSON.parse(JSON.stringify(g.snapshot())) as GameSnapshot
    const r = BlackjackGame.restore(snap)
    expect(r.phase).toBe(g.phase)
    expect(r.spots).toEqual(g.spots)
  })

  it('rejects snapshots with a wrong version', () => {
    const g = new BlackjackGame(RULES, { seed: 1 })
    const snap = g.snapshot()
    expect(() => BlackjackGame.restore({ ...snap, v: 999 } as unknown as GameSnapshot)).toThrow(/version/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit test/unit/engine/serialize.test.ts`
Expected: FAIL — `snapshot`/`restore` missing.

- [ ] **Step 3: Implement**

Append to `serializeTypes.ts`:

```ts
import type { RuleSet } from './rules'
import type { Phase, SpotState } from './round'

export interface GameSnapshot {
  v: typeof SNAPSHOT_VERSION
  rules: RuleSet
  rngState: number
  shoe: ShoeSnapshot
  phase: Phase
  spots: SpotState[]
  dealerCards: Card[]
  holeRevealed: boolean
}
```

In `round.ts`:
1. Switch the internal RNG to the stateful one. In the constructor replace the `mulberry32` usage:

```ts
import { statefulMulberry32, randomSeed } from './rng'
import type { StatefulRNG } from './rng'
```

```ts
  private readonly rng: StatefulRNG

  constructor(public readonly rules: Readonly<RuleSet>, opts: { seed?: number, rng?: RNG, shoe?: CardSource } = {}) {
    this.rng = statefulMulberry32(opts.seed ?? randomSeed())
    const drive: RNG = opts.rng ?? this.rng.next
    this.shoe = opts.shoe ?? new Shoe(this.rules.decks, this.rules.penetration, drive)
  }
```

(Existing behavior preserved: a caller-supplied `rng` or `shoe` still wins; `seed` paths now flow through the stateful wrapper — same algorithm, same streams, the Task 1 pin test guarantees it. The simulation results are unchanged because `{ seed }` construction produces the identical sequence.)

2. Add snapshot/restore:

```ts
import type { GameSnapshot } from './serializeTypes'
import { SNAPSHOT_VERSION } from './serializeTypes'
import { cloneRules } from './rules'
```

```ts
  /** Serializable mid-round state. Listeners are NOT serialized — re-subscribe after restore. */
  snapshot(): GameSnapshot {
    if (!(this.shoe instanceof Shoe)) throw new Error('snapshot requires a real Shoe (test CardSources are not serializable)')
    return JSON.parse(JSON.stringify({
      v: SNAPSHOT_VERSION,
      rules: this.rules,
      rngState: this.rng.state(),
      shoe: this.shoe.snapshot(),
      phase: this.phase,
      spots: this.spots,
      dealerCards: this.dealerCards,
      holeRevealed: this.holeRevealed
    })) as GameSnapshot
  }

  static restore(snap: GameSnapshot): BlackjackGame {
    if (snap.v !== SNAPSHOT_VERSION) throw new Error(`unsupported snapshot version: ${snap.v}`)
    const rules = cloneRules(snap.rules)
    const game = new BlackjackGame(rules, { seed: snap.rngState })
    // seed path created rng at the captured state; rebuild the shoe from its snapshot
    ;(game as { shoe: CardSource }).shoe = Shoe.restore(snap.shoe, game.rng.next)
    game.phase = snap.phase
    game.spots = JSON.parse(JSON.stringify(snap.spots)) as SpotState[]
    game.dealerCards = snap.dealerCards.map(c => ({ ...c }))
    game.holeRevealed = snap.holeRevealed
    return game
  }
```

Note `readonly shoe` must become assignable for restore: change the field declaration from `readonly shoe: CardSource` to `shoe: CardSource` (public surface otherwise unchanged) OR keep readonly and assign via the constructor — simplest correct route: add a private constructor option `{ restoredShoe?: CardSource }`. Choose ONE and keep the cast-free version; if you keep `readonly`, extend the constructor opts with `shoe` (it already exists!) — so `restore` can do `new BlackjackGame(rules, { seed: snap.rngState, shoe: undefined })` then... it cannot, because the Shoe needs the game's own rng. Resolution: construct the stateful RNG first inside `restore` via a second private static path is over-engineering — **drop `readonly` from `shoe`** and assign directly (`game.shoe = Shoe.restore(snap.shoe, ...)`) using a `// restore-only reassignment` comment. The `rng` field needs a getter for restore: add `private readonly rng` plus expose nothing — `restore` is a static member of the same class, so `game.rng` is accessible. Remove the cast in the listing above accordingly.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:unit` — serialize tests pass; ALL existing tests still pass (especially `simulation.test.ts` — the seed path must produce identical streams; if the sim numbers change, the RNG wiring broke: debug, do not re-tolerance).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/round.ts app/utils/engine/serializeTypes.ts test/unit/engine/serialize.test.ts
git commit -m "feat(engine): add mid-round game snapshot/restore with RNG continuity"
```

---

### Task 3: `hole-revealed` event

**Files:**
- Modify: `app/utils/engine/round.ts`
- Test: `test/unit/engine/round.test.ts` (append)

- [ ] **Step 1: Failing test** (append to the `'BlackjackGame — events'` describe)

```ts
  it('emits hole-revealed exactly once per round, before dealer draws', () => {
    const events: string[] = []
    const g = game([c(10), c(7, 'hearts'), c(6), c(10, 'clubs'), c(5), c(9, 'diamonds')])
    g.on((e) => {
      if (e.type === 'hole-revealed' || e.type === 'card-dealt') events.push(e.type)
    })
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'hit') // 16 + 5 = 21 → auto-stand → dealer turn
    expect(events.filter(e => e === 'hole-revealed')).toHaveLength(1)
    const revealIdx = events.indexOf('hole-revealed')
    const lastDeal = events.lastIndexOf('card-dealt')
    expect(revealIdx).toBeLessThan(lastDeal) // dealer's draw comes after the reveal
  })
```

- [ ] **Step 2:** Run `pnpm test:unit test/unit/engine/round.test.ts` — FAIL (type narrows: `'hole-revealed'` not in union → TS error is the failure mode; that counts).

- [ ] **Step 3: Implement** — add to the `GameEvent` union:

```ts
  | { type: 'hole-revealed', card: Card }
```

and in `revealHole()`, alongside the existing count event:

```ts
    if (hole) {
      this.emit({ type: 'hole-revealed', card: hole })
      this.emit({ type: 'count-visible-card', card: hole })
      this.emit({ type: 'announce', text: `Dealer's card — ${handTotal(this.dealerCards).total}` })
    }
```

- [ ] **Step 4:** Run round tests (23) + full gates — clean.

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/round.ts test/unit/engine/round.test.ts
git commit -m "feat(engine): emit hole-revealed event for the UI dealer row"
```

---

### Task 4: Session store (`useBlackjackStore`)

**Files:**
- Create: `app/stores/useBlackjackStore.ts`
- Test: `test/nuxt/store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBlackjackStore, STORAGE_KEY } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

describe('useBlackjackStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  function started() {
    const store = useBlackjackStore()
    store.initSession({
      rules: cloneRules(PRESETS.VEGAS_STRIP_6D!),
      mode: 'quick',
      speed: 'normal',
      flair: true,
      botIds: ['bea']
    }, 100_000)
    return store
  }

  it('initSession sets bankroll, settings, and an active session', () => {
    const store = started()
    expect(store.bankroll).toBe(100_000)
    expect(store.sessionActive).toBe(true)
    expect(store.settings!.botIds).toEqual(['bea'])
  })

  it('applyNet moves the bankroll and accumulates session stats', () => {
    const store = started()
    store.applyNet('hands', 1500)
    store.applyNet('side', -500)
    store.applyNet('insurance', -250)
    expect(store.bankroll).toBe(100_750)
    expect(store.session.sideBetNet).toBe(-500)
    expect(store.session.insuranceNet).toBe(-250)
  })

  it('recordRound caps history at 500, newest kept', () => {
    const store = started()
    for (let i = 1; i <= 510; i++) {
      store.recordRound({
        round: i, at: i, visibleCards: [],
        dealer: { cards: [], total: 17, blackjack: false, busted: false },
        spots: []
      })
    }
    expect(store.history).toHaveLength(500)
    expect(store.history[0]!.round).toBe(11)
    expect(store.history[499]!.round).toBe(510)
  })

  it('persists and restores a session round-trip', () => {
    const store = started()
    store.applyNet('hands', 2000)
    store.persist()

    setActivePinia(createPinia())
    const fresh = useBlackjackStore()
    expect(fresh.restore()).toBe(true)
    expect(fresh.bankroll).toBe(102_000)
    expect(fresh.sessionActive).toBe(true)
    expect(fresh.settings!.rules.name).toBe('Vegas Strip 6-deck')
  })

  it('rejects corrupt payloads and clears the key', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const store = useBlackjackStore()
    expect(store.restore()).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('rejects wrong-version payloads', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, bankroll: 5 }))
    const store = useBlackjackStore()
    expect(store.restore()).toBe(false)
  })

  it('survives storage quota failures without crashing', () => {
    const store = started()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota')
    })
    expect(() => store.persist()).not.toThrow()
    expect(store.storageAvailable).toBe(false)
    spy.mockRestore()
  })

  it('clearAll wipes state and storage', () => {
    const store = started()
    store.persist()
    store.clearAll()
    expect(store.sessionActive).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
```

- [ ] **Step 2:** Run `pnpm test:nuxt test/nuxt/store.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `app/stores/useBlackjackStore.ts`:

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RuleSet } from '../utils/engine/rules'
import type { PersonaId } from '../utils/engine/bots'
import type { GameSnapshot } from '../utils/engine/serializeTypes'

export const STORAGE_KEY = 'blackjack-session-v1'
const STORAGE_VERSION = 1
const HISTORY_CAP = 500

export type PlayMode = 'casino' | 'quick'
export type PlaySpeed = 'relaxed' | 'normal' | 'brisk'

export interface SessionSettings {
  rules: RuleSet
  mode: PlayMode
  speed: PlaySpeed
  flair: boolean
  botIds: PersonaId[]
}

export interface RoundRecord {
  round: number
  at: number // epoch ms
  dealer: { cards: string[], total: number, blackjack: boolean, busted: boolean }
  spots: Array<{
    occupant: 'hero' | PersonaId
    hands: Array<{ cards: string[], bet: number, outcome: string, net: number, doubled: boolean, fromSplit: boolean }>
    sideBets: Array<{ name: string, stake: number, net: number, label: string }>
    insuranceNet: number
  }>
  /** Face-up cards in dealt order — Plan 3 derives running counts from this. */
  visibleCards: string[]
}

export interface SessionStats {
  roundsPlayed: number
  handsWon: number
  handsLost: number
  handsPushed: number
  blackjacks: number
  totalWagered: number
  totalReturned: number
  sideBetNet: number
  insuranceNet: number
  startedAt: number
}

function freshStats(): SessionStats {
  return {
    roundsPlayed: 0, handsWon: 0, handsLost: 0, handsPushed: 0, blackjacks: 0,
    totalWagered: 0, totalReturned: 0, sideBetNet: 0, insuranceNet: 0, startedAt: Date.now()
  }
}

export const useBlackjackStore = defineStore('blackjack', () => {
  const settings = ref<SessionSettings | null>(null)
  const bankroll = ref(0)
  const session = ref<SessionStats>(freshStats())
  const history = ref<RoundRecord[]>([])
  const botStates = ref<Partial<Record<PersonaId, { bet: number, last: 'win' | 'lose' | 'push' | null }>>>({})
  const roundSnapshot = ref<GameSnapshot | null>(null)
  const sessionActive = ref(false)
  const storageAvailable = ref(true)

  const busted = computed(() =>
    sessionActive.value && settings.value !== null && bankroll.value < settings.value.rules.minBet)

  function initSession(s: SessionSettings, startingBankroll: number): void {
    settings.value = s
    bankroll.value = startingBankroll
    session.value = freshStats()
    history.value = []
    botStates.value = Object.fromEntries(s.botIds.map(id => [id, { bet: s.rules.minBet, last: null }]))
    roundSnapshot.value = null
    sessionActive.value = true
    persist()
  }

  /** Settlement bookkeeping — the ONLY way money moves (Architecture Notes). */
  function applyNet(kind: 'hands' | 'side' | 'insurance', net: number): void {
    bankroll.value += net
    if (kind === 'side') session.value.sideBetNet += net
    if (kind === 'insurance') session.value.insuranceNet += net
  }

  function recordRound(record: RoundRecord): void {
    history.value.push(record)
    if (history.value.length > HISTORY_CAP) history.value.splice(0, history.value.length - HISTORY_CAP)
    session.value.roundsPlayed++
    for (const spot of record.spots) {
      if (spot.occupant !== 'hero') continue
      for (const hand of spot.hands) {
        session.value.totalWagered += hand.bet
        session.value.totalReturned += hand.bet + hand.net
        if (hand.outcome === 'blackjack') session.value.blackjacks++
        if (hand.outcome === 'win' || hand.outcome === 'blackjack') session.value.handsWon++
        else if (hand.outcome === 'push') session.value.handsPushed++
        else session.value.handsLost++
      }
    }
  }

  function saveSnapshot(snap: GameSnapshot | null): void {
    roundSnapshot.value = snap
    persist()
  }

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORAGE_VERSION,
        settings: settings.value,
        bankroll: bankroll.value,
        session: session.value,
        history: history.value,
        botStates: botStates.value,
        roundSnapshot: roundSnapshot.value,
        sessionActive: sessionActive.value,
        meta: { updatedAt: Date.now() }
      }))
      storageAvailable.value = true
    } catch {
      storageAvailable.value = false
    }
  }

  /** Validate + load. Returns false (and clears the key) on anything suspect. */
  function restore(): boolean {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(STORAGE_KEY)
    } catch {
      storageAvailable.value = false
      return false
    }
    if (!raw) return false
    try {
      const data = JSON.parse(raw) as Record<string, unknown>
      if (data.version !== STORAGE_VERSION) throw new Error('version mismatch')
      if (typeof data.bankroll !== 'number' || !Number.isFinite(data.bankroll)) throw new Error('bad bankroll')
      if (!Array.isArray(data.history)) throw new Error('bad history')
      settings.value = (data.settings ?? null) as SessionSettings | null
      bankroll.value = data.bankroll
      session.value = { ...freshStats(), ...(data.session as Partial<SessionStats> | undefined) }
      history.value = (data.history as RoundRecord[]).slice(-HISTORY_CAP)
      botStates.value = (data.botStates ?? {}) as typeof botStates.value
      roundSnapshot.value = (data.roundSnapshot ?? null) as GameSnapshot | null
      sessionActive.value = data.sessionActive === true && settings.value !== null
      return sessionActive.value
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch { /* storage gone entirely */ }
      return false
    }
  }

  function clearAll(): void {
    settings.value = null
    bankroll.value = 0
    session.value = freshStats()
    history.value = []
    botStates.value = {}
    roundSnapshot.value = null
    sessionActive.value = false
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }

  return {
    settings, bankroll, session, history, botStates, roundSnapshot,
    sessionActive, storageAvailable, busted,
    initSession, applyNet, recordRound, saveSnapshot, persist, restore, clearAll
  }
})
```

- [ ] **Step 4:** Run `pnpm test:nuxt test/nuxt/store.test.ts` — PASS (8 tests). Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/stores/useBlackjackStore.ts test/nuxt/store.test.ts
git commit -m "feat(ui): add session store with versioned persistence and history cap"
```

---

### Task 5: Game loop composable (pacing, bots, bookkeeping, announcer)

**Files:**
- Create: `app/composables/useGameLoop.ts`
- Test: `test/nuxt/gameLoop.test.ts`

The largest UI task. Read the Architecture Notes first. Public API:

```ts
const {
  phase, dealerRow, spotsView, announcements, liveText,   // presented state (refs)
  queueIdle, canAct, legalActions, heroSpotId, inPlay,     // derived
  startSession, restoreSession, beginRound, act, heroInsurance, endRound, endSession
} = useGameLoop()
```

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import type { SessionSettings } from '../../app/stores/useBlackjackStore'

function settings(overrides: Partial<SessionSettings> = {}): SessionSettings {
  const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return { rules, mode: 'quick', speed: 'normal', flair: true, botIds: [], ...overrides }
}

describe('useGameLoop (quick mode)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    __resetGameLoopForTests()
  })

  it('plays a full heads-up round synchronously in quick mode', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7) // fixed seed
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    while (loop.phase.value === 'playerTurns') {
      loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
    }
    expect(loop.phase.value).toBe('complete')
    expect(loop.queueIdle.value).toBe(true)
    expect(loop.dealerRow.value.length).toBeGreaterThanOrEqual(2)
    expect(loop.dealerRow.value.every(c => c.faceUp)).toBe(true) // hole revealed by completion
    expect(store.history).toHaveLength(1)
    expect(store.session.roundsPlayed).toBe(1)
    // bankroll moved by exactly the round's recorded nets
    const rec = store.history[0]!
    const heroNet = rec.spots.find(s => s.occupant === 'hero')!
    const total = heroNet.hands.reduce((s, h) => s + h.net, 0)
      + heroNet.sideBets.reduce((s, b) => s + b.net, 0) + heroNet.insuranceNet
    expect(store.bankroll).toBe(100_000 + total)
  })

  it('drives bot spots automatically and records their hands', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ botIds: ['bea', 'nancy'] }), 100_000, 11)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    while (loop.phase.value === 'playerTurns') {
      // hero acts; bots act automatically around the hero
      loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
    }
    expect(loop.phase.value).toBe('complete')
    const rec = store.history[0]!
    expect(rec.spots.map(s => s.occupant).sort()).toEqual(['bea', 'hero', 'nancy'])
    // bots do not touch the hero bankroll
    const heroOnly = rec.spots.find(s => s.occupant === 'hero')!
    const heroTotal = heroOnly.hands.reduce((s, h) => s + h.net, 0)
    expect(store.bankroll).toBe(100_000 + heroTotal)
  })

  it('blocks act() while the presentation queue is non-empty (casino mode)', async () => {
    vi.useFakeTimers()
    const loop = useGameLoop()
    loop.startSession(settings({ mode: 'casino' }), 100_000, 7)
    loop.beginRound(1000, {})
    expect(loop.queueIdle.value).toBe(false)
    expect(loop.canAct.value).toBe(false)
    expect(() => loop.act('stand')).toThrow()
    await vi.runAllTimersAsync()
    expect(loop.queueIdle.value).toBe(true)
    vi.useRealTimers()
  })

  it('saves a mid-round snapshot and restores it into an identical table', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    expect(loop.phase.value).toBe('playerTurns')
    expect(store.roundSnapshot).not.toBeNull()
    const heroCards = loop.spotsView.value.find(s => s.occupant === 'hero')!.hands[0]!.cards.length

    __resetGameLoopForTests() // simulate refresh: module state gone, store survives
    const loop2 = useGameLoop()
    expect(loop2.restoreSession()).toBe(true)
    expect(loop2.phase.value).toBe('playerTurns')
    expect(loop2.spotsView.value.find(s => s.occupant === 'hero')!.hands[0]!.cards.length).toBe(heroCards)
    while (loop2.phase.value === 'playerTurns') {
      loop2.act(loop2.legalActions.value.includes('stand') ? 'stand' : loop2.legalActions.value[0]!)
    }
    expect(loop2.phase.value).toBe('complete')
  })

  it('announcements feed the live region', () => {
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    loop.beginRound(1000, {})
    expect(loop.announcements.value.length).toBeGreaterThan(0)
    expect(loop.liveText.value.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2:** Run `pnpm test:nuxt test/nuxt/gameLoop.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `app/composables/useGameLoop.ts`:

```ts
import { computed, ref } from 'vue'
import { BlackjackGame } from '../utils/engine/round'
import type { Action, PlayHand } from '../utils/engine/hand'
import type { GameEvent, Phase, SpotBet, SpotState, SideBetKind } from '../utils/engine/round'
import type { Card } from '../utils/engine/cards'
import { displayCard } from '../utils/engine/cards'
import { handTotal, isBust, isBlackjack } from '../utils/engine/hand'
import { PERSONAS, decideFor } from '../utils/engine/bots'
import type { PersonaId } from '../utils/engine/bots'
import { mulberry32, randomSeed } from '../utils/engine/rng'
import { useBlackjackStore } from '../stores/useBlackjackStore'
import type { RoundRecord } from '../stores/useBlackjackStore'

export interface ShownCard {
  card: Card
  faceUp: boolean
}

export interface HandView {
  cards: Card[]
  bet: number
  doubled: boolean
  fromSplit: boolean
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' | null
  net: number
}

export interface SpotView {
  spotId: number
  occupant: 'hero' | PersonaId
  hands: HandView[]
  activeHandIndex: number
  sideResults: Array<{ name: string, label: string, net: number }>
  quip: string | null
}

interface Announcement {
  id: number
  text: string
}

// ── module state (ssr: false — client singleton) ─────────────────────────────
let game: BlackjackGame | null = null
let unsubscribe: (() => void) | null = null
let roundCounter = 0
let pumping = false
let visibleThisRound: string[] = []
let quipRng = mulberry32(randomSeed())
const eventQueue: GameEvent[] = []

const phase = ref<Phase>('betting')
const dealerRow = ref<ShownCard[]>([])
const spotsView = ref<SpotView[]>([])
const announcements = ref<Announcement[]>([])
const liveText = ref('')
const queueIdle = ref(true)
let announceId = 0

const DELAY_BASE: Record<string, number> = {
  'card-dealt': 380, 'announce': 550, 'phase': 200, 'hand-settled': 550,
  'side-bet-settled': 400, 'insurance-settled': 400, 'peek-result': 750,
  'hole-revealed': 500, 'shuffle': 1400, 'count-visible-card': 0
}
const SPEED_FACTOR = { relaxed: 1.3, normal: 1, brisk: 0.45 } as const

function delayFor(e: GameEvent): number {
  const store = useBlackjackStore()
  const s = store.settings
  if (!s || s.mode === 'quick') return 0
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0
  return Math.round((DELAY_BASE[e.type] ?? 0) * SPEED_FACTOR[s.speed])
}

export function __resetGameLoopForTests(): void {
  unsubscribe?.()
  game = null
  unsubscribe = null
  roundCounter = 0
  pumping = false
  visibleThisRound = []
  eventQueue.length = 0
  phase.value = 'betting'
  dealerRow.value = []
  spotsView.value = []
  announcements.value = []
  liveText.value = ''
  queueIdle.value = true
}

// ── presentation ──────────────────────────────────────────────────────────────
function spotViewFor(spotId: number): SpotView | undefined {
  return spotsView.value.find(s => s.spotId === spotId)
}

function syncAmountsFromEngine(): void {
  if (!game) return
  for (const spot of game.spots) {
    const view = spotViewFor(spot.spotId)
    if (!view) continue
    view.activeHandIndex = spot.activeHandIndex
    spot.hands.forEach((hand, i) => {
      const hv = view.hands[i]
      if (hv) {
        hv.bet = hand.bet
        hv.doubled = hand.doubled
        hv.fromSplit = hand.fromSplit
      }
    })
  }
}

function applyEvent(e: GameEvent): void {
  if (!game) return
  switch (e.type) {
    case 'phase':
      phase.value = e.phase
      break
    case 'shuffle':
      pushAnnouncement('Shuffling the shoe')
      break
    case 'card-dealt': {
      if (e.to === 'dealer-up' || e.to === 'dealer-hole' || e.to === 'dealer-draw') {
        dealerRow.value.push({ card: e.card, faceUp: e.faceUp })
      } else {
        const view = spotViewFor(e.to.spotId)
        if (view) {
          // splits create hands lazily in the view
          while (view.hands.length <= e.to.handIndex) {
            view.hands.push({ cards: [], bet: 0, doubled: false, fromSplit: true, outcome: null, net: 0 })
          }
          // a split moves one card into a NEW hand: engine truth wins — rebuild card arrays lazily
          view.hands[e.to.handIndex]!.cards.push(e.card)
        }
      }
      syncAmountsFromEngine()
      break
    }
    case 'hole-revealed': {
      const hole = dealerRow.value[1]
      if (hole) hole.faceUp = true
      break
    }
    case 'announce':
      pushAnnouncement(e.text)
      break
    case 'peek-result':
      pushAnnouncement(e.blackjack ? 'Dealer has blackjack' : 'Dealer checks… no blackjack')
      break
    case 'hand-settled': {
      const view = spotViewFor(e.spotId)
      const hv = view?.hands[e.handIndex]
      if (view && hv) {
        hv.outcome = e.outcome
        hv.net = e.net
        if (view.occupant !== 'hero') view.quip = pickQuip(view.occupant, e.outcome)
      }
      bookkeepHand(e)
      break
    }
    case 'side-bet-settled': {
      const view = spotViewFor(e.spotId)
      view?.sideResults.push({ name: e.result.name, label: e.result.label, net: e.net })
      bookkeepSide(e)
      break
    }
    case 'insurance-settled':
      bookkeepInsurance(e)
      break
    case 'count-visible-card':
      visibleThisRound.push(displayCard(e.card))
      break
  }
}

function pushAnnouncement(text: string): void {
  announcements.value.push({ id: ++announceId, text })
  if (announcements.value.length > 4) announcements.value.shift()
  liveText.value = text
}

function pickQuip(id: PersonaId, outcome: string): string {
  const persona = PERSONAS.find(p => p.id === id)!
  const category = outcome === 'blackjack' ? 'blackjack' : outcome === 'win' ? 'win' : 'lose'
  const lines = persona.quips[category]
  return lines[Math.floor(quipRng() * lines.length)]!
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  queueIdle.value = false
  while (eventQueue.length > 0) {
    const e = eventQueue.shift()!
    applyEvent(e)
    const ms = delayFor(e)
    if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms))
  }
  pumping = false
  queueIdle.value = true
  afterQueueDrained()
}

// ── hero/bot orchestration ───────────────────────────────────────────────────
function heroSpot(): number {
  const store = useBlackjackStore()
  const spots = store.settings?.rules.spots ?? 7
  return Math.floor(spots / 2)
}

function botSpotAssignments(): Array<{ spotId: number, id: PersonaId }> {
  const store = useBlackjackStore()
  if (!store.settings) return []
  const hero = heroSpot()
  const slots: number[] = []
  for (let offset = 1; slots.length < store.settings.botIds.length; offset++) {
    if (hero - offset >= 0) slots.push(hero - offset)
    if (slots.length < store.settings.botIds.length && hero + offset < store.settings.rules.spots) {
      slots.push(hero + offset)
    }
  }
  return store.settings.botIds.map((id, i) => ({ spotId: slots[i]!, id }))
}

function afterQueueDrained(): void {
  if (!game) return
  const store = useBlackjackStore()
  if (game.phase === 'insurance') {
    // bots decide instantly; hero is prompted by the UI
    for (const { spotId, id } of botSpotAssignments()) {
      const persona = PERSONAS.find(p => p.id === id)!
      const spot = game.spots.find(s => s.spotId === spotId)
      if (!spot) continue
      if (persona.takesInsurance) {
        const hand = spot.hands[0]!
        const evenMoneyOk = store.settings!.rules.evenMoneyOffered && isBlackjack(hand.cards, false)
        game.insuranceDecision(spotId, evenMoneyOk ? 'even-money' : Math.floor(hand.bet / 2))
      } else {
        game.insuranceDecision(spotId, null)
      }
    }
    return // waiting on hero
  }
  if (game.phase === 'playerTurns') {
    const bots = botSpotAssignments()
    // act for the first pending spot in deal order; stop and wait if it's the hero
    for (const spot of game.spots) {
      const pending = spot.hands.some(h => !h.resolved && h.outcome === null)
      if (!pending) continue
      const bot = bots.find(b => b.spotId === spot.spotId)
      if (!bot) return // hero's turn — wait for input
      const hand = spot.hands[spot.activeHandIndex]!
      const action = decideFor(bot.id, hand, spot.hands.length, game.dealerUp!, store.settings!.rules)
      game.act(spot.spotId, action)
      void pump()
      return
    }
  }
  if (game.phase === 'complete') {
    finalizeRound()
  } else if (game.phase === 'playerTurns' || game.phase === 'insurance') {
    snapshotToStore()
  }
}

// ── bookkeeping ──────────────────────────────────────────────────────────────
function bookkeepHand(e: GameEvent & { type: 'hand-settled' }): void {
  const store = useBlackjackStore()
  if (e.spotId === heroSpot()) store.applyNet('hands', e.net)
}

function bookkeepSide(e: GameEvent & { type: 'side-bet-settled' }): void {
  const store = useBlackjackStore()
  if (e.spotId === heroSpot()) store.applyNet('side', e.net)
}

function bookkeepInsurance(e: GameEvent & { type: 'insurance-settled' }): void {
  const store = useBlackjackStore()
  if (e.spotId === heroSpot()) store.applyNet('insurance', e.net)
}

function finalizeRound(): void {
  if (!game) return
  const store = useBlackjackStore()
  const bots = botSpotAssignments()
  const record: RoundRecord = {
    round: ++roundCounter,
    at: Date.now(),
    dealer: {
      cards: game.dealerCards.map(displayCard),
      total: handTotal(game.dealerCards).total,
      blackjack: isBlackjack(game.dealerCards, false),
      busted: isBust(game.dealerCards)
    },
    spots: game.spots.map((spot: SpotState) => ({
      occupant: spot.spotId === heroSpot() ? 'hero' as const : bots.find(b => b.spotId === spot.spotId)!.id,
      hands: spot.hands.map(h => ({
        cards: h.cards.map(displayCard),
        bet: h.bet,
        outcome: h.outcome ?? 'push',
        net: h.netResult,
        doubled: h.doubled,
        fromSplit: h.fromSplit
      })),
      sideBets: spot.sideBetResults.map(r => ({ name: r.name, stake: r.stake, net: r.net, label: r.label })),
      insuranceNet: spot.insuranceNet
    })),
    visibleCards: visibleThisRound
  }
  store.recordRound(record)
  // bot bet progression
  for (const { spotId, id } of bots) {
    const spot = game.spots.find(s => s.spotId === spotId)
    const state = store.botStates[id]
    if (!spot || !state) continue
    const first = spot.hands[0]!
    const last = first.outcome === 'blackjack' ? 'win' : first.outcome === 'surrender' ? 'lose' : first.outcome ?? 'push'
    const persona = PERSONAS.find(p => p.id === id)!
    state.last = last as 'win' | 'lose' | 'push'
    state.bet = persona.nextBet(state.bet, state.last, store.settings!.rules, quipRng)
  }
  store.saveSnapshot(null)
}

function snapshotToStore(): void {
  if (!game) return
  const store = useBlackjackStore()
  try {
    store.saveSnapshot(game.snapshot())
  } catch { /* snapshot unsupported (test shoe) — skip */ }
}

// ── public api ───────────────────────────────────────────────────────────────
function attach(g: BlackjackGame): void {
  unsubscribe?.()
  game = g
  unsubscribe = g.on((e) => {
    eventQueue.push(e)
  })
}

export function useGameLoop() {
  const store = useBlackjackStore()

  const heroSpotId = computed(() => heroSpot())
  const legalActions = computed<Action[]>(() => {
    if (!game || !queueIdle.value || game.phase !== 'playerTurns') return []
    const spot = game.spots.find(s => s.spotId === heroSpot())
    if (!spot) return []
    const pendingBefore = game.spots.some(s =>
      s.spotId !== spot.spotId
      && game!.spots.indexOf(s) < game!.spots.indexOf(spot)
      && s.hands.some(h => !h.resolved && h.outcome === null))
    if (pendingBefore) return []
    if (!spot.hands.some(h => !h.resolved && h.outcome === null)) return []
    return game.legalFor(spot.spotId)
  })
  const canAct = computed(() => legalActions.value.length > 0)
  const inPlay = computed(() => {
    if (!game || game.phase === 'complete' || game.phase === 'betting') return 0
    const spot = game.spots.find(s => s.spotId === heroSpot())
    if (!spot) return 0
    const stakes = Object.values(spot.sideBets).reduce((s, v) => s + (v ?? 0), 0)
    return spot.hands.reduce((s, h) => s + (h.outcome === null ? h.bet : 0), 0)
      + stakes + (spot.insuranceBet ?? 0)
  })

  function startSession(settings: Parameters<typeof store.initSession>[0], bankroll: number, seed?: number): void {
    store.initSession(settings, bankroll)
    attach(new BlackjackGame(settings.rules, { seed: seed ?? randomSeed() }))
    quipRng = mulberry32(seed ?? randomSeed())
    resetPresentation()
  }

  function restoreSession(): boolean {
    if (!store.sessionActive && !store.restore()) return false
    if (!store.settings) return false
    if (store.roundSnapshot) {
      attach(BlackjackGame.restore(store.roundSnapshot))
      fastForwardPresentation()
    } else {
      attach(new BlackjackGame(store.settings.rules, { seed: randomSeed() }))
      resetPresentation()
    }
    return true
  }

  function resetPresentation(): void {
    eventQueue.length = 0
    dealerRow.value = []
    spotsView.value = []
    announcements.value = []
    phase.value = game?.phase ?? 'betting'
    queueIdle.value = true
  }

  /** After restore: render the full engine state instantly — no replay (Architecture Notes). */
  function fastForwardPresentation(): void {
    if (!game) return
    eventQueue.length = 0
    const bots = botSpotAssignments()
    phase.value = game.phase
    dealerRow.value = game.dealerCards.map((card, i) => ({
      card,
      faceUp: i !== 1 || game!.holeRevealed
    }))
    spotsView.value = game.spots.map(spot => ({
      spotId: spot.spotId,
      occupant: spot.spotId === heroSpot() ? 'hero' as const : (bots.find(b => b.spotId === spot.spotId)?.id ?? 'hero'),
      hands: spot.hands.map(h => ({
        cards: [...h.cards],
        bet: h.bet,
        doubled: h.doubled,
        fromSplit: h.fromSplit,
        outcome: h.outcome,
        net: h.netResult
      })),
      activeHandIndex: spot.activeHandIndex,
      sideResults: spot.sideBetResults.map(r => ({ name: r.name, label: r.label, net: r.net })),
      quip: null
    }))
    queueIdle.value = true
    pushAnnouncement('Table restored — your move')
  }

  function beginRound(heroBet: number, heroSideStakes: Partial<Record<SideBetKind, number>>): void {
    if (!game || !store.settings) throw new Error('no active game')
    visibleThisRound = []
    const bots = botSpotAssignments()
    const bets: SpotBet[] = []
    for (const { spotId, id } of bots) {
      bets.push({ spotId, mainBet: store.botStates[id]?.bet ?? store.settings.rules.minBet })
    }
    bets.push({ spotId: heroSpot(), mainBet: heroBet, sideBets: heroSideStakes })
    bets.sort((a, b) => a.spotId - b.spotId)
    // fresh presentation for the round
    dealerRow.value = []
    spotsView.value = bets.map(b => ({
      spotId: b.spotId,
      occupant: b.spotId === heroSpot() ? 'hero' as const : bots.find(x => x.spotId === b.spotId)!.id,
      hands: [{ cards: [], bet: b.mainBet, doubled: false, fromSplit: false, outcome: null, net: 0 }],
      activeHandIndex: 0,
      sideResults: [],
      quip: null
    }))
    game.beginRound(bets)
    void pump()
  }

  function act(action: Action): void {
    if (!game) throw new Error('no active game')
    if (!canAct.value) throw new Error('cannot act while the table is presenting')
    game.act(heroSpot(), action)
    void pump()
  }

  function heroInsurance(decision: number | 'even-money' | null): void {
    if (!game) throw new Error('no active game')
    game.insuranceDecision(heroSpot(), decision)
    game.finishInsurance()
    void pump()
  }

  function endSession(): void {
    unsubscribe?.()
    game = null
    store.clearAll()
    resetPresentation()
  }

  return {
    phase, dealerRow, spotsView, announcements, liveText, queueIdle,
    canAct, legalActions, heroSpotId, inPlay,
    startSession, restoreSession, beginRound, act, heroInsurance, endSession
  }
}
```

Implementation watch-outs (the tests encode these):
- **Insurance flow**: engine pauses in `insurance`; bots decide in `afterQueueDrained` but `finishInsurance()` is ONLY called from `heroInsurance` — the hero always confirms last. Quick-mode test relies on it.
- **Bot turn order**: bots seated BEFORE the hero (lower spotId) act automatically when the queue drains; bots after the hero act once the hero's hands resolve. The `afterQueueDrained` loop walks `game.spots` in order and stops at the hero.
- **`legalActions` gating**: hero buttons stay empty until earlier spots are done AND the queue is idle.
- **HandView type**: the conditional-type line in `HandView.outcome` shown above is a typo guard — write it plainly as `outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' | null`.
- The store import path inside engine files stays forbidden; this composable is the only writer to the store from gameplay.

- [ ] **Step 4:** Run `pnpm test:nuxt test/nuxt/gameLoop.test.ts` — PASS (5 tests). Full gates clean (engine suite untouched).

- [ ] **Step 5: Commit**

```bash
git add app/composables/useGameLoop.ts test/nuxt/gameLoop.test.ts
git commit -m "feat(ui): add game loop composable with event pacing, bot driver, and bookkeeping"
```

---

### Task 6: Card and chip primitives (`PlayingCard`, `ChipStack`, `BetCircle`)

**Files:**
- Create: `app/components/cards/PlayingCard.vue`, `app/components/table/ChipStack.vue`, `app/components/table/BetCircle.vue`
- Test: `test/nuxt/cardChip.test.ts`

- [ ] **Step 1: Port `PlayingCard.vue` from holdem** — copy `/Volumes/satechi/webdev/metaincognita-holdem/app/components/PlayingCard.vue` to `app/components/cards/PlayingCard.vue` with exactly ONE change: the import line becomes

```ts
import { RANK_DISPLAY, SUIT_SYMBOLS, type Card } from '~/utils/engine/cards'
```

(The component uses `card.rank` 2–14 + `card.suit` names and `RANK_DISPLAY`/`SUIT_SYMBOLS` lookups — our engine mirrors holdem's conventions deliberately, so everything else ports unchanged: sm/md/lg sizes, 3D flip via `.card-inner.is-flipped`, striped back.)

- [ ] **Step 2: Write `ChipStack.vue`** — renders a bet amount as stacked casino chips using the family chip tokens:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  amount: number // cents
  size?: 'sm' | 'md'
}>(), { size: 'md' })

// denomination → CSS custom property (family tokens in main.css)
const DENOMS: Array<{ value: number, token: string, label: string }> = [
  { value: 50000, token: 'var(--chip-orange)', label: '500' },
  { value: 10000, token: 'var(--chip-black)', label: '100' },
  { value: 2500, token: 'var(--chip-green)', label: '25' },
  { value: 500, token: 'var(--chip-red)', label: '5' },
  { value: 100, token: 'var(--chip-white)', label: '1' }
]

const chips = computed(() => {
  const out: Array<{ token: string, label: string }> = []
  let rest = props.amount
  for (const d of DENOMS) {
    while (rest >= d.value && out.length < 12) {
      out.push({ token: d.token, label: d.label })
      rest -= d.value
    }
  }
  return out
})

const dollars = computed(() => `$${(props.amount / 100).toLocaleString()}`)
const px = computed(() => (props.size === 'sm' ? 22 : 30))
</script>

<template>
  <div
    v-if="amount > 0"
    class="relative inline-flex flex-col-reverse items-center"
    :title="dollars"
    :aria-label="`Bet ${dollars}`"
  >
    <div
      v-for="(chip, i) in chips"
      :key="i"
      class="rounded-full border-2 border-dashed border-white/50 shadow-sm"
      :style="{
        width: `${px}px`,
        height: `${px * 0.28}px`,
        background: chip.token,
        marginTop: i === 0 ? '0' : `-${px * 0.16}px`
      }"
    />
    <span class="mt-0.5 text-[10px] font-semibold text-[var(--accent-cream)]">{{ dollars }}</span>
  </div>
</template>
```

- [ ] **Step 3: Write `BetCircle.vue`** — a labeled felt circle that holds a stake and shows a settle result:

```vue
<script setup lang="ts">
defineProps<{
  label: string
  stake: number // cents
  result?: { label: string, net: number } | null
  active?: boolean
}>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex flex-col items-center gap-1 rounded-full transition-transform"
    :class="active ? 'scale-110' : 'hover:scale-105'"
    :aria-label="`${label} bet circle`"
    @click="$emit('select')"
  >
    <span
      class="flex h-14 w-14 items-center justify-center rounded-full border-2 text-[9px] uppercase tracking-wide"
      :class="active ? 'border-[var(--accent-gold)] text-[var(--accent-gold)]' : 'border-[var(--accent-cream)]/40 text-[var(--accent-cream)]/70'"
      :style="{ background: 'var(--felt-green)' }"
    >
      <ChipStack v-if="stake > 0" :amount="stake" size="sm" />
      <span v-else>{{ label }}</span>
    </span>
    <span
      v-if="result"
      class="rounded px-1.5 py-0.5 text-[10px] font-bold"
      :class="result.net > 0 ? 'bg-emerald-700 text-emerald-100' : result.net < 0 ? 'bg-red-900 text-red-200' : 'bg-neutral-700 text-neutral-200'"
    >
      {{ result.net > 0 ? `+$${(result.net / 100).toLocaleString()}` : result.net < 0 ? `-$${(-result.net / 100).toLocaleString()}` : 'PUSH' }}
    </span>
  </button>
</template>
```

- [ ] **Step 4: Write the tests** (`test/nuxt/cardChip.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PlayingCard from '../../app/components/cards/PlayingCard.vue'
import ChipStack from '../../app/components/table/ChipStack.vue'

describe('PlayingCard', () => {
  it('renders rank and suit when face up', async () => {
    const w = await mountSuspended(PlayingCard, {
      props: { card: { rank: 14, suit: 'spades' }, faceUp: true }
    })
    expect(w.text()).toContain('A')
    expect(w.text()).toContain('♠')
    expect(w.find('.card-inner').classes()).toContain('is-flipped')
  })

  it('hides the face and shows the back when face down', async () => {
    const w = await mountSuspended(PlayingCard, {
      props: { card: { rank: 14, suit: 'spades' }, faceUp: false }
    })
    expect(w.find('.card-inner').classes()).not.toContain('is-flipped')
  })
})

describe('ChipStack', () => {
  it('decomposes an amount into denominations, capped stack', async () => {
    const w = await mountSuspended(ChipStack, { props: { amount: 13600 } }) // $136 = 100+25+5+5+1
    expect(w.text()).toContain('$136')
    expect(w.findAll('.rounded-full.border-dashed').length).toBe(5)
  })

  it('renders nothing for zero', async () => {
    const w = await mountSuspended(ChipStack, { props: { amount: 0 } })
    expect(w.find('[aria-label]').exists()).toBe(false)
  })
})
```

- [ ] **Step 5:** Run `pnpm test:nuxt test/nuxt/cardChip.test.ts` — PASS (4). Gates clean.

- [ ] **Step 6: Commit**

```bash
git add app/components/cards/PlayingCard.vue app/components/table/ChipStack.vue app/components/table/BetCircle.vue test/nuxt/cardChip.test.ts
git commit -m "feat(ui): port holdem PlayingCard; add chip stack and bet circle primitives"
```

---

### Task 7: Dealer area and player seats (`DealerArea`, `SpotSeat`)

**Files:**
- Create: `app/components/table/DealerArea.vue`, `app/components/table/SpotSeat.vue`
- Test: `test/nuxt/seats.test.ts`

- [ ] **Step 1: `DealerArea.vue`** — shoe + cut-card marker, dealer card row, visibly-filling discard tray, announcement line + aria-live region:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { ShownCard } from '~/composables/useGameLoop'

const props = defineProps<{
  cards: ShownCard[]
  /** 0..1 — discardCount / (decks × 52) */
  trayFill: number
  /** 0..1 — penetration depth marker on the shoe */
  penetration: number
  announcement: string
  liveText: string
}>()

const trayPct = computed(() => Math.round(Math.min(1, Math.max(0, props.trayFill)) * 100))
</script>

<template>
  <div class="flex items-start justify-center gap-6">
    <!-- Shoe with cut-card marker -->
    <div class="flex flex-col items-center gap-1" aria-hidden="true">
      <div class="relative h-16 w-10 overflow-hidden rounded border border-[var(--rail-walnut)] bg-[var(--rail-walnut-dark)]">
        <div class="absolute inset-x-0 bottom-0 bg-neutral-300/80" style="height: 70%" />
        <div
          class="absolute inset-x-0 h-0.5 bg-[var(--card-red)]"
          :style="{ bottom: `${(1 - penetration) * 70}%` }"
          title="cut card"
        />
      </div>
      <span class="text-[9px] uppercase text-[var(--accent-cream)]/50">Shoe</span>
    </div>

    <!-- Dealer cards + announcement -->
    <div class="flex min-h-28 flex-col items-center gap-2">
      <div class="flex gap-1.5">
        <PlayingCard v-for="(c, i) in cards" :key="i" :card="c.card" :face-up="c.faceUp" size="md" />
      </div>
      <p class="min-h-5 text-sm text-[var(--accent-cream)]/90">{{ announcement }}</p>
      <p class="sr-only" role="status" aria-live="polite">{{ liveText }}</p>
    </div>

    <!-- Discard tray fills as the shoe depletes — counting equipment, spec §7 -->
    <div class="flex flex-col items-center gap-1" aria-hidden="true">
      <div class="relative h-16 w-10 overflow-hidden rounded border border-[var(--rail-walnut)] bg-black/40">
        <div class="absolute inset-x-0 bottom-0 bg-neutral-200/70 transition-all" :style="{ height: `${trayPct * 0.7}%` }" />
      </div>
      <span class="text-[9px] uppercase text-[var(--accent-cream)]/50">Discard</span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: `SpotSeat.vue`** — one betting spot: hand(s) with totals, outcome badges, bot identity + quip bubble:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { handTotal } from '~/utils/engine/hand'
import { PERSONAS } from '~/utils/engine/bots'
import type { SpotView } from '~/composables/useGameLoop'

const props = defineProps<{
  spot: SpotView
  isHero: boolean
  isActive: boolean // engine's active spot AND hand
}>()

const persona = computed(() =>
  props.spot.occupant === 'hero' ? null : PERSONAS.find(p => p.id === props.spot.occupant) ?? null)

function totalLabel(cards: { rank: number, suit: string }[]): string {
  if (cards.length < 2) return ''
  const t = handTotal(cards as Parameters<typeof handTotal>[0])
  return t.soft ? `soft ${t.total}` : `${t.total}`
}

const OUTCOME_BADGE: Record<string, { text: string, cls: string }> = {
  win: { text: 'WIN', cls: 'bg-emerald-700 text-emerald-100' },
  blackjack: { text: 'BLACKJACK', cls: 'bg-[var(--accent-gold)] text-black' },
  lose: { text: 'LOSE', cls: 'bg-red-900 text-red-200' },
  push: { text: 'PUSH', cls: 'bg-neutral-700 text-neutral-200' },
  surrender: { text: 'SURRENDER', cls: 'bg-neutral-800 text-neutral-300' }
}
</script>

<template>
  <div class="flex flex-col items-center gap-1.5" :class="{ 'opacity-90': !isHero }">
    <div v-if="spot.quip && persona" class="max-w-44 rounded-lg bg-neutral-900/90 px-2 py-1 text-center text-[11px] italic text-neutral-300">
      “{{ spot.quip }}”
    </div>

    <div class="flex gap-3">
      <div
        v-for="(hand, hi) in spot.hands"
        :key="hi"
        class="flex flex-col items-center gap-1 rounded-lg p-1.5"
        :class="isActive && hi === spot.activeHandIndex && hand.outcome === null ? 'ring-2 ring-[var(--accent-gold)]' : ''"
      >
        <div class="flex">
          <PlayingCard
            v-for="(card, ci) in hand.cards"
            :key="ci"
            :card="card"
            :face-up="true"
            size="sm"
            :style="{ marginLeft: ci === 0 ? '0' : '-2.4rem' }"
          />
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-semibold text-[var(--accent-cream)]">{{ totalLabel(hand.cards) }}</span>
          <span v-if="hand.doubled" class="text-[9px] uppercase text-[var(--accent-gold)]">2×</span>
          <span v-if="hand.outcome" class="rounded px-1 py-0.5 text-[9px] font-bold" :class="OUTCOME_BADGE[hand.outcome]!.cls">
            {{ OUTCOME_BADGE[hand.outcome]!.text }}
          </span>
        </div>
        <ChipStack :amount="hand.bet" size="sm" />
      </div>
    </div>

    <div class="flex items-center gap-1 text-[11px]" :class="isHero ? 'text-[var(--accent-gold)] font-bold' : 'text-[var(--accent-cream)]/70'">
      <UIcon v-if="persona" name="i-lucide-bot" class="h-3 w-3" />
      <span>{{ persona ? persona.name : 'You' }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Tests** (`test/nuxt/seats.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DealerArea from '../../app/components/table/DealerArea.vue'
import SpotSeat from '../../app/components/table/SpotSeat.vue'
import type { SpotView } from '../../app/composables/useGameLoop'

describe('DealerArea', () => {
  it('renders cards with the hole face-down and a live region', async () => {
    const w = await mountSuspended(DealerArea, {
      props: {
        cards: [
          { card: { rank: 9, suit: 'hearts' }, faceUp: true },
          { card: { rank: 13, suit: 'spades' }, faceUp: false }
        ],
        trayFill: 0.25,
        penetration: 0.75,
        announcement: 'Dealer shows 9',
        liveText: 'Dealer shows 9'
      }
    })
    expect(w.findAll('.card-perspective')).toHaveLength(2)
    expect(w.findAll('.is-flipped')).toHaveLength(1) // only the upcard
    expect(w.find('[role="status"]').text()).toBe('Dealer shows 9')
  })
})

describe('SpotSeat', () => {
  const spot: SpotView = {
    spotId: 3,
    occupant: 'hero',
    activeHandIndex: 0,
    sideResults: [],
    quip: null,
    hands: [{
      cards: [{ rank: 14, suit: 'spades' }, { rank: 6, suit: 'clubs' }],
      bet: 1000, doubled: false, fromSplit: false, outcome: null, net: 0
    }]
  }

  it('shows the soft total and the hero label', async () => {
    const w = await mountSuspended(SpotSeat, { props: { spot, isHero: true, isActive: true } })
    expect(w.text()).toContain('soft 17')
    expect(w.text()).toContain('You')
  })

  it('shows persona name, quip, and outcome badge for a settled bot hand', async () => {
    const botSpot: SpotView = {
      ...spot,
      occupant: 'nancy',
      quip: 'See? Patience.',
      hands: [{ ...spot.hands[0]!, outcome: 'win', net: 1000 }]
    }
    const w = await mountSuspended(SpotSeat, { props: { spot: botSpot, isHero: false, isActive: false } })
    expect(w.text()).toContain('Never-Bust Nancy')
    expect(w.text()).toContain('See? Patience.')
    expect(w.text()).toContain('WIN')
  })
})
```

- [ ] **Step 4:** Run `pnpm test:nuxt test/nuxt/seats.test.ts` — PASS (3). Gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/components/table/DealerArea.vue app/components/table/SpotSeat.vue test/nuxt/seats.test.ts
git commit -m "feat(ui): add dealer area with shoe/discard tray and player spot seats"
```

---

### Task 8: The felt (`BlackjackTable.vue`)

**Files:**
- Create: `app/components/table/BlackjackTable.vue`
- Test: `test/nuxt/table.test.ts`

SVG felt as the background layer; seats are HTML positioned along the same arc (Architecture Notes). Spot 0 renders on the viewer's RIGHT (first base = dealer's immediate left, WA §4) — seat order mirrors deal order.

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { RuleSet } from '~/utils/engine/rules'

const props = defineProps<{
  rules: RuleSet
}>()

/** Seat anchor positions along the player arc, in percent of the table box.
 *  i = 0 is FIRST BASE: cos(20°) ≈ +0.94 → left ≈ 90%, i.e. the viewer's RIGHT edge.
 *  The last seat sweeps to ~10% (viewer's left). Middle seats bow toward the bottom. */
const seatPositions = computed(() => {
  const n = props.rules.spots
  return Array.from({ length: n }, (_, i) => {
    // sweep from 20° (viewer's right) to 160° (viewer's left), circle centered above the box
    const t = (i + 1) / (n + 1)
    const deg = 20 + t * 140
    const rad = (deg * Math.PI) / 180
    return {
      leftPct: 50 + 43 * Math.cos(rad),
      topPct: 28 + 56 * Math.sin(rad)
    }
  })
})

const bjPays = computed(() => props.rules.blackjackPayout === '3:2' ? 'BLACKJACK PAYS 3 TO 2' : 'BLACKJACK PAYS 6 TO 5')
const dealerRule = computed(() => props.rules.dealerHitsSoft17 ? 'DEALER HITS SOFT 17' : 'DEALER STANDS ON ALL 17s')
</script>

<template>
  <div class="relative h-full w-full overflow-hidden rounded-b-[48%_22%] border-x-8 border-b-8 border-[var(--rail-walnut)]" style="background: radial-gradient(ellipse at 50% -10%, var(--felt-green-light), var(--felt-green) 65%)">
    <svg viewBox="0 0 1000 560" class="absolute inset-0 h-full w-full" aria-hidden="true" data-testid="felt">
      <defs>
        <path id="bj-arc" d="M 150 210 Q 500 380 850 210" fill="none" />
        <path id="ins-arc" d="M 190 160 Q 500 310 810 160" fill="none" />
      </defs>
      <text fill="var(--accent-gold)" font-size="30" font-weight="700" letter-spacing="6" text-anchor="middle">
        <textPath href="#bj-arc" startOffset="50%">{{ bjPays }}</textPath>
      </text>
      <text fill="var(--accent-cream)" fill-opacity="0.85" font-size="20" letter-spacing="4" text-anchor="middle">
        <textPath href="#ins-arc" startOffset="50%">INSURANCE PAYS 2 TO 1</textPath>
      </text>
      <text x="500" y="105" fill="var(--accent-cream)" fill-opacity="0.55" font-size="14" letter-spacing="3" text-anchor="middle">{{ dealerRule }}</text>
      <!-- spot markers on the felt -->
      <circle
        v-for="(pos, i) in seatPositions"
        :key="i"
        :cx="pos.leftPct * 10"
        :cy="pos.topPct * 5.6"
        r="34"
        fill="none"
        stroke="var(--accent-cream)"
        stroke-opacity="0.25"
        stroke-width="2"
      />
    </svg>

    <!-- dealer slot -->
    <div class="absolute left-1/2 top-3 -translate-x-1/2">
      <slot name="dealer" />
    </div>

    <!-- player seats (HTML overlay at the same anchors) -->
    <div
      v-for="(pos, i) in seatPositions"
      :key="i"
      class="absolute -translate-x-1/2 -translate-y-1/2"
      :style="{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }"
      :data-testid="`seat-${i}`"
    >
      <slot name="seat" :spot-id="i" />
    </div>
  </div>
</template>
```

Geometry note for the implementer: seat 0 must land on the viewer's RIGHT (first base) and the last seat on the viewer's LEFT, with the arc bowing toward the bottom of the box. If the sweep direction looks wrong in the browser, flip the angle formula (`160 - t * 140`), never the seat indices — deal order depends on them.

- [ ] **Step 2: Tests** (`test/nuxt/table.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BlackjackTable from '../../app/components/table/BlackjackTable.vue'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

describe('BlackjackTable', () => {
  it('renders one seat anchor per rules.spots (7)', async () => {
    const w = await mountSuspended(BlackjackTable, { props: { rules: PRESETS.VEGAS_STRIP_6D! } })
    expect(w.findAll('[data-testid^="seat-"]')).toHaveLength(7)
    expect(w.text()).toContain('BLACKJACK PAYS 3 TO 2')
    expect(w.text()).toContain('DEALER STANDS ON ALL 17s')
  })

  it('renders 9 seats for the Washington preset', async () => {
    const w = await mountSuspended(BlackjackTable, { props: { rules: PRESETS.WA_CARDROOM! } })
    expect(w.findAll('[data-testid^="seat-"]')).toHaveLength(9)
  })

  it('felt text follows the rules: 6:5 and H17', async () => {
    const r = cloneRules(PRESETS.SINGLE_DECK_65!)
    const w = await mountSuspended(BlackjackTable, { props: { rules: r } })
    expect(w.text()).toContain('BLACKJACK PAYS 6 TO 5')
    expect(w.text()).toContain('DEALER HITS SOFT 17')
  })
})
```

- [ ] **Step 3: Visual check** — `pnpm dev`, temporarily render `<BlackjackTable :rules="PRESETS.VEGAS_STRIP_6D" />` full-viewport from `index.vue` (revert after looking), confirm: arc text readable, 7 circles along a natural arc, seat 0 right / seat 6 left, felt gradient + walnut rail visible. Adjust the two `Q` control points if text overlaps circles.

- [ ] **Step 4:** Run `pnpm test:nuxt test/nuxt/table.test.ts` — PASS (3). Gates clean. Revert any scratch wiring from Step 3.

- [ ] **Step 5: Commit**

```bash
git add app/components/table/BlackjackTable.vue test/nuxt/table.test.ts
git commit -m "feat(ui): add SVG felt table with rules-driven arc text and seat anchors"
```

---

### Task 9: Action bar (betting, actions, insurance)

**Files:**
- Create: `app/components/table/ActionBar.vue`
- Test: `test/nuxt/actionBar.test.ts`

One component, three modes by `phase`: `betting` (chip controls + Deal), `playerTurns` (action buttons with kbd hints), `insurance` (take/decline/even-money). Side-bet circles ONLY for bets enabled in rules (carry-forward: stakes for disabled bets must be unplaceable).

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Action } from '~/utils/engine/hand'
import type { RuleSet } from '~/utils/engine/rules'
import type { SideBetKind } from '~/utils/engine/round'

const props = defineProps<{
  phase: 'betting' | 'insurance' | 'playerTurns' | 'complete'
  rules: RuleSet
  legalActions: Action[]
  bankroll: number
  canDeal: boolean
  heroHasBlackjack: boolean
  lastBet: { main: number, side: Partial<Record<SideBetKind, number>> } | null
}>()

const emit = defineEmits<{
  deal: [main: number, side: Partial<Record<SideBetKind, number>>]
  act: [action: Action]
  insurance: [decision: number | 'even-money' | null]
}>()

const CHIP_VALUES = [100, 500, 2500, 10000, 50000] // cents
const mainBet = ref(0)
const sideStakes = ref<Partial<Record<SideBetKind, number>>>({})
const target = ref<'main' | SideBetKind>('main')

const enabledSideBets = computed<Array<{ kind: SideBetKind, label: string }>>(() => {
  const out: Array<{ kind: SideBetKind, label: string }> = []
  if (props.rules.sideBets.twentyOnePlusThree !== 'off') out.push({ kind: 'twentyOnePlusThree', label: '21+3' })
  if (props.rules.sideBets.luckyLadies !== 'off') out.push({ kind: 'luckyLadies', label: 'Lucky Ladies' })
  if (props.rules.sideBets.matchTheDealer) out.push({ kind: 'matchTheDealer', label: 'Match Dealer' })
  if (props.rules.sideBets.buster !== 'off') out.push({ kind: 'buster', label: 'Buster' })
  return out
})

const committed = computed(() =>
  mainBet.value + Object.values(sideStakes.value).reduce((s, v) => s + (v ?? 0), 0))

function addChip(value: number): void {
  if (committed.value + value > props.bankroll) return
  if (target.value === 'main') {
    if (mainBet.value + value > props.rules.maxBet) return
    mainBet.value += value
  } else {
    const cur = sideStakes.value[target.value] ?? 0
    if (cur + value > mainBet.value) return // side bets may not exceed the main bet (MA §17(g), §27(c))
    sideStakes.value = { ...sideStakes.value, [target.value]: cur + value }
  }
}

function clearBets(): void {
  mainBet.value = 0
  sideStakes.value = {}
  target.value = 'main'
}

function rebet(): void {
  if (!props.lastBet) return
  mainBet.value = props.lastBet.main
  sideStakes.value = { ...props.lastBet.side }
}

const dealDisabled = computed(() =>
  !props.canDeal || mainBet.value < props.rules.minBet || committed.value > props.bankroll)

function deal(): void {
  if (dealDisabled.value) return
  emit('deal', mainBet.value, { ...sideStakes.value })
}

const insuranceAmount = computed(() => Math.floor((props.lastBet?.main ?? props.rules.minBet) / 2))

const ACTION_META: Record<Action, { label: string, key: string }> = {
  hit: { label: 'Hit', key: 'H' },
  stand: { label: 'Stand', key: 'S' },
  double: { label: 'Double', key: 'D' },
  split: { label: 'Split', key: 'P' },
  surrender: { label: 'Surrender', key: 'R' }
}
const ACTION_ORDER: Action[] = ['hit', 'stand', 'double', 'split', 'surrender']

defineExpose({ mainBet, sideStakes, addChip, clearBets, rebet, deal })
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-t-xl bg-neutral-950/85 p-3 backdrop-blur">
    <!-- BETTING -->
    <template v-if="phase === 'betting' || phase === 'complete'">
      <div class="flex items-center gap-2">
        <UButton
          v-for="value in CHIP_VALUES"
          :key="value"
          size="sm"
          variant="soft"
          color="neutral"
          :disabled="committed + value > bankroll"
          :data-testid="`chip-${value}`"
          @click="addChip(value)"
        >
          ${{ value / 100 }}
        </UButton>
        <span class="mx-2 h-5 w-px bg-neutral-700" />
        <UButton size="sm" variant="ghost" color="neutral" :disabled="committed === 0" @click="clearBets">Clear</UButton>
        <UButton size="sm" variant="ghost" color="neutral" :disabled="!lastBet" data-testid="rebet" @click="rebet">
          Rebet <kbd class="ml-1 text-[9px] opacity-60">B</kbd>
        </UButton>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          :variant="target === 'main' ? 'solid' : 'outline'"
          color="primary"
          data-testid="target-main"
          @click="target = 'main'"
        >
          Main {{ mainBet > 0 ? `$${mainBet / 100}` : '' }}
        </UButton>
        <UButton
          v-for="sb in enabledSideBets"
          :key="sb.kind"
          size="xs"
          :variant="target === sb.kind ? 'solid' : 'outline'"
          color="neutral"
          :data-testid="`target-${sb.kind}`"
          @click="target = sb.kind"
        >
          {{ sb.label }} {{ (sideStakes[sb.kind] ?? 0) > 0 ? `$${(sideStakes[sb.kind] ?? 0) / 100}` : '' }}
        </UButton>
        <UButton color="primary" size="lg" :disabled="dealDisabled" data-testid="deal" @click="deal">
          Deal <kbd class="ml-1 text-[10px] opacity-70">Space</kbd>
        </UButton>
      </div>
      <p v-if="mainBet > 0 && mainBet < rules.minBet" class="text-xs text-amber-400">
        Table minimum is ${{ rules.minBet / 100 }}
      </p>
    </template>

    <!-- INSURANCE -->
    <template v-else-if="phase === 'insurance'">
      <p class="text-sm text-[var(--accent-cream)]">Dealer shows an ace — insurance pays 2 to 1</p>
      <div class="flex gap-2">
        <UButton
          v-if="heroHasBlackjack && rules.evenMoneyOffered"
          color="primary"
          data-testid="even-money"
          @click="emit('insurance', 'even-money')"
        >
          Even money
        </UButton>
        <UButton color="neutral" variant="soft" data-testid="take-insurance" @click="emit('insurance', insuranceAmount)">
          Insure ${{ insuranceAmount / 100 }}
        </UButton>
        <UButton color="neutral" variant="outline" data-testid="decline-insurance" @click="emit('insurance', null)">
          No insurance
        </UButton>
      </div>
    </template>

    <!-- PLAYER TURNS -->
    <template v-else>
      <div class="flex gap-2">
        <UButton
          v-for="action in ACTION_ORDER"
          :key="action"
          size="lg"
          :color="action === 'surrender' ? 'neutral' : 'primary'"
          :variant="action === 'hit' || action === 'stand' ? 'solid' : 'soft'"
          :disabled="!legalActions.includes(action)"
          :data-testid="`act-${action}`"
          @click="emit('act', action)"
        >
          {{ ACTION_META[action].label }}
          <kbd class="ml-1 text-[10px] opacity-60">{{ ACTION_META[action].key }}</kbd>
        </UButton>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Tests** (`test/nuxt/actionBar.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ActionBar from '../../app/components/table/ActionBar.vue'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

const base = {
  rules: PRESETS.MA_205CMR!, // all four side bets enabled
  legalActions: [],
  bankroll: 100_000,
  canDeal: true,
  heroHasBlackjack: false,
  lastBet: null
}

describe('ActionBar — betting', () => {
  it('builds a bet from chips and emits deal', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    await w.find('[data-testid="chip-2500"]').trigger('click')
    await w.find('[data-testid="chip-2500"]').trigger('click')
    await w.find('[data-testid="deal"]').trigger('click')
    expect(w.emitted('deal')![0]).toEqual([5000, {}])
  })

  it('routes chips to a selected enabled side bet, capped at the main bet', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    await w.find('[data-testid="chip-2500"]').trigger('click') // main 2500
    await w.find('[data-testid="target-buster"]').trigger('click')
    await w.find('[data-testid="chip-2500"]').trigger('click') // buster 2500 (== main, allowed)
    await w.find('[data-testid="chip-100"]').trigger('click') // would exceed main — ignored
    await w.find('[data-testid="deal"]').trigger('click')
    expect(w.emitted('deal')![0]).toEqual([2500, { buster: 2500 }])
  })

  it('hides side-bet targets that the rules disable', async () => {
    const rules = cloneRules(PRESETS.MA_205CMR!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    const w = await mountSuspended(ActionBar, { props: { ...base, rules, phase: 'betting' } })
    expect(w.find('[data-testid="target-buster"]').exists()).toBe(false)
    expect(w.find('[data-testid="target-twentyOnePlusThree"]').exists()).toBe(false)
  })

  it('disables Deal below the table minimum', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    await w.find('[data-testid="chip-500"]').trigger('click') // $5 < $10 min
    expect(w.find('[data-testid="deal"]').attributes('disabled')).toBeDefined()
  })
})

describe('ActionBar — actions & insurance', () => {
  it('enables exactly the legal actions', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'playerTurns', legalActions: ['hit', 'stand'] }
    })
    expect(w.find('[data-testid="act-hit"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-testid="act-double"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="act-stand"]').trigger('click')
    expect(w.emitted('act')![0]).toEqual(['stand'])
  })

  it('offers even money only to a blackjack hand under 3:2 rules', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'insurance', heroHasBlackjack: true, lastBet: { main: 1000, side: {} } }
    })
    expect(w.find('[data-testid="even-money"]').exists()).toBe(true)
    await w.find('[data-testid="decline-insurance"]').trigger('click')
    expect(w.emitted('insurance')![0]).toEqual([null])
  })
})
```

- [ ] **Step 3:** Run `pnpm test:nuxt test/nuxt/actionBar.test.ts` — PASS (6). Gates clean.

- [ ] **Step 4: Commit**

```bash
git add app/components/table/ActionBar.vue test/nuxt/actionBar.test.ts
git commit -m "feat(ui): add action bar with chip betting, side-bet targets, and insurance"
```

---

### Task 10: Layout shell

**Files:**
- Replace: `app/layouts/default.vue`
- Create: `app/app.config.ts`
- Test: covered by the Task 13 integration mount (layout renders around pages)

- [ ] **Step 1: Replace `app/layouts/default.vue`** (craps pattern; History/Analysis intentionally absent until Plan 3):

```vue
<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const store = useBlackjackStore()
const { endSession } = useGameLoop()

const isSetup = computed(() => route.path === '/')
const showLeaveConfirm = ref(false)
const version = '0.2.0'

function handleBack() {
  showLeaveConfirm.value = true
}

function confirmLeave() {
  endSession()
  showLeaveConfirm.value = false
  router.push('/')
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-neutral-950">
    <nav class="z-50 flex h-9 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3">
      <div class="flex items-center gap-2">
        <button
          v-if="!isSetup"
          class="flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          @click="handleBack"
        >
          <UIcon name="i-lucide-arrow-left" class="h-3.5 w-3.5" />
          <span>Leave table</span>
        </button>
        <span v-else class="select-none text-xs text-neutral-600">
          <span class="text-[var(--accent-gold)]/70">Blackjack</span> Trainer
        </span>
      </div>
      <div v-if="store.sessionActive && !isSetup" class="flex items-center gap-2 text-xs text-neutral-400">
        <span>Bankroll</span>
        <span class="font-mono font-semibold text-[var(--accent-cream)]">${{ (store.bankroll / 100).toLocaleString() }}</span>
      </div>
    </nav>

    <div class="flex min-h-0 flex-1 flex-col">
      <slot />
    </div>

    <nav class="z-50 flex h-9 shrink-0 items-center justify-between border-t border-neutral-800 bg-neutral-900 px-3">
      <span class="text-[10px] text-neutral-600">v{{ version }} — simulator for training; no real-money play</span>
      <a
        href="https://github.com/cschweda/metaincognita-blackjack"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <UIcon name="i-simple-icons-github" class="h-3.5 w-3.5" />
        <span>GitHub</span>
      </a>
    </nav>

    <UModal v-model:open="showLeaveConfirm" title="Leave the table?" :ui="{ footer: 'justify-end' }">
      <template #body>
        <p class="text-sm text-neutral-400">
          Leaving ends the session: bankroll, history, and the current round are cleared.
        </p>
      </template>
      <template #footer>
        <UButton variant="outline" color="neutral" label="Stay" @click="showLeaveConfirm = false" />
        <UButton color="error" label="Leave table" @click="confirmLeave" />
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 2: Create `app/app.config.ts`:**

```ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'amber',
      neutral: 'neutral'
    }
  }
})
```

- [ ] **Step 3:** `pnpm dev` boots, both bars render on `/`. Gates clean (`pnpm test && pnpm lint && pnpm typecheck`).

- [ ] **Step 4: Commit**

```bash
git add app/layouts/default.vue app/app.config.ts
git commit -m "feat(ui): add status-bar layout shell with leave-table confirm"
```

---

### Task 11: Setup screen (`index.vue` + setup widgets)

**Files:**
- Create: `app/components/setup/PresetPicker.vue`, `app/components/setup/RulesEditor.vue`, `app/components/setup/BotPicker.vue`
- Replace: `app/pages/index.vue`
- Test: `test/nuxt/setup.test.ts`

- [ ] **Step 1: `PresetPicker.vue`** — preset cards with the **model-estimate-labeled** house edge (carry-forward obligation):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { PRESETS } from '~/utils/engine/rules'
import { houseEdge } from '~/utils/engine/basicStrategy'

const selected = defineModel<string>({ required: true })

const cards = computed(() => Object.entries(PRESETS)
  .filter(([key]) => key !== 'CUSTOM')
  .map(([key, rules]) => ({
    key,
    name: rules.name,
    source: rules.source,
    edge: (houseEdge(rules) * 100).toFixed(2),
    chips: [
      `${rules.decks} deck${rules.decks > 1 ? 's' : ''}`,
      rules.dealerHitsSoft17 ? 'H17' : 'S17',
      rules.blackjackPayout,
      rules.surrender === 'late' ? 'late surrender' : 'no surrender',
      `${rules.spots} spots`
    ]
  })))
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <button
      v-for="card in cards"
      :key="card.key"
      type="button"
      class="rounded-lg border p-3 text-left transition-colors"
      :class="selected === card.key ? 'border-[var(--accent-gold)] bg-neutral-900' : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-600'"
      :data-testid="`preset-${card.key}`"
      @click="selected = card.key"
    >
      <div class="flex items-baseline justify-between gap-2">
        <span class="font-semibold text-neutral-100">{{ card.name }}</span>
        <span class="whitespace-nowrap text-xs text-neutral-400">≈{{ card.edge }}% edge<span class="text-neutral-600">*</span></span>
      </div>
      <p class="mt-1 truncate text-[11px] text-neutral-500" :title="card.source">{{ card.source }}</p>
      <div class="mt-2 flex flex-wrap gap-1">
        <span v-for="chip in card.chips" :key="chip" class="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">{{ chip }}</span>
      </div>
    </button>
    <button
      type="button"
      class="rounded-lg border border-dashed p-3 text-left transition-colors"
      :class="selected === 'CUSTOM' ? 'border-[var(--accent-gold)] bg-neutral-900' : 'border-neutral-700 hover:border-neutral-500'"
      data-testid="preset-CUSTOM"
      @click="selected = 'CUSTOM'"
    >
      <span class="font-semibold text-neutral-100">Custom rules…</span>
      <p class="mt-1 text-[11px] text-neutral-500">Start from Vegas Strip and change anything</p>
    </button>
  </div>
  <p class="mt-2 text-[11px] text-neutral-600">
    *House edge is a model estimate (fixed-composition engine) — it runs slightly high vs published
    casino figures, especially at 1–2 decks. The comparison BETWEEN rule sets is what matters.
  </p>
</template>
```

- [ ] **Step 2: `RulesEditor.vue`** — full `RuleSet` editor over a draft, validation surfaced, no-peek caveat:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { RuleSet } from '~/utils/engine/rules'
import { validateRuleSet } from '~/utils/engine/rules'
import { houseEdge } from '~/utils/engine/basicStrategy'

const rules = defineModel<RuleSet>({ required: true })

const errors = computed(() => validateRuleSet(rules.value))
const edge = computed(() => errors.value.length === 0 ? (houseEdge(rules.value) * 100).toFixed(2) : null)

const deckOptions = [1, 2, 4, 6, 8].map(v => ({ label: `${v} deck${v > 1 ? 's' : ''}`, value: v }))
const payoutOptions = [{ label: '3 to 2', value: '3:2' }, { label: '6 to 5', value: '6:5' }]
const doubleOptions = [
  { label: 'Any first two cards', value: 'any2' },
  { label: 'Hard 9–11 only', value: '9-11' },
  { label: 'Hard 10–11 only', value: '10-11' }
]
const splitOptions = [2, 3, 4].map(v => ({ label: `${v} hands`, value: v }))
const surrenderOptions = [{ label: 'Late surrender', value: 'late' }, { label: 'Not offered', value: 'none' }]
const spotsOptions = [7, 9].map(v => ({ label: `${v} spots`, value: v }))
</script>

<template>
  <div class="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <UFormField label="Decks"><USelect v-model="rules.decks" :items="deckOptions" /></UFormField>
      <UFormField label="Blackjack pays"><USelect v-model="rules.blackjackPayout" :items="payoutOptions" /></UFormField>
      <UFormField label="Doubling"><USelect v-model="rules.doubleOn" :items="doubleOptions" /></UFormField>
      <UFormField label="Max split hands"><USelect v-model="rules.maxSplitHands" :items="splitOptions" /></UFormField>
      <UFormField label="Surrender"><USelect v-model="rules.surrender" :items="surrenderOptions" /></UFormField>
      <UFormField label="Table spots"><USelect v-model="rules.spots" :items="spotsOptions" /></UFormField>
    </div>
    <div class="flex flex-wrap gap-x-6 gap-y-2">
      <USwitch v-model="rules.dealerHitsSoft17" label="Dealer hits soft 17 (H17)" />
      <USwitch v-model="rules.doubleAfterSplit" label="Double after split" />
      <USwitch v-model="rules.resplitAces" label="Resplit aces" />
      <USwitch v-model="rules.insurance" label="Insurance" />
      <USwitch v-model="rules.evenMoneyOffered" label="Even money" />
      <USwitch v-model="rules.dealerPeek" label="Dealer peeks for blackjack" />
      <USwitch v-model="rules.fiveCard21Pays2to1" label="Five-card 21 pays 2:1 (MA §16)" />
    </div>
    <UFormField :label="`Penetration — cut card at ${Math.round(rules.penetration * 100)}%`">
      <USlider v-model="rules.penetration" :min="0.5" :max="0.9" :step="0.05" />
    </UFormField>
    <p v-if="!rules.dealerPeek" class="text-xs text-amber-400">
      No-peek here is NOT European no-hole-card: the dealer still takes (and uses) a hole card;
      doubles and splits lose in full to a dealer blackjack.
    </p>
    <ul v-if="errors.length" class="space-y-1 text-xs text-red-400">
      <li v-for="error in errors" :key="error">• {{ error }}</li>
    </ul>
    <p v-else-if="edge" class="text-xs text-neutral-400">House edge ≈{{ edge }}% (model estimate)</p>
  </div>
</template>
```

- [ ] **Step 3: `BotPicker.vue`:**

```vue
<script setup lang="ts">
import { PERSONAS } from '~/utils/engine/bots'
import type { PersonaId } from '~/utils/engine/bots'

const selected = defineModel<PersonaId[]>({ required: true })
const props = defineProps<{ max: number }>()

function toggle(id: PersonaId): void {
  if (selected.value.includes(id)) selected.value = selected.value.filter(x => x !== id)
  else if (selected.value.length < props.max) selected.value = [...selected.value, id]
}
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    <button
      v-for="persona in PERSONAS"
      :key="persona.id"
      type="button"
      class="rounded-lg border p-3 text-left transition-colors"
      :class="selected.includes(persona.id) ? 'border-[var(--accent-gold)] bg-neutral-900' : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-600'"
      :data-testid="`bot-${persona.id}`"
      @click="toggle(persona.id)"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-bot" class="h-4 w-4 text-neutral-400" />
        <span class="font-semibold text-neutral-100">{{ persona.name }}</span>
      </div>
      <p class="mt-1 text-[11px] leading-snug text-neutral-500">{{ persona.flavor }}</p>
    </button>
  </div>
  <p class="mt-1 text-[11px] text-neutral-600">{{ selected.length }}/{{ max }} seats filled — more players = more visible cards per round</p>
</template>
```

- [ ] **Step 4: Replace `app/pages/index.vue`:**

```vue
<script setup lang="ts">
import { PRESETS, cloneRules, validateRuleSet } from '~/utils/engine/rules'
import type { PersonaId } from '~/utils/engine/bots'
import type { PlayMode, PlaySpeed } from '~/stores/useBlackjackStore'

const store = useBlackjackStore()
const { startSession, restoreSession } = useGameLoop()
const router = useRouter()

const presetKey = ref('VEGAS_STRIP_6D')
const customRules = ref(cloneRules(PRESETS.CUSTOM!))
const botIds = ref<PersonaId[]>([])
const mode = ref<PlayMode>('casino')
const speed = ref<PlaySpeed>('normal')
const flair = ref(true)
const bankrollChoice = ref(50_000)

const bankrollOptions = [20_000, 50_000, 100_000, 500_000]
  .map(v => ({ label: `$${(v / 100).toLocaleString()}`, value: v }))

const activeRules = computed(() =>
  presetKey.value === 'CUSTOM' ? customRules.value : PRESETS[presetKey.value]!)
const maxBots = computed(() => Math.min(5, activeRules.value.spots - 1))
const rulesValid = computed(() => validateRuleSet(activeRules.value).length === 0)

const hasSavedSession = ref(false)
onMounted(() => {
  hasSavedSession.value = !store.sessionActive && store.restore()
})

function resumeSession(): void {
  if (restoreSession()) router.push('/table')
}

function start(): void {
  if (!rulesValid.value) return
  const trimmedBots = botIds.value.slice(0, maxBots.value)
  startSession({
    rules: cloneRules(activeRules.value),
    mode: mode.value,
    speed: speed.value,
    flair: flair.value,
    botIds: trimmedBots
  }, bankrollChoice.value)
  router.push('/table')
}
</script>

<template>
  <main class="mx-auto w-full max-w-4xl flex-1 space-y-6 overflow-y-auto p-4 pb-10">
    <header class="pt-4 text-center">
      <h1 class="text-3xl font-bold" style="color: var(--accent-gold)">Blackjack Trainer</h1>
      <p class="mt-1 text-sm text-neutral-400">Authentic rules from official gaming-commission documents</p>
    </header>

    <UAlert
      v-if="hasSavedSession"
      color="primary"
      variant="soft"
      title="Session in progress"
      description="You have a saved table — resume where you left off?"
      data-testid="resume-banner"
      :actions="[{ label: 'Resume', onClick: resumeSession }]"
    />

    <section>
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">Table rules</h2>
      <PresetPicker v-model="presetKey" />
      <div v-if="presetKey === 'CUSTOM'" class="mt-3">
        <RulesEditor v-model="customRules" />
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">Table companions</h2>
      <BotPicker v-model="botIds" :max="maxBots" />
    </section>

    <section class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Bankroll">
        <USelect v-model="bankrollChoice" :items="bankrollOptions" data-testid="bankroll" />
      </UFormField>
      <UFormField label="Presentation">
        <USelect
          v-model="mode"
          :items="[{ label: 'Casino procedure (paced)', value: 'casino' }, { label: 'Quick play (instant)', value: 'quick' }]"
        />
      </UFormField>
      <UFormField v-if="mode === 'casino'" label="Dealing speed">
        <USelect
          v-model="speed"
          :items="[{ label: 'Relaxed', value: 'relaxed' }, { label: 'Normal', value: 'normal' }, { label: 'Brisk', value: 'brisk' }]"
        />
      </UFormField>
    </section>
    <div class="flex items-center justify-between">
      <USwitch v-model="flair" label="Table talk & flair" />
      <UButton size="xl" color="primary" :disabled="!rulesValid" data-testid="start" @click="start">
        Take a seat
      </UButton>
    </div>
  </main>
</template>
```

- [ ] **Step 5: Tests** (`test/nuxt/setup.test.ts`):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import PresetPicker from '../../app/components/setup/PresetPicker.vue'
import RulesEditor from '../../app/components/setup/RulesEditor.vue'
import BotPicker from '../../app/components/setup/BotPicker.vue'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

beforeEach(() => setActivePinia(createPinia()))

describe('PresetPicker', () => {
  it('renders all five cited presets plus Custom, with model-estimate label', async () => {
    const w = await mountSuspended(PresetPicker, { props: { modelValue: 'VEGAS_STRIP_6D' } })
    for (const key of ['MA_205CMR', 'AC_BALLYS', 'WA_CARDROOM', 'VEGAS_STRIP_6D', 'SINGLE_DECK_65', 'CUSTOM']) {
      expect(w.find(`[data-testid="preset-${key}"]`).exists()).toBe(true)
    }
    expect(w.text()).toContain('model estimate')
    expect(w.text()).toMatch(/≈\d+\.\d{2}% edge/)
  })
})

describe('RulesEditor', () => {
  it('surfaces validation errors from the engine', async () => {
    const rules = cloneRules(PRESETS.CUSTOM!)
    rules.blackjackPayout = '6:5' // with evenMoneyOffered=true → MA §7(d) violation
    const w = await mountSuspended(RulesEditor, { props: { modelValue: rules } })
    expect(w.text()).toContain('evenMoneyOffered requires 3:2')
  })

  it('shows the no-peek caveat only when peek is off', async () => {
    const rules = cloneRules(PRESETS.CUSTOM!)
    rules.dealerPeek = false
    const w = await mountSuspended(RulesEditor, { props: { modelValue: rules } })
    expect(w.text()).toContain('NOT European no-hole-card')
  })
})

describe('BotPicker', () => {
  it('caps selection at max', async () => {
    const w = await mountSuspended(BotPicker, { props: { modelValue: [], max: 2 } })
    await w.find('[data-testid="bot-bea"]').trigger('click')
    await w.find('[data-testid="bot-nancy"]').trigger('click')
    await w.find('[data-testid="bot-mike"]').trigger('click') // over cap — ignored
    const emitted = w.emitted('update:modelValue')!
    expect(emitted[emitted.length - 1]![0]).toHaveLength(2)
  })
})
```

- [ ] **Step 6:** Run `pnpm test:nuxt test/nuxt/setup.test.ts` — PASS (4). `pnpm dev` → setup screen renders, preset selection + custom editor + bots all interactive. Gates clean.

- [ ] **Step 7: Commit**

```bash
git add app/components/setup/ app/pages/index.vue test/nuxt/setup.test.ts
git commit -m "feat(ui): add setup screen with cited presets, rules editor, and bot picker"
```

---

### Task 12: The table page (`table.vue`) — compose everything

**Files:**
- Create: `app/pages/table.vue`
- Modify: `app/composables/useGameLoop.ts` (two small additions, below)
- Test: `test/nuxt/gameLoop.test.ts` (append one test)

- [ ] **Step 1: Composable additions** — add to `useGameLoop`'s returned object (with module-state support):

1. `hasGame: computed(() => game !== null)`
2. `trayFill` — a `ref(0)` module-level, updated wherever events apply (`applyEvent`: on `card-dealt` and `shuffle`) plus on `fastForwardPresentation`:

```ts
function updateTrayFill(): void {
  const store = useBlackjackStore()
  if (!game || !store.settings) return
  const shoe = game.shoe as { discardCount?: () => number }
  trayFill.value = shoe.discardCount ? shoe.discardCount() / (store.settings.rules.decks * 52) : 0
}
```

Append one test to `gameLoop.test.ts`:

```ts
  it('exposes hasGame and a moving trayFill', () => {
    const loop = useGameLoop()
    expect(loop.hasGame.value).toBe(false)
    loop.startSession(settings(), 100_000, 7)
    expect(loop.hasGame.value).toBe(true)
    loop.beginRound(1000, {})
    expect(loop.trayFill.value).toBeGreaterThan(0) // burn card at minimum
  })
```

- [ ] **Step 2: Implement `app/pages/table.vue`:**

```vue
<script setup lang="ts">
import type { Action } from '~/utils/engine/hand'
import { isBlackjack } from '~/utils/engine/hand'
import type { SideBetKind } from '~/utils/engine/round'

const store = useBlackjackStore()
const loop = useGameLoop()
const router = useRouter()

const {
  phase, dealerRow, spotsView, announcements, liveText, queueIdle,
  canAct, legalActions, heroSpotId, inPlay, hasGame, trayFill
} = loop

const lastBet = ref<{ main: number, side: Partial<Record<SideBetKind, number>> } | null>(null)

onMounted(() => {
  if (!hasGame.value && !loop.restoreSession()) {
    router.replace('/')
  }
})

const rules = computed(() => store.settings?.rules)
const heroView = computed(() => spotsView.value.find(s => s.occupant === 'hero') ?? null)
const heroHasBlackjack = computed(() => {
  const cards = heroView.value?.hands[0]?.cards
  return !!cards && cards.length === 2 && isBlackjack(cards, false)
})
const betweenRounds = computed(() => phase.value === 'betting' || (phase.value === 'complete' && queueIdle.value))
const latestAnnouncement = computed(() => announcements.value[announcements.value.length - 1]?.text ?? '')

function onDeal(main: number, side: Partial<Record<SideBetKind, number>>): void {
  lastBet.value = { main, side }
  loop.beginRound(main, side)
}

function onAct(action: Action): void {
  loop.act(action)
}

function onInsurance(decision: number | 'even-money' | null): void {
  loop.heroInsurance(decision)
}

function backToSetup(): void {
  loop.endSession()
  router.push('/')
}

// Keyboard map (spec §6): H/S/D/P/R act, B rebet, Space deal
const actionBar = ref<{ rebet: () => void, deal: () => void } | null>(null)
const KEYS: Record<string, Action> = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' }
function onKey(e: KeyboardEvent): void {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  const key = e.key.toLowerCase()
  if (key === ' ' && betweenRounds.value) {
    e.preventDefault()
    actionBar.value?.deal()
  } else if (key === 'b' && betweenRounds.value) {
    actionBar.value?.rebet()
  } else if (KEYS[key] && canAct.value && legalActions.value.includes(KEYS[key]!)) {
    onAct(KEYS[key]!)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main v-if="rules" class="flex min-h-0 flex-1 flex-col">
    <UAlert
      v-if="!store.storageAvailable"
      color="warning"
      variant="soft"
      class="m-2"
      title="Storage unavailable — this session won't survive a refresh"
    />

    <!-- felt -->
    <div class="relative min-h-0 flex-1 p-2">
      <BlackjackTable :rules="rules">
        <template #dealer>
          <DealerArea
            :cards="dealerRow"
            :tray-fill="trayFill"
            :penetration="rules.penetration"
            :announcement="latestAnnouncement"
            :live-text="liveText"
          />
        </template>
        <template #seat="{ spotId }">
          <SpotSeat
            v-if="spotsView.find(s => s.spotId === spotId)"
            :spot="spotsView.find(s => s.spotId === spotId)!"
            :is-hero="spotId === heroSpotId"
            :is-active="phase === 'playerTurns' && spotId === heroSpotId && canAct"
          />
          <div
            v-else
            class="h-10 w-10 rounded-full border border-dashed border-[var(--accent-cream)]/15"
            aria-hidden="true"
          />
        </template>
      </BlackjackTable>
    </div>

    <!-- controls -->
    <div class="shrink-0 px-2 pb-2">
      <div class="mb-1 flex items-center justify-between px-1 text-xs text-neutral-400">
        <span v-if="inPlay > 0">In play: <span class="font-mono text-[var(--accent-cream)]">${{ (inPlay / 100).toLocaleString() }}</span></span>
        <span v-else>Place your bet — table ${{ (rules.minBet / 100).toLocaleString() }}–${{ (rules.maxBet / 100).toLocaleString() }}</span>
        <span>Session: {{ store.session.roundsPlayed }} rounds</span>
      </div>
      <ActionBar
        ref="actionBar"
        :phase="betweenRounds ? 'betting' : phase === 'insurance' ? 'insurance' : 'playerTurns'"
        :rules="rules"
        :legal-actions="legalActions"
        :bankroll="store.bankroll"
        :can-deal="betweenRounds && queueIdle"
        :hero-has-blackjack="heroHasBlackjack"
        :last-bet="lastBet"
        @deal="onDeal"
        @act="onAct"
        @insurance="onInsurance"
      />
    </div>

    <!-- busted -->
    <UModal :open="store.busted" :dismissible="false" title="Bankroll busted">
      <template #body>
        <p class="text-sm text-neutral-400">
          You're below the table minimum after {{ store.session.roundsPlayed }} rounds.
          The shoe doesn't care — that's the lesson. Set up a new session to keep practicing.
        </p>
      </template>
      <template #footer>
        <UButton color="primary" label="Back to setup" @click="backToSetup" />
      </template>
    </UModal>
  </main>
</template>
```

Responsive note: Plan 2 ships a desktop-first table that scales down (felt + seats are percentage-positioned); the spec §7 phone layout (bots collapse to status chips) is deliberately deferred to Plan 3's polish pass — record it in the commit body.

- [ ] **Step 3:** `pnpm test:nuxt` — all green incl. the appended gameLoop test. `pnpm dev` → full manual round: take a seat (casino mode, 2 bots), bet, deal, play, watch bots act and quip, settle, rebet with B, refresh mid-round → table restores. Gates clean.

- [ ] **Step 4: Commit**

```bash
git add app/pages/table.vue app/composables/useGameLoop.ts test/nuxt/gameLoop.test.ts
git commit -m "feat(ui): add the table page — full playable round flow with keyboard and restore

Mobile-collapsed seat layout deferred to Plan 3 polish."
```

---

### Task 13: Integration smoke + flair gate

**Files:**
- Modify: `app/composables/useGameLoop.ts` (gate quips on `settings.flair`)
- Test: `test/nuxt/integration.test.ts`

- [ ] **Step 1: Flair gate** — in `applyEvent`'s `hand-settled` case, only set `view.quip` when `useBlackjackStore().settings?.flair` is true. Add to the integration test below.

- [ ] **Step 2: Integration test** (`test/nuxt/integration.test.ts`) — a full seeded quick-mode session through the PAGE component:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import TablePage from '../../app/pages/table.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

describe('table page integration (quick mode, seeded)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    __resetGameLoopForTests()
  })

  it('plays a betting → deal → act → settle round through the DOM', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({ rules, mode: 'quick', speed: 'normal', flair: false, botIds: ['bea'] }, 100_000, 21)

    const page = await mountSuspended(TablePage)
    // bet $25 and deal
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="deal"]').trigger('click')

    if (loop.phase.value === 'insurance') {
      await page.find('[data-testid="decline-insurance"]').trigger('click')
    }
    // stand through the hero's hands via the DOM
    let guard = 0
    while (loop.phase.value === 'playerTurns' && guard++ < 10) {
      await page.find('[data-testid="act-stand"]').trigger('click')
    }
    expect(loop.phase.value).toBe('complete')
    expect(store.history).toHaveLength(1)
    expect(page.text()).toMatch(/WIN|LOSE|PUSH|BLACKJACK|SURRENDER/)
    // flair off → no quips rendered
    expect(page.text()).not.toContain('“')
    // bankroll consistent with the recorded round
    const rec = store.history[0]!
    const hero = rec.spots.find(s => s.occupant === 'hero')!
    const net = hero.hands.reduce((s, h) => s + h.net, 0) + hero.insuranceNet
    expect(store.bankroll).toBe(100_000 + net)
  })
})
```

- [ ] **Step 3:** Run `pnpm test:nuxt test/nuxt/integration.test.ts` — PASS. Full gates clean.

- [ ] **Step 4: Commit**

```bash
git add app/composables/useGameLoop.ts test/nuxt/integration.test.ts
git commit -m "test(ui): full-round DOM integration smoke; gate bot quips on the flair setting"
```

---

### Task 14: Release notes & version

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1:** `package.json` version → `0.2.0`. Layout already displays it.

- [ ] **Step 2:** `CHANGELOG.md` — add above the engine entry under `## [Unreleased]`:

```markdown
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
```

- [ ] **Step 3:** `README.md` Status section → playable game shipped, training surfaces (advisor,
counting, history/analysis/learn/drills) land in 0.3.0; keep the engine description.

- [ ] **Step 4:** Full gates: `pnpm test && pnpm lint && pnpm typecheck` — green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: release notes for 0.2.0 playable game"
```

---

## Plan 2 complete — definition of done

- `pnpm test` green (engine suite untouched at 162+, nuxt suite ≈26 new tests across store/gameLoop/components/pages/integration).
- `pnpm lint` / `pnpm typecheck` clean; engine purity grep still empty.
- Manual: full casino-mode round with 2 bots feels like a table (paced deal, announcements, quips); quick mode is instant; mid-round refresh restores exactly; bust path exits cleanly; storage-disabled browsers still play.
- Carry-forward obligations all discharged (model-estimate label, discardCount, hole-revealed, no-peek caveat, side-bet gating) — verify each against the Architecture Notes checklist before closing.
- Plan 3 (training surfaces, fun-layer polish, mobile pass, E2E, deploy) is written after this plan lands.



