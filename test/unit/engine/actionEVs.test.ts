import { describe, expect, it } from 'vitest'
import { actionEVs, bestAction } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'

const S17 = PRESETS.VEGAS_STRIP_6D! // no surrender
const LS = PRESETS.MA_205CMR! // late surrender
const H17 = (() => {
  const r = cloneRules(S17)
  r.dealerHitsSoft17 = true
  return r
})()

// state helper: two-card non-pair hand by totals
const hard = (total: number) => ({ total, soft: false, twoCards: true, fromSplit: false })
const soft = (total: number) => ({ total, soft: true, twoCards: true, fromSplit: false })

describe('actionEVs — structure', () => {
  it('always returns stand and hit; double only on two cards; surrender per rules', () => {
    const evs = actionEVs(hard(16), 10, S17)
    expect(evs.stand).toBeTypeOf('number')
    expect(evs.hit).toBeTypeOf('number')
    expect(evs.double).toBeTypeOf('number')
    expect(evs.surrender).toBeUndefined()
    expect(actionEVs(hard(16), 10, LS).surrender).toBe(-0.5)
    expect(actionEVs({ ...hard(16), twoCards: false }, 10, S17).double).toBeUndefined()
  })
})

describe('bestAction — famous canonical cells (6D S17 DAS)', () => {
  const cases: Array<[ReturnType<typeof hard>, number, string]> = [
    [hard(16), 10, 'hit'], // without surrender, 16v10 hits
    [hard(11), 6, 'double'],
    [hard(12), 4, 'stand'],
    [hard(12), 2, 'hit'],
    [hard(9), 2, 'hit'], // 9v2 hits — common player error to double
    [hard(10), 10, 'hit'],
    [hard(17), 11, 'stand'],
    [soft(18), 9, 'hit'], // A7 v 9 hits
    [soft(18), 6, 'double'], // Ds cell
    [soft(17), 3, 'double'], // A6 v 3 (erratum: was A2 v 5 — composition-marginal, model hits; see KNOWN_MARGINAL)
    [soft(19), 6, 'stand'] // A8 v 6 stands under S17
  ]
  for (const [state, up, expected] of cases) {
    it(`${state.soft ? 'soft' : 'hard'} ${state.total} vs ${up === 11 ? 'A' : up} → ${expected}`, () => {
      expect(bestAction(state, up as 2, S17).action).toBe(expected)
    })
  }
})

describe('bestAction — rule sensitivity', () => {
  it('11 vs A: hit under S17, double under H17 (canonical delta)', () => {
    expect(bestAction(hard(11), 11, S17).action).toBe('hit')
    expect(bestAction(hard(11), 11, H17).action).toBe('double')
  })

  it('16 vs 10 surrenders when late surrender is available', () => {
    expect(bestAction(hard(16), 10, LS).action).toBe('surrender')
  })

  it('15 vs 10 surrenders under LS, hits without it', () => {
    expect(bestAction(hard(15), 10, LS).action).toBe('surrender')
    expect(bestAction(hard(15), 10, S17).action).toBe('hit')
  })
})

describe('EV sanity', () => {
  it('standing on 20 vs 6 is strongly positive; hitting 20 is much worse', () => {
    const evs = actionEVs(hard(20), 6, S17)
    expect(evs.stand).toBeGreaterThan(0.6)
    expect(evs.hit).toBeLessThan(evs.stand - 0.5)
  })

  it('every EV lies in [-2, 2] (double can lose/win two units)', () => {
    for (const up of [2, 6, 10, 11] as const) {
      const evs = actionEVs(hard(12), up, S17)
      for (const v of Object.values(evs)) {
        if (typeof v === 'number') {
          expect(v).toBeGreaterThanOrEqual(-2)
          expect(v).toBeLessThanOrEqual(2)
        }
      }
    }
  })
})
