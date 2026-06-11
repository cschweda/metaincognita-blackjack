# Blackjack Engine & Scaffold Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the metaincognita-blackjack Nuxt 4 app shell (craps-skeleton conventions) and build the complete, fully tested pure-TypeScript blackjack engine: cards/shoe, rules+presets, hand logic, dealer, computed basic-strategy EV engine, Hi-Lo counting, four side bets, round phase machine, bot personas, and a statistical simulation test.

**Architecture:** Engine lives in `app/utils/engine/` as framework-free TypeScript modules with explicit relative imports and injectable seeded RNG. UI never computes game logic; it consumes the engine's event stream. Strategy/EVs are *computed* (fixed-composition model, see Modeling Notes), not hardcoded, and pinned against canonical published charts in tests.

**Tech Stack:** Nuxt 4.4.x, Vue 3, Pinia 3, @nuxt/ui 4, Tailwind 4, TypeScript 6, Vitest 4 (unit project, node env), pnpm 10, Node 22.

**Spec:** `docs/superpowers/specs/2026-06-11-blackjack-trainer-design.md` (sections cited per task). Official rulebooks in `docs/` are the rules ground truth, cited as MA §n / AC / WA §n.

**Plans 2–3 (separate documents, written after this plan executes):** Plan 2 = playable game UI (store, composables, setup/table pages, casino/quick pacing, persistence/restore). Plan 3 = training surfaces (advisor/count panels, history/analysis/learn/drills pages), fun layer, Playwright E2E, a11y pass, deploy.

---

## Modeling Notes (read before Tasks 9–12, 17)

- **Money is integer cents** everywhere in the engine. UI formats dollars. No floats for currency. EVs are floats (per-unit expectations).
- **Probability model:** "fixed-composition" — draw probabilities are the full-shoe rank frequencies (2–9, A: 4/52 each; ten-bucket: 16/52), not updated per draw. With dealer-peek conditioning (renormalizing away the blackjack-completing hole card when the upcard is an ace/ten and `dealerPeek` is true), this model reproduces canonical published total-dependent basic strategy for 4–8 deck games — which covers every shipped preset except `SINGLE_DECK_65`. Single/double-deck composition-dependent refinements are explicitly v2; 1-deck chart pins are limited to model-consistent cells (Task 12).
- **Initial-deal layer is deck-aware:** blackjack frequencies and the house-edge enumeration (Task 11) use exact N-deck two/three-card combinatorics; only the *draw-sequence* layer is fixed-composition.
- **Rank buckets:** engine math works in point-value buckets `2..11` where `11` = ace, `10` = ten/J/Q/K. `Card.rank` stays 2–14 (holdem convention, 14 = ace) for UI compatibility.
- **Chart-pin policy:** if a computed chart cell disagrees with a pinned canonical cell, that is an engine bug to investigate — never "fix" by editing the pin. Borderline composition-marginal cells are excluded from pins and listed per task.
- **Commits:** never add AI co-author trailers (user convention).

## File Map (this plan)

| File | Responsibility |
|---|---|
| `package.json`, `nuxt.config.ts`, `vitest.config.ts`, `netlify.toml`, `tsconfig.json`, `eslint.config.mjs`, `.nvmrc` | Toolchain, craps conventions |
| `app/app.vue`, `app/layouts/default.vue`, `app/pages/index.vue`, `app/assets/css/main.css` | Bootable shell + family design tokens |
| `app/utils/engine/rng.ts` | Mulberry32 seeded PRNG + crypto seeding |
| `app/utils/engine/cards.ts` | Card type, deck/shoe builders, shuffle, buckets |
| `app/utils/engine/hand.ts` | Totals (hard/soft), blackjack/pair/bust, `PlayHand`, `legalActions` |
| `app/utils/engine/rules.ts` | `RuleSet`, validation, 6 presets with doc citations |
| `app/utils/engine/shoe.ts` | Shoe: burn, cut card/penetration, discard tray, mid-round reshuffle |
| `app/utils/engine/dealer.ts` | Dealer draw rules (S17/H17), blackjack check |
| `app/utils/engine/basicStrategy.ts` | Dealer distribution, action EVs, bestAction, chart, house edge |
| `app/utils/engine/counting.ts` | Hi-Lo RC/TC, advantage estimate, Illustrious-18 deviations |
| `app/utils/engine/sideBets.ts` | 21+3, Lucky Ladies, Match the Dealer, Buster + pay tables |
| `app/utils/engine/round.ts` | `BlackjackGame`: phases, events, settlement |
| `app/utils/engine/bots.ts` | Persona decision/bet functions |
| `test/unit/engine/*.test.ts` | One test file per module + `simulation.test.ts`, `chartPins.test.ts` |

---

### Task 1: Scaffold app shell & toolchain

**Files:**
- Create: `package.json`, `nuxt.config.ts`, `vitest.config.ts`, `netlify.toml`, `tsconfig.json`, `eslint.config.mjs`, `.nvmrc`, `app/app.vue`, `app/layouts/default.vue`, `app/pages/index.vue`, `app/assets/css/main.css`, `test/unit/smoke.test.ts`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Write `package.json`** (craps deps, blackjack identity; Playwright deps included now, config arrives in Plan 3)

```json
{
  "name": "metaincognita-blackjack",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nuxt build",
    "dev": "pnpm clean && nuxt dev",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "lint": "eslint .",
    "typecheck": "nuxt typecheck",
    "test": "vitest run",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run --project unit",
    "test:nuxt": "vitest run --project nuxt",
    "clean": "rm -rf node_modules/.vite .nuxt"
  },
  "dependencies": {
    "@iconify-json/lucide": "^1.2.100",
    "@iconify-json/simple-icons": "^1.2.75",
    "@nuxt/test-utils": "4.0.0",
    "@nuxt/ui": "^4.6.0",
    "@pinia/nuxt": "^0.11.3",
    "nuxt": "^4.4.2",
    "pinia": "^3.0.4",
    "tailwindcss": "^4.2.2"
  },
  "devDependencies": {
    "@nuxt/eslint": "^1.15.2",
    "@playwright/test": "^1.59.1",
    "@vitest/coverage-v8": "^4.1.2",
    "@vue/test-utils": "^2.4.6",
    "eslint": "^10.1.0",
    "happy-dom": "^20.8.9",
    "playwright-core": "^1.59.1",
    "typescript": "^6.0.2",
    "vitest": "^4.1.2",
    "vue-tsc": "^3.2.6"
  },
  "packageManager": "pnpm@10.33.0"
}
```

- [ ] **Step 2: Write `nuxt.config.ts`** (craps shape; blackjack identity; client-bundled icons so CSP stays `connect-src 'self'`)

```ts
export default defineNuxtConfig({
  ssr: false,

  modules: ['@pinia/nuxt', '@nuxt/eslint', '@nuxt/ui', '@nuxt/test-utils'],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  app: {
    head: {
      title: 'Blackjack Trainer',
      meta: [
        { name: 'description', content: 'Authentic casino blackjack simulator and trainer — basic strategy, card counting, official-rulebook rules' }
      ]
    }
  },

  icon: {
    clientBundle: {
      scan: true
    }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
```

- [ ] **Step 3: Write `vitest.config.ts`** (craps pattern; recursive include so `test/unit/engine/` matches; coverage on demand via flag, not always-on)

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
          testTimeout: 30000
        }
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
              domEnvironment: 'happy-dom'
            }
          }
        }
      })
    ],
    coverage: {
      provider: 'v8'
    }
  }
})
```

- [ ] **Step 4: Write `netlify.toml`** (craps headers + NODE_VERSION; CSP without iconify since icons are client-bundled)

```toml
[build]
  command = "pnpm generate"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
```

- [ ] **Step 5: Write `tsconfig.json`, `eslint.config.mjs`, `.nvmrc`**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./.nuxt/tsconfig.app.json" },
    { "path": "./.nuxt/tsconfig.server.json" },
    { "path": "./.nuxt/tsconfig.shared.json" },
    { "path": "./.nuxt/tsconfig.node.json" }
  ]
}
```

`eslint.config.mjs`:
```js
// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt()
```

`.nvmrc`:
```
22
```

- [ ] **Step 6: Write the app shell**

`app/app.vue`:
```vue
<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

`app/layouts/default.vue` (placeholder; craps-style status bars arrive in Plan 2):
```vue
<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <slot />
  </div>
</template>
```

`app/pages/index.vue`:
```vue
<script setup lang="ts">
const version = '0.1.0'
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center gap-4">
    <h1 class="text-3xl font-bold" style="color: var(--accent-gold)">Blackjack Trainer</h1>
    <p class="text-gray-400">Engine under construction — v{{ version }}</p>
  </main>
</template>
```

- [ ] **Step 7: Write `app/assets/css/main.css`** (holdem's casino-luxury tokens verbatim — spec §7 — plus global reduced-motion)

```css
@import "tailwindcss";
@import "@nuxt/ui";

@theme static {
  --font-sans: 'Public Sans', system-ui, sans-serif;
  --font-mono: 'Fira Code', 'JetBrains Mono', 'Courier New', monospace;
}

:root {
  /* Casino-dark luxury theme (holdem tokens): emerald felt, walnut rail, gold/cream accents.
     The felt stays dark emerald in both color modes. */
  --felt-green: #0a5c36;
  --felt-green-light: #0d7a48;
  --felt-glow: rgba(16, 185, 100, 0.15);
  --rail-walnut: #5c3a1e;
  --rail-walnut-dark: #3d2713;

  --card-red: #dc2626;
  --card-black: #1a1a1a;

  --accent-gold: #d4a847;
  --accent-cream: #f5f0e1;

  --chip-white: #f0f0f0;
  --chip-red: #dc2626;
  --chip-green: #16a34a;
  --chip-black: #1a1a1a;
  --chip-purple: #7c3aed;
  --chip-orange: #ea580c;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 8: Write `test/unit/smoke.test.ts`** (keeps the pipeline green until engine tests land)

```ts
import { describe, expect, it } from 'vitest'

describe('smoke', () => {
  it('runs the unit test project', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 9: Write `README.md` and `CHANGELOG.md` stubs**

`README.md`:
```markdown
# Blackjack Trainer

Authentic casino blackjack simulator and trainer. Basic strategy coaching, Hi-Lo card
counting practice, and rules grounded in official gaming-commission documents (see `docs/`).

Part of the Metaincognita casino simulator suite (Hold'em, Video Poker, Flameout, Craps, Pachinko).

## Status

v0.1.0 — engine development. Design spec: `docs/superpowers/specs/2026-06-11-blackjack-trainer-design.md`.

## Setup

pnpm install
pnpm dev        # http://localhost:3000
pnpm test:unit  # engine tests
```

`CHANGELOG.md`:
```markdown
# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Added
- Project scaffold (Nuxt 4 family stack, craps-skeleton conventions)
```

- [ ] **Step 10: Install and verify**

Run: `pnpm install`
Expected: lockfile created, `postinstall` runs `nuxt prepare` successfully.

Run: `pnpm test:unit`
Expected: 1 passed (smoke).

Run: `pnpm dev` (then Ctrl-C after confirming)
Expected: Nuxt dev server boots; http://localhost:3000 renders "Blackjack Trainer".

Run: `pnpm lint && pnpm typecheck`
Expected: both exit 0.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Nuxt 4 app shell with family toolchain and design tokens"
```

---

### Task 2: Seeded RNG (`rng.ts`)

**Files:**
- Create: `app/utils/engine/rng.ts`
- Test: `test/unit/engine/rng.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { mulberry32, randomSeed } from '../../../app/utils/engine/rng'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)()
    const b = mulberry32(2)()
    expect(a).not.toBe(b)
  })

  it('emits values in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 10000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('randomSeed', () => {
  it('returns a finite 32-bit unsigned integer', () => {
    const s = randomSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(0xFFFFFFFF)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/rng.test.ts`
Expected: FAIL — cannot resolve `../../../app/utils/engine/rng`.

- [ ] **Step 3: Write the implementation**

```ts
/** Seeded PRNG (mulberry32) — flameout's reproducibility pattern. All engine shuffles flow through an injected RNG. */
export type RNG = () => number

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Crypto-strength seed with Math.random fallback (spec §9). */
export function randomSeed(): number {
  const g = globalThis as { crypto?: Crypto }
  if (g.crypto?.getRandomValues) {
    const buf = new Uint32Array(1)
    g.crypto.getRandomValues(buf)
    return buf[0]!
  }
  return Math.floor(Math.random() * 0x100000000)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/rng.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/rng.ts test/unit/engine/rng.test.ts
git commit -m "feat(engine): add mulberry32 seeded RNG with crypto seeding"
```

---

### Task 3: Cards, deck, shuffle (`cards.ts`)

**Files:**
- Create: `app/utils/engine/cards.ts`
- Test: `test/unit/engine/cards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../app/utils/engine/rng'
import {
  SUITS, buildDeck, buildShoeCards, shuffle, pointValue, bucketOf, displayCard
} from '../../../app/utils/engine/cards'
import type { Card } from '../../../app/utils/engine/cards'

describe('buildDeck', () => {
  it('builds 52 unique cards across 4 suits and ranks 2-14', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(52)
    const keys = new Set(deck.map(c => `${c.rank}-${c.suit}`))
    expect(keys.size).toBe(52)
    expect(new Set(deck.map(c => c.suit))).toEqual(new Set(SUITS))
    expect(Math.min(...deck.map(c => c.rank))).toBe(2)
    expect(Math.max(...deck.map(c => c.rank))).toBe(14)
  })
})

describe('buildShoeCards', () => {
  it('builds decks × 52 cards (six-deck shoe = 312)', () => {
    expect(buildShoeCards(6)).toHaveLength(312)
  })
})

describe('pointValue / bucketOf', () => {
  it('values 2-9 at face, ten/face at 10, ace at 11', () => {
    expect(pointValue(2)).toBe(2)
    expect(pointValue(9)).toBe(9)
    expect(pointValue(10)).toBe(10)
    expect(pointValue(11)).toBe(10) // J
    expect(pointValue(13)).toBe(10) // K
    expect(pointValue(14)).toBe(11) // A
  })

  it('buckets cards into 2..11 point space', () => {
    const king: Card = { rank: 13, suit: 'spades' }
    const ace: Card = { rank: 14, suit: 'hearts' }
    const five: Card = { rank: 5, suit: 'clubs' }
    expect(bucketOf(king)).toBe(10)
    expect(bucketOf(ace)).toBe(11)
    expect(bucketOf(five)).toBe(5)
  })
})

describe('shuffle', () => {
  it('is a deterministic permutation under a seeded RNG', () => {
    const a = shuffle(buildDeck(), mulberry32(99))
    const b = shuffle(buildDeck(), mulberry32(99))
    expect(a).toEqual(b)
    expect(a).not.toEqual(buildDeck()) // astronomically unlikely to be identity
    expect(a).toHaveLength(52)
    expect(new Set(a.map(c => `${c.rank}-${c.suit}`)).size).toBe(52)
  })

  it('does not mutate its input', () => {
    const deck = buildDeck()
    const copy = [...deck]
    shuffle(deck, mulberry32(1))
    expect(deck).toEqual(copy)
  })
})

describe('displayCard', () => {
  it('renders rank + suit symbol', () => {
    expect(displayCard({ rank: 14, suit: 'spades' })).toBe('A♠')
    expect(displayCard({ rank: 10, suit: 'hearts' })).toBe('10♥')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/cards.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** (mirrors holdem's `cards.ts` conventions — rank 2–14, named suits — so `PlayingCard.vue` ports unchanged in Plan 2)

```ts
import type { RNG } from './rng'

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

export interface Card {
  rank: number // 2–14 (11=J, 12=Q, 13=K, 14=A) — holdem convention
  suit: Suit
}

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
}

export const RANK_DISPLAY: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
}

/** Blackjack point value: 2–9 face, ten/J/Q/K = 10, ace = 11 (hand.ts demotes to 1). MA §2(b), WA §2. */
export function pointValue(rank: number): number {
  if (rank === 14) return 11
  return Math.min(rank, 10)
}

/** Bucket = point value 2..11 (11 = ace). All strategy math runs in bucket space. */
export type Bucket = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export function bucketOf(card: Card): Bucket {
  return pointValue(card.rank) as Bucket
}

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit })
  }
  return deck
}

export function buildShoeCards(decks: number): Card[] {
  const cards: Card[] = []
  for (let d = 0; d < decks; d++) cards.push(...buildDeck())
  return cards
}

/** Fisher-Yates over a copy. */
export function shuffle<T>(items: readonly T[], rng: RNG): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function displayCard(card: Card): string {
  return `${RANK_DISPLAY[card.rank]}${SUIT_SYMBOLS[card.suit]}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/cards.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/cards.ts test/unit/engine/cards.test.ts
git commit -m "feat(engine): add card types, deck/shoe builders, seeded shuffle"
```

---

### Task 4: Hand totals & classification (`hand.ts`, part 1)

**Files:**
- Create: `app/utils/engine/hand.ts`
- Test: `test/unit/engine/hand.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { handTotal, isBust, isBlackjack, isPair } from '../../../app/utils/engine/hand'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })

describe('handTotal', () => {
  it('sums hard hands', () => {
    expect(handTotal([c(10), c(7)])).toEqual({ total: 17, soft: false })
    expect(handTotal([c(2), c(3), c(4)])).toEqual({ total: 9, soft: false })
  })

  it('counts ace as 11 when it fits (soft)', () => {
    expect(handTotal([c(14), c(6)])).toEqual({ total: 17, soft: true }) // A-6 soft 17 (WA §10)
    expect(handTotal([c(14), c(14)])).toEqual({ total: 12, soft: true }) // A-A = 12, one ace as 11
  })

  it('demotes aces to 1 to avoid busting', () => {
    expect(handTotal([c(14), c(7), c(9)])).toEqual({ total: 17, soft: false }) // A-7-9 hard 17 (WA §10 example)
    expect(handTotal([c(14), c(14), c(9)])).toEqual({ total: 21, soft: true })
    expect(handTotal([c(14), c(10), c(5), c(7)])).toEqual({ total: 23, soft: false }) // busted hard
  })

  it('soft→hard transition when a hit pushes past 21', () => {
    expect(handTotal([c(14), c(6), c(10)])).toEqual({ total: 17, soft: false })
  })
})

describe('isBust', () => {
  it('flags totals over 21', () => {
    expect(isBust([c(10), c(10), c(5)])).toBe(true)
    expect(isBust([c(14), c(10), c(10)])).toBe(false) // 21
  })
})

describe('isBlackjack', () => {
  it('is ace + ten-value as the initial two cards', () => {
    expect(isBlackjack([c(14), c(13)], false)).toBe(true) // A-K
    expect(isBlackjack([c(14), c(10)], false)).toBe(true) // A-10
  })

  it('is NOT blackjack after a split (MA §1, WA splitting note)', () => {
    expect(isBlackjack([c(14), c(13)], true)).toBe(false)
  })

  it('is NOT blackjack for 21 in three cards', () => {
    expect(isBlackjack([c(7), c(7), c(7)], false)).toBe(false)
  })
})

describe('isPair', () => {
  it('pairs by equal point value (MA §11(a)) — K+10 is splittable', () => {
    expect(isPair([c(13), c(10)])).toBe(true) // K + 10
    expect(isPair([c(8, 'hearts'), c(8, 'clubs')])).toBe(true)
    expect(isPair([c(14), c(14)])).toBe(true)
    expect(isPair([c(9), c(10)])).toBe(false)
    expect(isPair([c(8), c(8), c(8)])).toBe(false) // only initial two cards
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/hand.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Card } from './cards'
import { pointValue } from './cards'

export interface HandTotal {
  total: number
  soft: boolean // an ace is currently counted as 11
}

/** MA §1 hard/soft definitions; aces demote 11→1 while busting. */
export function handTotal(cards: readonly Card[]): HandTotal {
  let total = 0
  let acesAsEleven = 0
  for (const card of cards) {
    const v = pointValue(card.rank)
    total += v
    if (v === 11) acesAsEleven++
    while (total > 21 && acesAsEleven > 0) {
      total -= 10
      acesAsEleven--
    }
  }
  return { total, soft: acesAsEleven > 0 }
}

export function isBust(cards: readonly Card[]): boolean {
  return handTotal(cards).total > 21
}

/** Ace + ten-value as initial two cards; never after split (MA §1). */
export function isBlackjack(cards: readonly Card[], fromSplit: boolean): boolean {
  return !fromSplit && cards.length === 2 && handTotal(cards).total === 21
}

/** Initial two cards of equal point value (MA §11(a)). */
export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && pointValue(cards[0]!.rank) === pointValue(cards[1]!.rank)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/hand.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/hand.ts test/unit/engine/hand.test.ts
git commit -m "feat(engine): add hand totals with soft/hard logic, blackjack and pair detection"
```

---

### Task 5: Rule sets & presets (`rules.ts`)

**Files:**
- Create: `app/utils/engine/rules.ts`
- Test: `test/unit/engine/rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { PRESETS, validateRuleSet, cloneRules } from '../../../app/utils/engine/rules'

describe('PRESETS', () => {
  it('ships the six named presets from the spec', () => {
    expect(Object.keys(PRESETS)).toEqual([
      'MA_205CMR', 'AC_BALLYS', 'WA_CARDROOM', 'VEGAS_STRIP_6D', 'SINGLE_DECK_65', 'CUSTOM'
    ])
  })

  it('every preset passes validation', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(validateRuleSet(preset)).toEqual([])
    }
  })

  it('encodes jurisdiction facts from the rulebooks', () => {
    expect(PRESETS.MA_205CMR.maxSplitHands).toBe(4) // MA §11(e)
    expect(PRESETS.AC_BALLYS.maxSplitHands).toBe(3) // AC guide: "total of three hands"
    expect(PRESETS.WA_CARDROOM.spots).toBe(9) // WA §1
    expect(PRESETS.WA_CARDROOM.maxSplitHands).toBe(3) // WA splitting section
    expect(PRESETS.SINGLE_DECK_65.blackjackPayout).toBe('6:5')
    expect(PRESETS.SINGLE_DECK_65.evenMoneyOffered).toBe(false) // MA §7(d): even money void under 6:5
    expect(PRESETS.VEGAS_STRIP_6D.dealerHitsSoft17).toBe(false)
  })
})

describe('validateRuleSet', () => {
  it('rejects even money under 6:5 (MA §7(d))', () => {
    const r = cloneRules(PRESETS.VEGAS_STRIP_6D)
    r.blackjackPayout = '6:5'
    r.evenMoneyOffered = true
    expect(validateRuleSet(r)).toContain('evenMoneyOffered requires 3:2 blackjack payout (MA §7(d))')
  })

  it('rejects even money without insurance (even money IS an insurance bet)', () => {
    const r = cloneRules(PRESETS.VEGAS_STRIP_6D)
    r.insurance = false
    r.evenMoneyOffered = true
    expect(validateRuleSet(r).length).toBeGreaterThan(0)
  })

  it('rejects out-of-range penetration and inverted bet limits', () => {
    const r = cloneRules(PRESETS.VEGAS_STRIP_6D)
    r.penetration = 0.95
    r.minBet = 10000
    r.maxBet = 500
    const errors = validateRuleSet(r)
    expect(errors.some(e => e.includes('penetration'))).toBe(true)
    expect(errors.some(e => e.includes('minBet'))).toBe(true)
  })
})

describe('cloneRules', () => {
  it('deep-copies so presets stay frozen', () => {
    const r = cloneRules(PRESETS.MA_205CMR)
    r.sideBets.matchTheDealer = !r.sideBets.matchTheDealer
    expect(r.sideBets.matchTheDealer).not.toBe(PRESETS.MA_205CMR.sideBets.matchTheDealer)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
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

export const PRESETS: Record<string, Readonly<RuleSet>> = {
  MA_205CMR: freeze({
    name: 'Massachusetts (205 CMR)',
    source: 'docs/Rules-Blackjack-10-08-2020.pdf',
    decks: 8,
    dealerHitsSoft17: false,
    blackjackPayout: '3:2',
    doubleOn: 'any2',
    doubleAfterSplit: true,
    maxSplitHands: 4, // §11(e): up to three splits at ≤6-box tables
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
    name: "Atlantic City (Bally's)",
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
    sideBets: { twentyOnePlusThree: 'AC-XTREME', luckyLadies: 'MA-B', matchTheDealer: true, buster: 'off' }
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
}

export function cloneRules(rules: Readonly<RuleSet>): RuleSet {
  return { ...rules, sideBets: { ...rules.sideBets } }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/rules.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/rules.ts test/unit/engine/rules.test.ts
git commit -m "feat(engine): add RuleSet with validation and six cited presets"
```

---

### Task 6: Legal actions (`hand.ts`, part 2)

**Files:**
- Modify: `app/utils/engine/hand.ts` (append)
- Test: `test/unit/engine/legalActions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { newHand, legalActions } from '../../../app/utils/engine/hand'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })
const VEGAS = PRESETS.VEGAS_STRIP_6D! // S17, DAS, no surrender, any2
const MA = PRESETS.MA_205CMR! // late surrender, 4 split hands

describe('legalActions — opening hand', () => {
  it('offers hit/stand/double on any first two cards under any2', () => {
    const h = newHand([c(5), c(9)], 1000)
    expect(legalActions(h, 1, VEGAS).sort()).toEqual(['double', 'hit', 'stand'])
  })

  it('adds split on pairs (point-value pairs included)', () => {
    const h = newHand([c(13), c(10)], 1000) // K + 10
    expect(legalActions(h, 1, VEGAS)).toContain('split')
  })

  it('adds surrender only under late-surrender rules, only as first decision', () => {
    const h = newHand([c(10), c(6)], 1000)
    expect(legalActions(h, 1, MA)).toContain('surrender')
    expect(legalActions(h, 1, VEGAS)).not.toContain('surrender')
    const threeCards = newHand([c(2), c(3), c(5)], 1000)
    expect(legalActions(threeCards, 1, MA)).not.toContain('surrender')
  })

  it('forces stand as the only action on 21', () => {
    const h = newHand([c(7), c(7), c(7)], 1000)
    expect(legalActions(h, 1, VEGAS)).toEqual(['stand'])
  })

  it('returns no actions on a busted or resolved hand', () => {
    expect(legalActions(newHand([c(10), c(9), c(5)], 1000), 1, VEGAS)).toEqual([])
    const h = newHand([c(10), c(9)], 1000)
    h.resolved = true
    expect(legalActions(h, 1, VEGAS)).toEqual([])
  })
})

describe('legalActions — double restrictions', () => {
  it('10-11 rule blocks 9 and all soft totals (WA operator restriction)', () => {
    const r = cloneRules(VEGAS)
    r.doubleOn = '10-11'
    expect(legalActions(newHand([c(4), c(5)], 1000), 1, r)).not.toContain('double') // hard 9
    expect(legalActions(newHand([c(14), c(5)], 1000), 1, r)).not.toContain('double') // soft 16
    expect(legalActions(newHand([c(6), c(5)], 1000), 1, r)).toContain('double') // hard 11
  })

  it('9-11 rule allows hard 9 but not hard 8', () => {
    const r = cloneRules(VEGAS)
    r.doubleOn = '9-11'
    expect(legalActions(newHand([c(4), c(5)], 1000), 1, r)).toContain('double')
    expect(legalActions(newHand([c(3), c(5)], 1000), 1, r)).not.toContain('double')
  })

  it('blocks double after split when DAS is off (MA §10(a) contra)', () => {
    const r = cloneRules(VEGAS)
    r.doubleAfterSplit = false
    const h = newHand([c(5), c(6)], 1000, { fromSplit: true })
    expect(legalActions(h, 2, r)).not.toContain('double')
    expect(legalActions(h, 2, VEGAS)).toContain('double') // DAS on
  })

  it('never offers surrender or double on a split hand', () => {
    const h = newHand([c(10), c(6)], 1000, { fromSplit: true })
    expect(legalActions(h, 2, MA)).not.toContain('surrender')
  })
})

describe('legalActions — splitting limits', () => {
  it('caps splits at maxSplitHands (MA §11(e): 4; WA: 3)', () => {
    const pair = newHand([c(8, 'hearts'), c(8, 'clubs')], 1000, { fromSplit: true })
    expect(legalActions(pair, 3, MA)).toContain('split') // 3 hands → can make 4th
    expect(legalActions(pair, 4, MA)).not.toContain('split')
    expect(legalActions(pair, 3, PRESETS.WA_CARDROOM!)).not.toContain('split')
  })

  it('split aces receive one card and auto-resolve (MA §11(c)(2))', () => {
    const h = newHand([c(14), c(9)], 1000, { fromSplit: true, splitAces: true })
    expect(legalActions(h, 2, MA)).toEqual([])
  })

  it('resplit aces only when resplitAces is on', () => {
    const aces = newHand([c(14, 'hearts'), c(14, 'clubs')], 1000, { fromSplit: true, splitAces: true })
    expect(legalActions(aces, 2, MA)).toEqual([]) // MA preset prohibits
    const r = cloneRules(MA)
    r.resplitAces = true
    expect(legalActions(aces, 2, r)).toEqual(['split'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/legalActions.test.ts`
Expected: FAIL — `newHand` / `legalActions` not exported.

- [ ] **Step 3: Append the implementation to `app/utils/engine/hand.ts`**

```ts
import type { RuleSet } from './rules'

export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender'

export interface PlayHand {
  cards: Card[]
  bet: number // cents
  fromSplit: boolean
  splitAces: boolean
  doubled: boolean
  surrendered: boolean
  resolved: boolean
}

export function newHand(
  cards: Card[],
  bet: number,
  opts: Partial<Pick<PlayHand, 'fromSplit' | 'splitAces'>> = {}
): PlayHand {
  return {
    cards,
    bet,
    fromSplit: opts.fromSplit ?? false,
    splitAces: opts.splitAces ?? false,
    doubled: false,
    surrendered: false,
    resolved: false
  }
}

/**
 * Legal player actions for a hand. handCountAtSpot = hands currently formed at this spot
 * (split cap, MA §11(e)). Engine note: MA §8's surrender-vs-ace escrow settles identically
 * to standard late surrender (dealer BJ → full wager lost), so LS is offered post-peek.
 */
export function legalActions(hand: PlayHand, handCountAtSpot: number, rules: RuleSet): Action[] {
  if (hand.resolved || hand.surrendered || hand.doubled || isBust(hand.cards)) return []

  // Split aces: one card each (MA §11(c)(2), AC guide, WA) — only resplitting another ace is possible
  if (hand.splitAces && hand.cards.length >= 2) {
    if (isPair(hand.cards) && rules.resplitAces && handCountAtSpot < rules.maxSplitHands) return ['split']
    return []
  }

  const { total, soft } = handTotal(hand.cards)
  if (total === 21) return ['stand'] // MA §12(a)(1): 21 may not draw

  const actions: Action[] = ['hit', 'stand']
  const twoCards = hand.cards.length === 2

  if (twoCards) {
    const doubleInRange
      = rules.doubleOn === 'any2'
        || (rules.doubleOn === '9-11' && !soft && total >= 9 && total <= 11)
        || (rules.doubleOn === '10-11' && !soft && (total === 10 || total === 11))
    if (doubleInRange && (!hand.fromSplit || rules.doubleAfterSplit)) actions.push('double')

    if (isPair(hand.cards) && handCountAtSpot < rules.maxSplitHands) actions.push('split')

    if (rules.surrender === 'late' && !hand.fromSplit) actions.push('surrender')
  }

  return actions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/legalActions.test.ts`
Expected: PASS (12 tests). Also run `pnpm test:unit test/unit/engine/hand.test.ts` — still PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/hand.ts test/unit/engine/legalActions.test.ts
git commit -m "feat(engine): add PlayHand and rulebook-accurate legal action computation"
```

---

### Task 7: The shoe (`shoe.ts`)

**Files:**
- Create: `app/utils/engine/shoe.ts`
- Test: `test/unit/engine/shoe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { Shoe } from '../../../app/utils/engine/shoe'
import { mulberry32 } from '../../../app/utils/engine/rng'

const makeShoe = (decks = 6, penetration = 0.75, seed = 42) =>
  new Shoe(decks, penetration, mulberry32(seed))

describe('Shoe', () => {
  it('starts with decks×52 minus the burn card drawable (MA §6(c))', () => {
    const shoe = makeShoe(6)
    expect(shoe.cardsRemaining()).toBe(311) // 312 - 1 burned
    expect(shoe.burnedCount()).toBe(1)
  })

  it('is deterministic under a seed', () => {
    const a = makeShoe(6, 0.75, 7)
    const b = makeShoe(6, 0.75, 7)
    expect(Array.from({ length: 20 }, () => a.draw()))
      .toEqual(Array.from({ length: 20 }, () => b.draw()))
  })

  it('raises the cut card exactly at the penetration depth', () => {
    const shoe = makeShoe(6, 0.75) // cut at floor(312×0.75)=234 cards dealt; burn counts as dealt
    for (let i = 0; i < 233; i++) shoe.draw() // dealt = 1 burn + 233 = 234... boundary below
    // dealt after burn = 1; reaches 234 on the 233rd draw
    expect(shoe.needsShuffle()).toBe(true)
    const fresh = makeShoe(6, 0.75)
    for (let i = 0; i < 232; i++) fresh.draw() // dealt = 233 < 234
    expect(fresh.needsShuffle()).toBe(false)
  })

  it('reshuffles the discard rack when emptied mid-round (MA §15(g))', () => {
    const shoe = makeShoe(1, 0.9) // 52 cards, burn 1 → 51 drawable
    const drawn = []
    for (let i = 0; i < 40; i++) drawn.push(shoe.draw())
    shoe.discard(drawn.splice(0)) // 40 in the rack
    for (let i = 0; i < 11; i++) shoe.draw() // shoe empty now
    expect(shoe.cardsRemaining()).toBe(0)
    const next = shoe.draw() // must not throw: reshuffles rack (burning one)
    expect(next).toBeDefined()
    expect(shoe.cardsRemaining()).toBe(38) // 40 rack - 1 burn - 1 drawn
    expect(shoe.needsShuffle()).toBe(true) // fresh shoe after this round
  })

  it('freshShoe() reclaims discards and burns anew', () => {
    const shoe = makeShoe(2) // 104
    const drawn = Array.from({ length: 30 }, () => shoe.draw())
    shoe.discard(drawn)
    shoe.freshShoe()
    expect(shoe.cardsRemaining()).toBe(103)
    expect(shoe.needsShuffle()).toBe(false)
  })

  it('estimates decks remaining from the discard tray to the nearest half deck', () => {
    const shoe = makeShoe(6)
    const drawn = Array.from({ length: 77 }, () => shoe.draw())
    shoe.discard(drawn) // tray = 77 + 1 burn = 78 = 1.5 decks
    expect(shoe.estimatedDecksRemaining()).toBe(4.5)
  })

  it('exposes exact decksRemaining for engine math', () => {
    const shoe = makeShoe(6)
    expect(shoe.decksRemaining()).toBeCloseTo(311 / 52, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/shoe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Card } from './cards'
import type { RNG } from './rng'
import { buildShoeCards, shuffle } from './cards'

/**
 * Dealing shoe with burn card, cut-card penetration, and discard rack.
 * Burned cards go to the rack face down (MA §6(c)) — they are NEVER visible to the count.
 * Penetration is measured in cards leaving the shoe (burn included).
 */
export class Shoe {
  private cards: Card[] = []
  private rack: Card[] = []
  private burned: Card[] = []
  private cutIndex = 0
  private reached = false

  constructor(
    private readonly decks: number,
    private readonly penetration: number,
    private readonly rng: RNG
  ) {
    this.freshShoe()
  }

  private get totalCards(): number {
    return this.decks * 52
  }

  private dealtCount(): number {
    return this.totalCards - this.cards.length
  }

  /** Full shuffle: reclaim rack + burned, shuffle, set cut card, burn one (MA §5, §6(c)). */
  freshShoe(): void {
    this.cards = shuffle(buildShoeCards(this.decks), this.rng)
    this.rack = []
    this.burned = []
    this.cutIndex = Math.floor(this.totalCards * this.penetration)
    this.reached = false
    this.burnOne()
  }

  private burnOne(): void {
    const card = this.cards.shift()
    if (card) this.burned.push(card)
    if (this.dealtCount() >= this.cutIndex) this.reached = true
  }

  draw(): Card {
    if (this.cards.length === 0) this.reshuffleMidRound()
    const card = this.cards.shift()!
    if (this.dealtCount() >= this.cutIndex) this.reached = true
    return card
  }

  /** MA §15(g): insufficient cards mid-round → shuffle the discard rack, burn, complete the round. */
  private reshuffleMidRound(): void {
    this.cards = shuffle(this.rack.splice(0), this.rng)
    this.burnOne()
    this.reached = true // fresh shoe after this round regardless of cut position
  }

  discard(cards: Card[]): void {
    this.rack.push(...cards)
  }

  needsShuffle(): boolean {
    return this.reached
  }

  cardsRemaining(): number {
    return this.cards.length
  }

  burnedCount(): number {
    return this.burned.length
  }

  /** Exact — for engine math and tests. */
  decksRemaining(): number {
    return this.cards.length / 52
  }

  /** Human-style true-count divisor: estimate from discard tray volume, nearest half deck (spec §4.8). */
  estimatedDecksRemaining(): number {
    const inTray = this.rack.length + this.burned.length
    const estimate = this.decks - inTray / 52
    return Math.max(0.5, Math.round(estimate * 2) / 2)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/shoe.test.ts`
Expected: PASS (7 tests). Note the cut-card boundary test encodes burn-inclusive counting — if it fails by one, fix the implementation, not the test.

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/shoe.ts test/unit/engine/shoe.test.ts
git commit -m "feat(engine): add shoe with burn, cut-card penetration, and mid-round reshuffle"
```

---

### Task 8: Dealer play (`dealer.ts`)

**Files:**
- Create: `app/utils/engine/dealer.ts`
- Test: `test/unit/engine/dealer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { dealerShouldDraw, dealerPlay } from '../../../app/utils/engine/dealer'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { handTotal } from '../../../app/utils/engine/hand'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })
const S17 = PRESETS.VEGAS_STRIP_6D!
const H17 = (() => {
  const r = cloneRules(S17)
  r.dealerHitsSoft17 = true
  return r
})()

describe('dealerShouldDraw (MA §12(b), WA §9)', () => {
  it('draws below 17', () => {
    expect(dealerShouldDraw([c(10), c(6)], S17)).toBe(true)
  })

  it('stands on hard 17 under both rules', () => {
    expect(dealerShouldDraw([c(10), c(7)], S17)).toBe(false)
    expect(dealerShouldDraw([c(10), c(7)], H17)).toBe(false)
  })

  it('soft 17: stands under S17, hits under H17 (MA §12(b)(2))', () => {
    const soft17 = [c(14), c(6)]
    expect(dealerShouldDraw(soft17, S17)).toBe(false)
    expect(dealerShouldDraw(soft17, H17)).toBe(true)
  })

  it('stands on soft 18+ under both rules', () => {
    expect(dealerShouldDraw([c(14), c(7)], H17)).toBe(false)
  })
})

describe('dealerPlay', () => {
  it('draws from the provided source until standing', () => {
    const stream = [c(2), c(4)] // 10+6 → +2 = 18? no: 16+2=18 stand after one
    const final = dealerPlay([c(10), c(6)], () => stream.shift()!, S17)
    expect(handTotal(final).total).toBe(18)
    expect(final).toHaveLength(3)
  })

  it('H17 dealer hits soft 17 and can bust', () => {
    const stream = [c(5), c(10)] // A6 → A65 = soft 12? A(11)+6+5 = 22 → hard 12; +10 = 22 bust
    const final = dealerPlay([c(14), c(6)], () => stream.shift()!, H17)
    expect(handTotal(final).total).toBe(22)
  })

  it('S17 dealer leaves soft 17 untouched', () => {
    const final = dealerPlay([c(14), c(6)], () => { throw new Error('must not draw') }, S17)
    expect(final).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/dealer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Card } from './cards'
import type { RuleSet } from './rules'
import { handTotal } from './hand'

/** MA §12(b): option (1) = stand all 17s (S17); option (2) = hit soft 17 (H17). */
export function dealerShouldDraw(cards: readonly Card[], rules: RuleSet): boolean {
  const { total, soft } = handTotal(cards)
  if (total < 17) return true
  if (total === 17 && soft && rules.dealerHitsSoft17) return true
  return false
}

/** Draw to completion from a card source (shoe.draw in play; scripted streams in tests). */
export function dealerPlay(cards: readonly Card[], drawCard: () => Card, rules: RuleSet): Card[] {
  const out = [...cards]
  while (dealerShouldDraw(out, rules)) out.push(drawCard())
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/dealer.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/dealer.ts test/unit/engine/dealer.test.ts
git commit -m "feat(engine): add dealer drawing rules with S17/H17 support"
```

---

### Task 9: Dealer outcome distribution (`basicStrategy.ts`, part 1)

**Files:**
- Create: `app/utils/engine/basicStrategy.ts`
- Test: `test/unit/engine/dealerDistribution.test.ts`

Fixed-composition model — see Modeling Notes. Canonical infinite-deck S17 dealer bust rates used as tolerance pins (±0.02): 2→0.354, 3→0.374, 4→0.400, 5→0.428, 6→0.424, 7→0.262, 8→0.245, 9→0.230, 10→0.212, A→0.170.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { dealerDistribution, BUCKETS } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Bucket } from '../../../app/utils/engine/cards'

const S17 = PRESETS.VEGAS_STRIP_6D!
const H17 = (() => {
  const r = cloneRules(S17)
  r.dealerHitsSoft17 = true
  return r
})()

const OUTCOMES = [17, 18, 19, 20, 21, 'bust', 'blackjack'] as const

function mass(up: Bucket, rules = S17, conditioned = false): number {
  const d = dealerDistribution(up, rules, conditioned)
  return OUTCOMES.reduce((sum, k) => sum + d[k], 0)
}

describe('dealerDistribution — probability mass', () => {
  it('sums to 1 for every upcard, S17 and H17, conditioned and not', () => {
    for (const up of BUCKETS) {
      expect(mass(up, S17, false)).toBeCloseTo(1, 9)
      expect(mass(up, H17, false)).toBeCloseTo(1, 9)
      expect(mass(up, S17, true)).toBeCloseTo(1, 9)
    }
  })
})

describe('dealerDistribution — canonical S17 bust rates (±0.02)', () => {
  // Pin provenance: upcards 2-9 are identical either way (conditioning is a no-op).
  // The ten pin (0.212) is the published UNCONDITIONED value (engine: 0.2121).
  // The ace pin (0.170) is the peek-CONDITIONED value (engine: 0.1665) — unconditioned,
  // ~31% of the ace's mass is blackjack and its bust rate drops to ~0.115.
  const pins: Array<[Bucket, number]> = [
    [2, 0.354], [3, 0.374], [4, 0.400], [5, 0.428], [6, 0.424],
    [7, 0.262], [8, 0.245], [9, 0.230], [10, 0.212], [11, 0.170]
  ]
  for (const [up, expected] of pins) {
    it(`upcard ${up} busts ≈ ${expected}`, () => {
      const conditioned = up === 11
      expect(Math.abs(dealerDistribution(up, S17, conditioned).bust - expected)).toBeLessThan(0.02)
    })
  }
})

describe('dealerDistribution — blackjack handling', () => {
  it('unconditioned: P(BJ | up=A) = 16/52, P(BJ | up=T) = 4/52', () => {
    expect(dealerDistribution(11, S17, false).blackjack).toBeCloseTo(16 / 52, 9)
    expect(dealerDistribution(10, S17, false).blackjack).toBeCloseTo(4 / 52, 9)
  })

  it('conditioned (peek says no BJ): blackjack mass is zero, rest renormalized', () => {
    const d = dealerDistribution(11, S17, true)
    expect(d.blackjack).toBe(0)
    expect(mass(11, S17, true)).toBeCloseTo(1, 9)
  })

  it('two-card 21 with a non-ace/ten upcard is 21, not blackjack', () => {
    const d = dealerDistribution(5, S17, false)
    expect(d.blackjack).toBe(0)
    expect(d['21']).toBeGreaterThan(0)
  })
})

describe('dealerDistribution — H17 effects', () => {
  it('H17 raises the ace bust rate (dealer re-risks soft 17)', () => {
    expect(dealerDistribution(11, H17, false).bust)
      .toBeGreaterThan(dealerDistribution(11, S17, false).bust)
  })

  it('H17 lowers P(17) for a 6 upcard', () => {
    expect(dealerDistribution(6, H17, false)['17'])
      .toBeLessThan(dealerDistribution(6, S17, false)['17'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/dealerDistribution.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Bucket } from './cards'
import type { RuleSet } from './rules'

export const BUCKETS: Bucket[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** Fixed-composition draw probabilities (see plan Modeling Notes). */
export const PROB: Record<Bucket, number> = {
  2: 4 / 52, 3: 4 / 52, 4: 4 / 52, 5: 4 / 52, 6: 4 / 52,
  7: 4 / 52, 8: 4 / 52, 9: 4 / 52, 10: 16 / 52, 11: 4 / 52
}

export interface DealerDist {
  17: number
  18: number
  19: number
  20: number
  21: number
  bust: number
  blackjack: number
}

const EMPTY: DealerDist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, blackjack: 0 }

function addCard(total: number, acesAsEleven: number, bucket: Bucket): [number, number] {
  let t = total + bucket
  let aces = acesAsEleven + (bucket === 11 ? 1 : 0)
  while (t > 21 && aces > 0) {
    t -= 10
    aces--
  }
  return [t, aces]
}

function blend(into: DealerDist, from: DealerDist, weight: number): void {
  for (const k of Object.keys(from) as Array<keyof DealerDist>) into[k] += from[k] * weight
}

const completeMemo = new Map<string, DealerDist>()

/** Dealer finishes from (total, soft) per MA §12(b)/WA §9 drawing rules. */
function complete(total: number, acesAsEleven: number, h17: boolean): DealerDist {
  if (total > 21) return { ...EMPTY, bust: 1 }
  const soft = acesAsEleven > 0
  const stands = total > 17 || (total === 17 && !(soft && h17))
  if (total >= 17 && stands) {
    const out = { ...EMPTY }
    out[total as 17 | 18 | 19 | 20 | 21] = 1
    return out
  }
  const key = `${total}|${soft}|${h17}`
  const hit = completeMemo.get(key)
  if (hit) return hit
  const out = { ...EMPTY }
  for (const b of BUCKETS) {
    const [t, a] = addCard(total, acesAsEleven, b)
    blend(out, complete(t, a, h17), PROB[b])
  }
  completeMemo.set(key, out)
  return out
}

/**
 * Dealer outcome distribution for an upcard. With conditionNoBlackjack (peek model, MA §6(i)),
 * the blackjack-completing hole card is excluded and the remainder renormalized.
 */
export function dealerDistribution(up: Bucket, rules: RuleSet, conditionNoBlackjack: boolean): DealerDist {
  const h17 = rules.dealerHitsSoft17
  const out = { ...EMPTY }
  const bjHole: Bucket | null = up === 11 ? 10 : up === 10 ? 11 : null
  const excluded = conditionNoBlackjack && bjHole !== null ? PROB[bjHole] : 0
  const norm = 1 - excluded

  for (const hole of BUCKETS) {
    const isBlackjack = bjHole !== null && hole === bjHole
    if (isBlackjack) {
      if (!conditionNoBlackjack) out.blackjack += PROB[hole]
      continue
    }
    const [t0, a0] = addCard(0, 0, up)
    const [t1, a1] = addCard(t0, a0, hole)
    blend(out, complete(t1, a1, h17), PROB[hole] / norm)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/dealerDistribution.test.ts`
Expected: PASS (16 tests). If a bust-rate pin misses by >0.02, the recursion is wrong (commonly: soft-17 stand logic or ace demotion) — debug the engine, do not widen the tolerance. (Plan erratum, found in execution: the ten/ace pins are peek-conditioned values — the pin loop conditions on `up >= 10` accordingly.)

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/basicStrategy.ts test/unit/engine/dealerDistribution.test.ts
git commit -m "feat(engine): add dealer outcome distribution with peek conditioning"
```

---

### Task 10: Action EVs & best action (`basicStrategy.ts`, part 2)

**Files:**
- Modify: `app/utils/engine/basicStrategy.ts` (append)
- Test: `test/unit/engine/actionEVs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { actionEVs, bestAction } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'

const S17 = PRESETS.VEGAS_STRIP_6D! // no surrender
const LS = PRESETS.MA_205CMR! // late surrender
const H17 = (() => {
  const r = cloneRules(S17)
  r.dealerHitsSoft17 = true
  return r
})()

// state helper: two-card non-pair hand by totals
const hard = (total: number) => ({ total, soft: false, twoCards: true, fromSplit: false })
const soft = (total: number) => ({ total, soft: true, twoCards: true, fromSplit: false })

describe('actionEVs — structure', () => {
  it('always returns stand and hit; double only on two cards; surrender per rules', () => {
    const evs = actionEVs(hard(16), 10, S17)
    expect(evs.stand).toBeTypeOf('number')
    expect(evs.hit).toBeTypeOf('number')
    expect(evs.double).toBeTypeOf('number')
    expect(evs.surrender).toBeUndefined()
    expect(actionEVs(hard(16), 10, LS).surrender).toBe(-0.5)
    expect(actionEVs({ ...hard(16), twoCards: false }, 10, S17).double).toBeUndefined()
  })
})

describe('bestAction — famous canonical cells (6D S17 DAS)', () => {
  const cases: Array<[ReturnType<typeof hard>, number, string]> = [
    [hard(16), 10, 'hit'], // without surrender, 16v10 hits
    [hard(11), 6, 'double'],
    [hard(12), 4, 'stand'],
    [hard(12), 2, 'hit'],
    [hard(9), 2, 'hit'], // 9v2 hits — common player error to double
    [hard(10), 10, 'hit'],
    [hard(17), 11, 'stand'],
    [soft(18), 9, 'hit'], // A7 v 9 hits
    [soft(18), 6, 'double'], // Ds cell
    [soft(17), 3, 'double'], // A6 v 3 (erratum: was A2 v 5 — composition-marginal, model hits; see KNOWN_MARGINAL)
    [soft(19), 6, 'stand'] // A8 v 6 stands under S17
  ]
  for (const [state, up, expected] of cases) {
    it(`${state.soft ? 'soft' : 'hard'} ${state.total} vs ${up === 11 ? 'A' : up} → ${expected}`, () => {
      expect(bestAction(state, up as 2, S17).action).toBe(expected)
    })
  }
})

describe('bestAction — rule sensitivity', () => {
  it('11 vs A: hit under S17, double under H17 (canonical delta)', () => {
    expect(bestAction(hard(11), 11, S17).action).toBe('hit')
    expect(bestAction(hard(11), 11, H17).action).toBe('double')
  })

  it('16 vs 10 surrenders when late surrender is available', () => {
    expect(bestAction(hard(16), 10, LS).action).toBe('surrender')
  })

  it('15 vs 10 surrenders under LS, hits without it', () => {
    expect(bestAction(hard(15), 10, LS).action).toBe('surrender')
    expect(bestAction(hard(15), 10, S17).action).toBe('hit')
  })
})

describe('EV sanity', () => {
  it('standing on 20 vs 6 is strongly positive; hitting 20 is much worse', () => {
    const evs = actionEVs(hard(20), 6, S17)
    expect(evs.stand).toBeGreaterThan(0.6)
    expect(evs.hit).toBeLessThan(evs.stand - 0.5)
  })

  it('every EV lies in [-2, 2] (double can lose/win two units)', () => {
    for (const up of [2, 6, 10, 11] as const) {
      const evs = actionEVs(hard(12), up, S17)
      for (const v of Object.values(evs)) {
        if (typeof v === 'number') {
          expect(v).toBeGreaterThanOrEqual(-2)
          expect(v).toBeLessThanOrEqual(2)
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/actionEVs.test.ts`
Expected: FAIL — `actionEVs` / `bestAction` not exported.

- [ ] **Step 3: Append the implementation to `basicStrategy.ts`**

```ts
export interface TotalState {
  total: number
  soft: boolean
  twoCards: boolean
  fromSplit: boolean
}

export interface ActionEVs {
  stand: number
  hit: number
  double?: number
  surrender?: number
  split?: number // filled by splitEV (Task 11) when the hand is a pair
}

function standEV(playerTotal: number, d: DealerDist): number {
  if (playerTotal > 21) return -1
  // Peek model: d.blackjack is 0 when conditioned. Unconditioned (no-peek custom games),
  // the dealer BJ mass is a straight loss — ENHC full-loss emerges naturally for doubles too.
  let ev = d.bust - d.blackjack
  for (const t of [17, 18, 19, 20, 21] as const) {
    ev += d[t] * (playerTotal > t ? 1 : playerTotal < t ? -1 : 0)
  }
  return ev
}

function stateAfter(total: number, soft: boolean, bucket: Bucket): [number, boolean] {
  const aces = soft ? 1 : 0
  const [t, a] = addCard(total, aces, bucket)
  return [t, a > 0]
}

function hitEV(total: number, soft: boolean, d: DealerDist, memo: Map<string, number>): number {
  const key = `${total}|${soft}`
  const cached = memo.get(key)
  if (cached !== undefined) return cached
  let ev = 0
  for (const b of BUCKETS) {
    const [t, s] = stateAfter(total, soft, b)
    if (t > 21) {
      ev += PROB[b] * -1
    } else {
      const standHere = standEV(t, d)
      const hitAgain = t === 21 ? -Infinity : hitEV(t, s, d, memo)
      ev += PROB[b] * Math.max(standHere, hitAgain)
    }
  }
  memo.set(key, ev)
  return ev
}

function doubleEV(total: number, soft: boolean, d: DealerDist): number {
  let ev = 0
  for (const b of BUCKETS) {
    const [t] = stateAfter(total, soft, b)
    ev += PROB[b] * 2 * standEV(t, d)
  }
  return ev
}

const distCache = new Map<string, DealerDist>()

export function distFor(up: Bucket, rules: RuleSet): DealerDist {
  const key = `${up}|${rules.dealerHitsSoft17}|${rules.dealerPeek}`
  const hit = distCache.get(key)
  if (hit) return hit
  const d = dealerDistribution(up, rules, rules.dealerPeek)
  distCache.set(key, d)
  return d
}

/** EVs (per unit of the original bet) for the non-split actions available in this state. */
export function actionEVs(state: TotalState, up: Bucket, rules: RuleSet): ActionEVs {
  const d = distFor(up, rules)
  const memo = new Map<string, number>()
  const evs: ActionEVs = {
    stand: standEV(state.total, d),
    hit: hitEV(state.total, state.soft, d, memo)
  }
  if (state.twoCards && (!state.fromSplit || rules.doubleAfterSplit)) {
    const inRange
      = rules.doubleOn === 'any2'
        || (rules.doubleOn === '9-11' && !state.soft && state.total >= 9 && state.total <= 11)
        || (rules.doubleOn === '10-11' && !state.soft && (state.total === 10 || state.total === 11))
    if (inRange) evs.double = doubleEV(state.total, state.soft, d)
  }
  if (state.twoCards && !state.fromSplit && rules.surrender === 'late') evs.surrender = -0.5
  return evs
}

export interface Recommendation {
  action: 'hit' | 'stand' | 'double' | 'surrender' | 'split'
  evs: ActionEVs
}

export function bestAction(state: TotalState, up: Bucket, rules: RuleSet): Recommendation {
  const evs = actionEVs(state, up, rules)
  let action: Recommendation['action'] = evs.stand >= evs.hit ? 'stand' : 'hit'
  let best = Math.max(evs.stand, evs.hit)
  if (evs.double !== undefined && evs.double > best) {
    action = 'double'
    best = evs.double
  }
  if (evs.surrender !== undefined && evs.surrender > best) {
    action = 'surrender'
    best = evs.surrender
  }
  return { action, evs }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/actionEVs.test.ts`
Expected: PASS (21 tests). A failing canonical cell means an EV bug (check: hit recursion must not allow double; stand-vs-hit comparison at 21). Run the full engine suite too: `pnpm test:unit` — all green.

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/basicStrategy.ts test/unit/engine/actionEVs.test.ts
git commit -m "feat(engine): add computed action EVs and bestAction with rule sensitivity"
```

---

### Task 11: Split EV, chart generation, house edge (`basicStrategy.ts`, part 3)

**Files:**
- Modify: `app/utils/engine/basicStrategy.ts` (append)
- Test: `test/unit/engine/splitAndEdge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { splitEV, bestActionFull, generateChart, houseEdge } from '../../../app/utils/engine/basicStrategy'
import { PRESETS } from '../../../app/utils/engine/rules'

const VEGAS = PRESETS.VEGAS_STRIP_6D!
const SD65 = PRESETS.SINGLE_DECK_65!

describe('splitEV / bestActionFull — canonical pair plays (6D S17 DAS)', () => {
  it('always splits aces and eights', () => {
    for (const up of [2, 6, 7, 10, 11] as const) {
      expect(bestActionFull({ pair: 11, total: 12, soft: true }, up, VEGAS).action).toBe('split')
      expect(bestActionFull({ pair: 8, total: 16, soft: false }, up, VEGAS).action).toBe('split')
    }
  })

  it('never splits tens or fives', () => {
    expect(bestActionFull({ pair: 10, total: 20, soft: false }, 6, VEGAS).action).toBe('stand')
    expect(bestActionFull({ pair: 5, total: 10, soft: false }, 6, VEGAS).action).toBe('double')
  })

  it('splits nines vs 2-6 and 8-9 but stands vs 7 (canonical)', () => {
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, 6, VEGAS).action).toBe('split')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, 7, VEGAS).action).toBe('stand')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, 9, VEGAS).action).toBe('split')
    expect(bestActionFull({ pair: 9, total: 18, soft: false }, 10, VEGAS).action).toBe('stand')
  })

  it('DAS enables 4,4 vs 5-6 and 2,2 vs 2-3', () => {
    expect(bestActionFull({ pair: 4, total: 8, soft: false }, 5, VEGAS).action).toBe('split')
    expect(bestActionFull({ pair: 2, total: 4, soft: false }, 2, VEGAS).action).toBe('split')
    // no-DAS preset: those become hit
    expect(bestActionFull({ pair: 4, total: 8, soft: false }, 5, SD65).action).toBe('hit')
  })
})

describe('generateChart', () => {
  it('covers hard 5-20, soft 13-20, pairs 2-A against all ten upcards', () => {
    const chart = generateChart(VEGAS)
    for (let t = 5; t <= 20; t++) expect(Object.keys(chart.hard[t]!)).toHaveLength(10)
    for (let t = 13; t <= 20; t++) expect(Object.keys(chart.soft[t]!)).toHaveLength(10)
    for (const p of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) expect(Object.keys(chart.pairs[p]!)).toHaveLength(10)
  })

  it('uses composite codes: Ds for soft 18 vs 6, plain S for hard 17', () => {
    const chart = generateChart(VEGAS)
    expect(chart.soft[18]![6]).toBe('Ds')
    expect(chart.hard[17]![10]).toBe('S')
    expect(chart.pairs[11]![11]).toBe('P')
  })
})

describe('houseEdge', () => {
  it('computes plausible edges and orders rule sets correctly', () => {
    const vegas = houseEdge(VEGAS) // published ≈ 0.0040 (no surrender)
    const ma = houseEdge(PRESETS.MA_205CMR!) // 8D S17 DAS LS ≈ 0.0035
    const sd65 = houseEdge(SD65) // 6:5 single deck ≈ 0.015-0.018
    expect(vegas).toBeGreaterThan(0.001)
    expect(vegas).toBeLessThan(0.0065)
    expect(ma).toBeGreaterThan(0.001)
    expect(ma).toBeLessThan(0.006)
    expect(sd65).toBeGreaterThan(0.011)
    expect(sd65).toBeLessThan(0.02)
    expect(sd65).toBeGreaterThan(vegas) // 6:5 is the lesson
  })

  it('6:5 payout costs roughly 1.4% vs 3:2 on the same rules', () => {
    const base = houseEdge(VEGAS)
    const r = { ...VEGAS, sideBets: { ...VEGAS.sideBets }, blackjackPayout: '6:5' as const, evenMoneyOffered: false }
    const cheap = houseEdge(r)
    expect(cheap - base).toBeGreaterThan(0.011)
    expect(cheap - base).toBeLessThan(0.017)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/splitAndEdge.test.ts`
Expected: FAIL — `splitEV` / `bestActionFull` / `generateChart` / `houseEdge` not exported.

- [ ] **Step 3: Append the implementation to `basicStrategy.ts`**

```ts
const splitMemo = new Map<string, number>()

/** Absolute EV (in original-bet units, both hands counted) of splitting pairBucket vs up. */
export function splitEV(pairBucket: Bucket, up: Bucket, rules: RuleSet, handsFormed = 2): number {
  return 2 * postSplitHandEV(pairBucket, up, rules, handsFormed)
}

function postSplitHandEV(pairBucket: Bucket, up: Bucket, rules: RuleSet, handsFormed: number): number {
  const key = `${pairBucket}|${up}|${handsFormed}|${rules.dealerHitsSoft17}|${rules.dealerPeek}|${rules.doubleAfterSplit}|${rules.doubleOn}|${rules.maxSplitHands}|${rules.resplitAces}`
  const cached = splitMemo.get(key)
  if (cached !== undefined) return cached
  const d = distFor(up, rules)
  const memo = new Map<string, number>()
  let ev = 0
  for (const b of BUCKETS) {
    let v: number
    const pairAgain = b === pairBucket
    if (pairBucket === 11) {
      // Split aces: one card, forced stand (MA §11(c)(2)); resplit only another ace if allowed
      const [t] = stateAfter(11, true, b)
      v = standEV(t, d)
      if (pairAgain && rules.resplitAces && handsFormed < rules.maxSplitHands) {
        v = Math.max(v, 2 * postSplitHandEV(11, up, rules, handsFormed + 1))
      }
    } else {
      const [t, s] = stateAfter(pairBucket, pairBucket === 11, b)
      const standV = standEV(t, d)
      v = t >= 21 ? standV : Math.max(standV, hitEV(t, s, d, memo))
      if (t < 21 && rules.doubleAfterSplit) {
        const inRange
          = rules.doubleOn === 'any2'
            || (rules.doubleOn === '9-11' && !s && t >= 9 && t <= 11)
            || (rules.doubleOn === '10-11' && !s && (t === 10 || t === 11))
        if (inRange) v = Math.max(v, doubleEV(t, s, d))
      }
      if (pairAgain && handsFormed < rules.maxSplitHands) {
        v = Math.max(v, 2 * postSplitHandEV(pairBucket, up, rules, handsFormed + 1))
      }
    }
    ev += PROB[b] * v
  }
  splitMemo.set(key, ev)
  return ev
}

export interface PairState {
  pair: Bucket
  total: number
  soft: boolean
}

/** bestAction extended with the split option for pair hands. */
export function bestActionFull(state: PairState, up: Bucket, rules: RuleSet): Recommendation {
  const base = bestAction({ total: state.total, soft: state.soft, twoCards: true, fromSplit: false }, up, rules)
  const sEV = splitEV(state.pair, up, rules)
  const evs: ActionEVs = { ...base.evs, split: sEV }
  const baseBest = base.evs[base.action]!
  if (sEV > baseBest) return { action: 'split', evs }
  return { action: base.action, evs }
}

export type ChartCode = 'H' | 'S' | 'D' | 'Ds' | 'P' | 'Rh' | 'Rs' | 'Rp'

export interface StrategyChart {
  hard: Record<number, Record<Bucket, ChartCode>>
  soft: Record<number, Record<Bucket, ChartCode>>
  pairs: Record<Bucket, Record<Bucket, ChartCode>>
}

function codeFor(evs: ActionEVs, action: Recommendation['action']): ChartCode {
  if (action === 'surrender') {
    // composite: surrender, else best remaining
    const rest: Array<[Recommendation['action'], number]> = [['stand', evs.stand], ['hit', evs.hit]]
    if (evs.double !== undefined) rest.push(['double', evs.double])
    if (evs.split !== undefined) rest.push(['split', evs.split])
    rest.sort((a, b) => b[1] - a[1])
    const fallback = rest[0]![0]
    return fallback === 'stand' ? 'Rs' : fallback === 'split' ? 'Rp' : 'Rh'
  }
  if (action === 'double') return evs.stand >= evs.hit ? 'Ds' : 'D'
  if (action === 'split') return 'P'
  return action === 'stand' ? 'S' : 'H'
}

export function generateChart(rules: RuleSet): StrategyChart {
  const chart: StrategyChart = { hard: {}, soft: {}, pairs: {} as StrategyChart['pairs'] }
  for (let total = 5; total <= 20; total++) {
    chart.hard[total] = {} as Record<Bucket, ChartCode>
    for (const up of BUCKETS) {
      const rec = bestAction({ total, soft: false, twoCards: true, fromSplit: false }, up, rules)
      chart.hard[total]![up] = codeFor(rec.evs, rec.action)
    }
  }
  for (let total = 13; total <= 20; total++) {
    chart.soft[total] = {} as Record<Bucket, ChartCode>
    for (const up of BUCKETS) {
      const rec = bestAction({ total, soft: true, twoCards: true, fromSplit: false }, up, rules)
      chart.soft[total]![up] = codeFor(rec.evs, rec.action)
    }
  }
  for (const pair of BUCKETS) {
    chart.pairs[pair] = {} as Record<Bucket, ChartCode>
    const total = pair === 11 ? 12 : pair * 2
    const soft = pair === 11
    for (const up of BUCKETS) {
      const rec = bestActionFull({ pair, total, soft }, up, rules)
      chart.pairs[pair]![up] = codeFor(rec.evs, rec.action)
    }
  }
  return chart
}

/** Overall house edge of perfect basic strategy (deck-aware deal layer; see Modeling Notes). */
export function houseEdge(rules: RuleSet): number {
  const n = rules.decks
  const count: Record<Bucket, number> = {
    2: 4 * n, 3: 4 * n, 4: 4 * n, 5: 4 * n, 6: 4 * n,
    7: 4 * n, 8: 4 * n, 9: 4 * n, 10: 16 * n, 11: 4 * n
  }
  const total = 52 * n
  const bjPay = rules.blackjackPayout === '3:2' ? 1.5 : 1.2
  let ev = 0
  for (const b1 of BUCKETS) {
    for (const b2 of BUCKETS) {
      if (b2 < b1) continue
      const pPlayer = b1 === b2
        ? (count[b1] * (count[b1] - 1)) / (total * (total - 1))
        : (2 * count[b1] * count[b2]) / (total * (total - 1))
      if (pPlayer <= 0) continue
      for (const up of BUCKETS) {
        const upAvail = count[up] - (up === b1 ? 1 : 0) - (up === b2 ? 1 : 0)
        if (upAvail <= 0) continue
        const p = pPlayer * (upAvail / (total - 2))
        ev += p * dealtHandEV(b1, b2, up, rules, count, total)
      }
    }
  }
  return -ev
}

function totalOf(b1: Bucket, b2: Bucket): { total: number, soft: boolean } {
  const [t0, a0] = addCard(0, 0, b1)
  const [t1, a1] = addCard(t0, a0, b2)
  return { total: t1, soft: a1 > 0 }
}

function dealtHandEV(
  b1: Bucket, b2: Bucket, up: Bucket, rules: RuleSet,
  count: Record<Bucket, number>, totalCards: number
): number {
  const playerBJ = (b1 === 11 && b2 === 10) || (b1 === 10 && b2 === 11)
  const holeNeeded: Bucket | null = up === 11 ? 10 : up === 10 ? 11 : null
  let pDealerBJ = 0
  if (holeNeeded !== null) {
    const avail = count[holeNeeded]
      - (holeNeeded === b1 ? 1 : 0) - (holeNeeded === b2 ? 1 : 0) - (holeNeeded === up ? 1 : 0)
    pDealerBJ = Math.max(0, avail) / (totalCards - 3)
  }
  const bjPay = rules.blackjackPayout === '3:2' ? 1.5 : 1.2
  if (playerBJ) return (1 - pDealerBJ) * bjPay // dealer BJ → standoff (MA §7(b))

  const { total, soft } = totalOf(b1, b2)
  const pair = b1 === b2
  const rec = pair
    ? bestActionFull({ pair: b1, total, soft }, up, rules)
    : bestAction({ total, soft, twoCards: true, fromSplit: false }, up, rules)
  const postEV = rec.evs[rec.action]!

  if (!rules.dealerPeek) return postEV // unconditioned dist already charges dealer BJ
  return pDealerBJ * -1 + (1 - pDealerBJ) * postEV
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/splitAndEdge.test.ts`
Expected: PASS (9 tests). House-edge windows are derived from published figures ±model slack; a miss of >0.2pp means a bug (usual suspects: BJ standoff handling, split EV double-counting, surrender not reaching `bestAction`).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/basicStrategy.ts test/unit/engine/splitAndEdge.test.ts
git commit -m "feat(engine): add split EV, chart generation, and computed house edge"
```

---

### Task 12: Canonical chart pins (`chartPins.test.ts`)

**Files:**
- Test: `test/unit/engine/chartPins.test.ts` (test-only task — the engine must already satisfy it)

Pin policy (Modeling Notes): a failing cell is an engine bug. Only after confirming against **two** published sources that a cell is composition-marginal may it move to `KNOWN_MARGINAL` with a comment naming the sources.

- [ ] **Step 1: Write the pin test**

```ts
import { describe, expect, it } from 'vitest'
import { generateChart } from '../../../app/utils/engine/basicStrategy'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Bucket } from '../../../app/utils/engine/cards'

const UP: Bucket[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

// Canonical multi-deck S17 DAS LS basic strategy (any standard published chart).
// Row format: ten cells for upcards 2,3,4,5,6,7,8,9,T,A.
const HARD_S17: Record<number, string> = {
  5: 'H H H H H H H H H H',
  6: 'H H H H H H H H H H',
  7: 'H H H H H H H H H H',
  8: 'H H H H H H H H H H',
  9: 'H D D D D H H H H H',
  10: 'D D D D D D D D H H',
  11: 'D D D D D D D D D H',
  12: 'H H S S S H H H H H',
  13: 'S S S S S H H H H H',
  14: 'S S S S S H H H H H',
  15: 'S S S S S H H H Rh H',
  16: 'S S S S S H H Rh Rh Rh',
  17: 'S S S S S S S S S S',
  18: 'S S S S S S S S S S',
  19: 'S S S S S S S S S S',
  20: 'S S S S S S S S S S'
}

const SOFT_S17: Record<number, string> = {
  13: 'H H H D D H H H H H',
  14: 'H H H D D H H H H H',
  15: 'H H D D D H H H H H',
  16: 'H H D D D H H H H H',
  17: 'H D D D D H H H H H',
  18: 'S Ds Ds Ds Ds S S H H H',
  19: 'S S S S S S S S S S',
  20: 'S S S S S S S S S S'
}

const PAIRS_S17_DAS: Record<number, string> = {
  2: 'P P P P P P H H H H',
  3: 'P P P P P P H H H H',
  4: 'H H H P P H H H H H',
  5: 'D D D D D D D D H H',
  6: 'P P P P P H H H H H',
  7: 'P P P P P P H H H H',
  8: 'P P P P P P P P P P',
  9: 'P P P P P S P P S S',
  10: 'S S S S S S S S S S',
  11: 'P P P P P P P P P P'
}

// Cells confirmed composition-marginal under the fixed-composition model.
// Entries require a comment citing two published sources.
const KNOWN_MARGINAL = new Set<string>([
  // A2 v 5: fixed-composition/infinite-deck model hits (+0.1334) over double (+0.1260).
  // Sources: (1) Wizard of Odds, basic-strategy-hands Q&A — "In an infinite-deck blackjack
  // game you should hit A2 vs 5"; (2) direct EV computation during Task 10 execution.
  // Published 4-8 deck composition charts double; the delta (~0.007) is below model resolution.
  'soft:13v5'
])

// MA preset is 8D S17 DAS LS — identical total-dependent chart to 6D S17 DAS LS.
const RULES_S17 = PRESETS.MA_205CMR!

function checkTable(
  kind: 'hard' | 'soft' | 'pairs',
  expected: Record<number, string>,
  chart: ReturnType<typeof generateChart>
) {
  for (const [rowKey, rowStr] of Object.entries(expected)) {
    const cells = rowStr.split(/\s+/)
    UP.forEach((up, i) => {
      const id = `${kind}:${rowKey}v${up}`
      if (KNOWN_MARGINAL.has(id)) return
      const actual = (chart[kind] as Record<number, Record<Bucket, string>>)[Number(rowKey)]![up]
      expect(actual, id).toBe(cells[i])
    })
  }
}

describe('canonical chart pins — multi-deck S17 DAS LS', () => {
  const chart = generateChart(RULES_S17)
  it('hard totals match', () => checkTable('hard', HARD_S17, chart))
  it('soft totals match', () => checkTable('soft', SOFT_S17, chart))
  it('pairs match', () => checkTable('pairs', PAIRS_S17_DAS, chart))
})

describe('canonical H17 deltas (multi-deck H17 DAS LS)', () => {
  const r = cloneRules(RULES_S17)
  r.dealerHitsSoft17 = true
  const chart = generateChart(r)
  it('11 vs A doubles', () => expect(chart.hard[11]![11]).toBe('D'))
  it('soft 18 vs 2 doubles (Ds)', () => expect(chart.soft[18]![2]).toBe('Ds'))
  it('soft 19 vs 6 doubles (Ds)', () => expect(chart.soft[19]![6]).toBe('Ds'))
  it('15 vs A surrenders', () => expect(chart.hard[15]![11]).toBe('Rh'))
  it('17 vs A surrenders else stands (Rs)', () => expect(chart.hard[17]![11]).toBe('Rs'))
})

describe('single-deck spot checks (model-consistent cells only)', () => {
  const chart = generateChart(PRESETS.SINGLE_DECK_65!)
  it('universal cells hold at one deck', () => {
    expect(chart.pairs[11]![6]).toBe('P') // AA
    expect(chart.pairs[8]![10]).toBe('P') // 88
    expect(chart.pairs[10]![6]).toBe('S') // TT
    expect(chart.hard[11]![6]).toBe('D')
    expect(chart.hard[17]![10]).toBe('S')
    expect(chart.soft[19]![5]).toBe('S')
  })
})
```

- [ ] **Step 2: Run the pins**

Run: `pnpm test:unit test/unit/engine/chartPins.test.ts`
Expected: PASS. If any cell fails: debug `basicStrategy.ts` (do NOT edit the pin tables). Likely culprits, in order: surrender fallback ordering in `codeFor`, DAS flag not reaching `postSplitHandEV`, soft-total `stateAfter` ace handling, `Ds` tie-breaking (`stand >= hit`).

- [ ] **Step 3: Run the whole suite**

Run: `pnpm test:unit`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add test/unit/engine/chartPins.test.ts
git commit -m "test(engine): pin computed strategy against canonical published charts"
```

---

### Task 13: Hi-Lo counting (`counting.ts`)

**Files:**
- Create: `app/utils/engine/counting.ts`
- Test: `test/unit/engine/counting.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { hiLoValue, CountTracker, ILLUSTRIOUS_18, deviationFor } from '../../../app/utils/engine/counting'
import { buildDeck } from '../../../app/utils/engine/cards'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })

describe('hiLoValue', () => {
  it('tags 2-6 as +1, 7-9 as 0, tens and aces as -1', () => {
    expect(hiLoValue(c(2))).toBe(1)
    expect(hiLoValue(c(6))).toBe(1)
    expect(hiLoValue(c(7))).toBe(0)
    expect(hiLoValue(c(9))).toBe(0)
    expect(hiLoValue(c(10))).toBe(-1)
    expect(hiLoValue(c(13))).toBe(-1)
    expect(hiLoValue(c(14))).toBe(-1)
  })

  it('is balanced: a full deck sums to zero', () => {
    expect(buildDeck().reduce((s, card) => s + hiLoValue(card), 0)).toBe(0)
  })
})

describe('CountTracker', () => {
  it('accumulates the running count from observed cards', () => {
    const t = new CountTracker()
    ;[c(5), c(3), c(13), c(8)].forEach(card => t.observe(card)) // +1 +1 -1 0
    expect(t.running).toBe(1)
    expect(t.cardsSeen).toBe(4)
  })

  it('converts to true count with a clamped divisor', () => {
    const t = new CountTracker()
    for (let i = 0; i < 6; i++) t.observe(c(4)) // RC +6
    expect(t.trueCount(3)).toBeCloseTo(2, 5)
    expect(t.trueCount(0.25)).toBeCloseTo(12, 5) // divisor clamps at 0.5
  })

  it('estimates advantage ≈ (TC − 1) × 0.5%', () => {
    const t = new CountTracker()
    for (let i = 0; i < 6; i++) t.observe(c(4))
    expect(t.advantageEstimate(2)).toBeCloseTo(0.01, 5) // TC 3 → +1.0%
  })

  it('resets at shuffle', () => {
    const t = new CountTracker()
    t.observe(c(5))
    t.reset()
    expect(t.running).toBe(0)
    expect(t.cardsSeen).toBe(0)
  })
})

describe('Illustrious 18 deviations', () => {
  it('includes insurance at TC ≥ +3 as the first entry', () => {
    expect(ILLUSTRIOUS_18[0]!.id).toBe('insurance')
    expect(ILLUSTRIOUS_18[0]!.minTrueCount).toBe(3)
  })

  it('16 vs T stands at TC ≥ 0, reverts to book below', () => {
    expect(deviationFor({ total: 16, soft: false, pair: null }, 10, 1)?.play).toBe('stand')
    expect(deviationFor({ total: 16, soft: false, pair: null }, 10, -1)).toBeNull()
  })

  it('12 vs 3 stands at TC ≥ 2; 13 vs 2 hits below TC −1', () => {
    expect(deviationFor({ total: 12, soft: false, pair: null }, 3, 2)?.play).toBe('stand')
    expect(deviationFor({ total: 12, soft: false, pair: null }, 3, 1)).toBeNull()
    expect(deviationFor({ total: 13, soft: false, pair: null }, 2, -2)?.play).toBe('hit')
  })

  it('splits tens vs 5 at TC ≥ 5 (the table-horror play)', () => {
    expect(deviationFor({ total: 20, soft: false, pair: 10 }, 5, 5)?.play).toBe('split')
    expect(deviationFor({ total: 20, soft: false, pair: 10 }, 5, 4)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/counting.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Card, Bucket } from './cards'
import { bucketOf } from './cards'

/** Hi-Lo tags (spec §4.8). */
export function hiLoValue(card: Card): -1 | 0 | 1 {
  const b = bucketOf(card)
  if (b >= 2 && b <= 6) return 1
  if (b >= 7 && b <= 9) return 0
  return -1
}

/** Tracks the running count from VISIBLE cards only — burn cards never reach observe(). */
export class CountTracker {
  running = 0
  cardsSeen = 0

  observe(card: Card): void {
    this.running += hiLoValue(card)
    this.cardsSeen++
  }

  trueCount(decksRemaining: number): number {
    return this.running / Math.max(0.5, decksRemaining)
  }

  /** Educational estimate, not betting advice (spec §6 scope): ≈ (TC − 1) × 0.5%. */
  advantageEstimate(decksRemaining: number): number {
    return (this.trueCount(decksRemaining) - 1) * 0.005
  }

  reset(): void {
    this.running = 0
    this.cardsSeen = 0
  }
}

export interface Deviation {
  id: string
  description: string
  /** Applies when TC ≥ minTrueCount (or ≤ maxTrueCount for the reverse plays). */
  minTrueCount?: number
  maxTrueCount?: number
  total: number
  soft: boolean
  pair: Bucket | null
  up: Bucket
  play: 'stand' | 'hit' | 'double' | 'split' | 'take-insurance'
}

/** Illustrious 18 (Don Schlesinger), Hi-Lo, multi-deck ordering. Advanced mode only (spec §6). */
export const ILLUSTRIOUS_18: Deviation[] = [
  { id: 'insurance', description: 'Take insurance', minTrueCount: 3, total: 0, soft: false, pair: null, up: 11, play: 'take-insurance' },
  { id: '16vT-stand', description: 'Stand 16 vs T', minTrueCount: 0, total: 16, soft: false, pair: null, up: 10, play: 'stand' },
  { id: '15vT-stand', description: 'Stand 15 vs T', minTrueCount: 4, total: 15, soft: false, pair: null, up: 10, play: 'stand' },
  { id: 'TTv5-split', description: 'Split T,T vs 5', minTrueCount: 5, total: 20, soft: false, pair: 10, up: 5, play: 'split' },
  { id: 'TTv6-split', description: 'Split T,T vs 6', minTrueCount: 4, total: 20, soft: false, pair: 10, up: 6, play: 'split' },
  { id: '10vT-double', description: 'Double 10 vs T', minTrueCount: 4, total: 10, soft: false, pair: null, up: 10, play: 'double' },
  { id: '12v3-stand', description: 'Stand 12 vs 3', minTrueCount: 2, total: 12, soft: false, pair: null, up: 3, play: 'stand' },
  { id: '12v2-stand', description: 'Stand 12 vs 2', minTrueCount: 3, total: 12, soft: false, pair: null, up: 2, play: 'stand' },
  { id: '11vA-double', description: 'Double 11 vs A', minTrueCount: 1, total: 11, soft: false, pair: null, up: 11, play: 'double' },
  { id: '9v2-double', description: 'Double 9 vs 2', minTrueCount: 1, total: 9, soft: false, pair: null, up: 2, play: 'double' },
  { id: '10vA-double', description: 'Double 10 vs A', minTrueCount: 4, total: 10, soft: false, pair: null, up: 11, play: 'double' },
  { id: '9v7-double', description: 'Double 9 vs 7', minTrueCount: 3, total: 9, soft: false, pair: null, up: 7, play: 'double' },
  { id: '16v9-stand', description: 'Stand 16 vs 9', minTrueCount: 5, total: 16, soft: false, pair: null, up: 9, play: 'stand' },
  { id: '13v2-hit', description: 'Hit 13 vs 2 in negative counts', maxTrueCount: -1, total: 13, soft: false, pair: null, up: 2, play: 'hit' },
  { id: '12v4-hit', description: 'Hit 12 vs 4 in negative counts', maxTrueCount: 0, total: 12, soft: false, pair: null, up: 4, play: 'hit' },
  { id: '12v5-hit', description: 'Hit 12 vs 5 in negative counts', maxTrueCount: -2, total: 12, soft: false, pair: null, up: 5, play: 'hit' },
  { id: '12v6-hit', description: 'Hit 12 vs 6 in negative counts', maxTrueCount: -1, total: 12, soft: false, pair: null, up: 6, play: 'hit' },
  { id: '13v3-hit', description: 'Hit 13 vs 3 in negative counts', maxTrueCount: -2, total: 13, soft: false, pair: null, up: 3, play: 'hit' }
]

export function deviationFor(
  state: { total: number, soft: boolean, pair: Bucket | null },
  up: Bucket,
  trueCount: number
): Deviation | null {
  for (const dev of ILLUSTRIOUS_18) {
    if (dev.id === 'insurance') continue // insurance is queried separately by the advisor
    if (dev.up !== up || dev.total !== state.total || dev.soft !== state.soft) continue
    if (dev.pair !== null && dev.pair !== state.pair) continue
    if (dev.minTrueCount !== undefined && trueCount >= dev.minTrueCount) return dev
    if (dev.maxTrueCount !== undefined && trueCount <= dev.maxTrueCount) return dev
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/counting.test.ts`
Expected: PASS (11 tests). Note `12v4-hit` uses `maxTrueCount: 0` exclusive-boundary semantics via ≤; the test for 16vT at TC −1 must return null because `minTrueCount: 0` requires TC ≥ 0.

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/counting.ts test/unit/engine/counting.test.ts
git commit -m "feat(engine): add Hi-Lo count tracker and Illustrious 18 deviations"
```

---

### Task 14: Side bets (`sideBets.ts`)

**Files:**
- Create: `app/utils/engine/sideBets.ts`
- Test: `test/unit/engine/sideBets.test.ts`

**Source-verification step:** before finalizing constants, open the pay tables in `docs/Rules-Blackjack-10-08-2020.pdf` (§23(f) Match-the-Dealer, §24(f) twenty-point bonus, §27(g) Buster, §28(f) 21+3) and `docs/BLYS_AC-BlackJack-GamingGuide-4x9-Updated.pdf` (21+3 Xtreme) and confirm every multiplier below matches the documents. Fix any transcription drift in BOTH the constants and the tests.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  evaluate21Plus3, evaluateLuckyLadies, evaluateMatchTheDealer, evaluateBuster
} from '../../../app/utils/engine/sideBets'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit): Card => ({ rank, suit })

describe('21+3 (MA §28, AC Xtreme)', () => {
  it('detects straight flush, trips, straight, flush in precedence order', () => {
    expect(evaluate21Plus3([c(5, 'hearts'), c(6, 'hearts')], c(7, 'hearts'), 'MA-B').label).toBe('straight-flush')
    expect(evaluate21Plus3([c(13, 'hearts'), c(13, 'clubs')], c(13, 'spades'), 'MA-B').label).toBe('three-of-a-kind')
    expect(evaluate21Plus3([c(5, 'hearts'), c(6, 'clubs')], c(7, 'spades'), 'MA-B').label).toBe('straight')
    expect(evaluate21Plus3([c(2, 'hearts'), c(9, 'hearts')], c(13, 'hearts'), 'MA-B').label).toBe('flush')
  })

  it('pays table B: SF 30, trips 20, straight 10, flush 5; table A pays 9 flat', () => {
    expect(evaluate21Plus3([c(5, 'hearts'), c(6, 'hearts')], c(7, 'hearts'), 'MA-B').payoutMultiplier).toBe(30)
    expect(evaluate21Plus3([c(13, 'hearts'), c(13, 'clubs')], c(13, 'spades'), 'MA-B').payoutMultiplier).toBe(20)
    expect(evaluate21Plus3([c(5, 'hearts'), c(6, 'clubs')], c(7, 'spades'), 'MA-B').payoutMultiplier).toBe(10)
    expect(evaluate21Plus3([c(2, 'hearts'), c(9, 'hearts')], c(13, 'hearts'), 'MA-B').payoutMultiplier).toBe(5)
    expect(evaluate21Plus3([c(2, 'hearts'), c(9, 'hearts')], c(13, 'hearts'), 'MA-A').payoutMultiplier).toBe(9)
  })

  it('allows ace-low straights (A-2-3, MA §28(b)) and ace-high (Q-K-A)', () => {
    expect(evaluate21Plus3([c(14, 'hearts'), c(2, 'clubs')], c(3, 'spades'), 'MA-B').label).toBe('straight')
    expect(evaluate21Plus3([c(12, 'hearts'), c(13, 'clubs')], c(14, 'spades'), 'MA-B').label).toBe('straight')
  })

  it('trips are by rank, not point value (K-K-T is no trips)', () => {
    const r = evaluate21Plus3([c(13, 'hearts'), c(13, 'clubs')], c(10, 'spades'), 'MA-B')
    expect(r.win).toBe(false)
  })
})

describe('Lucky Ladies / twenty-point bonus (MA §24)', () => {
  const dealerBJ = true
  it('pays the Q♥ pair tiers', () => {
    const qh: [Card, Card] = [c(12, 'hearts'), c(12, 'hearts')]
    expect(evaluateLuckyLadies(qh, !dealerBJ, 'MA-A').payoutMultiplier).toBe(125)
    expect(evaluateLuckyLadies(qh, !dealerBJ, 'MA-B').payoutMultiplier).toBe(200)
    expect(evaluateLuckyLadies(qh, dealerBJ, 'MA-A').payoutMultiplier).toBe(1000)
  })

  it('distinguishes matched / suited / any 20 (MA §24(g))', () => {
    expect(evaluateLuckyLadies([c(13, 'diamonds'), c(13, 'diamonds')], false, 'MA-A').payoutMultiplier).toBe(19) // matched: identical rank+suit
    expect(evaluateLuckyLadies([c(13, 'diamonds'), c(11, 'diamonds')], false, 'MA-A').payoutMultiplier).toBe(9) // suited
    expect(evaluateLuckyLadies([c(13, 'diamonds'), c(13, 'hearts')], false, 'MA-A').payoutMultiplier).toBe(4) // any 20
    expect(evaluateLuckyLadies([c(14, 'spades'), c(9, 'clubs')], false, 'MA-A').payoutMultiplier).toBe(4) // soft 20 counts
  })

  it('loses on non-20 totals', () => {
    expect(evaluateLuckyLadies([c(10, 'spades'), c(9, 'clubs')], false, 'MA-A').win).toBe(false)
  })
})

describe('Match the Dealer (MA §23)', () => {
  it('matches by rank with ten-values matching identical rank only (MA §23(a))', () => {
    const r = evaluateMatchTheDealer([c(13, 'hearts'), c(5, 'clubs')], c(13, 'spades'), 6)
    expect(r.win).toBe(true)
    const noMatch = evaluateMatchTheDealer([c(10, 'hearts'), c(5, 'clubs')], c(13, 'spades'), 6)
    expect(noMatch.win).toBe(false) // 10 does not match K
  })

  it('pays the 6-deck column: unsuited 4, suited 11, both 15, two unsuited 8, two suited 22', () => {
    expect(evaluateMatchTheDealer([c(13, 'hearts'), c(5, 'clubs')], c(13, 'spades'), 6).payoutMultiplier).toBe(4)
    expect(evaluateMatchTheDealer([c(13, 'spades'), c(5, 'clubs')], c(13, 'spades'), 6).payoutMultiplier).toBe(11)
    expect(evaluateMatchTheDealer([c(13, 'spades'), c(13, 'hearts')], c(13, 'spades'), 6).payoutMultiplier).toBe(15)
    expect(evaluateMatchTheDealer([c(13, 'hearts'), c(13, 'diamonds')], c(13, 'spades'), 6).payoutMultiplier).toBe(8)
    expect(evaluateMatchTheDealer([c(13, 'spades'), c(13, 'spades')], c(13, 'spades'), 6).payoutMultiplier).toBe(22)
  })

  it('pays the 8-deck column: unsuited 3, suited 14', () => {
    expect(evaluateMatchTheDealer([c(13, 'hearts'), c(5, 'clubs')], c(13, 'spades'), 8).payoutMultiplier).toBe(3)
    expect(evaluateMatchTheDealer([c(13, 'spades'), c(5, 'clubs')], c(13, 'spades'), 8).payoutMultiplier).toBe(14)
  })
})

describe('Buster (MA §27)', () => {
  it('loses when the dealer does not bust or has blackjack (MA §27(d))', () => {
    expect(evaluateBuster([c(10, 'hearts'), c(7, 'clubs')], false, 'A').win).toBe(false)
    expect(evaluateBuster([c(14, 'hearts'), c(13, 'clubs')], true, 'A').win).toBe(false)
  })

  it('pays paytable A by busted-hand card count: 3-4 cards 2, 5 cards 4, 6 cards 15, 7 cards 50, 8+ 250', () => {
    const bust3 = [c(10, 'hearts'), c(6, 'clubs'), c(10, 'spades')]
    const bust5 = [c(2, 'hearts'), c(3, 'clubs'), c(4, 'spades'), c(5, 'hearts'), c(9, 'clubs')]
    const bust6 = [c(2, 'hearts'), c(2, 'clubs'), c(3, 'spades'), c(4, 'hearts'), c(5, 'clubs'), c(7, 'spades')]
    expect(evaluateBuster(bust3, false, 'A').payoutMultiplier).toBe(2)
    expect(evaluateBuster(bust5, false, 'A').payoutMultiplier).toBe(4)
    expect(evaluateBuster(bust6, false, 'A').payoutMultiplier).toBe(15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/sideBets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Card } from './cards'
import { pointValue } from './cards'
import { handTotal } from './hand'

export interface SideBetResult {
  name: string
  win: boolean
  payoutMultiplier: number // winnings per unit staked (0 when lost)
  label: string
}

// ---- 21+3 (MA §28(f) tables A/B; AC guide "21+3 Xtreme" = table B values) ----

const TWENTY_ONE_PLUS_THREE_PAYS: Record<string, Record<string, number>> = {
  'MA-A': { 'straight-flush': 9, 'three-of-a-kind': 9, 'straight': 9, 'flush': 9 },
  'MA-B': { 'straight-flush': 30, 'three-of-a-kind': 20, 'straight': 10, 'flush': 5 },
  'AC-XTREME': { 'straight-flush': 30, 'three-of-a-kind': 20, 'straight': 10, 'flush': 5 }
}

function isStraightRanks(ranks: number[]): boolean {
  const sorted = [...ranks].sort((a, b) => a - b)
  const consecutive = sorted[2]! - sorted[1]! === 1 && sorted[1]! - sorted[0]! === 1
  const aceLow = sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 14 // A-2-3 (MA §28(b))
  return consecutive || aceLow
}

export function evaluate21Plus3(
  player: [Card, Card],
  dealerUp: Card,
  table: 'MA-A' | 'MA-B' | 'AC-XTREME'
): SideBetResult {
  const cards = [...player, dealerUp]
  const ranks = cards.map(c => c.rank)
  const flush = cards.every(c => c.suit === cards[0]!.suit)
  const trips = ranks.every(r => r === ranks[0]) // by RANK — K-K-T is not trips
  const straight = isStraightRanks(ranks)
  const label = straight && flush
    ? 'straight-flush'
    : trips ? 'three-of-a-kind' : straight ? 'straight' : flush ? 'flush' : 'none'
  const pays = TWENTY_ONE_PLUS_THREE_PAYS[table]!
  const multiplier = label === 'none' ? 0 : pays[label]!
  return { name: '21+3', win: multiplier > 0, payoutMultiplier: multiplier, label }
}

// ---- Lucky Ladies / twenty-point bonus (MA §24(f)-(g)) ----

const LUCKY_LADIES_PAYS: Record<string, Record<string, number>> = {
  'MA-A': { 'qh-pair-dealer-bj': 1000, 'qh-pair': 125, 'matched-20': 19, 'suited-20': 9, 'any-20': 4 },
  'MA-B': { 'qh-pair-dealer-bj': 1000, 'qh-pair': 200, 'matched-20': 25, 'suited-20': 10, 'any-20': 4 }
}

export function evaluateLuckyLadies(
  player: [Card, Card],
  dealerHasBlackjack: boolean,
  table: 'MA-A' | 'MA-B'
): SideBetResult {
  const [a, b] = player
  const total = handTotal(player).total
  let label = 'none'
  if (total === 20) {
    const qhPair = a.rank === 12 && b.rank === 12 && a.suit === 'hearts' && b.suit === 'hearts'
    if (qhPair) {
      label = dealerHasBlackjack ? 'qh-pair-dealer-bj' : 'qh-pair'
    } else if (a.rank === b.rank && a.suit === b.suit) {
      label = 'matched-20' // identical cards, multi-deck (MA §24(g)(1))
    } else if (a.suit === b.suit) {
      label = 'suited-20'
    } else {
      label = 'any-20'
    }
  }
  const multiplier = label === 'none' ? 0 : LUCKY_LADIES_PAYS[table]![label]!
  return { name: 'Lucky Ladies', win: multiplier > 0, payoutMultiplier: multiplier, label }
}

// ---- Match the Dealer (MA §23(f), deck-dependent) ----

interface MtdPays { twoSuited: number, suitedPlusUnsuited: number, oneSuited: number, twoUnsuited: number, oneUnsuited: number }

const MATCH_THE_DEALER_PAYS: Partial<Record<number, MtdPays>> = {
  // VERIFY against MA §23(f) Tables 1-2 before finalizing (see task preamble)
  2: { twoSuited: 0, suitedPlusUnsuited: 23, oneSuited: 19, twoUnsuited: 8, oneUnsuited: 4 },
  4: { twoSuited: 24, suitedPlusUnsuited: 16, oneSuited: 12, twoUnsuited: 8, oneUnsuited: 4 },
  6: { twoSuited: 22, suitedPlusUnsuited: 15, oneSuited: 11, twoUnsuited: 8, oneUnsuited: 4 },
  8: { twoSuited: 28, suitedPlusUnsuited: 17, oneSuited: 14, twoUnsuited: 6, oneUnsuited: 3 }
}

/** Ten-value cards match identical rank only (MA §23(a)): a 10 never matches a K. */
export function evaluateMatchTheDealer(player: [Card, Card], dealerUp: Card, decks: number): SideBetResult {
  const pays = MATCH_THE_DEALER_PAYS[decks] ?? MATCH_THE_DEALER_PAYS[6]!
  const matches = player.filter(c => c.rank === dealerUp.rank)
  const suitedMatches = matches.filter(c => c.suit === dealerUp.suit).length
  const unsuitedMatches = matches.length - suitedMatches
  let label = 'none'
  let multiplier = 0
  if (matches.length === 2) {
    if (suitedMatches === 2) [label, multiplier] = ['two-suited', pays.twoSuited]
    else if (suitedMatches === 1) [label, multiplier] = ['suited-plus-unsuited', pays.suitedPlusUnsuited]
    else [label, multiplier] = ['two-unsuited', pays.twoUnsuited]
  } else if (matches.length === 1) {
    if (suitedMatches === 1) [label, multiplier] = ['one-suited', pays.oneSuited]
    else [label, multiplier] = ['one-unsuited', pays.oneUnsuited]
  }
  return { name: 'Match the Dealer', win: multiplier > 0, payoutMultiplier: multiplier, label }
}

// ---- Buster (MA §27(g) paytables A-F) ----

const BUSTER_PAYS: Record<string, Record<string, number>> = {
  A: { '3': 2, '4': 2, '5': 4, '6': 15, '7': 50, '8+': 250 },
  B: { '3': 2, '4': 2, '5': 4, '6': 15, '7': 50, '8+': 200 },
  C: { '3': 2, '4': 2, '5': 4, '6': 12, '7': 50, '8+': 250 },
  D: { '3': 2, '4': 2, '5': 4, '6': 12, '7': 50, '8+': 200 },
  E: { '3': 2, '4': 2, '5': 3, '6': 12, '7': 50, '8+': 250 },
  F: { '3': 1, '4': 2, '5': 8, '6': 20, '7': 50, '8+': 250 }
}

export function evaluateBuster(
  dealerCards: Card[],
  dealerHasBlackjack: boolean,
  table: keyof typeof BUSTER_PAYS
): SideBetResult {
  const busted = handTotal(dealerCards).total > 21
  if (dealerHasBlackjack || !busted) {
    return { name: 'Buster', win: false, payoutMultiplier: 0, label: 'none' }
  }
  const n = dealerCards.length
  const key = n >= 8 ? '8+' : String(n)
  const multiplier = BUSTER_PAYS[table]![key]!
  return { name: 'Buster', win: true, payoutMultiplier: multiplier, label: `bust-${key}-cards` }
}
```

- [ ] **Step 4: Verify constants against the PDFs** (task preamble), then run the test

Run: `pnpm test:unit test/unit/engine/sideBets.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/sideBets.ts test/unit/engine/sideBets.test.ts
git commit -m "feat(engine): add four side-bet evaluators with official pay tables"
```

---

### Task 15: Round engine (`round.ts`)

**Files:**
- Create: `app/utils/engine/round.ts`
- Test: `test/unit/engine/round.test.ts`

`BlackjackGame` owns the shoe across rounds and exposes a typed event stream. The casino/quick toggle lives entirely in the UI: events are emitted synchronously in dealing order; the UI paces them. `Shoe` is consumed through the structural interface `CardSource` so tests can inject a stacked deck.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { BlackjackGame, IllegalActionError } from '../../../app/utils/engine/round'
import type { CardSource } from '../../../app/utils/engine/round'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })

/** Deals scripted cards in order; deal sequence is spot1,spot2,...,dealerUp,spot1,...,dealerHole (MA §6(d)). */
class StackedShoe implements CardSource {
  constructor(private stack: Card[]) {}
  draw(): Card {
    if (!this.stack.length) throw new Error('stack exhausted')
    return this.stack.shift()!
  }
  discard(): void {}
  needsShuffle(): boolean { return false }
  freshShoe(): void {}
  cardsRemaining(): number { return this.stack.length }
  estimatedDecksRemaining(): number { return 1 }
  decksRemaining(): number { return this.stack.length / 52 }
}

const RULES = (() => {
  const r = cloneRules(PRESETS.MA_205CMR!) // 3:2, LS, insurance, even money
  r.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return r
})()

function game(stack: Card[], rules = RULES) {
  return new BlackjackGame(rules, { shoe: new StackedShoe(stack) })
}

describe('BlackjackGame — round flow', () => {
  it('deals in MA §6(d) order and reaches playerTurns', () => {
    // hero 10,9 (19); dealer up 7, hole 10 (17)
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs')])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.phase).toBe('playerTurns')
    expect(g.spots[0]!.hands[0]!.cards.map(x => x.rank)).toEqual([10, 9])
    expect(g.dealerUp!.rank).toBe(7)
    expect(g.holeRevealed).toBe(false)
  })

  it('settles a simple win 1:1 and a push as void (MA §3(b),(e))', () => {
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs')]) // 19 vs 17
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'stand')
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1000)

    const push = game([c(10), c(7, 'hearts'), c(7), c(10, 'clubs')]) // 17 vs 17
    push.beginRound([{ spotId: 0, mainBet: 1000 }])
    push.act(0, 'stand')
    expect(push.spots[0]!.hands[0]!.netResult).toBe(0)
  })

  it('pays blackjack 3:2 immediately when dealer shows 2-9 (MA §7(a))', () => {
    const g = game([c(14), c(9, 'hearts'), c(13), c(5, 'clubs'), c(10), c(2)]) // hero A,K; dealer 9,5,+draws
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1500)
    expect(g.phase).toBe('complete') // lone BJ hand → dealer needn't draw for outcome? buster off, no live hands → MA §12(c)
  })

  it('pays 6:5 when configured', () => {
    const r = cloneRules(RULES)
    r.blackjackPayout = '6:5'
    r.evenMoneyOffered = false
    const g = game([c(14), c(9, 'hearts'), c(13), c(5, 'clubs')], r)
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1200)
  })

  it('dealer blackjack beats 21-in-three but pushes a player blackjack (MA §3(a)(3),(b))', () => {
    // hero 7,7 hits 7 → 21; dealer A,10 = BJ. Insurance declined.
    const g = game([c(7), c(14, 'hearts'), c(7, 'clubs'), c(10, 'clubs')])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.phase).toBe('insurance')
    g.insuranceDecision(0, null)
    g.finishInsurance()
    expect(g.phase).toBe('complete') // peek found BJ; hand never acts
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-1000)
  })
})

describe('BlackjackGame — insurance & even money (MA §9, §7(c))', () => {
  it('insurance pays 2:1 on dealer BJ; max half the wager (MA §9(b))', () => {
    const g = game([c(10), c(14, 'hearts'), c(9), c(13, 'clubs')]) // 19 vs dealer BJ
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(g.phase).toBe('insurance')
    expect(() => g.insuranceDecision(0, 600)).toThrow(IllegalActionError)
    g.insuranceDecision(0, 500)
    g.finishInsurance()
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-1000)
    expect(g.spots[0]!.insuranceNet).toBe(1000) // 500 at 2:1
  })

  it('losing insurance is collected before play continues (MA §9(d))', () => {
    const g = game([c(10), c(14, 'hearts'), c(9), c(9, 'clubs')]) // dealer A,9 — no BJ
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.insuranceDecision(0, 500)
    g.finishInsurance()
    expect(g.phase).toBe('playerTurns')
    expect(g.spots[0]!.insuranceNet).toBe(-500)
  })

  it('even money pays 1:1 immediately for BJ vs ace (MA §7(c))', () => {
    const g = game([c(14), c(14, 'hearts'), c(13), c(13, 'clubs')]) // hero BJ vs dealer A,K (BJ!)
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.insuranceDecision(0, 'even-money')
    g.finishInsurance()
    expect(g.spots[0]!.hands[0]!.netResult).toBe(1000) // immune to the dealer BJ
  })
})

describe('BlackjackGame — player actions', () => {
  it('double draws exactly one card and doubles the stake (MA §10)', () => {
    // hero 6,5; dealer up 9, hole 8 (17); double card 10 → 21
    const g = game([c(6), c(9, 'hearts'), c(5), c(8, 'clubs'), c(10)])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'double')
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(2000) // doubled stake of 2000 wins 1:1
  })

  it('split deals each hand in order; split aces get one card (MA §11)', () => {
    // hero 8,8 → split; hand1 gets 3 (11), double gets 10 (21); hand2 gets 10 (18) stand
    // dealer up 6, hole 10, draws 5 → 21? 6+10+5=21 — choose hole 10 draw 2 → 18
    const g = game([c(8), c(6, 'hearts'), c(8, 'clubs'), c(10, 'clubs'), c(3), c(10), c(10, 'diamonds'), c(2, 'hearts')])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'split')
    expect(g.spots[0]!.hands).toHaveLength(2)
    g.act(0, 'double') // hand 1: 8+3 → 21
    g.act(0, 'stand') // hand 2: 8+10
    expect(g.phase).toBe('complete')
    // dealer: 6,10,2 = 18 → hand1 (21, 2000 staked) wins 2000; hand2 (18) pushes
    expect(g.spots[0]!.hands[0]!.netResult).toBe(2000)
    expect(g.spots[0]!.hands[1]!.netResult).toBe(0)
  })

  it('surrender forfeits half and ends the hand (MA §8)', () => {
    const g = game([c(10), c(13, 'hearts'), c(6), c(9, 'clubs')]) // 16 vs K... up K peeks: hole 9, no BJ
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'surrender')
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-500)
  })

  it('throws IllegalActionError on actions outside legalActions', () => {
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs'), c(5)])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(() => g.act(0, 'split')).toThrow(IllegalActionError) // 10,9 is no pair
    g.act(0, 'stand')
    expect(() => g.act(0, 'hit')).toThrow(IllegalActionError) // round complete
  })

  it('busting forfeits immediately and dealer skips drawing when nothing remains (MA §12(c))', () => {
    const g = game([c(10), c(7, 'hearts'), c(6), c(10, 'clubs'), c(10, 'diamonds')])
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    g.act(0, 'hit') // 16 + 10 = bust
    expect(g.phase).toBe('complete')
    expect(g.spots[0]!.hands[0]!.netResult).toBe(-1000)
    expect(g.dealerCards).toHaveLength(2) // no draw — outcome could not be affected
  })
})

describe('BlackjackGame — events', () => {
  it('emits visible-card events for face-up cards only, hole on reveal', () => {
    const seen: string[] = []
    const g = game([c(10), c(7, 'hearts'), c(9), c(10, 'clubs'), c(5)])
    g.on((e) => {
      if (e.type === 'count-visible-card') seen.push(`${e.card.rank}`)
    })
    g.beginRound([{ spotId: 0, mainBet: 1000 }])
    expect(seen).toEqual(['10', '7', '9']) // hole not yet visible
    g.act(0, 'stand')
    expect(seen).toContain('10') // hole revealed at dealer turn
    expect(seen.length).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/round.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
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

export type GameEvent =
  | { type: 'shuffle' }
  | { type: 'card-dealt', to: 'dealer-up' | 'dealer-hole' | 'dealer-draw' | { spotId: number, handIndex: number }, card: Card, faceUp: boolean }
  | { type: 'count-visible-card', card: Card }
  | { type: 'announce', text: string }
  | { type: 'phase', phase: Phase }
  | { type: 'peek-result', blackjack: boolean }
  | { type: 'hand-settled', spotId: number, handIndex: number, outcome: NonNullable<SettledHand['outcome']>, net: number }
  | { type: 'side-bet-settled', spotId: number, result: SideBetResult, net: number }

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
      return
    }
    if (decision === null) {
      spot.insuranceBet = null
      return
    }
    if (decision <= 0 || decision > Math.ceil(hand.bet / 2)) {
      throw new IllegalActionError('insurance is capped at half the wager (MA §9(b))')
    }
    spot.insuranceBet = decision
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
        }
      }
    }

    if (dealerBJ) {
      this.revealHole()
      this.settleLuckyLadies(true) // the 1000:1 Q♥-pair tier needs dealer-BJ knowledge (MA §24(f))
      this.settleAgainstDealerBlackjack()
      this.completeRound()
      return
    }
    this.startPlayerTurns()
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

      const busterStake = spot.sideBets.buster ?? 0
      if (busterStake > 0 && this.rules.sideBets.buster !== 'off') {
        const result = evaluateBuster(this.dealerCards, isBlackjack(this.dealerCards, false), this.rules.sideBets.buster)
        this.recordSideBet(spot, result, busterStake)
      }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/round.test.ts`
Expected: PASS (14 tests). The split test is the tricky one — verify hand ordering after `splice` and that the second split hand receives its card only when it becomes active (MA §11(b)). Clean up the `finishHand` dead `next` variable if the linter flags it. Then run `pnpm test:unit && pnpm lint && pnpm typecheck` — all green.

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/round.ts test/unit/engine/round.test.ts
git commit -m "feat(engine): add BlackjackGame round engine with events, insurance, splits, settlement"
```

---

### Task 16: Bot personas (`bots.ts`)

**Files:**
- Create: `app/utils/engine/bots.ts`
- Test: `test/unit/engine/bots.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { PERSONAS, decideFor } from '../../../app/utils/engine/bots'
import { PRESETS } from '../../../app/utils/engine/rules'
import { newHand } from '../../../app/utils/engine/hand'
import { mulberry32 } from '../../../app/utils/engine/rng'
import type { Card, Suit } from '../../../app/utils/engine/cards'

const c = (rank: number, suit: Suit = 'spades'): Card => ({ rank, suit })
const RULES = PRESETS.VEGAS_STRIP_6D!
const up9 = c(9, 'hearts')
const up6 = c(6, 'hearts')

describe('PERSONAS', () => {
  it('ships the five v1 personas', () => {
    expect(PERSONAS.map(p => p.id)).toEqual(['bea', 'nancy', 'mike', 'ivan', 'lou'])
  })

  it('every persona has flavor and at least 3 quips per category', () => {
    for (const p of PERSONAS) {
      expect(p.flavor.length).toBeGreaterThan(10)
      for (const lines of Object.values(p.quips)) {
        expect(lines.length).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

describe('decideFor', () => {
  it('Bea plays perfect book (16 v 9 hits, 11 v 6 doubles, 8,8 splits)', () => {
    expect(decideFor('bea', newHand([c(10), c(6)], 1000), 1, up9, RULES)).toBe('hit')
    expect(decideFor('bea', newHand([c(6), c(5)], 1000), 1, up6, RULES)).toBe('double')
    expect(decideFor('bea', newHand([c(8, 'hearts'), c(8, 'clubs')], 1000), 1, up9, RULES)).toBe('split')
  })

  it('Nancy never risks a bust: stands all 12+, hits below', () => {
    expect(decideFor('nancy', newHand([c(8), c(4)], 1000), 1, up9, RULES)).toBe('stand') // 12 v 9!
    expect(decideFor('nancy', newHand([c(6), c(5)], 1000), 1, up6, RULES)).toBe('hit') // 11 can't bust
  })

  it('Mike mimics the dealer: hits to 17 per the table rule, never doubles or splits', () => {
    expect(decideFor('mike', newHand([c(10), c(6)], 1000), 1, up6, RULES)).toBe('hit') // 16 v 6 (book stands!)
    expect(decideFor('mike', newHand([c(14), c(6)], 1000), 1, up6, RULES)).toBe('stand') // soft 17 under S17 — he copies the table rule
    expect(decideFor('mike', newHand([c(8, 'hearts'), c(8, 'clubs')], 1000), 1, up6, RULES)).toBe('hit') // 16, no split
  })

  it('Lou refuses to hit 16 ("never bust a 16, kid")', () => {
    expect(decideFor('lou', newHand([c(10), c(6)], 1000), 1, up9, RULES)).toBe('stand')
  })

  it('Ivan plays book but always wants insurance', () => {
    const ivan = PERSONAS.find(p => p.id === 'ivan')!
    expect(ivan.takesInsurance).toBe(true)
    const bea = PERSONAS.find(p => p.id === 'bea')!
    expect(bea.takesInsurance).toBe(false)
  })
})

describe('bet progression', () => {
  it('Lou presses after wins and retreats after losses, deterministically', () => {
    const lou = PERSONAS.find(p => p.id === 'lou')!
    const rng = mulberry32(5)
    const afterWin = lou.nextBet(1000, 'win', RULES, rng)
    const afterLoss = lou.nextBet(1000, 'lose', RULES, rng)
    expect(afterWin).toBeGreaterThan(1000)
    expect(afterLoss).toBeLessThanOrEqual(1000)
    expect(afterWin % 100).toBe(0) // whole-dollar bets
  })

  it('flat bettors return the base bet', () => {
    const bea = PERSONAS.find(p => p.id === 'bea')!
    expect(bea.nextBet(1000, 'win', RULES, mulberry32(1))).toBe(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit test/unit/engine/bots.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
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
  return personaById.has(id) ? 'stand' : 'stand'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit test/unit/engine/bots.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/engine/bots.ts test/unit/engine/bots.test.ts
git commit -m "feat(engine): add five bot personas with decision profiles and quips"
```

---

### Task 17: Simulation proof & engine release notes

**Files:**
- Test: `test/unit/engine/simulation.test.ts`
- Modify: `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Write the simulation test**

```ts
import { describe, expect, it } from 'vitest'
import { BlackjackGame } from '../../../app/utils/engine/round'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { houseEdge } from '../../../app/utils/engine/basicStrategy'
import { decideFor } from '../../../app/utils/engine/bots'
import { isBlackjack } from '../../../app/utils/engine/hand'

const ROUNDS = 200_000
const BET = 1000 // cents

describe('simulation — perfect basic strategy vs computed house edge', () => {
  it(`empirical edge over ${ROUNDS} seeded rounds matches houseEdge() within 3σ + model slack`, () => {
    const rules = cloneRules(PRESETS.VEGAS_STRIP_6D!)
    rules.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    const game = new BlackjackGame(rules, { seed: 12345 })

    let totalNet = 0
    let totalWagered = 0
    let playerBlackjacks = 0

    for (let i = 0; i < ROUNDS; i++) {
      game.beginRound([{ spotId: 0, mainBet: BET }])
      if (game.phase === 'insurance') {
        game.insuranceDecision(0, null) // book: never insure
        game.finishInsurance()
      }
      while (game.phase === 'playerTurns') {
        const spot = game.spots[0]!
        const hand = spot.hands[spot.activeHandIndex]!
        game.act(0, decideFor('bea', hand, spot.hands.length, game.dealerUp!, rules))
      }
      const spot = game.spots[0]!
      if (spot.hands.length === 1 && isBlackjack(spot.hands[0]!.cards, false)) playerBlackjacks++
      for (const hand of spot.hands) {
        totalNet += hand.netResult
        totalWagered += hand.bet
      }
    }

    // houseEdge() is expressed per ORIGINAL bet (doubles/splits contribute ±2 to that unit),
    // so normalize by rounds × base bet, not by total wagered.
    const empiricalEdge = -totalNet / (ROUNDS * BET)
    const theoreticalEdge = houseEdge(rules)
    expect(totalWagered).toBeGreaterThanOrEqual(ROUNDS * BET) // sanity: doubles/splits add stake

    // Per-round σ ≈ 1.15 bet units; on the wagered-normalized edge it shrinks ≈ 1/√n
    const sigma = 1.15 / Math.sqrt(ROUNDS)
    const tolerance = 3 * sigma + 0.001 // + fixed-composition model slack
    expect(Math.abs(empiricalEdge - theoreticalEdge), `empirical ${empiricalEdge}, theory ${theoreticalEdge}`)
      .toBeLessThan(tolerance)

    // Player blackjack frequency ≈ 4.75% (6 decks), generous ±0.3pp window
    const bjRate = playerBlackjacks / ROUNDS
    expect(bjRate).toBeGreaterThan(0.0445)
    expect(bjRate).toBeLessThan(0.0505)
  }, 60_000)
})
```

- [ ] **Step 2: Run the simulation**

Run: `pnpm test:unit test/unit/engine/simulation.test.ts`
Expected: PASS in well under 60s. A tolerance failure here means a real engine bug (payout math, settlement, dealer logic, or strategy) — bisect by asserting intermediate stats (dealer bust rate ≈ published, push rate ≈ 8-9%).

- [ ] **Step 3: Update `CHANGELOG.md`** — replace the `### Added` block under `## [Unreleased]` with:

```markdown
### Added
- Project scaffold (Nuxt 4 family stack, craps-skeleton conventions)
- Pure TypeScript blackjack engine (`app/utils/engine/`): cards/shoe with burn + cut-card
  penetration, rulebook-cited rule presets (MA 205 CMR / Bally's AC / WA / Vegas Strip / single-deck 6:5),
  computed basic-strategy EV engine pinned to canonical charts, Hi-Lo counting with Illustrious 18,
  four side bets with official pay tables (21+3, Lucky Ladies, Match the Dealer, Buster),
  event-emitting round engine, five bot personas
- Statistical simulation test: 200k seeded rounds verify empirical house edge against theory
```

- [ ] **Step 4: Update `README.md`** — replace the `## Status` section body with:

```markdown
v0.1.0 — engine complete (fully tested, simulation-verified); UI in progress.
Design spec: `docs/superpowers/specs/2026-06-11-blackjack-trainer-design.md`.
Engine: `app/utils/engine/` — framework-free TypeScript, seeded RNG, official-rulebook citations inline.
```

- [ ] **Step 5: Full verification, then commit**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: every test green (≈130 tests), no lint or type errors.

```bash
git add -A
git commit -m "test(engine): add 200k-round simulation proof; document engine completion"
```

---

## Plan 1 complete — definition of done

- `pnpm test` green: unit suite including chart pins and the 200k-round simulation.
- `pnpm lint`, `pnpm typecheck` clean; `pnpm dev` boots the shell page.
- Engine modules importable with zero Vue/Nuxt dependencies (verify: `grep -r "from 'vue'\|from '#app'\|defineNuxt" app/utils/engine/` returns nothing).
- Plans 2 (game UI) and 3 (training surfaces + E2E + deploy) are written as separate documents after this plan lands, grounded in the real engine API.


