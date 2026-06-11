import { describe, expect, it } from 'vitest'
import { BlackjackGame } from '../../../app/utils/engine/round'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { houseEdge } from '../../../app/utils/engine/basicStrategy'
import { decideFor } from '../../../app/utils/engine/bots'
import { isBlackjack } from '../../../app/utils/engine/hand'

const ROUNDS = 200_000
const BET = 1000 // cents

describe('simulation — perfect basic strategy vs computed house edge', () => {
  it(`empirical edge over ${ROUNDS} seeded rounds matches houseEdge() within 3σ + model slack`, () => {
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    const game = new BlackjackGame(rules, { seed: 12345 })

    let totalNet = 0
    let totalWagered = 0
    let playerBlackjacks = 0

    for (let i = 0; i < ROUNDS; i++) {
      game.beginRound([{ spotId: 0, mainBet: BET }])
      if (game.phase === 'insurance') {
        game.insuranceDecision(0, null) // book: never insure
        game.finishInsurance()
      }
      while (game.phase === 'playerTurns') {
        const spot = game.spots[0]!
        const hand = spot.hands[spot.activeHandIndex]!
        game.act(0, decideFor('bea', hand, spot.hands.length, game.dealerUp!, rules))
      }
      const spot = game.spots[0]!
      if (spot.hands.length === 1 && isBlackjack(spot.hands[0]!.cards, false)) playerBlackjacks++
      for (const hand of spot.hands) {
        totalNet += hand.netResult
        totalWagered += hand.bet
      }
    }

    // houseEdge() is expressed per ORIGINAL bet (doubles/splits contribute ±2 to that unit),
    // so normalize by rounds × base bet, not by total wagered.
    const empiricalEdge = -totalNet / (ROUNDS * BET)
    const theoreticalEdge = houseEdge(rules)
    expect(totalWagered).toBeGreaterThanOrEqual(ROUNDS * BET) // sanity: doubles/splits add stake

    // Per-round σ ≈ 1.15 bet units; on the wagered-normalized edge it shrinks ≈ 1/√n
    const sigma = 1.15 / Math.sqrt(ROUNDS)
    const tolerance = 3 * sigma + 0.001 // + fixed-composition model slack
    expect(Math.abs(empiricalEdge - theoreticalEdge), `empirical ${empiricalEdge}, theory ${theoreticalEdge}`)
      .toBeLessThan(tolerance)

    // Player blackjack frequency ≈ 4.75% (6 decks), generous ±0.3pp window
    const bjRate = playerBlackjacks / ROUNDS
    expect(bjRate).toBeGreaterThan(0.0445)
    expect(bjRate).toBeLessThan(0.0505)
  }, 60_000)
})
