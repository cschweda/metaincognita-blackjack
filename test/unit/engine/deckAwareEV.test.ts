import { describe, expect, it } from 'vitest'
import { evalContext, actionEVs, generateChart, houseEdge, probsFor } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Bucket } from '../../../app/utils/engine/cards'

const BUCKETS: Bucket[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

describe('probsFor — composition-derived draw probabilities', () => {
  it('is the fresh-shoe vector with nothing removed', () => {
    const p = probsFor(6, [])
    expect(p[10]).toBeCloseTo(16 / 52, 12)
    expect(p[5]).toBeCloseTo(4 / 52, 12)
    expect(BUCKETS.reduce((s, b) => s + p[b], 0)).toBeCloseTo(1, 12)
  })

  it('removes cards and renormalizes', () => {
    const p = probsFor(1, [7, 7, 10])
    expect(p[7]).toBeCloseTo(2 / 49, 12) // four sevens minus two
    expect(p[10]).toBeCloseTo(15 / 49, 12) // sixteen tens minus one
    expect(BUCKETS.reduce((s, b) => s + p[b], 0)).toBeCloseTo(1, 12)
  })

  it('removal bites harder at one deck than at eight', () => {
    expect(probsFor(1, [10])[10]).toBeLessThan(probsFor(8, [10])[10])
  })

  it('clamps a bucket at zero rather than going negative', () => {
    const p = probsFor(1, [11, 11, 11, 11, 11])
    expect(p[11]).toBe(0)
    expect(BUCKETS.reduce((s, b) => s + p[b], 0)).toBeCloseTo(1, 12)
  })
})

describe('house edge is deck-aware and monotonic', () => {
  const edgeAt = (decks: 1 | 2 | 4 | 6 | 8): number => {
    const r = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    r.decks = decks
    return houseEdge(r)
  }

  it('rises with deck count — fewer decks favour the player', () => {
    const edges = ([1, 2, 4, 6, 8] as const).map(edgeAt)
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]!, `${[1, 2, 4, 6, 8][i]} decks must be worse than ${[1, 2, 4, 6, 8][i - 1]}`)
        .toBeGreaterThan(edges[i - 1]!)
    }
  })

  it('lands on published values for multi-deck games', () => {
    expect(edgeAt(2)).toBeCloseTo(0.0019, 3)
    expect(edgeAt(4)).toBeCloseTo(0.0035, 3)
    expect(edgeAt(6)).toBeCloseTo(0.0040, 3)
    expect(edgeAt(8)).toBeCloseTo(0.0043, 3)
  })

  it('prices the 6:5 single-deck teaching preset near its published edge', () => {
    // 1D H17 no-DAS is ~0.19%; the 6:5 payout costs ~1.39% at one deck
    expect(houseEdge(PRESETS.SINGLE_DECK_65!)).toBeCloseTo(0.0157, 2)
  })

  it('prices late surrender at roughly the published 0.07%', () => {
    const withLS = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    withLS.surrender = 'late'
    const delta = houseEdge(PRESETS.VEGAS_STRIP_6D!) - houseEdge(withLS)
    expect(delta).toBeGreaterThan(0.0004)
    expect(delta).toBeLessThan(0.0011)
  })
})

describe('the generated chart now depends on the deck count', () => {
  it('one deck and eight decks no longer produce identical charts', () => {
    const one = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    one.decks = 1
    const eight = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    eight.decks = 8
    expect(JSON.stringify(generateChart(one))).not.toBe(JSON.stringify(generateChart(eight)))
  })

  it('reaches single-deck book plays the infinite-deck model could not', () => {
    const chart = generateChart(PRESETS.SINGLE_DECK_65!)
    expect(chart.hard[9]![2], 'hard 9 v 2 doubles at one deck').toBe('D')
    expect(chart.pairs[6]![2], '6,6 v 2 splits at one deck').toBe('P')
    expect(chart.soft[19]![5], 'A,8 v 5 doubles at one deck H17').toBe('Ds')
  })

  it('pair cells price the pair itself out of the shoe', () => {
    const r = cloneRules(PRESETS.SINGLE_DECK_65!)
    const state = { total: 16, soft: false, twoCards: true, fromSplit: false }
    const withPair = actionEVs(state, evalContext(r, 10, [8, 8, 10]))
    const upOnly = actionEVs(state, evalContext(r, 10, [10]))
    expect(withPair.hit).not.toBeCloseTo(upOnly.hit, 6)
  })
})

// ── documented residual: the one-deck end of the model ────────────────────────
// probsFor removes the known cards ONCE, at the top of the hand. That captures nearly all of
// the deck effect at four decks and up (2/4/6/8 land within ~0.01pp of published) but at one
// deck the removal effects that a full analyzer would apply at every draw are large, and this
// model overshoots them by roughly 0.15pp in the PLAYER's favour. Pinned so the residual cannot
// drift further unnoticed, and so nobody quotes a one-deck figure as accurate.
describe('one-deck residual (documented, not accurate)', () => {
  const oneDeck = (mut: (r: ReturnType<typeof cloneRules>) => void = () => {}) => {
    const r = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    r.decks = 1
    mut(r)
    return houseEdge(r)
  }

  it('runs player-favourable at one deck — within 0.2pp of published, not on it', () => {
    // published 1D S17 DAS 3:2 ≈ -0.02%; the model says ≈ -0.17%
    const edge = oneDeck()
    expect(edge).toBeGreaterThan(-0.0025)
    expect(edge).toBeLessThan(0.0)
    expect(Math.abs(edge - (-0.0002))).toBeLessThan(0.002) // the residual, bounded
  })

  it('keeps the residual bounded across one-deck rule variants', () => {
    // each published figure is within 0.2pp of the model's; none may drift past that
    const cases: Array<[string, number, number]> = [
      ['1D H17 DAS 3:2', oneDeck((r) => { r.dealerHitsSoft17 = true }), 0.0018],
      ['1D S17 noDAS 3:2', oneDeck((r) => { r.doubleAfterSplit = false }), 0.0004]
    ]
    for (const [label, modelEdge, published] of cases) {
      expect(Math.abs(modelEdge - published), label).toBeLessThan(0.002)
    }
  })

  it('is accurate where it claims to be — four decks and up', () => {
    for (const [decks, published] of [[4, 0.0035], [6, 0.0040], [8, 0.0043]] as const) {
      const r = cloneRules(PRESETS.VEGAS_STRIP_6D!)
      r.decks = decks
      expect(Math.abs(houseEdge(r) - published), `${decks} decks`).toBeLessThan(0.0003)
    }
  })
})
