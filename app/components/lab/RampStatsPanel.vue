<script setup lang="ts">
import { computed } from 'vue'
import type { RampStats } from '~/utils/betRamp'
import { formatCents, signedCents } from '~/utils/format'

const props = defineProps<{
  stats: RampStats | null
  measuring: boolean
  /** Engine rounds behind the measured TC distribution — shown while measuring. */
  freqRounds: number
  roundsPerHour: number
}>()

function plainDollars(cents: number, dp = 0): string {
  return formatCents(cents, dp)
}
function signedDollars(cents: number, dp = 2): string {
  return signedCents(cents, { zeroSign: '', dp })
}

const n0Text = computed(() => {
  if (!props.stats) return ''
  if (!Number.isFinite(props.stats.n0Rounds)) return '∞ — this ramp never outruns its variance'
  const rounds = Math.round(props.stats.n0Rounds)
  const hours = rounds / props.roundsPerHour
  return `${rounds.toLocaleString()} rounds (≈${hours.toLocaleString(undefined, { maximumFractionDigits: 0 })}h)`
})
</script>

<template>
  <section class="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-400">
      Instant math
    </h2>
    <p
      v-if="measuring"
      class="text-xs text-neutral-400"
      data-testid="lab-measuring"
    >
      Measuring this table's true-count distribution ({{ freqRounds.toLocaleString() }} engine rounds)…
    </p>
    <div
      v-else-if="stats"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      <div>
        <p class="text-xs uppercase tracking-wide text-neutral-400">
          EV / round
        </p>
        <p
          class="font-mono text-lg font-bold"
          :class="stats.evPerRoundCents > 0 ? 'text-emerald-400' : 'text-red-400'"
          data-testid="lab-ev-round"
        >
          {{ signedDollars(stats.evPerRoundCents) }}
        </p>
      </div>
      <div>
        <p class="text-xs uppercase tracking-wide text-neutral-400">
          EV / hour
        </p>
        <p
          class="font-mono text-lg font-bold"
          :class="stats.evHourlyCents > 0 ? 'text-emerald-400' : 'text-red-400'"
          data-testid="lab-ev-hour"
        >
          {{ signedDollars(stats.evHourlyCents) }}
        </p>
      </div>
      <div>
        <p class="text-xs uppercase tracking-wide text-neutral-400">
          SD / hour
        </p>
        <p class="font-mono text-lg font-bold text-[var(--accent-cream)]">
          ±{{ plainDollars(stats.sdHourlyCents) }}
        </p>
      </div>
      <div>
        <p class="text-xs uppercase tracking-wide text-neutral-400">
          Risk of ruin
        </p>
        <p
          class="font-mono text-lg font-bold"
          :class="stats.ruin > 0.1 ? 'text-red-400' : 'text-[var(--accent-gold)]'"
          data-testid="lab-ruin"
        >
          {{ (stats.ruin * 100).toFixed(1) }}%
        </p>
      </div>
      <div class="col-span-2">
        <p class="text-xs uppercase tracking-wide text-neutral-400">
          N₀ — rounds until edge outruns variance
        </p>
        <p class="font-mono text-sm font-semibold text-[var(--accent-cream)]">
          {{ n0Text }}
        </p>
      </div>
    </div>
    <p class="text-[10px] text-neutral-400">
      Model, not measurement: edge(TC) ≈ −house edge + 0.5% × TC, per-round variance ≈ 1.33 × bet².
      TC frequencies are measured by auto-playing this table at basic strategy. Ruin is the
      classic unit-normalized closed form — the simulator below is the reality check.
    </p>
  </section>
</template>
