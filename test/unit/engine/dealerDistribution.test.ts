import { describe, expect, it } from 'vitest'
import { evalContext, dealerDistribution, BUCKETS } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Bucket } from '../../../app/utils/engine/cards'

const S17 = PRESETS.VEGAS_STRIP_6D!
const H17 = (() => {
  const r = cloneRules(S17)
  r.dealerHitsSoft17 = true
  return r
})()

const OUTCOMES = [17, 18, 19, 20, 21, 'bust', 'blackjack'] as const

function mass(up: Bucket, rules = S17, conditioned = false): number {
  const d = dealerDistribution(evalContext(rules, up), conditioned)
  return OUTCOMES.reduce((sum, k) => sum + d[k], 0)
}

describe('dealerDistribution — probability mass', () => {
  it('sums to 1 for every upcard, S17 and H17, conditioned and not', () => {
    for (const up of BUCKETS) {
      expect(mass(up, S17, false)).toBeCloseTo(1, 9)
      expect(mass(up, H17, false)).toBeCloseTo(1, 9)
      expect(mass(up, S17, true)).toBeCloseTo(1, 9)
    }
  })
})

describe('dealerDistribution — canonical S17 bust rates (±0.02)', () => {
  // Pin provenance: upcards 2-9 are identical either way (conditioning is a no-op).
  // The ten pin (0.212) is the published UNCONDITIONED value (engine: 0.2121).
  // The ace pin (0.170) is the peek-CONDITIONED value (engine: 0.1665) — unconditioned,
  // ~31% of the ace's mass is blackjack and its bust rate drops to ~0.115.
  const pins: Array<[Bucket, number]> = [
    [2, 0.354], [3, 0.374], [4, 0.400], [5, 0.428], [6, 0.424],
    [7, 0.262], [8, 0.245], [9, 0.230], [10, 0.212], [11, 0.170]
  ]
  for (const [up, expected] of pins) {
    it(`upcard ${up} busts ≈ ${expected}`, () => {
      const conditioned = up === 11
      expect(Math.abs(dealerDistribution(evalContext(S17, up), conditioned).bust - expected)).toBeLessThan(0.02)
    })
  }
})

describe('dealerDistribution — blackjack handling', () => {
  // Composition-aware since round four: the upcard is removed from the shoe before the hole is
  // drawn, so on a 6-deck shoe P(ten | ace up) is 96/311, not the fresh-shoe 16/52.
  it('unconditioned: P(BJ | up=A) = 96/311, P(BJ | up=T) = 24/311 on a 6-deck shoe', () => {
    expect(dealerDistribution(evalContext(S17, 11), false).blackjack).toBeCloseTo(96 / 311, 9)
    expect(dealerDistribution(evalContext(S17, 10), false).blackjack).toBeCloseTo(24 / 311, 9)
  })

  it('the removal effect shrinks as decks are added', () => {
    const oneDeck = cloneRules(S17)
    oneDeck.decks = 1
    const eightDeck = cloneRules(S17)
    eightDeck.decks = 8
    const one = dealerDistribution(evalContext(oneDeck, 11), false).blackjack
    const eight = dealerDistribution(evalContext(eightDeck, 11), false).blackjack
    expect(one).toBeCloseTo(16 / 51, 9)
    expect(eight).toBeCloseTo(128 / 415, 9)
    expect(one).toBeGreaterThan(eight) // fewer decks, the removed ace matters more
  })

  it('conditioned (peek says no BJ): blackjack mass is zero, rest renormalized', () => {
    const d = dealerDistribution(evalContext(S17, 11), true)
    expect(d.blackjack).toBe(0)
    expect(mass(11, S17, true)).toBeCloseTo(1, 9)
  })

  it('two-card 21 with a non-ace/ten upcard is 21, not blackjack', () => {
    const d = dealerDistribution(evalContext(S17, 5), false)
    expect(d.blackjack).toBe(0)
    expect(d['21']).toBeGreaterThan(0)
  })
})

describe('dealerDistribution — H17 effects', () => {
  it('H17 raises the ace bust rate (dealer re-risks soft 17)', () => {
    expect(dealerDistribution(evalContext(H17, 11), false).bust)
      .toBeGreaterThan(dealerDistribution(evalContext(S17, 11), false).bust)
  })

  it('H17 lowers P(17) for a 6 upcard', () => {
    expect(dealerDistribution(evalContext(H17, 6), false)['17'])
      .toBeLessThan(dealerDistribution(evalContext(S17, 6), false)['17'])
  })
})
