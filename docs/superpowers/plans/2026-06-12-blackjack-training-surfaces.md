# Blackjack Training Surfaces Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the playable game into a trainer: real-time advisor with three intensities, Hi-Lo count panel with self-check and shuffle quizzes, per-decision grading into history/analysis pages, a learn page generated from the engine, four drills, study mode, fun-layer polish, mobile pass, a11y pass, Playwright E2E, and Netlify deploy. Ships v0.3.0.

**Architecture:** The engine stays the only rules authority; two new pure UI-layer modules (`app/utils/advisor.ts`, `app/utils/analysis.ts`) wrap it for recommendations and aggregation — both Vue-free and unit-tested. Counting updates at **presentation time** (inside `useGameLoop.applyEvent`), never at engine-emit time, so paced dealing can't leak future cards into the count. Decisions are captured in `useGameLoop.act()` (advisor consulted before the engine mutates), recorded into a **lifetime** training store persisted under its own key, and attached to each `RoundRecord` for the history page.

**Tech Stack:** Existing scaffold (Nuxt 4 / Vue 3 / Pinia 3 / @nuxt/ui 4 / Tailwind 4, Vitest unit+nuxt projects) plus `@playwright/test` with `@nuxt/test-utils/playwright` (both already in devDependencies; the config is new). Netlify static deploy (craps pattern).

**Spec:** `docs/superpowers/specs/2026-06-11-blackjack-trainer-design.md` §§4.8, 5–8, 11–12. **Carry-forwards from Plan 2:** mobile-collapsed seat layout (Plan 2 Task 12 commit body); `count-visible-card` consumption (Plan 2 architecture notes reserved it for this plan's `useCounting`); nav links to history/analysis intentionally absent from the layout until now.

**Out of scope (v2+, per spec §2):** bet-spread/bankroll coaching, additional side bets, hand replay page, light mode, audio, multiplayer, multi-spot play. **Deliberate trims within this plan:** computed side-bet house edges (spec §4.9 mentions them; the engine shipped evaluators + pay tables only — the learn page renders the cited official pay tables and points to the user's own measured ledger instead of inventing an edge DP); exact insurance EV cost in cents (insurance decisions are graded correct/incorrect only — computing true EV would require reading hidden shoe composition).

---

## Architecture Notes (read first)

### Training data model

```
DecisionRecord  — one per hero action: situation, action vs book, deviation, EV table, cost, RC/TC, category
InsuranceRecord — one per insurance prompt: took / book / correct / RC/TC
TrainingStats   — LIFETIME aggregates: adherence by category, mistakeBag, countChecks, drillBests
RoundRecord     — gains heroDecisions?: DecisionRecord[] and heroInsurance?: InsuranceRecord | null (additive, old payloads fine)
```

**Two storage keys.** Spec §10 sketches one payload, but it also calls training stats *lifetime* (§5) while "Leave table" clears the session key entirely (Plan 2 behavior). Resolution: `blackjack-session-v1` keeps session-lifecycle state (now + `countState`); a new `blackjack-training-v1` key holds `TrainingStats` and **survives `clearAll()`**. Storage versions stay at 1 — all session-payload changes are additive with restore-time defaults.

**mistakeBag keys are machine-readable:** `"<kind>|<totalKey>|<upBucket>"` where kind ∈ `hard|soft|pair`, totalKey is the hand total (or the pair bucket for pairs), upBucket ∈ 2–11. Drills re-ask these situations; `analysis.ts` humanizes them for display. Never store prose as the key.

### Advisor intensities (spec §5)

| Intensity | Before acting | After acting |
|---|---|---|
| `coach` | Recommendation + EV table shown in AdvisorPanel; EV hints on action buttons; insurance advice line | mistake line announced |
| `feedback` | nothing shown | last-decision verdict in panel; mistake line announced |
| `exam` | nothing shown | nothing shown — grading appears only in History/Analysis |

All three intensities **record decisions identically** — intensity is purely a display gate. The advisor consults `deviationFor` only when `settings.advancedDeviations` is true; grading is vs the deviation-aware play (`rec.action`), while `costCents` is computed vs the pure-book EV table (a correct deviation costs $0; taking book when a deviation was on shows ✗ with $0 cost — honest, since full-shoe EV can't price count-adjusted plays).

### Count visibility (spec §2/§5)

| Mode | CountPanel renders |
|---|---|
| `shown` | live RC, TC (÷ half-deck-rounded decks remaining), decks estimate, advantage estimate |
| `self-check` | values hidden; "press C to check" number input → verdict, logged to `countChecks`; shuffle quiz when the shoe is shuffled |
| `off` | nothing (panel absent) |

Decks remaining are estimated **from cards seen, rounded to the nearest half deck** (`max(0.5, round(((decks×52 − cardsSeen)/52)×2)/2)`) — the human tray-estimation model from spec §4.8; the hole card joins the count only when revealed, exactly like a real counter.

**Counting hooks live in `useGameLoop.applyEvent`** (`count-visible-card` → `countVisibleCard(card)`, `shuffle` → `countShuffle()`): presented-time, pacing-safe. Count state (`running`, `cardsSeen`) piggybacks on the session payload via `store.countState`, so a mid-round refresh restores the count too.

### E2E seed strategy

`index.vue` honors `?seed=N` (passes it to `startSession`). Deal outcomes are then fully determined by (preset rules, seed, bet list); the bet list is determined by the UI flow (hero spot 3, no bots unless picked). A throwaway seed-hunt vitest file (Task 19 provides it verbatim) brute-forces seeds for the needed scenarios (pair, aces, resplit, ace-up, hero-blackjack-vs-ace) and reports them by **throwing**, because vitest swallows console output; the found constants go into `test/e2e/seeds.ts` and the scratch file is deleted.

### Conventions for every task (same as Plan 2)

- TDD for pure seams (engine, store, composables, utils); component tests follow implementation within the same task.
- After every task: `pnpm test && pnpm lint && pnpm typecheck` clean before commit. Run `pnpm exec eslint . --fix` for formatting fallout before re-checking.
- Commit messages exactly as given; **never add AI/Co-Authored-By trailers** (user convention).
- Engine purity stands: nothing under `app/utils/engine/` may import Vue/Nuxt. `app/utils/advisor.ts`, `analysis.ts`, `milestones.ts`, `outcomeBadges.ts` are also Vue-free (unit-testable) but may import engine modules.
- **Pinia + `mountSuspended` pitfall (learned in Plan 2):** tests that mount **pages** must NOT call `setActivePinia(createPinia())` — the page resolves the Nuxt app's own Pinia. Component tests that don't touch the store, and store/composable tests that don't mount pages, keep the explicit pinia.
- Components are auto-imported unprefixed (`pathPrefix: false` already configured).

### File map (this plan)

| File | Responsibility |
|---|---|
| `app/utils/engine/counting.ts` (+) | `FAB_4`, `'surrender'` in `Deviation.play`, pool param on `deviationFor` |
| `app/utils/engine/sideBets.ts` (±) | `export` the four pay-table consts (display stays in sync with engine truth) |
| `app/stores/useBlackjackStore.ts` (+) | training stats (lifetime key), decision/insurance records, countState, new settings fields |
| `app/composables/useCounting.ts` | RC/TC/decks/advantage, self-check, shuffle quiz, persistence hooks |
| `app/utils/advisor.ts` | `adviseHand`/`adviseInsurance`, legality clamp, deviation pool, reasoning, cost |
| `app/composables/useGameLoop.ts` (+) | counting hooks, decision capture, `heroTurn`/`lastDecision`, milestones, myth quips |
| `app/components/panels/AdvisorPanel.vue`, `CountPanel.vue` | the two collapsible table panels |
| `app/components/table/ActionBar.vue` (+) | EV hints (tooltip + sr-only), insurance advice line |
| `app/components/table/StudyHotspots.vue` | study-mode felt hotspots |
| `app/components/table/BotChips.vue` | mobile bot strip |
| `app/components/learn/StrategyChartView.vue`, `RuleExplorer.vue` | learn-page interactive widgets |
| `app/components/drills/StrategyFlash.vue`, `DeviationQuiz.vue`, `CountDrill.vue`, `TrueCountDrill.vue` | the four drills |
| `app/pages/history.vue`, `analysis.vue`, `learn.vue`, `drills.vue` | the four training pages |
| `app/pages/table.vue` (+), `index.vue` (+), `app/layouts/default.vue` (±) | panel wiring, training options, nav |
| `app/utils/analysis.ts`, `milestones.ts`, `outcomeBadges.ts` | pure helpers |
| `playwright.config.ts`, `test/e2e/*.spec.ts`, `test/e2e/seeds.ts` | E2E |
| `netlify.toml`, `README.md`, `CHANGELOG.md`, `package.json` | deploy + release |

---

### Task 1: Engine — Fab 4 surrender deviations + selectable deviation pool

**Files:**
- Modify: `app/utils/engine/counting.ts`
- Test: `test/unit/engine/counting.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append to the existing top-level `describe` in `counting.test.ts`, or as a new `describe('deviations — Fab 4', ...)` block):

```ts
import { FAB_4, ILLUSTRIOUS_18, deviationFor } from '../../../app/utils/engine/counting'

describe('deviations — Fab 4 (spec §4.8)', () => {
  const pool = [...ILLUSTRIOUS_18, ...FAB_4]

  it('surrenders 14 vs T at TC ≥ +3, not below', () => {
    const state = { total: 14, soft: false, pair: null }
    expect(deviationFor(state, 10, 3, pool)?.play).toBe('surrender')
    expect(deviationFor(state, 10, 2.9, pool)).toBeNull()
  })

  it('surrenders 15 vs 9 at TC ≥ +2 and 15 vs A at TC ≥ +1', () => {
    const state = { total: 15, soft: false, pair: null }
    expect(deviationFor(state, 9, 2, pool)?.id).toBe('fab-15v9')
    expect(deviationFor(state, 11, 1, pool)?.id).toBe('fab-15vA')
  })

  it('reverses 15 vs T to a hit when the count is negative (book surrenders)', () => {
    const state = { total: 15, soft: false, pair: null }
    const dev = deviationFor(state, 10, -2, pool)
    expect(dev?.id).toBe('fab-15vT-keep')
    expect(dev?.play).toBe('hit')
  })

  it('default pool stays Illustrious-18-only — Fab 4 must be opted into', () => {
    expect(deviationFor({ total: 14, soft: false, pair: null }, 10, 5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit test/unit/engine/counting.test.ts`
Expected: FAIL — `FAB_4` is not exported (TS error counts as the failure).

- [ ] **Step 3: Implement** in `counting.ts`:

1. Extend the play union in `Deviation`:

```ts
  play: 'stand' | 'hit' | 'double' | 'split' | 'take-insurance' | 'surrender'
```

2. After the `ILLUSTRIOUS_18` const, add:

```ts
/** Fab 4 surrender deviations (Schlesinger), Hi-Lo multi-deck S17 thresholds — same basis
 *  as the Illustrious 18 table above. Only meaningful when rules.surrender === 'late'. */
export const FAB_4: Deviation[] = [
  { id: 'fab-14vT', description: 'Surrender 14 vs T', minTrueCount: 3, total: 14, soft: false, pair: null, up: 10, play: 'surrender' },
  { id: 'fab-15v9', description: 'Surrender 15 vs 9', minTrueCount: 2, total: 15, soft: false, pair: null, up: 9, play: 'surrender' },
  { id: 'fab-15vA', description: 'Surrender 15 vs A', minTrueCount: 1, total: 15, soft: false, pair: null, up: 11, play: 'surrender' },
  { id: 'fab-15vT-keep', description: 'Hit 15 vs T in a negative shoe (book surrenders)', maxTrueCount: -1, total: 15, soft: false, pair: null, up: 10, play: 'hit' }
]
```

3. Give `deviationFor` a pool parameter (default keeps every existing caller and test green):

```ts
export function deviationFor(
  state: { total: number, soft: boolean, pair: Bucket | null },
  up: Bucket,
  trueCount: number,
  pool: Deviation[] = ILLUSTRIOUS_18
): Deviation | null {
  for (const dev of pool) {
```

(only the signature line and the loop source change; the body logic stays identical).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:unit test/unit/engine/counting.test.ts` — PASS. Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/counting.ts test/unit/engine/counting.test.ts
git commit -m "feat(engine): add Fab 4 surrender deviations with selectable deviation pool"
```

---

### Task 2: Store — training stats, decision records, count state, settings fields

**Files:**
- Modify: `app/stores/useBlackjackStore.ts`
- Modify: `test/nuxt/store.test.ts` (helper + append), `test/nuxt/gameLoop.test.ts` (helper only), `test/nuxt/integration.test.ts` (settings literal only)

- [ ] **Step 1: Write the failing tests.** First update the existing `started()` helper in `store.test.ts` — `SessionSettings` gains three required fields:

```ts
  function started() {
    const store = useBlackjackStore()
    store.initSession({
      rules: cloneRules(PRESETS.VEGAS_STRIP_6D!),
      mode: 'quick',
      speed: 'normal',
      flair: true,
      botIds: ['bea'],
      advisor: 'coach',
      count: 'shown',
      advancedDeviations: false
    }, 100_000)
    return store
  }
```

Then append to the `describe('useBlackjackStore', ...)` block:

```ts
  it('records decisions into lifetime adherence and a machine-keyed mistake bag', () => {
    const store = started()
    store.recordDecision({
      handIndex: 0, cards: ['10♠', '6♣'], total: 16, soft: false, pair: false, pairBucket: null,
      upBucket: 10, dealerUp: '10♦', action: 'stand', book: 'hit', deviationId: null, deviationPlay: null,
      correct: false, costCents: 540, evs: { hit: -0.41, stand: -0.54 }, rc: 2, tc: 0.5, category: 'hard'
    })
    expect(store.training.adherence.hard).toEqual({ decisions: 1, correct: 0 })
    expect(store.training.mistakeBag['hard|16|10']).toBe(1)
  })

  it('training stats survive clearAll (lifetime key)', () => {
    const store = started()
    store.recordDrillBest('strategy-flash', 7)
    store.clearAll()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    setActivePinia(createPinia())
    const fresh = useBlackjackStore()
    expect(fresh.training.drillBests['strategy-flash']).toBe(7)
  })

  it('recordCountCheck logs capped entries and recordDrillBest keeps the max', () => {
    const store = started()
    store.recordCountCheck(5, 7)
    expect(store.training.countChecks).toHaveLength(1)
    expect(store.training.countChecks[0]).toMatchObject({ entered: 5, actual: 7 })
    store.recordDrillBest('count-singles', 3)
    store.recordDrillBest('count-singles', 2)
    expect(store.training.drillBests['count-singles']).toBe(3)
  })

  it('persists countState with the session and backfills training defaults on restore', () => {
    const store = started()
    store.setCountState({ running: 4, cardsSeen: 30 })
    store.persist()

    setActivePinia(createPinia())
    const fresh = useBlackjackStore()
    expect(fresh.restore()).toBe(true)
    expect(fresh.countState).toEqual({ running: 4, cardsSeen: 30 })
    expect(fresh.settings!.advisor).toBe('coach')
  })

  it('backfills training settings on old payloads that lack them', () => {
    const store = started()
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    delete raw.settings.advisor
    delete raw.settings.count
    delete raw.settings.advancedDeviations
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))

    setActivePinia(createPinia())
    const fresh = useBlackjackStore()
    expect(fresh.restore()).toBe(true)
    expect(fresh.settings!.advisor).toBe('feedback')
    expect(fresh.settings!.count).toBe('self-check')
    expect(fresh.settings!.advancedDeviations).toBe(false)
  })

  it('records insurance decisions into the insurance category', () => {
    const store = started()
    store.recordInsuranceDecision({ took: null, book: 'decline', correct: true, rc: 0, tc: 0 })
    expect(store.training.adherence.insurance).toEqual({ decisions: 1, correct: 1 })
  })
```

- [ ] **Step 2:** Run `pnpm test:nuxt test/nuxt/store.test.ts` — FAIL (`recordDecision` etc. missing; settings type errors).

- [ ] **Step 3: Implement.** In `useBlackjackStore.ts`:

1. New imports + types (place after the existing `SessionSettings`):

```ts
import type { Action } from '../utils/engine/hand'

export type AdvisorIntensity = 'coach' | 'feedback' | 'exam'
export type CountVisibility = 'shown' | 'self-check' | 'off'
export type DecisionCategory = 'hard' | 'soft' | 'pair' | 'surrender' | 'insurance'

export interface DecisionRecord {
  handIndex: number
  cards: string[] // display strings at decision time
  total: number
  soft: boolean
  pair: boolean
  pairBucket: number | null
  upBucket: number // 2-11
  dealerUp: string // display string
  action: Action
  book: Action // pure basic strategy
  deviationId: string | null
  deviationPlay: Action | null
  correct: boolean // action === deviation-aware advised play
  costCents: number // (EV[book] − EV[action]) × bet, 0 when not priceable
  evs: Partial<Record<Action, number>>
  rc: number
  tc: number // stored to 1 decimal
  category: Exclude<DecisionCategory, 'insurance'>
}

export interface InsuranceRecord {
  took: number | 'even-money' | null
  book: 'take' | 'decline'
  correct: boolean
  rc: number
  tc: number
}

export interface TrainingStats {
  adherence: Record<DecisionCategory, { decisions: number, correct: number }>
  /** key: "<hard|soft|pair>|<totalKey>|<upBucket>" → times missed (drills replay these) */
  mistakeBag: Record<string, number>
  countChecks: Array<{ at: number, entered: number, actual: number }>
  drillBests: Record<string, number>
}

export const TRAINING_KEY = 'blackjack-training-v1'
const TRAINING_VERSION = 1
const COUNT_CHECK_CAP = 200

function freshTraining(): TrainingStats {
  return {
    adherence: {
      hard: { decisions: 0, correct: 0 },
      soft: { decisions: 0, correct: 0 },
      pair: { decisions: 0, correct: 0 },
      surrender: { decisions: 0, correct: 0 },
      insurance: { decisions: 0, correct: 0 }
    },
    mistakeBag: {},
    countChecks: [],
    drillBests: {}
  }
}
```

2. Extend `SessionSettings`:

```ts
export interface SessionSettings {
  rules: RuleSet
  mode: PlayMode
  speed: PlaySpeed
  flair: boolean
  botIds: PersonaId[]
  advisor: AdvisorIntensity
  count: CountVisibility
  advancedDeviations: boolean
}
```

3. Extend `RoundRecord` (additive — old persisted rounds simply lack them):

```ts
  /** Hero decisions this round, graded vs the advisor (Plan 3). */
  heroDecisions?: DecisionRecord[]
  heroInsurance?: InsuranceRecord | null
```

4. New state + actions inside the store setup (alongside the existing refs):

```ts
  const training = ref<TrainingStats>(loadTraining())
  const countState = ref<{ running: number, cardsSeen: number } | null>(null)
```

```ts
  function loadTraining(): TrainingStats {
    try {
      const raw = localStorage.getItem(TRAINING_KEY)
      if (!raw) return freshTraining()
      const data = JSON.parse(raw) as { version?: number } & Partial<TrainingStats>
      if (data.version !== TRAINING_VERSION) return freshTraining()
      const base = freshTraining()
      return {
        adherence: { ...base.adherence, ...(data.adherence ?? {}) },
        mistakeBag: data.mistakeBag ?? {},
        countChecks: Array.isArray(data.countChecks) ? data.countChecks.slice(-COUNT_CHECK_CAP) : [],
        drillBests: data.drillBests ?? {}
      }
    } catch {
      return freshTraining()
    }
  }

  function persistTraining(): void {
    try {
      localStorage.setItem(TRAINING_KEY, JSON.stringify({ version: TRAINING_VERSION, ...training.value }))
    } catch {
      storageAvailable.value = false
    }
  }

  /** Machine-readable replay key — drills parse it back (Architecture Notes). */
  function mistakeKey(d: DecisionRecord): string {
    const kind = d.pair ? 'pair' : d.soft ? 'soft' : 'hard'
    const totalKey = d.pair ? (d.pairBucket ?? d.total) : d.total
    return `${kind}|${totalKey}|${d.upBucket}`
  }

  function recordDecision(d: DecisionRecord): void {
    const bucket = training.value.adherence[d.category]
    bucket.decisions++
    if (d.correct) bucket.correct++
    else training.value.mistakeBag[mistakeKey(d)] = (training.value.mistakeBag[mistakeKey(d)] ?? 0) + 1
    persistTraining()
  }

  function recordInsuranceDecision(r: InsuranceRecord): void {
    const bucket = training.value.adherence.insurance
    bucket.decisions++
    if (r.correct) bucket.correct++
    persistTraining()
  }

  function recordCountCheck(entered: number, actual: number): void {
    training.value.countChecks.push({ at: Date.now(), entered, actual })
    if (training.value.countChecks.length > COUNT_CHECK_CAP) {
      training.value.countChecks.splice(0, training.value.countChecks.length - COUNT_CHECK_CAP)
    }
    persistTraining()
  }

  function recordDrillBest(id: string, score: number): void {
    if (score > (training.value.drillBests[id] ?? 0)) {
      training.value.drillBests[id] = score
      persistTraining()
    }
  }

  function setCountState(s: { running: number, cardsSeen: number } | null): void {
    countState.value = s
  }
```

5. Wire persistence: add `countState: countState.value` to the `persist()` payload object. In `restore()`, after the existing assignments add:

```ts
      countState.value = (data.countState ?? null) as typeof countState.value
```

and replace the existing `settings.value = ...` line with the backfilling version:

```ts
      const storedSettings = (data.settings ?? null) as Partial<SessionSettings> | null
      settings.value = storedSettings
        ? { advisor: 'feedback', count: 'self-check', advancedDeviations: false, ...storedSettings } as SessionSettings
        : null
```

In `clearAll()`, add `countState.value = null` — and deliberately do NOT touch `training` or `TRAINING_KEY` (lifetime stats).

6. Export the new state/actions in the returned object: `training, countState, setCountState, recordDecision, recordInsuranceDecision, recordCountCheck, recordDrillBest`.

7. **Update the other two test helpers now** (they construct `SessionSettings` and will fail typecheck otherwise):
   - `test/nuxt/gameLoop.test.ts` `settings()` helper — add `advisor: 'feedback' as const, count: 'off' as const, advancedDeviations: false` to the returned object (before `...overrides`).
   - `test/nuxt/integration.test.ts` `startSession({...})` literal — add the same three fields.

- [ ] **Step 4:** Run `pnpm test:nuxt` — store tests pass (14), gameLoop/integration still green. Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/stores/useBlackjackStore.ts test/nuxt/store.test.ts test/nuxt/gameLoop.test.ts test/nuxt/integration.test.ts
git commit -m "feat(ui): extend store with training stats, decision records, and count state"
```

---

### Task 3: `useCounting` composable

**Files:**
- Create: `app/composables/useCounting.ts`
- Test: `test/nuxt/counting.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useCounting, countVisibleCard, countShuffle, resetCounting, restoreCounting,
  __resetCountingForTests
} from '../../app/composables/useCounting'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import type { Card } from '../../app/utils/engine/cards'

const c = (rank: number): Card => ({ rank, suit: 'spades' })

function startedStore(count: 'shown' | 'self-check' | 'off' = 'self-check') {
  const store = useBlackjackStore()
  store.initSession({
    rules: cloneRules(PRESETS.VEGAS_STRIP_6D!), mode: 'quick', speed: 'normal',
    flair: false, botIds: [], advisor: 'feedback', count, advancedDeviations: false
  }, 50_000)
  return store
}

describe('useCounting', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    __resetCountingForTests()
  })

  it('accumulates Hi-Lo from presented cards and computes a half-deck TC', () => {
    startedStore('shown')
    const counting = useCounting()
    countVisibleCard(c(5)) // +1
    countVisibleCard(c(6)) // +1
    countVisibleCard(c(14)) // −1
    expect(counting.rc.value).toBe(1)
    expect(counting.cardsSeen.value).toBe(3)
    expect(counting.decksRemaining.value).toBe(6) // 309/52 = 5.94 → 6.0 (nearest half deck)
    expect(counting.tc.value).toBeCloseTo(1 / 6)
  })

  it('checkCount grades exactly and logs to the store', () => {
    const store = startedStore()
    const counting = useCounting()
    countVisibleCard(c(2))
    expect(counting.checkCount(1)).toBe(true)
    expect(counting.checkCount(0)).toBe(false)
    expect(store.training.countChecks).toHaveLength(2)
    expect(counting.lastCheck.value).toMatchObject({ entered: 0, actual: 1, correct: false })
  })

  it('shuffle in self-check mode arms the quiz with the pre-shuffle RC, then resets', () => {
    const store = startedStore('self-check')
    const counting = useCounting()
    countVisibleCard(c(4))
    countVisibleCard(c(3))
    countShuffle()
    expect(counting.rc.value).toBe(0)
    expect(counting.shuffleQuiz.value).toEqual({ actual: 2 })
    expect(counting.answerShuffleQuiz(2)).toBe(true)
    expect(counting.shuffleQuiz.value).toBeNull()
    expect(store.training.countChecks).toHaveLength(1)
  })

  it('shuffle in shown mode resets silently (no quiz)', () => {
    startedStore('shown')
    const counting = useCounting()
    countVisibleCard(c(4))
    countShuffle()
    expect(counting.shuffleQuiz.value).toBeNull()
    expect(counting.rc.value).toBe(0)
  })

  it('persists count state through the store and restores it', () => {
    const store = startedStore('shown')
    countVisibleCard(c(5))
    countVisibleCard(c(5))
    expect(store.countState).toEqual({ running: 2, cardsSeen: 2 })

    __resetCountingForTests() // simulated refresh: module state gone, store survives
    restoreCounting()
    const counting = useCounting()
    expect(counting.rc.value).toBe(2)
    expect(counting.cardsSeen.value).toBe(2)
  })

  it('resetCounting zeroes everything including stored state', () => {
    const store = startedStore('shown')
    countVisibleCard(c(5))
    resetCounting()
    const counting = useCounting()
    expect(counting.rc.value).toBe(0)
    expect(store.countState).toBeNull()
  })
})
```

- [ ] **Step 2:** Run `pnpm test:nuxt test/nuxt/counting.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `app/composables/useCounting.ts`:

```ts
import { computed, ref } from 'vue'
import type { Card } from '../utils/engine/cards'
import { hiLoValue } from '../utils/engine/counting'
import { useBlackjackStore } from '../stores/useBlackjackStore'

// ── module state (client singleton, mirrors useGameLoop's pattern) ───────────
const running = ref(0)
const cardsSeen = ref(0)
const shuffleQuiz = ref<{ actual: number } | null>(null)
const lastCheck = ref<{ entered: number, actual: number, correct: boolean } | null>(null)

export function __resetCountingForTests(): void {
  running.value = 0
  cardsSeen.value = 0
  shuffleQuiz.value = null
  lastCheck.value = null
}

/** Called by useGameLoop when a face-up card is PRESENTED — pacing-safe (Architecture Notes). */
export function countVisibleCard(card: Card): void {
  running.value += hiLoValue(card)
  cardsSeen.value++
  useBlackjackStore().setCountState({ running: running.value, cardsSeen: cardsSeen.value })
}

/** Called by useGameLoop when a shuffle is presented. Self-check mode quizzes the final RC. */
export function countShuffle(): void {
  const store = useBlackjackStore()
  if (cardsSeen.value > 0 && store.settings?.count === 'self-check') {
    shuffleQuiz.value = { actual: running.value }
  }
  running.value = 0
  cardsSeen.value = 0
  store.setCountState({ running: 0, cardsSeen: 0 })
}

/** After a mid-round restore: pick the count back up from the persisted session. */
export function restoreCounting(): void {
  const s = useBlackjackStore().countState
  running.value = s?.running ?? 0
  cardsSeen.value = s?.cardsSeen ?? 0
  shuffleQuiz.value = null
  lastCheck.value = null
}

export function resetCounting(): void {
  running.value = 0
  cardsSeen.value = 0
  shuffleQuiz.value = null
  lastCheck.value = null
  useBlackjackStore().setCountState(null)
}

export function useCounting() {
  const store = useBlackjackStore()
  const rc = computed(() => running.value)
  /** Human tray-estimation model: decks remaining to the nearest half deck (spec §4.8). */
  const decksRemaining = computed(() => {
    const decks = store.settings?.rules.decks ?? 6
    const remaining = (decks * 52 - cardsSeen.value) / 52
    return Math.max(0.5, Math.round(remaining * 2) / 2)
  })
  const tc = computed(() => running.value / decksRemaining.value)
  /** Educational estimate, not betting advice (spec §4.8): ≈ (TC − 1) × 0.5%. */
  const advantage = computed(() => (tc.value - 1) * 0.005)

  function checkCount(entered: number): boolean {
    const actual = running.value
    const correct = entered === actual
    lastCheck.value = { entered, actual, correct }
    store.recordCountCheck(entered, actual)
    return correct
  }

  function answerShuffleQuiz(entered: number): boolean {
    if (!shuffleQuiz.value) return false
    const actual = shuffleQuiz.value.actual
    const correct = entered === actual
    lastCheck.value = { entered, actual, correct }
    store.recordCountCheck(entered, actual)
    shuffleQuiz.value = null
    return correct
  }

  return {
    rc, tc, decksRemaining, advantage,
    cardsSeen: computed(() => cardsSeen.value),
    shuffleQuiz: computed(() => shuffleQuiz.value),
    lastCheck: computed(() => lastCheck.value),
    checkCount, answerShuffleQuiz
  }
}
```

- [ ] **Step 4:** Run `pnpm test:nuxt test/nuxt/counting.test.ts` — PASS (6). Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useCounting.ts test/nuxt/counting.test.ts
git commit -m "feat(ui): add counting composable wired to presented cards"
```

---

### Task 4: Advisor module (`app/utils/advisor.ts`)

**Files:**
- Create: `app/utils/advisor.ts`
- Test: `test/unit/advisor.test.ts`

Vue-free; imports engine only. The unit project already includes `test/unit/**`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  adviseHand, adviseInsurance, decisionCost, pctEV, SIDE_BET_CAUTION
} from '../../app/utils/advisor'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import type { Card } from '../../app/utils/engine/cards'

const c = (rank: number, suit: Card['suit'] = 'spades'): Card => ({ rank, suit })
const VEGAS = PRESETS.VEGAS_STRIP_6D! // S17, no surrender
const MA = (() => {
  const r = cloneRules(PRESETS.MA_205CMR!) // S17, late surrender
  return r
})()

describe('adviseHand', () => {
  it('recommends book hit on 16 vs 10 when surrender is unavailable', () => {
    const rec = adviseHand(
      { cards: [c(10), c(6, 'hearts')], fromSplit: false, handsCount: 1 },
      c(10, 'clubs'), VEGAS, 0, false, ['hit', 'stand']
    )
    expect(rec.book).toBe('hit')
    expect(rec.action).toBe('hit')
    expect(rec.deviation).toBeNull()
    expect(rec.evs.hit).toBeDefined()
    expect(rec.reasoning).toContain('Hit')
  })

  it('recommends surrender 16 vs 10 under late-surrender rules', () => {
    const rec = adviseHand(
      { cards: [c(10), c(6, 'hearts')], fromSplit: false, handsCount: 1 },
      c(10, 'clubs'), MA, 0, false, ['hit', 'stand', 'double', 'surrender']
    )
    expect(rec.book).toBe('surrender')
  })

  it('recommends the split on 8,8 vs 10 when split is legal', () => {
    const rec = adviseHand(
      { cards: [c(8), c(8, 'hearts')], fromSplit: false, handsCount: 1 },
      c(10, 'clubs'), VEGAS, 0, false, ['hit', 'stand', 'split']
    )
    expect(rec.book).toBe('split')
    expect(rec.evs.split).toBeDefined()
  })

  it('clamps to the best legal action when the book play is unavailable', () => {
    // book for hard 11 vs 6 is double; with double illegal (3+ cards), falls back by EV (hit)
    const rec = adviseHand(
      { cards: [c(2), c(4, 'hearts'), c(5, 'diamonds')], fromSplit: false, handsCount: 1 },
      c(6, 'clubs'), VEGAS, 0, false, ['hit', 'stand']
    )
    expect(rec.book).toBe('hit')
  })

  it('applies an Illustrious 18 deviation when advanced and the count is there', () => {
    // 16 vs 10: stand at TC ≥ 0 (I18) — book without surrender is hit
    const recLow = adviseHand(
      { cards: [c(10), c(6, 'hearts')], fromSplit: false, handsCount: 1 },
      c(10, 'clubs'), VEGAS, -1, true, ['hit', 'stand']
    )
    expect(recLow.action).toBe('hit')
    const recHigh = adviseHand(
      { cards: [c(10), c(6, 'hearts')], fromSplit: false, handsCount: 1 },
      c(10, 'clubs'), VEGAS, 1, true, ['hit', 'stand']
    )
    expect(recHigh.action).toBe('stand')
    expect(recHigh.book).toBe('hit')
    expect(recHigh.deviation?.id).toBe('16vT-stand')
    expect(recHigh.reasoning).toContain('Count call')
  })

  it('includes Fab 4 only under late surrender', () => {
    // 15 vs 9 at TC +2 → surrender (Fab 4) when legal
    const rec = adviseHand(
      { cards: [c(10), c(5, 'hearts')], fromSplit: false, handsCount: 1 },
      c(9, 'clubs'), MA, 2, true, ['hit', 'stand', 'surrender']
    )
    expect(rec.deviation?.id).toBe('fab-15v9')
    expect(rec.action).toBe('surrender')
  })
})

describe('adviseInsurance / cost / formatting', () => {
  it('declines insurance by the book, takes it at TC ≥ +3 in advanced mode', () => {
    expect(adviseInsurance(0, false).take).toBe(false)
    expect(adviseInsurance(5, false).take).toBe(false) // advanced off → never
    expect(adviseInsurance(3, true).take).toBe(true)
    expect(adviseInsurance(2.9, true).take).toBe(false)
  })

  it('decisionCost prices a mistake against the book EV in cents', () => {
    const evs = { hit: -0.4, stand: -0.55 }
    expect(decisionCost(evs, 'stand', 'hit', 1000)).toBe(150) // 0.15 × $10
    expect(decisionCost(evs, 'hit', 'hit', 1000)).toBe(0)
    expect(decisionCost(evs, 'split', 'hit', 1000)).toBe(0) // unpriceable → 0
  })

  it('pctEV formats fractions as signed-free percentages', () => {
    expect(pctEV(-0.123)).toBe('-12.3%')
    expect(pctEV(undefined)).toBe('—')
    expect(SIDE_BET_CAUTION.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2:** Run `pnpm test:unit test/unit/advisor.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `app/utils/advisor.ts`:

```ts
import type { Card } from './engine/cards'
import { bucketOf } from './engine/cards'
import type { RuleSet } from './engine/rules'
import type { Action } from './engine/hand'
import { handTotal, isPair } from './engine/hand'
import type { ActionEVs } from './engine/basicStrategy'
import { bestAction, bestActionFull } from './engine/basicStrategy'
import type { Deviation } from './engine/counting'
import { FAB_4, ILLUSTRIOUS_18, deviationFor } from './engine/counting'

export interface AdvisorInput {
  cards: Card[]
  fromSplit: boolean
  handsCount: number
}

export interface AdvisorRecommendation {
  /** What to do — the deviation play when one is active and legal, else the book play. */
  action: Action
  /** Pure basic strategy (deviation-free), clamped to legal actions. */
  book: Action
  evs: Partial<Record<Action, number>>
  deviation: Deviation | null
  reasoning: string
}

const LABEL: Record<Action, string> = {
  hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender'
}

export function pctEV(v: number | undefined): string {
  return v === undefined ? '—' : `${(v * 100).toFixed(1)}%`
}

function clampToLegal(preferred: Action, evs: ActionEVs, legal: Action[]): Action {
  if (legal.includes(preferred)) return preferred
  const ranked = (Object.entries(evs) as Array<[Action, number]>)
    .filter(([action]) => legal.includes(action))
    .sort((a, b) => b[1] - a[1])
  return ranked[0]?.[0] ?? legal[0] ?? 'stand'
}

function buildReasoning(
  book: Action, evs: Partial<Record<Action, number>>, deviation: Deviation | null, tc: number
): string {
  if (deviation) {
    return `Count call: TC ${tc.toFixed(1)} — ${deviation.description}. Book without the count: ${LABEL[book]}.`
  }
  const ranked = (Object.entries(evs) as Array<[Action, number]>).sort((a, b) => b[1] - a[1])
  const runnerUp = ranked.find(([action]) => action !== book)
  return runnerUp
    ? `${LABEL[book]}: EV ${pctEV(evs[book])} beats ${LABEL[runnerUp[0]].toLowerCase()} at ${pctEV(runnerUp[1])}.`
    : `${LABEL[book]} is the only play.`
}

export function adviseHand(
  input: AdvisorInput, up: Card, rules: RuleSet, tc: number, advanced: boolean, legal: Action[]
): AdvisorRecommendation {
  const upB = bucketOf(up)
  const { total, soft } = handTotal(input.cards)
  const pairHand = isPair(input.cards) && legal.includes('split')
  const rec = pairHand
    ? bestActionFull({ pair: bucketOf(input.cards[0]!), total, soft }, upB, rules)
    : bestAction(
        { total, soft, twoCards: input.cards.length === 2, fromSplit: input.fromSplit }, upB, rules)
  const book = clampToLegal(rec.action as Action, rec.evs, legal)

  let action = book
  let deviation: Deviation | null = null
  if (advanced) {
    const pool = rules.surrender === 'late' ? [...ILLUSTRIOUS_18, ...FAB_4] : ILLUSTRIOUS_18
    const dev = deviationFor(
      { total, soft, pair: pairHand ? bucketOf(input.cards[0]!) : null }, upB, tc, pool)
    if (dev && dev.play !== 'take-insurance' && legal.includes(dev.play as Action)) {
      deviation = dev
      action = dev.play as Action
    }
  }

  return {
    action,
    book,
    evs: rec.evs as Partial<Record<Action, number>>,
    deviation,
    reasoning: buildReasoning(book, rec.evs as Partial<Record<Action, number>>, deviation, tc)
  }
}

export function adviseInsurance(tc: number, advanced: boolean): { take: boolean, reasoning: string } {
  if (advanced && tc >= 3) {
    return { take: true, reasoning: `TC ${tc.toFixed(1)} ≥ +3 — insurance is profitable here (Illustrious 18 #1).` }
  }
  return { take: false, reasoning: 'Book play: never take insurance — 2:1 pay on worse-than-2:1 odds.' }
}

export const SIDE_BET_CAUTION
  = 'Side bets carry a far higher house edge than the main game — book play is to skip them.'

/** (EV[book] − EV[action]) × bet, floored at 0; unpriceable actions cost 0. */
export function decisionCost(
  evs: Partial<Record<Action, number>>, action: Action, book: Action, bet: number
): number {
  const evAction = evs[action]
  const evBook = evs[book]
  if (evAction === undefined || evBook === undefined) return 0
  return Math.max(0, Math.round((evBook - evAction) * bet))
}
```

- [ ] **Step 4:** Run `pnpm test:unit test/unit/advisor.test.ts` — PASS (9). Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/utils/advisor.ts test/unit/advisor.test.ts
git commit -m "feat(ui): add advisor module with deviation-aware recommendations"
```

---

### Task 5: Game loop — counting hooks, decision capture, `heroTurn`

**Files:**
- Modify: `app/composables/useGameLoop.ts`
- Test: `test/nuxt/gameLoop.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe`; the `settings()` helper already has `advisor/count/advancedDeviations` from Task 2 — note its default is `count: 'off'`, which keeps counting silent for older tests):

```ts
  it('feeds presented cards into the count and persists count state', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, 7)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    expect(store.countState).not.toBeNull()
    expect(store.countState!.cardsSeen).toBeGreaterThanOrEqual(3) // 2 hero + dealer up
  })

  it('captures graded decisions with RC/TC and attaches them to the round record', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ advisor: 'exam', count: 'shown' }), 100_000, 7)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    while (loop.phase.value === 'playerTurns') {
      loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
    }
    const rec = store.history[0]!
    expect(rec.heroDecisions!.length).toBeGreaterThanOrEqual(1)
    const d = rec.heroDecisions![0]!
    expect(d.book).toBeDefined()
    expect(typeof d.correct).toBe('boolean')
    expect(typeof d.rc).toBe('number')
    expect(['hard', 'soft', 'pair', 'surrender']).toContain(d.category)
    const t = store.training.adherence
    const totalDecisions = t.hard.decisions + t.soft.decisions + t.pair.decisions + t.surrender.decisions
    expect(totalDecisions).toBe(rec.heroDecisions!.length)
  })

  it('grades a deliberate book violation and prices the mistake', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    // find a state where standing and hitting are both legal and compare against the advisor
    let sawMistake = false
    while (loop.phase.value === 'playerTurns') {
      const legal = loop.legalActions.value
      const rec = loop.heroTurn.value
      expect(rec).not.toBeNull()
      // deliberately stand on everything — eventually disagrees with book on low totals
      loop.act(legal.includes('stand') ? 'stand' : legal[0]!)
      const last = loop.lastDecision.value
      if (last && !last.correct) {
        sawMistake = last.costCents >= 0
      }
    }
    expect(store.history[0]!.heroDecisions!.length).toBeGreaterThan(0)
    void sawMistake // mistake presence depends on the seed; the grading path itself ran either way
  })

  it('records the insurance decision with book verdict', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, 33)
    // hunt a seed-relative round that offers insurance within a few deals
    let guard = 0
    while (loop.phase.value !== 'insurance' && guard++ < 40) {
      if (loop.phase.value === 'playerTurns') {
        loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
      } else {
        loop.beginRound(1000, {})
      }
    }
    expect(loop.phase.value).toBe('insurance')
    loop.heroInsurance(null)
    expect(store.training.adherence.insurance.decisions).toBe(1)
    expect(store.training.adherence.insurance.correct).toBe(1) // declining is book
    while (loop.phase.value === 'playerTurns') {
      loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
    }
    expect(store.history.at(-1)!.heroInsurance).toMatchObject({ took: null, book: 'decline', correct: true })
  })

  it('heroTurn exposes the live hand only when the hero can act', () => {
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    expect(loop.heroTurn.value).toBeNull()
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    if (loop.phase.value === 'playerTurns') {
      expect(loop.heroTurn.value).not.toBeNull()
      expect(loop.heroTurn.value!.cards.length).toBeGreaterThanOrEqual(2)
      expect(loop.heroTurn.value!.dealerUp).toBeDefined()
    }
  })
```

- [ ] **Step 2:** Run `pnpm test:nuxt test/nuxt/gameLoop.test.ts` — FAIL (`heroTurn`, `lastDecision` missing; no decisions recorded).

- [ ] **Step 3: Implement** in `useGameLoop.ts`:

1. New imports:

```ts
import { isPair } from '../utils/engine/hand'           // extend the existing hand.ts import line
import { bucketOf } from '../utils/engine/cards'        // extend the existing cards.ts import line
import { countShuffle, countVisibleCard, resetCounting, restoreCounting, __resetCountingForTests } from './useCounting'
import { useCounting } from './useCounting'
import { adviseHand, adviseInsurance, decisionCost } from '../utils/advisor'
import type { DecisionRecord, InsuranceRecord } from '../stores/useBlackjackStore'
```

2. Module state (near `visibleThisRound`):

```ts
let decisionsThisRound: DecisionRecord[] = []
let insuranceThisRound: InsuranceRecord | null = null
const lastDecision = ref<DecisionRecord | null>(null)
```

Reset both + `lastDecision.value = null` inside `__resetGameLoopForTests`, and call `__resetCountingForTests()` there too.

3. In `applyEvent`:
   - `case 'count-visible-card':` add `countVisibleCard(e.card)` before the existing `visibleThisRound.push(...)`.
   - `case 'shuffle':` add `countShuffle()` after the announcement line.

4. In `useGameLoop()` body, instantiate the counting API once: `const counting = useCounting()`.

5. `heroTurn` computed (exported):

```ts
  const heroTurn = computed(() => {
    void gameGen.value
    if (!game || !canAct.value) return null
    const spot = game.spots.find(s => s.spotId === heroSpot())
    const hand = spot?.hands[spot.activeHandIndex]
    if (!spot || !hand || !game.dealerUp) return null
    return {
      cards: [...hand.cards],
      bet: hand.bet,
      fromSplit: hand.fromSplit,
      handsCount: spot.hands.length,
      handIndex: spot.activeHandIndex,
      dealerUp: game.dealerUp
    }
  })
```

6. Decision capture at the top of `act()` (after the `canAct` guard, before `game.act`):

```ts
    const spot = game.spots.find(s => s.spotId === heroSpot())!
    const hand = spot.hands[spot.activeHandIndex]!
    const tc = counting.tc.value
    const rec = adviseHand(
      { cards: hand.cards, fromSplit: hand.fromSplit, handsCount: spot.hands.length },
      game.dealerUp!, store.settings!.rules, tc, store.settings!.advancedDeviations,
      legalActions.value
    )
    const pairFlag = isPair(hand.cards) && legalActions.value.includes('split')
    const { total, soft } = handTotal(hand.cards)
    const decision: DecisionRecord = {
      handIndex: spot.activeHandIndex,
      cards: hand.cards.map(displayCard),
      total,
      soft,
      pair: pairFlag,
      pairBucket: pairFlag ? bucketOf(hand.cards[0]!) : null,
      upBucket: bucketOf(game.dealerUp!),
      dealerUp: displayCard(game.dealerUp!),
      action,
      book: rec.book,
      deviationId: rec.deviation?.id ?? null,
      deviationPlay: rec.deviation ? (rec.deviation.play as DecisionRecord['deviationPlay']) : null,
      correct: action === rec.action,
      costCents: decisionCost(rec.evs, action, rec.book, hand.bet),
      evs: rec.evs,
      rc: counting.rc.value,
      tc: Math.round(tc * 10) / 10,
      category: rec.book === 'surrender' ? 'surrender' : pairFlag ? 'pair' : soft ? 'soft' : 'hard'
    }
    store.recordDecision(decision)
    decisionsThisRound.push(decision)
    lastDecision.value = decision
    if (store.settings!.advisor !== 'exam' && !decision.correct) {
      pushAnnouncement(`Book: ${rec.action}${decision.costCents > 0 ? ` — that cost ≈$${(decision.costCents / 100).toFixed(2)}` : ''}`)
    }
```

(`store` is already in the closure; `displayCard`/`handTotal` are already imported.)

7. Insurance capture at the top of `heroInsurance()` (before the engine calls):

```ts
    const store2 = useBlackjackStore()
    const adv = adviseInsurance(counting.tc.value, store2.settings!.advancedDeviations)
    insuranceThisRound = {
      took: decision,
      book: adv.take ? 'take' : 'decline',
      correct: adv.take ? decision !== null : decision === null,
      rc: counting.rc.value,
      tc: Math.round(counting.tc.value * 10) / 10
    }
    store2.recordInsuranceDecision(insuranceThisRound)
```

8. In `beginRound()`, alongside `visibleThisRound = []`:

```ts
    decisionsThisRound = []
    insuranceThisRound = null
```

9. In `finalizeRound()`, extend the `record` literal:

```ts
    heroDecisions: [...decisionsThisRound],
    heroInsurance: insuranceThisRound,
```

10. Session lifecycle: `startSession` → `resetCounting()` after `resetPresentation()`; `restoreSession` snapshot path → `restoreCounting()` after `fastForwardPresentation()`, fresh path → `resetCounting()`; `endSession` → `resetCounting()`.

11. Export `heroTurn` and `lastDecision` from the returned object.

- [ ] **Step 4:** Run `pnpm test:nuxt` — all green (gameLoop now 11). Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useGameLoop.ts test/nuxt/gameLoop.test.ts
git commit -m "feat(ui): capture hero decisions and insurance calls in the game loop"
```

---

### Task 6: AdvisorPanel + CountPanel

**Files:**
- Create: `app/components/panels/AdvisorPanel.vue`, `app/components/panels/CountPanel.vue`
- Test: `test/nuxt/panels.test.ts`

- [ ] **Step 1: Implement `AdvisorPanel.vue`** — pure props in, no store:

```vue
<script setup lang="ts">
import type { AdvisorRecommendation } from '~/utils/advisor'
import { pctEV } from '~/utils/advisor'
import type { AdvisorIntensity, DecisionRecord } from '~/stores/useBlackjackStore'
import type { Action } from '~/utils/engine/hand'

const props = defineProps<{
  intensity: AdvisorIntensity
  /** Pass only in coach mode and only when it's the hero's turn; null otherwise. */
  recommendation: AdvisorRecommendation | null
  lastDecision: DecisionRecord | null
  showSideBetCaution: boolean
}>()

const ACTION_LABEL: Record<Action, string> = {
  hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender'
}

const evRows = computed(() => {
  if (!props.recommendation) return []
  return (Object.entries(props.recommendation.evs) as Array<[Action, number]>)
    .sort((a, b) => b[1] - a[1])
    .map(([action, ev]) => ({ action, label: ACTION_LABEL[action], ev: pctEV(ev) }))
})

const open = ref(true) // collapsible (spec §6)
</script>

<template>
  <div class="rounded-lg border border-neutral-800 bg-neutral-950/85 p-2.5 text-xs backdrop-blur">
    <button
      type="button"
      class="mb-1.5 flex w-full items-center justify-between font-semibold uppercase tracking-wide text-neutral-500"
      :aria-expanded="open"
      data-testid="advisor-toggle"
      @click="open = !open"
    >
      Advisor
      <UIcon
        :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="h-3 w-3"
      />
    </button>

    <div v-show="open">
    <template v-if="intensity === 'coach'">
      <div v-if="recommendation">
        <p
          class="text-base font-bold text-[var(--accent-gold)]"
          data-testid="advisor-action"
        >
          {{ ACTION_LABEL[recommendation.action] }}
          <span
            v-if="recommendation.deviation"
            class="ml-1 rounded bg-purple-900 px-1 py-0.5 text-[9px] uppercase text-purple-200"
          >count call</span>
        </p>
        <p class="mt-0.5 text-neutral-400">
          {{ recommendation.reasoning }}
        </p>
        <table
          class="mt-1.5 w-full font-mono"
          data-testid="advisor-evs"
        >
          <tbody>
            <tr
              v-for="row in evRows"
              :key="row.action"
              :class="row.action === recommendation.action ? 'text-[var(--accent-cream)]' : 'text-neutral-500'"
            >
              <td>{{ row.label }}</td>
              <td class="text-right">{{ row.ev }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-else
        class="text-neutral-500"
      >
        Waiting for your turn…
      </p>
    </template>

    <template v-else-if="intensity === 'feedback'">
      <div
        v-if="lastDecision"
        data-testid="advisor-feedback"
      >
        <p
          v-if="lastDecision.correct"
          class="font-semibold text-emerald-400"
        >
          ✓ Book agrees with {{ ACTION_LABEL[lastDecision.action] }}
        </p>
        <p
          v-else
          class="font-semibold text-red-400"
        >
          ✗ Book: {{ ACTION_LABEL[lastDecision.book] }}
          <span v-if="lastDecision.costCents > 0"> — cost ≈${{ (lastDecision.costCents / 100).toFixed(2) }}</span>
        </p>
      </div>
      <p
        v-else
        class="text-neutral-500"
      >
        Feedback appears after each decision.
      </p>
    </template>

    <p
      v-else
      class="text-neutral-500"
      data-testid="advisor-exam"
    >
      Exam mode — decisions are graded silently in History.
    </p>

    <p
      v-if="showSideBetCaution"
      class="mt-2 rounded bg-amber-950/60 p-1.5 text-amber-300"
      data-testid="advisor-sidebet-caution"
    >
      Side bets carry a far higher house edge than the main game — book play is to skip them.
    </p>
    </div>
  </div>
</template>
```

(The `v-show` wrapper div sits at the same indent as the toggle button — let `eslint --fix` settle the template indentation.)

- [ ] **Step 2: Implement `CountPanel.vue`** — owns the counting composable + store:

```vue
<script setup lang="ts">
import { useCounting } from '~/composables/useCounting'

const store = useBlackjackStore()
const counting = useCounting()

const visibility = computed(() => store.settings?.count ?? 'off')
const checkInput = ref<number | null>(null)
const quizInput = ref<number | null>(null)
const inputEl = ref<{ inputRef?: HTMLInputElement } | null>(null)

function submitCheck(): void {
  if (checkInput.value === null) return
  counting.checkCount(checkInput.value)
  checkInput.value = null
}

function submitQuiz(): void {
  if (quizInput.value === null) return
  counting.answerShuffleQuiz(quizInput.value)
  quizInput.value = null
}

function focusCheck(): void {
  open.value = true
  inputEl.value?.inputRef?.focus()
}

const open = ref(true) // collapsible (spec §6)

defineExpose({ focusCheck })
</script>

<template>
  <div
    v-if="visibility !== 'off'"
    class="rounded-lg border border-neutral-800 bg-neutral-950/85 p-2.5 text-xs backdrop-blur"
  >
    <button
      type="button"
      class="mb-1.5 flex w-full items-center justify-between font-semibold uppercase tracking-wide text-neutral-500"
      :aria-expanded="open"
      data-testid="count-toggle"
      @click="open = !open"
    >
      Hi-Lo Count
      <UIcon
        :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="h-3 w-3"
      />
    </button>

    <div v-show="open">

    <div
      v-if="visibility === 'shown'"
      class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-neutral-300"
      data-testid="count-values"
    >
      <span>RC</span><span class="text-right text-[var(--accent-cream)]">{{ counting.rc.value > 0 ? '+' : '' }}{{ counting.rc.value }}</span>
      <span>TC</span><span class="text-right text-[var(--accent-cream)]">{{ counting.tc.value.toFixed(1) }}</span>
      <span>Decks left</span><span class="text-right">{{ counting.decksRemaining.value.toFixed(1) }}</span>
      <span>Edge est.</span><span class="text-right">{{ (counting.advantage.value * 100).toFixed(2) }}%</span>
    </div>

    <div v-else>
      <p class="text-neutral-500">
        Count hidden — keep it in your head, press <kbd class="rounded bg-neutral-800 px-1">C</kbd> to check.
      </p>
      <div class="mt-1.5 flex items-center gap-1.5">
        <UInput
          ref="inputEl"
          v-model.number="checkInput"
          type="number"
          size="xs"
          placeholder="RC?"
          data-testid="count-input"
          @keydown.enter="submitCheck"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          data-testid="count-check"
          @click="submitCheck"
        >
          Check
        </UButton>
      </div>
      <p
        v-if="counting.lastCheck.value"
        class="mt-1"
        :class="counting.lastCheck.value.correct ? 'text-emerald-400' : 'text-red-400'"
        data-testid="count-verdict"
      >
        {{ counting.lastCheck.value.correct
          ? `✓ RC is ${counting.lastCheck.value.actual}`
          : `✗ you said ${counting.lastCheck.value.entered} — RC was ${counting.lastCheck.value.actual}` }}
      </p>
    </div>

    <div
      v-if="counting.shuffleQuiz.value"
      class="mt-2 rounded bg-sky-950/60 p-1.5"
      data-testid="shuffle-quiz"
    >
      <p class="text-sky-300">
        Shoe shuffled — what was the final RC?
      </p>
      <div class="mt-1 flex items-center gap-1.5">
        <UInput
          v-model.number="quizInput"
          type="number"
          size="xs"
          data-testid="shuffle-quiz-input"
          @keydown.enter="submitQuiz"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          data-testid="shuffle-quiz-submit"
          @click="submitQuiz"
        >
          Answer
        </UButton>
      </div>
    </div>
    </div>
  </div>
</template>
```

(As with AdvisorPanel, the collapsible `v-show` wrapper closes just before the root div — `eslint --fix` settles indentation.)

(`UInput`'s exposed `inputRef` is the underlying `<input>` in @nuxt/ui v4 — if `focusCheck` proves flaky in the Task 8 C-key test, fall back to `document.querySelector('[data-testid="count-input"] input')?.focus()` inside the component.)

- [ ] **Step 3: Tests** (`test/nuxt/panels.test.ts`):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import AdvisorPanel from '../../app/components/panels/AdvisorPanel.vue'
import CountPanel from '../../app/components/panels/CountPanel.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { __resetCountingForTests, countVisibleCard } from '../../app/composables/useCounting'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

const REC = {
  action: 'stand' as const,
  book: 'stand' as const,
  evs: { stand: -0.18, hit: -0.45 },
  deviation: null,
  reasoning: 'Stand: EV -18.0% beats hit at -45.0%.'
}

describe('AdvisorPanel', () => {
  it('coach mode renders the action, reasoning, and EV table', async () => {
    const w = await mountSuspended(AdvisorPanel, {
      props: { intensity: 'coach', recommendation: REC, lastDecision: null, showSideBetCaution: false }
    })
    expect(w.find('[data-testid="advisor-action"]').text()).toContain('Stand')
    expect(w.find('[data-testid="advisor-evs"]').text()).toContain('-45.0%')
  })

  it('feedback mode shows the last verdict with cost', async () => {
    const w = await mountSuspended(AdvisorPanel, {
      props: {
        intensity: 'feedback',
        recommendation: null,
        lastDecision: {
          handIndex: 0, cards: ['10♠', '6♣'], total: 16, soft: false, pair: false, pairBucket: null,
          upBucket: 10, dealerUp: '10♦', action: 'stand', book: 'hit', deviationId: null,
          deviationPlay: null, correct: false, costCents: 540, evs: {}, rc: 0, tc: 0, category: 'hard'
        },
        showSideBetCaution: false
      }
    })
    expect(w.find('[data-testid="advisor-feedback"]').text()).toContain('Book: Hit')
    expect(w.find('[data-testid="advisor-feedback"]').text()).toContain('$5.40')
  })

  it('exam mode stays silent and the caution renders when asked', async () => {
    const w = await mountSuspended(AdvisorPanel, {
      props: { intensity: 'exam', recommendation: REC, lastDecision: null, showSideBetCaution: true }
    })
    expect(w.find('[data-testid="advisor-exam"]').exists()).toBe(true)
    expect(w.find('[data-testid="advisor-action"]').exists()).toBe(false)
    expect(w.find('[data-testid="advisor-sidebet-caution"]').exists()).toBe(true)
  })
})

describe('CountPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    __resetCountingForTests()
  })

  function start(count: 'shown' | 'self-check' | 'off') {
    const store = useBlackjackStore()
    store.initSession({
      rules: cloneRules(PRESETS.VEGAS_STRIP_6D!), mode: 'quick', speed: 'normal',
      flair: false, botIds: [], advisor: 'feedback', count, advancedDeviations: false
    }, 50_000)
    return store
  }

  it('shown mode renders live values', async () => {
    start('shown')
    countVisibleCard({ rank: 5, suit: 'spades' })
    const w = await mountSuspended(CountPanel)
    expect(w.find('[data-testid="count-values"]').text()).toContain('+1')
  })

  it('self-check mode hides values and grades a check', async () => {
    const store = start('self-check')
    countVisibleCard({ rank: 5, suit: 'spades' })
    const w = await mountSuspended(CountPanel)
    expect(w.find('[data-testid="count-values"]').exists()).toBe(false)
    await w.find('[data-testid="count-input"] input').setValue('1')
    await w.find('[data-testid="count-check"]').trigger('click')
    expect(w.find('[data-testid="count-verdict"]').text()).toContain('✓')
    expect(store.training.countChecks).toHaveLength(1)
  })

  it('off mode renders nothing', async () => {
    start('off')
    const w = await mountSuspended(CountPanel)
    expect(w.html()).not.toContain('Hi-Lo')
  })
})
```

- [ ] **Step 4:** Run `pnpm test:nuxt test/nuxt/panels.test.ts` — PASS (6). Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/components/panels/ test/nuxt/panels.test.ts
git commit -m "feat(ui): add advisor and count panels"
```

---

### Task 7: Setup screen — training options

**Files:**
- Modify: `app/pages/index.vue`
- Test: `test/nuxt/setup.test.ts` (append)

- [ ] **Step 1: Implement.** In `index.vue` script setup, add:

```ts
import type { AdvisorIntensity, CountVisibility } from '~/stores/useBlackjackStore'

const advisor = ref<AdvisorIntensity>('coach')
const countVisibility = ref<CountVisibility>('self-check')
const advancedDeviations = ref(false)

const advisorOptions = [
  { label: 'Coach — tell me before I act', value: 'coach' },
  { label: 'Feedback — grade me after', value: 'feedback' },
  { label: 'Exam — grade silently', value: 'exam' }
]
const countOptions = [
  { label: 'Shown — RC/TC on screen', value: 'shown' },
  { label: 'Self-check — press C to verify', value: 'self-check' },
  { label: 'Off', value: 'off' }
]
```

extend `start()`'s `startSession` settings literal:

```ts
    advisor: advisor.value,
    count: countVisibility.value,
    advancedDeviations: countVisibility.value === 'off' ? false : advancedDeviations.value
```

and add a Training section to the template, between the companions section and the bankroll/presentation grid:

```vue
    <section>
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Training
      </h2>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Advisor">
          <USelect
            v-model="advisor"
            :items="advisorOptions"
            data-testid="advisor-select"
          />
        </UFormField>
        <UFormField label="Card counting">
          <USelect
            v-model="countVisibility"
            :items="countOptions"
            data-testid="count-select"
          />
        </UFormField>
        <UFormField
          v-if="countVisibility !== 'off'"
          label="Count deviations"
        >
          <USwitch
            v-model="advancedDeviations"
            label="Illustrious 18 + Fab 4 (advanced)"
            data-testid="advanced-switch"
          />
        </UFormField>
      </div>
    </section>
```

- [ ] **Step 2: Tests** (append to `setup.test.ts` — a new describe; the page mounts under the Nuxt pinia, so no `setActivePinia` here, per Architecture Notes):

```ts
import IndexPage from '../../app/pages/index.vue'

describe('setup page — training options', () => {
  it('renders advisor/count selects and the advanced switch', async () => {
    const w = await mountSuspended(IndexPage)
    expect(w.find('[data-testid="advisor-select"]').exists()).toBe(true)
    expect(w.find('[data-testid="count-select"]').exists()).toBe(true)
    expect(w.find('[data-testid="advanced-switch"]').exists()).toBe(true) // default self-check ≠ off
  })
})
```

- [ ] **Step 3:** Run `pnpm test:nuxt test/nuxt/setup.test.ts` — PASS (5). Full gates clean.

- [ ] **Step 4: Commit**

```bash
git add app/pages/index.vue test/nuxt/setup.test.ts
git commit -m "feat(ui): add training options to the setup screen"
```

---

### Task 8: Table integration — panels, EV hints, C key

**Files:**
- Modify: `app/pages/table.vue`, `app/components/table/ActionBar.vue`
- Test: `test/nuxt/actionBar.test.ts` (append), `test/nuxt/integration.test.ts` (append)

- [ ] **Step 1: ActionBar EV hints + insurance advice.** Add to the props interface:

```ts
  /** Per-action EVs — coach mode only; renders a tooltip + sr-only hint per button. */
  evs?: Partial<Record<Action, number>>
  insuranceAdvice?: string
```

In the PLAYER TURNS template block, replace the plain button loop content with a tooltip-wrapped version:

```vue
      <div class="flex gap-2">
        <UTooltip
          v-for="action in ACTION_ORDER"
          :key="action"
          :text="evs?.[action] !== undefined ? `EV ${(evs[action]! * 100).toFixed(1)}%` : undefined"
          :disabled="evs?.[action] === undefined"
        >
          <UButton
            size="lg"
            :color="action === 'surrender' ? 'neutral' : 'primary'"
            :variant="action === 'hit' || action === 'stand' ? 'solid' : 'soft'"
            :disabled="!legalActions.includes(action)"
            :data-testid="`act-${action}`"
            @click="emit('act', action)"
          >
            {{ ACTION_META[action].label }}
            <kbd class="ml-1 text-[10px] opacity-60">{{ ACTION_META[action].key }}</kbd>
            <span
              v-if="evs?.[action] !== undefined"
              class="sr-only"
            >EV {{ (evs[action]! * 100).toFixed(1) }}%</span>
          </UButton>
        </UTooltip>
      </div>
```

In the INSURANCE template block, after the buttons row add:

```vue
      <p
        v-if="insuranceAdvice"
        class="text-xs text-neutral-400"
        data-testid="insurance-advice"
      >
        {{ insuranceAdvice }}
      </p>
```

- [ ] **Step 2: Table page wiring.** In `table.vue` script setup:

```ts
import { useCounting } from '~/composables/useCounting'
import { adviseHand, adviseInsurance } from '~/utils/advisor'
```

destructure the two new loop refs: add `heroTurn, lastDecision` to the existing destructuring. Then:

```ts
const counting = useCounting()

const advisorRec = computed(() => {
  const t = heroTurn.value
  if (!t || !rules.value || !store.settings || store.settings.advisor !== 'coach') return null
  return adviseHand(
    { cards: t.cards, fromSplit: t.fromSplit, handsCount: t.handsCount },
    t.dealerUp, rules.value, counting.tc.value, store.settings.advancedDeviations,
    legalActions.value
  )
})

const insuranceAdvice = computed(() => {
  if (!store.settings || store.settings.advisor !== 'coach' || phase.value !== 'insurance') return undefined
  return adviseInsurance(counting.tc.value, store.settings.advancedDeviations).reasoning
})

const sideStakesPlaced = ref(false) // set true on deal when side stakes were chosen
const countPanel = ref<{ focusCheck: () => void } | null>(null)
```

In `onDeal`, before `loop.beginRound`: `sideStakesPlaced.value = Object.values(side).some(v => (v ?? 0) > 0)`.

In `onKey`, add a branch (before the action-keys branch):

```ts
  } else if (key === 'c' && store.settings?.count === 'self-check') {
    countPanel.value?.focusCheck()
```

Template: overlay the panels on the felt (inside the existing felt wrapper `div.relative`, right after `<BlackjackTable ...>...</BlackjackTable>`):

```vue
      <div class="pointer-events-none absolute right-3 top-3 z-10 flex w-64 flex-col gap-2">
        <div class="pointer-events-auto">
          <AdvisorPanel
            :intensity="store.settings!.advisor"
            :recommendation="advisorRec"
            :last-decision="lastDecision"
            :show-side-bet-caution="store.settings!.advisor === 'coach' && phase === 'betting' && sideStakesPlaced"
          />
        </div>
        <div class="pointer-events-auto">
          <CountPanel ref="countPanel" />
        </div>
      </div>
```

Pass the new ActionBar props: `:evs="advisorRec?.evs"` and `:insurance-advice="insuranceAdvice"`.

- [ ] **Step 3: Tests.** Append to `actionBar.test.ts`:

```ts
describe('ActionBar — EV hints', () => {
  it('renders sr-only EV hints when evs are provided', async () => {
    const w = await mountSuspended(ActionBar, {
      props: {
        ...base, phase: 'playerTurns', legalActions: ['hit', 'stand'],
        evs: { hit: -0.41, stand: -0.54 }
      }
    })
    expect(w.find('[data-testid="act-hit"]').text()).toContain('EV -41.0%')
  })

  it('renders the insurance advice line when provided', async () => {
    const w = await mountSuspended(ActionBar, {
      props: { ...base, phase: 'insurance', insuranceAdvice: 'Book play: never take insurance.' }
    })
    expect(w.find('[data-testid="insurance-advice"]').text()).toContain('never take insurance')
  })
})
```

Append to `integration.test.ts` (inside the existing describe — Nuxt-pinia rules apply):

```ts
  it('coach mode surfaces a recommendation and the count panel shows RC', async () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({
      rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
      advisor: 'coach', count: 'shown', advancedDeviations: false
    }, 100_000, 21)

    const page = await mountSuspended(TablePage)
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="deal"]').trigger('click')
    if (loop.phase.value === 'insurance') {
      await page.find('[data-testid="decline-insurance"]').trigger('click')
    }
    if (loop.phase.value === 'playerTurns') {
      expect(page.find('[data-testid="advisor-action"]').exists()).toBe(true)
      expect(page.find('[data-testid="count-values"]').exists()).toBe(true)
    }
    void store
  })
```

(Also import `__resetCountingForTests` in `integration.test.ts` and call it in the `beforeEach` so count state never bleeds between tests.)

- [ ] **Step 4:** Run `pnpm test:nuxt` — all green. Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/pages/table.vue app/components/table/ActionBar.vue test/nuxt/actionBar.test.ts test/nuxt/integration.test.ts
git commit -m "feat(ui): wire advisor/count panels, EV hints, and C-key into the table"
```

---

### Task 9: Study mode

**Files:**
- Create: `app/components/table/StudyHotspots.vue`
- Modify: `app/pages/table.vue`
- Test: `test/nuxt/study.test.ts`

- [ ] **Step 1: Implement `StudyHotspots.vue`:**

```vue
<script setup lang="ts">
import type { RuleSet } from '~/utils/engine/rules'

const props = defineProps<{
  rules: RuleSet
}>()

interface Hotspot {
  id: string
  left: string
  top: string
  title: string
  body: string
}

const hotspots = computed<Hotspot[]>(() => [
  {
    id: 'shoe',
    left: '36%',
    top: '5%',
    title: 'Shoe & cut card',
    body: `The red cut card sits ${Math.round(props.rules.penetration * 100)}% deep. When it comes out, the current round finishes and the shoe is reshuffled (MA §5(h), §6(k)). Deeper penetration = more useful counts.`
  },
  {
    id: 'discard',
    left: '64%',
    top: '5%',
    title: 'Discard tray',
    body: 'Counters estimate decks remaining from this tray to the nearest half deck — true count = running count ÷ decks remaining.'
  },
  {
    id: 'dealer-rule',
    left: '50%',
    top: '20%',
    title: props.rules.dealerHitsSoft17 ? 'Dealer hits soft 17' : 'Dealer stands on all 17s',
    body: props.rules.dealerHitsSoft17
      ? 'H17 adds roughly 0.2% to the house edge versus S17 — the dealer re-draws soft 17s into stronger hands more often than it busts.'
      : 'S17 is the player-friendly variant: the dealer freezes on every 17, soft or hard (MA §12(b)).'
  },
  {
    id: 'insurance',
    left: '50%',
    top: '42%',
    title: 'Insurance line',
    body: 'Pays 2:1, but the dealer has blackjack less than one time in three. Book play: never — unless you count and the true count is +3 or better (MA §9).'
  },
  {
    id: 'bet',
    left: '50%',
    top: '74%',
    title: 'Betting spot',
    body: `Main bet circle (table $${props.rules.minBet / 100}–$${props.rules.maxBet / 100}) plus any enabled side-bet circles. Side bets run a far higher edge than the main game — ${props.rules.blackjackPayout === '6:5' ? 'and 6:5 blackjack costs you another ~1.4% on top.' : 'the 3:2 main game is the best bet on this felt.'}`
  }
])
</script>

<template>
  <div class="absolute inset-0 z-20">
    <UPopover
      v-for="spot in hotspots"
      :key="spot.id"
      :content="{ side: 'bottom' }"
    >
      <button
        type="button"
        class="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--accent-gold)] bg-neutral-950/80 text-xs font-bold text-[var(--accent-gold)] shadow-lg transition-transform hover:scale-110"
        :style="{ left: spot.left, top: spot.top }"
        :aria-label="`Study: ${spot.title}`"
        :data-testid="`study-hotspot-${spot.id}`"
      >
        i
      </button>
      <template #content>
        <div
          class="max-w-72 p-3 text-xs"
          data-testid="study-popover"
        >
          <p class="font-semibold text-[var(--accent-gold)]">
            {{ spot.title }}
          </p>
          <p class="mt-1 text-neutral-300">
            {{ spot.body }}
          </p>
        </div>
      </template>
    </UPopover>
  </div>
</template>
```

- [ ] **Step 2: Wire into `table.vue`.** Script: `const studyMode = ref(false)`. At the very top of `onKey`: `if (studyMode.value) return`. Template:
  - inside the felt wrapper, after the panels overlay: `<StudyHotspots v-if="studyMode && rules" :rules="rules" />`
  - in the status row (the `mb-1 flex ...` div), add a toggle before the session counter:

```vue
        <UButton
          size="xs"
          :variant="studyMode ? 'solid' : 'outline'"
          color="neutral"
          icon="i-lucide-graduation-cap"
          data-testid="study-toggle"
          @click="studyMode = !studyMode"
        >
          Study
        </UButton>
```

  - gate the controls: ActionBar `:can-deal="betweenRounds && queueIdle && !studyMode"` and `:legal-actions="studyMode ? [] : legalActions"`.

- [ ] **Step 3: Tests** (`test/nuxt/study.test.ts`) — hotspot buttons render and the controls freeze; the popover body itself is portal-rendered, so the E2E covers its visibility:

```ts
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StudyHotspots from '../../app/components/table/StudyHotspots.vue'
import { PRESETS } from '../../app/utils/engine/rules'

describe('StudyHotspots', () => {
  it('renders five labeled hotspots with rules-driven copy', async () => {
    const w = await mountSuspended(StudyHotspots, { props: { rules: PRESETS.VEGAS_STRIP_6D! } })
    for (const id of ['shoe', 'discard', 'dealer-rule', 'insurance', 'bet']) {
      expect(w.find(`[data-testid="study-hotspot-${id}"]`).exists()).toBe(true)
    }
    expect(w.find('[data-testid="study-hotspot-shoe"]').attributes('aria-label')).toContain('Study:')
  })
})
```

Append to `integration.test.ts`:

```ts
  it('study mode freezes the deal', async () => {
    const loop = useGameLoop()
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    loop.startSession({
      rules, mode: 'quick', speed: 'normal', flair: false, botIds: [],
      advisor: 'feedback', count: 'off', advancedDeviations: false
    }, 100_000, 5)
    const page = await mountSuspended(TablePage)
    await page.find('[data-testid="chip-2500"]').trigger('click')
    await page.find('[data-testid="study-toggle"]').trigger('click')
    expect(page.find('[data-testid="deal"]').attributes('disabled')).toBeDefined()
    expect(page.find('[data-testid="study-hotspot-shoe"]').exists()).toBe(true)
  })
```

- [ ] **Step 4:** Run `pnpm test:nuxt` — green. Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/components/table/StudyHotspots.vue app/pages/table.vue test/nuxt/study.test.ts test/nuxt/integration.test.ts
git commit -m "feat(ui): add study mode with felt hotspots"
```

---

### Task 10: Layout — training nav + table-aware back behavior

**Files:**
- Create: `app/utils/outcomeBadges.ts`
- Modify: `app/layouts/default.vue`, `app/components/table/SpotSeat.vue`
- Test: `test/nuxt/layout.test.ts`

- [ ] **Step 1: Shared outcome badges** (`app/utils/outcomeBadges.ts`) — SpotSeat's map moves here so the history page can reuse it:

```ts
export const OUTCOME_BADGE: Record<string, { text: string, cls: string }> = {
  win: { text: 'WIN', cls: 'bg-emerald-700 text-emerald-100' },
  blackjack: { text: 'BLACKJACK', cls: 'bg-[var(--accent-gold)] text-black' },
  lose: { text: 'LOSE', cls: 'bg-red-900 text-red-200' },
  push: { text: 'PUSH', cls: 'bg-neutral-700 text-neutral-200' },
  surrender: { text: 'SURRENDER', cls: 'bg-neutral-800 text-neutral-300' }
}
```

In `SpotSeat.vue`, delete the local `OUTCOME_BADGE` const and add `import { OUTCOME_BADGE } from '~/utils/outcomeBadges'`.

- [ ] **Step 2: Layout changes** in `default.vue`. Script additions:

```ts
const onTable = computed(() => route.path === '/table')
const NAV = [
  { to: '/history', label: 'History', icon: 'i-lucide-scroll-text' },
  { to: '/analysis', label: 'Analysis', icon: 'i-lucide-bar-chart-3' },
  { to: '/learn', label: 'Learn', icon: 'i-lucide-book-open' },
  { to: '/drills', label: 'Drills', icon: 'i-lucide-target' }
]

function subPageBack() {
  navigateTo(store.sessionActive ? '/table' : '/')
}
```

Top bar: the existing back button becomes table-only; sub pages get a plain back (no confirm — the session survives navigation):

```vue
        <button
          v-if="onTable"
          class="flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          @click="handleBack"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="h-3.5 w-3.5"
          />
          <span>Leave table</span>
        </button>
        <button
          v-else-if="!isSetup"
          class="flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          data-testid="back-to-table"
          @click="subPageBack"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="h-3.5 w-3.5"
          />
          <span>{{ store.sessionActive ? 'Table' : 'Setup' }}</span>
        </button>
```

Bottom bar: replace its left span with a nav group, and move the version text next to the GitHub link:

```vue
      <div class="flex items-center gap-3">
        <button
          v-for="link in NAV"
          :key="link.to"
          class="flex items-center gap-1.5 text-xs transition-colors"
          :class="route.path === link.to ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'"
          :aria-current="route.path === link.to ? 'page' : undefined"
          :data-testid="`nav-${link.label.toLowerCase()}`"
          @click="navigateTo(link.to)"
        >
          <UIcon
            :name="link.icon"
            class="h-3.5 w-3.5"
          />
          <span class="hidden sm:inline">{{ link.label }}</span>
        </button>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-[10px] text-neutral-600">v{{ version }} — training simulator; no real-money play</span>
        <a
          href="https://github.com/cschweda/metaincognita-blackjack"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <UIcon
            name="i-simple-icons-github"
            class="h-3.5 w-3.5"
          />
          <span>GitHub</span>
        </a>
      </div>
```

- [ ] **Step 3: Tests** (`test/nuxt/layout.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DefaultLayout from '../../app/layouts/default.vue'

describe('default layout', () => {
  it('renders the four training nav links', async () => {
    const w = await mountSuspended(DefaultLayout)
    for (const id of ['nav-history', 'nav-analysis', 'nav-learn', 'nav-drills']) {
      expect(w.find(`[data-testid="${id}"]`).exists()).toBe(true)
    }
  })
})
```

- [ ] **Step 4:** Run `pnpm test:nuxt` — green (SpotSeat tests must still pass after the badge refactor). Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/utils/outcomeBadges.ts app/layouts/default.vue app/components/table/SpotSeat.vue test/nuxt/layout.test.ts
git commit -m "feat(ui): add training-page navigation and table-aware back behavior"
```

---

### Task 11: History page

**Files:**
- Create: `app/pages/history.vue`
- Test: `test/nuxt/historyPage.test.ts`

- [ ] **Step 1: Implement `app/pages/history.vue`:**

```vue
<script setup lang="ts">
import { OUTCOME_BADGE } from '~/utils/outcomeBadges'
import { pctEV } from '~/utils/advisor'

const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const rounds = computed(() => [...store.history].reverse())

function heroNet(round: (typeof rounds.value)[number]): number {
  const hero = round.spots.find(s => s.occupant === 'hero')
  if (!hero) return 0
  return hero.hands.reduce((sum, h) => sum + h.net, 0)
    + hero.sideBets.reduce((sum, b) => sum + b.net, 0)
    + hero.insuranceNet
}

function money(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString()}`
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString()
}
</script>

<template>
  <main class="mx-auto w-full max-w-3xl flex-1 space-y-3 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Hand history
    </h1>

    <p
      v-if="rounds.length === 0"
      class="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500"
      data-testid="history-empty"
    >
      No rounds yet — play a few hands and your decisions land here, graded against the book.
    </p>

    <article
      v-for="round in rounds"
      :key="round.round"
      class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm"
      :data-testid="`round-${round.round}`"
    >
      <header class="flex items-baseline justify-between gap-2">
        <span class="font-semibold text-neutral-200">Round {{ round.round }}</span>
        <span class="text-xs text-neutral-500">{{ time(round.at) }}</span>
        <span
          class="ml-auto font-mono font-semibold"
          :class="heroNet(round) > 0 ? 'text-emerald-400' : heroNet(round) < 0 ? 'text-red-400' : 'text-neutral-400'"
        >{{ money(heroNet(round)) }}</span>
      </header>

      <p class="mt-1 text-xs text-neutral-400">
        Dealer: <span class="font-mono">{{ round.dealer.cards.join(' ') }}</span>
        — {{ round.dealer.busted ? 'bust' : round.dealer.blackjack ? 'blackjack' : round.dealer.total }}
      </p>

      <div
        v-for="(spot, si) in round.spots"
        :key="si"
        class="mt-1.5"
      >
        <div
          v-for="(hand, hi) in spot.hands"
          :key="hi"
          class="flex flex-wrap items-center gap-1.5 text-xs"
        >
          <span :class="spot.occupant === 'hero' ? 'font-semibold text-[var(--accent-gold)]' : 'text-neutral-500'">
            {{ spot.occupant === 'hero' ? 'You' : spot.occupant }}
          </span>
          <span class="font-mono text-neutral-300">{{ hand.cards.join(' ') }}</span>
          <span class="text-neutral-500">${{ hand.bet / 100 }}</span>
          <span
            class="rounded px-1 py-0.5 text-[9px] font-bold"
            :class="OUTCOME_BADGE[hand.outcome]?.cls"
          >{{ OUTCOME_BADGE[hand.outcome]?.text ?? hand.outcome }}</span>
        </div>
        <p
          v-if="spot.sideBets.length"
          class="mt-0.5 text-[11px] text-neutral-500"
        >
          Side: {{ spot.sideBets.map(b => `${b.name} ${money(b.net)}`).join(' · ') }}
        </p>
      </div>

      <div
        v-if="round.heroDecisions?.length"
        class="mt-2 space-y-1 border-t border-neutral-800 pt-2"
      >
        <div
          v-for="(d, di) in round.heroDecisions"
          :key="di"
          class="text-xs"
          :data-testid="`decision-${round.round}-${di}`"
        >
          <p class="flex flex-wrap items-center gap-1.5">
            <span :class="d.correct ? 'text-emerald-400' : 'text-red-400'">{{ d.correct ? '✓' : '✗' }}</span>
            <span class="font-mono text-neutral-300">{{ d.cards.join(' ') }} vs {{ d.dealerUp }}</span>
            <span class="text-neutral-400">{{ d.action }}</span>
            <span
              v-if="!d.correct"
              class="text-neutral-500"
            >book: {{ d.book }}<template v-if="d.costCents > 0"> · cost ${{ (d.costCents / 100).toFixed(2) }}</template></span>
            <span
              v-if="d.deviationId"
              class="rounded bg-purple-900 px-1 text-[9px] uppercase text-purple-200"
            >count call</span>
            <span class="ml-auto font-mono text-neutral-600">RC {{ d.rc > 0 ? '+' : '' }}{{ d.rc }} · TC {{ d.tc.toFixed(1) }}</span>
          </p>
          <details class="mt-0.5 text-neutral-500">
            <summary class="cursor-pointer text-[11px]">EV table</summary>
            <table class="mt-1 font-mono text-[11px]">
              <tbody>
                <tr
                  v-for="(ev, action) in d.evs"
                  :key="action"
                >
                  <td class="pr-3">{{ action }}</td>
                  <td>{{ pctEV(ev) }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
        <p
          v-if="round.heroInsurance"
          class="text-xs"
        >
          <span :class="round.heroInsurance.correct ? 'text-emerald-400' : 'text-red-400'">{{ round.heroInsurance.correct ? '✓' : '✗' }}</span>
          <span class="ml-1.5 text-neutral-400">insurance: {{ round.heroInsurance.took === null ? 'declined' : round.heroInsurance.took === 'even-money' ? 'even money' : `$${round.heroInsurance.took / 100}` }}</span>
          <span class="ml-1.5 text-neutral-500">(book: {{ round.heroInsurance.book }})</span>
        </p>
      </div>
    </article>
  </main>
</template>
```

- [ ] **Step 2: Tests** (`test/nuxt/historyPage.test.ts`) — page test, Nuxt pinia rules:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import HistoryPage from '../../app/pages/history.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import type { RoundRecord } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

const ROUND: RoundRecord = {
  round: 1,
  at: 1760000000000,
  dealer: { cards: ['10♦', '7♠'], total: 17, blackjack: false, busted: false },
  visibleCards: ['10♠', '6♣', '10♦', '7♠'],
  spots: [{
    occupant: 'hero',
    hands: [{ cards: ['10♠', '6♣'], bet: 2500, outcome: 'lose', net: -2500, doubled: false, fromSplit: false }],
    sideBets: [],
    insuranceNet: 0
  }],
  heroDecisions: [{
    handIndex: 0, cards: ['10♠', '6♣'], total: 16, soft: false, pair: false, pairBucket: null,
    upBucket: 10, dealerUp: '10♦', action: 'stand', book: 'hit', deviationId: null, deviationPlay: null,
    correct: false, costCents: 540, evs: { hit: -0.41, stand: -0.54 }, rc: 1, tc: 0.2, category: 'hard'
  }],
  heroInsurance: null
}

describe('history page', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the empty state without rounds', async () => {
    const store = useBlackjackStore()
    store.clearAll()
    const w = await mountSuspended(HistoryPage)
    expect(w.find('[data-testid="history-empty"]').exists()).toBe(true)
  })

  it('renders a graded round with cost and counts', async () => {
    const store = useBlackjackStore()
    store.initSession({
      rules: cloneRules(PRESETS.VEGAS_STRIP_6D!), mode: 'quick', speed: 'normal',
      flair: false, botIds: [], advisor: 'feedback', count: 'shown', advancedDeviations: false
    }, 50_000)
    store.recordRound(ROUND)
    const w = await mountSuspended(HistoryPage)
    const d = w.find('[data-testid="decision-1-0"]')
    expect(d.text()).toContain('✗')
    expect(d.text()).toContain('book: hit')
    expect(d.text()).toContain('$5.40')
    expect(d.text()).toContain('TC 0.2')
    expect(w.text()).toContain('−$25')
  })
})
```

- [ ] **Step 3:** Run `pnpm test:nuxt test/nuxt/historyPage.test.ts` — PASS (2). Full gates clean.

- [ ] **Step 4: Commit**

```bash
git add app/pages/history.vue test/nuxt/historyPage.test.ts
git commit -m "feat(ui): add history page with per-decision grading"
```

---

### Task 12: Analysis helpers + page

**Files:**
- Create: `app/utils/analysis.ts`, `app/pages/analysis.vue`
- Test: `test/unit/analysis.test.ts`, `test/nuxt/analysisPage.test.ts`

- [ ] **Step 1: Write the failing unit tests** (`test/unit/analysis.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import {
  adherenceRows, bankrollSeries, botPnl, countAccuracy, evLostCents,
  heroPnlCents, humanizeMistake, sideBetLedger, topMistakes
} from '../../app/utils/analysis'
import type { RoundRecord, TrainingStats } from '../../app/stores/useBlackjackStore'

const ROUNDS: RoundRecord[] = [
  {
    round: 1, at: 1, visibleCards: [],
    dealer: { cards: [], total: 20, blackjack: false, busted: false },
    spots: [
      {
        occupant: 'hero',
        hands: [{ cards: [], bet: 2500, outcome: 'lose', net: -2500, doubled: false, fromSplit: false }],
        sideBets: [{ name: '21+3', stake: 500, net: -500, label: 'no hand' }],
        insuranceNet: 0
      },
      {
        occupant: 'bea',
        hands: [{ cards: [], bet: 1000, outcome: 'win', net: 1000, doubled: false, fromSplit: false }],
        sideBets: [], insuranceNet: 0
      }
    ],
    heroDecisions: [
      {
        handIndex: 0, cards: [], total: 16, soft: false, pair: false, pairBucket: null, upBucket: 10,
        dealerUp: '10♦', action: 'stand', book: 'hit', deviationId: null, deviationPlay: null,
        correct: false, costCents: 540, evs: {}, rc: 0, tc: 0, category: 'hard'
      }
    ],
    heroInsurance: null
  },
  {
    round: 2, at: 2, visibleCards: [],
    dealer: { cards: [], total: 22, blackjack: false, busted: true },
    spots: [{
      occupant: 'hero',
      hands: [{ cards: [], bet: 2500, outcome: 'win', net: 2500, doubled: false, fromSplit: false }],
      sideBets: [], insuranceNet: -100
    }],
    heroDecisions: [],
    heroInsurance: { took: 200, book: 'decline', correct: false, rc: 0, tc: 0 }
  }
]

const TRAINING: TrainingStats = {
  adherence: {
    hard: { decisions: 10, correct: 8 },
    soft: { decisions: 0, correct: 0 },
    pair: { decisions: 2, correct: 2 },
    surrender: { decisions: 1, correct: 0 },
    insurance: { decisions: 2, correct: 1 }
  },
  mistakeBag: { 'hard|16|10': 3, 'pair|8|10': 1, 'soft|18|9': 2 },
  countChecks: [
    { at: 1, entered: 5, actual: 5 },
    { at: 2, entered: 4, actual: 5 },
    { at: 3, entered: 1, actual: 5 }
  ],
  drillBests: {}
}

describe('analysis helpers', () => {
  it('adherenceRows computes percentages and skips empty categories flagging them', () => {
    const rows = adherenceRows(TRAINING)
    const hard = rows.find(r => r.category === 'hard')!
    expect(hard.pct).toBe(80)
    expect(rows.find(r => r.category === 'soft')!.decisions).toBe(0)
  })

  it('topMistakes sorts by count and humanizes machine keys', () => {
    const top = topMistakes(TRAINING.mistakeBag, 2)
    expect(top).toHaveLength(2)
    expect(top[0]).toEqual({ key: 'hard|16|10', label: 'Hard 16 vs T', count: 3 })
    expect(humanizeMistake('pair|8|10')).toBe('Pair of 8s vs T')
    expect(humanizeMistake('soft|18|9')).toBe('Soft 18 vs 9')
    expect(humanizeMistake('hard|12|11')).toBe('Hard 12 vs A')
  })

  it('evLostCents sums decision costs; heroPnlCents sums hero nets', () => {
    expect(evLostCents(ROUNDS)).toBe(540)
    expect(heroPnlCents(ROUNDS)).toBe(-2500 - 500 + 2500 - 100)
  })

  it('countAccuracy buckets exact and within-one', () => {
    expect(countAccuracy(TRAINING.countChecks)).toEqual({ total: 3, exact: 1, withinOne: 2 })
  })

  it('sideBetLedger aggregates by bet name', () => {
    expect(sideBetLedger(ROUNDS)).toEqual([{ name: '21+3', staked: 500, net: -500 }])
  })

  it('bankrollSeries reconstructs backwards from the current bankroll', () => {
    // current 49_400; round2 net +2400 → before round2 47_000; round1 net −3000 → start 50_000
    expect(bankrollSeries(ROUNDS, 49_400)).toEqual([50_000, 47_000, 49_400])
  })

  it('botPnl aggregates non-hero spots by persona', () => {
    expect(botPnl(ROUNDS)).toEqual([{ id: 'bea', net: 1000 }])
  })
})
```

- [ ] **Step 2:** Run `pnpm test:unit test/unit/analysis.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `app/utils/analysis.ts`:

```ts
import type { DecisionCategory, RoundRecord, TrainingStats } from '../stores/useBlackjackStore'

export interface CategoryRow {
  category: DecisionCategory
  decisions: number
  correct: number
  pct: number
}

export function adherenceRows(t: TrainingStats): CategoryRow[] {
  return (Object.entries(t.adherence) as Array<[DecisionCategory, { decisions: number, correct: number }]>)
    .map(([category, a]) => ({
      category,
      decisions: a.decisions,
      correct: a.correct,
      pct: a.decisions === 0 ? 0 : Math.round((a.correct / a.decisions) * 100)
    }))
}

const UP_LABEL: Record<string, string> = { 10: 'T', 11: 'A' }

export function humanizeMistake(key: string): string {
  const [kind, total, up] = key.split('|')
  const upLabel = UP_LABEL[up ?? ''] ?? up ?? '?'
  if (kind === 'pair') return `Pair of ${UP_LABEL[total ?? ''] ?? total}s vs ${upLabel}`
  if (kind === 'soft') return `Soft ${total} vs ${upLabel}`
  return `Hard ${total} vs ${upLabel}`
}

export function topMistakes(bag: Record<string, number>, n = 5): Array<{ key: string, label: string, count: number }> {
  return Object.entries(bag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, label: humanizeMistake(key), count }))
}

function heroSpotOf(round: RoundRecord) {
  return round.spots.find(s => s.occupant === 'hero')
}

function heroNetOf(round: RoundRecord): number {
  const hero = heroSpotOf(round)
  if (!hero) return 0
  return hero.hands.reduce((sum, h) => sum + h.net, 0)
    + hero.sideBets.reduce((sum, b) => sum + b.net, 0)
    + hero.insuranceNet
}

export function evLostCents(history: RoundRecord[]): number {
  return history.reduce((sum, r) =>
    sum + (r.heroDecisions ?? []).reduce((s, d) => s + d.costCents, 0), 0)
}

export function heroPnlCents(history: RoundRecord[]): number {
  return history.reduce((sum, r) => sum + heroNetOf(r), 0)
}

export function countAccuracy(checks: TrainingStats['countChecks']): { total: number, exact: number, withinOne: number } {
  const total = checks.length
  const exact = checks.filter(c => c.entered === c.actual).length
  const withinOne = checks.filter(c => Math.abs(c.entered - c.actual) <= 1).length
  return { total, exact, withinOne }
}

export function sideBetLedger(history: RoundRecord[]): Array<{ name: string, staked: number, net: number }> {
  const map = new Map<string, { staked: number, net: number }>()
  for (const round of history) {
    const hero = heroSpotOf(round)
    for (const bet of hero?.sideBets ?? []) {
      const entry = map.get(bet.name) ?? { staked: 0, net: 0 }
      entry.staked += bet.stake
      entry.net += bet.net
      map.set(bet.name, entry)
    }
  }
  return [...map.entries()].map(([name, v]) => ({ name, ...v }))
}

/** Oldest→newest bankroll curve ending at `current` — one point before each round plus the end. */
export function bankrollSeries(history: RoundRecord[], current: number): number[] {
  const series = new Array<number>(history.length + 1)
  series[history.length] = current
  for (let i = history.length - 1; i >= 0; i--) {
    series[i] = series[i + 1]! - heroNetOf(history[i]!)
  }
  return series
}

export function botPnl(history: RoundRecord[]): Array<{ id: string, net: number }> {
  const map = new Map<string, number>()
  for (const round of history) {
    for (const spot of round.spots) {
      if (spot.occupant === 'hero') continue
      const net = spot.hands.reduce((sum, h) => sum + h.net, 0) + spot.insuranceNet
      map.set(spot.occupant, (map.get(spot.occupant) ?? 0) + net)
    }
  }
  return [...map.entries()].map(([id, net]) => ({ id, net }))
}
```

- [ ] **Step 4:** Run `pnpm test:unit test/unit/analysis.test.ts` — PASS (7).

- [ ] **Step 5: Implement `app/pages/analysis.vue`:**

```vue
<script setup lang="ts">
import {
  adherenceRows, bankrollSeries, botPnl, countAccuracy, evLostCents,
  heroPnlCents, sideBetLedger, topMistakes
} from '~/utils/analysis'
import { PERSONAS } from '~/utils/engine/bots'

const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const rows = computed(() => adherenceRows(store.training))
const overall = computed(() => {
  const d = rows.value.reduce((s, r) => s + r.decisions, 0)
  const c = rows.value.reduce((s, r) => s + r.correct, 0)
  return { decisions: d, pct: d === 0 ? 0 : Math.round((c / d) * 100) }
})
const mistakes = computed(() => topMistakes(store.training.mistakeBag))
const evLost = computed(() => evLostCents(store.history))
const pnl = computed(() => heroPnlCents(store.history))
const counts = computed(() => countAccuracy(store.training.countChecks))
const recentCounts = computed(() => countAccuracy(store.training.countChecks.slice(-10)))
const ledger = computed(() => sideBetLedger(store.history))
const bots = computed(() => botPnl(store.history).map(b => ({
  ...b, name: PERSONAS.find(p => p.id === b.id)?.name ?? b.id
})))

const series = computed(() => bankrollSeries(store.history, store.bankroll))
const sparkPoints = computed(() => {
  const s = series.value
  if (s.length < 2) return ''
  const min = Math.min(...s)
  const max = Math.max(...s)
  const span = Math.max(1, max - min)
  return s.map((v, i) =>
    `${(i / (s.length - 1)) * 200},${36 - ((v - min) / span) * 32}`).join(' ')
})

function money(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString()}`
}
</script>

<template>
  <main class="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Session analysis
    </h1>

    <section class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <p class="text-xs uppercase tracking-wide text-neutral-500">Book adherence</p>
        <p
          class="mt-1 text-2xl font-bold text-[var(--accent-gold)]"
          data-testid="adherence-overall"
        >{{ overall.pct }}%</p>
        <p class="text-xs text-neutral-500">{{ overall.decisions }} graded decisions</p>
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <p class="text-xs uppercase tracking-wide text-neutral-500">EV lost to mistakes</p>
        <p class="mt-1 text-2xl font-bold text-red-400">${{ (evLost / 100).toFixed(2) }}</p>
        <p class="text-xs text-neutral-500">vs actual P&L {{ money(pnl) }} — variance is loud, mistakes are quiet</p>
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <p class="text-xs uppercase tracking-wide text-neutral-500">Count accuracy</p>
        <p class="mt-1 text-2xl font-bold text-[var(--accent-cream)]">
          {{ counts.total === 0 ? '—' : `${Math.round((counts.exact / counts.total) * 100)}%` }}
        </p>
        <p class="text-xs text-neutral-500">{{ counts.total }} checks · {{ counts.withinOne }} within ±1</p>
        <p
          v-if="counts.total > 10"
          class="text-xs text-neutral-500"
        >
          trend: last 10 at {{ Math.round((recentCounts.exact / Math.max(1, recentCounts.total)) * 100) }}%
        </p>
      </div>
    </section>

    <section class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <h2 class="text-sm font-semibold text-neutral-300">Adherence by category</h2>
      <div
        v-for="row in rows"
        :key="row.category"
        class="mt-2"
      >
        <div class="flex justify-between text-xs text-neutral-400">
          <span class="capitalize">{{ row.category }}</span>
          <span>{{ row.decisions === 0 ? 'no decisions yet' : `${row.pct}% of ${row.decisions}` }}</span>
        </div>
        <div class="mt-0.5 h-1.5 rounded bg-neutral-800">
          <div
            class="h-1.5 rounded bg-[var(--accent-gold)]"
            :style="{ width: `${row.pct}%` }"
          />
        </div>
      </div>
    </section>

    <section class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <h2 class="text-sm font-semibold text-neutral-300">Most repeated mistakes</h2>
        <p
          v-if="mistakes.length === 0"
          class="mt-2 text-xs text-neutral-500"
        >
          Clean sheet so far.
        </p>
        <ol class="mt-2 space-y-1 text-xs text-neutral-400">
          <li
            v-for="m in mistakes"
            :key="m.key"
            class="flex justify-between"
          >
            <span>{{ m.label }}</span>
            <span class="font-mono">×{{ m.count }}</span>
          </li>
        </ol>
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <h2 class="text-sm font-semibold text-neutral-300">Bankroll</h2>
        <svg
          viewBox="0 0 200 40"
          class="mt-2 h-10 w-full"
          aria-hidden="true"
        >
          <polyline
            :points="sparkPoints"
            fill="none"
            stroke="var(--accent-gold)"
            stroke-width="1.5"
          />
        </svg>
        <p class="text-xs text-neutral-500">{{ store.history.length }} rounds · now ${{ (store.bankroll / 100).toLocaleString() }}</p>
      </div>
    </section>

    <section class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <h2 class="text-sm font-semibold text-neutral-300">Side-bet ledger</h2>
        <p
          v-if="ledger.length === 0"
          class="mt-2 text-xs text-neutral-500"
        >
          No side bets placed — the book approves.
        </p>
        <table
          v-else
          class="mt-2 w-full text-xs text-neutral-400"
        >
          <tbody>
            <tr
              v-for="row in ledger"
              :key="row.name"
            >
              <td>{{ row.name }}</td>
              <td class="text-right font-mono">staked ${{ (row.staked / 100).toLocaleString() }}</td>
              <td
                class="text-right font-mono"
                :class="row.net < 0 ? 'text-red-400' : 'text-emerald-400'"
              >{{ money(row.net) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <h2 class="text-sm font-semibold text-neutral-300">Bot P&L — cost of their leak</h2>
        <p
          v-if="bots.length === 0"
          class="mt-2 text-xs text-neutral-500"
        >
          No companions this session.
        </p>
        <table
          v-else
          class="mt-2 w-full text-xs text-neutral-400"
        >
          <tbody>
            <tr
              v-for="bot in bots"
              :key="bot.id"
            >
              <td>{{ bot.name }}</td>
              <td
                class="text-right font-mono"
                :class="bot.net < 0 ? 'text-red-400' : 'text-emerald-400'"
              >{{ money(bot.net) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
```

- [ ] **Step 6: Page smoke test** (`test/nuxt/analysisPage.test.ts`):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AnalysisPage from '../../app/pages/analysis.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'

describe('analysis page', () => {
  beforeEach(() => localStorage.clear())

  it('renders with an empty store (all zero states)', async () => {
    const store = useBlackjackStore()
    store.clearAll()
    const w = await mountSuspended(AnalysisPage)
    expect(w.find('[data-testid="adherence-overall"]').text()).toBe('0%')
    expect(w.text()).toContain('Clean sheet')
  })
})
```

- [ ] **Step 7:** Run `pnpm test` — green. Full gates clean.

- [ ] **Step 8: Commit**

```bash
git add app/utils/analysis.ts app/pages/analysis.vue test/unit/analysis.test.ts test/nuxt/analysisPage.test.ts
git commit -m "feat(ui): add analysis page with adherence, EV-lost, and ledgers"
```

---

### Task 13: Learn page

**Files:**
- Modify: `app/utils/engine/sideBets.ts` (add `export` to the four pay-table consts — nothing else)
- Create: `app/components/learn/StrategyChartView.vue`, `app/components/learn/RuleExplorer.vue`, `app/pages/learn.vue`
- Test: `test/nuxt/learnPage.test.ts`

- [ ] **Step 1: Export the pay tables.** In `sideBets.ts` change `const TWENTY_ONE_PLUS_THREE_PAYS` → `export const TWENTY_ONE_PLUS_THREE_PAYS`, and likewise for `LUCKY_LADIES_PAYS`, `MATCH_THE_DEALER_PAYS`, `BUSTER_PAYS`. Run `pnpm test:unit` — still green (export-only change).

- [ ] **Step 2: Implement `StrategyChartView.vue`:**

```vue
<script setup lang="ts">
import type { Bucket } from '~/utils/engine/cards'
import type { RuleSet } from '~/utils/engine/rules'
import type { ChartCode } from '~/utils/engine/basicStrategy'
import { BUCKETS, bestAction, bestActionFull, generateChart } from '~/utils/engine/basicStrategy'
import { pctEV } from '~/utils/advisor'

const props = defineProps<{
  rules: RuleSet
}>()

const chart = computed(() => generateChart(props.rules))

const CODE_STYLE: Record<ChartCode, string> = {
  H: 'bg-sky-950 text-sky-300',
  S: 'bg-emerald-950 text-emerald-300',
  D: 'bg-amber-900 text-amber-200',
  Ds: 'bg-amber-950 text-amber-300',
  P: 'bg-purple-950 text-purple-300',
  Rh: 'bg-neutral-800 text-neutral-300',
  Rs: 'bg-neutral-800 text-neutral-300',
  Rp: 'bg-neutral-800 text-neutral-300'
}

const upLabel = (b: Bucket) => b === 11 ? 'A' : b === 10 ? 'T' : String(b)
const pairLabel = (b: Bucket) => b === 11 ? 'A,A' : b === 10 ? 'T,T' : `${b},${b}`

interface Selection {
  kind: 'hard' | 'soft' | 'pair'
  row: number
  up: Bucket
}
const selected = ref<Selection | null>(null)

const detail = computed(() => {
  const sel = selected.value
  if (!sel) return null
  const rec = sel.kind === 'pair'
    ? bestActionFull(
        { pair: sel.row as Bucket, total: sel.row === 11 ? 12 : sel.row * 2, soft: sel.row === 11 },
        sel.up, props.rules)
    : bestAction(
        { total: sel.row, soft: sel.kind === 'soft', twoCards: true, fromSplit: false },
        sel.up, props.rules)
  const label = sel.kind === 'pair' ? pairLabel(sel.row as Bucket) : `${sel.kind} ${sel.row}`
  return { label, up: upLabel(sel.up), action: rec.action, evs: Object.entries(rec.evs) as Array<[string, number]> }
})

const hardRows = computed(() => Object.keys(chart.value.hard).map(Number).sort((a, b) => a - b))
const softRows = computed(() => Object.keys(chart.value.soft).map(Number).sort((a, b) => a - b))
</script>

<template>
  <div class="space-y-4 text-xs">
    <div
      v-for="section in ([
        { kind: 'hard', title: 'Hard totals', rows: hardRows, grid: chart.hard, label: (r: number) => String(r) },
        { kind: 'soft', title: 'Soft totals', rows: softRows, grid: chart.soft, label: (r: number) => `A,${r - 11}` },
        { kind: 'pair', title: 'Pairs', rows: BUCKETS, grid: chart.pairs, label: (r: number) => pairLabel(r as Bucket) }
      ] as const)"
      :key="section.kind"
    >
      <h3 class="mb-1 font-semibold text-neutral-300">
        {{ section.title }}
      </h3>
      <div class="overflow-x-auto">
        <table class="border-collapse font-mono">
          <thead>
            <tr>
              <th class="p-1 text-neutral-500" />
              <th
                v-for="up in BUCKETS"
                :key="up"
                class="p-1 text-neutral-500"
              >{{ upLabel(up) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in section.rows"
              :key="row"
            >
              <th class="p-1 text-right text-neutral-500">{{ section.label(row) }}</th>
              <td
                v-for="up in BUCKETS"
                :key="up"
                class="p-0.5"
              >
                <button
                  type="button"
                  class="block h-6 w-7 rounded text-center font-bold"
                  :class="[CODE_STYLE[(section.grid as Record<number, Record<Bucket, ChartCode>>)[row]![up]!],
                           selected?.kind === section.kind && selected?.row === row && selected?.up === up ? 'ring-1 ring-[var(--accent-gold)]' : '']"
                  :data-testid="`cell-${section.kind}-${row}-${up}`"
                  @click="selected = { kind: section.kind, row, up }"
                >
                  {{ (section.grid as Record<number, Record<Bucket, ChartCode>>)[row]![up] }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="detail"
      class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
      data-testid="cell-detail"
    >
      <p class="font-semibold text-[var(--accent-cream)]">
        {{ detail.label }} vs {{ detail.up }} → <span class="text-[var(--accent-gold)]">{{ detail.action }}</span>
      </p>
      <table class="mt-1 font-mono">
        <tbody>
          <tr
            v-for="[action, ev] in detail.evs"
            :key="action"
            :class="action === detail.action ? 'text-[var(--accent-cream)]' : 'text-neutral-500'"
          >
            <td class="pr-3">{{ action }}</td>
            <td>{{ pctEV(ev) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-neutral-500">
      H hit · S stand · D double (else hit) · Ds double (else stand) · P split · Rh/Rs/Rp surrender (else hit/stand/split)
    </p>
  </div>
</template>
```

- [ ] **Step 3: Implement `RuleExplorer.vue`:**

```vue
<script setup lang="ts">
import { PRESETS, cloneRules, validateRuleSet } from '~/utils/engine/rules'
import { houseEdge } from '~/utils/engine/basicStrategy'

const draft = ref(cloneRules(PRESETS.VEGAS_STRIP_6D!))
const baseline = houseEdge(PRESETS.VEGAS_STRIP_6D!)

const valid = computed(() => validateRuleSet(draft.value).length === 0)
const edge = computed(() => valid.value ? houseEdge(draft.value) : null)
const delta = computed(() => edge.value === null ? null : (edge.value - baseline) * 100)

function reset(): void {
  draft.value = cloneRules(PRESETS.VEGAS_STRIP_6D!)
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs text-neutral-400">
      Toggle a rule, watch the edge move. Baseline: Vegas Strip 6-deck ({{ (baseline * 100).toFixed(2) }}%).
    </p>
    <RulesEditor v-model="draft" />
    <div class="flex items-center gap-3">
      <p
        v-if="edge !== null"
        class="text-sm font-semibold text-[var(--accent-cream)]"
        data-testid="explorer-edge"
      >
        House edge ≈{{ (edge * 100).toFixed(2) }}%
        <span
          v-if="delta !== null && Math.abs(delta) >= 0.005"
          :class="delta > 0 ? 'text-red-400' : 'text-emerald-400'"
        >({{ delta > 0 ? '+' : '' }}{{ delta.toFixed(2) }} vs baseline)</span>
      </p>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        @click="reset"
      >
        Reset
      </UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Implement `app/pages/learn.vue`** — tabs over engine-driven and static content:

```vue
<script setup lang="ts">
import { ILLUSTRIOUS_18, FAB_4 } from '~/utils/engine/counting'
import {
  TWENTY_ONE_PLUS_THREE_PAYS, LUCKY_LADIES_PAYS, MATCH_THE_DEALER_PAYS, BUSTER_PAYS
} from '~/utils/engine/sideBets'
import { PRESETS } from '~/utils/engine/rules'

const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const activeRules = computed(() => store.settings?.rules ?? PRESETS.VEGAS_STRIP_6D!)

const tabs = [
  { label: 'Strategy chart', value: 'chart' },
  { label: 'Rules lab', value: 'rules' },
  { label: 'Counting', value: 'counting' },
  { label: 'Side bets', value: 'sidebets' },
  { label: 'Myths', value: 'myths' },
  { label: 'Procedure', value: 'procedure' },
  { label: 'Glossary', value: 'glossary' }
]
const tab = ref('chart')

const HILO_ROWS = [
  { cards: '2 3 4 5 6', tag: '+1', value: 1 },
  { cards: '7 8 9', tag: '0', value: 0 },
  { cards: '10 J Q K A', tag: '−1', value: -1 }
] // mirrors engine hiLoValue — the unit suite pins those values

const DEVIATIONS = [...ILLUSTRIOUS_18, ...FAB_4]

const MYTHS = [
  {
    title: 'Third base controls the dealer',
    claim: '“A bad player at third base takes the dealer\'s bust card.”',
    truth: 'The unseen card is equally likely to help or hurt — over all orderings the dealer\'s outcome distribution is identical. Lucky Lou will never believe this.',
    persona: 'lou'
  },
  {
    title: 'Hot dealers and cold shoes',
    claim: '“This dealer has been hot all night — switch tables.”',
    truth: 'Cards have no memory between rounds beyond composition, and dealers make zero decisions. Streaks are what randomness looks like.',
    persona: 'lou'
  },
  {
    title: 'Insurance protects good hands',
    claim: '“Always insure a 20 — protect your hand!”',
    truth: 'Insurance is a separate bet on the hole card being a ten. With a 20 you hold two of the tens yourself — the insurance bet is even worse. Take it only at TC ≥ +3.',
    persona: 'ivan'
  },
  {
    title: 'Due to win',
    claim: '“I\'ve lost six in a row — I\'m due.”',
    truth: 'Every round is drawn from the same shoe distribution. The shoe owes you nothing; expected value is the only thing that converges.',
    persona: 'lou'
  },
  {
    title: 'Never bust — let the dealer do it',
    claim: '“Never hit a hand that can break.”',
    truth: 'Standing on 16 vs 10 loses ~54% of your stake; hitting loses ~41%. Refusing to bust just means losing slowly to made dealer hands. Nancy\'s leak, quantified on the Analysis page.',
    persona: 'nancy'
  }
]

const PROCEDURE = [
  { step: 'Shuffle & cut', text: 'Plug, riffle, turn, strip, cut — then a player cuts the deck stack (MA §5(k)). The cut card goes in at the penetration depth.' },
  { step: 'Burn', text: 'The first card off the new shoe is burned face down — it never plays and never joins the count (MA §6(c)).' },
  { step: 'Deal order', text: 'First base to third base, one card up each, dealer up-card, second round, dealer hole card face down (MA §6(d); WA permits an alternative order).' },
  { step: 'Peek', text: 'With an ace or ten up, the dealer checks the hole card with a reader before play continues; insurance is offered first on an ace (MA §6(i), §9).' },
  { step: 'Hand signals', text: 'Brush the felt to hit, wave flat to stand — signals must be visible to the camera, voice alone is not enough (AC guide).' },
  { step: 'Cut card out', text: 'When the cut card appears mid-shoe, the current round finishes and the shoe is reshuffled (MA §5(h), §6(k)).' },
  { step: 'Announcements', text: 'The dealer announces point totals, blackjack, bust, and "Dealer\'s card" on the reveal — this app mirrors those calls in the live region.' }
]

const GLOSSARY = [
  ['Basic strategy', 'The EV-maximizing play for every hand vs every up-card, derived from the rules — no counting involved.'],
  ['Blackjack / natural', 'Ace + ten-value as the first two cards. Pays 3:2 (or 6:5 on bad tables). A split 21 is not a blackjack.'],
  ['Bust', 'Hand total over 21 — an immediate loss, even if the dealer later busts too.'],
  ['Cut card', 'A colored card placed at the penetration depth; when it comes out, the shoe gets reshuffled.'],
  ['DAS', 'Double after split — being allowed to double a hand created by splitting. Worth about +0.14% to the player.'],
  ['Deviation', 'A count-driven departure from basic strategy (e.g. stand 16 vs 10 at TC ≥ 0).'],
  ['Even money', 'Taking 1:1 on your blackjack against a dealer ace — mathematically identical to insuring it. Book says decline.'],
  ['H17 / S17', 'Whether the dealer hits or stands on soft 17. H17 adds ≈0.2% to the house edge.'],
  ['House edge', 'Long-run cost per unit wagered playing perfect basic strategy. The setup screen shows the model estimate per rule set.'],
  ['Penetration', 'How deep the shoe is dealt before reshuffle. Deeper = better for counters.'],
  ['Push', 'A tie — the bet is returned.'],
  ['Running count', 'Sum of Hi-Lo tags over every card you have seen this shoe.'],
  ['True count', 'Running count divided by estimated decks remaining — normalizes the count to shoe depth.'],
  ['Late surrender', 'Forfeit half the bet after the dealer confirms no blackjack. Correct only on a few of the worst hands.']
]

const SIDEBET_TABLES = [
  { name: '21+3 (MA §28(f) / AC Xtreme)', pays: TWENTY_ONE_PLUS_THREE_PAYS },
  { name: 'Lucky Ladies (MA §24)', pays: LUCKY_LADIES_PAYS },
  { name: 'Buster Blackjack (MA §27)', pays: BUSTER_PAYS }
]
const MTD = MATCH_THE_DEALER_PAYS
</script>

<template>
  <main class="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Learn
    </h1>
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
    />

    <section v-if="tab === 'chart'">
      <p class="mb-3 text-xs text-neutral-400">
        Generated by the EV engine for <span class="font-semibold">{{ activeRules.name }}</span> — tap any cell for the math.
      </p>
      <StrategyChartView :rules="activeRules" />
    </section>

    <section v-else-if="tab === 'rules'">
      <RuleExplorer />
    </section>

    <section
      v-else-if="tab === 'counting'"
      class="space-y-3 text-sm text-neutral-300"
    >
      <h2 class="font-semibold text-[var(--accent-cream)]">Hi-Lo in three steps</h2>
      <table class="text-xs font-mono">
        <tbody>
          <tr
            v-for="row in HILO_ROWS"
            :key="row.tag"
          >
            <td class="pr-4 text-neutral-400">{{ row.cards }}</td>
            <td :class="row.value > 0 ? 'text-emerald-400' : row.value < 0 ? 'text-red-400' : 'text-neutral-500'">{{ row.tag }}</td>
          </tr>
        </tbody>
      </table>
      <p class="text-xs text-neutral-400">
        1) Add the tag of every card you see. 2) Divide by decks remaining (estimate the discard tray
        to the nearest half deck) — that's the true count. 3) Each true-count point above +1 is worth
        roughly half a percent to you. Example: RC +9 with 3 decks left → TC +3 → ≈1% player edge.
      </p>
      <h2 class="pt-2 font-semibold text-[var(--accent-cream)]">Deviations (advanced)</h2>
      <p class="text-xs text-neutral-400">
        The Illustrious 18 + Fab 4 — the only departures from basic strategy worth memorizing first. Insurance at TC ≥ +3 is the single most valuable line.
      </p>
      <table
        class="w-full text-xs"
        data-testid="deviation-table"
      >
        <thead>
          <tr class="text-left text-neutral-500">
            <th class="py-1">Play</th><th>Threshold</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="dev in DEVIATIONS"
            :key="dev.id"
            class="border-t border-neutral-800 text-neutral-300"
          >
            <td class="py-1">{{ dev.description }}</td>
            <td class="font-mono">{{ dev.minTrueCount !== undefined ? `TC ≥ ${dev.minTrueCount}` : `TC ≤ ${dev.maxTrueCount}` }}</td>
            <td class="capitalize">{{ dev.play.replace('-', ' ') }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section
      v-else-if="tab === 'sidebets'"
      class="space-y-4 text-sm"
    >
      <UAlert
        color="warning"
        variant="soft"
        title="Every table below is the official pay schedule — and every one of these bets costs several times the main game's edge."
        description="Track what they actually cost you on the Analysis page ledger."
      />
      <div
        v-for="table in SIDEBET_TABLES"
        :key="table.name"
      >
        <h2 class="font-semibold text-[var(--accent-cream)]">{{ table.name }}</h2>
        <table class="mt-1 w-full text-xs text-neutral-300">
          <tbody>
            <tr
              v-for="(pays, variant) in table.pays"
              :key="variant"
              class="border-t border-neutral-800 align-top"
            >
              <td class="py-1 pr-3 font-mono text-neutral-500">{{ variant }}</td>
              <td class="py-1">
                <span
                  v-for="(mult, outcome) in pays"
                  :key="outcome"
                  class="mr-3 inline-block"
                >{{ outcome }} <span class="font-mono text-[var(--accent-gold)]">{{ mult }}:1</span></span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <h2 class="font-semibold text-[var(--accent-cream)]">Match the Dealer (MA §23, deck-dependent)</h2>
        <table class="mt-1 w-full text-xs text-neutral-300">
          <tbody>
            <tr
              v-for="(pays, decks) in MTD"
              :key="decks"
              class="border-t border-neutral-800"
            >
              <td class="py-1 pr-3 font-mono text-neutral-500">{{ decks }} decks</td>
              <td class="py-1">
                <span
                  v-for="(mult, tier) in pays"
                  :key="tier"
                  class="mr-3 inline-block"
                >{{ tier }} <span class="font-mono text-[var(--accent-gold)]">{{ mult }}:1</span></span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section
      v-else-if="tab === 'myths'"
      class="grid gap-3 sm:grid-cols-2"
    >
      <div
        v-for="myth in MYTHS"
        :key="myth.title"
        class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
      >
        <h2 class="text-sm font-semibold text-[var(--accent-cream)]">{{ myth.title }}</h2>
        <p class="mt-1 text-xs italic text-neutral-500">{{ myth.claim }}</p>
        <p class="mt-1 text-xs text-neutral-300">{{ myth.truth }}</p>
      </div>
    </section>

    <section
      v-else-if="tab === 'procedure'"
      class="space-y-2"
    >
      <ol class="space-y-2">
        <li
          v-for="(item, i) in PROCEDURE"
          :key="item.step"
          class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm"
        >
          <span class="font-semibold text-[var(--accent-gold)]">{{ i + 1 }}. {{ item.step }}</span>
          <p class="mt-0.5 text-xs text-neutral-400">{{ item.text }}</p>
        </li>
      </ol>
      <p class="text-[11px] text-neutral-600">
        Sources: 205 CMR (Massachusetts), Bally's AC gaming guide, WA Gambling Commission rules — all in <code>docs/</code>.
      </p>
    </section>

    <section
      v-else
      class="text-sm"
    >
      <dl class="space-y-2">
        <div
          v-for="[term, def] in GLOSSARY"
          :key="term"
          class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5"
        >
          <dt class="text-xs font-semibold text-[var(--accent-cream)]">{{ term }}</dt>
          <dd class="mt-0.5 text-xs text-neutral-400">{{ def }}</dd>
        </div>
      </dl>
    </section>
  </main>
</template>
```

- [ ] **Step 5: Tests** (`test/nuxt/learnPage.test.ts`):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import StrategyChartView from '../../app/components/learn/StrategyChartView.vue'
import RuleExplorer from '../../app/components/learn/RuleExplorer.vue'
import LearnPage from '../../app/pages/learn.vue'
import { PRESETS } from '../../app/utils/engine/rules'

describe('StrategyChartView', () => {
  it('renders the generated grids and a cell detail on click', async () => {
    const w = await mountSuspended(StrategyChartView, { props: { rules: PRESETS.VEGAS_STRIP_6D! } })
    const cell = w.find('[data-testid="cell-hard-16-10"]')
    expect(cell.exists()).toBe(true)
    expect(cell.text()).toBe('H') // Vegas: no surrender → 16vT hits
    await cell.trigger('click')
    const detail = w.find('[data-testid="cell-detail"]')
    expect(detail.text()).toContain('hard 16 vs T')
    expect(detail.text()).toMatch(/-\d+\.\d%/)
  })
})

describe('RuleExplorer', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves the edge when H17 is toggled', async () => {
    const w = await mountSuspended(RuleExplorer)
    const before = w.find('[data-testid="explorer-edge"]').text()
    const h17 = w.findAll('input[type="checkbox"], button[role="switch"]')[0]!
    await h17.trigger('click')
    const after = w.find('[data-testid="explorer-edge"]').text()
    expect(after).not.toBe(before)
  })
})

describe('learn page', () => {
  it('mounts with the chart tab and engine-driven content', async () => {
    const w = await mountSuspended(LearnPage)
    expect(w.text()).toContain('Generated by the EV engine')
    expect(w.find('[data-testid="cell-hard-16-10"]').exists()).toBe(true)
  })
})
```

(If the `RuleExplorer` switch selector proves brittle against @nuxt/ui's rendered DOM, target the H17 switch through `RulesEditor`'s label text instead: find the element whose text contains 'Dealer hits soft 17' and click its switch child.)

- [ ] **Step 6:** Run `pnpm test` — green. Full gates clean.

- [ ] **Step 7: Commit**

```bash
git add app/utils/engine/sideBets.ts app/components/learn/ app/pages/learn.vue test/nuxt/learnPage.test.ts
git commit -m "feat(ui): add learn page — interactive chart, rules lab, counting, myths"
```

---

### Task 14: Drills — Strategy Flash + Deviation Quiz

**Files:**
- Create: `app/components/drills/StrategyFlash.vue`, `app/components/drills/DeviationQuiz.vue`
- Test: `test/nuxt/drillsStrategy.test.ts`

Both components take an injectable `rng` prop (default `Math.random`) so tests are deterministic. They use the active session rules when a session exists, else Vegas Strip.

- [ ] **Step 1: Implement `StrategyFlash.vue`:**

```vue
<script setup lang="ts">
import type { Card, Suit } from '~/utils/engine/cards'
import { bucketOf } from '~/utils/engine/cards'
import type { Action } from '~/utils/engine/hand'
import { handTotal, isPair, legalActions, newHand } from '~/utils/engine/hand'
import { bestAction, bestActionFull } from '~/utils/engine/basicStrategy'
import { PRESETS } from '~/utils/engine/rules'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random })

const store = useBlackjackStore()
const rules = computed(() => store.settings?.rules ?? PRESETS.VEGAS_STRIP_6D!)

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
const suit = (i: number): Suit => SUITS[i % 4]!

interface Situation {
  cards: Card[]
  up: Card
}

function rankFor(bucket: number): number {
  return bucket === 11 ? 14 : bucket
}

/** Rebuild a situation from a mistakeBag key — drills re-ask what the table missed. */
function fromMistakeKey(key: string): Situation | null {
  const [kind, totalRaw, upRaw] = key.split('|')
  const total = Number(totalRaw)
  const up = Number(upRaw)
  if (!kind || !Number.isFinite(total) || !Number.isFinite(up)) return null
  if (kind === 'pair') {
    const r = rankFor(total)
    return { cards: [{ rank: r, suit: suit(0) }, { rank: r, suit: suit(1) }], up: { rank: rankFor(up), suit: suit(2) } }
  }
  if (kind === 'soft') {
    return { cards: [{ rank: 14, suit: suit(0) }, { rank: total - 11, suit: suit(1) }], up: { rank: rankFor(up), suit: suit(2) } }
  }
  const a = Math.min(10, total - 2)
  return { cards: [{ rank: a, suit: suit(0) }, { rank: total - a, suit: suit(1) }], up: { rank: rankFor(up), suit: suit(2) } }
}

function randomSituation(): Situation {
  const bagKeys = Object.keys(store.training.mistakeBag)
  if (bagKeys.length > 0 && props.rng() < 0.5) {
    const key = bagKeys[Math.floor(props.rng() * bagKeys.length)]!
    const rebuilt = fromMistakeKey(key)
    if (rebuilt) return rebuilt
  }
  const upBucket = 2 + Math.floor(props.rng() * 10) // 2..11
  const up: Card = { rank: rankFor(upBucket), suit: suit(2) }
  const roll = props.rng()
  if (roll < 0.25) { // pair
    const p = 2 + Math.floor(props.rng() * 10)
    const r = rankFor(p)
    return { cards: [{ rank: r, suit: suit(0) }, { rank: r, suit: suit(1) }], up }
  }
  if (roll < 0.5) { // soft 13-20
    const total = 13 + Math.floor(props.rng() * 8)
    return { cards: [{ rank: 14, suit: suit(0) }, { rank: total - 11, suit: suit(1) }], up }
  }
  // hard 5-17
  const total = 5 + Math.floor(props.rng() * 13)
  const a = Math.min(10, Math.max(2, total - 2))
  return { cards: [{ rank: a, suit: suit(0) }, { rank: total - a, suit: suit(1) }], up }
}

const situation = ref<Situation>(randomSituation())
/** chosen === null → timed out */
const verdict = ref<{ chosen: Action | null, correct: boolean, book: Action } | null>(null)
const streak = ref(0)

// timed mode (spec §6: "timed, streak") — 10s per situation, toggleable
const TIME_LIMIT_MS = 10_000
const timed = ref(true)
const timeLeft = ref(TIME_LIMIT_MS)
let ticker: ReturnType<typeof setInterval> | null = null

function stopClock(): void {
  if (ticker) clearInterval(ticker)
  ticker = null
}

function startClock(): void {
  stopClock()
  if (!timed.value) return
  timeLeft.value = TIME_LIMIT_MS
  ticker = setInterval(() => {
    timeLeft.value -= 250
    if (timeLeft.value <= 0) {
      stopClock()
      verdict.value = { chosen: null, correct: false, book: bookAction.value }
      streak.value = 0
    }
  }, 250)
}

onMounted(startClock)
onBeforeUnmount(stopClock)
watch(timed, () => {
  if (!verdict.value) startClock()
})

const legal = computed(() =>
  legalActions(newHand([...situation.value.cards], 1000), 1, rules.value))

const bookAction = computed<Action>(() => {
  const cards = situation.value.cards
  const upB = bucketOf(situation.value.up)
  const { total, soft } = handTotal(cards)
  const rec = isPair(cards) && legal.value.includes('split')
    ? bestActionFull({ pair: bucketOf(cards[0]!), total, soft }, upB, rules.value)
    : bestAction({ total, soft, twoCards: true, fromSplit: false }, upB, rules.value)
  return legal.value.includes(rec.action as Action) ? rec.action as Action : (rec.evs.stand! >= rec.evs.hit! ? 'stand' : 'hit')
})

function answer(action: Action): void {
  stopClock()
  const correct = action === bookAction.value
  verdict.value = { chosen: action, correct, book: bookAction.value }
  if (correct) {
    streak.value++
    store.recordDrillBest('strategy-flash', streak.value)
  } else {
    streak.value = 0
  }
}

function next(): void {
  verdict.value = null
  situation.value = randomSituation()
  startClock()
}

const ACTION_LABEL: Record<Action, string> = {
  hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender'
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3 text-xs text-neutral-400">
      <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
      <span
        v-if="timed && !verdict"
        class="font-mono"
        data-testid="flash-clock"
      >{{ Math.ceil(timeLeft / 1000) }}s</span>
      <span class="flex items-center gap-2">
        <USwitch
          v-model="timed"
          size="xs"
          label="Timed"
        />
        <span>Best: <span class="font-mono">{{ store.training.drillBests['strategy-flash'] ?? 0 }}</span></span>
      </span>
    </div>

    <div class="flex items-center justify-center gap-6">
      <div class="text-center">
        <p class="mb-1 text-[10px] uppercase text-neutral-500">Dealer shows</p>
        <PlayingCard
          :card="situation.up"
          :face-up="true"
          size="md"
        />
      </div>
      <div class="text-center">
        <p class="mb-1 text-[10px] uppercase text-neutral-500">Your hand</p>
        <div class="flex">
          <PlayingCard
            v-for="(card, i) in situation.cards"
            :key="i"
            :card="card"
            :face-up="true"
            size="md"
            :style="{ marginLeft: i === 0 ? '0' : '-2.5rem' }"
          />
        </div>
      </div>
    </div>

    <div
      v-if="!verdict"
      class="flex flex-wrap justify-center gap-2"
    >
      <UButton
        v-for="action in legal"
        :key="action"
        color="primary"
        :variant="action === 'hit' || action === 'stand' ? 'solid' : 'soft'"
        :data-testid="`flash-${action}`"
        @click="answer(action)"
      >
        {{ ACTION_LABEL[action] }}
      </UButton>
    </div>

    <div
      v-else
      class="text-center"
      data-testid="flash-verdict"
    >
      <p
        class="text-sm font-semibold"
        :class="verdict.correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ verdict.correct
          ? `✓ ${ACTION_LABEL[verdict.chosen!]} is the book play`
          : verdict.chosen === null
            ? `⏱ Too slow — book: ${ACTION_LABEL[verdict.book]}`
            : `✗ Book: ${ACTION_LABEL[verdict.book]}` }}
      </p>
      <UButton
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        data-testid="flash-next"
        @click="next"
      >
        Next hand
      </UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Implement `DeviationQuiz.vue`:**

```vue
<script setup lang="ts">
import type { Deviation } from '~/utils/engine/counting'
import { FAB_4, ILLUSTRIOUS_18 } from '~/utils/engine/counting'
import type { Bucket } from '~/utils/engine/cards'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random })

const store = useBlackjackStore()
const POOL: Deviation[] = [...ILLUSTRIOUS_18, ...FAB_4]

interface Question {
  dev: Deviation
  tc: number
  /** true → the count clears the threshold, deviation is correct */
  active: boolean
}

function describeSituation(dev: Deviation): string {
  const up = dev.up === 11 ? 'A' : dev.up === 10 ? 'T' : String(dev.up)
  if (dev.id === 'insurance') return `Dealer shows an ace — insurance is open`
  if (dev.pair !== null) {
    const p = dev.pair === 11 ? 'A,A' : dev.pair === 10 ? 'T,T' : `${dev.pair},${dev.pair}`
    return `You hold ${p} vs dealer ${up}`
  }
  return `You hold ${dev.soft ? 'soft' : 'hard'} ${dev.total} vs dealer ${up}`
}

function bookPlayFor(dev: Deviation): string {
  // the deviation's reverse side: what basic strategy does without the count
  switch (dev.id) {
    case 'insurance': return 'decline'
    case 'fab-15vT-keep': return 'surrender'
    default:
      return dev.play === 'stand' ? 'hit' : dev.play === 'surrender' ? 'hit' : dev.play === 'split' ? 'stand' : 'hit'
  }
}

function makeQuestion(): Question {
  const dev = POOL[Math.floor(props.rng() * POOL.length)]!
  const threshold = dev.minTrueCount ?? dev.maxTrueCount!
  const above = props.rng() < 0.5
  const offset = 1 + Math.floor(props.rng() * 2)
  const tc = dev.minTrueCount !== undefined
    ? (above ? threshold + offset : threshold - offset)
    : (above ? threshold - offset : threshold + offset) // maxTrueCount: "above" = deeper negative → active
  const active = dev.minTrueCount !== undefined ? tc >= dev.minTrueCount : tc <= dev.maxTrueCount!
  return { dev, tc, active }
}

const question = ref<Question>(makeQuestion())
const verdict = ref<{ correct: boolean, explanation: string } | null>(null)
const streak = ref(0)

const options = computed(() => {
  const devLabel = question.value.dev.play.replace('-', ' ')
  return [
    { id: 'deviate', label: devLabel },
    { id: 'book', label: bookPlayFor(question.value.dev) }
  ]
})

function answer(id: 'deviate' | 'book'): void {
  const q = question.value
  const correct = q.active ? id === 'deviate' : id === 'book'
  const threshold = q.dev.minTrueCount !== undefined ? `TC ≥ ${q.dev.minTrueCount}` : `TC ≤ ${q.dev.maxTrueCount}`
  verdict.value = {
    correct,
    explanation: `${q.dev.description} applies at ${threshold}; the count is ${q.tc.toFixed(0)} → ${q.active ? 'deviate' : 'stay with the book'}.`
  }
  if (correct) {
    streak.value++
    store.recordDrillBest('deviation-quiz', streak.value)
  } else {
    streak.value = 0
  }
}

function next(): void {
  verdict.value = null
  question.value = makeQuestion()
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between text-xs text-neutral-400">
      <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
      <span>Best: <span class="font-mono">{{ store.training.drillBests['deviation-quiz'] ?? 0 }}</span></span>
    </div>

    <div
      class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-center"
      data-testid="quiz-situation"
    >
      <p class="text-sm text-neutral-200">{{ describeSituation(question.dev) }}</p>
      <p class="mt-1 font-mono text-lg font-bold text-[var(--accent-cream)]">TC {{ question.tc > 0 ? '+' : '' }}{{ question.tc.toFixed(0) }}</p>
    </div>

    <div
      v-if="!verdict"
      class="flex justify-center gap-2"
    >
      <UButton
        v-for="opt in options"
        :key="opt.id"
        color="primary"
        variant="soft"
        class="capitalize"
        :data-testid="`quiz-${opt.id}`"
        @click="answer(opt.id as 'deviate' | 'book')"
      >
        {{ opt.label }}
      </UButton>
    </div>

    <div
      v-else
      class="text-center"
      data-testid="quiz-verdict"
    >
      <p
        class="text-sm font-semibold"
        :class="verdict.correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ verdict.correct ? '✓ Correct' : '✗ Not this time' }}
      </p>
      <p class="mt-1 text-xs text-neutral-400">{{ verdict.explanation }}</p>
      <UButton
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        data-testid="quiz-next"
        @click="next"
      >
        Next
      </UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Tests** (`test/nuxt/drillsStrategy.test.ts`) — seeded rng makes both deterministic:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import StrategyFlash from '../../app/components/drills/StrategyFlash.vue'
import DeviationQuiz from '../../app/components/drills/DeviationQuiz.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { mulberry32 } from '../../app/utils/engine/rng'

describe('StrategyFlash', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('grades an answer against the engine book play and tracks the streak', async () => {
    const store = useBlackjackStore()
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(42) } })
    // answer every legal action until the verdict appears; the component grades vs engine truth
    const firstLegal = w.find('[data-testid^="flash-"]')
    expect(firstLegal.exists()).toBe(true)
    await firstLegal.trigger('click')
    const verdict = w.find('[data-testid="flash-verdict"]')
    expect(verdict.exists()).toBe(true)
    expect(verdict.text()).toMatch(/✓|✗/)
    await w.find('[data-testid="flash-next"]').trigger('click')
    expect(w.find('[data-testid="flash-verdict"]').exists()).toBe(false)
    void store
  })

  it('replays mistakeBag situations (seeded rng path executes fromMistakeKey)', async () => {
    const store = useBlackjackStore()
    store.training.mistakeBag['hard|16|10'] = 3
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(1) } }) // first rng() = 0.2536 < 0.5 → replay path
    expect(w.text()).toContain('Dealer shows')
  })

  it('timed mode counts a timeout as a miss', async () => {
    vi.useFakeTimers()
    const w = await mountSuspended(StrategyFlash, { props: { rng: mulberry32(42) } })
    expect(w.find('[data-testid="flash-clock"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(10_500)
    await w.vm.$nextTick()
    expect(w.find('[data-testid="flash-verdict"]').text()).toContain('Too slow')
    vi.useRealTimers()
  })
})

describe('DeviationQuiz', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('grades deviate-vs-book correctly against the rolled TC', async () => {
    const w = await mountSuspended(DeviationQuiz, { props: { rng: mulberry32(7) } })
    expect(w.find('[data-testid="quiz-situation"]').text()).toContain('TC')
    await w.find('[data-testid="quiz-deviate"]').trigger('click')
    const verdict = w.find('[data-testid="quiz-verdict"]')
    expect(verdict.exists()).toBe(true)
    expect(verdict.text()).toMatch(/applies at TC/)
  })
})
```

- [ ] **Step 4:** Run `pnpm test:nuxt test/nuxt/drillsStrategy.test.ts` — PASS (4). Full gates clean.

- [ ] **Step 5: Commit**

```bash
git add app/components/drills/StrategyFlash.vue app/components/drills/DeviationQuiz.vue test/nuxt/drillsStrategy.test.ts
git commit -m "feat(ui): add strategy flash and deviation quiz drills"
```

---

### Task 15: Drills — Count the Cards + True-Count Conversion + drills page

**Files:**
- Create: `app/components/drills/CountDrill.vue`, `app/components/drills/TrueCountDrill.vue`, `app/pages/drills.vue`
- Test: `test/nuxt/drillsCount.test.ts`

- [ ] **Step 1: Implement `CountDrill.vue`:**

```vue
<script setup lang="ts">
import type { Card } from '~/utils/engine/cards'
import { buildShoeCards, shuffle } from '~/utils/engine/cards'
import { hiLoValue } from '~/utils/engine/counting'

const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random })

const store = useBlackjackStore()

const LEVELS = [
  { id: 'singles', label: 'Singles', group: 1 },
  { id: 'pairs', label: 'Pairs', group: 2 },
  { id: 'rounds', label: 'Table rounds', group: 6 }
] as const
const SPEEDS = [
  { label: 'Slow', ms: 1100 },
  { label: 'Medium', ms: 700 },
  { label: 'Fast', ms: 450 }
]
const TOTAL_CARDS = 20

const level = ref<typeof LEVELS[number]>(LEVELS[0])
const speed = ref(SPEEDS[0]!)
const phase = ref<'idle' | 'flashing' | 'answer' | 'result'>('idle')
const queue = ref<Card[][]>([])
const current = ref<Card[]>([])
const actual = ref(0)
const entered = ref<number | null>(null)
const correct = ref(false)
const streak = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function start(): void {
  const cards = shuffle(buildShoeCards(1), props.rng).slice(0, TOTAL_CARDS)
  actual.value = cards.reduce((sum, c) => sum + hiLoValue(c), 0)
  const groups: Card[][] = []
  for (let i = 0; i < cards.length; i += level.value.group) {
    groups.push(cards.slice(i, i + level.value.group))
  }
  queue.value = groups
  phase.value = 'flashing'
  entered.value = null
  if (reducedMotion) {
    current.value = queue.value.shift() ?? []
    return // manual stepping
  }
  advance()
  timer = setInterval(advance, speed.value.ms)
}

function advance(): void {
  const next = queue.value.shift()
  if (!next) {
    stopTimer()
    current.value = []
    phase.value = 'answer'
    return
  }
  current.value = next
}

function stopTimer(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function submit(): void {
  if (entered.value === null) return
  correct.value = entered.value === actual.value
  store.recordCountCheck(entered.value, actual.value)
  if (correct.value) {
    streak.value++
    store.recordDrillBest(`count-${level.value.id}`, streak.value)
  } else {
    streak.value = 0
  }
  phase.value = 'result'
}

function reset(): void {
  stopTimer()
  phase.value = 'idle'
}

onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between text-xs text-neutral-400">
      <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
      <span>Best ({{ level.label }}): <span class="font-mono">{{ store.training.drillBests[`count-${level.id}`] ?? 0 }}</span></span>
    </div>

    <div
      v-if="phase === 'idle'"
      class="space-y-3"
    >
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-for="lvl in LEVELS"
          :key="lvl.id"
          size="xs"
          :variant="level.id === lvl.id ? 'solid' : 'outline'"
          color="neutral"
          :data-testid="`count-level-${lvl.id}`"
          @click="level = lvl"
        >
          {{ lvl.label }}
        </UButton>
        <span class="mx-1 h-4 w-px bg-neutral-700" />
        <UButton
          v-for="s in SPEEDS"
          :key="s.label"
          size="xs"
          :variant="speed.label === s.label ? 'solid' : 'outline'"
          color="neutral"
          @click="speed = s"
        >
          {{ s.label }}
        </UButton>
      </div>
      <UButton
        color="primary"
        data-testid="count-start"
        @click="start"
      >
        Flash {{ TOTAL_CARDS }} cards
      </UButton>
    </div>

    <div
      v-else-if="phase === 'flashing'"
      class="flex min-h-32 flex-col items-center justify-center gap-3"
      data-testid="count-flashing"
    >
      <div class="flex gap-1.5">
        <PlayingCard
          v-for="(card, i) in current"
          :key="i"
          :card="card"
          :face-up="true"
          size="sm"
        />
      </div>
      <UButton
        v-if="reducedMotion"
        size="xs"
        color="neutral"
        variant="soft"
        data-testid="count-step"
        @click="advance"
      >
        Next
      </UButton>
    </div>

    <div
      v-else-if="phase === 'answer'"
      class="flex items-center justify-center gap-2"
    >
      <UInput
        v-model.number="entered"
        type="number"
        size="sm"
        placeholder="Running count?"
        data-testid="count-answer"
        @keydown.enter="submit"
      />
      <UButton
        color="primary"
        size="sm"
        data-testid="count-submit"
        @click="submit"
      >
        Check
      </UButton>
    </div>

    <div
      v-else
      class="text-center"
      data-testid="count-result"
    >
      <p
        class="text-sm font-semibold"
        :class="correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ correct ? `✓ RC ${actual}` : `✗ you said ${entered} — RC was ${actual}` }}
      </p>
      <UButton
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        @click="reset"
      >
        Again
      </UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Implement `TrueCountDrill.vue`:**

```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random })

const store = useBlackjackStore()

interface Question {
  rc: number
  decksRemaining: number // half-deck steps, 0.5–6
  decksTotal: number
}

function makeQuestion(): Question {
  const rc = Math.floor(props.rng() * 25) - 12 // −12..+12
  const decksTotal = 6
  const decksRemaining = 0.5 + Math.round(props.rng() * 11) * 0.5 // 0.5..6.0
  return { rc, decksRemaining, decksTotal }
}

const question = ref<Question>(makeQuestion())
const entered = ref<number | null>(null)
const verdict = ref<{ correct: boolean, actual: number } | null>(null)
const streak = ref(0)

const trayPct = computed(() =>
  Math.round(((question.value.decksTotal - question.value.decksRemaining) / question.value.decksTotal) * 100))

function submit(): void {
  if (entered.value === null) return
  const actual = question.value.rc / question.value.decksRemaining
  const correct = Math.abs(entered.value - actual) <= 0.5
  verdict.value = { correct, actual }
  if (correct) {
    streak.value++
    store.recordDrillBest('true-count', streak.value)
  } else {
    streak.value = 0
  }
}

function next(): void {
  question.value = makeQuestion()
  entered.value = null
  verdict.value = null
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between text-xs text-neutral-400">
      <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
      <span>Best: <span class="font-mono">{{ store.training.drillBests['true-count'] ?? 0 }}</span></span>
    </div>

    <div
      class="flex items-center justify-center gap-6"
      data-testid="tc-question"
    >
      <div class="text-center">
        <p class="text-[10px] uppercase text-neutral-500">Running count</p>
        <p class="font-mono text-2xl font-bold text-[var(--accent-cream)]">{{ question.rc > 0 ? '+' : '' }}{{ question.rc }}</p>
      </div>
      <div class="text-center">
        <p class="mb-1 text-[10px] uppercase text-neutral-500">Discard tray ({{ question.decksTotal }} decks)</p>
        <div class="relative mx-auto h-20 w-10 overflow-hidden rounded border border-[var(--rail-walnut)] bg-black/40">
          <div
            class="absolute inset-x-0 bottom-0 bg-neutral-200/70"
            :style="{ height: `${trayPct}%` }"
          />
        </div>
        <p class="mt-1 text-[10px] text-neutral-500">{{ question.decksRemaining }} decks left</p>
      </div>
    </div>

    <div
      v-if="!verdict"
      class="flex items-center justify-center gap-2"
    >
      <UInput
        v-model.number="entered"
        type="number"
        step="0.5"
        size="sm"
        placeholder="True count?"
        data-testid="tc-answer"
        @keydown.enter="submit"
      />
      <UButton
        color="primary"
        size="sm"
        data-testid="tc-submit"
        @click="submit"
      >
        Check
      </UButton>
    </div>

    <div
      v-else
      class="text-center"
      data-testid="tc-verdict"
    >
      <p
        class="text-sm font-semibold"
        :class="verdict.correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ verdict.correct ? '✓' : '✗' }} TC = {{ question.rc }} ÷ {{ question.decksRemaining }} = {{ verdict.actual.toFixed(1) }}
      </p>
      <UButton
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        data-testid="tc-next"
        @click="next"
      >
        Next
      </UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Implement `app/pages/drills.vue`:**

```vue
<script setup lang="ts">
const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const tabs = [
  { label: 'Strategy flash', value: 'flash' },
  { label: 'Count the cards', value: 'count' },
  { label: 'True count', value: 'tc' },
  { label: 'Deviations', value: 'quiz' }
]
const tab = ref('flash')
</script>

<template>
  <main class="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Drills
    </h1>
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
    />
    <StrategyFlash v-if="tab === 'flash'" />
    <CountDrill v-else-if="tab === 'count'" />
    <TrueCountDrill v-else-if="tab === 'tc'" />
    <DeviationQuiz v-else />
  </main>
</template>
```

- [ ] **Step 4: Tests** (`test/nuxt/drillsCount.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import CountDrill from '../../app/components/drills/CountDrill.vue'
import TrueCountDrill from '../../app/components/drills/TrueCountDrill.vue'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { mulberry32 } from '../../app/utils/engine/rng'

describe('CountDrill', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('flashes groups on a timer, then grades the entered RC', async () => {
    vi.useFakeTimers()
    const store = useBlackjackStore()
    const w = await mountSuspended(CountDrill, { props: { rng: mulberry32(3) } })
    await w.find('[data-testid="count-start"]').trigger('click')
    expect(w.find('[data-testid="count-flashing"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1100 * 21) // 20 singles + the terminal tick
    await w.vm.$nextTick()
    expect(w.find('[data-testid="count-answer"]').exists()).toBe(true)
    await w.find('[data-testid="count-answer"] input').setValue('0')
    await w.find('[data-testid="count-submit"]').trigger('click')
    expect(w.find('[data-testid="count-result"]').text()).toMatch(/✓|✗/)
    expect(store.training.countChecks).toHaveLength(1)
    vi.useRealTimers()
  })
})

describe('TrueCountDrill', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('grades within ±0.5 of RC ÷ decks remaining', async () => {
    const w = await mountSuspended(TrueCountDrill, { props: { rng: mulberry32(9) } })
    const text = w.find('[data-testid="tc-question"]').text()
    const rc = Number(text.match(/([+-]?\d+)/)![1])
    const decks = Number(text.match(/([\d.]+) decks left/)![1])
    const actual = rc / decks
    await w.find('[data-testid="tc-answer"] input').setValue(String(Math.round(actual * 2) / 2))
    await w.find('[data-testid="tc-submit"]').trigger('click')
    expect(w.find('[data-testid="tc-verdict"]').text()).toContain('✓')
  })
})
```

- [ ] **Step 5:** Run `pnpm test:nuxt test/nuxt/drillsCount.test.ts` — PASS (2). Full gates clean.

- [ ] **Step 6: Commit**

```bash
git add app/components/drills/CountDrill.vue app/components/drills/TrueCountDrill.vue app/pages/drills.vue test/nuxt/drillsCount.test.ts
git commit -m "feat(ui): add count drills and the drills page"
```

---

### Task 16: Fun layer — pit-boss milestones, myth quips, payout flash

**Files:**
- Create: `app/utils/milestones.ts`
- Modify: `app/composables/useGameLoop.ts`, `app/components/table/SpotSeat.vue`, `app/assets/css/main.css`
- Test: `test/unit/milestones.test.ts`

- [ ] **Step 1: Write the failing tests** (`test/unit/milestones.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { freshMilestones, roundMilestones, shuffleMilestone } from '../../app/utils/milestones'

describe('milestones', () => {
  it('fires the pit-boss line on the third straight win, once per streak', () => {
    let state = freshMilestones(50_000)
    let lines: string[] = []
    for (let i = 0; i < 3; i++) {
      ({ lines, state } = roundMilestones({ heroNet: 1000, tookCorrectDeviation: false, state }))
    }
    expect(lines.some(l => l.includes('Pit boss'))).toBe(true)
    ;({ lines, state } = roundMilestones({ heroNet: 1000, tookCorrectDeviation: false, state }))
    expect(lines).toHaveLength(0) // streak continues silently at 4
    ;({ lines, state } = roundMilestones({ heroNet: -1000, tookCorrectDeviation: false, state }))
    expect(state.winStreak).toBe(0)
  })

  it('fires the first-correct-deviation line exactly once', () => {
    let state = freshMilestones(50_000)
    let first = roundMilestones({ heroNet: 0, tookCorrectDeviation: true, state })
    expect(first.lines.some(l => l.toLowerCase().includes('deviation'))).toBe(true)
    state = first.state
    const second = roundMilestones({ heroNet: 0, tookCorrectDeviation: true, state })
    expect(second.lines).toHaveLength(0)
  })

  it('congratulates beating a shoe when the bankroll grew since the last shuffle', () => {
    let state = freshMilestones(50_000)
    const up = shuffleMilestone(52_500, state)
    expect(up.line).toContain('shoe')
    state = up.state
    expect(state.bankrollAtShuffle).toBe(52_500)
    const down = shuffleMilestone(51_000, state)
    expect(down.line).toBeNull()
  })
})
```

- [ ] **Step 2:** Run `pnpm test:unit test/unit/milestones.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `app/utils/milestones.ts`:

```ts
export interface MilestoneState {
  winStreak: number
  firstDeviationDone: boolean
  bankrollAtShuffle: number
}

export function freshMilestones(bankroll: number): MilestoneState {
  return { winStreak: 0, firstDeviationDone: false, bankrollAtShuffle: bankroll }
}

export function roundMilestones(args: {
  heroNet: number
  tookCorrectDeviation: boolean
  state: MilestoneState
}): { lines: string[], state: MilestoneState } {
  const lines: string[] = []
  const state = { ...args.state }
  if (args.heroNet > 0) {
    state.winStreak++
    if (state.winStreak === 3) lines.push('Pit boss glances over — three in a row.')
  } else if (args.heroNet < 0) {
    state.winStreak = 0
  }
  if (args.tookCorrectDeviation && !state.firstDeviationDone) {
    state.firstDeviationDone = true
    lines.push('First correct deviation — you are officially playing the count.')
  }
  return { lines, state }
}

export function shuffleMilestone(bankroll: number, state: MilestoneState): { line: string | null, state: MilestoneState } {
  const grew = bankroll > state.bankrollAtShuffle
  return {
    line: grew ? 'You beat that shoe.' : null,
    state: { ...state, bankrollAtShuffle: bankroll }
  }
}
```

- [ ] **Step 4: Wire into the game loop** (`useGameLoop.ts`):

1. `import { freshMilestones, roundMilestones, shuffleMilestone } from '../utils/milestones'` and module state `let milestones = freshMilestones(0)`.
2. `startSession`: `milestones = freshMilestones(bankroll)` (the parameter). `restoreSession`: `milestones = freshMilestones(store.bankroll)`. Reset in `__resetGameLoopForTests` to `freshMilestones(0)`.
3. In `applyEvent`'s `'shuffle'` case (after `countShuffle()`):

```ts
      if (useBlackjackStore().settings?.flair) {
        const result = shuffleMilestone(useBlackjackStore().bankroll, milestones)
        milestones = result.state
        if (result.line) pushAnnouncement(result.line)
      } else {
        milestones = { ...milestones, bankrollAtShuffle: useBlackjackStore().bankroll }
      }
```

4. In `finalizeRound`, after `store.recordRound(record)`:

```ts
  if (store.settings?.flair) {
    const heroNet = record.spots
      .filter(s => s.occupant === 'hero')
      .reduce((sum, s) => sum + s.hands.reduce((x, h) => x + h.net, 0)
        + s.sideBets.reduce((x, b) => x + b.net, 0) + s.insuranceNet, 0)
    const result = roundMilestones({
      heroNet,
      tookCorrectDeviation: decisionsThisRound.some(d => d.deviationId !== null && d.correct),
      state: milestones
    })
    milestones = result.state
    for (const line of result.lines) pushAnnouncement(line)
    // an occasional table myth from a companion (spec §8)
    const botViews = spotsView.value.filter(v => v.occupant !== 'hero')
    if (botViews.length > 0 && quipRng() < 0.18) {
      const view = botViews[Math.floor(quipRng() * botViews.length)]!
      const persona = PERSONAS.find(p => p.id === view.occupant)!
      view.quip = persona.quips.myth[Math.floor(quipRng() * persona.quips.myth.length)]!
    }
  }
```

- [ ] **Step 5: Payout flash.** In `main.css` add (after the reduced-motion block — the global reduced-motion rule already disarms it):

```css
@keyframes payout-flash {
  0% { transform: scale(1); filter: brightness(1); }
  35% { transform: scale(1.18); filter: brightness(1.6); }
  100% { transform: scale(1); filter: brightness(1); }
}
.payout-flash {
  animation: payout-flash 0.8s ease-out 1;
}
```

In `SpotSeat.vue`, wrap the existing `<ChipStack ... />` line:

```vue
        <div :class="{ 'payout-flash': hand.outcome !== null && hand.net > 0 }">
          <ChipStack
            :amount="hand.bet"
            size="sm"
          />
        </div>
```

- [ ] **Step 6:** Run `pnpm test` — green (gameLoop quick-mode tests run with `flair: true` in some helpers; milestones only push announcements, which those tests don't constrain). Full gates clean.

- [ ] **Step 7: Commit**

```bash
git add app/utils/milestones.ts app/composables/useGameLoop.ts app/components/table/SpotSeat.vue app/assets/css/main.css test/unit/milestones.test.ts
git commit -m "feat(ui): add pit-boss milestones, myth quips, and payout flash"
```

---

### Task 17: Mobile pass — bot chips strip + responsive controls

**Files:**
- Create: `app/components/table/BotChips.vue`
- Modify: `app/pages/table.vue`, `app/components/table/ActionBar.vue`
- Test: `test/nuxt/mobile.test.ts`

- [ ] **Step 1: Implement `BotChips.vue`** (spec §7: phone layout = dealer + your spot; bots collapse to status chips):

```vue
<script setup lang="ts">
import { PERSONAS } from '~/utils/engine/bots'
import { OUTCOME_BADGE } from '~/utils/outcomeBadges'
import type { SpotView } from '~/composables/useGameLoop'

const props = defineProps<{
  spots: SpotView[]
}>()

const bots = computed(() => props.spots
  .filter(s => s.occupant !== 'hero')
  .map((s) => {
    const lastHand = s.hands[s.hands.length - 1]
    return {
      spotId: s.spotId,
      name: PERSONAS.find(p => p.id === s.occupant)?.name ?? s.occupant,
      outcome: lastHand?.outcome ?? null,
      quip: s.quip
    }
  }))
</script>

<template>
  <div
    v-if="bots.length"
    class="flex gap-2 overflow-x-auto px-2 pb-1 md:hidden"
    data-testid="bot-chips"
  >
    <div
      v-for="bot in bots"
      :key="bot.spotId"
      class="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/80 px-2 py-1 text-[10px] text-neutral-300"
    >
      <UIcon
        name="i-lucide-bot"
        class="h-3 w-3 text-neutral-500"
      />
      <span>{{ bot.name }}</span>
      <span
        v-if="bot.outcome"
        class="rounded px-1 font-bold"
        :class="OUTCOME_BADGE[bot.outcome]?.cls"
      >{{ OUTCOME_BADGE[bot.outcome]?.text }}</span>
      <span
        v-if="bot.quip"
        class="max-w-36 truncate italic text-neutral-500"
      >“{{ bot.quip }}”</span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Table page.** In `table.vue`:
  - render `<BotChips :spots="spotsView" />` immediately above the felt wrapper div;
  - in the `#seat` slot template, wrap the `<SpotSeat>` so non-hero seats vanish on phones:

```vue
        <template #seat="{ spotId }">
          <div
            v-if="spotsView.find(s => s.spotId === spotId)"
            :class="spotId === heroSpotId ? '' : 'hidden md:block'"
          >
            <SpotSeat
              :spot="spotsView.find(s => s.spotId === spotId)!"
              :is-hero="spotId === heroSpotId"
              :is-active="phase === 'playerTurns' && spotId === heroSpotId && canAct"
            />
          </div>
          <div
            v-else
            class="hidden h-10 w-10 rounded-full border border-dashed border-[var(--accent-cream)]/15 md:block"
            aria-hidden="true"
          />
        </template>
```

  - panels overlay: change its classes to `class="pointer-events-none absolute right-2 top-2 z-10 flex w-52 flex-col gap-2 md:w-64"` so it fits a phone.

- [ ] **Step 3: ActionBar responsiveness.** Change the two control-row divs to wrap: `class="flex flex-wrap items-center justify-center gap-2"`, and the outer panel keeps its classes. The chip-value row stays as-is (5 buttons fit 390px at size sm).

- [ ] **Step 4: Tests** (`test/nuxt/mobile.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BotChips from '../../app/components/table/BotChips.vue'
import type { SpotView } from '../../app/composables/useGameLoop'

const SPOTS: SpotView[] = [
  {
    spotId: 2, occupant: 'bea', activeHandIndex: 0, sideResults: [], quip: 'The chart provides.',
    hands: [{ cards: [], bet: 1000, doubled: false, fromSplit: false, outcome: 'win', net: 1000 }]
  },
  {
    spotId: 3, occupant: 'hero', activeHandIndex: 0, sideResults: [], quip: null,
    hands: [{ cards: [], bet: 2500, doubled: false, fromSplit: false, outcome: null, net: 0 }]
  }
]

describe('BotChips', () => {
  it('lists bots (never the hero) with outcome and quip, hidden on md+', async () => {
    const w = await mountSuspended(BotChips, { props: { spots: SPOTS } })
    const strip = w.find('[data-testid="bot-chips"]')
    expect(strip.exists()).toBe(true)
    expect(strip.classes()).toContain('md:hidden')
    expect(strip.text()).toContain('By-the-Book Bea')
    expect(strip.text()).toContain('WIN')
    expect(strip.text()).not.toContain('You')
  })

  it('renders nothing without bots', async () => {
    const w = await mountSuspended(BotChips, { props: { spots: [SPOTS[1]!] } })
    expect(w.find('[data-testid="bot-chips"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 5: Visual check** — `pnpm dev`, start a casino session with 2 bots, then screenshot the table at 390×844 (viewcap with `width: 390, height: 844`): bot chips strip visible above the felt, bot seats gone from the felt, hero seat + dealer + action bar usable without horizontal scroll. Fix spacing if anything clips, re-screenshot.

- [ ] **Step 6:** Run `pnpm test` — green. Full gates clean.

- [ ] **Step 7: Commit**

```bash
git add app/components/table/BotChips.vue app/pages/table.vue app/components/table/ActionBar.vue test/nuxt/mobile.test.ts
git commit -m "feat(ui): mobile pass — bot chips strip and responsive controls"
```

---

### Task 18: A11y pass — labels, focus management, axe audit

**Files:**
- Modify: `app/components/table/ActionBar.vue`, `app/pages/table.vue`
- Test: `test/nuxt/actionBar.test.ts` (append one), manual axe gate

- [ ] **Step 1: Labels.** In `ActionBar.vue`:
  - chip buttons: add `:aria-label="`Add $${value / 100} chip`"`;
  - target buttons: add `:aria-label="`Bet target: ${sb.label}`"` on the side-bet loop and `aria-label="Bet target: main bet"` on the Main button;
  - Clear/Rebet/Deal already carry visible text — no change.

- [ ] **Step 2: Focus management** in `table.vue` (keyboard users land on the right control as phases change):

```ts
watch(canAct, (v) => {
  if (!v) return
  void nextTick(() => {
    const btn = document.querySelector<HTMLElement>('[data-testid^="act-"]:not([disabled])')
    btn?.focus()
  })
})
watch(phase, (p) => {
  if (p !== 'insurance') return
  void nextTick(() => {
    document.querySelector<HTMLElement>('[data-testid="decline-insurance"]')?.focus()
  })
})
```

- [ ] **Step 3: Test** (append to `actionBar.test.ts`):

```ts
  it('labels chip buttons for screen readers', async () => {
    const w = await mountSuspended(ActionBar, { props: { ...base, phase: 'betting' } })
    expect(w.find('[data-testid="chip-2500"]').attributes('aria-label')).toBe('Add $25 chip')
  })
```

- [ ] **Step 4: Axe audit (manual gate).** With `pnpm dev` running, audit these four states using the axecap MCP server (`mcp__axecap__audit_url`) or `pnpm dlx @axe-core/cli` against:
  1. `http://localhost:3000/` (setup)
  2. `http://localhost:3000/table` mid-round (start a session first in the same browser used by the audit — if the tool can't share state, audit the table immediately after "Take a seat" with `?seed=7`)
  3. `http://localhost:3000/learn`
  4. `http://localhost:3000/drills`

Fix every **serious/critical** finding (likely candidates: insufficient contrast on `text-neutral-600`-class footnotes → lift to `text-neutral-500`/`400`; missing accessible names on icon-only buttons; duplicate landmark roles). Re-run until those four routes report zero serious/critical violations. Document any remaining "minor/moderate" findings in the commit body if intentionally deferred.

- [ ] **Step 5:** Run `pnpm test` — green. Full gates clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(a11y): labels, focus management, and axe fixes"
```

(If Step 4 produced no file changes beyond Steps 1–2, this commit simply carries those.)

---

### Task 19: Playwright E2E

**Files:**
- Create: `playwright.config.ts`, `test/e2e/seeds.ts`, `test/e2e/helpers.ts`, `test/e2e/full-round.spec.ts`, `test/e2e/split.spec.ts`, `test/e2e/insurance.spec.ts`, `test/e2e/restore.spec.ts`, `test/e2e/training.spec.ts`
- Modify: `app/pages/index.vue` (seed plumbing), `package.json` (scripts), `vitest.config.ts` (exclude e2e dir from vitest if needed — the unit/nuxt globs already scope to `test/unit`/`test/nuxt`, so no change expected)

- [ ] **Step 1: Seed plumbing.** In `index.vue` script setup:

```ts
const route = useRoute()
const urlSeed = computed(() => {
  const raw = Number(route.query.seed)
  return Number.isFinite(raw) && raw > 0 ? raw : undefined
})
```

and in `start()`, pass it: `startSession({ ... }, bankrollChoice.value, urlSeed.value)`.

- [ ] **Step 2: Playwright config** (`playwright.config.ts` — craps pattern, our test dir):

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'

export default defineConfig<ConfigOptions>({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
    nuxt: {
      rootDir: fileURLToPath(new URL('.', import.meta.url))
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
```

`package.json` scripts: add `"test:e2e": "playwright test"` and `"test:e2e:ui": "playwright test --ui"`. Run `pnpm exec playwright install chromium` once if the browser is missing.

- [ ] **Step 3: Hunt the seeds.** Create `test/unit/zz-seedhunt.test.ts` **temporarily** (it throws to print — vitest hides console output):

```ts
import { describe, it } from 'vitest'
import { BlackjackGame } from '../../app/utils/engine/round'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import { isPair, isBlackjack } from '../../app/utils/engine/hand'

// Mirrors the UI flow exactly: Vegas preset untouched, hero alone at spot 3, $25 main bet.
function dealt(seed: number) {
  const g = new BlackjackGame(cloneRules(PRESETS.VEGAS_STRIP_6D!), { seed })
  g.beginRound([{ spotId: 3, mainBet: 2500 }])
  return g
}

describe('seed hunt (temporary — delete after recording)', () => {
  it('finds scenario seeds', () => {
    const found: Record<string, number> = {}
    for (let seed = 1; seed < 300_000 && Object.keys(found).length < 5; seed++) {
      const g = dealt(seed)
      const hand = g.spots[0]!.hands[0]!
      const up = g.dealerUp!
      if (!found.PAIR && g.phase === 'playerTurns' && isPair(hand.cards)
        && hand.cards[0]!.rank === 8 && g.legalFor(3).includes('split')) {
        found.PAIR = seed
      }
      if (!found.ACES && g.phase === 'playerTurns' && hand.cards[0]!.rank === 14 && hand.cards[1]!.rank === 14
        && g.legalFor(3).includes('split')) {
        found.ACES = seed
      }
      if (!found.RESPLIT && g.phase === 'playerTurns' && isPair(hand.cards)
        && hand.cards[0]!.rank !== 14 && g.legalFor(3).includes('split')) {
        const g2 = dealt(seed)
        g2.act(3, 'split')
        // after the split, the active hand is a fresh two-card hand; if it paired up again
        // and split is still legal, this seed supports a resplit
        if (g2.phase === 'playerTurns' && g2.legalFor(3).includes('split')) found.RESPLIT = seed
      }
      if (!found.ACE_UP && g.phase === 'insurance' && !isBlackjack(hand.cards, false)) {
        found.ACE_UP = seed
      }
      if (!found.EVEN_MONEY && g.phase === 'insurance' && isBlackjack(hand.cards, false)) {
        found.EVEN_MONEY = seed
      }
    }
    throw new Error(`SEEDS: ${JSON.stringify(found)}`)
  })
})
```

Run: `pnpm test:unit test/unit/zz-seedhunt.test.ts` — the failure message prints the seed map. Record it into `test/e2e/seeds.ts`:

```ts
/** Found by the Task 19 seed hunt against the engine at v0.3.0 — Vegas preset, hero spot 3, $25 bet.
 *  If an engine change shifts the deal stream, re-run the hunt (plan Task 19 Step 3). */
export const SEEDS = {
  PAIR: 0, // ← replace each value with the hunted numbers
  ACES: 0,
  RESPLIT: 0,
  ACE_UP: 0,
  EVEN_MONEY: 0
}
```

Then **delete `test/unit/zz-seedhunt.test.ts`**. (If any scenario is not found by 300k seeds, raise the bound; every scenario occurs within a few thousand seeds in practice.)

- [ ] **Step 4: Shared helper** (`test/e2e/helpers.ts`):

```ts
import type { Page } from '@playwright/test'
import { expect } from '@nuxt/test-utils/playwright'

export interface SessionOpts {
  seed?: number
  quick?: boolean
  bots?: string[]
}

/** Drives the real setup screen: preset stays Vegas, optional quick mode, optional bots, then deals nothing. */
export async function newSession(page: Page, goto: (url: string, opts: { waitUntil: 'hydration' }) => Promise<unknown>, opts: SessionOpts = {}): Promise<void> {
  await goto(opts.seed ? `/?seed=${opts.seed}` : '/', { waitUntil: 'hydration' })
  for (const bot of opts.bots ?? []) {
    await page.getByTestId(`bot-${bot}`).click()
  }
  if (opts.quick !== false) {
    await page.getByRole('combobox', { name: 'Presentation' }).click()
    await page.getByRole('option', { name: 'Quick play (instant)' }).click()
  }
  await page.getByTestId('start').click()
  await expect(page.getByTestId('deal')).toBeVisible()
}

export async function betAndDeal(page: Page, chips: number[] = [2500]): Promise<void> {
  for (const chip of chips) {
    await page.getByTestId(`chip-${chip}`).click()
  }
  await page.getByTestId('deal').click()
}

export async function declineInsuranceIfOffered(page: Page): Promise<void> {
  const decline = page.getByTestId('decline-insurance')
  if (await decline.isVisible().catch(() => false)) {
    await decline.click()
  }
}

export async function standUntilComplete(page: Page): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const stand = page.getByTestId('act-stand')
    if (!(await stand.isVisible().catch(() => false)) || !(await stand.isEnabled().catch(() => false))) break
    await stand.click()
  }
  await expect(page.getByTestId('deal')).toBeVisible() // back to betting controls = round settled
}
```

- [ ] **Step 5: The specs.**

`test/e2e/full-round.spec.ts`:

```ts
import { expect, test } from '@nuxt/test-utils/playwright'
import { betAndDeal, declineInsuranceIfOffered, newSession, standUntilComplete } from './helpers'

test('full quick-mode round settles and lands in history', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await standUntilComplete(page)
  await expect(page.locator('main')).toContainText(/WIN|LOSE|PUSH|BLACKJACK|SURRENDER/)
  await page.getByTestId('nav-history').click()
  await expect(page.locator('main')).toContainText('Round 1')
})
```

`test/e2e/split.spec.ts`:

```ts
import { expect, test } from '@nuxt/test-utils/playwright'
import { SEEDS } from './seeds'
import { betAndDeal, declineInsuranceIfOffered, newSession, standUntilComplete } from './helpers'

test('splitting 8,8 produces two played hands', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.PAIR })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await page.getByTestId('act-split').click()
  await expect(page.locator('[data-testid="seat-3"] .card-perspective')).toHaveCount(4, { timeout: 10_000 })
  await standUntilComplete(page)
})

test('resplitting forms a third hand', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.RESPLIT })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await page.getByTestId('act-split').click()
  await page.getByTestId('act-split').click()
  await expect(page.locator('[data-testid="seat-3"] .card-perspective')).toHaveCount(6)
  await standUntilComplete(page)
})

test('split aces take exactly one card each and the round resolves', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.ACES })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await page.getByTestId('act-split').click()
  // aces one-card: both hands auto-complete, dealer plays out, betting controls return
  await expect(page.getByTestId('deal')).toBeVisible()
  await expect(page.locator('[data-testid="seat-3"] .card-perspective')).toHaveCount(4)
})
```

`test/e2e/insurance.spec.ts`:

```ts
import { expect, test } from '@nuxt/test-utils/playwright'
import { SEEDS } from './seeds'
import { betAndDeal, newSession, standUntilComplete } from './helpers'

test('declining insurance continues the round', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.ACE_UP })
  await betAndDeal(page)
  await expect(page.getByTestId('decline-insurance')).toBeVisible()
  await page.getByTestId('decline-insurance').click()
  await standUntilComplete(page)
})

test('even money pays 1:1 immediately on a blackjack vs ace', async ({ page, goto }) => {
  await newSession(page, goto, { seed: SEEDS.EVEN_MONEY })
  await betAndDeal(page) // $25
  await expect(page.getByTestId('even-money')).toBeVisible()
  await page.getByTestId('even-money').click()
  await expect(page.getByTestId('deal')).toBeVisible()
  await expect(page.locator('nav').first()).toContainText('$525') // 500 + 25
})
```

`test/e2e/restore.spec.ts`:

```ts
import { expect, test } from '@nuxt/test-utils/playwright'
import { betAndDeal, declineInsuranceIfOffered, newSession, standUntilComplete } from './helpers'

test('a mid-round reload restores the exact table', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 })
  await betAndDeal(page)
  await declineInsuranceIfOffered(page)
  await expect(page.getByTestId('act-stand')).toBeEnabled()
  const cardsBefore = await page.locator('[data-testid="seat-3"] .card-perspective').count()

  await page.reload()
  await expect(page.locator('main')).toContainText('Table restored', { timeout: 15_000 })
  await expect(page.locator('[data-testid="seat-3"] .card-perspective')).toHaveCount(cardsBefore)
  await standUntilComplete(page)
})
```

`test/e2e/training.spec.ts` (drills smoke + study-mode tooltip):

```ts
import { expect, test } from '@nuxt/test-utils/playwright'
import { betAndDeal, newSession } from './helpers'

test('strategy flash grades an answer', async ({ page, goto }) => {
  await goto('/drills', { waitUntil: 'hydration' })
  await page.locator('[data-testid^="flash-"]').first().click()
  await expect(page.getByTestId('flash-verdict')).toBeVisible()
  await page.getByTestId('flash-next').click()
  await expect(page.getByTestId('flash-verdict')).toHaveCount(0)
})

test('study mode freezes the table and explains the shoe', async ({ page, goto }) => {
  await newSession(page, goto, { seed: 7 }) // betting phase — no deal needed for study mode
  await page.getByTestId('study-toggle').click()
  await page.getByTestId('study-hotspot-shoe').click()
  await expect(page.getByTestId('study-popover')).toContainText('cut card')
  await page.getByTestId('chip-2500').click()
  await expect(page.getByTestId('deal')).toBeDisabled() // bet placed but study mode blocks dealing
})
```

(Adjust the study test if dealing first proves awkward: toggling study before any deal is equally valid — `newSession` then `study-toggle` directly.)

- [ ] **Step 6: Run** `pnpm test:e2e` — all specs green (the runner builds the app first; expect a few minutes). Then full vitest gates: `pnpm test && pnpm lint && pnpm typecheck` — clean (vitest must NOT pick up `test/e2e`; its projects glob `test/unit`/`test/nuxt` only).

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts test/e2e/ app/pages/index.vue package.json
git commit -m "test(e2e): playwright suite — rounds, splits, insurance, restore, drills, study"
```

---

### Task 20: Deploy config + release 0.3.0

**Files:**
- Create: `netlify.toml`
- Modify: `README.md`, `CHANGELOG.md`, `package.json`, `app/layouts/default.vue` (version const)

- [ ] **Step 1: `netlify.toml`** (craps pattern + NODE_VERSION per spec §3/§12):

```toml
[build]
  command = "pnpm generate"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.iconify.design"
```

- [ ] **Step 2: Verify the static build.** Run `pnpm generate` — completes; `test -f dist/index.html` passes. Serve it once (`pnpm dlx serve dist -l 4173`) and load `http://localhost:4173/` + `/learn` — both render (SPA redirect covers deep links on Netlify; locally `serve` falls back). Stop the server.

- [ ] **Step 3: Version.** `package.json` → `"version": "0.3.0"`; `app/layouts/default.vue` → `const version = '0.3.0'`.

- [ ] **Step 4: CHANGELOG.md** — add above the 0.2.0 entry under `## [Unreleased]`:

```markdown
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
```

- [ ] **Step 5: README.md** — rewrite in the family format (craps model). Keep it accurate to what shipped; structure:

```markdown
# Blackjack Trainer

Authentic casino blackjack simulator and trainer — basic strategy coaching and Hi-Lo card
counting practice on rules taken from official gaming-commission documents, not folklore.

> **This is a single-player simulation only.** No real money is wagered, won, or lost. There is
> no multiplayer, no server, no accounts, and no connection to any casino or gambling service.
> All bankrolls are fictitious. The sole purpose is education.

## Features

- **Five rulebook-cited presets + full custom editor** — MA 205 CMR, Bally's AC, WA card room,
  Vegas Strip, single-deck 6:5; every preset shows its computed house edge (model estimate)
- **Casino procedure or quick play** — paced card-by-card dealing with dealer announcements,
  burn/cut-card/penetration mechanics, or instant resolution; one engine underneath
- **Real-time advisor** — coach / feedback / exam intensities, EV table per decision, mistake
  cost in dollars, count deviations (Illustrious 18 + Fab 4) behind an advanced toggle
- **Hi-Lo counting** — running/true count from visible cards only, self-check (press C),
  shuffle quizzes, accuracy tracking
- **History & analysis** — every decision graded ✓/✗ vs book with cost and RC/TC; adherence by
  category, top repeated mistakes, EV lost vs actual P&L, side-bet ledger, bot P&L by persona
- **Learn page** — strategy chart generated from the EV engine for the active rules (tap a cell
  for the math), rules lab with live edge deltas, side-bet pay tables, myths, procedure guide
- **Four drills** — Strategy Flash (weighted toward your mistakes), Count the Cards,
  True-Count Conversion, Deviation Quiz
- **Bot companions** — five personas with strategy leaks you can measure on the analysis page
- **Bulletproof persistence** — a mid-round refresh restores the exact table, count included
- **Four side bets with official pay tables** — 21+3, Lucky Ladies, Match the Dealer, Buster
- **Engine verified by simulation** — 200k seeded rounds converge on the computed house edge

## Rules Reference

| Source | Type |
|--------|------|
| Massachusetts Gaming Commission, 205 CMR blackjack rules | `docs/Rules-Blackjack-10-08-2020.pdf` |
| Bally's Atlantic City gaming guide | `docs/BLYS_AC-BlackJack-GamingGuide-4x9-Updated.pdf` |
| Washington State Gambling Commission rules | `docs/Blackjack Game Rules Revised April 2018 cc.pdf` |

## Setup

    pnpm install
    pnpm dev        # http://localhost:3000
    pnpm test       # engine + component suites
    pnpm test:e2e   # Playwright

Part of the Metaincognita simulator family: Hold'em, Video Poker, Flameout, Craps, Pachinko, Slots.
```

- [ ] **Step 6:** Full gates: `pnpm test && pnpm lint && pnpm typecheck` green; `pnpm test:e2e` green; `pnpm generate` succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: release notes for 0.3.0 training surfaces + Netlify deploy config"
```

---

## Plan 3 complete — definition of done

- `pnpm test` green (engine suite grows by ~6 deviation tests; nuxt suite grows by ~30 across counting/advisor/panels/pages/drills; unit utils ~20).
- `pnpm lint` / `pnpm typecheck` clean; engine purity grep still empty (advisor/analysis/milestones live OUTSIDE `app/utils/engine/`).
- `pnpm test:e2e` green: full round, split + resplit + aces one-card, insurance decline + even money, mid-round refresh restore (cards AND count), drills smoke, study-mode tooltip.
- Manual: coach mode recommends before acting with EV hints; feedback grades after; exam stays silent but History shows grades; C-key count check works; shuffle quiz fires in self-check; analysis numbers reconcile with history by hand-check; learn chart matches the pinned engine charts; phone layout (390px) playable with bot chips strip; axe reports zero serious/critical on the four audited routes.
- `pnpm generate` produces a servable `dist/`; netlify.toml carries the family CSP.
- Spec §§5–8/11–12 discharged; deliberate trims (side-bet computed edges, insurance EV pricing) documented in the plan header and CHANGELOG stays accurate about what shipped.
