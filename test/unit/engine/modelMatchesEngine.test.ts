import { describe, expect, it } from 'vitest'
import { bookPlay } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { BlackjackGame } from '../../../app/utils/engine/round'
import type { CardSource } from '../../../app/utils/engine/round'
import type { Card } from '../../../app/utils/engine/cards'

// The EV model and the engine must agree about what an action PAYS. They are separate code paths
// — the model prices, the engine settles — and nothing structural keeps them in step, so the
// agreement has to be asserted.
//
// This exists because it was broken: a change priced surrender under no-peek as
// `-0.5*(1-P(dealer natural)) + -1*P(dealer natural)` while round.ts kept settling a flat half.
// The model then rated Hit above Surrender on hands where surrendering genuinely returns more
// under this engine, so the trainer graded a correct surrender as a mistake and charged the
// player for it through decisionCost.

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

const c = (rank: number): Card => ({ rank, suit: 'spades' })

/** What the ENGINE actually returns for a surrender, in units of the original bet. */
function settledSurrender(rules: ReturnType<typeof cloneRules>, holeRank: number): number {
  const bet = rules.minBet // presets differ (Bally's is $15) and beginRound enforces table limits
  // hero 10,6 vs an ace up — surrenderable, and an ace up is where a no-peek natural is live
  const game = new BlackjackGame(rules, {
    shoe: new Stack([c(10), c(14), c(6), c(holeRank), c(9), c(9), c(9)])
  })
  game.beginRound([{ spotId: 0, mainBet: bet }])
  if (game.phase === 'insurance') {
    game.insuranceDecision(0, null)
    game.finishInsurance()
  }
  if (game.phase !== 'playerTurns') return NaN // dealer natural ended it at the peek
  game.act(0, 'surrender')
  return game.spots[0]!.hands[0]!.netResult / bet
}

describe('the model prices what the engine settles', () => {
  for (const dealerPeek of [true, false]) {
    it(`surrender is worth the same to both, peek=${dealerPeek}`, () => {
      const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
      rules.dealerPeek = dealerPeek
      rules.surrender = 'late'

      const priced = bookPlay(rules, 11, {
        total: 16, soft: false, twoCards: true, fromSplit: false, pair: null
      }).evs.surrender!

      // a hole that makes a natural, and one that does not — the engine must pay the model's
      // price in BOTH, or the price is an average of outcomes the player is graded against
      const withNatural = settledSurrender(rules, 13) // king: dealer has blackjack
      const withoutNatural = settledSurrender(rules, 5)

      expect(withoutNatural, 'no natural').toBeCloseTo(priced, 10)
      if (Number.isFinite(withNatural)) {
        expect(withNatural, 'dealer natural — model and engine must not disagree here')
          .toBeCloseTo(priced, 10)
      }
    })
  }

  it('a surrendered hand always returns exactly half under these rules', () => {
    for (const preset of Object.values(PRESETS)) {
      const rules = cloneRules(preset)
      rules.surrender = 'late'
      for (const dealerPeek of [true, false]) {
        rules.dealerPeek = dealerPeek
        for (const hole of [13, 5]) {
          const net = settledSurrender(rules, hole)
          if (Number.isFinite(net)) {
            expect(net, `${rules.name} peek=${dealerPeek} hole=${hole}`).toBeCloseTo(-0.5, 10)
          }
        }
      }
    }
  })
})
