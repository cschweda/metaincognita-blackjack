import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { useBlackjackStore } from '../../app/stores/useBlackjackStore'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import type { SessionSettings } from '../../app/stores/useBlackjackStore'
import { __resetCountingForTests } from '../../app/composables/useCounting'

function settings(overrides: Partial<SessionSettings> = {}): SessionSettings {
  const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return { rules, mode: 'quick', speed: 'normal', flair: true, botIds: [], advisor: 'feedback' as const, count: 'off' as const, advancedDeviations: false, ...overrides }
}

describe('useGameLoop (quick mode)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    __resetGameLoopForTests()
    __resetCountingForTests()
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

  it('exposes hasGame and a moving trayFill', () => {
    const loop = useGameLoop()
    expect(loop.hasGame.value).toBe(false)
    loop.startSession(settings(), 100_000, 7)
    expect(loop.hasGame.value).toBe(true)
    loop.beginRound(1000, {})
    expect(loop.trayFill.value).toBeGreaterThan(0) // burn card at minimum
  })

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

  it('grades decisions and exposes the last one reactively', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    while (loop.phase.value === 'playerTurns') {
      const before = loop.lastDecision.value
      loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
      expect(loop.lastDecision.value).not.toBe(before)
      expect(loop.lastDecision.value!.costCents).toBeGreaterThanOrEqual(0)
    }
    expect(store.history[0]!.heroDecisions!.length).toBeGreaterThan(0)
  })

  it('records the insurance decision with book verdict', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, 33)
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
})
