/** Bet-ramp configuration for the Bet Lab and the opt-in table hints (spec:
 *  docs/superpowers/specs/2026-06-13-counting-trainer-expansion-design.md).
 *  Pure module — engine imports only; the math lands with the lab. */

import type { RuleSet } from './engine/rules'
import { BlackjackGame } from './engine/round'
import { CountTracker } from './engine/counting'
import { decideFor } from './engine/bots'
import { actionEVs } from './engine/basicStrategy'
import { handTotal } from './engine/hand'
import { bucketOf } from './engine/cards'

export interface BetRamp {
  /** One betting unit, in cents. */
  unitCents: number
  bankrollCents: number
  roundsPerHour: number
  /** Sit out (back-count) below TC +1 instead of betting the ≤0 step. */
  wongOut: boolean
  /** Bet units per true-count bucket: [≤0, +1, +2, +3, +4, ≥+5]. */
  steps: number[]
}

export const DEFAULT_RAMP: BetRamp = {
  unitCents: 2500,
  bankrollCents: 1_000_000,
  roundsPerHour: 70,
  wongOut: false,
  steps: [1, 2, 4, 6, 8, 12]
}

// ── math + simulation (pure; engine-driven; injectable seeds) ─────────────────

export interface TcFrequencies {
  /** P(round starts in bucket b), b = [≤0, +1, +2, +3, +4, ≥+5]; sums to 1. */
  freq: number[]
  /** Mean TC observed within each bucket (bucket index when unobserved). */
  meanTc: number[]
}

export interface RampStats {
  evPerRoundCents: number
  sdPerRoundCents: number
  evHourlyCents: number
  sdHourlyCents: number
  /** Rounds for expectation to equal one standard deviation; Infinity when EV ≤ 0. */
  n0Rounds: number
  /** Closed-form risk of ruin, clamped to [0, 1]. */
  ruin: number
}

export interface SimParams {
  rules: RuleSet
  ramp: BetRamp
  rounds: number
  trajectories: number
  seed: number
  sampleEvery: number
}

export interface SimBand {
  p5: number
  p25: number
  p50: number
  p75: number
  p95: number
}

export interface SimResult {
  ruinRate: number
  meanFinalCents: number
  /** Percentile bands of bankroll (cents) at each sample point, index 0 = start. */
  bands: SimBand[]
}

/** Per-round variance of a blackjack wager is ≈1.33 bet² (doubles/splits included) —
 *  the standard literature constant; documented as a model, not a measurement. */
const ROUND_VARIANCE = 1.33

/** Floored true count, clamped into the six ramp buckets. */
export function bucketForTc(tc: number): number {
  return Math.max(0, Math.min(5, Math.floor(tc)))
}

export function betForTc(ramp: BetRamp, tc: number, rules: RuleSet): number {
  const units = ramp.steps[bucketForTc(tc)] ?? 1
  const cents = Math.round(units * ramp.unitCents)
  return Math.max(rules.minBet, Math.min(rules.maxBet, cents))
}

/** Human half-deck estimate — mirrors useCounting's tray model. */
function decksLeft(rules: RuleSet, cardsSeen: number): number {
  const remaining = (rules.decks * 52 - cardsSeen) / 52
  return Math.max(0.5, Math.round(remaining * 2) / 2)
}

/** The count a bet may be sized on: when the cut card is out, the next round starts from a
 *  fresh shoe — a real counter sees the shuffle before wagering, so the dead count is void. */
export function bettingTc(
  shoe: { needsShuffle(): boolean }, tracker: CountTracker, rules: RuleSet
): number {
  if (shoe.needsShuffle()) return 0
  return tracker.trueCount(decksLeft(rules, tracker.cardsSeen))
}

interface CountedGame {
  game: BlackjackGame
  tracker: CountTracker
  unsubscribe: () => void
}

function countedGame(rules: RuleSet, seed: number): CountedGame {
  const game = new BlackjackGame(rules, { seed })
  const tracker = new CountTracker()
  const unsubscribe = game.on((e) => {
    if (e.type === 'count-visible-card') tracker.observe(e.card)
    else if (e.type === 'shuffle') tracker.reset()
  })
  return { game, tracker, unsubscribe }
}

/** Auto-play one round at perfect book (Bea is the engine's basic-strategy player);
 *  insurance taken only at TC ≥ +3 (Illustrious 18 #1). Returns the hero's net, cents.
 *  When bankrollCents is given, doubles/splits/insurance are capped to real money —
 *  like a live player, the book play degrades to the best affordable alternative. */
function playRound(cg: CountedGame, betCents: number, rules: RuleSet, bankrollCents?: number): number {
  const { game, tracker } = cg
  game.beginRound([{ spotId: 0, mainBet: betCents }])
  const committed = (): number => {
    const spot = game.spots[0]!
    return spot.hands.reduce((s, h) => s + (h.outcome === null ? h.bet : 0), 0)
      + (spot.insuranceBet ?? 0)
  }
  if (game.phase === 'insurance') {
    const spot = game.spots[0]!
    const tc = tracker.trueCount(decksLeft(rules, tracker.cardsSeen))
    const wanted = Math.floor(spot.hands[0]!.bet / 2)
    const affordable = bankrollCents === undefined || wanted <= bankrollCents - committed()
    game.insuranceDecision(0, tc >= 3 && affordable ? wanted : null)
    game.finishInsurance()
  }
  while (game.phase === 'playerTurns') {
    const spot = game.spots[0]!
    const hand = spot.hands[spot.activeHandIndex]!
    let action = decideFor('bea', hand, spot.hands.length, game.dealerUp!, rules)
    if (bankrollCents !== undefined && (action === 'double' || action === 'split')
      && hand.bet > bankrollCents - committed()) {
      if (action === 'split') {
        // an unsplittable pair is just a hard total — a maxed hand count forces that path
        action = decideFor('bea', hand, rules.maxSplitHands, game.dealerUp!, rules)
      }
      if (action === 'double' || action === 'split') {
        const { total, soft } = handTotal(hand.cards)
        const evs = actionEVs(
          { total, soft, twoCards: hand.cards.length === 2, fromSplit: hand.fromSplit },
          bucketOf(game.dealerUp!), rules)
        action = evs.stand >= evs.hit ? 'stand' : 'hit'
      }
    }
    game.act(0, action)
  }
  const spot = game.spots[0]!
  return spot.hands.reduce((s, h) => s + h.netResult, 0) + spot.insuranceNet
}

/** Measure the true-count distribution at round start by actually playing. */
export function tcFrequencies(rules: RuleSet, rounds: number, seed: number): TcFrequencies {
  const cg = countedGame(rules, seed)
  const counts = [0, 0, 0, 0, 0, 0]
  const tcSums = [0, 0, 0, 0, 0, 0]
  for (let r = 0; r < rounds; r++) {
    const tc = bettingTc(cg.game.shoe, cg.tracker, rules)
    const b = bucketForTc(tc)
    counts[b]!++
    tcSums[b]! += tc
    playRound(cg, rules.minBet, rules)
  }
  cg.unsubscribe()
  return {
    freq: counts.map(c => c / rounds),
    meanTc: counts.map((c, b) => (c === 0 ? b : tcSums[b]! / c))
  }
}

/** Closed-form expectation/variance/ruin for a ramp against a measured TC distribution.
 *  Edge model: edge(tc) = −houseEdge + 0.5%·tc (the count panel's quick (TC−1)·0.5%
 *  heuristic assumes a ~0.5% base edge; here we anchor to the preset's computed edge). */
export function rampStats(
  ramp: BetRamp, freqs: TcFrequencies, houseEdgeValue: number, rules: RuleSet
): RampStats {
  let ev = 0
  let variance = 0
  for (let b = 0; b < 6; b++) {
    if (ramp.wongOut && b === 0) continue // sitting out: no money on the felt
    const f = freqs.freq[b] ?? 0
    if (f === 0) continue
    const bet = Math.max(rules.minBet, Math.min(rules.maxBet, Math.round((ramp.steps[b] ?? 1) * ramp.unitCents)))
    const edge = -houseEdgeValue + 0.005 * (freqs.meanTc[b] ?? b)
    ev += f * bet * edge
    variance += f * bet * bet * ROUND_VARIANCE
  }
  const sd = Math.sqrt(variance)
  const evHourly = ev * ramp.roundsPerHour
  const sdHourly = sd * Math.sqrt(ramp.roundsPerHour)
  const n0 = ev > 0 ? (sd / ev) ** 2 : Infinity
  let ruin: number
  if (ev <= 0) ruin = 1
  else if (ev >= sd) ruin = 0
  else ruin = Math.min(1, Math.max(0, ((1 - ev / sd) / (1 + ev / sd)) ** (ramp.bankrollCents / sd)))
  return {
    evPerRoundCents: ev,
    sdPerRoundCents: sd,
    evHourlyCents: evHourly,
    sdHourlyCents: sdHourly,
    n0Rounds: n0,
    ruin
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[idx]!
}

/** Run N independent bankroll lifetimes through the real engine: book play, live count,
 *  ramp bets. Wonged-out rounds play a GHOST minimum bet — cards flow and the count moves,
 *  but the bankroll is untouched (the back-counting model: the table plays on without you). */
export function simulateTrajectories(
  params: SimParams, onProgress?: (fraction: number) => void
): SimResult {
  const { rules, ramp, rounds, trajectories, seed, sampleEvery } = params
  const sampleCount = Math.floor(rounds / sampleEvery)
  const series: number[][] = []
  let ruined = 0
  let finalSum = 0

  for (let t = 0; t < trajectories; t++) {
    const cg = countedGame(rules, seed + t * 7919)
    let bankroll = ramp.bankrollCents
    const samples: number[] = [bankroll]
    let dead = false
    for (let r = 0; r < rounds; r++) {
      if (!dead) {
        const tc = bettingTc(cg.game.shoe, cg.tracker, rules)
        const wonged = ramp.wongOut && bucketForTc(tc) === 0
        if (!wonged && bankroll < rules.minBet) {
          dead = true
        } else {
          const wanted = wonged ? rules.minBet : betForTc(ramp, tc, rules)
          const bet = wonged ? rules.minBet : Math.min(wanted, bankroll)
          const net = playRound(cg, Math.max(rules.minBet, bet), rules, wonged ? undefined : bankroll)
          if (!wonged) bankroll += net
          if (bankroll < rules.minBet) dead = true
        }
      }
      if ((r + 1) % sampleEvery === 0) samples.push(bankroll) // dead keeps its true residue
    }
    while (samples.length < sampleCount + 1) samples.push(samples[samples.length - 1]!)
    cg.unsubscribe()
    if (dead) ruined++
    finalSum += bankroll
    series.push(samples)
    if (onProgress && ((t + 1) % 5 === 0 || t + 1 === trajectories)) onProgress((t + 1) / trajectories)
  }

  const bands: SimBand[] = []
  for (let i = 0; i <= sampleCount; i++) {
    const column = series.map(s => s[i]!).sort((a, b) => a - b)
    bands.push({
      p5: percentile(column, 5),
      p25: percentile(column, 25),
      p50: percentile(column, 50),
      p75: percentile(column, 75),
      p95: percentile(column, 95)
    })
  }
  return { ruinRate: ruined / trajectories, meanFinalCents: finalSum / trajectories, bands }
}
