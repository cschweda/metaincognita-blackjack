import { describe, expect, it } from 'vitest'
import { BlackjackGame, IllegalActionError } from '../../../app/utils/engine/round'
import type { CardSource } from '../../../app/utils/engine/round'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })

/** Deals scripted cards in order; deal sequence is spot1,spot2,...,dealerUp,spot1,...,dealerHole (MA §6(d)). */
class StackedShoe implements CardSource {
  constructor(private stack: Card[]) {}

  draw(): Card {
    if (!this.stack.length) throw new Error('stack exhausted')
    return this.stack.shift()!
  }

  discard(): void {}

  needsShuffle(): boolean { return false }

  freshShoe(): void {}

  cardsRemaining(): number { return this.stack.length }

  estimatedDecksRemaining(): number { return 1 }

  decksRemaining(): number { return this.stack.length / 52 }
}

const RULES = (() => {
  const r = cloneRules(PRESETS.MA_205CMR!) // 3:2, LS, insurance, even money
  r.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return r
})()

function game(stack: Card[], rules = RULES) {
  return new BlackjackGame(rules, { shoe: new StackedShoe(stack) })
}

describe('BlackjackGame — round flow', () => {
  it('deals in MA §6(d) order and reaches playerTurns', () => {
    // hero 10,9 (19); dealer up 7, hole 10 (17)
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs')])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.phase).toBe('playerTurns')
    expect(g.spots[0]!.hands[0]!.cards.map(x => x.rank)).toEqual([10, 9])
    expect(g.dealerUp!.rank).toBe(7)
    expect(g.holeRevealed).toBe(false)
  })

  it('settles a simple win 1:1 and a push as void (MA §3(b),(e))', () => {
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs')]) // 19 vs 17
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'stand')
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1000)

    const push = game([c(10), c(7, 'hearts'), c(7), c(10, 'clubs')]) // 17 vs 17
    push.beginRound([{ spotId: 0, mainBet: 1000 }])
    push.act(0, 'stand')
    expect(push.spots[0]!.hands[0]!.netResult).toBe(0)
  })

  it('pays blackjack 3:2 immediately when dealer shows 2-9 (MA §7(a))', () => {
    const g = game([c(14), c(9, 'hearts'), c(13), c(5, 'clubs'), c(10), c(2)]) // hero A,K; dealer 9,5,+draws
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1500)
    expect(g.phase).toBe('complete') // lone BJ hand → dealer needn't draw for outcome? buster off, no live hands → MA §12(c)
  })

  it('pays 6:5 when configured', () => {
    const r = cloneRules(RULES)
    r.blackjackPayout = '6:5'
    r.evenMoneyOffered = false
    const g = game([c(14), c(9, 'hearts'), c(13), c(5, 'clubs')], r)
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1200)
  })

  it('dealer blackjack beats 21-in-three but pushes a player blackjack (MA §3(a)(3),(b))', () => {
    // hero 7,7 hits 7 → 21; dealer A,10 = BJ. Insurance declined.
    const g = game([c(7), c(14, 'hearts'), c(7, 'clubs'), c(10, 'clubs')])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.phase).toBe('insurance')
    g.insuranceDecision(0, null)
    g.finishInsurance()
    expect(g.phase).toBe('complete') // peek found BJ; hand never acts
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-1000)
  })
})

describe('BlackjackGame — insurance & even money (MA §9, §7(c))', () => {
  it('insurance pays 2:1 on dealer BJ; max half the wager (MA §9(b))', () => {
    const g = game([c(10), c(14, 'hearts'), c(9), c(13, 'clubs')]) // 19 vs dealer BJ
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.phase).toBe('insurance')
    expect(() => g.insuranceDecision(0, 600)).toThrow(IllegalActionError)
    g.insuranceDecision(0, 500)
    g.finishInsurance()
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-1000)
    expect(g.spots[0]!.insuranceNet).toBe(1000) // 500 at 2:1
  })

  it('losing insurance is collected before play continues (MA §9(d))', () => {
    const g = game([c(10), c(14, 'hearts'), c(9), c(9, 'clubs')]) // dealer A,9 — no BJ
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.insuranceDecision(0, 500)
    g.finishInsurance()
    expect(g.phase).toBe('playerTurns')
    expect(g.spots[0]!.insuranceNet).toBe(-500)
  })

  it('even money pays 1:1 immediately for BJ vs ace (MA §7(c))', () => {
    const g = game([c(14), c(14, 'hearts'), c(13), c(13, 'clubs')]) // hero BJ vs dealer A,K (BJ!)
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.insuranceDecision(0, 'even-money')
    g.finishInsurance()
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1000) // immune to the dealer BJ
  })
})

describe('BlackjackGame — player actions', () => {
  it('double draws exactly one card and doubles the stake (MA §10)', () => {
    // hero 6,5; dealer up 9, hole 8 (17); double card 10 → 21
    const g = game([c(6), c(9, 'hearts'), c(5), c(8, 'clubs'), c(10)])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'double')
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(2000) // doubled stake of 2000 wins 1:1
  })

  it('split deals each hand in order; split aces get one card (MA §11)', () => {
    // hero 8,8 → split; hand1 gets 3 (11), double gets 10 (21); hand2 gets 10 (18) stand
    // dealer up 6, hole 10, draws 5 → 21? 6+10+5=21 — choose hole 10 draw 2 → 18
    const g = game([c(8), c(6, 'hearts'), c(8, 'clubs'), c(10, 'clubs'), c(3), c(10), c(10, 'diamonds'), c(2, 'hearts')])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'split')
    expect(g.spots[0]!.hands).toHaveLength(2)
    g.act(0, 'double') // hand 1: 8+3 → 21
    g.act(0, 'stand') // hand 2: 8+10
    expect(g.phase).toBe('complete')
    // dealer: 6,10,2 = 18 → hand1 (21, 2000 staked) wins 2000; hand2 (18) pushes
    expect(g.spots[0]!.hands[0]!.netResult).toBe(2000)
    expect(g.spots[0]!.hands[1]!.netResult).toBe(0)
  })

  it('surrender forfeits half and ends the hand (MA §8)', () => {
    const g = game([c(10), c(13, 'hearts'), c(6), c(9, 'clubs')]) // 16 vs K... up K peeks: hole 9, no BJ
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'surrender')
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-500)
  })

  it('throws IllegalActionError on actions outside legalActions', () => {
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs'), c(5)])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(() => g.act(0, 'split')).toThrow(IllegalActionError) // 10,9 is no pair
    g.act(0, 'stand')
    expect(() => g.act(0, 'hit')).toThrow(IllegalActionError) // round complete
  })

  it('busting forfeits immediately and dealer skips drawing when nothing remains (MA §12(c))', () => {
    const g = game([c(10), c(7, 'hearts'), c(6), c(10, 'clubs'), c(10, 'diamonds')])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'hit') // 16 + 10 = bust
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-1000)
    expect(g.dealerCards).toHaveLength(2) // no draw — outcome could not be affected
  })
})

describe('BlackjackGame — events', () => {
  it('emits visible-card events for face-up cards only, hole on reveal', () => {
    const seen: string[] = []
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs'), c(5)])
    g.on((e) => {
      if (e.type === 'count-visible-card') seen.push(`${e.card.rank}`)
    })
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(seen).toEqual(['10', '7', '9']) // hole not yet visible
    g.act(0, 'stand')
    expect(seen).toContain('10') // hole revealed at dealer turn
    expect(seen.length).toBeGreaterThanOrEqual(4)
  })
})

describe('BlackjackGame — review fixes', () => {
  it('even money and insurance are mutually exclusive and revocable (MA §7(c))', () => {
    const g = game([c(14), c(14, 'hearts'), c(13), c(13, 'clubs')]) // hero BJ vs dealer A,K
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.insuranceDecision(0, 'even-money')
    g.insuranceDecision(0, 500) // switching to insurance revokes even money
    expect(g.spots[0]!.tookEvenMoney).toBe(false)
    expect(g.spots[0]!.insuranceBet).toBe(500)
    g.insuranceDecision(0, 'even-money') // switching back clears the insurance bet
    expect(g.spots[0]!.tookEvenMoney).toBe(true)
    expect(g.spots[0]!.insuranceBet).toBeNull()
    g.insuranceDecision(0, null) // declining clears both
    expect(g.spots[0]!.tookEvenMoney).toBe(false)
    expect(g.spots[0]!.insuranceBet).toBeNull()
    g.finishInsurance()
    expect(g.spots[0]!.hands[0]!.netResult).toBe(0) // BJ vs dealer BJ: standoff, no even money taken
  })

  it('busting emits a hand-settled event', () => {
    const settled: Array<{ outcome: string, net: number }> = []
    const g = game([c(10), c(7, 'hearts'), c(6), c(10, 'clubs'), c(10, 'diamonds')])
    g.on((e) => {
      if (e.type === 'hand-settled') settled.push({ outcome: e.outcome, net: e.net })
    })
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'hit') // 16 + 10 = bust
    expect(settled).toEqual([{ outcome: 'lose', net: -1000 }])
  })

  it('surrendering emits a hand-settled event', () => {
    const settled: string[] = []
    const g = game([c(10), c(13, 'hearts'), c(6), c(9, 'clubs')])
    g.on((e) => {
      if (e.type === 'hand-settled') settled.push(e.outcome)
    })
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'surrender')
    expect(settled).toEqual(['surrender'])
  })
})

describe('BlackjackGame — side bets through the round', () => {
  const SIDE_RULES = (() => {
    const r = cloneRules(PRESETS.MA_205CMR!)
    r.sideBets = { twentyOnePlusThree: 'MA-B', luckyLadies: 'MA-A', matchTheDealer: true, buster: 'A' }
    return r
  })()

  it('Buster loses to dealer blackjack (MA §27(d))', () => {
    // hero 10,9; dealer A(up),K(hole) → dealer BJ; hero has buster 500
    // Stack: spot0-c1=10, dealer-up=A♥, spot0-c2=9, dealer-hole=K♣
    const g = game([c(10), c(14, 'hearts'), c(9), c(13, 'clubs')], SIDE_RULES)
    const sideBetEvents: Array<{ net: number, result: { name: string, win: boolean } }> = []
    g.on((e) => {
      if (e.type === 'side-bet-settled') sideBetEvents.push({ net: e.net, result: e.result })
    })
    g.beginRound([{ spotId: 0, mainBet: 1000, sideBets: { buster: 500 } }])
    expect(g.phase).toBe('insurance')
    g.insuranceDecision(0, null) // decline insurance
    g.finishInsurance()
    expect(g.phase).toBe('complete')
    // Buster must have been settled (loses because dealer has BJ per MA §27(d))
    const busterEvent = sideBetEvents.find(e => e.result.name === 'Buster')
    expect(busterEvent).toBeDefined()
    expect(busterEvent!.net).toBe(-500)
    expect(busterEvent!.result.win).toBe(false)
    // Also check sideBetResults on the spot
    const busterEntry = g.spots[0]!.sideBetResults.find(r => r.name === 'Buster')
    expect(busterEntry).toBeDefined()
    expect(busterEntry!.win).toBe(false)
    expect(busterEntry!.net).toBe(-500)
  })

  it('Buster pays when dealer busts (3-card bust, paytable A → 2×)', () => {
    // hero 10,9 stands (19); dealer 10(up),6(hole) draws 10 → 26 (3 cards)
    // Stack: spot0-c1=10, dealer-up=10♥, spot0-c2=9, dealer-hole=6♣, dealer-draw=10♦
    const g = game([c(10), c(10, 'hearts'), c(9), c(6, 'clubs'), c(10, 'diamonds')], SIDE_RULES)
    g.beginRound([{ spotId: 0, mainBet: 1000, sideBets: { buster: 500 } }])
    expect(g.phase).toBe('playerTurns')
    g.act(0, 'stand')
    expect(g.phase).toBe('complete')
    // Dealer busted with 3 cards; paytable A 3-card = 2× → net = +1000
    const busterEntry = g.spots[0]!.sideBetResults.find(r => r.name === 'Buster')
    expect(busterEntry).toBeDefined()
    expect(busterEntry!.win).toBe(true)
    expect(busterEntry!.net).toBe(1000) // 500 * 2
  })

  it('Early side bets settle at deal; main hand independent (MA §23(b)/§24(b)/§28(c))', () => {
    // hero K♥,K♣ vs dealer K♠(up), 9♦(hole)
    // Stack: spot0-c1=K♥, dealer-up=K♠, spot0-c2=K♣, dealer-hole=9♦
    const sideBetEvents: Array<{ name: string, net: number }> = []
    const g = game([c(13, 'hearts'), c(13, 'spades'), c(13, 'clubs'), c(9, 'diamonds')], SIDE_RULES)
    g.on((e) => {
      if (e.type === 'side-bet-settled') sideBetEvents.push({ name: e.result.name, net: e.net })
    })
    g.beginRound([{
      spotId: 0,
      mainBet: 1000,
      sideBets: { twentyOnePlusThree: 100, matchTheDealer: 100, luckyLadies: 100 }
    }])
    // Dealer K♠ up (ten-value, not ace) → afterInsurance(tenUp=true) → peek → no BJ → startPlayerTurns → Lucky Ladies settles
    expect(g.phase).toBe('playerTurns')

    // 21+3: K♥+K♣+K♠ = three-of-a-kind (same rank 13); MA-B pays 20× → net = +2000
    const t213 = g.spots[0]!.sideBetResults.find(r => r.name === '21+3')
    expect(t213).toBeDefined()
    expect(t213!.net).toBe(2000) // 100 * 20

    // MTD 8-deck: K♥ rank 13 matches dealer K♠ rank 13 (different suit);
    // K♣ rank 13 matches dealer K♠ rank 13 (different suit) → 2 total, 0 suited → two-unsuited → 6× → net = +600
    const mtd = g.spots[0]!.sideBetResults.find(r => r.name === 'Match the Dealer')
    expect(mtd).toBeDefined()
    expect(mtd!.net).toBe(600) // 100 * 6

    // Lucky Ladies: K♥+K♣ = 10+10=20; suits differ (hearts≠clubs) → any-20 → 4× → net = +400
    const ll = g.spots[0]!.sideBetResults.find(r => r.name === 'Lucky Ladies')
    expect(ll).toBeDefined()
    expect(ll!.net).toBe(400) // 100 * 4

    // Play out: hero stands 20; dealer K+9=19 → hero wins
    g.act(0, 'stand')
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1000) // main bet wins 1:1
  })

  it('Multi-spot deal order (MA §6(d))', () => {
    // 3 spots; track card-dealt events to verify interleaved deal order
    // Stack: spot0-c1=2, spot1-c1=3, spot2-c1=4, dealer-up=9♥, spot0-c2=8, spot1-c2=7, spot2-c2=6, dealer-hole=10♣
    const dealOrder: string[] = []
    const g = game([c(2), c(3), c(4), c(9, 'hearts'), c(8), c(7), c(6), c(10, 'clubs')], SIDE_RULES)
    g.on((e) => {
      if (e.type === 'card-dealt') {
        const to = typeof e.to === 'string' ? e.to : `spot${(e.to as { spotId: number }).spotId}`
        dealOrder.push(to)
      }
    })
    g.beginRound([
      { spotId: 0, mainBet: 1000 },
      { spotId: 1, mainBet: 1000 },
      { spotId: 2, mainBet: 1000 }
    ])
    // Expected order: spot0, spot1, spot2, dealer-up, spot0, spot1, spot2, dealer-hole
    expect(dealOrder).toEqual(['spot0', 'spot1', 'spot2', 'dealer-up', 'spot0', 'spot1', 'spot2', 'dealer-hole'])
    // Per-spot hands: spot0=2+8=10, spot1=3+7=10, spot2=4+6=10; dealer=9+10=19 → all lose
    g.act(0, 'stand')
    g.act(1, 'stand')
    g.act(2, 'stand')
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-1000)
    expect(g.spots[1]!.hands[0]!.netResult).toBe(-1000)
    expect(g.spots[2]!.hands[0]!.netResult).toBe(-1000)
  })

  it('insurance-settled event emitted on finishInsurance (MA §9)', () => {
    // dealer A up, hole 9 → no BJ; hero 10+9=19; insurance 500 → loses → net -500
    // Stack: spot0-c1=10, dealer-up=A♥, spot0-c2=9, dealer-hole=9♣
    const insuranceEvents: Array<{ spotId: number, net: number }> = []
    const g = game([c(10), c(14, 'hearts'), c(9), c(9, 'clubs')], SIDE_RULES)
    g.on((e) => {
      if (e.type === 'insurance-settled') insuranceEvents.push({ spotId: e.spotId, net: e.net })
    })
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.phase).toBe('insurance')
    g.insuranceDecision(0, 500) // take insurance
    g.finishInsurance()
    expect(g.phase).toBe('playerTurns') // no dealer BJ
    expect(insuranceEvents).toHaveLength(1)
    expect(insuranceEvents[0]!.spotId).toBe(0)
    expect(insuranceEvents[0]!.net).toBe(-500)
  })
})
