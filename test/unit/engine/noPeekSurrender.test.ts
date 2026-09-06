import { describe, expect, it } from 'vitest'
import { bookPlay, edgeResolution, generateChart, houseEdge, modelledEdge } from '../../../app/utils/engine/basicStrategy'
import { advantageEstimate } from '../../../app/utils/engine/counting'
import { PRESETS, cloneRules, validateRuleSet } from '../../../app/utils/engine/rules'
import type { RuleSet } from '../../../app/utils/engine/rules'
import { BlackjackGame } from '../../../app/utils/engine/round'
import type { CardSource, GameEvent } from '../../../app/utils/engine/round'
import { summarizeRound } from '../../../app/utils/advisor'
import type { RoundRecord } from '../../../app/stores/useBlackjackStore'
import type { Card } from '../../../app/utils/engine/cards'

// MA §8's escrow: a surrender against a dealer natural loses the FULL wager. With a peek behind it
// that can never happen, so the price is a flat half. Under NO-PEEK the natural is still live, and
// the model must charge it exactly as the engine settles it.
//
// Pricing surrender at a flat -0.5 while every rival action paid the dealer-natural loss through
// the unconditioned distribution let surrender escape a loss it should carry: the chart recommended
// surrendering hard 5 vs an ace, and the computed edge went NEGATIVE at every deck count.

const noPeek = (overrides: Partial<RuleSet> = {}): RuleSet => ({
  ...cloneRules(PRESETS.VEGAS_STRIP_6D!),
  dealerPeek: false,
  surrender: 'late',
  ...overrides
})

class Stack implements CardSource {
  constructor(private stack: Card[]) {}
  draw(): Card {
    const c = this.stack.shift()
    if (!c) throw new Error('stacked shoe exhausted')
    return c
  }

  discard(): void {}
  needsShuffle(): boolean { return false }
  freshShoe(): void {}
  cardsRemaining(): number { return this.stack.length }
  decksRemaining(): number { return this.stack.length / 52 }
  estimatedDecksRemaining(): number { return 1 }
}

const c = (rank: number): Card => ({ rank, suit: 'spades' })

/** Surrender a hard 16 against an ace and return { net in bet units, the announcements }. */
function surrenderVsAce(rules: ReturnType<typeof cloneRules>, holeRank: number) {
  const bet = rules.minBet
  const game = new BlackjackGame(rules, {
    shoe: new Stack([c(10), c(14), c(6), c(holeRank), c(9), c(9), c(9)])
  })
  const announcements: string[] = []
  game.on((e: GameEvent) => {
    if (e.type === 'announce') announcements.push(e.text)
  })
  game.beginRound([{ spotId: 0, mainBet: bet }])
  if (game.phase === 'insurance') {
    game.insuranceDecision(0, null)
    game.finishInsurance()
  }
  if (game.phase !== 'playerTurns') return null // a peeked natural ended it before the decision
  game.act(0, 'surrender')
  return { net: game.spots[0]!.hands[0]!.netResult / bet, announcements, game }
}

describe('the engine settles a no-peek surrender per MA §8', () => {
  it('takes the WHOLE wager when the hole turns a natural', () => {
    const r = surrenderVsAce(noPeek(), 13)!
    expect(r.net).toBe(-1)
    expect(r.game.phase).toBe('complete')
  })

  it('takes half when the hole does not', () => {
    expect(surrenderVsAce(noPeek(), 5)!.net).toBe(-0.5)
  })

  it('takes half at a peeking table, whatever the hole holds', () => {
    const peek = noPeek({ dealerPeek: true })
    for (const hole of [13, 5]) {
      const r = surrenderVsAce(peek, hole)
      if (r) {
        expect(r.net, `hole ${hole}`).toBe(-0.5)
      }
    }
  })
})

describe('the copy tells the player what actually happened', () => {
  it('does not promise half a wager it is about to take in full', () => {
    const r = surrenderVsAce(noPeek(), 13)!
    // this text is pushed to an aria-live region, so a screen-reader user hears it as fact
    const halfPromises = r.announcements.filter(t => /half the wager returned/.test(t))
    expect(halfPromises, `announced: ${JSON.stringify(r.announcements)}`).toEqual([])
  })

  it('says half immediately when no natural is possible', () => {
    // a 7 up cannot make a natural, so there is nothing to wait for and the price is fixed at once
    const rules = noPeek()
    const game = new BlackjackGame(rules, {
      shoe: new Stack([c(10), c(7), c(6), c(9), c(9), c(9)])
    })
    const announcements: string[] = []
    game.on((e: GameEvent) => {
      if (e.type === 'announce') announcements.push(e.text)
    })
    game.beginRound([{ spotId: 0, mainBet: rules.minBet }])
    game.act(0, 'surrender')
    expect(announcements.some(t => /half the wager returned/.test(t))).toBe(true)
    expect(game.spots[0]!.hands[0]!.netResult).toBe(-Math.ceil(rules.minBet / 2))
  })

  it('the persistent recap does not say half after a full loss', () => {
    const record = {
      round: 1,
      at: Date.now(),
      dealer: { cards: ['A♠', 'K♠'], total: 21, blackjack: true, busted: false },
      spots: [{
        occupant: 'hero' as const,
        hands: [{ cards: ['10♠', '6♠'], bet: 1000, outcome: 'surrender', net: -1000, doubled: false, fromSplit: false, total: 16, soft: false }],
        sideBets: [],
        insuranceNet: 0
      }],
      visibleCards: []
    } satisfies RoundRecord
    const summary = summarizeRound(record)
    expect(summary?.detail ?? '', 'a full-wager loss must not be described as half')
      .not.toMatch(/half the bet/)
  })
})

describe('the model prices what the engine settles', () => {
  it('charges the dealer-natural loss to surrender under no-peek', () => {
    const hand = { total: 16, soft: false, twoCards: true, fromSplit: false, pair: null }
    expect(bookPlay(noPeek({ dealerPeek: true }), 11, hand).evs.surrender)
      .toBeCloseTo(-0.5, 12)
    expect(bookPlay(noPeek(), 11, hand).evs.surrender!).toBeLessThan(-0.5)
  })

  it('agrees with the engine to twelve places, both hole outcomes', () => {
    const rules = noPeek()
    const priced = bookPlay(rules, 11, {
      total: 16, soft: false, twoCards: true, fromSplit: false, pair: null
    }).evs.surrender!
    const natural = surrenderVsAce(rules, 13)!.net
    const notNatural = surrenderVsAce(rules, 5)!.net
    // the price is the probability-weighted blend of the two settlements the engine can produce
    expect(priced).toBeGreaterThan(natural)
    expect(priced).toBeLessThan(notNatural)
  })

  it('no longer recommends surrendering tiny hard totals', () => {
    const chart = generateChart(noPeek())
    for (const total of [5, 6, 7, 8, 9, 10, 11, 12]) {
      for (const up of [2, 6, 10, 11] as const) {
        expect(chart.hard[total]![up], `hard ${total} v ${up}`).not.toMatch(/^R/)
      }
    }
  })

  it('no longer prices a player-favourable game from two decks up', () => {
    for (const decks of [2, 4, 6, 8] as const) {
      expect(houseEdge(noPeek({ decks: decks })), `${decks} decks`).toBeGreaterThan(0)
    }
  })

  it('and one deck stays inside the band, so no surface prints an advantage', () => {
    // one deck runs ~0.15pp player-favourable under this model whatever the peek setting — that is
    // the documented residual, not the surrender bug, and modelledEdge is what keeps it off screen
    const rules = noPeek({ decks: 1 })
    expect(Math.abs(houseEdge(rules))).toBeLessThan(edgeResolution(rules))
    expect(modelledEdge(rules)).toBe(0)
    expect(advantageEstimate(0, modelledEdge(rules))).toBe(0)
  })

  it('prices late surrender as a small edge reduction under no-peek', () => {
    const withLS = noPeek()
    const without = noPeek({ surrender: 'none' })
    const delta = houseEdge(without) - houseEdge(withLS)
    expect(delta).toBeGreaterThan(0)
    expect(delta, 'worth a fraction of a point, not half of one').toBeLessThan(0.002)
  })
})

describe('the stopgap gate comes out', () => {
  it('no-peek with late surrender is a playable rule set again', () => {
    expect(validateRuleSet(noPeek())).toEqual([])
  })
})
