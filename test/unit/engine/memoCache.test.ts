import { describe, expect, it } from 'vitest'
import { distFor, evalContext, houseEdge, generateChart } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'

// The two-generation cache promises that "the hot working set survives exactly one eviction" and
// that it "never evicts what a single computation is holding". Promoting a stale hit THROUGH set()
// broke both: set() rotates, so a pure read could discard the generation it was reading from.

describe('a read never destroys what it is reading', () => {
  it('values stay retrievable across a large mixed workload', () => {
    // build far more distinct compositions than one generation holds, then re-read the earliest
    // ones — under the old promote-through-set they could vanish mid-sweep
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    const first = distFor(evalContext(rules, 10, [8, 8]))
    for (let a = 2; a <= 11; a++) {
      for (let b = 2; b <= 11; b++) {
        for (const decks of [1, 2, 4, 6, 8] as const) {
          const r = cloneRules(rules)
          r.decks = decks
          distFor(evalContext(r, 10, [a as never, b as never]))
        }
      }
    }
    const again = distFor(evalContext(rules, 10, [8, 8]))
    expect(again.bust).toBeCloseTo(first.bust, 12)
    expect(again[17]).toBeCloseTo(first[17], 12)
  })

  it('repeated work stays warm rather than thrashing', () => {
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    houseEdge(rules)
    generateChart(rules)
    const t0 = performance.now()
    houseEdge(rules)
    generateChart(rules)
    const warm = performance.now() - t0
    expect(warm, `a warm repeat took ${warm.toFixed(1)}ms`).toBeLessThan(25)
  })
})
