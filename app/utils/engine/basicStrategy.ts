import type { Bucket } from './cards'
import type { RuleSet } from './rules'
import type { Action } from './hand'
import { blackjackPayoutRatio } from './rules'

export const BUCKETS: Bucket[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** Draw probabilities over the ten buckets. */
export type Probs = Record<Bucket, number>

/**
 * Fresh-shoe bucket weights, used for shoe-average summaries (the Learn page's dealer-bust
 * rate across upcards). The play model does NOT read this — it derives its own vector from
 * `probsFor`, which knows the deck count and the cards already out.
 */
export const PROB: Probs = {
  2: 4 / 52, 3: 4 / 52, 4: 4 / 52, 5: 4 / 52, 6: 4 / 52,
  7: 4 / 52, 8: 4 / 52, 9: 4 / 52, 10: 16 / 52, 11: 4 / 52
}

/** Bucket counts in a fresh shoe of `decks` decks. */
function baseComposition(decks: number): Record<Bucket, number> {
  return {
    2: 4 * decks, 3: 4 * decks, 4: 4 * decks, 5: 4 * decks, 6: 4 * decks,
    7: 4 * decks, 8: 4 * decks, 9: 4 * decks, 10: 16 * decks, 11: 4 * decks
  }
}

/**
 * Draw probabilities for a `decks`-deck shoe with `removed` buckets taken out. `removed` is a
 * multiset — pass a bucket twice to remove two cards. Counts clamp at zero and the vector is
 * renormalized, so an over-removed bucket simply becomes unreachable.
 *
 * This is the first-order "effect of removal at the top of the hand" model (see the round-four
 * spec): the recursion below runs at a FIXED composition, it is just the right composition for
 * the shoe and the cards you already know are out. It is not a full composition-dependent
 * analyzer, which would re-derive probabilities at every draw.
 */
export function probsFor(decks: number, removed: readonly Bucket[] = []): Probs {
  const count = baseComposition(decks)
  for (const b of removed) count[b] = Math.max(0, count[b] - 1)
  const total = BUCKETS.reduce((s, b) => s + count[b], 0)
  const out = {} as Probs
  for (const b of BUCKETS) out[b] = total > 0 ? count[b] / total : 0
  return out
}

/** Cache identity for a composition: deck count plus the sorted removed multiset. */
function compositionKey(decks: number, removed: readonly Bucket[]): string {
  return `${decks}:${[...removed].sort((a, b) => a - b).join('-')}`
}

/**
 * The composition a decision is priced against, built ONCE and passed down.
 *
 * Round four's first cut threaded composition as an optional trailing `removed` argument through
 * seven exported functions, each with its own default. Six call sites then re-derived the same
 * pair/non-pair branch by hand, and they drifted: the chart's pair row and hard row could price
 * the same total differently, and the advisor graded a hand differently depending on whether
 * Split happened to be legal. Carrying the composition as a value removes the defaults, so the
 * surfaces agree by construction rather than by six copies of a convention.
 */
export interface EvalContext {
  rules: RuleSet
  up: Bucket
  /** Every bucket known to be out of the shoe — always the upcard, plus the player's own cards
   *  when the governing chart row knows them (that is, a pair row). */
  known: readonly Bucket[]
  /** Cache identity for `known` under these rules. */
  key: string
}

export function evalContext(
  rules: RuleSet, up: Bucket, playerKnown: readonly Bucket[] = []
): EvalContext {
  const known = [up, ...playerKnown]
  return { rules, up, known, key: compositionKey(rules.decks, known) }
}

/**
 * THE rule for which composition governs a hand — the single definition the chart, the advisor,
 * the bots and the drills all share.
 *
 * A **pair row** legitimately knows the player holds two of a rank, and pricing it that way is
 * what lets the model reach single-deck book plays a total-dependent read cannot (6,6 v 2 splits,
 * 4,4 v 5 doubles). Every other row knows only a total, so it removes the upcard alone. The two
 * answers can differ for the same total at one deck — that is composition-dependent play, it is
 * intentional, and the chart says so under itself.
 *
 * `pair` must be decided by WHAT THE PLAYER HOLDS, never by whether Split happens to be legal.
 * Keying it off legality graded the same two cards against two different shoes depending on the
 * bankroll or the split cap, which is exactly the drift this type was introduced to remove
 * (round-four review — the first cut of this refactor still had it).
 */
export function contextForHand(
  rules: RuleSet, up: Bucket, pair: Bucket | null
): EvalContext {
  return pair === null ? evalContext(rules, up) : evalContext(rules, up, [pair, pair])
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

/** DealerDist's keys never change; Object.keys() was rebuilding this array on every blend —
 *  ~56k allocations per houseEdge and ~14% of engine self time (round-five review). */
const DIST_KEYS: Array<keyof DealerDist> = [17, 18, 19, 20, 21, 'bust', 'blackjack']

function blend(into: DealerDist, from: DealerDist, weight: number): void {
  for (const k of DIST_KEYS) into[k] += from[k] * weight
}

/**
 * Memo caches are keyed by composition, so they no longer have the small fixed domain the
 * infinite-deck model's did — the Rule Explorer mints a new rule set on every toggle and nothing
 * evicts. Measured: 80 rule sets grew the heap ~28 MB.
 *
 * The first bound was a wholesale `clear()` past a limit, which review caught as worse than the
 * leak: one rule set's working set is larger than the limit, so the clear fired mid-computation
 * and threw away the entries actively in use. Measured thrashing — a fully cached repeat still
 * cost 6.6 ms, and interleaving two rule sets cost ~5 ms per pass.
 *
 * This is a two-generation cache instead. Past the limit the live map is demoted to `old` and a
 * fresh one starts; reads fall through to `old`, so the hot working set survives exactly one
 * eviction and memory is bounded at 2 × limit. Cheap, no per-entry bookkeeping, and it never
 * evicts what a single computation is holding.
 */
const MEMO_LIMIT = 30_000

class GenerationCache<K, V> {
  private live = new Map<K, V>()
  private old = new Map<K, V>()

  get(key: K): V | undefined {
    const hit = this.live.get(key)
    if (hit !== undefined) return hit
    const stale = this.old.get(key)
    if (stale === undefined) return undefined
    // Promote WITHOUT rotating. Routing this through set() let a pure read trip the rotation and
    // discard the very generation it was reading from — proven at LIMIT=10: one get() left
    // live=[A3], old=[B0..B9], and a key present a moment earlier returned undefined. That is the
    // mid-computation eviction the two-generation design exists to prevent (round-five review).
    // Deleting from `old` also stops a promoted key occupying a slot in both generations.
    this.old.delete(key)
    this.live.set(key, stale)
    return stale
  }

  set(key: K, value: V): V {
    // rotate only on a genuine miss, and only when the live generation is actually full
    if (this.live.size >= MEMO_LIMIT) {
      this.old = this.live
      this.live = new Map()
    }
    this.live.set(key, value)
    return value
  }
}

const completeMemo = new GenerationCache<string, DealerDist>()

/** Dealer finishes from (total, soft) per MA §12(b)/WA §9 drawing rules. */
function complete(
  total: number, acesAsEleven: number, h17: boolean, probs: Probs, probsKey: string
): DealerDist {
  if (total > 21) return { ...EMPTY, bust: 1 }
  const soft = acesAsEleven > 0
  const stands = total > 17 || (total === 17 && !(soft && h17))
  if (total >= 17 && stands) {
    const out = { ...EMPTY }
    out[total as 17 | 18 | 19 | 20 | 21] = 1
    return out
  }
  const key = `${total}|${soft}|${h17}|${probsKey}`
  const hit = completeMemo.get(key)
  if (hit) return hit
  const out = { ...EMPTY }
  for (const b of BUCKETS) {
    const [t, a] = addCard(total, acesAsEleven, b)
    blend(out, complete(t, a, h17, probs, probsKey), probs[b])
  }
  return completeMemo.set(key, out)
}

/**
 * Dealer outcome distribution for an upcard. With conditionNoBlackjack (peek model, MA §6(i)),
 * the blackjack-completing hole card is excluded and the remainder renormalized. `removed` names
 * the cards already out of the shoe — the upcard at minimum, plus the player's cards when the
 * caller knows them.
 */
export function dealerDistribution(ctx: EvalContext, conditionNoBlackjack: boolean): DealerDist {
  const { rules, up } = ctx
  const h17 = rules.dealerHitsSoft17
  const probsKey = ctx.key
  const probs = probsFor(rules.decks, ctx.known)
  const out = { ...EMPTY }
  const bjHole: Bucket | null = up === 11 ? 10 : up === 10 ? 11 : null
  const excluded = conditionNoBlackjack && bjHole !== null ? probs[bjHole] : 0
  const norm = 1 - excluded

  for (const hole of BUCKETS) {
    const isBlackjack = bjHole !== null && hole === bjHole
    if (isBlackjack) {
      if (!conditionNoBlackjack) out.blackjack += probs[hole]
      continue
    }
    const [t0, a0] = addCard(0, 0, up)
    const [t1, a1] = addCard(t0, a0, hole)
    // The dealer's own hole card is NOT removed before its subsequent draws — it is sampled with
    // replacement. That is a real approximation, and round-four review flagged it as the largest
    // one left. It is deliberate, and it was measured before being kept:
    //
    //   removing it moves 1-deck from -0.150% to -0.060% (published ~0.00, a clear gain) and
    //   reaches 7,7 v 10 = Stand, but it LOSES three published cells — soft 15 v 4 D->H at
    //   4/6/8 decks, A,8 v 5 Ds->S and hard 9 v 2 D->H at one deck — and moves every multi-deck
    //   edge ~0.02pp further from published. Net: one cell gained, three lost.
    //
    // This model ignores the player's own continuing removal, a bias pointing the other way.
    // Adding one second-order correction without the others makes the whole worse, which is what
    // those numbers show. Revisit only alongside a full composition-dependent analyzer.
    blend(out, complete(t1, a1, h17, probs, probsKey), probs[hole] / norm)
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

function hitEV(
  total: number, soft: boolean, d: DealerDist, memo: Map<string, number>, probs: Probs
): number {
  const key = `${total}|${soft}`
  const cached = memo.get(key)
  if (cached !== undefined) return cached
  let ev = 0
  for (const b of BUCKETS) {
    const [t, s] = stateAfter(total, soft, b)
    if (t > 21) {
      ev += probs[b] * -1
    } else {
      const standHere = standEV(t, d)
      const hitAgain = t === 21 ? -Infinity : hitEV(t, s, d, memo, probs)
      ev += probs[b] * Math.max(standHere, hitAgain)
    }
  }
  memo.set(key, ev)
  return ev
}

function doubleEV(total: number, soft: boolean, d: DealerDist, probs: Probs): number {
  let ev = 0
  for (const b of BUCKETS) {
    const [t] = stateAfter(total, soft, b)
    ev += probs[b] * 2 * standEV(t, d)
  }
  return ev
}

const distCache = new GenerationCache<string, DealerDist>()

/** Returns a COPY: the cached object is a module singleton shared by every caller, and handing
 *  out a live reference invites one caller's mutation to corrupt everyone's (round-four review).
 *  `blend()` mutates its target, so this is a real hazard rather than a theoretical one. */
export function distFor(ctx: EvalContext): DealerDist {
  const key = `${ctx.up}|${ctx.rules.dealerHitsSoft17}|${ctx.rules.dealerPeek}|${ctx.key}`
  const hit = distCache.get(key)
  if (hit) return { ...hit }
  return { ...distCache.set(key, dealerDistribution(ctx, ctx.rules.dealerPeek)) }
}

/** EVs (per unit of the original bet) for the non-split actions available in this state. */
export function actionEVs(state: TotalState, ctx: EvalContext): ActionEVs {
  const { rules } = ctx
  const d = distFor(ctx)
  const probs = probsFor(rules.decks, ctx.known)
  // a fresh Map per call, deliberately: sharing one across calls was measured SLOWER here
  // (94ms -> 131ms for six preset edges), because houseEdge evaluates ~550 distinct compositions
  // and a cross-call cache mostly misses while still paying to build its key
  const memo = new Map<string, number>()
  const evs: ActionEVs = {
    stand: standEV(state.total, d),
    hit: hitEV(state.total, state.soft, d, memo, probs)
  }
  if (state.twoCards && (!state.fromSplit || rules.doubleAfterSplit)) {
    const inRange
      = rules.doubleOn === 'any2'
        || (rules.doubleOn === '9-11' && !state.soft && state.total >= 9 && state.total <= 11)
        || (rules.doubleOn === '10-11' && !state.soft && (state.total === 10 || state.total === 11))
    if (inRange) evs.double = doubleEV(state.total, state.soft, d, probs)
  }
  // Half the wager, flat — which is exactly what round.ts settles, including under no-peek where
  // a surrendered hand keeps its half whatever the hole turns out to be.
  //
  // Under no-peek this makes surrender look better than its rivals, because they are charged the
  // dealer's natural through the unconditioned distribution and this is not — and the chart does
  // then recommend surrendering small hard totals against an ace. That is a REAL bug, but fixing
  // it means changing the settlement too (hold the wager like a blackjack, price it once the hole
  // is known, per MA §8's escrow). Model and engine have to move together; pricing a full-wager
  // loss the engine never takes would grade a correct surrender as a mistake and charge the
  // player for it. It lands as its own change, with round.ts.
  if (state.twoCards && !state.fromSplit && rules.surrender === 'late') evs.surrender = -0.5
  return evs
}

/**
 * The best action that is actually ON THE TABLE.
 *
 * `preferred` is what some policy wants — the book, or a persona's quirk. When the table does not
 * offer it, rank the remaining LEGAL actions by EV and take the best. Ranking only stand-vs-hit
 * is not enough: split aces with a resplit available offer exactly ['split','stand'], so a
 * two-way fallback returns 'hit', which the engine refuses and the round wedges.
 */
export function clampToLegal(
  preferred: Action, evs: ActionEVs, legal: readonly Action[]
): Action {
  if (legal.includes(preferred)) return preferred
  const ranked = (Object.entries(evs) as Array<[Action, number | undefined]>)
    .filter((entry): entry is [Action, number] => entry[1] !== undefined && legal.includes(entry[0]))
    .sort((a, b) => b[1] - a[1])
  return ranked[0]?.[0] ?? legal[0] ?? 'stand'
}

export interface Recommendation {
  action: 'hit' | 'stand' | 'double' | 'surrender' | 'split'
  evs: ActionEVs
}

export function bestAction(state: TotalState, ctx: EvalContext): Recommendation {
  const evs = actionEVs(state, ctx)
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

const splitMemo = new GenerationCache<string, number>()

/** Absolute EV (in original-bet units, both hands counted) of splitting pairBucket vs up. */
/** Resplitting means another card of that rank came out of the shoe. The recursion used to reuse
 *  the parent context, so a third or fourth split hand was priced with only the original two pair
 *  cards removed (round-four review). */
function deeperSplit(ctx: EvalContext, pairBucket: Bucket): EvalContext {
  const known = [...ctx.known, pairBucket]
  return { ...ctx, known, key: compositionKey(ctx.rules.decks, known) }
}

export function splitEV(pairBucket: Bucket, ctx: EvalContext, handsFormed = 2): number {
  return 2 * postSplitHandEV(pairBucket, ctx, handsFormed)
}

function postSplitHandEV(pairBucket: Bucket, ctx: EvalContext, handsFormed: number): number {
  const { rules, up } = ctx
  const key = `${pairBucket}|${up}|${handsFormed}|${rules.dealerHitsSoft17}|${rules.dealerPeek}|${rules.doubleAfterSplit}|${rules.doubleOn}|${rules.maxSplitHands}|${rules.resplitAces}|${ctx.key}`
  const cached = splitMemo.get(key)
  if (cached !== undefined) return cached
  const d = distFor(ctx)
  const probs = probsFor(rules.decks, ctx.known)
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
        v = Math.max(v, 2 * postSplitHandEV(11, deeperSplit(ctx, 11), handsFormed + 1))
      }
    } else {
      const [t, s] = stateAfter(pairBucket, false, b)
      const standV = standEV(t, d)
      v = t >= 21 ? standV : Math.max(standV, hitEV(t, s, d, memo, probs))
      if (t < 21 && rules.doubleAfterSplit) {
        const inRange
          = rules.doubleOn === 'any2'
            || (rules.doubleOn === '9-11' && !s && t >= 9 && t <= 11)
            || (rules.doubleOn === '10-11' && !s && (t === 10 || t === 11))
        if (inRange) v = Math.max(v, doubleEV(t, s, d, probs))
      }
      if (pairAgain && handsFormed < rules.maxSplitHands) {
        v = Math.max(v, 2 * postSplitHandEV(pairBucket, deeperSplit(ctx, pairBucket), handsFormed + 1))
      }
    }
    ev += probs[b] * v
  }
  return splitMemo.set(key, ev)
}

export interface PairState {
  pair: Bucket
  total: number
  soft: boolean
}

/** bestAction extended with the split option for pair hands. A pair state always knows its own
 *  composition, so the default removal takes both pair cards and the upcard out of the shoe. */
/** `hand` carries the real twoCards/fromSplit flags: hardcoding them dropped the caller's
 *  reality and priced post-split pairs with double and surrender available even where the rules
 *  forbid both, publishing an illegal EV table into the coach panel (round-four review). */
export function bestActionFull(
  state: PairState, ctx: EvalContext,
  flags: Pick<TotalState, 'twoCards' | 'fromSplit'> = { twoCards: true, fromSplit: false },
  handsFormed = 2
): Recommendation {
  const base = bestAction(
    { total: state.total, soft: state.soft, twoCards: flags.twoCards, fromSplit: flags.fromSplit }, ctx)
  const sEV = splitEV(state.pair, ctx, handsFormed)
  const evs: ActionEVs = { ...base.evs, split: sEV }
  const baseBest = base.evs[base.action]!
  if (sEV > baseBest) return { action: 'split', evs }
  return { action: base.action, evs }
}

/** A hand as the book reads it: a total, and whether it is a splittable pair. */
export interface BookHand {
  total: number
  soft: boolean
  twoCards: boolean
  fromSplit: boolean
  /** The pair's bucket when this hand is governed by a pair row, else null. */
  pair: Bucket | null
  /**
   * Hands that will exist at this spot AFTER the split — hence the default of 2 for a first
   * split, matching splitEV. Callers counting hands BEFORE the split must pass `length + 1`:
   * postSplitHandEV gates on `handsFormed < maxSplitHands` exactly as legalActions gates on
   * `handCountAtSpot < maxSplitHands`, but legalActions is asked one step earlier.
   *
   * Without it splitEV always priced the FIRST split, so a player deep in a resplit saw a ladder
   * that no longer exists; passing it off by one priced one rung MORE than the rules offer.
   */
  handsFormed?: number
}

/**
 * The one entry point for "what does the book say here". The chart, the advisor, the bots and the
 * drills all call this, so a hand cannot be priced one way on the Learn page and another at the
 * table. It resolves the governing composition through `contextForHand` and then prices it once.
 */
export function bookPlay(rules: RuleSet, up: Bucket, hand: BookHand): Recommendation {
  const ctx = contextForHand(rules, up, hand.pair)
  if (hand.pair !== null) {
    return bestActionFull(
      { pair: hand.pair, total: hand.total, soft: hand.soft }, ctx,
      { twoCards: hand.twoCards, fromSplit: hand.fromSplit }, hand.handsFormed)
  }
  return bestAction(hand, ctx)
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

/**
 * Total-dependent chart for these rules. Hard and soft rows know only the upcard, so that is all
 * they remove; pair rows also know the player's two cards. Deck-aware through `probsFor`, but
 * still total-dependent — a handful of single-deck composition-dependent exceptions (7,7 vs 10
 * the best known) are out of this model's reach and are named in the Learn page copy.
 */
export function generateChart(rules: RuleSet): StrategyChart {
  const chart: StrategyChart = { hard: {}, soft: {}, pairs: {} as StrategyChart['pairs'] }
  for (let total = 5; total <= 20; total++) {
    chart.hard[total] = {} as Record<Bucket, ChartCode>
    for (const up of BUCKETS) {
      const rec = bookPlay(rules, up, { total, soft: false, twoCards: true, fromSplit: false, pair: null })
      chart.hard[total]![up] = codeFor(rec.evs, rec.action)
    }
  }
  for (let total = 13; total <= 20; total++) {
    chart.soft[total] = {} as Record<Bucket, ChartCode>
    for (const up of BUCKETS) {
      const rec = bookPlay(rules, up, { total, soft: true, twoCards: true, fromSplit: false, pair: null })
      chart.soft[total]![up] = codeFor(rec.evs, rec.action)
    }
  }
  for (const pair of BUCKETS) {
    chart.pairs[pair] = {} as Record<Bucket, ChartCode>
    const total = pair === 11 ? 12 : pair * 2
    const soft = pair === 11
    for (const up of BUCKETS) {
      const rec = bookPlay(rules, up, { total, soft, twoCards: true, fromSplit: false, pair })
      chart.pairs[pair]![up] = codeFor(rec.evs, rec.action)
    }
  }
  return chart
}

/** Every rules field the edge model reads — the cache identity for houseEdge(). */
function edgeKey(r: RuleSet): string {
  return [
    r.decks, r.dealerHitsSoft17, r.dealerPeek, r.blackjackPayout, r.doubleOn,
    r.doubleAfterSplit, r.maxSplitHands, r.resplitAces, r.surrender
  ].join('|')
}

const houseEdgeCache = new GenerationCache<string, number>()

/**
 * How finely this model resolves a house edge, by deck count. Removal is applied once at the top
 * of the hand, which captures nearly all of the deck effect from four decks up (measured within
 * ~0.01pp of published) but overshoots at one deck by roughly 0.15pp in the player's favour —
 * far enough to flip the SIGN on a 1-deck 3:2 game. Surfaces use this to avoid presenting a
 * number the model cannot actually resolve (round-four review).
 */
export function edgeResolution(rules: RuleSet): number {
  return rules.decks === 1 ? 0.002 : 0.0005
}

/**
 * The house edge with its sign suppressed where the model cannot resolve it. Money math reads
 * this, not the raw figure: a raw −0.17% at one deck makes advantageEstimate positive at TC 0,
 * which prices a FLAT BET as +EV in the Bet Lab (round-four review).
 */
export function modelledEdge(rules: RuleSet): number {
  const edge = houseEdge(rules)
  return Math.abs(edge) < edgeResolution(rules) ? 0 : edge
}

/** Overall house edge of perfect basic strategy. The deal layer is exact (three cards drawn
 *  without replacement); the play that follows runs at the composition those three cards left. */
export function houseEdge(rules: RuleSet): number {
  const cacheKey = edgeKey(rules)
  const cached = houseEdgeCache.get(cacheKey)
  if (cached !== undefined) return cached
  const n = rules.decks
  const count = baseComposition(n)
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
  const edge = -ev
  return houseEdgeCache.set(cacheKey, edge)
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
  // CHOOSE the play the app actually teaches — bookPlay is the same call the chart and the
  // advisor make — then PRICE it with the deal layer's exact knowledge of all three cards.
  // Pricing an action the chart never recommends would advertise a player this app does not
  // train (round-four review).
  const chosen = bookPlay(rules, up, { total, soft, twoCards: true, fromSplit: false, pair: pair ? b1 : null }).action
  const exact = evalContext(rules, up, [b1, b2])
  const evs = pair
    ? bestActionFull({ pair: b1, total, soft }, exact).evs
    : bestAction({ total, soft, twoCards: true, fromSplit: false }, exact).evs
  const postEV = evs[chosen]!

  if (!rules.dealerPeek) return postEV // unconditioned dist already charges dealer BJ
  return pDealerBJ * -1 + (1 - pDealerBJ) * postEV
}
