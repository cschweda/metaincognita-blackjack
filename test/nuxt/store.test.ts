import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBlackjackStore, STORAGE_KEY, TRAINING_KEY } from '../../app/stores/useBlackjackStore'
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
      botIds: ['bea'],
      advisor: 'coach',
      count: 'shown',
      advancedDeviations: false
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
    expect(localStorage.getItem(TRAINING_KEY)).not.toBeNull()

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
    store.persist()
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
})

describe('useBlackjackStore — drill times and bet ramp', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('recordDrillTime keeps the minimum (best time)', () => {
    const store = useBlackjackStore()
    store.recordDrillTime('deck-countdown', 45_000)
    store.recordDrillTime('deck-countdown', 60_000) // slower — ignored
    store.recordDrillTime('deck-countdown', 29_500) // faster — kept
    expect(store.training.drillTimes['deck-countdown']).toBe(29_500)
  })

  it('persists betRamp + hints toggle lifetime and backfills old payloads', () => {
    const store = useBlackjackStore()
    store.setBetRamp({ ...DEFAULT_RAMP, unitCents: 5000 }, true)
    expect(store.training.betHintsEnabled).toBe(true)

    setActivePinia(createPinia())
    const fresh = useBlackjackStore()
    expect(fresh.training.betRamp?.unitCents).toBe(5000)
    expect(fresh.training.betHintsEnabled).toBe(true)

    // an old payload without the new fields backfills safely
    const raw = JSON.parse(localStorage.getItem(TRAINING_KEY)!)
    delete raw.betRamp
    delete raw.betHintsEnabled
    delete raw.drillTimes
    localStorage.setItem(TRAINING_KEY, JSON.stringify(raw))
    setActivePinia(createPinia())
    const old = useBlackjackStore()
    expect(old.training.betRamp).toBeNull()
    expect(old.training.betHintsEnabled).toBe(false)
    expect(old.training.drillTimes).toEqual({})
  })
})
