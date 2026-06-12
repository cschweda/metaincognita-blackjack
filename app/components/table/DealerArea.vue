<script setup lang="ts">
import { computed } from 'vue'
import type { ShownCard } from '~/composables/useGameLoop'

const props = defineProps<{
  cards: ShownCard[]
  /** 0..1 — discardCount / (decks × 52) */
  trayFill: number
  /** 0..1 — penetration depth marker on the shoe */
  penetration: number
  announcement: string
  liveText: string
}>()

const trayPct = computed(() => Math.round(Math.min(1, Math.max(0, props.trayFill)) * 100))
</script>

<template>
  <div class="flex items-start justify-center gap-6">
    <!-- Shoe with cut-card marker -->
    <div
      class="flex flex-col items-center gap-1"
      aria-hidden="true"
    >
      <div class="relative h-16 w-10 overflow-hidden rounded border border-[var(--rail-walnut)] bg-[var(--rail-walnut-dark)]">
        <div
          class="absolute inset-x-0 bottom-0 bg-neutral-300/80"
          style="height: 70%"
        />
        <div
          class="absolute inset-x-0 h-0.5 bg-[var(--card-red)]"
          :style="{ bottom: `${(1 - penetration) * 70}%` }"
          title="cut card"
        />
      </div>
      <span class="text-[9px] uppercase text-[var(--accent-cream)]/50">Shoe</span>
    </div>

    <!-- Dealer cards + announcement -->
    <div class="flex min-h-28 flex-col items-center gap-2">
      <div class="flex gap-1.5">
        <PlayingCard
          v-for="(c, i) in cards"
          :key="i"
          :card="c.card"
          :face-up="c.faceUp"
          size="md"
        />
      </div>
      <p class="min-h-5 text-sm text-[var(--accent-cream)]/90">
        {{ announcement }}
      </p>
      <p
        class="sr-only"
        role="status"
        aria-live="polite"
      >
        {{ liveText }}
      </p>
    </div>

    <!-- Discard tray fills as the shoe depletes — counting equipment, spec §7 -->
    <div
      class="flex flex-col items-center gap-1"
      aria-hidden="true"
    >
      <div class="relative h-16 w-10 overflow-hidden rounded border border-[var(--rail-walnut)] bg-black/40">
        <div
          class="absolute inset-x-0 bottom-0 bg-neutral-200/70 transition-all"
          :style="{ height: `${trayPct * 0.7}%` }"
        />
      </div>
      <span class="text-[9px] uppercase text-[var(--accent-cream)]/50">Discard</span>
    </div>
  </div>
</template>
