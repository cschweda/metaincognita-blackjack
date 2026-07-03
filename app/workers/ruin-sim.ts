/** Thin postMessage wrapper around the pure betRamp math — the worker exists so
 *  long simulations never block the page; cancellation is worker.terminate(). */

import type { RuleSet } from '../utils/engine/rules'
import type { SimParams } from '../utils/betRamp'
import { simulateTrajectories, tcFrequencies } from '../utils/betRamp'

/** Every reply echoes the request's key/id — replies that outlive a preset switch must be
 *  attributable, or a slow answer poisons the wrong cache entry (the freqs race). */
export type RuinSimRequest
  = | { type: 'freqs', key: string, rules: RuleSet, rounds: number, seed: number }
    | { type: 'simulate', id: number, params: SimParams }

// typed against Worker (not Window) so single-argument postMessage typechecks
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<RuinSimRequest>) => void) | null
  postMessage: (msg: unknown) => void
}

ctx.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'freqs') {
    ctx.postMessage({ type: 'freqs', key: msg.key, freqs: tcFrequencies(msg.rules, msg.rounds, msg.seed) })
  } else if (msg.type === 'simulate') {
    const result = simulateTrajectories(msg.params, (fraction) => {
      ctx.postMessage({ type: 'progress', id: msg.id, fraction })
    })
    ctx.postMessage({ type: 'result', id: msg.id, result })
  }
}
