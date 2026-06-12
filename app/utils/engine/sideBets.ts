import type { Card } from './cards'
import { handTotal } from './hand'

export interface SideBetResult {
  name: string
  win: boolean
  payoutMultiplier: number // winnings per unit staked (0 when lost)
  label: string
}

// ---- 21+3 (MA §28(f) tables A/B; AC guide "21+3 Xtreme" = table B values) ----
// Verified against docs/Rules-Blackjack-10-08-2020.pdf §28(f) p.36 and
// docs/BLYS_AC-BlackJack-GamingGuide-4x9-Updated.pdf "21+3 SIDE XTREME WAGER" p.2

export const TWENTY_ONE_PLUS_THREE_PAYS: Record<string, Record<string, number>> = {
  'MA-A': { 'straight-flush': 9, 'three-of-a-kind': 9, 'straight': 9, 'flush': 9 },
  'MA-B': { 'straight-flush': 30, 'three-of-a-kind': 20, 'straight': 10, 'flush': 5 },
  'AC-XTREME': { 'straight-flush': 30, 'three-of-a-kind': 20, 'straight': 10, 'flush': 5 }
}

function isStraightRanks(ranks: number[]): boolean {
  const sorted = [...ranks].sort((a, b) => a - b)
  const consecutive = sorted[2]! - sorted[1]! === 1 && sorted[1]! - sorted[0]! === 1
  // A-2-3 ace-low (MA §28(b)) and Q-K-A ace-high are both valid straights
  const aceLow = sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 14
  return consecutive || aceLow
}

export function evaluate21Plus3(
  player: [Card, Card],
  dealerUp: Card,
  table: 'MA-A' | 'MA-B' | 'AC-XTREME'
): SideBetResult {
  const cards = [...player, dealerUp]
  const ranks = cards.map(c => c.rank)
  const flush = cards.every(c => c.suit === cards[0]!.suit)
  const trips = ranks.every(r => r === ranks[0]) // by RANK — K-K-T is not trips (MA §28(b)(2))
  const straight = isStraightRanks(ranks)
  const label = straight && flush
    ? 'straight-flush'
    : trips ? 'three-of-a-kind' : straight ? 'straight' : flush ? 'flush' : 'none'
  const pays = TWENTY_ONE_PLUS_THREE_PAYS[table]!
  const multiplier = label === 'none' ? 0 : pays[label]!
  return { name: '21+3', win: multiplier > 0, payoutMultiplier: multiplier, label }
}

// ---- Lucky Ladies / twenty-point bonus (MA §24(f)-(g)) ----
// Verified against docs/Rules-Blackjack-10-08-2020.pdf §24(f) p.30:
//   Table A: QH+dealer BJ=1000, QH pair=125, Matched 20=19, Suited 20=9, Any 20=4
//   Table B: QH+dealer BJ=1000, QH pair=200, Matched 20=25, Suited 20=10, Any 20=4

export const LUCKY_LADIES_PAYS: Record<string, Record<string, number>> = {
  'MA-A': { 'qh-pair-dealer-bj': 1000, 'qh-pair': 125, 'matched-20': 19, 'suited-20': 9, 'any-20': 4 },
  'MA-B': { 'qh-pair-dealer-bj': 1000, 'qh-pair': 200, 'matched-20': 25, 'suited-20': 10, 'any-20': 4 }
}

export function evaluateLuckyLadies(
  player: [Card, Card],
  dealerHasBlackjack: boolean,
  table: 'MA-A' | 'MA-B'
): SideBetResult {
  const [a, b] = player
  const total = handTotal(player).total
  let label = 'none'
  if (total === 20) {
    const qhPair = a.rank === 12 && b.rank === 12 && a.suit === 'hearts' && b.suit === 'hearts'
    if (qhPair) {
      label = dealerHasBlackjack ? 'qh-pair-dealer-bj' : 'qh-pair'
    } else if (a.rank === b.rank && a.suit === b.suit) {
      label = 'matched-20' // identical cards (multi-deck), MA §24(g)(1)
    } else if (a.suit === b.suit) {
      label = 'suited-20' // MA §24(g)(2)
    } else {
      label = 'any-20' // MA §24(g)(3)
    }
  }
  const multiplier = label === 'none' ? 0 : LUCKY_LADIES_PAYS[table]![label]!
  return { name: 'Lucky Ladies', win: multiplier > 0, payoutMultiplier: multiplier, label }
}

// ---- Match the Dealer (MA §23(f), deck-dependent) ----
// Verified against docs/Rules-Blackjack-10-08-2020.pdf §23(f) Table 2 p.28:
//   4-deck: 2S=24, 1S+1U=16, 1S=12, 2U=8, 1U=4
//   6-deck: 2S=22, 1S+1U=15, 1S=11, 2U=8, 1U=4
//   8-deck: 2S=28, 1S+1U=17, 1S=14, 2U=6, 1U=3
// Also confirmed against Bally's AC guide "Match Super Bonus Side Wager" (8-deck/6-deck columns).
// 2-deck Table 1: 2S=N/A (dash), 1S+1U=23, 1S=19, 2U=8, 1U=4

interface MtdPays {
  twoSuited: number
  suitedPlusUnsuited: number
  oneSuited: number
  twoUnsuited: number
  oneUnsuited: number
}

export const MATCH_THE_DEALER_PAYS: Partial<Record<number, MtdPays>> = {
  2: { twoSuited: 0, suitedPlusUnsuited: 23, oneSuited: 19, twoUnsuited: 8, oneUnsuited: 4 },
  4: { twoSuited: 24, suitedPlusUnsuited: 16, oneSuited: 12, twoUnsuited: 8, oneUnsuited: 4 },
  6: { twoSuited: 22, suitedPlusUnsuited: 15, oneSuited: 11, twoUnsuited: 8, oneUnsuited: 4 },
  8: { twoSuited: 28, suitedPlusUnsuited: 17, oneSuited: 14, twoUnsuited: 6, oneUnsuited: 3 }
}

/** Ten-value cards match identical rank only (MA §23(a)): a 10 never matches a K. */
export function evaluateMatchTheDealer(player: [Card, Card], dealerUp: Card, decks: number): SideBetResult {
  const pays = MATCH_THE_DEALER_PAYS[decks] ?? MATCH_THE_DEALER_PAYS[6]!
  const matches = player.filter(c => c.rank === dealerUp.rank)
  const suitedMatches = matches.filter(c => c.suit === dealerUp.suit).length
  let label = 'none'
  let multiplier = 0
  if (matches.length === 2) {
    if (suitedMatches === 2) {
      [label, multiplier] = ['two-suited', pays.twoSuited]
    } else if (suitedMatches === 1) {
      [label, multiplier] = ['suited-plus-unsuited', pays.suitedPlusUnsuited]
    } else {
      [label, multiplier] = ['two-unsuited', pays.twoUnsuited]
    }
  } else if (matches.length === 1) {
    if (suitedMatches === 1) {
      [label, multiplier] = ['one-suited', pays.oneSuited]
    } else {
      [label, multiplier] = ['one-unsuited', pays.oneUnsuited]
    }
  }
  if (multiplier === 0) label = 'none'
  return { name: 'Match the Dealer', win: multiplier > 0, payoutMultiplier: multiplier, label }
}

// ---- Buster (MA §27(g) paytables A-F) ----
// Verified against docs/Rules-Blackjack-10-08-2020.pdf §27(g) p.35 (all pays "to 1"):
//   A: 3→2, 4→2, 5→4, 6→15, 7→50, 8+→250
//   B: 3→2, 4→2, 5→4, 6→15, 7→50, 8+→200
//   C: 3→2, 4→2, 5→4, 6→12, 7→50, 8+→250
//   D: 3→2, 4→2, 5→4, 6→12, 7→50, 8+→200
//   E: 3→2, 4→2, 5→3, 6→12, 7→50, 8+→250
//   F: 3→1, 4→2, 5→8, 6→20, 7→50, 8+→250

export const BUSTER_PAYS: Record<string, Record<string, number>> = {
  A: { '3': 2, '4': 2, '5': 4, '6': 15, '7': 50, '8+': 250 },
  B: { '3': 2, '4': 2, '5': 4, '6': 15, '7': 50, '8+': 200 },
  C: { '3': 2, '4': 2, '5': 4, '6': 12, '7': 50, '8+': 250 },
  D: { '3': 2, '4': 2, '5': 4, '6': 12, '7': 50, '8+': 200 },
  E: { '3': 2, '4': 2, '5': 3, '6': 12, '7': 50, '8+': 250 },
  F: { '3': 1, '4': 2, '5': 8, '6': 20, '7': 50, '8+': 250 }
}

export function evaluateBuster(
  dealerCards: Card[],
  dealerHasBlackjack: boolean,
  table: keyof typeof BUSTER_PAYS
): SideBetResult {
  const busted = handTotal(dealerCards).total > 21
  if (dealerHasBlackjack || !busted) {
    return { name: 'Buster', win: false, payoutMultiplier: 0, label: 'none' }
  }
  const n = dealerCards.length
  if (n < 3) return { name: 'Buster', win: false, payoutMultiplier: 0, label: 'none' }
  const key = n >= 8 ? '8+' : String(n)
  const multiplier = BUSTER_PAYS[table]![key]!
  return { name: 'Buster', win: true, payoutMultiplier: multiplier, label: `bust-${key}-cards` }
}
