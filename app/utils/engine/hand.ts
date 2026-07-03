import type { Card } from './cards'
import { pointValue } from './cards'
import type { RuleSet } from './rules'

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

export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender'

export interface PlayHand {
  cards: Card[]
  bet: number // cents
  fromSplit: boolean
  splitAces: boolean
  doubled: boolean
  surrendered: boolean
  resolved: boolean
}

export function newHand(
  cards: Card[],
  bet: number,
  opts: Partial<Pick<PlayHand, 'fromSplit' | 'splitAces'>> = {}
): PlayHand {
  return {
    cards,
    bet,
    fromSplit: opts.fromSplit ?? false,
    splitAces: opts.splitAces ?? false,
    doubled: false,
    surrendered: false,
    resolved: false
  }
}

/**
 * Legal player actions for a hand. handCountAtSpot = hands currently formed at this spot
 * (split cap, MA §11(e)). Engine note: MA §8's surrender-vs-ace escrow settles identically
 * to standard late surrender (dealer BJ → full wager lost), so LS is offered post-peek.
 */
export function legalActions(hand: PlayHand, handCountAtSpot: number, rules: RuleSet): Action[] {
  if (hand.resolved || hand.surrendered || hand.doubled || isBust(hand.cards)) return []

  // Split aces: one card each (MA §11(c)(2), AC guide, WA) — drawing another ace offers an
  // OPTIONAL resplit; the player may always keep the hand instead
  if (hand.splitAces && hand.cards.length >= 2) {
    if (isPair(hand.cards) && rules.resplitAces && handCountAtSpot < rules.maxSplitHands) return ['split', 'stand']
    return []
  }

  const { total, soft } = handTotal(hand.cards)
  if (total === 21) return ['stand'] // MA §12(a)(1): 21 may not draw

  const actions: Action[] = ['hit', 'stand']
  const twoCards = hand.cards.length === 2

  if (twoCards) {
    const doubleInRange
      = rules.doubleOn === 'any2'
        || (rules.doubleOn === '9-11' && !soft && total >= 9 && total <= 11)
        || (rules.doubleOn === '10-11' && !soft && (total === 10 || total === 11))
    if (doubleInRange && (!hand.fromSplit || rules.doubleAfterSplit)) actions.push('double')

    if (isPair(hand.cards) && handCountAtSpot < rules.maxSplitHands) actions.push('split')

    if (rules.surrender === 'late' && !hand.fromSplit) actions.push('surrender')
  }

  return actions
}
