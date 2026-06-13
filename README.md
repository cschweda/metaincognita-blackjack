# Blackjack Trainer

Authentic casino blackjack simulator and trainer — basic strategy coaching and Hi-Lo card
counting practice on rules taken from official gaming-commission documents, not folklore.

> **This is a single-player simulation only.** No real money is wagered, won, or lost. There is
> no multiplayer, no server, no accounts, and no connection to any casino or gambling service.
> All bankrolls are fictitious. The sole purpose is education.

## Features

- **Five rulebook-cited presets + full custom editor** — MA 205 CMR, Bally's AC, WA card room,
  Vegas Strip, single-deck 6:5; every preset shows its computed house edge (model estimate)
- **Casino procedure or quick play** — paced card-by-card dealing with dealer announcements,
  burn/cut-card/penetration mechanics, or instant resolution; one engine underneath
- **Real-time advisor** — coach / feedback / exam intensities, EV table per decision, mistake
  cost in dollars, count deviations (Illustrious 18 + Fab 4) behind an advanced toggle
- **Hi-Lo counting** — running/true count from visible cards only, self-check (press C),
  shuffle quizzes, accuracy tracking
- **History & analysis** — every decision graded ✓/✗ vs book with cost and RC/TC; adherence by
  category, top repeated mistakes, EV lost vs actual P&L, side-bet ledger, bot P&L by persona
- **Learn page** — strategy chart generated from the EV engine for the active rules (tap a cell
  for the math), rules lab with live edge deltas, side-bet pay tables, myths, procedure guide
- **Four drills** — Strategy Flash (weighted toward your mistakes), Count the Cards,
  True-Count Conversion, Deviation Quiz
- **Bot companions** — five personas with strategy leaks you can measure on the analysis page
- **Bulletproof persistence** — a mid-round refresh restores the exact table, count included
- **Four side bets with official pay tables** — 21+3, Lucky Ladies, Match the Dealer, Buster
- **Engine verified by simulation** — 200k seeded rounds converge on the computed house edge

## Rules Reference

| Source | Type |
|--------|------|
| Massachusetts Gaming Commission, 205 CMR blackjack rules | `docs/Rules-Blackjack-10-08-2020.pdf` |
| Bally's Atlantic City gaming guide | `docs/BLYS_AC-BlackJack-GamingGuide-4x9-Updated.pdf` |
| Washington State Gambling Commission rules | `docs/Blackjack Game Rules Revised April 2018 cc.pdf` |

## Setup

    pnpm install
    pnpm dev        # http://localhost:3000
    pnpm test       # engine + component suites
    pnpm test:e2e   # Playwright

Part of the Metaincognita simulator family: Hold'em, Video Poker, Flameout, Craps, Pachinko, Slots.
