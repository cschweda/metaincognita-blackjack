import type { Card } from './cards'
import { pointValue } from './cards'

export interface HandTotal {
  total: number
  soft: boolean // an ace is currently counted as 11
}

/** MA §1 hard/soft definitions; aces demote 11→1 while busting. */
export function handTotal(cards: readonly Card[]): HandTotal {
  let total = 0
  let acesAsEleven = 0
  for (const card of cards) {
    const v = pointValue(card.rank)
    total += v
    if (v === 11) acesAsEleven++
    while (total > 21 && acesAsEleven > 0) {
      total -= 10
      acesAsEleven--
    }
  }
  return { total, soft: acesAsEleven > 0 }
}

export function isBust(cards: readonly Card[]): boolean {
  return handTotal(cards).total > 21
}

/** Ace + ten-value as initial two cards; never after split (MA §1). */
export function isBlackjack(cards: readonly Card[], fromSplit: boolean): boolean {
  return !fromSplit && cards.length === 2 && handTotal(cards).total === 21
}

/** Initial two cards of equal point value (MA §11(a)). */
export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && pointValue(cards[0]!.rank) === pointValue(cards[1]!.rank)
}
