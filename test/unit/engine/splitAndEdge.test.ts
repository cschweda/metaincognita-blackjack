import { describe, expect, it } from 'vitest'
import { splitEV as _splitEV, bestActionFull, generateChart, houseEdge } from '../../../app/utils/engine/basicStrategy'
import { PRESETS } from '../../../app/utils/engine/rules'

const VEGAS = PRESETS.VEGAS_STRIP_6D!
const SD65 = PRESETS.SINGLE_DECK_65!

describe('splitEV / bestActionFull — canonical pair plays (6D S17 DAS)', () => {
  it('always splits aces and eights', () => {
    for (const up of [2, 6, 7, 10, 11] as const) {
      expect(bestActionFull({ pair: 11, total: 12, soft: true }, up, VEGAS).action).toBe('split')
      expect(bestActionFull({ pair: 8, total: 16, soft: false }, up, VEGAS).action).toBe('split')
    }
  })

  it('never splits tens or fives', () => {
    expect(bestActionFull({ pair: 10, total: 20, soft: false }, 6, VEGAS).action).toBe('stand')
    expect(bestActionFull({ pair: 5, total: 10, soft: false }, 6, VEGAS).action).toBe('double')
  })

  it('splits nines vs 2-6 and 8-9 but stands vs 7 (canonical)', () => {
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, 6, VEGAS).action).toBe('split')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, 7, VEGAS).action).toBe('stand')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, 9, VEGAS).action).toBe('split')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, 10, VEGAS).action).toBe('stand')
  })

  it('DAS enables 4,4 vs 5-6 and 2,2 vs 2-3', () => {
    expect(bestActionFull({ pair: 4, total: 8, soft: false }, 5, VEGAS).action).toBe('split')
    expect(bestActionFull({ pair: 2, total: 4, soft: false }, 2, VEGAS).action).toBe('split')
    // no-DAS preset: those become hit
    expect(bestActionFull({ pair: 4, total: 8, soft: false }, 5, SD65).action).toBe('hit')
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
    // Windows pin the fixed-composition MODEL's values (see Modeling Notes calibration
    // erratum), which run pessimistic vs published casino figures: the model sits between
    // true-deck and infinite-deck. Measured at implementation time: vegas 0.5692%,
    // ma 0.4690%, sd65 2.5903%.
    const vegas = houseEdge(VEGAS) // published ≈ 0.0040; model ≈ 0.0057
    const ma = houseEdge(PRESETS.MA_205CMR!) // 8D S17 DAS LS published ≈ 0.0035; model ≈ 0.0047
    const sd65 = houseEdge(SD65) // 6:5 single deck published ≈ 0.018; model ≈ 0.026
    expect(vegas).toBeGreaterThan(0.0045)
    expect(vegas).toBeLessThan(0.0065)
    expect(ma).toBeGreaterThan(0.0035)
    expect(ma).toBeLessThan(0.006)
    expect(sd65).toBeGreaterThan(0.02)
    expect(sd65).toBeLessThan(0.03)
    expect(sd65).toBeGreaterThan(vegas) // 6:5 is the lesson
  })

  it('6:5 payout costs roughly 1.4% vs 3:2 on the same rules', () => {
    const base = houseEdge(VEGAS)
    const r = { ...VEGAS, sideBets: { ...VEGAS.sideBets }, blackjackPayout: '6:5' as const, evenMoneyOffered: false }
    const cheap = houseEdge(r)
    expect(cheap - base).toBeGreaterThan(0.011)
    expect(cheap - base).toBeLessThan(0.017)
  })
})
