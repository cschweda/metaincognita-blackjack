import { describe, expect, it } from 'vitest'
import { dealerDistribution, BUCKETS } from '../../../app/utils/engine/basicStrategy'
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
  const d = dealerDistribution(up, rules, conditioned)
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
      expect(Math.abs(dealerDistribution(up, S17, conditioned).bust - expected)).toBeLessThan(0.02)
    })
  }
})

describe('dealerDistribution — blackjack handling', () => {
  it('unconditioned: P(BJ | up=A) = 16/52, P(BJ | up=T) = 4/52', () => {
    expect(dealerDistribution(11, S17, false).blackjack).toBeCloseTo(16 / 52, 9)
    expect(dealerDistribution(10, S17, false).blackjack).toBeCloseTo(4 / 52, 9)
  })

  it('conditioned (peek says no BJ): blackjack mass is zero, rest renormalized', () => {
    const d = dealerDistribution(11, S17, true)
    expect(d.blackjack).toBe(0)
    expect(mass(11, S17, true)).toBeCloseTo(1, 9)
  })

  it('two-card 21 with a non-ace/ten upcard is 21, not blackjack', () => {
    const d = dealerDistribution(5, S17, false)
    expect(d.blackjack).toBe(0)
    expect(d['21']).toBeGreaterThan(0)
  })
})

describe('dealerDistribution — H17 effects', () => {
  it('H17 raises the ace bust rate (dealer re-risks soft 17)', () => {
    expect(dealerDistribution(11, H17, false).bust)
      .toBeGreaterThan(dealerDistribution(11, S17, false).bust)
  })

  it('H17 lowers P(17) for a 6 upcard', () => {
    expect(dealerDistribution(6, H17, false)['17'])
      .toBeLessThan(dealerDistribution(6, S17, false)['17'])
  })
})
