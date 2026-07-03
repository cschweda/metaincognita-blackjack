<script setup lang="ts">
import { computed } from 'vue'
import type { SimBand } from '~/utils/betRamp'

const props = defineProps<{
  /** Percentile bands per sample point, index 0 = start. */
  bands: SimBand[]
  /** Starting bankroll (cents) — drawn as the dashed reference line. */
  startCents: number
}>()

const W = 600
const H = 170
const PAD = 8

const chart = computed(() => {
  const bands = props.bands
  if (bands.length < 2) return null
  const lo = Math.min(0, ...bands.map(b => b.p5))
  const hi = Math.max(props.startCents, ...bands.map(b => b.p95))
  const x = (i: number) => PAD + (i / (bands.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => H - PAD - ((v - lo) / Math.max(1, hi - lo)) * (H - 2 * PAD)
  const band = (loKey: 'p5' | 'p25', hiKey: 'p95' | 'p75') => [
    ...bands.map((b, i) => `${x(i)},${y(b[hiKey])}`),
    ...[...bands].reverse().map((b, i) => `${x(bands.length - 1 - i)},${y(b[loKey])}`)
  ].join(' ')
  return {
    outer: band('p5', 'p95'),
    inner: band('p25', 'p75'),
    median: bands.map((b, i) => `${x(i)},${y(b.p50)}`).join(' '),
    startY: y(props.startCents),
    zeroY: y(0)
  }
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    class="w-full rounded border border-neutral-800 bg-neutral-950"
    role="img"
    aria-label="Bankroll percentile fan chart across simulated lifetimes"
  >
    <polygon
      v-if="chart"
      :points="chart.outer"
      fill="rgb(212 168 71 / 0.10)"
    />
    <polygon
      v-if="chart"
      :points="chart.inner"
      fill="rgb(212 168 71 / 0.22)"
    />
    <polyline
      v-if="chart"
      :points="chart.median"
      fill="none"
      stroke="#d4a847"
      stroke-width="2"
    />
    <line
      v-if="chart"
      :x1="PAD"
      :x2="W - PAD"
      :y1="chart.startY"
      :y2="chart.startY"
      stroke="#737373"
      stroke-dasharray="4 4"
      stroke-width="1"
    />
    <line
      v-if="chart"
      :x1="PAD"
      :x2="W - PAD"
      :y1="chart.zeroY"
      :y2="chart.zeroY"
      stroke="#7f1d1d"
      stroke-width="1"
    />
  </svg>
</template>
