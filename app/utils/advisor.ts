import type { Card } from './engine/cards'
import { bucketOf } from './engine/cards'
import type { RuleSet } from './engine/rules'
import type { Action } from './engine/hand'
import { handTotal, isPair } from './engine/hand'
import type { ActionEVs } from './engine/basicStrategy'
import { bestAction, bestActionFull } from './engine/basicStrategy'
import type { Deviation } from './engine/counting'
import { FAB_4, ILLUSTRIOUS_18, deviationFor } from './engine/counting'

export interface AdvisorInput {
  cards: Card[]
  fromSplit: boolean
}

export interface AdvisorRecommendation {
  /** What to do — the deviation play when one is active and legal, else the book play. */
  action: Action
  /** Pure basic strategy (deviation-free), clamped to legal actions. */
  book: Action
  evs: Partial<Record<Action, number>>
  deviation: Deviation | null
  reasoning: string
}

const LABEL: Record<Action, string> = {
  hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender'
}

export function pctEV(v: number | undefined): string {
  return v === undefined ? '—' : `${(v * 100).toFixed(1)}%`
}

function clampToLegal(preferred: Action, evs: ActionEVs, legal: Action[]): Action {
  if (legal.includes(preferred)) return preferred
  const ranked = (Object.entries(evs) as Array<[Action, number | undefined]>)
    .filter((entry): entry is [Action, number] => entry[1] !== undefined && legal.includes(entry[0]))
    .sort((a, b) => b[1] - a[1])
  return ranked[0]?.[0] ?? legal[0] ?? 'stand'
}

function buildReasoning(
  book: Action, evs: Partial<Record<Action, number>>, deviation: Deviation | null, tc: number
): string {
  if (deviation) {
    return `Count call: TC ${tc.toFixed(1)} — ${deviation.description}. Book without the count: ${LABEL[book]}.`
  }
  const ranked = (Object.entries(evs) as Array<[Action, number | undefined]>)
    .filter((entry): entry is [Action, number] => entry[1] !== undefined)
    .sort((a, b) => b[1] - a[1])
  const runnerUp = ranked.find(([action]) => action !== book)
  return runnerUp
    ? `${LABEL[book]}: EV ${pctEV(evs[book])} beats ${LABEL[runnerUp[0]].toLowerCase()} at ${pctEV(runnerUp[1])}.`
    : `${LABEL[book]} is the only play.`
}

export function adviseHand(
  input: AdvisorInput, up: Card, rules: RuleSet, tc: number, advanced: boolean, legal: Action[]
): AdvisorRecommendation {
  const upB = bucketOf(up)
  const { total, soft } = handTotal(input.cards)
  const pairHand = isPair(input.cards) && legal.includes('split')
  const rec = pairHand
    ? bestActionFull({ pair: bucketOf(input.cards[0]!), total, soft }, upB, rules)
    : bestAction(
        { total, soft, twoCards: input.cards.length === 2, fromSplit: input.fromSplit }, upB, rules)
  const book = clampToLegal(rec.action as Action, rec.evs, legal)

  let action = book
  let deviation: Deviation | null = null
  if (advanced) {
    const pool = rules.surrender === 'late' ? [...ILLUSTRIOUS_18, ...FAB_4] : ILLUSTRIOUS_18
    const dev = deviationFor(
      { total, soft, pair: pairHand ? bucketOf(input.cards[0]!) : null }, upB, tc, pool)
    if (dev && dev.play !== 'take-insurance' && legal.includes(dev.play as Action)) {
      deviation = dev
      action = dev.play as Action
    }
  }

  return {
    action,
    book,
    evs: rec.evs as Partial<Record<Action, number>>,
    deviation,
    reasoning: buildReasoning(book, rec.evs as Partial<Record<Action, number>>, deviation, tc)
  }
}

export function adviseInsurance(tc: number, advanced: boolean): { take: boolean, reasoning: string } {
  if (advanced && tc >= 3) {
    return { take: true, reasoning: `TC ${tc.toFixed(1)} ≥ +3 — insurance is profitable here (Illustrious 18 #1).` }
  }
  return { take: false, reasoning: 'Book play: never take insurance — 2:1 pay on worse-than-2:1 odds.' }
}

export const SIDE_BET_CAUTION
  = 'Side bets carry a far higher house edge than the main game — book play is to skip them.'

/** (EV[book] − EV[action]) × bet, floored at 0; unpriceable actions cost 0.
 *  Call ONLY for graded mistakes: a correct deviation play diverges from book by design
 *  and must be recorded at $0 — the caller guards with `correct ? 0 : decisionCost(...)`. */
export function decisionCost(
  evs: Partial<Record<Action, number>>, action: Action, book: Action, bet: number
): number {
  const evAction = evs[action]
  const evBook = evs[book]
  if (evAction === undefined || evBook === undefined) return 0
  return Math.max(0, Math.round((evBook - evAction) * bet))
}
