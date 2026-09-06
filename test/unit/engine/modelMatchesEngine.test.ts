import { describe, expect, it } from 'vitest'
import { bookPlay, dealerDistribution, evalContext } from '../../../app/utils/engine/basicStrategy'
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
  it('a peeked surrender is a flat half, in both the model and the engine', () => {
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.dealerPeek = true
    rules.surrender = 'late'
    const priced = bookPlay(rules, 11, {
      total: 16, soft: false, twoCards: true, fromSplit: false, pair: null
    }).evs.surrender!
    expect(priced).toBeCloseTo(-0.5, 12)
    for (const hole of [13, 5]) {
      const net = settledSurrender(rules, hole)
      if (Number.isFinite(net)) expect(net, `hole ${hole}`).toBeCloseTo(priced, 12)
    }
  })

  it('a no-peek surrender is priced as the EXPECTATION of the two settlements', () => {
    // The engine can settle a held surrender two ways — full wager to a natural, half otherwise —
    // so the model's single number must be the probability-weighted blend of exactly those two.
    // Asserting equality with either one alone is what let a flat -0.5 diverge from the engine.
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.dealerPeek = false
    rules.surrender = 'late'

    const pNatural = dealerDistribution(evalContext(rules, 11), false).blackjack
    expect(pNatural, 'an ace up must leave a live natural under no-peek').toBeGreaterThan(0)

    const withNatural = settledSurrender(rules, 13)
    const withoutNatural = settledSurrender(rules, 5)
    expect(withNatural, 'a natural takes the whole wager (MA §8)').toBeCloseTo(-1, 12)
    expect(withoutNatural).toBeCloseTo(-0.5, 12)

    const priced = bookPlay(rules, 11, {
      total: 16, soft: false, twoCards: true, fromSplit: false, pair: null
    }).evs.surrender!
    const expected = pNatural * withNatural + (1 - pNatural) * withoutNatural
    expect(priced, 'the price is the blend of what the engine can actually do')
      .toBeCloseTo(expected, 12)
  })

  it('holds across presets and both peek settings', () => {
    for (const preset of Object.values(PRESETS)) {
      const rules = cloneRules(preset)
      rules.surrender = 'late'
      for (const dealerPeek of [true, false]) {
        rules.dealerPeek = dealerPeek
        const natural = settledSurrender(rules, 13)
        const plain = settledSurrender(rules, 5)
        if (Number.isFinite(plain)) expect(plain, `${rules.name} peek=${dealerPeek}`).toBeCloseTo(-0.5, 12)
        if (Number.isFinite(natural)) {
          expect(natural, `${rules.name} peek=${dealerPeek} vs a natural`)
            .toBeCloseTo(dealerPeek ? -0.5 : -1, 12)
        }
      }
    }
  })
})
