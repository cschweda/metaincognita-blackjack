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
