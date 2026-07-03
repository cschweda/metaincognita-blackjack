/** The learn page's prose content, kept out of the component (guidelines §2.2: the page is
 *  structure; knowledge lives here). Anything numeric takes EngineFacts so every figure is
 *  computed from the live rules, never transcribed. */

/** Engine-derived figures the essays interpolate — built by the learn page per active rules. */
export interface EngineFacts {
  /** 6:5 vs 3:2 house-edge delta, percent, one decimal. */
  payoutDeltaPct: string
  /** H17 vs S17 house-edge delta, percent, one decimal. */
  h17DeltaPct: string
  /** DAS-on vs DAS-off house-edge delta, percent, two decimals. */
  dasDeltaPct: string
  /** Dealer bust frequency across up-cards, whole percent. */
  dealerBustPct: number
  /** Costs of standing/hitting hard 16 vs a ten, whole percent of stake. */
  sixteenVsTen: { standLoss: number, hitLoss: number }
}

/** Accurate, source-honest history — the README essay, condensed to era cards
 *  (the family pattern from flameout's learn page). Contested lore is flagged as lore. */
export function historyEras(f: EngineFacts) {
  return [
    {
      era: 'c. 1601',
      title: 'Ventiuna — Cervantes deals first',
      body: 'The earliest known reference to twenty-one is Spanish: Cervantes\' card cheats in Rinconete y Cortadillo play "ventiuna" — reach twenty-one without going over, ace counting one or eleven. The game\'s skeleton is four centuries old.'
    },
    {
      era: '1700s',
      title: 'Vingt-et-un in the salons',
      body: 'France refines the game as vingt-et-un. Tradition ties it to the court of Louis XV and to Napoleon — thin documentation, but a measure of its fashion. French colonists carry it to New Orleans and the riverboats take it upstream.'
    },
    {
      era: 'c. 1900–1931',
      title: 'How twenty-one became "blackjack"',
      body: 'The famous story: gambling halls paid a 10:1 bonus when your two-card 21 was the ace of spades plus a black jack, and the bonus named the game. Historians note "blackjack" shows up in Klondike-era mining slang first — treat the bonus tale as legend. Nevada licensed the game as blackjack in 1931, and the name stuck.'
    },
    {
      era: '1956',
      title: 'The Four Horsemen of Aberdeen',
      body: 'Four Army mathematicians — Baldwin, Cantey, Maisel, McDermott — spend 18 months on desk calculators and publish the first accurate basic strategy in the Journal of the American Statistical Association. Played perfectly, the house edge nearly vanishes. Almost nobody believes them.'
    },
    {
      era: '1962',
      title: 'Thorp proves the deck remembers',
      body: 'Edward O. Thorp re-runs the math on an IBM 704 and publishes Beat the Dealer: removed cards change the odds, so the player can know when the shoe favors them. Casinos briefly rewrite the rules in panic, then revert when the tables empty.'
    },
    {
      era: '1963–66',
      title: 'Hi-Lo arrives',
      body: 'Harvey Dubner presents the Hi-Lo count; Julian Braun\'s IBM computations refine it; Thorp folds it into the revised Beat the Dealer. Later writers — Stanford Wong, Don Schlesinger (the Illustrious 18 this trainer teaches) — turn it into the standard practical system.'
    },
    {
      era: '1970s–90s',
      title: 'Teams, courts, and countermeasures',
      body: 'Ken Uston\'s big-player teams win millions; New Jersey\'s Supreme Court rules (Uston v. Resorts International, 1982) that Atlantic City casinos cannot bar counters. Casinos answer with more decks, earlier shuffles, and cameras. The MIT teams run the playbook into the \'90s — later mythologized in Bringing Down the House and the film 21.'
    },
    {
      era: 'Today',
      title: 'The arms race you practice against',
      body: `Six- and eight-deck shoes, shallow penetration, continuous shufflers, and 6:5 blackjack payouts (spreading since the early 2000s, ≈ +${f.payoutDeltaPct}% to the edge). Every preset here is built from a real rulebook — including the 6:5 single-deck trap, kept on purpose as the teaching example.`
    }
  ]
}

/** The question the timeline raises — answered honestly (same content as the README essay). */
export function viability(f: EngineFacts) {
  return {
    intro: 'The math still works — multi-deck shoes never killed counting; true-count conversion exists precisely to handle them. What makes the modern game hard is everything else:',
    killers: [
      { name: 'Penetration', text: 'The cut card at 70–75% keeps the richest part of the shoe — where the count pays — from ever being dealt. The house controls this dial precisely.' },
      { name: 'Continuous shufflers', text: 'CSMs return cards after every round, so the count never accumulates. Counting a CSM table is dead — not harder, dead.' },
      { name: '6:5 payouts', text: `An extra ≈${f.payoutDeltaPct}% to the house that no count overcomes — now standard at many low-limit tables.` },
      { name: 'Surveillance economics', text: 'Profit requires betting 8–15× more in good counts — exactly the signature surveillance watches for. Counting with your brain is legal everywhere in the US; outside New Jersey, the casino can simply show you the door.' },
      { name: 'The wage math', text: 'Played expertly, the edge is ~0.5–1% of average action, and per-hour swings run ten-plus times the expected earn — months-long losing stretches happen while playing perfectly. The remaining winners are mostly bankrolled teams.' }
    ],
    bottomLine: 'So: counting is no longer a realistic income strategy — but it is an entirely realistic skill, and the cheapest tuition in gambling math there is. A typical tourist gives the house ~2%; perfect basic strategy cuts that to ~0.5% on a good 3:2 game; a competent count reaches roughly break-even. You play essentially free, with full understanding of why. That is this trainer\'s honest pitch.'
  }
}

export const VARIATIONS = [
  { name: 'Spanish 21', twist: 'All four tens removed; liberal doubling and bonus 21s', catch: 'Removing tens is worth roughly 2% to the house before bonuses claw some back' },
  { name: 'Pontoon (UK)', twist: 'Both dealer cards hidden; a five-card trick beats 20', catch: 'Ties lose to the dealer' },
  { name: 'European no-hole-card', twist: 'Dealer takes no hole card until players finish', catch: 'Doubles and splits lose in full to a dealer blackjack' },
  { name: 'Double Exposure', twist: 'Both dealer cards dealt face up', catch: 'Blackjack pays even money; ties lose' },
  { name: 'Blackjack Switch', twist: 'Two hands; you may swap their second cards', catch: 'Blackjack pays 1:1 and dealer 22 pushes' },
  { name: 'Free Bet', twist: '"Free" doubles and splits on the common totals', catch: 'Dealer 22 pushes everything' },
  { name: 'Super Fun 21', twist: 'Surrender any time; player 21 always wins', catch: 'Blackjack pays even money except in diamonds' }
]

export function tidbits(f: EngineFacts) {
  return [
    'Blackjack is the most-played casino table game in the United States — it overtook faro and craps mid-century and never gave the lead back.',
    'The edge isn\'t dealer skill — dealers make zero decisions. It\'s the double-bust asymmetry: you bust first, you lose, even if the dealer busts the same round.',
    `The dealer busts about ${f.dealerBustPct}% of rounds — basic strategy's "stand on a stiff vs a weak upcard" lines exist purely to harvest those busts.`,
    'Insurance is a side bet on the hole card being a ten, paying 2:1 on worse-than-2:1 odds. "Even money" is the same bet in disguise.',
    'No betting progression changes the EV of a single hand. Perfect basic strategy is worth more than every Martingale ever played.',
    'The Four Horsemen used hand-cranked desk calculators; Thorp needed an IBM 704. This trainer re-derives their charts in your browser and pins them in CI.'
  ]
}

export const HILO_ROWS = [
  { cards: '2 3 4 5 6', tag: '+1', value: 1 },
  { cards: '7 8 9', tag: '0', value: 0 },
  { cards: '10 J Q K A', tag: '−1', value: -1 }
] // mirrors engine hiLoValue — the unit suite pins those values

export function myths(f: EngineFacts) {
  return [
    {
      title: 'Third base controls the dealer',
      claim: '"A bad player at third base takes the dealer\'s bust card."',
      truth: 'The unseen card is equally likely to help or hurt — over all orderings the dealer\'s outcome distribution is identical. Lucky Lou will never believe this.'
    },
    {
      title: 'Hot dealers and cold shoes',
      claim: '"This dealer has been hot all night — switch tables."',
      truth: 'Cards have no memory between rounds beyond composition, and dealers make zero decisions. Streaks are what randomness looks like.'
    },
    {
      title: 'Insurance protects good hands',
      claim: '"Always insure a 20 — protect your hand!"',
      truth: 'Insurance is a separate bet on the hole card being a ten. With a 20 you hold two of the tens yourself — the insurance bet is even worse. Take it only at TC ≥ +3.'
    },
    {
      title: 'Due to win',
      claim: '"I\'ve lost six in a row — I\'m due."',
      truth: 'Every round is drawn from the same shoe distribution. The shoe owes you nothing; expected value is the only thing that converges.'
    },
    {
      title: 'Never bust — let the dealer do it',
      claim: '"Never hit a hand that can break."',
      truth: `Standing on 16 vs 10 loses ~${f.sixteenVsTen.standLoss}% of your stake; hitting loses ~${f.sixteenVsTen.hitLoss}%. Refusing to bust just means losing slowly to made dealer hands. Nancy's leak, quantified on the Analysis page.`
    }
  ]
}

export const PROCEDURE = [
  { step: 'Shuffle & cut', text: 'Plug, riffle, turn, strip, cut — then a player cuts the deck stack (MA §5(k)). The cut card goes in at the penetration depth.' },
  { step: 'Burn', text: 'The first card off the new shoe is burned face down — it never plays and never joins the count (MA §6(c)).' },
  { step: 'Deal order', text: 'First base to third base, one card up each, dealer up-card, second round, dealer hole card face down (MA §6(d); WA permits an alternative order).' },
  { step: 'Peek', text: 'With an ace or ten up, the dealer checks the hole card with a reader before play continues; insurance is offered first on an ace (MA §6(i), §9).' },
  { step: 'Hand signals', text: 'Brush the felt to hit, wave flat to stand — signals must be visible to the camera, voice alone is not enough (AC guide).' },
  { step: 'Cut card out', text: 'When the cut card appears mid-shoe, the current round finishes and the shoe is reshuffled (MA §5(h), §6(k)).' },
  { step: 'Announcements', text: 'The dealer announces point totals, blackjack, bust, and "Dealer\'s card" on the reveal — this app mirrors those calls in the live region.' }
]

export function glossary(f: EngineFacts) {
  return [
    ['Basic strategy', 'The EV-maximizing play for every hand vs every up-card, derived from the rules — no counting involved.'],
    ['Blackjack / natural', 'Ace + ten-value as the first two cards. Pays 3:2 (or 6:5 on bad tables). A split 21 is not a blackjack.'],
    ['Bust', 'Hand total over 21 — an immediate loss, even if the dealer later busts too.'],
    ['Cut card', 'A colored card placed at the penetration depth; when it comes out, the shoe gets reshuffled.'],
    ['DAS', `Double after split — being allowed to double a hand created by splitting. Worth about +${f.dasDeltaPct}% to the player.`],
    ['Deviation', 'A count-driven departure from basic strategy (e.g. stand 16 vs 10 at TC ≥ 0).'],
    ['Even money', 'Taking 1:1 on your blackjack against a dealer ace — mathematically identical to insuring it. Book says decline.'],
    ['H17 / S17', `Whether the dealer hits or stands on soft 17. H17 adds ≈${f.h17DeltaPct}% to the house edge.`],
    ['House edge', 'Long-run cost per unit wagered playing perfect basic strategy. The setup screen shows the model estimate per rule set.'],
    ['Penetration', 'How deep the shoe is dealt before reshuffle. Deeper = better for counters.'],
    ['Push', 'A tie — the bet is returned.'],
    ['Running count', 'Sum of Hi-Lo tags over every card you have seen this shoe.'],
    ['True count', 'Running count divided by estimated decks remaining — normalizes the count to shoe depth.'],
    ['Late surrender', 'Forfeit half the bet after the dealer confirms no blackjack. Correct only on a few of the worst hands.']
  ]
}
