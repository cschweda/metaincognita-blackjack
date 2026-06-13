# Metaincognita Guidelines

**The standard for every simulator in the Metaincognita casino suite.**
Status: living document · canonical home: `metaincognita-blackjack/docs/` (move to the
metaincognita.com umbrella repo when it exists) · Last revised: 2026-06-13

Metaincognita is a family of single-player casino simulators — Hold'em, Video Poker, Flameout,
Craps, Pachinko, Slots, Blackjack, and whatever comes next — built so that learning the real
mathematics of a gambling game is more fun than gambling. Every app must **look, work, teach,
explain, and help players learn the same way**. A player who knows one simulator should feel at
home in all of them; a developer who has read one codebase should be able to navigate any other.
The long-term destination is **metaincognita.com**: one site, one visual language, one teaching
methodology, many games.

This document is the canon. Where it names a game in *(parentheses)*, that repo is the
**canonical reference implementation** — copy from it rather than reinventing.

---

## 1. The Five Commitments

1. **Authentic.** Rules, procedures, pay tables, and odds come from primary sources — gaming
   commission regulations, casino rulebooks, manufacturer documents — committed to `docs/` and
   cited inline in the engine *(blackjack: three commission rulebooks cited per-section in
   engine comments; craps: Marina Bay Sands government-approved rules)*.
2. **Learning-centered.** The point is not to play; it is to understand. Every simulator ships
   the full learning scaffold (§2) and the training formula (§2.3).
3. **Local-only, money-free.** No real wagering, no accounts, no server play, no analytics,
   no external runtime calls. Every README carries the standard disclaimer blockquote
   *(craps wrote it first)*. Bankrolls are fictitious and the apps say so in the footer.
4. **Honest fun.** Personality is welcome — bot companions, stickman calls, pit-boss lines —
   but flavor never lies about math. Myths are presented *as myths*, with the refutation
   *(blackjack's Myths tab; craps' gambler's-fallacy warnings)*. All flair sits behind a
   "minimal flair" toggle and respects `prefers-reduced-motion`.
5. **Identical chrome, custom felt.** The UI shell — status bars, navigation, history,
   analysis, learn, settings patterns — is the same in every app. Only the game area (table,
   machine, board) is custom. This is the founding principle of the family design system
   *(video-poker `docs/design-system.md`)*.

---

## 2. The Learning Scaffold (required in every simulator)

Every Metaincognita app teaches on four layers. None is optional.

### 2.1 The README is a textbook chapter

The README is not packaging; it is the first learning surface, and often the only one a
GitHub visitor sees. **Every README must contain a learning section** with:

- **An accurate history of the game** — a real essay with dates, named people, and primary
  events, written in plain prose. Contested lore is flagged as lore, never laundered into
  fact *(flameout's "A Brief History of Crash Games" — eleven subsections from the 2014
  Bitcointalk origin to today — is the depth bar; pachinko's "About Pachinko" shows the
  cultural-history register; blackjack's "Learn the Game" shows the contested-etymology
  handling)*.
- **Tidbits** — short, true, surprising facts that reward the curious reader.
- **Variations** — the named variants a player will actually meet, each with its twist and
  its catch (what the flashy rule costs).
- **The mathematics** where the game warrants it inline *(flameout's "The Mathematics of
  Crash Games" with distribution, EV proof, variance, and betting-system debunking)*.

Deep research belongs in `docs/` as appendices the essay draws from *(pachinko's
`docs/appendix-a-history.md` research-notes-to-essay pipeline)*.

### 2.2 The in-app `/learn` page

The same knowledge, restructured for in-app reading: game math, how-to-play, **history**
(condensed era cards), myths vs reality, procedure/etiquette, and a glossary
*(flameout `app/pages/learn.vue` — sidebar-section structure; blackjack `learn.vue` —
tabbed structure with an engine-generated strategy chart and a live rules lab)*. Wherever
possible the learn page computes from the engine rather than hardcoding — charts, edges, and
pay tables must be the same objects the game plays with *(blackjack's `generateChart` chart
and house-edge rules lab)*.

### 2.3 The training formula

The interactive teaching loop, identical across the suite:

> **real-time advisor → per-decision EV feedback → outcome explanation → history →
> analysis → learn → drills**

- **Advisor**: ranked or recommended actions with EV numbers, before the player acts
  *(craps' ranked bet advisor; blackjack's coach/feedback/exam intensities)*.
- **Per-decision feedback**: every player decision graded against optimal play with the
  cost in money, recorded — not just shown *(blackjack `DecisionRecord`; video poker's
  per-hold EV analysis)*.
- **Outcome explanation**: when a round settles, say what happened, why, and what it cost
  or paid, where the player's eyes already are *(blackjack's center-felt banner + advisor
  round recap)*.
- **History**: a complete, persisted log of rounds and graded decisions.
- **Analysis**: adherence percentages, top repeated mistakes, expectation vs variance
  ("EV lost vs actual P&L"), bankroll curve *(craps' distribution charts; blackjack's
  adherence-by-category)*.
- **Drills**: dedicated practice reps for the game's core skills, seeded by the player's
  own recorded mistakes *(blackjack's mistake-weighted Strategy Flash)*.

### 2.4 The accuracy bar

- Primary sources committed to `docs/` and cited where used.
- Engine-computed numbers are **verified by statistical simulation** against theory
  (≥100k seeded rounds within ~3σ) *(blackjack's 200k-round suite; craps' convergence
  tests; flameout's EV proofs)* and **pinned against canonical published references**
  cell-for-cell where they exist *(blackjack's basic-strategy chart pins)*.
- When a model is an estimate, the UI says so *(blackjack's "house edge is a model
  estimate" footnote)*.

---

## 3. Methodology — how a simulator gets built

1. **Sources first.** Collect the primary documents into `docs/`; choose the named rule
   presets the app will ship.
2. **Spec, then plan.** Brainstorm to a written design spec in `docs/superpowers/specs/`;
   derive implementation plans with complete code; execute task-by-task with per-task review
   *(blackjack's three-plan history is the template)*.
3. **Engine before UI.** A pure-TypeScript, framework-free engine under `app/utils/engine/`
   (or `app/utils/` for simpler games) — TDD throughout, simulation-verified before a single
   component exists.
4. **Game UI second.** Setup screen → playable table → persistence. The casino-procedure vs
   quick-play toggle is **purely presentational** — pacing must never change engine behavior.
5. **Trainer surfaces third.** Advisor, feedback, history, analysis, learn, drills.
6. **Hardening last.** Mobile pass, accessibility pass (axe-clean AA), Playwright E2E,
   deploy config, release notes.

## 4. Code theory — the architecture every repo follows

- **Engine purity.** Nothing under the engine directory imports Vue, Nuxt, or Pinia. The
  engine is unit-testable in Node and could be re-skinned without modification. CI greps
  for violations.
- **Event-driven rounds.** The engine is a synchronous phase machine that **emits typed
  events**; the UI drains them through a pacing queue into *presented state*. Amounts and
  legality always read from engine state; visibility (what cards the player has "seen")
  always reads from presented state — so paced dealing can never leak hidden information
  *(blackjack `useGameLoop` is the canonical implementation)*.
- **Seeded randomness.** All shuffles/rolls flow through one injectable PRNG (mulberry32,
  crypto-seeded in live play, fixed-seeded in tests and simulations). Anything random must
  be reproducible *(flameout's provably-fair system is the maximal version)*.
- **Money is integer cents.** No floats in wagers, payouts, or bankrolls; payout rounding
  follows the cited rulebook.
- **Versioned persistence.** One `<game>-session-v1` localStorage key with a version field,
  validation + sanitize on load, corrupt → clean reset, quota failure → in-memory session
  with a visible warning. Mid-round refresh restores the exact state. **Lifetime learning
  stats live under their own key** and survive "leave table" *(blackjack's
  `blackjack-training-v1`)*.
- **Computed, not transcribed.** Where feasible, strategy charts, edges, and distributions
  are derived by the engine and *pinned* against published references in tests — the app
  must be able to explain its own numbers.
- **Quality gates.** `test` (unit + component), `lint`, `typecheck` green before every
  commit; Playwright E2E for the money paths; axe-clean WCAG 2.1 AA on every user route.
- **Conventional commits, no AI attribution trailers.** Semver + Keep-a-Changelog.

## 5. UI standard

The visual authority is **`metaincognita-video-poker/docs/design-system.md`** — stack, color
system, typography, layout, and component patterns. Summary of the non-negotiables:

- **Stack**: Nuxt 4 · Vue 3 · Nuxt UI 4 · Tailwind 4 · Pinia · TypeScript · pnpm · Vitest
  (unit/nuxt projects) · Playwright · Netlify static. Dark mode only.
- **Chrome** (identical everywhere): slim top status bar (back/leave + session stat),
  bottom bar with page navigation (History · Analysis · Learn · Drills), version string, and
  GitHub link; "leave" always confirms before destroying a session.
- **Typography**: Fira Code (or system mono) for every number, count, and EV; system-ui for
  prose. If a number matters, it is monospaced.
- **Per-game accent** via `app.config.ts` `primary`; table games additionally use the shared
  casino-luxury tokens — felt `#0a5c36`, walnut rail, gold `#d4a847`, cream `#f5f0e1`, the
  chip palette *(holdem `main.css` is the origin; blackjack consumes the same block)*.
- **Keyboard play** end-to-end with visible hints on the buttons *(blackjack: H/S/D/P/R,
  B rebet, Space deal, C count-check)*.
- **Study mode**: pause the game, expose hotspots/tooltips that explain every zone with its
  edge *(craps invented it; blackjack's felt hotspots follow)*.
- **Accessibility**: aria-live announcements for everything a dealer would say, full
  keyboard operability with managed focus, axe-clean AA contrast (muted text floor:
  `neutral-400` on dark surfaces), `prefers-reduced-motion` globally disarms animation.
- **Mobile**: the game stays playable at 390px; secondary actors collapse to status chips
  *(blackjack's bot-chips strip)*.

## 6. Brand & social assets

- **og-image**: every app commits `public/og-image.svg` *and* the rendered
  `public/og-image.png` (1200×630). The image uses the **branded background system**
  (design-system.md §"Hero Image"): navy diagonal gradient `#0a0c1a→#060810`, fine 20px
  grid `#1e2848`, major 100px grid `#283458`, dot overlay, radial vignette, corner
  registration marks, bottom rule at y=600 with the letterspaced `METAINCOGNITA` wordmark,
  and a 4px game-accent bar — then a game-specific content layer (cards, dice, machine) and
  the game title in the accent color with a glow. Render with
  `rsvg-convert -w 1200 -h 630 public/og-image.svg -o public/og-image.png`.
  **librsvg does not support `<textPath>`** — keep SVG sources textPath-free so the SVG and
  PNG match. *(video-poker `hero.svg` defined the system; blackjack `og-image.svg` is the
  newest conforming example.)*
- **Social meta**: `og:title/description/image(+width/height)/type` and
  `twitter:card=summary_large_image` wired in `nuxt.config.ts` *(holdem first; blackjack
  current)*.
- **README hero**: the og image, centered at top, before the H1
  *(video-poker's `<p align="center">` pattern)*.
- **Badges** (standard set, static shields.io, bumped at release — introduced by blackjack):
  `version` (gold `d4a847`), `tests` (count, green `16a34a`), `playwright` (spec count),
  `nuxt-4` (`00dc82`), `typescript-strict` (`3178c6`), `WCAG 2.1 AA` (`1f6feb`). Add a CI
  badge only when real CI exists — never a decorative one.

## 7. The canonical README outline

```
<centered hero image>
# <Game> <Simulator|Trainer>
<badges>
<one-paragraph pitch: what it is, what it teaches>
> single-player / no-real-money disclaimer blockquote
## Features                  (bulleted, concrete, numbers included)
## Learn the Game            (history essay · tidbits · variations [· mathematics])
## Rules Reference           (table of primary sources committed in docs/)
## <game-specific deep dives> (design system, simulation proofs, provable fairness…)
## Setup                     (install / dev / test / e2e)
<family footer linking the suite and these guidelines>
```

## 8. Canonical reference table

| Area | Copy from |
|---|---|
| Design system, og/hero branded background, typography | **video-poker** (`docs/design-system.md`, `public/hero.svg`) |
| Casino-luxury felt tokens, PlayingCard component (3D flip) | **holdem** |
| README learning depth, math essays, learn-page structure, provably-fair | **flameout** |
| History research pipeline (notes → essay), cultural register | **pachinko** (`docs/appendix-a-history.md`) |
| Study mode, ranked advisor, sim-verified payouts, disclaimer text | **craps** |
| Training formula end-to-end (graded decisions → analysis → mistake-seeded drills), event-paced engine boundary, lifetime training stats, E2E suite, a11y pass, badges, these guidelines | **blackjack** |

## 9. New-simulator checklist

1. Clone the craps skeleton; port holdem `main.css` tokens if it's a table game.
2. Collect primary rule sources into `docs/`; pick the cited presets.
3. Spec (`docs/superpowers/specs/`) → plans → engine TDD → simulation proof.
4. Game UI → persistence (versioned key + mid-round restore) → training formula surfaces.
5. Learning scaffold: README essay + tidbits + variations; `/learn` page with history tab.
6. Mobile, a11y (axe AA), Playwright E2E, Netlify deploy with the family CSP.
7. og-image SVG+PNG, social meta, README hero + badges.
8. Add the game to every sibling README's family footer.

---

*Questions this document doesn't answer get answered by reading the canonical repo for that
area — and then by amending this document, so the next game doesn't have to ask.*
