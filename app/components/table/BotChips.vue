<script setup lang="ts">
import { PERSONAS } from '~/utils/engine/bots'
import { OUTCOME_BADGE } from '~/utils/outcomeBadges'
import type { SpotView } from '~/composables/useGameLoop'

const props = defineProps<{
  spots: SpotView[]
}>()

const bots = computed(() => props.spots
  .filter(s => s.occupant !== 'hero')
  .map((s) => {
    const lastHand = s.hands[s.hands.length - 1]
    return {
      spotId: s.spotId,
      name: PERSONAS.find(p => p.id === s.occupant)?.name ?? s.occupant,
      outcome: lastHand?.outcome ?? null,
      quip: s.quip
    }
  }))
</script>

<template>
  <div
    v-if="bots.length"
    class="flex gap-2 overflow-x-auto px-2 pb-1 md:hidden"
    data-testid="bot-chips"
  >
    <div
      v-for="bot in bots"
      :key="bot.spotId"
      class="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/80 px-2 py-1 text-[10px] text-neutral-300"
    >
      <UIcon
        name="i-lucide-bot"
        class="h-3 w-3 text-neutral-500"
      />
      <span>{{ bot.name }}</span>
      <span
        v-if="bot.outcome"
        class="rounded px-1 font-bold"
        :class="OUTCOME_BADGE[bot.outcome]?.cls"
      >{{ OUTCOME_BADGE[bot.outcome]?.text }}</span>
      <span
        v-if="bot.quip"
        class="max-w-36 truncate italic text-neutral-500"
      >"{{ bot.quip }}"</span>
    </div>
  </div>
</template>
