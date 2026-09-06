import { describe, expect, it } from 'vitest'
import { decideFor, PERSONAS } from '../../../app/utils/engine/bots'
import { legalActions, newHand } from '../../../app/utils/engine/hand'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { BlackjackGame } from '../../../app/utils/engine/round'
import type { CardSource } from '../../../app/utils/engine/round'
import type { Card } from '../../../app/utils/engine/cards'
import type { Action } from '../../../app/utils/engine/hand'

// bookAction's "recommended action unavailable" fallback ranked only stand vs hit. When neither
// is legal — split aces with a resplit available give exactly ['split','stand'] (hand.ts:79) — it
// returned 'hit', which the table refuses. useGameLoop calls game.act() with no try/catch, so
// IllegalActionError escapes `void pump()` as an unhandled rejection: the bot never acts, the
// phase never advances, and the table wedges permanently.

const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
const upCard = (b: number): Card => ({ rank: b === 11 ? 14 : b === 10 ? 13 : b, suit: 'clubs' })
const acePair = (): Card[] => [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }]

describe('a bot never chooses an action the table refuses', () => {
  it('holds to every persona, preset, peek setting and split cap', () => {
    const illegal: string[] = []
    for (const [key, base] of Object.entries(PRESETS)) {
      for (const dealerPeek of [true, false]) {
        for (const surrender of ['none', 'late'] as const) {
          for (const maxSplitHands of [2, 3, 4] as const) {
            const rules = cloneRules(base)
            rules.dealerPeek = dealerPeek
            rules.maxSplitHands = maxSplitHands
            rules.resplitAces = true
            // late surrender + no-peek was briefly unreachable behind a validateRuleSet gate, which
            // also hid this hang path — every reproduced illegal action required dealerPeek:false.
            // The escrow fix removed that gate, so the guard has to cover the combination directly:
            // legality is what closes the hang, not the rule ban.
            rules.surrender = surrender
            for (const persona of PERSONAS) {
              for (const up of UPS) {
                for (const handCount of [2, 3]) {
                  const hand = newHand(acePair(), 1000, { fromSplit: true, splitAces: true })
                  const legal = legalActions(hand, handCount, rules)
                  if (legal.length < 2) continue
                  const chosen = decideFor(persona.id, hand, handCount, upCard(up), rules)
                  if (!legal.includes(chosen)) {
                    illegal.push(
                      `${key} peek=${dealerPeek} cap=${maxSplitHands} ${persona.id} up=${up}`
                      + ` hands=${handCount}: legal=[${legal}] chose '${chosen}'`)
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(illegal, `${illegal.length} illegal choices, e.g.\n${illegal.slice(0, 5).join('\n')}`)
      .toEqual([])
  })

  it('holds for ordinary pairs at the split cap, where split is unavailable', () => {
    const illegal: string[] = []
    for (const [key, base] of Object.entries(PRESETS)) {
      const rules = cloneRules(base)
      rules.maxSplitHands = 2 // already at the cap: split is not offered
      for (const persona of PERSONAS) {
        for (const rank of [2, 3, 4, 6, 7, 8, 9]) {
          for (const up of UPS) {
            const cards: Card[] = [{ rank, suit: 'spades' }, { rank, suit: 'hearts' }]
            const hand = newHand(cards, 1000)
            const legal = legalActions(hand, 2, rules)
            const chosen = decideFor(persona.id, hand, 2, upCard(up), rules)
            if (!legal.includes(chosen)) {
              illegal.push(`${key} ${persona.id} ${rank},${rank} v ${up}: legal=[${legal}] chose '${chosen}'`)
            }
          }
        }
      }
    }
    expect(illegal, illegal.slice(0, 5).join('\n')).toEqual([])
  })

  it('picks the best LEGAL action rather than defaulting to stand', () => {
    // three cards totalling 11: the book wants to double, which is illegal on three cards, and
    // hitting is clearly better than standing — the fallback must rank, not guess
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    const hand = newHand(
      [{ rank: 3, suit: 'spades' }, { rank: 4, suit: 'hearts' }, { rank: 4, suit: 'clubs' }], 1000)
    const legal = legalActions(hand, 1, rules)
    expect(legal).not.toContain('double')
    expect(decideFor('bea', hand, 1, upCard(6), rules)).toBe('hit')
  })
})

describe('the table cannot wedge on a bot decision', () => {
  class Stack implements CardSource {
    constructor(private stack: Card[]) {}
    draw(): Card {
      const c = this.stack.shift()
      if (!c) throw new Error('stacked shoe exhausted')
      return c
    }

    discard(): void {}
    needsShuffle(): boolean { return false }
    freshShoe(): void {}
    cardsRemaining(): number { return this.stack.length }
    decksRemaining(): number { return this.stack.length / 52 }
    estimatedDecksRemaining(): number { return 1 }
  }

  it('plays a resplit-aces hand to completion instead of throwing', () => {
    const rules = cloneRules(PRESETS.MA_205CMR!)
    rules.dealerPeek = false
    rules.resplitAces = true
    rules.maxSplitHands = 3
    const c = (rank: number): Card => ({ rank, suit: 'spades' })
    // bot: A,A vs ace up; splitting deals another ace, offering the resplit-or-stand choice
    const game = new BlackjackGame(rules, {
      shoe: new Stack([c(14), c(14), c(14), c(14), c(14), c(9), c(9), c(9), c(9), c(9), c(9)])
    })
    game.beginRound([{ spotId: 0, mainBet: 1000 }])
    if (game.phase === 'insurance') {
      game.insuranceDecision(0, null)
      game.finishInsurance()
    }
    let guard = 0
    while (game.phase === 'playerTurns' && guard++ < 40) {
      const spot = game.spots[0]!
      const hand = spot.hands[spot.activeHandIndex]!
      const action = decideFor('bea', hand, spot.hands.length, game.dealerUp!, rules)
      expect(game.legalFor(0), `chose '${action}' from [${game.legalFor(0)}]`).toContain(action)
      game.act(0, action as Action)
    }
    expect(game.phase, 'the round must settle, not wedge').toBe('complete')
  })
})
