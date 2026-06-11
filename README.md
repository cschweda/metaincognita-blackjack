# Blackjack Trainer

Authentic casino blackjack simulator and trainer. Basic strategy coaching, Hi-Lo card
counting practice, and rules grounded in official gaming-commission documents (see `docs/`).

Part of the Metaincognita casino simulator suite (Hold'em, Video Poker, Flameout, Craps, Pachinko).

## Status

v0.1.0 — engine complete (fully tested, simulation-verified); UI in progress.
Design spec: `docs/superpowers/specs/2026-06-11-blackjack-trainer-design.md`.
Engine: `app/utils/engine/` — framework-free TypeScript, seeded RNG, official-rulebook citations inline.

## Setup

pnpm install
pnpm dev        # http://localhost:3000
pnpm test:unit  # engine tests
