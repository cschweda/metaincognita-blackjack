# Coverage Enforcement + Netlify Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the weak coverage spots (bots.ts, ruin-sim worker, two trivial branches), then make the coverage floors real in CI, then harden netlify.toml (HSTS/Permissions-Policy/Cache-Control, tightened CSP, build-only deploys).

**Architecture:** Tests-before-floors sequencing — Tasks 1-3 add the tests, Task 4 measures and locks the floors, Task 5 hardens delivery config, Task 6 documents and gates. The CSP tightening (dropping `api.iconify.design`) is coupled to disabling @nuxt/icon's runtime fallback and MUST be render-verified against the built output (guidelines §4).

**Tech Stack:** Vitest 4 (unit + nuxt projects, v8 coverage), GitHub Actions, Netlify static hosting, @nuxt/icon 2.2.3.

**Spec:** `docs/superpowers/specs/2026-07-10-coverage-netlify-design.md`

## Global Constraints

- Conventional commits; **NO AI attribution trailers of any kind** — hard user rule.
- TDD for behavior-pinning tests: write test → watch it fail only where the behavior is new; coverage-driven tests against existing correct behavior are expected to pass immediately — the "failure" gate for those is the coverage delta, checked per task.
- Floors are set from measured reality minus margin — never aspirational, never lowered to dodge a red bar (raise coverage instead).
- Run single files with `pnpm vitest run <path>`; coverage with `pnpm test:coverage`.
- Excluded scope (user opted out): CI concurrency groups, job timeouts, Playwright browser caching.
- Baseline (2026-07-10, 395 tests): all 93.19/84.17/93.93/95.66 · engine 95.70/89.86/97.31/98.23 · composables 88.88/72.60/90.65/93.17 · stores 93.67/83.63/96.55/95.45 · workers 0 · bots.ts 72.5/67.6/75.0/80.6 (order: stmts/branch/funcs/lines).

---

### Task 1: bots.ts coverage — persona branches and bet progressions

**Files:**
- Modify: `test/unit/engine/bots.test.ts` (append to existing describes)
- No production changes.

**Interfaces:**
- Consumes: `PERSONAS`, `decideFor` from `app/utils/engine/bots.ts`; `PRESETS`, `cloneRules` from rules; `newHand`; the file's existing `c(rank, suit)` helper.
- Produces: bots.ts ≥ 90 stmt / ≥ 85 branch (Task 4 pins a per-file floor at 90/85/90/90).

- [ ] **Step 1: Append the new tests**

Add `cloneRules` to the existing rules import. Append inside the existing `describe('decideFor', …)`:

```ts
  it('falls back by EV when the book action is unavailable (3-card 11 cannot double)', () => {
    // book says double 11 v 6, but double is two-cards-only — bookAction's fallback picks hit (EV)
    expect(decideFor('bea', newHand([c(2), c(4), c(5)], 1000), 1, up6, RULES)).toBe('hit')
  })

  it('returns the lone legal action without consulting strategy (21: stand only)', () => {
    expect(decideFor('bea', newHand([c(10), c(5), c(6)], 1000), 1, up9, RULES)).toBe('stand')
  })

  it('Ivan dispatches to book play through decideFor (16 v 9 hits)', () => {
    expect(decideFor('ivan', newHand([c(10), c(6)], 1000), 1, up9, RULES)).toBe('hit')
  })

  it('Lou plays book off the 16 guard (11 v 6 doubles) including soft 16 (A,5 hits v 9)', () => {
    expect(decideFor('lou', newHand([c(6), c(5)], 1000), 1, up6, RULES)).toBe('double')
    expect(decideFor('lou', newHand([c(14), c(5)], 1000), 1, up9, RULES)).not.toBe('stand') // soft 16 is not "a 16" to Lou
  })

  it('Lou hits instead of surrendering ("surrender is for cowards")', () => {
    const ls = cloneRules(PRESETS.MA_205CMR!) // late surrender legal; book surrenders 15 v T
    ls.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
    expect(decideFor('bea', newHand([c(9), c(6)], 1000), 1, c(10, 'hearts'), ls)).toBe('surrender') // control: book really surrenders
    expect(decideFor('lou', newHand([c(9), c(6)], 1000), 1, c(10, 'hearts'), ls)).toBe('hit')
  })
```

Append inside the existing `describe('bet progression', …)`:

```ts
  it('every flat bettor returns the base bet (nancy, mike, ivan)', () => {
    for (const id of ['nancy', 'mike', 'ivan'] as const) {
      const p = PERSONAS.find(x => x.id === id)!
      expect(p.nextBet(1500, 'lose', RULES, mulberry32(1))).toBe(1500)
    }
  })

  it('Lou holds on a push, takes the lucky surcharge, and clamps to table limits', () => {
    const lou = PERSONAS.find(p => p.id === 'lou')!
    // deterministic rng stubs: below/above the 0.15 surcharge threshold
    expect(lou.nextBet(1000, 'push', RULES, () => 0.9)).toBe(1000) // no press, no surcharge
    expect(lou.nextBet(1000, 'push', RULES, () => 0.1)).toBe(1500) // +500 surcharge
    expect(lou.nextBet(RULES.maxBet, 'win', RULES, () => 0.9)).toBe(RULES.maxBet) // press clamps to max
    expect(lou.nextBet(RULES.minBet, 'lose', RULES, () => 0.9)).toBe(RULES.minBet) // retreat clamps to min
  })
```

- [ ] **Step 2: Run the file — all pass (coverage-driven tests against existing behavior)**

Run: `pnpm vitest run test/unit/engine/bots.test.ts`
Expected: ALL PASS. If the `surrender` control assertion fails (book does not surrender 15 v T under MA), STOP and report — the test premise is wrong, do not adjust Lou's assertion blindly.

- [ ] **Step 3: Verify the coverage delta**

Run: `pnpm test:coverage 2>&1 | grep -E "bots|Branch"`
Expected: `bots.ts` ≥ 90 stmts / ≥ 85 branch / ≥ 90 funcs / ≥ 90 lines. If any metric is below, inspect the remaining uncovered lines in the report and add the missing branch test (the only expected stragglers are unreachable guards; `decideFor`'s trailing `return 'stand'` at bots.ts:138 is unreachable by construction — if it alone blocks a metric, note that in the task report rather than contorting a test).

- [ ] **Step 4: Commit**

```bash
git add test/unit/engine/bots.test.ts
git commit -m "test(bots): cover persona decision branches and bet progressions"
```

---

### Task 2: ruin-sim worker protocol coverage

**Files:**
- Create: `test/unit/workers/ruinSim.test.ts`
- No production changes. (`app/workers/ruin-sim.ts` assigns `self.onmessage` at import time — stub the global BEFORE a fresh dynamic import.)

**Interfaces:**
- Consumes: `tcFrequencies`, `simulateTrajectories`, and the `SimParams` type from `app/utils/betRamp.ts`.
- Produces: `app/workers/**` covered (Task 4 adds a floor).

- [ ] **Step 1: Write the test file**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { tcFrequencies } from '../../../app/utils/betRamp'
import type { RuinSimRequest } from '../../../app/workers/ruin-sim'

interface FakeWorkerScope {
  onmessage: ((e: { data: RuinSimRequest }) => void) | null
  postMessage: (msg: unknown) => void
}

/** The worker wires self.onmessage at import — stub the global, then import fresh. */
async function loadWorker(): Promise<{ scope: FakeWorkerScope, posted: unknown[] }> {
  const posted: unknown[] = []
  const scope: FakeWorkerScope = {
    onmessage: null,
    postMessage: (msg: unknown) => {
      posted.push(msg)
    }
  }
  vi.stubGlobal('self', scope)
  vi.resetModules()
  await import('../../../app/workers/ruin-sim')
  return { scope, posted }
}

function rules() {
  const r = cloneRules(PRESETS.VEGAS_STRIP_6D!)
  r.sideBets = { twentyOnePlusThree: 'off', luckyLadies: 'off', matchTheDealer: false, buster: 'off' }
  return r
}

describe('ruin-sim worker protocol', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers freqs requests keyed by the request key, matching the direct call', async () => {
    const { scope, posted } = await loadWorker()
    const r = rules()
    scope.onmessage!({ data: { type: 'freqs', key: 'preset-A', rules: r, rounds: 200, seed: 7 } })
    expect(posted).toHaveLength(1)
    expect(posted[0]).toEqual({ type: 'freqs', key: 'preset-A', freqs: tcFrequencies(r, 200, 7) })
  })

  it('streams progress echoes with the request id and posts the id-keyed result last', async () => {
    const { scope, posted } = await loadWorker()
    // smallest meaningful sim: reuse the exact `params` literal from the smallest
    // simulateTrajectories test in test/unit/betRamp.test.ts (same shape, same seed),
    // with `lifetimes`/`rounds` at that file's minimum values so this stays fast
    const params = /* copy from betRamp.test.ts, verbatim */ undefined as never
    scope.onmessage!({ data: { type: 'simulate', id: 42, params } })
    const progress = posted.filter((m): m is { type: string, id: number, fraction: number } =>
      (m as { type?: string }).type === 'progress')
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.every(p => p.id === 42)).toBe(true)
    const last = posted[posted.length - 1] as { type: string, id: number, result: unknown }
    expect(last.type).toBe('result')
    expect(last.id).toBe(42)
    expect(last.result).toBeTruthy()
  })
})
```

**Before running:** open `test/unit/betRamp.test.ts`, find its smallest `simulateTrajectories(...)` arrangement, and replace the `const params = … undefined as never` line with that exact params literal (it constructs a small `SimParams`). This is a copy from a named existing source, not an invention — keep its values verbatim so runtime stays fast.

- [ ] **Step 2: Run the file**

Run: `pnpm vitest run test/unit/workers/ruinSim.test.ts`
Expected: 2 PASS. If the import fails on `self` typing or Vue imports, STOP and report (the worker module imports only engine/betRamp — pure TS — so failure means an environment assumption broke).

- [ ] **Step 3: Verify the coverage delta**

Run: `pnpm test:coverage 2>&1 | grep -E "ruin-sim|workers"`
Expected: `ruin-sim.ts` 100/100/100/100 (nine statements, two branches, all exercised).

- [ ] **Step 4: Commit**

```bash
git add test/unit/workers/ruinSim.test.ts
git commit -m "test(worker): cover the ruin-sim postMessage protocol (freqs, progress, result)"
```

---

### Task 3: trivial branch coverage — useDrillFeedback plain-element arm, useCounting restore/reset

**Files:**
- Create: `test/nuxt/drillFeedback.test.ts`
- Modify: `test/nuxt/counting.test.ts` (append)

**Interfaces:**
- Consumes: `useDrillFeedback` from `app/composables/useDrillFeedback.ts`; `restoreCounting`, `resetCounting`, `useCounting` from `app/composables/useCounting.ts`; `useBlackjackStore`.

- [ ] **Step 1: Write the drillFeedback test file**

```ts
import { describe, expect, it, onTestFinished } from 'vitest'
import { nextTick } from 'vue'
import { useDrillFeedback } from '../../app/composables/useDrillFeedback'

describe('useDrillFeedback', () => {
  it('focuses a plain HTMLElement target (the non-$el arm)', async () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    onTestFinished(() => btn.remove())
    const { srText, focusEl, announce, clear } = useDrillFeedback()
    focusEl.value = btn
    announce('verdict text')
    expect(srText.value).toBe('verdict text')
    await nextTick()
    expect(document.activeElement).toBe(btn)
    clear()
    expect(srText.value).toBe('')
  })

  it('announce with no focus target still sets the text without throwing', async () => {
    const { srText, announce } = useDrillFeedback()
    announce('lonely message')
    await nextTick()
    expect(srText.value).toBe('lonely message')
  })
})
```

- [ ] **Step 2: Append the counting tests**

Open `test/nuxt/counting.test.ts`, match its existing setup pattern (imports/beforeEach as-is in that file), and append one describe:

```ts
describe('restore and reset', () => {
  it('restoreCounting backfills zeros when nothing was persisted', () => {
    const store = useBlackjackStore()
    store.setCountState(null)
    restoreCounting()
    const counting = useCounting()
    expect(counting.rc.value).toBe(0)
    expect(counting.cardsSeen.value).toBe(0)
  })

  it('restoreCounting picks up persisted state; resetCounting clears it in the store', () => {
    const store = useBlackjackStore()
    store.setCountState({ running: 5, cardsSeen: 30 })
    restoreCounting()
    const counting = useCounting()
    expect(counting.rc.value).toBe(5)
    expect(counting.cardsSeen.value).toBe(30)
    resetCounting()
    expect(counting.rc.value).toBe(0)
    expect(store.countState).toBeNull()
  })
})
```

Add `restoreCounting`, `resetCounting` to the file's existing import from `useCounting` if not present.

- [ ] **Step 3: Run both files**

Run: `pnpm vitest run test/nuxt/drillFeedback.test.ts test/nuxt/counting.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add test/nuxt/drillFeedback.test.ts test/nuxt/counting.test.ts
git commit -m "test: cover useDrillFeedback element arm and useCounting restore/reset branches"
```

---

### Task 4: measure, set floors, enforce in CI

**Files:**
- Modify: `vitest.config.ts:35-37` (thresholds block)
- Modify: `.github/workflows/ci.yml:22` (+ artifact step)

**Interfaces:**
- Consumes: coverage uplift from Tasks 1-3.
- Produces: CI that fails on coverage regression.

- [ ] **Step 1: Measure post-uplift coverage**

Run: `pnpm test:coverage 2>&1 | tail -30`
Record the per-scope table (engine, composables, stores, workers aggregates + bots.ts).

- [ ] **Step 2: Set floors from the measurements**

Formula per metric: `floor = min(configured_target, floor_int(measured − 2))`, where configured_target is 90/85/90/90 for engine + bots.ts. For composables/stores/workers use `floor_int(measured − 2)` directly, capped at 95 (floors gate regressions, not perfection). Worked example from the pre-uplift baseline (replace every number with YOUR step-1 measurements): composables 88.88/72.60/90.65/93.17 → 86/70/88/91.

Edit `vitest.config.ts` thresholds to (numbers illustrative — substitute measured):

```ts
      // floors are measured-reality minus a 2-point regression margin (spec §2) —
      // raise coverage to move them, never lower them to dodge a red bar
      thresholds: {
        'app/utils/engine/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        // per-file: the engine aggregate must never mask the personas again
        'app/utils/engine/bots.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'app/composables/**': { statements: 86, branches: 70, functions: 88, lines: 91 },
        'app/stores/**': { statements: 91, branches: 81, functions: 94, lines: 93 },
        'app/workers/**': { statements: 95, branches: 95, functions: 95, lines: 95 }
      }
```

- [ ] **Step 3: Verify the floors pass locally**

Run: `pnpm test:coverage`
Expected: exit 0, no threshold errors. Then prove the gate bites: temporarily raise one floor above its measured value (e.g. workers statements to 101), run again, expect a threshold ERROR naming the scope, then revert the sabotage. Record both runs in your report — this is the evidence the enforcement is real.

- [ ] **Step 4: Wire CI**

In `.github/workflows/ci.yml`, `quality` job: replace `- run: pnpm test` with:

```yaml
      - run: pnpm test:coverage
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7
```

(`pnpm generate` stays after it, unchanged. The e2e job is untouched.)

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts .github/workflows/ci.yml
git commit -m "ci: enforce measured coverage floors (engine per-file bots, composables, stores, workers)"
```

---

### Task 5: Netlify hardening + icon fallback + render smoke

**Files:**
- Modify: `netlify.toml` (full replacement below)
- Modify: `nuxt.config.ts:66-70` (icon block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the deployed header set; a local-only icon pipeline.

- [ ] **Step 1: Disable the iconify runtime provider** *(corrected during execution — the
  original `fallbackToApi: false` is a no-op under ssr:false, where @nuxt/icon defaults
  `provider: 'iconify'` and only the `'server'` branch consults the fallback flag; the
  render smoke caught a live `api.iconify.design` fetch for @nuxt/ui's internal `check`
  icon, which no source scan can see. See spec §4 correction.)*

In `nuxt.config.ts`, set the icon block to:

```ts
  icon: {
    // no runtime icon provider — every icon ships in the client bundle (guidelines §1.3
    // local-only; the CSP below has no iconify host). scan covers icons named in app
    // source; the explicit list covers @nuxt/ui internals the scan cannot see (each
    // entry measured from a captured api.iconify.design request in the render smoke)
    provider: 'none',
    clientBundle: {
      scan: true,
      icons: [/* measured union from the baseline smoke capture, e.g. 'lucide:check' */]
    }
  }
```

- [ ] **Step 2: Replace netlify.toml**

```toml
[build]
  # CI gates merges (lint/typecheck/tests/coverage floors + e2e); deploys just build.
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
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    # script-src keeps 'unsafe-inline' by decision (spec §4, option A): the generated SPA
    # ships two inline scripts and one embeds per-release config, so static hashes rot
    # every release; there is no server, no user content, and no third-party script —
    # 'self' still blocks all remote script loading. style-src needs it for Vue bindings.
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

[[headers]]
  for = "/_nuxt/*"
  [headers.values]
    # content-hashed filenames — safe to cache forever
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  for = "/"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
```

- [ ] **Step 3: Build and render-verify (guidelines §4 — this step is mandatory)**

```bash
pnpm generate
```

Then write this throwaway script to your scratchpad (NOT the repo), run it, and delete it:

```js
// scratchpad/icon-smoke.mjs — serve dist, load app, assert icons render + zero external requests
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium } from 'playwright-core'

const DIST = new URL('../dist', import.meta.url).pathname // adjust to the repo's dist path
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const body = await readFile(join(DIST, path))
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(join(DIST, 'index.html')))
  }
}).listen(4173)

const browser = await chromium.launch()
const page = await browser.newPage()
const external = []
page.on('request', (r) => {
  const u = new URL(r.url())
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') external.push(r.url())
})
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
const icons = await page.locator('.iconify, [class*="i-lucide"], svg').count()
console.log(JSON.stringify({ icons, external }, null, 2))
await browser.close()
server.close()
if (icons === 0) throw new Error('NO ICONS RENDERED — fallbackToApi:false broke the bundle')
if (external.length > 0) throw new Error(`EXTERNAL REQUESTS: ${external.join(', ')}`)
console.log('SMOKE PASS: icons render, zero external requests')
```

Run: `node <scratchpad>/icon-smoke.mjs`
Expected: `SMOKE PASS` with `icons > 0` and `external: []`. If icons are 0 or any external request appears, STOP and report BLOCKED with the output — do not ship a blind CSP.

- [ ] **Step 4: Run the e2e suite (icon fallback change touches every page)**

Run: `pnpm test:e2e`
Expected: 16 passed.

- [ ] **Step 5: Commit**

```bash
git add netlify.toml nuxt.config.ts
git commit -m "feat(deploy): HSTS/Permissions-Policy/Cache-Control, tightened CSP, build-only deploys, bundled-icons-only"
```

---

### Task 6: CHANGELOG + full gates

**Files:**
- Modify: `CHANGELOG.md` (Unreleased)

- [ ] **Step 1: CHANGELOG entries**

Under `## [Unreleased]`, in the existing `### Added (delivery infrastructure)` subsection, append:

```markdown
- Coverage floors are enforced in CI (`pnpm test:coverage` in the quality job, report
  artifact on failure): engine keeps its 90% floor with a per-file floor on `bots.ts` so the
  aggregate can never mask it, and composables/stores/workers gain measured floors; the
  persona decision branches, the ruin-sim worker protocol, and the counting restore/reset
  paths are now unit-tested
- Netlify hardening: HSTS, Permissions-Policy, immutable caching for hashed assets,
  must-revalidate for the app shell; CSP drops the unused `fonts.gstatic.com` and — with
  @nuxt/icon's runtime provider disabled entirely (`provider: 'none'` — every icon ships in
  the client bundle, the two @nuxt/ui internals via a measured allow-list; local-only per the family
  guidelines) — `api.iconify.design`, and gains `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `frame-ancestors 'none'`; deploys build only (CI is the test gate)
```

- [ ] **Step 2: Full gates**

Run: `pnpm test:coverage && pnpm lint && pnpm typecheck`
Expected: all green under the new floors.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for coverage enforcement and Netlify hardening"
```

---

## Plan Self-Review Notes

- Spec coverage: §1 riders → Tasks 1-3; §2 enforcement → Task 4; §3 headers + build-only → Task 5; §4 CSP/option A → Task 5 (comment text included verbatim); §5 verification → Task 5 steps 3-4 + Task 6 step 2; CHANGELOG → Task 6.
- The one deliberate reference-not-repetition: Task 2's `SimParams` literal is copied from a named existing test file (`test/unit/betRamp.test.ts`) rather than invented here — the type's shape lives there and drift would be worse than the lookup.
- Type consistency: `FakeWorkerScope` local to Task 2; floor numbers in Task 4 are explicitly illustrative with the substitution formula stated twice.
- Execution-record notes: Task 1 additionally added a comment-only `v8 ignore start/stop` region for the unreachable bots.ts:138 (deviation from 'no production changes', confirmed at final review); Task 5's mechanism was corrected mid-execution per spec §4 (commit 4675ac7).
