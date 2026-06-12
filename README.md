# Blackjack Trainer

Authentic casino blackjack simulator and trainer. Basic strategy coaching, Hi-Lo card
counting practice, and rules grounded in official gaming-commission documents (see `docs/`).

Part of the Metaincognita casino simulator suite (Hold'em, Video Poker, Flameout, Craps, Pachinko).

## Status

v0.2.0 — playable game shipped: setup screen (cited presets, custom rules editor, bot
companions), the felt table with paced casino dealing or quick play, chip betting with side
bets and insurance, keyboard play, and bulletproof session persistence (a mid-round refresh
restores the exact table). Training surfaces (advisor, counting, history/analysis/learn/drills)
land in 0.3.0.
Design spec: `docs/superpowers/specs/2026-06-11-blackjack-trainer-design.md`.
Engine: `app/utils/engine/` — framework-free TypeScript, seeded RNG, official-rulebook citations inline.

## Setup

pnpm install
pnpm dev        # http://localhost:3000
pnpm test:unit  # engine tests
