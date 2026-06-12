<script setup lang="ts">
import { computed } from 'vue'
import { PRESETS } from '~/utils/engine/rules'
import { houseEdge } from '~/utils/engine/basicStrategy'

const selected = defineModel<string>({ required: true })

const cards = computed(() => Object.entries(PRESETS)
  .filter(([key]) => key !== 'CUSTOM')
  .map(([key, rules]) => ({
    key,
    name: rules.name,
    source: rules.source,
    edge: (houseEdge(rules) * 100).toFixed(2),
    chips: [
      `${rules.decks} deck${rules.decks > 1 ? 's' : ''}`,
      rules.dealerHitsSoft17 ? 'H17' : 'S17',
      rules.blackjackPayout,
      rules.surrender === 'late' ? 'late surrender' : 'no surrender',
      `${rules.spots} spots`
    ]
  })))
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <button
      v-for="card in cards"
      :key="card.key"
      type="button"
      class="rounded-lg border p-3 text-left transition-colors"
      :class="selected === card.key ? 'border-[var(--accent-gold)] bg-neutral-900' : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-600'"
      :data-testid="`preset-${card.key}`"
      @click="selected = card.key"
    >
      <div class="flex items-baseline justify-between gap-2">
        <span class="font-semibold text-neutral-100">{{ card.name }}</span>
        <span class="whitespace-nowrap text-xs text-neutral-400">≈{{ card.edge }}% edge<span class="text-neutral-600">*</span></span>
      </div>
      <p
        class="mt-1 truncate text-[11px] text-neutral-500"
        :title="card.source"
      >
        {{ card.source }}
      </p>
      <div class="mt-2 flex flex-wrap gap-1">
        <span
          v-for="chip in card.chips"
          :key="chip"
          class="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
        >{{ chip }}</span>
      </div>
    </button>
    <button
      type="button"
      class="rounded-lg border border-dashed p-3 text-left transition-colors"
      :class="selected === 'CUSTOM' ? 'border-[var(--accent-gold)] bg-neutral-900' : 'border-neutral-700 hover:border-neutral-500'"
      data-testid="preset-CUSTOM"
      @click="selected = 'CUSTOM'"
    >
      <span class="font-semibold text-neutral-100">Custom rules…</span>
      <p class="mt-1 text-[11px] text-neutral-500">
        Start from Vegas Strip and change anything
      </p>
    </button>
  </div>
  <p class="mt-2 text-[11px] text-neutral-600">
    *House edge is a model estimate (fixed-composition engine) — it runs slightly high vs published
    casino figures, especially at 1–2 decks. The comparison BETWEEN rule sets is what matters.
  </p>
</template>
