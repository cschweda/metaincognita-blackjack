# Metaincognita Blackjack — Game/Trainer Design

**Date:** 2026-06-11
**Status:** Approved by user (brainstorming sections 1–3), pending spec review
**Repo:** `/Volumes/satechi/webdev/metaincognita-blackjack`

## 1. Goal

A blackjack game/trainer in the metaincognita family (holdem, video poker, flameout, craps, pachinko) that is:

- **Family-consistent** — same look & feel, stack, conventions, and training formula as the sibling games.
- **Fully authentic** — rules, procedures, pay tables, and timing grounded in three official documents kept in `docs/`:
  - `Rules-Blackjack-10-08-2020.pdf` — Massachusetts Gaming Commission blackjack rules (205 CMR) — "MA"
  - `BLYS_AC-BlackJack-GamingGuide-4x9-Updated.pdf` — Bally's Atlantic City gaming guide — "AC"
  - `Blackjack Game Rules Revised April 2018 cc.pdf` — Washington State Gambling Commission — "WA"
- **Learning-centered** — basic strategy and Hi-Lo card counting as first-class training features, with the family formula: real-time advisor → per-decision EV feedback → history → analysis → learn (+ a drills page).
- **Fun** — bot table companions with personalities, casino-procedure presentation, subtle flair. Text-only (no audio), per family convention.

## 2. Scope decisions (user-approved)

| Decision | Choice |
|---|---|
| Training core | Basic strategy advisor **and** Hi-Lo counting, both v1 |
| Rule configuration | Named authentic presets **plus** full custom rules editor |
| Side bets (v1) | 21+3, Lucky Ladies / twenty-point bonus, Match the Dealer, Buster Blackjack |
| Table format | Player + 0–5 bot companions with personas |
| Presentation | "Casino procedure" mode vs "Quick play" mode — toggle over one engine |
| Bootstrap approach | Clone craps repo skeleton; port holdem card component + CSS tokens; engine written fresh as pure TS with TDD |

**Deferred to v2+** (explicitly out of scope for v1): bet-spread/bankroll coaching (risk-of-ruin lab, bet ramp by true count), additional side bets (streak, in-between, King's Bounty, progressive, blackjack bonus, multiple-action, TriLux), hand replay page (history detail view covers v1), light mode, audio, multiplayer, per-player multi-spot play (player plays exactly one spot in v1; bots fill others).

## 3. Stack & conventions (inherited)

- **Nuxt 4 / Vue 3 / Pinia 3 / @nuxt/ui 4 / Tailwind 4**, TypeScript, pnpm, Node 22.
- **Vitest** three-project setup from craps: `test/unit/`, `test/nuxt/` (happy-dom + @nuxt/test-utils), `test/e2e/` (Playwright).
- **@nuxt/eslint**, `vue-tsc` typecheck script.
- **Netlify** static SPA: `pnpm generate` → `dist`, craps' security headers/CSP, icons client-bundled (flameout v0.4.1 technique).
- **Dark mode only** (`colorMode.preference: 'dark'`, fallback dark).
- **Semver** from v0.1.0 + `CHANGELOG.md` (Keep a Changelog).
- **README** in family format with cross-links to sibling simulators; version in footer.
- localStorage key prefix: `blackjack-` (versioned, see §10).
- No analytics, no external runtime API calls (CSP `connect-src 'self'`).

### Repo layout

```
metaincognita-blackjack/
├── nuxt.config.ts            # from craps: CSP, colorMode, icon.clientBundle, SEO meta
├── netlify.toml              # pnpm generate → dist, NODE_VERSION=22
├── package.json              # name: metaincognita-blackjack, v0.1.0
├── vitest.config.ts          # unit / nuxt / e2e projects
├── CHANGELOG.md / README.md
├── docs/                     # the three rulebooks (committed; cited by engine comments)
│   └── superpowers/specs/    # this document
├── app/
│   ├── app.vue / app.config.ts
│   ├── assets/css/main.css   # holdem casino-luxury tokens (verbatim) + blackjack additions
│   ├── layouts/default.vue   # craps status-bar layout
│   ├── pages/                # index, table, history, analysis, learn, drills
│   ├── components/
│   │   ├── table/            # BlackjackTable.vue (SVG felt), DealerArea, SpotSeat, ChipStack
│   │   ├── cards/            # PlayingCard.vue (ported from holdem), HandDisplay
│   │   ├── panels/           # AdvisorPanel, CountPanel, StatsPanel, RulesPanel
│   │   ├── setup/            # SetupScreen, RulesEditor, PresetPicker, BotPicker
│   │   └── drills/           # StrategyFlash, CountDrill, TrueCountDrill, DeviationQuiz
│   ├── composables/          # useGameLoop, useAdvisor, useCounting, useAnnouncer
│   ├── stores/               # useBlackjackStore.ts (Pinia)
│   └── utils/                # PURE TS ENGINE — no Vue imports (see §4)
└── test/
    ├── unit/                 # engine tests incl. chart pinning + simulation test
    ├── nuxt/                 # component tests
    └── e2e/                  # Playwright flows
```

## 4. Engine (`app/utils/`, pure TypeScript)

Every module framework-free, unit-testable, with injectable RNG.

### 4.1 `rng.ts`
Mulberry32 seeded PRNG (flameout pattern). Live play seeds from `crypto.getRandomValues` (fallback `Math.random`); tests and simulations pass fixed seeds. All shuffles flow through the injected RNG.

### 4.2 `cards.ts`
`Card { rank: '2'..'10'|'J'|'Q'|'K'|'A', suit: '♠♥♦♣' }`, point values (2–10 face; J/Q/K = 10; A = 1/11), deck builder, Fisher-Yates shuffle. Display helpers reuse holdem's rank/suit conventions.

### 4.3 `shoe.ts`
Stateful shoe: `decks` (1–8), penetration → cut-card index, burn card on new shoe (MA §6(c)), `draw()`, discard tray (count + cards for deck-estimation UI), `cutCardReached` flag.
- Cut card reached → current round finishes, then reshuffle (MA §5(h), §6(k)).
- Shoe exhausted mid-round → reshuffle discards, burn, complete the round (MA §15(g)).
- Hand-dealt presentation allowed for 1–2 deck games (WA §3) — cosmetic only.

### 4.4 `rules.ts`
```ts
interface RuleSet {
  decks: 1|2|4|6|8
  dealerHitsSoft17: boolean            // H17 vs S17 (MA §12(b), WA §9.iii)
  blackjackPayout: '3:2' | '6:5'       // MA §3(e), AC guide
  doubleOn: 'any2' | '9-11' | '10-11'  // MA §10, WA note
  doubleAfterSplit: boolean
  maxSplitHands: 2|3|4                 // MA §11(e): 4; WA: 3; AC guide: 3
  resplitAces: boolean                 // MA §11(e) operator option
  splitAcesOneCard: true               // universal in all three docs (constant)
  surrender: 'none' | 'late'           // MA §8, AC guide, WA (operator option)
  dealerPeek: boolean                  // peek (US, MA §6(i)) vs no-peek
  insurance: boolean                   // MA §9 (2:1, max half wager)
  evenMoneyOffered: boolean            // MA §7(c) (void under 6:5 per §7(d))
  fiveCard21Pays2to1: boolean          // MA §16 optional rule
  spots: 7 | 9                         // table size; WA allows 9 (WA §1)
  penetration: number                  // 0.5–0.9, default per preset
  sideBets: SideBetConfig              // which of the four are on + pay table choice
  minBet: number; maxBet: number
}
```
**Presets** (each annotated with source doc + section):
- `MA_205CMR` — 8D, S17, 3:2, double any2, DAS, 4 split hands, late surrender, peek, insurance + even money, 7 spots. Discretionary MA options surface in the custom editor.
- `AC_BALLYS` — 8D, S17, 3:2, double any2, DAS, 3 split hands (guide: "total of three hands"), aces one card, late surrender, peek, insurance + even money.
- `WA_CARDROOM` — 6D, S17 (WA §9.i default; H17 is the documented operator exception), 3:2 (doc defers payout to posted rules; note in UI), double any2, DAS, 3 split hands, late surrender (WA operator-option defaults), peek, 9 spots, hand-dealt look under 2 decks.
- `VEGAS_STRIP_6D` — 6D, S17, 3:2, DAS, 4 split hands, no surrender, peek.
- `SINGLE_DECK_65` — 1D, H17, 6:5, double any2, no DAS, no surrender, peek — the "looks good, plays bad" teaching preset.
- `CUSTOM` — editor over every field; advisor/edge recompute live.

House edge per rule set is **computed by the EV engine** (overall EV of perfect basic strategy over all initial deals, full-shoe composition), not a hardcoded table; displayed at setup and in the learn page's rule explorer.

### 4.5 `hand.ts`
Hand totals (hard/soft), `isBlackjack` (ace + ten as initial two cards, **not after split** — MA §1, WA "Splitting Pairs"), `isBust`, `isPair` (equal point value, per MA §11(a) — so K♠+10♦ is splittable; WA's stricter "identical rank" variant is out of scope for v1), and `legalActions(hand, rules, context): Set<'hit'|'stand'|'double'|'split'|'surrender'>`.

### 4.6 `dealer.ts`
Dealer algorithm per rules: draw to hard 17+ / soft 17 per H17 flag (MA §12(b)); **no draw when it cannot affect the outcome** (all players busted/blackjack — MA §12(c)) except when a Buster wager is live (MA §27(f)(3) requires completion); peek procedure when up-card is ace/ten and `dealerPeek` (MA §6(i)).

### 4.7 `basicStrategy.ts` — computed EV engine
- Dealer outcome probability distribution per up-card (DP over the rule set, full-shoe composition, conditioned on no dealer blackjack where peek applies).
- Player action EVs via memoized recursion: stand, hit, double, split (expected value approach with re-split depth per rules), surrender (−0.5).
- Public API: `bestAction(hand, upcard, rules)`, `actionEVs(...)` (drives advisor + mistake-cost), `generateChart(rules)` (drives learn page + drills), `houseEdge(rules)`.
- **Pinned tests**: generated charts for 6D-S17-DAS, 6D-H17-DAS, and single-deck must match canonical published basic strategy cell-for-cell; any drift fails CI.

### 4.8 `counting.ts`
Hi-Lo tag values (2–6 = +1, 7–9 = 0, 10–A = −1); running count from **visible cards only** in dealt order; true count = RC ÷ decks remaining (decks estimated from discard tray to nearest half-deck, like a human); advantage estimate ≈ (TC − 1) × 0.5% (educational display); **Illustrious 18 + Fab 4** deviation table gated behind "advanced" toggle (insurance at TC ≥ +3 first and foremost).

### 4.9 `sideBets.ts`
Evaluators + official pay tables (cited constants) + computed house edges:
- **21+3** (player 2 + dealer up = 3-card poker hand): MA §28 tables A/B; AC "21+3 Xtreme" table as third option.
- **Lucky Ladies / twenty-point bonus**: MA §24 paytables A/B (Q♥ pair + dealer BJ 1000:1 …), AC guide variant.
- **Match the Dealer**: MA §23 deck-dependent tables (rank match; 10s match by identical rank only — MA §23(a)).
- **Buster**: MA §27 paytables A–F (pays by card-count of dealer bust; forces dealer completion).
Settlement timing per docs (e.g., MTD settled immediately after second card, before any hits — MA §23(e)).

### 4.10 `round.ts` — phase machine
Phases: `betting → dealing → earlySideBetSettlement → insurance/evenMoney → peek → playerTurns (per spot, split-hand sub-order per MA §11(b)) → dealerTurn → settlement → cleanup → (cutCard? shuffle) → betting`.
- Deal order per docs: first base → clockwise, one up each, dealer up-card, second round, dealer hole (MA §6(d); WA alternative noted).
- Emits typed events (`card-dealt`, `dealer-announces`, `phase-changed`, `count-changed`, `bot-quip`...) consumed by UI, announcer (aria-live), and pacing layer. **The casino/quick toggle is purely presentational** — it changes event pacing/rendering, never engine behavior.
- Engine throws typed `IllegalActionError` on invalid actions (UI prevents via `legalActions`; throws are bugs).

### 4.11 `bots.ts`
Persona = data: `{ id, name, flavor, strategyProfile, betPattern, quips }`.
- Strategy profiles: `perfect-book`, `never-busts` (stands 12+), `mimics-dealer` (hits to 17, never doubles/splits), `insurance-lover` (always insures/even-moneys), `superstitious` (streak-based bet swings, scripted myth quips).
- v1 roster (5): By-the-Book Bea, Never-Bust Nancy, Mimic-the-Dealer Mike, Insurance Ivan, Lucky Lou.
- Deterministic under seeded RNG; their visible cards feed the count; their per-session P&L feeds analysis ("cost of their leak").

## 5. State & composables

- **`stores/useBlackjackStore.ts`** (Pinia): settings (rules, mode, advisor intensity, count visibility, bots), bankroll, current round state, session stats, history (capped 500), lifetime training stats. Persists per §10.
- **`useGameLoop.ts`**: subscribes to engine events, applies pacing (casino: per-card delays + announcement beats, speed slider 0.5×–3×; quick: immediate), exposes `act(action)`, `deal()`, `rebet()`.
- **`useAdvisor.ts`**: wraps `basicStrategy` + `counting` deviations + side-bet warnings into `Recommendation { action, reasoning, evTable, deviation? }`; implements the three intensities (coach / feedback / exam).
- **`useCounting.ts`**: visible-card subscription → RC/TC, self-check verification, shuffle quiz state, accuracy log.
- **`useAnnouncer.ts`**: dealer announcements → aria-live region + on-felt text (authenticity = accessibility).

## 6. Pages

- **`/` (setup)**: bankroll, preset picker (with house edge + source-doc citation per preset), custom rules editor, side-bet toggles, bot picker (0–5), mode (casino/quick), training options (advisor intensity, count visibility), then → table.
- **`/table`**: SVG felt, spots arc (7 or 9 per rules), dealer area (shoe + cut card + discard tray), chip betting (family chip palette), action bar with EV-on-hover, collapsible AdvisorPanel + CountPanel, study-mode toggle (pause + hover tooltips with rules/edges, craps pattern). Keyboard: H/S/D/P/R (surrender), B rebet, C count-check, Space deal.
- **`/history`**: per-hand log — round #, bets (main + side), player cards/decisions each flagged ✓/✗ vs book (with cost), dealer up/hole/result, RC/TC at each decision, payout; expandable detail = full EV table per decision point.
- **`/analysis`**: adherence % (overall + by category: hard/soft/pairs/surrender/insurance), top repeated mistakes, EV lost vs actual P&L (variance lesson), counting accuracy trend, side-bet ledger vs theoretical cost, bankroll sparkline, bot P&L by persona.
- **`/learn`**: interactive strategy chart generated from engine for active rules (tap cell → EV math); rule/house-edge explorer (toggle rules, watch edge move); Hi-Lo primer; side-bet truth tables; myths section (third-base myth, hot dealers, insurance/even-money trap, "due to win"); casino-procedure guide (burn, cut card, penetration, hand signals, announcements) citing the three docs; glossary.
- **`/drills`**: Strategy Flash (random legal situation under active rules, timed, streak, weighted toward the user's past mistakes), Count the Cards (flash speed levels: singles → pairs → table rounds; enter RC), True-Count Conversion (RC + discard-tray visual → TC), Deviation Quiz (advanced; Illustrious 18 situations).

## 7. Look & feel

- **Tokens**: holdem's `main.css` casino block verbatim (`--felt-green #0a5c36`, `--felt-green-light`, `--rail-walnut`, `--accent-gold #d4a847`, `--accent-cream`, card red/black, chip palette). Public Sans (flameout/craps), system mono for counts/EVs.
- **Felt**: SVG arc layout — betting boxes with four side-bet circles, insurance line ("INSURANCE PAYS 2 TO 1" arc text), payout text rendered from rules ("BLACKJACK PAYS 3 TO 2" ↔ "6 TO 5"), dealer area, visibly-filling discard tray, cut card visible in shoe.
- **Cards**: holdem `PlayingCard.vue` (Unicode suits, CSS 3D flip, sm/md/lg).
- **Responsive**: mobile-first; phone layout = dealer + your spot, bots collapse to status chips above the felt.
- **Reduced motion**: no flips/slides, instant reveals (media query global, family pattern).
- **A11y**: aria-live dealer announcements, full keyboard play, focus management on action bar, axe-clean target.

## 8. Modes & fun layer

- **Casino mode**: paced card-by-card dealing, dealer announcements (point totals, "Dealer's Card", "No more bets"), peek ritual, burn/shuffle interstitial (plug-riffle-turn-strip-cut named per MA §5(k) as flavor), bot chatter. Speed slider.
- **Quick mode**: instant resolution, compact shuffle notice, all training features intact.
- **Fun**: bot quips (text), pit-boss milestone lines (streaks, first correct deviation, beating a shoe), chip payout animations, subtle win/push/loss flair; "minimal flair" toggle; everything respects reduced-motion.

## 9. Error handling

- Engine: typed errors (`IllegalActionError`, `EmptyShoeError` — latter handled internally per MA §15(g)); UI renders only legal actions, so engine throws = bug → toast + console.
- Storage: validate + sanitize on load (flameout pattern); corrupt → clean reset with notice; quota/unavailable → in-memory session with warning banner.
- RNG: crypto-seed fallback to `Math.random` with console notice.
- Mid-round refresh: full state snapshot per phase transition → exact restore (bets, cards, turn) on load.

## 10. Persistence (localStorage)

Key `blackjack-session-v1`:
```ts
{
  version: 1,
  settings: { rules: RuleSet, mode, advisorIntensity, countVisibility, bots: string[], flair },
  bankroll: number,
  roundSnapshot: SerializedRound | null,   // mid-round restore
  history: HandRecord[],                   // capped 500
  training: { adherenceByCategory, mistakeBag, countQuizLog, drillBests },
  meta: { createdAt, updatedAt }
}
```
Migration scaffold ready for v2 (flameout's versioned-migration pattern).

## 11. Testing

- **Unit (Vitest)**: hand eval edges (soft→hard, split-21 ≠ blackjack), dealer per rule set, payouts incl. 3:2/6:5 rounding to chip denominations, insurance 2:1 max-half (MA §9(b)), each side-bet evaluator vs doc pay tables, shoe mechanics (burn, penetration, cut-card flow, mid-round exhaustion), RC/TC, bots deterministic under seed, **strategy charts pinned to canonical published charts** (6D-S17-DAS, 6D-H17-DAS, 1D) cell-for-cell.
- **Simulation**: ≥100k seeded auto-played rounds at perfect basic strategy per preset → empirical EV within statistical tolerance (~3σ) of engine-computed house edge. The authenticity proof.
- **Component (nuxt)**: table spots/controls per phase, advisor recommendation rendering, legal-action button states, count panel visibility modes.
- **E2E (Playwright)**: full round happy path; split (incl. resplit + aces one-card); insurance + even-money; settings + mid-round refresh restore; drills smoke; study-mode tooltip.

## 12. Deployment & meta

- Netlify static (`pnpm generate` → `dist`, NODE_VERSION 22), craps CSP/security headers.
- `package.json` name `metaincognita-blackjack`, version 0.1.0; footer shows version.
- README (family format): tagline, live link, hero, features, design system, deep-dives, sibling cross-links. CHANGELOG per Keep a Changelog.
- Git: `main` branch; **no AI co-author trailers in commits** (user convention).

## 13. Sources

| Doc | Used for |
|---|---|
| MA 205 CMR (39 pp.) | Core procedure (§§1–16), insurance, surrender, splits, dealer rules, irregularities, side-bet pay tables (§§23–28) |
| Bally's AC guide (2 pp.) | Player-facing flow, hand signals, even money, AC preset, Lucky Ladies & 21+3 variants |
| WA Commission (3 pp.) | WA preset: 9 spots, 3-hand split cap, double restrictions, hand-dealt 1–2 deck, alternative deal |

Canonical published basic-strategy charts (standard literature) serve as test pins for the computed strategy engine.
