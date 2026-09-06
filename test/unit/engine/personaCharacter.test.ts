import { describe, expect, it } from 'vitest'
import { decideFor } from '../../../app/utils/engine/bots'
import { legalActions, newHand } from '../../../app/utils/engine/hand'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Card } from '../../../app/utils/engine/cards'

// The legality clamp must not turn a persona into a different player. Split-aces-with-resplit is
// the ONLY hand where the clamp ever fires — hit and stand are legal on every other multi-action
// hand — so it exists for exactly one case and has to get that case's character right.
//
// Routing an out-of-character preference to the BOOK's best legal action made Mimic-the-Dealer
// Mike split aces, when the whole premise is that he plays like the dealer and the dealer never
// splits. 'stand' was legal, in character, and cures the wedge equally well.

const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
const upCard = (b: number): Card => ({ rank: b === 11 ? 14 : b === 10 ? 13 : b, suit: 'clubs' })
const aces = (): Card[] => [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }]

describe('the clamp preserves persona character', () => {
  const splitAcesRules = () => {
    const rules = cloneRules(PRESETS.MA_205CMR!)
    rules.resplitAces = true
    rules.maxSplitHands = 4
    return rules
  }

  it('Mike never splits — the dealer never splits', () => {
    const rules = splitAcesRules()
    for (const up of UPS) {
      const hand = newHand(aces(), 1000, { fromSplit: true, splitAces: true })
      const legal = legalActions(hand, 2, rules)
      expect(legal).toEqual(['split', 'stand'])
      expect(decideFor('mike', hand, 2, upCard(up), rules), `Mike vs ${up}`).toBe('stand')
    }
  })

  it('Nancy never splits either — splitting risks a hand she would not risk', () => {
    const rules = splitAcesRules()
    for (const up of UPS) {
      const hand = newHand(aces(), 1000, { fromSplit: true, splitAces: true })
      expect(decideFor('nancy', hand, 2, upCard(up), rules), `Nancy vs ${up}`).toBe('stand')
    }
  })

  it('the book players still take the book play', () => {
    const rules = splitAcesRules()
    for (const id of ['bea', 'ivan'] as const) {
      const hand = newHand(aces(), 1000, { fromSplit: true, splitAces: true })
      expect(decideFor(id, hand, 2, upCard(6), rules), `${id} resplits aces`).toBe('split')
    }
  })

  it('Mike still mimics the dealer wherever the table allows it', () => {
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    // hard 16 — the dealer draws, so Mike draws
    const soft = newHand([{ rank: 10, suit: 'spades' }, { rank: 6, suit: 'hearts' }], 1000)
    expect(decideFor('mike', soft, 1, upCard(10), rules)).toBe('hit')
    // hard 18 — the dealer stands, so Mike stands
    const high = newHand([{ rank: 10, suit: 'spades' }, { rank: 8, suit: 'hearts' }], 1000)
    expect(decideFor('mike', high, 1, upCard(10), rules)).toBe('stand')
  })
})
