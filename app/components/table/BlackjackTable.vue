<script setup lang="ts">
import { computed } from 'vue'
import type { RuleSet } from '~/utils/engine/rules'

const props = defineProps<{
  rules: RuleSet
}>()

/** Seat anchor positions along the player arc, in percent of the table box.
 *  i = 0 is FIRST BASE: cos(20°) ≈ +0.94 → left ≈ 90%, i.e. the viewer's RIGHT edge.
 *  The last seat sweeps to ~10% (viewer's left). Middle seats bow toward the bottom. */
const seatPositions = computed(() => {
  const n = props.rules.spots
  return Array.from({ length: n }, (_, i) => {
    // sweep from 20° (viewer's right) to 160° (viewer's left), circle centered above the box
    const t = (i + 1) / (n + 1)
    const deg = 20 + t * 140
    const rad = (deg * Math.PI) / 180
    return {
      leftPct: 50 + 43 * Math.cos(rad),
      topPct: 28 + 56 * Math.sin(rad)
    }
  })
})

const bjPays = computed(() => props.rules.blackjackPayout === '3:2' ? 'BLACKJACK PAYS 3 TO 2' : 'BLACKJACK PAYS 6 TO 5')
const dealerRule = computed(() => props.rules.dealerHitsSoft17 ? 'DEALER HITS SOFT 17' : 'DEALER STANDS ON ALL 17s')
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden rounded-b-[48%_22%] border-x-8 border-b-8 border-[var(--rail-walnut)]"
    style="background: radial-gradient(ellipse at 50% -10%, var(--felt-green-light), var(--felt-green) 65%)"
  >
    <svg
      viewBox="0 0 1000 560"
      preserveAspectRatio="none"
      class="absolute inset-0 h-full w-full"
      aria-hidden="true"
      data-testid="felt"
    >
      <defs>
        <path
          id="bj-arc"
          d="M 150 210 Q 500 380 850 210"
          fill="none"
        />
        <path
          id="ins-arc"
          d="M 190 160 Q 500 310 810 160"
          fill="none"
        />
      </defs>
      <text
        fill="var(--accent-gold)"
        font-size="30"
        font-weight="700"
        letter-spacing="6"
        text-anchor="middle"
      >
        <textPath
          href="#bj-arc"
          startOffset="50%"
        >{{ bjPays }}</textPath>
      </text>
      <text
        fill="var(--accent-cream)"
        fill-opacity="0.85"
        font-size="20"
        letter-spacing="4"
        text-anchor="middle"
      >
        <textPath
          href="#ins-arc"
          startOffset="50%"
        >INSURANCE PAYS 2 TO 1</textPath>
      </text>
      <text
        x="500"
        y="105"
        fill="var(--accent-cream)"
        fill-opacity="0.55"
        font-size="14"
        letter-spacing="3"
        text-anchor="middle"
      >{{ dealerRule }}</text>
      <!-- spot markers on the felt -->
      <circle
        v-for="(pos, i) in seatPositions"
        :key="i"
        :cx="pos.leftPct * 10"
        :cy="pos.topPct * 5.6"
        r="34"
        fill="none"
        stroke="var(--accent-cream)"
        stroke-opacity="0.25"
        stroke-width="2"
      />
    </svg>

    <!-- dealer slot -->
    <div class="absolute left-1/2 top-3 -translate-x-1/2">
      <slot name="dealer" />
    </div>

    <!-- player seats (HTML overlay at the same anchors) -->
    <div
      v-for="(pos, i) in seatPositions"
      :key="i"
      class="absolute -translate-x-1/2 -translate-y-1/2"
      :style="{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }"
      :data-testid="`seat-${i}`"
    >
      <slot
        name="seat"
        :spot-id="i"
      />
    </div>
  </div>
</template>
