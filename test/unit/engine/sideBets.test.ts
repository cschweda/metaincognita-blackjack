import { describe, expect, it } from 'vitest'
import {
  evaluate21Plus3, evaluateLuckyLadies, evaluateMatchTheDealer, evaluateBuster
} from '../../../app/utils/engine/sideBets'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit): Card => ({ rank, suit })

describe('21+3 (MA §28, AC Xtreme)', () => {
  it('detects straight flush, trips, straight, flush in precedence order', () => {
    expect(evaluate21Plus3([c(5, 'hearts'), c(6, 'hearts')], c(7, 'hearts'), 'MA-B').label).toBe('straight-flush')
    expect(evaluate21Plus3([c(13, 'hearts'), c(13, 'clubs')], c(13, 'spades'), 'MA-B').label).toBe('three-of-a-kind')
    expect(evaluate21Plus3([c(5, 'hearts'), c(6, 'clubs')], c(7, 'spades'), 'MA-B').label).toBe('straight')
    expect(evaluate21Plus3([c(2, 'hearts'), c(9, 'hearts')], c(13, 'hearts'), 'MA-B').label).toBe('flush')
  })

  it('pays table B: SF 30, trips 20, straight 10, flush 5; table A pays 9 flat', () => {
    expect(evaluate21Plus3([c(5, 'hearts'), c(6, 'hearts')], c(7, 'hearts'), 'MA-B').payoutMultiplier).toBe(30)
    expect(evaluate21Plus3([c(13, 'hearts'), c(13, 'clubs')], c(13, 'spades'), 'MA-B').payoutMultiplier).toBe(20)
    expect(evaluate21Plus3([c(5, 'hearts'), c(6, 'clubs')], c(7, 'spades'), 'MA-B').payoutMultiplier).toBe(10)
    expect(evaluate21Plus3([c(2, 'hearts'), c(9, 'hearts')], c(13, 'hearts'), 'MA-B').payoutMultiplier).toBe(5)
    expect(evaluate21Plus3([c(2, 'hearts'), c(9, 'hearts')], c(13, 'hearts'), 'MA-A').payoutMultiplier).toBe(9)
  })

  it('allows ace-low straights (A-2-3, MA §28(b)) and ace-high (Q-K-A)', () => {
    expect(evaluate21Plus3([c(14, 'hearts'), c(2, 'clubs')], c(3, 'spades'), 'MA-B').label).toBe('straight')
    expect(evaluate21Plus3([c(12, 'hearts'), c(13, 'clubs')], c(14, 'spades'), 'MA-B').label).toBe('straight')
  })

  it('trips are by rank, not point value (K-K-T is no trips)', () => {
    const r = evaluate21Plus3([c(13, 'hearts'), c(13, 'clubs')], c(10, 'spades'), 'MA-B')
    expect(r.win).toBe(false)
  })
})

describe('Lucky Ladies / twenty-point bonus (MA §24)', () => {
  const dealerBJ = true
  it('pays the Q♥ pair tiers', () => {
    const qh: [Card, Card] = [c(12, 'hearts'), c(12, 'hearts')]
    expect(evaluateLuckyLadies(qh, !dealerBJ, 'MA-A').payoutMultiplier).toBe(125)
    expect(evaluateLuckyLadies(qh, !dealerBJ, 'MA-B').payoutMultiplier).toBe(200)
    expect(evaluateLuckyLadies(qh, dealerBJ, 'MA-A').payoutMultiplier).toBe(1000)
  })

  it('distinguishes matched / suited / any 20 (MA §24(g))', () => {
    expect(evaluateLuckyLadies([c(13, 'diamonds'), c(13, 'diamonds')], false, 'MA-A').payoutMultiplier).toBe(19) // matched: identical rank+suit
    expect(evaluateLuckyLadies([c(13, 'diamonds'), c(11, 'diamonds')], false, 'MA-A').payoutMultiplier).toBe(9) // suited
    expect(evaluateLuckyLadies([c(13, 'diamonds'), c(13, 'hearts')], false, 'MA-A').payoutMultiplier).toBe(4) // any 20
    expect(evaluateLuckyLadies([c(14, 'spades'), c(9, 'clubs')], false, 'MA-A').payoutMultiplier).toBe(4) // soft 20 counts
  })

  it('loses on non-20 totals', () => {
    expect(evaluateLuckyLadies([c(10, 'spades'), c(9, 'clubs')], false, 'MA-A').win).toBe(false)
  })
})

describe('Match the Dealer (MA §23)', () => {
  it('matches by rank with ten-values matching identical rank only (MA §23(a))', () => {
    const r = evaluateMatchTheDealer([c(13, 'hearts'), c(5, 'clubs')], c(13, 'spades'), 6)
    expect(r.win).toBe(true)
    const noMatch = evaluateMatchTheDealer([c(10, 'hearts'), c(5, 'clubs')], c(13, 'spades'), 6)
    expect(noMatch.win).toBe(false) // 10 does not match K
  })

  it('pays the 6-deck column: unsuited 4, suited 11, both 15, two unsuited 8, two suited 22', () => {
    expect(evaluateMatchTheDealer([c(13, 'hearts'), c(5, 'clubs')], c(13, 'spades'), 6).payoutMultiplier).toBe(4)
    expect(evaluateMatchTheDealer([c(13, 'spades'), c(5, 'clubs')], c(13, 'spades'), 6).payoutMultiplier).toBe(11)
    expect(evaluateMatchTheDealer([c(13, 'spades'), c(13, 'hearts')], c(13, 'spades'), 6).payoutMultiplier).toBe(15)
    expect(evaluateMatchTheDealer([c(13, 'hearts'), c(13, 'diamonds')], c(13, 'spades'), 6).payoutMultiplier).toBe(8)
    expect(evaluateMatchTheDealer([c(13, 'spades'), c(13, 'spades')], c(13, 'spades'), 6).payoutMultiplier).toBe(22)
  })

  it('pays the 8-deck column: unsuited 3, suited 14', () => {
    expect(evaluateMatchTheDealer([c(13, 'hearts'), c(5, 'clubs')], c(13, 'spades'), 8).payoutMultiplier).toBe(3)
    expect(evaluateMatchTheDealer([c(13, 'spades'), c(5, 'clubs')], c(13, 'spades'), 8).payoutMultiplier).toBe(14)
  })
})

describe('Buster (MA §27)', () => {
  it('loses when the dealer does not bust or has blackjack (MA §27(d))', () => {
    expect(evaluateBuster([c(10, 'hearts'), c(7, 'clubs')], false, 'A').win).toBe(false)
    expect(evaluateBuster([c(14, 'hearts'), c(13, 'clubs')], true, 'A').win).toBe(false)
  })

  it('pays paytable A by busted-hand card count: 3-4 cards 2, 5 cards 4, 6 cards 15, 7 cards 50, 8+ 250', () => {
    const bust3 = [c(10, 'hearts'), c(6, 'clubs'), c(10, 'spades')]
    const bust5 = [c(2, 'hearts'), c(3, 'clubs'), c(4, 'spades'), c(5, 'hearts'), c(9, 'clubs')]
    const bust6 = [c(2, 'hearts'), c(2, 'clubs'), c(3, 'spades'), c(4, 'hearts'), c(5, 'clubs'), c(7, 'spades')]
    expect(evaluateBuster(bust3, false, 'A').payoutMultiplier).toBe(2)
    expect(evaluateBuster(bust5, false, 'A').payoutMultiplier).toBe(4)
    expect(evaluateBuster(bust6, false, 'A').payoutMultiplier).toBe(15)
  })
})
