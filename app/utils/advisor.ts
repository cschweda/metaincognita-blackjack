import type { Card } from './engine/cards'
import { bucketOf } from './engine/cards'
import type { RuleSet } from './engine/rules'
import type { Action } from './engine/hand'
import { handTotal, isPair } from './engine/hand'
import type { ActionEVs } from './engine/basicStrategy'
import { bestAction, bestActionFull } from './engine/basicStrategy'
import type { Deviation } from './engine/counting'
import type { DecisionRecord, RoundRecord } from '../stores/useBlackjackStore'
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

// ── round-outcome summary (spec: docs/superpowers/specs/2026-06-13-round-outcome-presentation-design.md) ──

export interface RoundSummary {
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'mixed'
  /** Hero hands + side bets + insurance, signed cents. */
  netCents: number
  headline: string
  why: string
  /** Strategy recap, mistakes first — hidden in exam mode by the panel. */
  moments: string[]
}

const ACTION_GERUND: Record<Action, string> = {
  hit: 'draw on', stand: 'stand on', double: 'double', split: 'split', surrender: 'surrender'
}
const ACTION_PAST: Record<Action, string> = {
  hit: 'drew', stand: 'stood', double: 'doubled', split: 'split', surrender: 'surrendered'
}

function fmtMoney(cents: number): string {
  const abs = Math.abs(cents) / 100
  return `$${abs.toLocaleString(undefined, { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`
}

function signedMoney(cents: number): string {
  return `${cents > 0 ? '+' : cents < 0 ? '−' : '±'}${fmtMoney(cents)}`
}

function situationOf(d: DecisionRecord): string {
  const up = d.dealerUp.slice(0, -1) // strip the suit glyph: '10♦' → '10'
  if (d.pair && d.pairBucket !== null) {
    const rank = d.pairBucket === 11 ? 'aces' : d.pairBucket === 10 ? 'tens' : `${d.pairBucket}s`
    return `a pair of ${rank} vs ${up}`
  }
  return `${d.soft ? 'soft' : 'hard'} ${d.total} vs ${up}`
}

type RecordedHand = RoundRecord['spots'][number]['hands'][number]

function handResultClause(hand: RecordedHand, dealer: RoundRecord['dealer']): string {
  const total = hand.total
  switch (hand.outcome) {
    case 'surrender':
      return 'you surrendered for half the bet'
    case 'blackjack':
      return 'your blackjack pays before the dealer even plays'
    case 'push':
      return total !== undefined ? `your ${total} pushes — bet returned` : 'a push — bet returned'
    case 'win':
      if (dealer.busted) return total !== undefined ? `your ${total} stands` : 'your hand stands'
      return total !== undefined ? `your ${total} wins` : 'your hand wins'
    default: // lose
      if (total !== undefined && total > 21) return `your ${total} busted`
      return total !== undefined ? `beating your ${total}` : 'beating your hand'
  }
}

/** Turn a settled round record into the advisor's announcement: headline, why, money, recap. */
export function summarizeRound(round: RoundRecord): RoundSummary | null {
  const hero = round.spots.find(s => s.occupant === 'hero')
  if (!hero || hero.hands.length === 0) return null

  const netCents = hero.hands.reduce((s, h) => s + h.net, 0)
    + hero.sideBets.reduce((s, b) => s + b.net, 0)
    + hero.insuranceNet

  const outcomes = new Set(hero.hands.map(h => h.outcome))
  const outcome: RoundSummary['outcome']
    = hero.hands.length > 1 && outcomes.size > 1
      ? 'mixed'
      : outcomes.has('blackjack')
        ? 'blackjack'
        : outcomes.has('win')
          ? 'win'
          : outcomes.has('push')
            ? 'push'
            : 'lose'

  const headline
    = outcome === 'blackjack'
      ? `Blackjack! ${signedMoney(netCents)}`
      : outcome === 'mixed'
        ? `Split hands: ${signedMoney(netCents)}`
        : netCents > 0
          ? `Won ${fmtMoney(netCents)}`
          : netCents < 0
            ? `Lost ${fmtMoney(netCents)}`
            : 'Push — bet returned'

  const dealerPart = round.dealer.blackjack
    ? 'Dealer had blackjack'
    : round.dealer.busted
      ? `Dealer busted with ${round.dealer.total}`
      : `Dealer made ${round.dealer.total}`

  let why: string
  if (hero.hands.length > 1) {
    const parts = hero.hands.map((h, i) => {
      const t = h.total !== undefined ? `${h.total} ` : ''
      const verb = h.outcome === 'win' ? 'won' : h.outcome === 'push' ? 'pushed' : h.outcome === 'blackjack' ? 'blackjack' : 'lost'
      return `hand ${i + 1} ${t}${verb}`
    })
    why = `${dealerPart} — ${parts.join(', ')}.`
  } else {
    const hand = hero.hands[0]!
    const clause = handResultClause(hand, round.dealer)
    if (hand.outcome === 'lose' && !round.dealer.busted && !round.dealer.blackjack
      && !(hand.total !== undefined && hand.total > 21)) {
      why = `Dealer's ${round.dealer.total} beats ${clause.replace('beating ', '')}.`
    } else {
      why = `${dealerPart} — ${clause}.`
    }
  }

  const decisions = round.heroDecisions ?? []
  const mistakes = decisions.filter(d => !d.correct).map(d =>
    `Book: ${ACTION_GERUND[d.book]} ${situationOf(d)} — you ${ACTION_PAST[d.action]}${d.costCents > 0 ? ` (cost ${fmtMoney(d.costCents)})` : ''}`)
  const confirmations = decisions.filter(d => d.correct).map(d =>
    d.deviationId
      ? `Count call: ${ACTION_GERUND[d.action]} ${situationOf(d)} at TC ${d.tc.toFixed(1)} ✓`
      : `Optimal: ${ACTION_GERUND[d.action]} ${situationOf(d)} ✓`)
  const moments = [...mistakes, ...confirmations]
  if (round.heroInsurance) {
    const ins = round.heroInsurance
    if (!ins.correct) {
      moments.push(ins.took === null
        ? `Count said take insurance (TC ${ins.tc.toFixed(1)}) — you declined`
        : 'Insurance is the book\'s worst bet — skip it')
    } else if (ins.took !== null) {
      moments.push(`Insurance at TC ${ins.tc.toFixed(1)} ✓`)
    }
  }

  return { outcome, netCents, headline, why, moments: moments.slice(0, 4) }
}
