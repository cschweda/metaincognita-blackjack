import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RAMP, bucketForTc, betForTc, tcFrequencies, rampStats, simulateTrajectories
} from '../../app/utils/betRamp'
import type { BetRamp, TcFrequencies } from '../../app/utils/betRamp'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'

const RULES = (() => {
  const r = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  r.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return r
})()

describe('bucketForTc / betForTc', () => {
  it('floors the TC into six clamped buckets', () => {
    expect(bucketForTc(-3.2)).toBe(0)
    expect(bucketForTc(0)).toBe(0)
    expect(bucketForTc(0.9)).toBe(0)
    expect(bucketForTc(1.0)).toBe(1)
    expect(bucketForTc(2.7)).toBe(2)
    expect(bucketForTc(4.99)).toBe(4)
    expect(bucketForTc(9)).toBe(5)
  })

  it('converts steps to cents and clamps to table limits', () => {
    const ramp: BetRamp = { ...DEFAULT_RAMP, unitCents: 2500, steps: [1, 2, 4, 6, 8, 100] }
    expect(betForTc(ramp, 0, RULES)).toBe(2500)
    expect(betForTc(ramp, 3.4, RULES)).toBe(15_000)
    expect(betForTc(ramp, 8, RULES)).toBe(RULES.maxBet) // 100 units clamps to the table max
    const tiny: BetRamp = { ...DEFAULT_RAMP, unitCents: 100, steps: [1, 1, 1, 1, 1, 1] }
    expect(betForTc(tiny, 2, RULES)).toBe(RULES.minBet) // $1 unit clamps up to the minimum
  })
})

describe('tcFrequencies', () => {
  it('measures a normalized, deterministic TC distribution from real play', () => {
    const a = tcFrequencies(RULES, 300, 42)
    const b = tcFrequencies(RULES, 300, 42)
    expect(a).toEqual(b) // seeded determinism
    expect(a.freq).toHaveLength(6)
    const total = a.freq.reduce((s, f) => s + f, 0)
    expect(total).toBeCloseTo(1, 10)
    expect(a.freq[0]).toBeGreaterThan(0.4) // most rounds start at non-positive TC
    expect(a.meanTc[0]).toBeLessThanOrEqual(0.5)
    expect(a.meanTc[2] === 0 || (a.meanTc[2]! >= 1.5 && a.meanTc[2]! < 3.5)).toBe(true)
  })
})

describe('rampStats', () => {
  // hand-checkable frequencies: flat bets, all rounds in one bucket
  const FLAT: TcFrequencies = { freq: [1, 0, 0, 0, 0, 0], meanTc: [0, 0, 0, 0, 0, 0] }

  it('computes EV, SD, and ruin for a hand-checkable flat case', () => {
    const ramp: BetRamp = {
      unitCents: 1000, bankrollCents: 100_000, roundsPerHour: 60, wongOut: false,
      steps: [1, 1, 1, 1, 1, 1]
    }
    const he = 0.005 // pretend 0.5% house edge
    const stats = rampStats(ramp, FLAT, he, RULES)
    // EV/round = $10 × (−0.005 + 0.005×0) = −5¢
    expect(stats.evPerRoundCents).toBeCloseTo(-5, 5)
    // SD/round = $10 × √1.33 ≈ $11.53
    expect(stats.sdPerRoundCents).toBeCloseTo(1000 * Math.sqrt(1.33), 3)
    expect(stats.evHourlyCents).toBeCloseTo(-300, 3)
    expect(stats.n0Rounds).toBe(Infinity) // negative EV never outruns variance
    expect(stats.ruin).toBe(1) // negative EV → certain ruin, by the formula's clamp
  })

  it('positive-edge case: finite N0 and a (0,1) ruin probability', () => {
    const hot: TcFrequencies = { freq: [0, 0, 0, 0, 0, 1], meanTc: [0, 0, 0, 0, 0, 5] }
    const ramp: BetRamp = {
      unitCents: 1000, bankrollCents: 200_000, roundsPerHour: 60, wongOut: false,
      steps: [1, 1, 1, 1, 1, 1]
    }
    const stats = rampStats(ramp, hot, 0.005, RULES)
    // edge at meanTc 5 = −0.005 + 0.025 = +2% → EV/round = +20¢
    expect(stats.evPerRoundCents).toBeCloseTo(20, 5)
    expect(stats.n0Rounds).toBeGreaterThan(0)
    expect(Number.isFinite(stats.n0Rounds)).toBe(true)
    expect(stats.ruin).toBeGreaterThan(0)
    expect(stats.ruin).toBeLessThan(1)
  })

  it('wong-out removes the ≤0 bucket from EV and variance', () => {
    const mixed: TcFrequencies = { freq: [0.8, 0, 0, 0, 0, 0.2], meanTc: [-0.5, 0, 0, 0, 0, 5] }
    const ramp: BetRamp = {
      unitCents: 1000, bankrollCents: 200_000, roundsPerHour: 60, wongOut: true,
      steps: [1, 1, 1, 1, 1, 12]
    }
    const stats = rampStats(ramp, mixed, 0.005, RULES)
    // only the ≥+5 bucket contributes: 0.2 × $120 × 2% = +48¢/round
    expect(stats.evPerRoundCents).toBeCloseTo(48, 5)
    expect(stats.sdPerRoundCents).toBeCloseTo(Math.sqrt(0.2 * 12_000 ** 2 * 1.33), 3)
  })
})

describe('simulateTrajectories', () => {
  it('is deterministic under a seed and counts ruin', () => {
    const params = {
      rules: RULES,
      ramp: { ...DEFAULT_RAMP, unitCents: 2500, bankrollCents: 20_000, steps: [1, 2, 4, 6, 8, 12] },
      rounds: 80,
      trajectories: 25,
      seed: 7,
      sampleEvery: 20
    }
    const a = simulateTrajectories(params)
    const b = simulateTrajectories(params)
    expect(a.ruinRate).toBe(b.ruinRate)
    expect(a.meanFinalCents).toBe(b.meanFinalCents)
    expect(a.ruinRate).toBeGreaterThan(0) // a $200 bankroll betting $25+ units busts often
    expect(a.bands).toHaveLength(80 / 20 + 1) // start + 4 samples
    for (const band of a.bands) {
      expect(band.p5).toBeLessThanOrEqual(band.p25)
      expect(band.p25).toBeLessThanOrEqual(band.p50)
      expect(band.p50).toBeLessThanOrEqual(band.p75)
      expect(band.p75).toBeLessThanOrEqual(band.p95)
    }
  })

  it('reports progress and a sane final mean for a comfortable bankroll', () => {
    const ticks: number[] = []
    const result = simulateTrajectories({
      rules: RULES,
      ramp: { ...DEFAULT_RAMP, bankrollCents: 2_000_000 },
      rounds: 60,
      trajectories: 20,
      seed: 11,
      sampleEvery: 30
    }, p => ticks.push(p))
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks[ticks.length - 1]).toBe(1)
    expect(result.ruinRate).toBe(0) // $20k bankroll cannot bust in 60 rounds of ≤$300 bets
    expect(result.meanFinalCents).toBeGreaterThan(1_500_000)
  })
})
