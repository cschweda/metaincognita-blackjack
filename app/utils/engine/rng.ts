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

export interface StatefulRNG {
  next: RNG
  /** Current internal mulberry32 state — pass back to statefulMulberry32 to resume. */
  state(): number
}

/** Mulberry32 with extractable state (seed and state share the same uint32 domain). */
export function statefulMulberry32(seedOrState: number): StatefulRNG {
  let a = seedOrState >>> 0
  return {
    next: () => {
      a = (a + 0x6D2B79F5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    state: () => a
  }
}
