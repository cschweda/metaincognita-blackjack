# Coverage Enforcement + Netlify Hardening

**Date:** 2026-07-10 · **Status:** approved · **Source:** full-app review round two (delivery-infrastructure findings)

Two problems, one theme: quality claims that automation doesn't actually enforce. The coverage
thresholds in `vitest.config.ts` never run in CI (nothing passes `--coverage`), and the Netlify
config is missing the security/caching headers a hardened static app should ship — while
re-running the whole test suite on every deploy for no additional safety.

Approved scope: core (enforce coverage, fix headers) + two riders (raise weak coverage,
build-only deploys). Explicitly excluded: the CI polish rider (concurrency groups, job
timeouts, Playwright browser caching) — user opted out.

## Measured baseline (2026-07-10, post-review-fixes merge, 395 tests)

| Scope | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| All files | 93.19 | 84.17 | 93.93 | 95.66 |
| `app/utils/engine/**` (aggregate) | 95.70 | 89.86 | 97.31 | 98.23 |
| `app/composables/**` | 88.88 | 72.60 | 90.65 | 93.17 |
| `app/stores/**` | 93.67 | 83.63 | 96.55 | 95.45 |
| `app/workers/**` | 0 | 0 | 0 | 0 |
| worst files | `bots.ts` 72.5/67.6/75.0 · `useGameLoop.ts` 87.0/71.9/88.1 · `rules.ts` 83.3/81.8 |

## 1. Raise the weak spots FIRST (rider 1 — sequenced before floors)

New unit tests (TDD where behavior is being pinned, coverage-driven selection):

- **`app/utils/engine/bots.ts`** (72.5/67.6 → target ≥ 90 stmt / ≥ 85 branch): per-persona
  `decideFor` decision branches (the deliberate strategy leaks the analysis page measures) and
  `nextBet` progression behaviors. Uncovered today: lines 33, 81-95, 134-138.
- **`app/workers/ruin-sim.ts`** (0% → covered): unit-test the `onmessage` protocol dispatch by
  stubbing the worker global scope (`self`) — `freqs` reply keyed by request key, `simulate`
  with progress echoes, `result` id-matching, error propagation. The math under it
  (`simulateTrajectories`, `tcFrequencies`) is already covered by `betRamp.test.ts`; this
  covers the thin protocol layer whose only current test is one e2e.
- **`app/composables/useDrillFeedback.ts:27`** (branch 50%): `announce()` with a plain
  `HTMLElement` in `focusEl` (the non-`$el` arm).
- **`app/composables/useCounting.ts:40-59`** (branch 78.6%): `restoreCounting` null-coalescing
  arms (no persisted state) and `resetCounting` store interaction.
- **Not in scope:** chasing `useGameLoop.ts` branch coverage — its remaining arms are deep
  casino-pacing/error paths; the new floor locks its current level.

## 2. Enforce coverage in CI (core)

- `.github/workflows/ci.yml` `quality` job: `pnpm test` → `pnpm test:coverage` (one run does
  both; ~2s instrumentation overhead measured locally).
- Add an `actions/upload-artifact` step (`if: failure()`, like the existing playwright-report
  upload in the e2e job) for `coverage/` so threshold failures are diagnosable.
- `vitest.config.ts` thresholds, set AFTER rider-1 tests land, from re-measured numbers minus
  a 2-3 point regression margin (floors gate regressions; they are not aspirations):
  - `app/utils/engine/**`: keep 90/85/90/90 (passes today at 95.7/89.9/97.3/98.2).
  - `app/utils/engine/bots.ts`: per-file entry at engine level (90/85/90/90) once raised —
    the aggregate can never mask it again.
  - `app/composables/**`, `app/stores/**`, `app/workers/**`: new floor entries from
    re-measured post-rider-1 values minus margin (exact numbers recorded in the plan when
    measured; the implementer runs `pnpm test:coverage` and derives them — never guesses).
- Local `pnpm test` behavior unchanged (fast, no coverage).

## 3. Netlify headers (core)

`netlify.toml` changes:

- **`[build]` command → `pnpm generate`** (rider 2). CI gates merges; deploys build only. The
  comment explaining "deploys are gated on the suites" moves to explain the new contract:
  merge gate = CI, deploy = build.
- **Global `[[headers]]` additions** (`for = "/*"`):
  - `Strict-Transport-Security = "max-age=31536000; includeSubDomains"` (no `preload` —
    domain-wide commitment not made).
  - `Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"`.
- **New per-path caching blocks:**
  - `for = "/_nuxt/*"` → `Cache-Control = "public, max-age=31536000, immutable"`
    (content-hashed filenames).
  - `for = "/index.html"` and `for = "/"` → `Cache-Control = "public, max-age=0, must-revalidate"`
    (deploys picked up immediately).

## 4. CSP (core — option A, approved)

New CSP value (single line in `netlify.toml`, shown wrapped):

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self' data:; connect-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Deltas vs today, each evidence-based:

- `font-src` drops `https://fonts.gstatic.com` — zero references in source or built output
  (verified by grep of `app/`, `nuxt.config.ts`, and `dist/`).
- `connect-src` drops `https://api.iconify.design` — requires `icon.provider: 'none'` plus an
  explicit `clientBundle.icons` allow-list for icons the source scan cannot see.
  **Correction (found by the §5 render smoke during implementation):** the originally
  specified `fallbackToApi: false` is a no-op in SSR-false apps — @nuxt/icon defaults
  `provider` to `'iconify'` there, and only the `'server'` provider branch consults
  `fallbackToApi`; the `'iconify'` provider always fetches. The smoke also proved a real
  runtime fetch exists: @nuxt/ui's internal default `check` icon (Checkbox/Select) appears in
  no app source text, so `clientBundle.scan` never bundles it. Mechanism: capture every
  `api.iconify.design` request across all routes under the current provider (each request
  names its icons), add exactly those to `clientBundle.icons`, then set `provider: 'none'`
  and re-smoke — icon counts unchanged, zero external requests. The local-only intent
  (guidelines §1.3) is unchanged; only the config knob differs from the original spec text.
- Adds `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`
  (modern successor to the kept `X-Frame-Options: DENY`) — no runtime impact on this app.
- **`script-src` keeps `'unsafe-inline'`, documented in an adjacent comment** (decision A):
  the built SPA ships two inline scripts (theme bootstrap + Nuxt config payload); the payload
  embeds per-release values, so static hashes rot every release, and build-time `_headers`
  generation adds a deploy moving part. No server, no user content, no third-party scripts —
  `'self'` still blocks all remote script loading. Rejected alternative (B): post-generate
  sha256 `_headers` emission.
- `style-src` keeps `'unsafe-inline'` — Vue style bindings require it.

## 5. Verification

- `pnpm test:coverage` green under the final floors; full `pnpm test`, `lint`, `typecheck`,
  `test:e2e` green.
- **Render-verification browser smoke** (guidelines §4): serve the built `dist/` locally,
  load the app, confirm every icon renders (setup page, table toolbar, footer) and the
  network log shows **zero** requests to `api.iconify.design` or any non-self host.
- `netlify.toml` header syntax sanity-checked; post-deploy `curl -I` spot-check of the live
  site headers recorded as a follow-up for after the next deploy.
- CHANGELOG entries under Unreleased (delivery infrastructure).

## Out of scope

CI polish (concurrency, timeouts, browser cache) — user-excluded. `useGameLoop` branch
raising. Coverage for `.vue` files/pages (deliberate existing exclusion). CSP nonce/hash
tooling (decision A). The remaining open review findings (formatter unification,
advantage-formula alignment, decomposition, seed-pinned e2e).
