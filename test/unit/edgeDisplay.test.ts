import { describe, expect, it } from 'vitest'
import { edgeResolution, houseEdge, modelledEdge } from '../../app/utils/engine/basicStrategy'
import { formatAdvantage, formatHouseEdge } from '../../app/utils/format'
import { advantageEstimate } from '../../app/utils/engine/counting'
import { PRESETS, cloneRules } from '../../app/utils/engine/rules'
import { rampStats } from '../../app/utils/betRamp'
import type { TcFrequencies } from '../../app/utils/betRamp'

// The model runs ~0.15pp player-favourable at one deck, far enough to flip the SIGN of a 1-deck
// 3:2 house edge. Every surface that prints an edge must refuse to resolve what the model cannot,
// and the money math must not price a flat bet as +EV off the artifact (round-four review).

const oneDeck = (mut: (r: ReturnType<typeof cloneRules>) => void = () => {}) => {
  const r = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  r.decks = 1
  mut(r)
  return r
}

describe('the model never claims a sign it cannot resolve', () => {
  it('a raw 1-deck 3:2 edge really is negative — this is the artifact being guarded', () => {
    expect(houseEdge(oneDeck())).toBeLessThan(0)
  })

  it('modelledEdge zeroes it, so money math cannot inherit the artifact', () => {
    expect(modelledEdge(oneDeck())).toBe(0)
    // and advantageEstimate at TC 0 is then flat, not a claimed player edge
    expect(advantageEstimate(0, modelledEdge(oneDeck()))).toBe(0)
  })

  it('never prints a player advantage at TC 0 on any 1-deck rule variant', () => {
    for (const mut of [
      () => {},
      (r: ReturnType<typeof cloneRules>) => { r.dealerHitsSoft17 = true },
      (r: ReturnType<typeof cloneRules>) => { r.doubleAfterSplit = false },
      (r: ReturnType<typeof cloneRules>) => { r.surrender = 'late' }
    ]) {
      const rules = oneDeck(mut)
      const shown = formatAdvantage(advantageEstimate(0, modelledEdge(rules)), edgeResolution(rules))
      expect(shown, JSON.stringify({ decks: 1, h17: rules.dealerHitsSoft17 })).toBe('~even')
    }
  })

  it('still reports multi-deck edges plainly — the band does not swallow real numbers', () => {
    const rules = PRESETS.VEGAS_STRIP_6D!
    expect(formatHouseEdge(houseEdge(rules), edgeResolution(rules))).toBe('0.40%')
    expect(modelledEdge(rules)).toBeCloseTo(houseEdge(rules), 12)
  })

  it('the multi-deck band is narrow enough to keep the break-even crossing visible', () => {
    const rules = PRESETS.VEGAS_STRIP_6D!
    // at 6 decks the resolution is 0.05pp, so a TC of +1 already reads as a real advantage
    expect(edgeResolution(rules)).toBe(0.0005)
    const atTc1 = advantageEstimate(1, modelledEdge(rules))
    expect(formatAdvantage(atTc1, edgeResolution(rules))).not.toBe('~even')
  })
})

describe('formatters', () => {
  it('a house edge carries no "+" — a leading plus would read as a player advantage', () => {
    expect(formatHouseEdge(0.004, 0.0005)).toBe('0.40%')
    expect(formatHouseEdge(-0.004, 0.0005)).toBe('−0.40%')
    expect(formatHouseEdge(0.0001, 0.0005)).toBe('~even')
  })

  it('an advantage always carries its sign', () => {
    expect(formatAdvantage(0.0125, 0.0005)).toBe('+1.25%')
    expect(formatAdvantage(-0.004, 0.0005)).toBe('−0.40%')
    expect(formatAdvantage(0, 0.0005)).toBe('~even')
  })
})

describe('the lab prices ramps off the guarded edge', () => {
  it('a flat bet on a 1-deck 3:2 table is never +EV', () => {
    // modelledEdge's own docstring names the Bet Lab as the surface it protects; the lab read the
    // raw figure anyway. A raw negative makes advantageEstimate positive at TC 0, so a FLAT ramp
    // priced as profitable with a finite N0 (round-five review).
    const rules = oneDeck()
    const flat: TcFrequencies = { freq: [1, 0, 0, 0, 0, 0], meanTc: [0, 0, 0, 0, 0, 0] }
    const ramp = {
      unitCents: 2500, bankrollCents: 1_000_000, roundsPerHour: 70, wongOut: false,
      steps: [1, 1, 1, 1, 1, 1]
    }
    const guarded = rampStats(ramp, flat, modelledEdge(rules), rules)
    expect(guarded.evPerRoundCents).toBeLessThanOrEqual(0)
    expect(guarded.n0Rounds).toBe(Infinity)
    expect(guarded.ruin).toBe(1)

    // and the raw figure is what would have made it look profitable
    const raw = rampStats(ramp, flat, houseEdge(rules), rules)
    expect(raw.evPerRoundCents).toBeGreaterThan(0)
  })
})
