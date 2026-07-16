import type { Bucket } from './cards'
import type { RuleSet } from './rules'
import { blackjackPayoutRatio } from './rules'

export const BUCKETS: Bucket[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** Fixed-composition draw probabilities (see plan Modeling Notes). */
export const PROB: Record<Bucket, number> = {
  2: 4 / 52, 3: 4 / 52, 4: 4 / 52, 5: 4 / 52, 6: 4 / 52,
  7: 4 / 52, 8: 4 / 52, 9: 4 / 52, 10: 16 / 52, 11: 4 / 52
}

export interface DealerDist {
  17: number
  18: number
  19: number
  20: number
  21: number
  bust: number
  blackjack: number
}

const EMPTY: DealerDist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, blackjack: 0 }

function addCard(total: number, acesAsEleven: number, bucket: Bucket): [number, number] {
  let t = total + bucket
  let aces = acesAsEleven + (bucket === 11 ? 1 : 0)
  while (t > 21 && aces > 0) {
    t -= 10
    aces--
  }
  return [t, aces]
}

function blend(into: DealerDist, from: DealerDist, weight: number): void {
  for (const k of Object.keys(from) as Array<keyof DealerDist>) into[k] += from[k] * weight
}

const completeMemo = new Map<string, DealerDist>()

/** Dealer finishes from (total, soft) per MA §12(b)/WA §9 drawing rules. */
function complete(total: number, acesAsEleven: number, h17: boolean): DealerDist {
  if (total > 21) return { ...EMPTY, bust: 1 }
  const soft = acesAsEleven > 0
  const stands = total > 17 || (total === 17 && !(soft && h17))
  if (total >= 17 && stands) {
    const out = { ...EMPTY }
    out[total as 17 | 18 | 19 | 20 | 21] = 1
    return out
  }
  const key = `${total}|${soft}|${h17}`
  const hit = completeMemo.get(key)
  if (hit) return hit
  const out = { ...EMPTY }
  for (const b of BUCKETS) {
    const [t, a] = addCard(total, acesAsEleven, b)
    blend(out, complete(t, a, h17), PROB[b])
  }
  completeMemo.set(key, out)
  return out
}

/**
 * Dealer outcome distribution for an upcard. With conditionNoBlackjack (peek model, MA §6(i)),
 * the blackjack-completing hole card is excluded and the remainder renormalized.
 */
export function dealerDistribution(up: Bucket, rules: RuleSet, conditionNoBlackjack: boolean): DealerDist {
  const h17 = rules.dealerHitsSoft17
  const out = { ...EMPTY }
  const bjHole: Bucket | null = up === 11 ? 10 : up === 10 ? 11 : null
  const excluded = conditionNoBlackjack && bjHole !== null ? PROB[bjHole] : 0
  const norm = 1 - excluded

  for (const hole of BUCKETS) {
    const isBlackjack = bjHole !== null && hole === bjHole
    if (isBlackjack) {
      if (!conditionNoBlackjack) out.blackjack += PROB[hole]
      continue
    }
    const [t0, a0] = addCard(0, 0, up)
    const [t1, a1] = addCard(t0, a0, hole)
    blend(out, complete(t1, a1, h17), PROB[hole] / norm)
  }
  return out
}

// ─── Part 2: Action EVs & bestAction ───────────────────────────────────────

export interface TotalState {
  total: number
  soft: boolean
  twoCards: boolean
  fromSplit: boolean
}

export interface ActionEVs {
  stand: number
  hit: number
  double?: number
  surrender?: number
  split?: number // filled by splitEV (Task 11) when the hand is a pair
}

function standEV(playerTotal: number, d: DealerDist): number {
  if (playerTotal > 21) return -1
  // Peek model: d.blackjack is 0 when conditioned. Unconditioned (no-peek custom games),
  // the dealer BJ mass is a straight loss — ENHC full-loss emerges naturally for doubles too.
  let ev = d.bust - d.blackjack
  for (const t of [17, 18, 19, 20, 21] as const) {
    ev += d[t] * (playerTotal > t ? 1 : playerTotal < t ? -1 : 0)
  }
  return ev
}

function stateAfter(total: number, soft: boolean, bucket: Bucket): [number, boolean] {
  const aces = soft ? 1 : 0
  const [t, a] = addCard(total, aces, bucket)
  return [t, a > 0]
}

function hitEV(total: number, soft: boolean, d: DealerDist, memo: Map<string, number>): number {
  const key = `${total}|${soft}`
  const cached = memo.get(key)
  if (cached !== undefined) return cached
  let ev = 0
  for (const b of BUCKETS) {
    const [t, s] = stateAfter(total, soft, b)
    if (t > 21) {
      ev += PROB[b] * -1
    } else {
      const standHere = standEV(t, d)
      const hitAgain = t === 21 ? -Infinity : hitEV(t, s, d, memo)
      ev += PROB[b] * Math.max(standHere, hitAgain)
    }
  }
  memo.set(key, ev)
  return ev
}

function doubleEV(total: number, soft: boolean, d: DealerDist): number {
  let ev = 0
  for (const b of BUCKETS) {
    const [t] = stateAfter(total, soft, b)
    ev += PROB[b] * 2 * standEV(t, d)
  }
  return ev
}

const distCache = new Map<string, DealerDist>()

export function distFor(up: Bucket, rules: RuleSet): DealerDist {
  const key = `${up}|${rules.dealerHitsSoft17}|${rules.dealerPeek}`
  const hit = distCache.get(key)
  if (hit) return hit
  const d = dealerDistribution(up, rules, rules.dealerPeek)
  distCache.set(key, d)
  return d
}

/** EVs (per unit of the original bet) for the non-split actions available in this state. */
export function actionEVs(state: TotalState, up: Bucket, rules: RuleSet): ActionEVs {
  const d = distFor(up, rules)
  const memo = new Map<string, number>()
  const evs: ActionEVs = {
    stand: standEV(state.total, d),
    hit: hitEV(state.total, state.soft, d, memo)
  }
  if (state.twoCards && (!state.fromSplit || rules.doubleAfterSplit)) {
    const inRange
      = rules.doubleOn === 'any2'
        || (rules.doubleOn === '9-11' && !state.soft && state.total >= 9 && state.total <= 11)
        || (rules.doubleOn === '10-11' && !state.soft && (state.total === 10 || state.total === 11))
    if (inRange) evs.double = doubleEV(state.total, state.soft, d)
  }
  if (state.twoCards && !state.fromSplit && rules.surrender === 'late') evs.surrender = -0.5
  return evs
}

export interface Recommendation {
  action: 'hit' | 'stand' | 'double' | 'surrender' | 'split'
  evs: ActionEVs
}

export function bestAction(state: TotalState, up: Bucket, rules: RuleSet): Recommendation {
  const evs = actionEVs(state, up, rules)
  let action: Recommendation['action'] = evs.stand >= evs.hit ? 'stand' : 'hit'
  let best = Math.max(evs.stand, evs.hit)
  if (evs.double !== undefined && evs.double > best) {
    action = 'double'
    best = evs.double // track running best for subsequent comparisons
  }
  if (evs.surrender !== undefined && evs.surrender > best) {
    action = 'surrender'
  }
  return { action, evs }
}

// ─── Part 3: Split EV, chart generation, house edge ───────────────────────────

const splitMemo = new Map<string, number>()

/** Absolute EV (in original-bet units, both hands counted) of splitting pairBucket vs up. */
export function splitEV(pairBucket: Bucket, up: Bucket, rules: RuleSet, handsFormed = 2): number {
  return 2 * postSplitHandEV(pairBucket, up, rules, handsFormed)
}

function postSplitHandEV(pairBucket: Bucket, up: Bucket, rules: RuleSet, handsFormed: number): number {
  const key = `${pairBucket}|${up}|${handsFormed}|${rules.dealerHitsSoft17}|${rules.dealerPeek}|${rules.doubleAfterSplit}|${rules.doubleOn}|${rules.maxSplitHands}|${rules.resplitAces}`
  const cached = splitMemo.get(key)
  if (cached !== undefined) return cached
  const d = distFor(up, rules)
  const memo = new Map<string, number>()
  let ev = 0
  for (const b of BUCKETS) {
    let v: number
    const pairAgain = b === pairBucket
    if (pairBucket === 11) {
      // Split aces: one card, forced stand (MA §11(c)(2)); resplit only another ace if allowed
      const [t] = stateAfter(11, true, b)
      v = standEV(t, d)
      if (pairAgain && rules.resplitAces && handsFormed < rules.maxSplitHands) {
        v = Math.max(v, 2 * postSplitHandEV(11, up, rules, handsFormed + 1))
      }
    } else {
      const [t, s] = stateAfter(pairBucket, false, b)
      const standV = standEV(t, d)
      v = t >= 21 ? standV : Math.max(standV, hitEV(t, s, d, memo))
      if (t < 21 && rules.doubleAfterSplit) {
        const inRange
          = rules.doubleOn === 'any2'
            || (rules.doubleOn === '9-11' && !s && t >= 9 && t <= 11)
            || (rules.doubleOn === '10-11' && !s && (t === 10 || t === 11))
        if (inRange) v = Math.max(v, doubleEV(t, s, d))
      }
      if (pairAgain && handsFormed < rules.maxSplitHands) {
        v = Math.max(v, 2 * postSplitHandEV(pairBucket, up, rules, handsFormed + 1))
      }
    }
    ev += PROB[b] * v
  }
  splitMemo.set(key, ev)
  return ev
}

export interface PairState {
  pair: Bucket
  total: number
  soft: boolean
}

/** bestAction extended with the split option for pair hands. */
export function bestActionFull(state: PairState, up: Bucket, rules: RuleSet): Recommendation {
  const base = bestAction({ total: state.total, soft: state.soft, twoCards: true, fromSplit: false }, up, rules)
  const sEV = splitEV(state.pair, up, rules)
  const evs: ActionEVs = { ...base.evs, split: sEV }
  const baseBest = base.evs[base.action]!
  if (sEV > baseBest) return { action: 'split', evs }
  return { action: base.action, evs }
}

export type ChartCode = 'H' | 'S' | 'D' | 'Ds' | 'P' | 'Rh' | 'Rs' | 'Rp'

export interface StrategyChart {
  hard: Record<number, Record<Bucket, ChartCode>>
  soft: Record<number, Record<Bucket, ChartCode>>
  pairs: Record<Bucket, Record<Bucket, ChartCode>>
}

function codeFor(evs: ActionEVs, action: Recommendation['action']): ChartCode {
  if (action === 'surrender') {
    // composite: surrender, else best remaining
    const rest: Array<[Recommendation['action'], number]> = [['stand', evs.stand], ['hit', evs.hit]]
    if (evs.double !== undefined) rest.push(['double', evs.double])
    if (evs.split !== undefined) rest.push(['split', evs.split])
    rest.sort((a, b) => b[1] - a[1])
    const fallback = rest[0]![0]
    return fallback === 'stand' ? 'Rs' : fallback === 'split' ? 'Rp' : 'Rh'
  }
  if (action === 'double') return evs.stand >= evs.hit ? 'Ds' : 'D'
  if (action === 'split') return 'P'
  return action === 'stand' ? 'S' : 'H'
}

export function generateChart(rules: RuleSet): StrategyChart {
  const chart: StrategyChart = { hard: {}, soft: {}, pairs: {} as StrategyChart['pairs'] }
  for (let total = 5; total <= 20; total++) {
    chart.hard[total] = {} as Record<Bucket, ChartCode>
    for (const up of BUCKETS) {
      const rec = bestAction({ total, soft: false, twoCards: true, fromSplit: false }, up, rules)
      chart.hard[total]![up] = codeFor(rec.evs, rec.action)
    }
  }
  for (let total = 13; total <= 20; total++) {
    chart.soft[total] = {} as Record<Bucket, ChartCode>
    for (const up of BUCKETS) {
      const rec = bestAction({ total, soft: true, twoCards: true, fromSplit: false }, up, rules)
      chart.soft[total]![up] = codeFor(rec.evs, rec.action)
    }
  }
  for (const pair of BUCKETS) {
    chart.pairs[pair] = {} as Record<Bucket, ChartCode>
    const total = pair === 11 ? 12 : pair * 2
    const soft = pair === 11
    for (const up of BUCKETS) {
      const rec = bestActionFull({ pair, total, soft }, up, rules)
      chart.pairs[pair]![up] = codeFor(rec.evs, rec.action)
    }
  }
  return chart
}

/** Overall house edge of perfect basic strategy (deck-aware deal layer; see Modeling Notes). */
export function houseEdge(rules: RuleSet): number {
  const n = rules.decks
  const count: Record<Bucket, number> = {
    2: 4 * n, 3: 4 * n, 4: 4 * n, 5: 4 * n, 6: 4 * n,
    7: 4 * n, 8: 4 * n, 9: 4 * n, 10: 16 * n, 11: 4 * n
  }
  const total = 52 * n
  let ev = 0
  for (const b1 of BUCKETS) {
    for (const b2 of BUCKETS) {
      if (b2 < b1) continue
      const pPlayer = b1 === b2
        ? (count[b1] * (count[b1] - 1)) / (total * (total - 1))
        : (2 * count[b1] * count[b2]) / (total * (total - 1))
      if (pPlayer <= 0) continue
      for (const up of BUCKETS) {
        const upAvail = count[up] - (up === b1 ? 1 : 0) - (up === b2 ? 1 : 0)
        if (upAvail <= 0) continue
        const p = pPlayer * (upAvail / (total - 2))
        ev += p * dealtHandEV(b1, b2, up, rules, count, total)
      }
    }
  }
  return -ev
}

function totalOf(b1: Bucket, b2: Bucket): { total: number, soft: boolean } {
  const [t0, a0] = addCard(0, 0, b1)
  const [t1, a1] = addCard(t0, a0, b2)
  return { total: t1, soft: a1 > 0 }
}

function dealtHandEV(
  b1: Bucket, b2: Bucket, up: Bucket, rules: RuleSet,
  count: Record<Bucket, number>, totalCards: number
): number {
  const playerBJ = (b1 === 11 && b2 === 10) || (b1 === 10 && b2 === 11)
  const holeNeeded: Bucket | null = up === 11 ? 10 : up === 10 ? 11 : null
  let pDealerBJ = 0
  if (holeNeeded !== null) {
    const avail = count[holeNeeded]
      - (holeNeeded === b1 ? 1 : 0) - (holeNeeded === b2 ? 1 : 0) - (holeNeeded === up ? 1 : 0)
    pDealerBJ = Math.max(0, avail) / (totalCards - 3)
  }
  const bjRatio = blackjackPayoutRatio(rules.blackjackPayout)
  const bjPayLocal = bjRatio.num / bjRatio.den
  if (playerBJ) return (1 - pDealerBJ) * bjPayLocal // dealer BJ → standoff (MA §7(b))

  const { total, soft } = totalOf(b1, b2)
  const pair = b1 === b2
  const rec = pair
    ? bestActionFull({ pair: b1, total, soft }, up, rules)
    : bestAction({ total, soft, twoCards: true, fromSplit: false }, up, rules)
  const postEV = rec.evs[rec.action]!

  if (!rules.dealerPeek) return postEV // unconditioned dist already charges dealer BJ
  return pDealerBJ * -1 + (1 - pDealerBJ) * postEV
}
