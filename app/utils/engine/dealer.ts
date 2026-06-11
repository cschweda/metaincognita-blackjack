import type { Card } from './cards'
import type { RuleSet } from './rules'
import { handTotal } from './hand'

/** MA §12(b): option (1) = stand all 17s (S17); option (2) = hit soft 17 (H17). */
export function dealerShouldDraw(cards: readonly Card[], rules: RuleSet): boolean {
  const { total, soft } = handTotal(cards)
  if (total < 17) return true
  if (total === 17 && soft && rules.dealerHitsSoft17) return true
  return false
}

/** Draw to completion from a card source (shoe.draw in play; scripted streams in tests). */
export function dealerPlay(cards: readonly Card[], drawCard: () => Card, rules: RuleSet): Card[] {
  const out = [...cards]
  while (dealerShouldDraw(out, rules)) out.push(drawCard())
  return out
}
