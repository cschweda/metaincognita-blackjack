<script setup lang="ts">
import { computed } from 'vue'
import type { RoundSummary } from '~/utils/advisor'

const props = defineProps<{
  summary: RoundSummary | null
}>()

const word = computed(() => {
  const s = props.summary
  if (!s) return ''
  if (s.outcome === 'blackjack') return 'BLACKJACK'
  if (s.netCents > 0) return 'WIN'
  if (s.netCents < 0) return 'LOSE'
  return 'PUSH'
})

const amount = computed(() => {
  const s = props.summary
  if (!s || s.netCents === 0) return ''
  const abs = Math.abs(s.netCents) / 100
  const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: s.netCents % 100 === 0 ? 0 : 2 })
  return `${s.netCents > 0 ? '+' : '−'}$${formatted}`
})

const colorClass = computed(() => {
  const s = props.summary
  if (!s) return ''
  if (s.outcome === 'blackjack' || s.netCents > 0) return 'text-[var(--accent-gold)]'
  if (s.netCents < 0) return 'text-red-400'
  return 'text-neutral-200'
})
</script>

<template>
  <div
    v-if="summary"
    class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    data-testid="round-outcome"
  >
    <div class="outcome-pop rounded-2xl bg-neutral-950/70 px-10 py-5 text-center shadow-2xl backdrop-blur-sm">
      <p
        class="text-5xl font-extrabold tracking-widest"
        :class="colorClass"
      >
        {{ word }}
      </p>
      <p
        v-if="amount"
        class="mt-1 font-mono text-2xl font-semibold"
        :class="colorClass"
        data-testid="round-outcome-amount"
      >
        {{ amount }}
      </p>
    </div>
  </div>
</template>
