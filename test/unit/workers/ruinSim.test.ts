import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRESETS, cloneRules } from '../../../app/utils/engine/rules'
import { DEFAULT_RAMP, tcFrequencies } from '../../../app/utils/betRamp'
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
    // smallest meaningful sim: reuse the exact params literal from the smallest
    // simulateTrajectories test in test/unit/betRamp.test.ts — "reports progress and a
    // sane final mean for a comfortable bankroll" (rounds 60 / trajectories 20 / seed 11 /
    // sampleEvery 30 is smaller than the file's other fixed-seed case, 80/25/7/20, and is
    // the one betRamp.test.ts itself proves emits progress ticks) — verbatim, so this stays fast
    const params = {
      rules: rules(),
      ramp: { ...DEFAULT_RAMP, bankrollCents: 2_000_000 },
      rounds: 60,
      trajectories: 20,
      seed: 11,
      sampleEvery: 30
    }
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

  it('silently ignores a message whose type matches neither protocol variant', async () => {
    // RuinSimRequest is a closed union, so this only happens if a future variant is
    // added without an updated handler branch — the dispatcher's implicit no-op path
    // (the `if`/`else if` with no trailing `else`) still needs direct branch coverage.
    const { scope, posted } = await loadWorker()
    scope.onmessage!({ data: { type: 'unknown' } as unknown as RuinSimRequest })
    expect(posted).toHaveLength(0)
  })
})
