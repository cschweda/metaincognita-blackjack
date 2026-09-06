export type BlackjackPayout = '3:2' | '6:5'
export type DoubleOn = 'any2' | '9-11' | '10-11'
export type SurrenderRule = 'none' | 'late'

export interface SideBetConfig {
  twentyOnePlusThree: 'off' | 'MA-A' | 'MA-B' | 'AC-XTREME' // MA §28(f); AC guide "21+3 Xtreme"
  luckyLadies: 'off' | 'MA-A' | 'MA-B' // MA §24(f) twenty-point bonus paytables
  matchTheDealer: boolean // MA §23 (deck-dependent pays)
  buster: 'off' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' // MA §27(g)
}

export interface RuleSet {
  name: string
  source: string // rulebook citation shown at setup
  decks: 1 | 2 | 4 | 6 | 8
  dealerHitsSoft17: boolean // MA §12(b)(2), WA §9.iii
  blackjackPayout: BlackjackPayout // MA §3(e)
  doubleOn: DoubleOn // MA §10(a) any2; WA note: operators may restrict
  doubleAfterSplit: boolean // MA §10(a) ("first two cards of any split pair")
  maxSplitHands: 2 | 3 | 4 // MA §11(e); WA: 3; AC guide: 3
  resplitAces: boolean // MA §11(e) operator option
  surrender: SurrenderRule // MA §8; AC guide; WA (operator option)
  dealerPeek: boolean // MA §6(i) card-reader peek vs §6(g)/(j) alternatives
  insurance: boolean // MA §9 (pays 2:1, max half wager)
  evenMoneyOffered: boolean // MA §7(c); void under 6:5 per §7(d)
  fiveCard21Pays2to1: boolean // MA §16 (optional rule, off by default)
  spots: 7 | 9 // WA §1 allows nine
  penetration: number // fraction of shoe dealt before cut card (0.5–0.9)
  minBet: number // cents
  maxBet: number // cents
  sideBets: SideBetConfig
}

const NO_SIDE_BETS: SideBetConfig = {
  twentyOnePlusThree: 'off',
  luckyLadies: 'off',
  matchTheDealer: false,
  buster: 'off'
}

const ALL_SIDE_BETS: SideBetConfig = {
  twentyOnePlusThree: 'MA-B',
  luckyLadies: 'MA-A',
  matchTheDealer: true,
  buster: 'A'
}

function freeze(rules: RuleSet): Readonly<RuleSet> {
  Object.freeze(rules.sideBets)
  return Object.freeze(rules)
}

export const PRESETS: Readonly<Record<string, Readonly<RuleSet>>> = Object.freeze({
  MA_205CMR: freeze({
    name: 'Massachusetts (205 CMR)',
    source: 'docs/Rules-Blackjack-10-08-2020.pdf',
    decks: 8,
    dealerHitsSoft17: false,
    blackjackPayout: '3:2',
    doubleOn: 'any2',
    doubleAfterSplit: true,
    maxSplitHands: 3, // §11(e): four hands only at ≤6-box tables — this preset plays 7 boxes
    resplitAces: false, // §11(e): licensee may prohibit — default prohibited
    surrender: 'late', // §8
    dealerPeek: true, // §6(i) card reader device
    insurance: true,
    evenMoneyOffered: true, // §7(c)
    fiveCard21Pays2to1: false, // §16 optional
    spots: 7,
    penetration: 0.75,
    minBet: 1000,
    maxBet: 50000,
    sideBets: { ...ALL_SIDE_BETS }
  }),
  AC_BALLYS: freeze({
    name: 'Atlantic City (Bally\'s)',
    source: 'docs/BLYS_AC-BlackJack-GamingGuide-4x9-Updated.pdf',
    decks: 8,
    dealerHitsSoft17: false,
    blackjackPayout: '3:2',
    doubleOn: 'any2',
    doubleAfterSplit: true,
    maxSplitHands: 3, // guide: "split again for a total of three hands"
    resplitAces: false, // guide: aces limited to one card each
    surrender: 'late', // guide surrender section
    dealerPeek: true,
    insurance: true,
    evenMoneyOffered: true, // guide: "In lieu of taking insurance..."
    fiveCard21Pays2to1: false,
    spots: 7,
    penetration: 0.75,
    minBet: 1500,
    maxBet: 100000,
    sideBets: { twentyOnePlusThree: 'AC-XTREME', luckyLadies: 'MA-A', matchTheDealer: true, buster: 'off' } // guide: "up to 125 to 1" + 1000:1 bonus = Table A
  }),
  WA_CARDROOM: freeze({
    name: 'Washington card room',
    source: 'docs/Blackjack Game Rules Revised April 2018 cc.pdf',
    decks: 6,
    dealerHitsSoft17: false, // WA §9.i default; H17 documented operator exception (§9.iii)
    blackjackPayout: '3:2', // WA defers payout to posted game rules; 3:2 is the posted default here
    doubleOn: 'any2',
    doubleAfterSplit: true,
    maxSplitHands: 3, // WA splitting: "into a third one"
    resplitAces: false,
    surrender: 'late', // WA surrender section (operator option)
    dealerPeek: true, // WA §6
    insurance: true,
    evenMoneyOffered: false, // not described in WA doc
    fiveCard21Pays2to1: false,
    spots: 9, // WA §1: up to nine players
    penetration: 0.7,
    minBet: 500,
    maxBet: 30000,
    sideBets: { ...NO_SIDE_BETS }
  }),
  VEGAS_STRIP_6D: freeze({
    name: 'Vegas Strip 6-deck',
    source: 'Classic benchmark game (6D, S17, DAS)',
    decks: 6,
    dealerHitsSoft17: false,
    blackjackPayout: '3:2',
    doubleOn: 'any2',
    doubleAfterSplit: true,
    maxSplitHands: 4,
    resplitAces: false,
    surrender: 'none',
    dealerPeek: true,
    insurance: true,
    evenMoneyOffered: true,
    fiveCard21Pays2to1: false,
    spots: 7,
    penetration: 0.8,
    minBet: 1000,
    maxBet: 100000,
    sideBets: { twentyOnePlusThree: 'MA-B', luckyLadies: 'off', matchTheDealer: false, buster: 'A' }
  }),
  SINGLE_DECK_65: freeze({
    name: 'Single deck 6:5',
    source: 'The "looks good, plays bad" teaching preset (1D, H17, 6:5)',
    decks: 1,
    dealerHitsSoft17: true,
    blackjackPayout: '6:5',
    doubleOn: 'any2',
    doubleAfterSplit: false,
    maxSplitHands: 4,
    resplitAces: false,
    surrender: 'none',
    dealerPeek: true,
    insurance: true,
    evenMoneyOffered: false, // MA §7(d): no even money under 6:5
    fiveCard21Pays2to1: false,
    spots: 7,
    penetration: 0.6,
    minBet: 1000,
    maxBet: 50000,
    sideBets: { ...NO_SIDE_BETS }
  }),
  CUSTOM: freeze({
    name: 'Custom',
    source: 'User-defined (editor seeds from Vegas Strip 6-deck)',
    decks: 6,
    dealerHitsSoft17: false,
    blackjackPayout: '3:2',
    doubleOn: 'any2',
    doubleAfterSplit: true,
    maxSplitHands: 4,
    resplitAces: false,
    surrender: 'late',
    dealerPeek: true,
    insurance: true,
    evenMoneyOffered: true,
    fiveCard21Pays2to1: false,
    spots: 7,
    penetration: 0.75,
    minBet: 1000,
    maxBet: 100000,
    sideBets: { ...ALL_SIDE_BETS }
  })
})

export function cloneRules(rules: Readonly<RuleSet>): RuleSet {
  return { ...rules, sideBets: { ...rules.sideBets } }
}

/** The posted blackjack payout as a ratio — the one source settlement and EV math derive from. */
export function blackjackPayoutRatio(payout: BlackjackPayout): { num: number, den: number } {
  return payout === '3:2' ? { num: 3, den: 2 } : { num: 6, den: 5 }
}

export function validateRuleSet(rules: RuleSet): string[] {
  const errors: string[] = []
  if (![1, 2, 4, 6, 8].includes(rules.decks)) errors.push('decks must be 1, 2, 4, 6 or 8 (MA §2(a))')
  if (rules.penetration < 0.5 || rules.penetration > 0.9) errors.push('penetration must be between 0.5 and 0.9')
  if (rules.minBet <= 0) errors.push('minBet must be positive')
  if (rules.maxBet < rules.minBet) errors.push('minBet cannot exceed maxBet')
  if (rules.evenMoneyOffered && rules.blackjackPayout !== '3:2') {
    errors.push('evenMoneyOffered requires 3:2 blackjack payout (MA §7(d))')
  }
  if (rules.evenMoneyOffered && !rules.insurance) {
    errors.push('evenMoneyOffered requires insurance (even money is an insurance variant, MA §7(c))')
  }
  if (![2, 3, 4].includes(rules.maxSplitHands)) errors.push('maxSplitHands must be 2, 3 or 4 (MA §11(e))')
  if (![7, 9].includes(rules.spots)) errors.push('spots must be 7 or 9 (WA §1)')
  return errors
}
