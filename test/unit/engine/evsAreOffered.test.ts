import { describe, expect, it } from 'vitest'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { adviseHand } from '../../../app/utils/advisor'
import { legalActions, newHand } from '../../../app/utils/engine/hand'
import type { Card } from '../../../app/utils/engine/cards'
import type { Action } from '../../../app/utils/engine/hand'

// The advisor's EV table is rendered verbatim by AdvisorPanel (sorted descending, no filtering)
// and written into every DecisionRecord, which the store persists to localStorage and the history
// page renders forever. So it must not contain an action the table is not offering.
//
// Routing every pair through bestActionFull attaches `split: sEV` unconditionally. clampToLegal
// fixes the chosen ACTION but the EVs were passed through raw, so an unsplittable pair published a
// Split row — and buildReasoning picked it as the runner-up, printing
// "Hit: EV -53.5% beats split at -47.6%": an unavailable action, and the comparison backwards.

const UP: Card = { rank: 13, suit: 'clubs' } // ten

describe('the advisor never prices an action the table is not offering', () => {
  it('an unsplittable pair publishes no split EV', () => {
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    const cards: Card[] = [{ rank: 8, suit: 'spades' }, { rank: 8, suit: 'hearts' }]
    const legal = legalActions(newHand(cards, 1000), rules.maxSplitHands, rules) // at the cap
    expect(legal).not.toContain('split')

    const rec = adviseHand({ cards, fromSplit: false }, UP, rules, 0, false, legal)
    expect(Object.keys(rec.evs)).not.toContain('split')
    expect(rec.reasoning).not.toMatch(/split/i)
  })

  it('holds across every preset, pair and legality restriction', () => {
    const offenders: string[] = []
    for (const [key, base] of Object.entries(PRESETS)) {
      const rules = cloneRules(base)
      for (const rank of [2, 4, 6, 7, 8, 9, 12, 14]) {
        const cards: Card[] = [{ rank, suit: 'spades' }, { rank, suit: 'hearts' }]
        for (const legal of [
          ['hit', 'stand'] as Action[],
          ['hit', 'stand', 'double'] as Action[],
          legalActions(newHand(cards, 1000), 1, rules)
        ]) {
          const rec = adviseHand({ cards, fromSplit: false }, UP, rules, 0, false, legal)
          for (const action of Object.keys(rec.evs) as Action[]) {
            if (!legal.includes(action)) offenders.push(`${key} ${rank},${rank}: priced '${action}' with legal=[${legal}]`)
          }
        }
      }
    }
    expect(offenders, offenders.slice(0, 5).join('\n')).toEqual([])
  })

  it('the reasoning never names an action the player cannot take', () => {
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    const cards: Card[] = [{ rank: 8, suit: 'spades' }, { rank: 8, suit: 'hearts' }]
    const rec = adviseHand({ cards, fromSplit: true }, { rank: 6, suit: 'clubs' }, rules, 0, false,
      ['hit', 'stand'])
    expect(rec.reasoning).not.toMatch(/split|double|surrender/i)
  })
})
