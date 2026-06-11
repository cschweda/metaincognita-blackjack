import type { Card } from './cards'
import { bucketOf } from './cards'
import type { RuleSet } from './rules'
import type { Action, PlayHand } from './hand'
import { handTotal, isPair, legalActions } from './hand'
import type { RNG } from './rng'
import { bestAction, bestActionFull } from './basicStrategy'
import { dealerShouldDraw } from './dealer'

export type PersonaId = 'bea' | 'nancy' | 'mike' | 'ivan' | 'lou'

export interface Persona {
  id: PersonaId
  name: string
  flavor: string
  takesInsurance: boolean
  quips: Record<'win' | 'lose' | 'bust' | 'blackjack' | 'myth', string[]>
  nextBet(base: number, last: 'win' | 'lose' | 'push' | null, rules: RuleSet, rng: RNG): number
}

/** Book play via the EV engine — shared by Bea and Ivan. */
function bookAction(hand: PlayHand, handCount: number, up: Card, rules: RuleSet): Action {
  const legal = legalActions(hand, handCount, rules)
  if (legal.length === 0) return 'stand'
  if (legal.length === 1) return legal[0]!
  const upB = bucketOf(up)
  const { total, soft } = handTotal(hand.cards)
  const rec = isPair(hand.cards) && legal.includes('split')
    ? bestActionFull({ pair: bucketOf(hand.cards[0]!), total, soft }, upB, rules)
    : bestAction({ total, soft, twoCards: hand.cards.length === 2, fromSplit: hand.fromSplit }, upB, rules)
  if (legal.includes(rec.action as Action)) return rec.action as Action
  // recommended action unavailable (e.g. double on 3 cards): fall back to stand/hit by EV
  return rec.evs.stand >= rec.evs.hit ? 'stand' : 'hit'
}

function flatBet(base: number): number {
  return base
}

export const PERSONAS: Persona[] = [
  {
    id: 'bea',
    name: 'By-the-Book Bea',
    flavor: 'Retired math teacher. Laminated strategy card, decaf coffee, zero superstition.',
    takesInsurance: false,
    quips: {
      win: ['The chart provides.', 'Correct play, correct result. This time.', 'Variance is on sabbatical.'],
      lose: ['Right play, wrong card. Next hand.', 'I will lose this hand 8 times in 20. Knew that going in.', 'The book never promised tonight.'],
      bust: ['Drawing was still right.', 'Busts happen to disciplined people too.', 'I would hit that 16 again.'],
      blackjack: ['Three to two, thank you kindly.', 'Even I smile at that.', 'Statistically overdue is a myth — but appreciated.'],
      myth: ['The dealer is not "hot". The shoe has no memory.', 'Insurance? I teach math, dear.', 'Your seat does not change the cards.']
    },
    nextBet: base => flatBet(base)
  },
  {
    id: 'nancy',
    name: 'Never-Bust Nancy',
    flavor: 'Will not hit anything that can break. The dealer can do the busting, thank you.',
    takesInsurance: false,
    quips: {
      win: ['See? Patience.', 'Let the dealer bust — works every time.', 'I knew standing was right.'],
      lose: ['Seventeen beats me again. Rude.', 'Next shoe is mine.', 'I still think hitting is reckless.'],
      bust: ['I never bust. That is the whole point.', 'Busting is for gamblers.', 'Not me. Never me.'],
      blackjack: ['Even a careful girl gets lucky!', 'Snapper! No decisions needed.', 'That is the safest hand in the world.'],
      myth: ['Why would I ever risk busting at twelve?', 'The dealer always has a ten under there.', 'Hitting 14 is just donating.']
    },
    nextBet: base => flatBet(base)
  },
  {
    id: 'mike',
    name: 'Mimic-the-Dealer Mike',
    flavor: 'Figures the house wins, so he copies the house: hit to 17, never double, never split.',
    takesInsurance: false,
    quips: {
      win: ['Dealer rules, baby. Works for them, works for me.', 'Seventeen and legal.', 'House method, player money.'],
      lose: ['Even the house loses one sometimes?', 'Must have copied it wrong.', 'The casino owes me royalties.'],
      bust: ['Hey, dealers bust too.', 'Part of the system.', 'I regret nothing.'],
      blackjack: ['The house ALWAYS pays the house. Wait—', 'Natural! Just like the dealer gets.', 'Copy that.'],
      myth: ['Casinos hit to 17, so it must be optimal, right?', 'Doubling is how they get you.', 'Splitting just doubles your losses.']
    },
    nextBet: base => flatBet(base)
  },
  {
    id: 'ivan',
    name: 'Insurance Ivan',
    flavor: 'Plays decent blackjack, but an ace up makes him reach for his wallet. Every. Single. Time.',
    takesInsurance: true,
    quips: {
      win: ['And THAT is why you protect your hands.', 'Safety first pays again.', 'Premiums? I sleep at night.'],
      lose: ['Good thing I was insured. Oh. I wasn\'t.', 'Should have taken MORE insurance.', 'Risk management, people.'],
      bust: ['Uninsurable disaster.', 'That one was an act of God.', 'My agent will hear about this.'],
      blackjack: ['Even money! Lock it in!', 'Guaranteed profit is the only profit.', 'No suspense for Ivan.'],
      myth: ['Insurance is ALWAYS smart with a ten in your hand.', 'Even money is free money — can\'t lose!', 'You insure your car, why not your twenty?']
    },
    nextBet: base => flatBet(base)
  },
  {
    id: 'lou',
    name: 'Lucky Lou',
    flavor: 'Rides streaks, blames third base, never hits 16. The shoe owes him and he intends to collect.',
    takesInsurance: false,
    quips: {
      win: ['The heater is ON. Press it!', 'Told you the shoe turned.', 'My lucky chip never misses twice.'],
      lose: ['Third base took the dealer\'s bust card AGAIN.', 'Who shuffled this thing?', 'You cannot beat a cold shoe, kid.'],
      bust: ['That ten was YOURS, third base.', 'See what happens when the order changes?', 'I never bust on MY shoes.'],
      blackjack: ['BOOM. Streak city.', 'The comeback begins.', 'Lou. Is. BACK.'],
      myth: ['Never hit 16, kid — make the dealer work.', 'The shoe gets hot, everybody knows that.', 'New player mid-shoe? There goes the flow.']
    },
    nextBet: (base, last, rules, rng) => {
      let next = base
      if (last === 'win') next = base * 2
      else if (last === 'lose') next = Math.max(rules.minBet, Math.floor(base / 2 / 100) * 100)
      if (rng() < 0.15) next = Math.min(rules.maxBet, next + 500) // feeling lucky surcharge
      return Math.min(rules.maxBet, Math.max(rules.minBet, Math.floor(next / 100) * 100))
    }
  }
]

const personaById = new Map(PERSONAS.map(p => [p.id, p]))

export function decideFor(id: PersonaId, hand: PlayHand, handCount: number, dealerUp: Card, rules: RuleSet): Action {
  const legal = legalActions(hand, handCount, rules)
  if (legal.length === 0) return 'stand'
  if (legal.length === 1) return legal[0]!
  const { total, soft } = handTotal(hand.cards)
  switch (id) {
    case 'bea':
    case 'ivan':
      return bookAction(hand, handCount, dealerUp, rules)
    case 'nancy':
      return total >= 12 ? 'stand' : 'hit'
    case 'mike':
      return dealerShouldDraw(hand.cards, rules) ? 'hit' : 'stand'
    case 'lou': {
      if (total === 16 && !soft) return 'stand' // "never bust a 16"
      const book = bookAction(hand, handCount, dealerUp, rules)
      return book === 'surrender' ? 'hit' : book // surrender is for cowards
    }
  }
  // Authorized style fix: replaced unreachable `personaById.has(id) ? 'stand' : 'stand'`
  // with a plain return after the exhaustive switch (all PersonaId variants covered above).
  personaById.has(id) // keep reference to silence unused-import lint if needed
  return 'stand'
}
