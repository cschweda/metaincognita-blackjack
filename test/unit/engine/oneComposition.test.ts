import { describe, expect, it } from 'vitest'
import { bookPlay, contextForHand, evalContext, generateChart, houseEdge } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { adviseHand } from '../../../app/utils/advisor'
import type { Bucket, Card } from '../../../app/utils/engine/cards'
import type { Action } from '../../../app/utils/engine/hand'

const UP: Bucket[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const ALL_ACTIONS: Action[] = ['hit', 'stand', 'double', 'split', 'surrender']

// Round four's first cut threaded composition as an optional trailing argument through seven
// exported functions and re-derived the same pair/non-pair branch at six call sites. They drifted:
// the chart's pair row and hard row priced the same total differently, and the advisor graded a
// hand differently depending on whether Split happened to be legal. Composition is now a value
// (EvalContext) resolved once by contextForHand, and every surface goes through bookPlay.
// These tests exist to keep it that way.

describe('one composition per decision', () => {
  it('contextForHand always removes the upcard, and the pair only for a pair row', () => {
    const rules = PRESETS.VEGAS_STRIP_6D!
    expect([...contextForHand(rules, 10, null).known]).toEqual([10])
    expect([...contextForHand(rules, 10, 8).known]).toEqual([10, 8, 8])
  })

  it('gives the same context the same cache identity regardless of argument order', () => {
    const rules = PRESETS.VEGAS_STRIP_6D!
    expect(evalContext(rules, 10, [8, 3]).key).toBe(evalContext(rules, 10, [3, 8]).key)
  })

  it('separates compositions that differ', () => {
    const rules = PRESETS.VEGAS_STRIP_6D!
    expect(evalContext(rules, 10, [8, 8]).key).not.toBe(evalContext(rules, 10).key)
  })
})

describe('the advisor and the published chart never disagree', () => {
  // The chart is what the app tells you to do; the advisor is what it grades you against. If they
  // can differ on the same hand, the trainer marks a correct play wrong.
  const cardsFor = (total: number, soft: boolean): Card[] => soft
    ? [{ rank: 14, suit: 'spades' }, { rank: total - 11, suit: 'hearts' }]
    : [{ rank: 10, suit: 'spades' }, { rank: total - 10, suit: 'hearts' }]

  for (const presetKey of ['VEGAS_STRIP_6D', 'MA_205CMR', 'SINGLE_DECK_65'] as const) {
    it(`${presetKey}: every hard and soft cell matches the advisor`, () => {
      const rules = PRESETS[presetKey]!
      const chart = generateChart(rules)
      for (let total = 12; total <= 20; total++) {
        for (const up of UP) {
          const rec = adviseHand(
            { cards: cardsFor(total, false), fromSplit: false },
            { rank: up === 11 ? 14 : up === 10 ? 13 : up, suit: 'clubs' },
            rules, 0, false, ALL_ACTIONS)
          const cell = chart.hard[total]![up]
          const chartAction = cell === 'P'
            ? 'split'
            : cell.startsWith('R') ? 'surrender' : cell.startsWith('D') ? 'double' : cell === 'S' ? 'stand' : 'hit'
          expect(rec.book, `${presetKey} hard ${total} v ${up}`).toBe(chartAction)
        }
      }
    })

    it(`${presetKey}: every pair cell matches the advisor`, () => {
      const rules = PRESETS[presetKey]!
      const chart = generateChart(rules)
      for (const pair of UP) {
        for (const up of UP) {
          const rank = pair === 11 ? 14 : pair === 10 ? 12 : pair
          const rec = adviseHand(
            { cards: [{ rank, suit: 'spades' }, { rank, suit: 'hearts' }], fromSplit: false },
            { rank: up === 11 ? 14 : up === 10 ? 13 : up, suit: 'clubs' },
            rules, 0, false, ALL_ACTIONS)
          const cell = chart.pairs[pair]![up]
          const chartAction = cell === 'P'
            ? 'split'
            : cell.startsWith('R') ? 'surrender' : cell.startsWith('D') ? 'double' : cell === 'S' ? 'stand' : 'hit'
          expect(rec.book, `${presetKey} ${pair},${pair} v ${up}`).toBe(chartAction)
        }
      }
    })
  }
})

describe('houseEdge prices the strategy the app actually teaches', () => {
  it('chooses every play through bookPlay, the same call the chart makes', () => {
    // A regression here means the advertised preset edge belongs to a player the app never
    // trains. Pinned by value: these are the published-comparable figures.
    expect(houseEdge(PRESETS.VEGAS_STRIP_6D!)).toBeCloseTo(0.0040, 3)
    expect(houseEdge(PRESETS.MA_205CMR!)).toBeCloseTo(0.0036, 3)
  })

  it('stays monotonic in deck count after the refactor', () => {
    const edges = ([1, 2, 4, 6, 8] as const).map((decks) => {
      const r = cloneRules(PRESETS.VEGAS_STRIP_6D!)
      r.decks = decks
      return houseEdge(r)
    })
    for (let i = 1; i < edges.length; i++) expect(edges[i]!).toBeGreaterThan(edges[i - 1]!)
  })
})

describe('bookPlay is the single entry point', () => {
  it('a pair hand and the same total as a non-pair are allowed to differ — deliberately', () => {
    // This is composition-dependent play, not drift: a pair row legitimately knows two cards.
    // The chart footnote says so. What must NOT happen is the two disagreeing by accident, which
    // is what the tests above pin.
    const rules = PRESETS.SINGLE_DECK_65!
    const asPair = bookPlay(rules, 5, { total: 8, soft: false, twoCards: true, fromSplit: false, pair: 4 })
    const asTotal = bookPlay(rules, 5, { total: 8, soft: false, twoCards: true, fromSplit: false, pair: null })
    expect(asPair.evs.hit).not.toBeCloseTo(asTotal.evs.hit!, 9)
  })
})

describe('legality never changes how a hand is priced', () => {
  // The first cut of this refactor keyed the composition off `isPair && legal.includes('split')`,
  // so the same two cards were graded against two different shoes depending on the bankroll or
  // the split cap. Review caught it BECAUSE the test above always passes ALL_ACTIONS and so never
  // reaches a restricted-legality hand. These do.
  const pairCards = (rank: number): Card[] => [
    { rank, suit: 'spades' }, { rank, suit: 'hearts' }
  ]
  const upCard = (up: Bucket): Card => ({ rank: up === 11 ? 14 : up === 10 ? 13 : up, suit: 'clubs' })

  for (const presetKey of ['VEGAS_STRIP_6D', 'SINGLE_DECK_65'] as const) {
    it(`${presetKey}: the same pair grades identically with and without Split available`, () => {
      const rules = PRESETS[presetKey]!
      for (const rank of [4, 6, 7, 8, 9]) {
        for (const up of UP) {
          const hand = { cards: pairCards(rank), fromSplit: false }
          const withSplit = adviseHand(hand, upCard(up), rules, 0, false, ALL_ACTIONS)
          const noSplit = adviseHand(
            hand, upCard(up), rules, 0, false,
            ALL_ACTIONS.filter(a => a !== 'split'))
          // the recommended play may legitimately differ (split is unavailable) — the PRICING
          // must not: identical cards, identical shoe, identical EVs
          expect(noSplit.evs.stand, `${presetKey} ${rank},${rank} v ${up} stand`)
            .toBeCloseTo(withSplit.evs.stand!, 12)
          expect(noSplit.evs.hit, `${presetKey} ${rank},${rank} v ${up} hit`)
            .toBeCloseTo(withSplit.evs.hit!, 12)
        }
      }
    })
  }

  it('a pair the player cannot split is still priced as the pair it is', () => {
    // 4,4 v 5 at one deck with DAS off: the published single-deck book doubles the hard 8.
    // Reading it as an anonymous total loses that, which is what legality-keyed pricing did.
    const rules = PRESETS.SINGLE_DECK_65!
    const noSplit = adviseHand(
      { cards: pairCards(4), fromSplit: false }, upCard(5), rules, 0, false,
      ['hit', 'stand', 'double'])
    expect(noSplit.book).toBe('double')
  })
})

describe('split is priced at the depth the spot has actually reached', () => {
  // bestActionFull gained a `flags` parameter so it would stop hardcoding the caller's reality,
  // but its split half kept taking splitEV's `handsFormed = 2` default — so a player on their
  // fourth hand was shown a resplit ladder that no longer exists, and decisionCost charged the
  // mistake against the inflated number (round-five review).
  it('a later split hand is worth less than the first', () => {
    const rules = PRESETS.VEGAS_STRIP_6D!
    const at = (handsFormed: number) => bookPlay(rules, 6, {
      total: 16, soft: false, twoCards: true, fromSplit: handsFormed > 2, pair: 8, handsFormed
    }).evs.split!
    expect(at(2)).toBeGreaterThan(at(3))
    expect(at(3)).toBeGreaterThan(at(4))
    // measured: 0.40567 / 0.39625 / 0.32735 — nearly 8 EV points between first and fourth
    expect(at(2) - at(4)).toBeGreaterThan(0.07)
  })

  it('defaults to the first split when the caller does not know', () => {
    const rules = PRESETS.VEGAS_STRIP_6D!
    const explicit = bookPlay(rules, 6, {
      total: 16, soft: false, twoCards: true, fromSplit: false, pair: 8, handsFormed: 2
    }).evs.split
    const implied = bookPlay(rules, 6, {
      total: 16, soft: false, twoCards: true, fromSplit: false, pair: 8
    }).evs.split
    expect(implied).toBeCloseTo(explicit!, 12)
  })
})
