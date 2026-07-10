import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameLoop, __resetGameLoopForTests } from '../../app/composables/useGameLoop'
import { useBlackjackStore, STORAGE_KEY } from '../../app/stores/useBlackjackStore'
import { displayCard } from '../../app/utils/engine/cards'
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

  function freshHarness(): void {
    setActivePinia(createPinia())
    localStorage.clear()
    __resetGameLoopForTests()
    __resetCountingForTests()
  }

  it('withholds double and split when the bankroll cannot cover the extra stake', () => {
    // find a seed whose first round is a two-card hero turn offering double
    let seed = 0
    for (let s = 1; s < 80 && !seed; s++) {
      freshHarness()
      const probe = useGameLoop()
      probe.startSession(settings(), 100_000, s)
      probe.beginRound(1000, {})
      if (probe.phase.value === 'insurance') probe.heroInsurance(null)
      if (probe.phase.value === 'playerTurns' && probe.legalActions.value.includes('double')) seed = s
    }
    expect(seed).toBeGreaterThan(0)

    // the same deal all-in: the unaffordable double must not be offered
    freshHarness()
    const loop = useGameLoop()
    loop.startSession(settings(), 1000, seed)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    expect(loop.phase.value).toBe('playerTurns')
    expect(loop.legalActions.value).toContain('hit')
    expect(loop.legalActions.value).not.toContain('double')
  })

  function walkToInsurance(loop: ReturnType<typeof useGameLoop>): void {
    let guard = 0
    while (loop.phase.value !== 'insurance' && guard++ < 40) {
      if (loop.phase.value === 'playerTurns') {
        loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
      } else {
        loop.beginRound(1000, {})
      }
    }
    expect(loop.phase.value).toBe('insurance')
  }

  it('ignores a repeated insurance decision instead of double-recording and throwing', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, 33)
    walkToInsurance(loop)
    loop.heroInsurance(null)
    expect(() => loop.heroInsurance(500)).not.toThrow()
    expect(store.training.adherence.insurance.decisions).toBe(1)
  })

  it('does not record an insurance decision the engine rejected', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, 33)
    walkToInsurance(loop)
    expect(() => loop.heroInsurance(999_999)).not.toThrow() // over the half-wager cap
    expect(store.training.adherence.insurance.decisions).toBe(0)
    loop.heroInsurance(null) // insurance is still open — the real decision goes through
    expect(store.training.adherence.insurance.decisions).toBe(1)
  })

  it('drops an action aimed at a hand index that has already advanced', () => {
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    expect(loop.phase.value).toBe('playerTurns')
    loop.act('hit', 5) // stale index from a double-click — must be ignored
    expect(loop.lastDecision.value).toBeNull()
    expect(loop.phase.value).toBe('playerTurns')
  })

  function playFullRound(loop: ReturnType<typeof useGameLoop>): void {
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    while (loop.phase.value === 'playerTurns') {
      loop.act(loop.legalActions.value.includes('stand') ? 'stand' : loop.legalActions.value[0]!)
    }
    expect(loop.phase.value).toBe('complete')
  }

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

  it('round numbering continues after a refresh instead of restarting at 1', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    playFullRound(loop)
    expect(store.history[0]!.round).toBe(1)

    __resetGameLoopForTests() // refresh: module state gone, store survives
    const loop2 = useGameLoop()
    expect(loop2.restoreSession()).toBe(true)
    playFullRound(loop2)
    expect(store.history[1]!.round).toBe(2)
  })

  it('a corrupt round snapshot falls back to a fresh table instead of bricking /table', () => {
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    expect(loop.phase.value).toBe('playerTurns')

    // simulate a corrupted-but-versioned snapshot landing in storage
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Record<string, unknown>
    const snap = raw.roundSnapshot as Record<string, unknown>
    snap.spots = 'garbage'
    ;(snap.shoe as Record<string, unknown>).cards = 'garbage'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))

    setActivePinia(createPinia())
    __resetGameLoopForTests()
    __resetCountingForTests()
    const loop2 = useGameLoop()
    expect(loop2.restoreSession()).toBe(true) // must not throw
    expect(loop2.phase.value).toBe('betting') // fresh shoe fallback
    expect(useBlackjackStore().roundSnapshot).toBeNull() // the bad key is cleared for good
  })

  it('a mid-round refresh keeps the pre-refresh cards in the round record', () => {
    const store = useBlackjackStore()
    const loop = useGameLoop()
    loop.startSession(settings({ count: 'shown' }), 100_000, 7)
    loop.beginRound(1000, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    expect(loop.phase.value).toBe('playerTurns')
    const heroFirstCard = loop.spotsView.value.find(s => s.occupant === 'hero')!.hands[0]!.cards[0]!

    __resetGameLoopForTests()
    const loop2 = useGameLoop()
    expect(loop2.restoreSession()).toBe(true)
    while (loop2.phase.value === 'playerTurns') {
      loop2.act(loop2.legalActions.value.includes('stand') ? 'stand' : loop2.legalActions.value[0]!)
    }
    const rec = store.history[0]!
    // the record's visible-card trail must include cards dealt BEFORE the refresh
    expect(rec.visibleCards).toContain(displayCard(heroFirstCard))
  })

  it('heroTurn advances across split hands so indexed actions land (stale-computed regression)', () => {
    // Vue's computed stability keeps canAct at true→true across a split-hand advance;
    // heroTurn must still recompute or act(action, handIndex) drops every follow-up action
    const loop = useGameLoop()
    loop.startSession(settings({ advisor: 'coach', count: 'self-check' }), 50_000, 133) // 8,8 seed
    loop.beginRound(2500, {})
    if (loop.phase.value === 'insurance') loop.heroInsurance(null)
    expect(loop.legalActions.value).toContain('split')
    loop.act('split', loop.heroTurn.value?.handIndex)
    let guard = 0
    while (loop.phase.value === 'playerTurns' && guard++ < 8) {
      loop.act('stand', loop.heroTurn.value?.handIndex)
    }
    expect(loop.phase.value).toBe('complete')
    const rec = useBlackjackStore().history[0]!
    expect(rec.spots.find(s => s.occupant === 'hero')!.hands).toHaveLength(2)
  })

  it('lastDecision does not leak across sessions', () => {
    const loop = useGameLoop()
    loop.startSession(settings(), 100_000, 7)
    playFullRound(loop)
    expect(loop.lastDecision.value).not.toBeNull()
    loop.endSession()
    expect(loop.lastDecision.value).toBeNull()
  })

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
})
