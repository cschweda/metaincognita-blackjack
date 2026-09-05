import { describe, expect, it } from 'vitest'
import { evalContext, splitEV as _splitEV, bestActionFull, generateChart, houseEdge } from '../../../app/utils/engine/basicStrategy'
import { PRESETS } from '../../../app/utils/engine/rules'

const VEGAS = PRESETS.VEGAS_STRIP_6D!
const SD65 = PRESETS.SINGLE_DECK_65!

describe('splitEV / bestActionFull — canonical pair plays (6D S17 DAS)', () => {
  it('always splits aces and eights', () => {
    for (const up of [2, 6, 7, 10, 11] as const) {
      expect(bestActionFull({ pair: 11, total: 12, soft: true }, evalContext(VEGAS, up, [11, 11])).action).toBe('split')
      expect(bestActionFull({ pair: 8, total: 16, soft: false }, evalContext(VEGAS, up, [8, 8])).action).toBe('split')
    }
  })

  it('never splits tens or fives', () => {
    expect(bestActionFull({ pair: 10, total: 20, soft: false }, evalContext(VEGAS, 6, [10, 10])).action).toBe('stand')
    expect(bestActionFull({ pair: 5, total: 10, soft: false }, evalContext(VEGAS, 6, [5, 5])).action).toBe('double')
  })

  it('splits nines vs 2-6 and 8-9 but stands vs 7 (canonical)', () => {
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, evalContext(VEGAS, 6, [9, 9])).action).toBe('split')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, evalContext(VEGAS, 7, [9, 9])).action).toBe('stand')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, evalContext(VEGAS, 9, [9, 9])).action).toBe('split')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, evalContext(VEGAS, 10, [9, 9])).action).toBe('stand')
  })

  it('DAS enables 4,4 vs 5-6 and 2,2 vs 2-3', () => {
    expect(bestActionFull({ pair: 4, total: 8, soft: false }, evalContext(VEGAS, 5, [4, 4])).action).toBe('split')
    expect(bestActionFull({ pair: 2, total: 4, soft: false }, evalContext(VEGAS, 2, [2, 2])).action).toBe('split')
    // no-DAS preset: splitting stops paying. At one deck the removal-aware model then doubles
    // the hard 8 (the published single-deck no-DAS book doubles 4,4 vs 5-6); a multi-deck
    // no-DAS table hits it.
    const sdAction = bestActionFull({ pair: 4, total: 8, soft: false }, evalContext(SD65, 5, [4, 4])).action
    expect(sdAction).not.toBe('split')
    expect(sdAction).toBe('double')
    const multiNoDas = { ...VEGAS, sideBets: { ...VEGAS.sideBets }, doubleAfterSplit: false }
    expect(bestActionFull({ pair: 4, total: 8, soft: false }, evalContext(multiNoDas, 5, [4, 4])).action).toBe('hit')
  })
})

describe('generateChart', () => {
  it('covers hard 5-20, soft 13-20, pairs 2-A against all ten upcards', () => {
    const chart = generateChart(VEGAS)
    for (let t = 5; t <= 20; t++) expect(Object.keys(chart.hard[t]!)).toHaveLength(10)
    for (let t = 13; t <= 20; t++) expect(Object.keys(chart.soft[t]!)).toHaveLength(10)
    for (const p of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) expect(Object.keys(chart.pairs[p]!)).toHaveLength(10)
  })

  it('uses composite codes: Ds for soft 18 vs 6, plain S for hard 17', () => {
    const chart = generateChart(VEGAS)
    expect(chart.soft[18]![6]).toBe('Ds')
    expect(chart.hard[17]![10]).toBe('S')
    expect(chart.pairs[11]![11]).toBe('P')
  })
})

describe('houseEdge', () => {
  it('computes plausible edges and orders rule sets correctly', () => {
    // Since round four the deal layer and the play layer share one composition model, so these
    // windows track PUBLISHED casino figures rather than a model offset. Measured at
    // implementation time: vegas 0.4031%, ma 0.3619%, sd65 1.5694%.
    const vegas = houseEdge(VEGAS) // 6D S17 DAS, no surrender — published ≈ 0.0040
    const ma = houseEdge(PRESETS.MA_205CMR!) // 8D S17 DAS LS — published ≈ 0.0036
    const sd65 = houseEdge(SD65) // 1D H17 6:5 — published ≈ 0.0158
    expect(vegas).toBeGreaterThan(0.0035)
    expect(vegas).toBeLessThan(0.0045)
    expect(ma).toBeGreaterThan(0.0030)
    expect(ma).toBeLessThan(0.0042)
    expect(sd65).toBeGreaterThan(0.014)
    expect(sd65).toBeLessThan(0.018)
    expect(sd65).toBeGreaterThan(vegas) // 6:5 is the lesson
    expect(ma).toBeLessThan(vegas) // late surrender is worth roughly 0.07%
  })

  it('6:5 payout costs roughly 1.4% vs 3:2 on the same rules', () => {
    const base = houseEdge(VEGAS)
    const r = { ...VEGAS, sideBets: { ...VEGAS.sideBets }, blackjackPayout: '6:5' as const, evenMoneyOffered: false }
    const cheap = houseEdge(r)
    expect(cheap - base).toBeGreaterThan(0.011)
    expect(cheap - base).toBeLessThan(0.017)
  })
})
