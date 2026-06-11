import type { Bucket } from './cards'
import type { RuleSet } from './rules'

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
