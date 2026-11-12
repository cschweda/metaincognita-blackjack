import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBlackjackStore, STORAGE_KEY, TRAINING_KEY } from '../../app/stores/useBlackjackStore'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { __resetCountingForTests } from '../../app/composables/useCounting'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import { BlackjackGame } from '../../app/utils/engine/round'
import { DEFAULT_RAMP } from '../../app/utils/betRamp'

/**
 * localStorage is the only persistence this app has, and nothing on screen can reset it. A blob
 * that parses but has the wrong SHAPE used to be accepted, and the failure then surfaced far from
 * the load — a 500 on every visit to a route, or a table where no action could ever be played.
 */

function freshStore() {
  setActivePinia(createPinia())
  return useBlackjackStore()
}

const SETTINGS = {
  rules: cloneRules(PRESETS.VEGAS_STRIP_6D!),
  mode: 'quick', speed: 'normal', flair: false, botIds: [],
  advisor: 'feedback', count: 'off', advancedDeviations: false
}

function session(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1, settings: SETTINGS, bankroll: 100_000, session: {}, history: [],
    botStates: {}, roundSnapshot: null, roundTrail: null, sessionActive: true, countState: null,
    ...overrides
  })
}

describe('training data with the wrong shape', () => {
  beforeEach(() => localStorage.clear())

  it('repairs a broken adherence bucket instead of throwing on the next decision', () => {
    localStorage.setItem(TRAINING_KEY, JSON.stringify({
      version: 1, adherence: { hard: null, soft: { decisions: 'x', correct: 2 }, pair: { decisions: 4, correct: 3 } }
    }))
    const store = freshStore()
    expect(store.training.adherence.hard).toEqual({ decisions: 0, correct: 0 })
    expect(store.training.adherence.soft).toEqual({ decisions: 0, correct: 0 })
    expect(store.training.adherence.pair).toEqual({ decisions: 4, correct: 3 }) // good data survives
    expect(store.training.adherence.insurance).toEqual({ decisions: 0, correct: 0 })
  })

  it('drops a bet ramp that is not a ramp, and keeps one that is', () => {
    for (const bad of [{ steps: 5 }, { unitCents: 'x', steps: null }, { ...DEFAULT_RAMP, steps: [1, 2] }, { ...DEFAULT_RAMP, unitCents: 0 }]) {
      localStorage.setItem(TRAINING_KEY, JSON.stringify({ version: 1, betRamp: bad, betHintsEnabled: true }))
      expect(freshStore().training.betRamp, JSON.stringify(bad)).toBeNull()
    }
    localStorage.setItem(TRAINING_KEY, JSON.stringify({ version: 1, betRamp: DEFAULT_RAMP }))
    expect(freshStore().training.betRamp).toEqual(DEFAULT_RAMP)
  })

  it('filters malformed count checks, mistake-bag entries and drill records', () => {
    localStorage.setItem(TRAINING_KEY, JSON.stringify({
      version: 1,
      countChecks: [null, { at: 1, entered: 2, actual: 2 }, { at: 1, entered: 'x', actual: 2 }],
      mistakeBag: { 'hard|16|10': 3, 'soft|18|9': 'many', 'pair|8|10': -1 },
      drillBests: { a: 4, b: null },
      drillTimes: { c: 3000, d: 'fast' }
    }))
    const t = freshStore().training
    expect(t.countChecks).toEqual([{ at: 1, entered: 2, actual: 2 }])
    expect(t.mistakeBag).toEqual({ 'hard|16|10': 3 })
    expect(t.drillBests).toEqual({ a: 4 })
    expect(t.drillTimes).toEqual({ c: 3000 })
  })
})

describe('a saved session with the wrong shape', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetGameLoopForTests()
    __resetCountingForTests()
  })

  it('refuses settings without a valid rule set — and backs the payload up', () => {
    for (const bad of [{}, { ...SETTINGS, rules: { ...SETTINGS.rules, decks: 0 } }, { ...SETTINGS, botIds: ['nobody'] }, { ...SETTINGS, mode: 'warp' }]) {
      localStorage.clear()
      localStorage.setItem(STORAGE_KEY, session({ settings: bad }))
      const store = freshStore()
      expect(store.restore(), JSON.stringify(bad).slice(0, 60)).toBe(false)
      expect(store.sessionActive).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(`${STORAGE_KEY}.bak`)).not.toBeNull()
    }
  })

  it('refuses a bankroll that is not a whole, sane number of cents', () => {
    for (const bad of [1e300, -5, 10.5]) {
      localStorage.clear()
      localStorage.setItem(STORAGE_KEY, session({ bankroll: bad }))
      expect(freshStore().restore(), String(bad)).toBe(false)
    }
  })

  it('drops history rows that are not round records, keeping the session', () => {
    localStorage.setItem(STORAGE_KEY, session({ history: [null, 7, { round: 1 }] }))
    const store = freshStore()
    expect(store.restore()).toBe(true)
    expect(store.history).toEqual([])
  })

  it('a malformed round snapshot is rejected at restore, cleared, and the table still opens', () => {
    const snap = new BlackjackGame(cloneRules(PRESETS.VEGAS_STRIP_6D!), { seed: 5 }).snapshot() as unknown as Record<string, unknown>
    const broken = { ...snap, dealerCards: [null], shoe: { ...(snap.shoe as object), cards: [null, { rank: 99, suit: 'cups' }] } }
    expect(() => BlackjackGame.restore(broken as never)).toThrow()

    localStorage.setItem(STORAGE_KEY, session({ roundSnapshot: broken }))
    freshStore()
    const loop = useGameLoop()
    expect(loop.restoreSession()).toBe(true) // falls back to a fresh shoe
    expect(useBlackjackStore().roundSnapshot).toBeNull()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).roundSnapshot).toBeNull()
  })
})

describe('a saved session that is well-formed survives, field by field', () => {
  beforeEach(() => localStorage.clear())

  const ROUND = {
    round: 3, at: 1, visibleCards: ['K♠'],
    dealer: { cards: ['K♠', '7♦'], total: 17, blackjack: false, busted: false },
    spots: [{
      occupant: 'hero', insuranceNet: 0,
      hands: [{ cards: ['10♠', '8♣'], bet: 1000, outcome: 'win', net: 1000, doubled: false, fromSplit: false }],
      sideBets: [{ name: '21+3', stake: 100, net: -100, label: 'none' }]
    }],
    heroDecisions: []
  }

  it('keeps good history, stats, trail and count; repairs bot states to the table limits', () => {
    const settings = { ...SETTINGS, botIds: ['bea', 'lou', 'mike'] }
    localStorage.setItem(STORAGE_KEY, session({
      settings,
      history: [ROUND, { ...ROUND, spots: [{ occupant: 'hero' }] }, { ...ROUND, heroDecisions: 'none' }],
      session: { roundsPlayed: 3, handsWon: 'lots', totalWagered: 3000 },
      botStates: {
        bea: { bet: 2500, last: 'win' }, // fine
        lou: { bet: 99_999_999, last: 'sideways' }, // over the table max, unknown result
        nobody: { bet: 1000, last: null } // not seated
      },
      roundTrail: { visible: ['K♠'], decisions: [], insurance: null },
      countState: { running: -2, cardsSeen: 14 }
    }))
    const store = freshStore()
    expect(store.restore()).toBe(true)
    expect(store.history).toHaveLength(1)
    expect(store.session.roundsPlayed).toBe(3)
    expect(store.session.handsWon).toBe(0) // not a number → the fresh default
    expect(store.session.totalWagered).toBe(3000)
    const min = SETTINGS.rules.minBet
    expect(store.botStates).toEqual({
      bea: { bet: 2500, last: 'win' },
      lou: { bet: min, last: null },
      mike: { bet: min, last: null }
    })
    expect(store.roundTrail).toEqual({ visible: ['K♠'], decisions: [], insurance: null })
    expect(store.countState).toEqual({ running: -2, cardsSeen: 14 })
  })

  it('drops a trail or count that is not one, and tolerates missing optional blocks', () => {
    localStorage.setItem(STORAGE_KEY, session({
      roundTrail: { visible: 'K♠' }, countState: { running: 'two' }, session: null, botStates: null, roundSnapshot: 7
    }))
    const store = freshStore()
    expect(store.restore()).toBe(true)
    expect(store.roundTrail).toBeNull()
    expect(store.countState).toBeNull()
    expect(store.roundSnapshot).toBeNull()
    expect(store.botStates).toEqual({})
  })

  it('a payload with no settings restores as "no active session" rather than throwing', () => {
    localStorage.setItem(STORAGE_KEY, session({ settings: null }))
    const store = freshStore()
    expect(store.restore()).toBe(false)
    expect(store.settings).toBeNull()
  })

  it('training: non-object maps and a non-array check list fall back to empty', () => {
    localStorage.setItem(TRAINING_KEY, JSON.stringify({
      version: 1, adherence: 'high', mistakeBag: [1, 2], countChecks: 'none', drillBests: null, drillTimes: 4
    }))
    const t = freshStore().training
    expect(t.adherence.hard).toEqual({ decisions: 0, correct: 0 })
    expect(t.mistakeBag).toEqual({})
    expect(t.countChecks).toEqual([])
    expect(t.drillBests).toEqual({})
    expect(t.drillTimes).toEqual({})
  })

  it('an adherence bucket claiming more correct than decided is not believed', () => {
    localStorage.setItem(TRAINING_KEY, JSON.stringify({ version: 1, adherence: { hard: { decisions: 2, correct: 9 } } }))
    expect(freshStore().training.adherence.hard).toEqual({ decisions: 0, correct: 0 })
  })
})
