import type { Card } from './cards'
import type { RuleSet } from './rules'
import type { Action, PlayHand } from './hand'
import { handTotal, isBlackjack, isBust, legalActions, newHand } from './hand'
import { dealerPlay } from './dealer'
import { Shoe } from './shoe'
import { mulberry32, randomSeed } from './rng'
import type { RNG } from './rng'
import {
  evaluate21Plus3, evaluateBuster, evaluateLuckyLadies, evaluateMatchTheDealer
} from './sideBets'
import type { SideBetResult } from './sideBets'

export class IllegalActionError extends Error {}

/** Structural slice of Shoe the game needs — tests inject stacked decks. */
export interface CardSource {
  draw(): Card
  discard(cards: Card[]): void
  needsShuffle(): boolean
  freshShoe(): void
  cardsRemaining(): number
  decksRemaining(): number
  estimatedDecksRemaining(): number
}

export type Phase = 'betting' | 'insurance' | 'playerTurns' | 'complete'

export type SideBetKind = 'twentyOnePlusThree' | 'luckyLadies' | 'matchTheDealer' | 'buster'

export interface SpotBet {
  spotId: number
  mainBet: number // cents
  sideBets?: Partial<Record<SideBetKind, number>>
}

export interface SettledHand extends PlayHand {
  /** net cents after settlement: + win, − loss, 0 push; set in settle() */
  netResult: number
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' | null
}

export interface SpotState {
  spotId: number
  hands: SettledHand[]
  activeHandIndex: number
  insuranceBet: number | null
  insuranceNet: number
  tookEvenMoney: boolean
  sideBets: Partial<Record<SideBetKind, number>>
  sideBetResults: Array<SideBetResult & { stake: number, net: number }>
}

export type GameEvent
  = { type: 'shuffle' }
    | { type: 'card-dealt', to: 'dealer-up' | 'dealer-hole' | 'dealer-draw' | { spotId: number, handIndex: number }, card: Card, faceUp: boolean }
    | { type: 'count-visible-card', card: Card }
    | { type: 'announce', text: string }
    | { type: 'phase', phase: Phase }
    | { type: 'peek-result', blackjack: boolean }
    | { type: 'hand-settled', spotId: number, handIndex: number, outcome: NonNullable<SettledHand['outcome']>, net: number }
    | { type: 'side-bet-settled', spotId: number, result: SideBetResult, net: number }
    | { type: 'insurance-settled', spotId: number, net: number }

export class BlackjackGame {
  phase: Phase = 'betting'
  spots: SpotState[] = []
  dealerCards: Card[] = []
  holeRevealed = false
  readonly shoe: CardSource

  private listeners: Array<(e: GameEvent) => void> = []

  constructor(public readonly rules: Readonly<RuleSet>, opts: { seed?: number, rng?: RNG, shoe?: CardSource } = {}) {
    const rng = opts.rng ?? mulberry32(opts.seed ?? randomSeed())
    this.shoe = opts.shoe ?? new Shoe(this.rules.decks, this.rules.penetration, rng)
  }

  get dealerUp(): Card | null {
    return this.dealerCards[0] ?? null
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e)
  }

  private setPhase(phase: Phase): void {
    this.phase = phase
    this.emit({ type: 'phase', phase })
  }

  private deal(to: 'dealer-up' | 'dealer-hole' | 'dealer-draw' | { spotId: number, handIndex: number }, faceUp: boolean): Card {
    const card = this.shoe.draw()
    this.emit({ type: 'card-dealt', to, card, faceUp })
    if (faceUp) this.emit({ type: 'count-visible-card', card })
    return card
  }

  private revealHole(): void {
    if (this.holeRevealed) return
    this.holeRevealed = true
    const hole = this.dealerCards[1]
    if (hole) {
      this.emit({ type: 'count-visible-card', card: hole })
      this.emit({ type: 'announce', text: `Dealer's card — ${handTotal(this.dealerCards).total}` })
    }
  }

  beginRound(bets: SpotBet[]): void {
    if (this.phase !== 'betting' && this.phase !== 'complete') throw new IllegalActionError(`cannot begin round in phase ${this.phase}`)
    if (!bets.length) throw new IllegalActionError('at least one spot must bet')
    for (const b of bets) {
      if (b.mainBet < this.rules.minBet || b.mainBet > this.rules.maxBet) {
        throw new IllegalActionError(`mainBet ${b.mainBet} outside table limits`)
      }
    }
    if (this.shoe.needsShuffle()) {
      this.shoe.freshShoe()
      this.emit({ type: 'shuffle' })
      this.emit({ type: 'announce', text: 'Shuffling — cut card in, first card burned' })
    }
    this.dealerCards = []
    this.holeRevealed = false
    this.spots = bets.map(b => ({
      spotId: b.spotId,
      hands: [],
      activeHandIndex: 0,
      insuranceBet: null,
      insuranceNet: 0,
      tookEvenMoney: false,
      sideBets: b.sideBets ?? {},
      sideBetResults: []
    }))

    // MA §6(d): one up to each box, one up to dealer, second up to each box, dealer hole down
    const firstCards = this.spots.map(s => this.deal({ spotId: s.spotId, handIndex: 0 }, true))
    this.dealerCards.push(this.deal('dealer-up', true))
    this.spots.forEach((spot, i) => {
      const second = this.deal({ spotId: spot.spotId, handIndex: 0 }, true)
      const bet = bets[i]!.mainBet
      spot.hands.push(this.asSettled(newHand([firstCards[i]!, second], bet)))
    })
    this.dealerCards.push(this.deal('dealer-hole', false))

    this.settleEarlySideBets()

    const upBucket = this.dealerUp ? handTotal([this.dealerUp]).total : 0
    const offerInsurance = this.rules.insurance && this.dealerUp?.rank === 14
    if (offerInsurance) {
      this.setPhase('insurance')
      this.emit({ type: 'announce', text: 'Insurance open — pays 2 to 1' })
      return
    }
    this.afterInsurance(upBucket === 10)
  }

  private asSettled(h: PlayHand): SettledHand {
    return { ...h, netResult: 0, outcome: null }
  }

  /** MA §23(e)/§24(d)/§28(e): 21+3, MTD settle right after the deal; Lucky Ladies after peek info exists. */
  private settleEarlySideBets(): void {
    for (const spot of this.spots) {
      const hand = spot.hands[0]!
      const pair: [Card, Card] = [hand.cards[0]!, hand.cards[1]!]
      const stake213 = spot.sideBets.twentyOnePlusThree ?? 0
      if (stake213 > 0 && this.rules.sideBets.twentyOnePlusThree !== 'off') {
        const result = evaluate21Plus3(pair, this.dealerUp!, this.rules.sideBets.twentyOnePlusThree)
        this.recordSideBet(spot, result, stake213)
      }
      const stakeMtd = spot.sideBets.matchTheDealer ?? 0
      if (stakeMtd > 0 && this.rules.sideBets.matchTheDealer) {
        const result = evaluateMatchTheDealer(pair, this.dealerUp!, this.rules.decks)
        this.recordSideBet(spot, result, stakeMtd)
      }
    }
  }

  private recordSideBet(spot: SpotState, result: SideBetResult, stake: number): void {
    const net = result.win ? Math.floor(stake * result.payoutMultiplier) : -stake
    spot.sideBetResults.push({ ...result, stake, net })
    this.emit({ type: 'side-bet-settled', spotId: spot.spotId, result, net })
  }

  insuranceDecision(spotId: number, decision: number | 'even-money' | null): void {
    if (this.phase !== 'insurance') throw new IllegalActionError('insurance is not open')
    const spot = this.requireSpot(spotId)
    const hand = spot.hands[0]!
    if (decision === 'even-money') {
      if (!this.rules.evenMoneyOffered || !isBlackjack(hand.cards, false)) {
        throw new IllegalActionError('even money requires a player blackjack and 3:2 rules (MA §7(c)-(d))')
      }
      spot.tookEvenMoney = true
      spot.insuranceBet = null
      return
    }
    if (decision === null) {
      spot.insuranceBet = null
      spot.tookEvenMoney = false
      return
    }
    if (decision <= 0 || decision > Math.floor(hand.bet / 2)) {
      throw new IllegalActionError('insurance is capped at half the wager (MA §9(b))')
    }
    spot.insuranceBet = decision
    spot.tookEvenMoney = false
  }

  finishInsurance(): void {
    if (this.phase !== 'insurance') throw new IllegalActionError('insurance is not open')
    this.resolvePeekAndContinue(true)
  }

  private afterInsurance(tenUp: boolean): void {
    const aceOrTenUp = tenUp || this.dealerUp?.rank === 14
    if (this.rules.dealerPeek && aceOrTenUp) {
      this.resolvePeekAndContinue(false)
      return
    }
    this.startPlayerTurns()
  }

  private resolvePeekAndContinue(fromInsurance: boolean): void {
    const dealerBJ = isBlackjack(this.dealerCards, false)
    if (this.rules.dealerPeek) this.emit({ type: 'peek-result', blackjack: dealerBJ })

    // Even money settles now, before peek outcome matters (MA §7(c))
    for (const spot of this.spots) {
      const hand = spot.hands[0]!
      if (spot.tookEvenMoney) {
        hand.netResult = hand.bet
        hand.outcome = 'blackjack'
        hand.resolved = true
        this.emit({ type: 'hand-settled', spotId: spot.spotId, handIndex: 0, outcome: 'blackjack', net: hand.bet })
      }
    }

    if (fromInsurance) {
      for (const spot of this.spots) {
        if (spot.insuranceBet) {
          spot.insuranceNet = dealerBJ ? spot.insuranceBet * 2 : -spot.insuranceBet
          this.emit({ type: 'insurance-settled', spotId: spot.spotId, net: spot.insuranceNet })
        }
      }
    }

    if (dealerBJ) {
      this.revealHole()
      this.settleLuckyLadies(true) // the 1000:1 Q♥-pair tier needs dealer-BJ knowledge (MA §24(f))
      for (const spot of this.spots) {
        this.settleBusterForSpot(spot, true)
      }
      this.settleAgainstDealerBlackjack()
      this.completeRound()
      return
    }
    this.startPlayerTurns()
  }

  private settleBusterForSpot(spot: SpotState, dealerHasBlackjack: boolean): void {
    const stake = spot.sideBets.buster ?? 0
    if (stake <= 0 || this.rules.sideBets.buster === 'off') return
    if (spot.sideBetResults.some(r => r.name === 'Buster')) return // once-only guard
    const result = evaluateBuster(this.dealerCards, dealerHasBlackjack, this.rules.sideBets.buster)
    this.recordSideBet(spot, result, stake)
  }

  private settleLuckyLadies(dealerHasBlackjack: boolean): void {
    for (const spot of this.spots) {
      const stake = spot.sideBets.luckyLadies ?? 0
      if (stake > 0 && this.rules.sideBets.luckyLadies !== 'off' && !spot.sideBetResults.some(r => r.name === 'Lucky Ladies')) {
        const hand = spot.hands[0]!
        const result = evaluateLuckyLadies([hand.cards[0]!, hand.cards[1]!], dealerHasBlackjack, this.rules.sideBets.luckyLadies)
        this.recordSideBet(spot, result, stake)
      }
    }
  }

  private settleAgainstDealerBlackjack(): void {
    for (const spot of this.spots) {
      const hand = spot.hands[0]!
      if (hand.resolved) continue // even-money hands
      if (isBlackjack(hand.cards, false)) {
        hand.netResult = 0
        hand.outcome = 'push' // standoff (MA §7(b))
      } else {
        hand.netResult = -hand.bet
        hand.outcome = 'lose'
      }
      hand.resolved = true
      this.emit({ type: 'hand-settled', spotId: spot.spotId, handIndex: 0, outcome: hand.outcome!, net: hand.netResult })
    }
  }

  private startPlayerTurns(): void {
    // Lucky Ladies needs dealer-BJ knowledge — reaching here means the peek said no (or up is 2-9)
    this.settleLuckyLadies(false)

    // Blackjacks vs 2-9 up (or post-peek no-BJ) pay immediately at 3:2/6:5 (MA §7(a)-(b))
    const bjPayNum = this.rules.blackjackPayout === '3:2' ? 3 : 6
    const bjPayDen = this.rules.blackjackPayout === '3:2' ? 2 : 5
    for (const spot of this.spots) {
      const hand = spot.hands[0]!
      if (!hand.resolved && isBlackjack(hand.cards, false)) {
        hand.netResult = Math.floor((hand.bet * bjPayNum) / bjPayDen)
        hand.outcome = 'blackjack'
        hand.resolved = true
        this.emit({ type: 'hand-settled', spotId: spot.spotId, handIndex: 0, outcome: 'blackjack', net: hand.netResult })
        this.emit({ type: 'announce', text: 'Blackjack!' })
      }
    }

    this.setPhase('playerTurns')
    this.advanceIfDone()
  }

  legalFor(spotId: number): Action[] {
    const spot = this.requireSpot(spotId)
    const hand = spot.hands[spot.activeHandIndex]
    if (!hand || this.phase !== 'playerTurns') return []
    return legalActions(hand, spot.hands.length, this.rules)
  }

  act(spotId: number, action: Action): void {
    if (this.phase !== 'playerTurns') throw new IllegalActionError(`cannot act in phase ${this.phase}`)
    const spot = this.requireSpot(spotId)
    const hand = spot.hands[spot.activeHandIndex]
    if (!hand) throw new IllegalActionError('no active hand at spot')
    if (!this.legalFor(spotId).includes(action)) throw new IllegalActionError(`illegal action: ${action}`)

    switch (action) {
      case 'hit': {
        hand.cards.push(this.deal({ spotId, handIndex: spot.activeHandIndex }, true))
        const { total } = handTotal(hand.cards)
        this.emit({ type: 'announce', text: `${total}` })
        if (total >= 21) this.finishHand(spot, hand)
        break
      }
      case 'stand': {
        this.finishHand(spot, hand)
        break
      }
      case 'double': {
        hand.doubled = true
        hand.bet *= 2
        hand.cards.push(this.deal({ spotId, handIndex: spot.activeHandIndex }, true)) // face up, MA §10(c) default
        this.finishHand(spot, hand)
        break
      }
      case 'surrender': {
        hand.surrendered = true
        hand.netResult = -Math.ceil(hand.bet / 2)
        hand.outcome = 'surrender'
        this.emit({ type: 'announce', text: 'Surrender — half the wager returned' })
        this.emit({ type: 'hand-settled', spotId, handIndex: spot.activeHandIndex, outcome: 'surrender', net: hand.netResult })
        this.finishHand(spot, hand)
        break
      }
      case 'split': {
        const [a, b] = hand.cards
        const aces = a!.rank === 14 && b!.rank === 14
        const first = newHand([a!], hand.bet, { fromSplit: true, splitAces: aces || hand.splitAces })
        const second = newHand([b!], hand.bet, { fromSplit: true, splitAces: aces || hand.splitAces })
        spot.hands.splice(spot.activeHandIndex, 1, this.asSettled(first), this.asSettled(second))
        // MA §11(b): complete the first hand before the next — deal its second card now
        const active = spot.hands[spot.activeHandIndex]!
        active.cards.push(this.deal({ spotId, handIndex: spot.activeHandIndex }, true))
        if (active.splitAces && !this.canResplitAces(active, spot)) this.finishHand(spot, active)
        else if (handTotal(active.cards).total === 21) this.finishHand(spot, active)
        break
      }
    }
    this.advanceIfDone()
  }

  private canResplitAces(hand: SettledHand, spot: SpotState): boolean {
    return this.rules.resplitAces
      && hand.cards.length === 2
      && hand.cards[0]!.rank === 14 && hand.cards[1]!.rank === 14
      && spot.hands.length < this.rules.maxSplitHands
  }

  private finishHand(spot: SpotState, hand: SettledHand): void {
    hand.resolved = true
    if (isBust(hand.cards) && !hand.surrendered) {
      hand.netResult = -hand.bet
      hand.outcome = 'lose'
      this.emit({ type: 'announce', text: 'Bust' })
      this.emit({ type: 'hand-settled', spotId: spot.spotId, handIndex: spot.hands.indexOf(hand), outcome: 'lose', net: hand.netResult })
    }
    // move to the next unresolved hand at this spot, dealing its second card if it's a fresh split hand
    spot.activeHandIndex = spot.hands.findIndex(h => this.isPlayable(h))
    const nh = spot.hands[spot.activeHandIndex]
    if (nh && nh.cards.length === 1) {
      nh.cards.push(this.deal({ spotId: spot.spotId, handIndex: spot.activeHandIndex }, true))
      if (nh.splitAces && !this.canResplitAces(nh, spot)) this.finishHand(spot, nh)
      else if (handTotal(nh.cards).total === 21) this.finishHand(spot, nh)
    }
  }

  private isPlayable(hand: SettledHand): boolean {
    return !hand.resolved && hand.outcome === null
  }

  private advanceIfDone(): void {
    if (this.phase !== 'playerTurns') return
    const anyPending = this.spots.some(s => s.hands.some(h => this.isPlayable(h)))
    if (anyPending) return
    this.playDealerAndSettle()
  }

  private playDealerAndSettle(): void {
    const busterLive = this.spots.some(s => (s.sideBets.buster ?? 0) > 0) && this.rules.sideBets.buster !== 'off'
    const liveHands = this.spots.flatMap(s => s.hands).filter(h => h.outcome === null && !h.surrendered && !isBust(h.cards))

    // MA §12(c): no draw when it cannot matter — unless a Buster wager forces completion (MA §27(f)(3))
    if (liveHands.length > 0 || busterLive) {
      this.revealHole()
      this.dealerCards = dealerPlay(this.dealerCards, () => {
        const card = this.shoe.draw()
        this.emit({ type: 'card-dealt', to: 'dealer-draw', card, faceUp: true })
        this.emit({ type: 'count-visible-card', card })
        return card
      }, this.rules)
      this.emit({ type: 'announce', text: `Dealer ${isBust(this.dealerCards) ? 'busts' : handTotal(this.dealerCards).total}` })
    }

    const dealerTotal = handTotal(this.dealerCards).total
    const dealerBusted = dealerTotal > 21
    for (const spot of this.spots) {
      spot.hands.forEach((hand, i) => {
        if (hand.outcome !== null) return // settled earlier (BJ, surrender, bust, even money)
        const t = handTotal(hand.cards).total
        const fiveCard21 = this.rules.fiveCard21Pays2to1 && t === 21 && hand.cards.length >= 5
        let net: number
        let outcome: NonNullable<SettledHand['outcome']>
        if (fiveCard21) {
          net = hand.bet * 2 // MA §16(a)
          outcome = 'win'
        } else if (dealerBusted || t > dealerTotal) {
          net = hand.bet
          outcome = 'win'
        } else if (t < dealerTotal) {
          net = -hand.bet
          outcome = 'lose'
        } else {
          net = 0
          outcome = 'push'
        }
        hand.netResult = net
        hand.outcome = outcome
        this.emit({ type: 'hand-settled', spotId: spot.spotId, handIndex: i, outcome, net })
      })

      this.settleBusterForSpot(spot, false)
    }
    this.completeRound()
  }

  private completeRound(): void {
    this.revealHole() // table practice: hole card is exposed at cleanup — counters get to see it
    const all = [
      ...this.spots.flatMap(s => s.hands.flatMap(h => h.cards)),
      ...this.dealerCards
    ]
    this.shoe.discard(all)
    this.setPhase('complete')
  }

  private requireSpot(spotId: number): SpotState {
    const spot = this.spots.find(s => s.spotId === spotId)
    if (!spot) throw new IllegalActionError(`unknown spot ${spotId}`)
    return spot
  }
}
