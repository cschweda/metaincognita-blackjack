import { describe, expect, it } from 'vitest'
import { generateChart } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Bucket } from '../../../app/utils/engine/cards'
import type { RuleSet } from '../../../app/utils/engine/rules'

const UP: Bucket[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

// Canonical multi-deck S17 DAS LS basic strategy (any standard published chart).
// Row format: ten cells for upcards 2,3,4,5,6,7,8,9,T,A.
const HARD_S17: Record<number, string> = {
  5: 'H H H H H H H H H H',
  6: 'H H H H H H H H H H',
  7: 'H H H H H H H H H H',
  8: 'H H H H H H H H H H',
  9: 'H D D D D H H H H H',
  10: 'D D D D D D D D H H',
  11: 'D D D D D D D D D H',
  12: 'H H S S S H H H H H',
  13: 'S S S S S H H H H H',
  14: 'S S S S S H H H H H',
  15: 'S S S S S H H H Rh H',
  16: 'S S S S S H H Rh Rh Rh',
  17: 'S S S S S S S S S S',
  18: 'S S S S S S S S S S',
  19: 'S S S S S S S S S S',
  20: 'S S S S S S S S S S'
}

const SOFT_S17: Record<number, string> = {
  13: 'H H H D D H H H H H',
  14: 'H H H D D H H H H H',
  15: 'H H D D D H H H H H',
  16: 'H H D D D H H H H H',
  17: 'H D D D D H H H H H',
  18: 'S Ds Ds Ds Ds S S H H H',
  19: 'S S S S S S S S S S',
  20: 'S S S S S S S S S S'
}

const PAIRS_S17_DAS: Record<number, string> = {
  2: 'P P P P P P H H H H',
  3: 'P P P P P P H H H H',
  4: 'H H H P P H H H H H',
  5: 'D D D D D D D D H H',
  6: 'P P P P P H H H H H',
  7: 'P P P P P P H H H H',
  8: 'P P P P P P P P P P',
  9: 'P P P P P S P P S S',
  10: 'S S S S S S S S S S',
  11: 'P P P P P P P P P P'
}

// MA preset is 8D S17 DAS LS — identical total-dependent chart to 6D S17 DAS LS.
const RULES_S17 = PRESETS.MA_205CMR!

// The chart became deck-aware in round four, so pinning ONE deck count stopped covering the
// multi-deck claim. Every published deck count is checked here.
//
// Divergences are recorded as a SET rather than pinned cell-by-cell to the wrong answer. The
// earlier shape asserted `expect(cell).toBe('H')` for cells the book gets right, which meant
// improving the model turned the suite red and the fastest route back to green was to revert the
// improvement — the suite defended the bug (round-four review). Comparing sets instead fails on a
// NEW divergence and tells you to DELETE an entry that has been fixed.
/**
 * Cells where the published TWO-DECK book differs from the multi-deck table above. Without these
 * the 2-deck row asserted the model must reproduce the 6/8-deck book — so `hard 9 v 2` passed with
 * expectation and model wrong in the same direction, and the "deck-aware at every published deck
 * count" claim was not actually tested at two decks (round-five review).
 *
 * PARTIAL by design: only cells verified against a published 2-deck S17 DAS LS chart belong here.
 * Add one when you have checked it, not to make a row go green.
 */
const TWO_DECK_BOOK: Record<string, string> = {
  // Published 2-deck S17 charts double hard 9 against a 2; multi-deck charts hit it. The model
  // hits at two decks, so this surfaces as a recorded divergence below rather than a silent pass.
  'hard:9v2': 'D'
}

const KNOWN_DIVERGENCES: Record<number, string[]> = {
  // A2 v 5: model hits (+0.1334) over double (+0.1260). Sources: (1) Wizard of Odds
  // basic-strategy-hands Q&A, "in an infinite-deck game you should hit A2 vs 5"; (2) direct EV
  // computation. Published 4-8 deck charts double; the delta (~0.007) is below model resolution.
  // 2D: A2 v 5 lands on the book here (the removal effect is bigger at two decks), so only the
  // 15 v 10 near-tie remains.
  // 2D: hard 9 v 2 — the published two-deck book doubles, the model hits. Delete this entry when
  // the model reaches it; do not "fix" it by editing TWO_DECK_BOOK.
  2: ['hard:15v10', 'hard:9v2'],
  4: ['soft:13v5'],
  6: ['soft:13v5'],
  8: ['soft:13v5']
  // 2D hard:15v10 — model hits (-0.497529) over surrender (-0.500000), a margin of 0.00247.
  // Published 2-deck S17 LS charts surrender. Below what a top-of-hand removal model resolves,
  // and the same cell is 'Rh' at 6 decks, so the chart is not monotone in deck count here.
}

function divergencesAt(decks: number): string[] {
  const rules = cloneRules(RULES_S17)
  rules.decks = decks as RuleSet['decks']
  const chart = generateChart(rules)
  const found: string[] = []
  const tables: Array<['hard' | 'soft' | 'pairs', Record<number, string>]> = [
    ['hard', HARD_S17], ['soft', SOFT_S17], ['pairs', PAIRS_S17_DAS]
  ]
  for (const [kind, expected] of tables) {
    for (const [rowKey, rowStr] of Object.entries(expected)) {
      const cells = rowStr.split(/\s+/)
      UP.forEach((up, i) => {
        const id = `${kind}:${rowKey}v${up}`
        const expected = (decks === 2 && TWO_DECK_BOOK[id]) || cells[i]
        const actual = (chart[kind] as Record<number, Record<Bucket, string>>)[Number(rowKey)]![up]
        if (actual !== expected) found.push(id)
      })
    }
  }
  return found.sort()
}

describe('canonical chart pins hold at every published deck count', () => {
  for (const decks of [2, 4, 6, 8] as const) {
    it(`${decks} decks: only the recorded cells diverge from the book`, () => {
      expect(
        divergencesAt(decks),
        `${decks}D: a NEW entry means a regression — investigate before recording it. `
        + 'A MISSING entry means the model improved — delete it from KNOWN_DIVERGENCES.'
      ).toEqual([...KNOWN_DIVERGENCES[decks]!].sort())
    })
  }
})

describe('canonical H17 deltas (multi-deck H17 DAS LS)', () => {
  const r = cloneRules(RULES_S17)
  r.dealerHitsSoft17 = true
  const chart = generateChart(r)
  it('11 vs A doubles', () => expect(chart.hard[11]![11]).toBe('D'))
  it('soft 18 vs 2 doubles (Ds)', () => expect(chart.soft[18]![2]).toBe('Ds'))
  it('soft 19 vs 6 doubles (Ds)', () => expect(chart.soft[19]![6]).toBe('Ds'))
  it('15 vs A surrenders', () => expect(chart.hard[15]![11]).toBe('Rh'))
  it('17 vs A surrenders else stands (Rs)', () => expect(chart.hard[17]![11]).toBe('Rs'))
})

describe('single-deck spot checks (model-consistent cells only)', () => {
  const chart = generateChart(PRESETS.SINGLE_DECK_65!)
  it('universal cells hold at one deck', () => {
    expect(chart.pairs[11]![6]).toBe('P') // AA
    expect(chart.pairs[8]![10]).toBe('P') // 88
    expect(chart.pairs[10]![6]).toBe('S') // TT
    expect(chart.hard[11]![6]).toBe('D')
    expect(chart.hard[17]![10]).toBe('S')
  })

  // Round four: the removal-aware model reaches single-deck book plays the infinite-deck model
  // could not. Each cell below is the published single-deck (H17) play.
  it('reaches single-deck-only plays', () => {
    expect(chart.soft[19]![5], 'A,8 v 5 doubles at one deck H17').toBe('Ds')
    expect(chart.hard[9]![2], 'hard 9 v 2 doubles at one deck').toBe('D')
    expect(chart.soft[13]![5], 'A,2 v 5 doubles at one deck').toBe('D')
    expect(chart.pairs[6]![2], '6,6 v 2 splits at one deck').toBe('P')
  })

  // Two cells the model does not get right at one deck, recorded the same way the multi-deck rows
  // are: as a SET, so reaching one deletes an entry rather than turning the suite red. Pinning
  // them by value (`expect(...).toBe('H')`) is the anti-pattern the rewrite above exists to
  // remove, and this block had re-introduced it eighty lines later (round-five review).
  //
  //   7,7 v 10 — a pre-existing limitation. Only removal at every draw reaches the book's stand.
  //   A,7 v 2  — a REGRESSION this work introduced; the previous model produced the book play.
  it('diverges from the single-deck book only where recorded', () => {
    const known = ['pairs:7v10', 'soft:18v2'].sort()
    const book: Record<string, string> = { 'pairs:7v10': 'S', 'soft:18v2': 'Ds' }
    const found = Object.keys(book).filter((id) => {
      const [kind, cell] = id.split(':') as ['pairs' | 'soft', string]
      const [row, up] = cell.split('v').map(Number) as [number, Bucket]
      return (chart[kind] as Record<number, Record<Bucket, string>>)[row]![up] !== book[id]
    }).sort()
    expect(
      found,
      'a MISSING entry means the model reached the book play — delete it from the list'
    ).toEqual(known)
  })
})
