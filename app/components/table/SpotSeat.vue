<script setup lang="ts">
import { computed } from 'vue'
import { handTotal } from '~/utils/engine/hand'
import { PERSONAS } from '~/utils/engine/bots'
import type { SpotView } from '~/composables/useGameLoop'
import { OUTCOME_BADGE } from '~/utils/outcomeBadges'

const props = defineProps<{
  spot: SpotView
  isHero: boolean
  isActive: boolean // engine's active spot AND hand
}>()

const persona = computed(() =>
  props.spot.occupant === 'hero' ? null : PERSONAS.find(p => p.id === props.spot.occupant) ?? null)

function totalLabel(cards: { rank: number, suit: string }[]): string {
  if (cards.length < 2) return ''
  const t = handTotal(cards as Parameters<typeof handTotal>[0])
  return t.soft ? `soft ${t.total}` : `${t.total}`
}
</script>

<template>
  <div
    class="flex flex-col items-center gap-1.5"
    :class="{ 'opacity-90': !isHero }"
  >
    <div
      v-if="spot.quip && persona"
      class="max-w-44 rounded-lg bg-neutral-900/90 px-2 py-1 text-center text-[11px] italic text-neutral-300"
    >
      “{{ spot.quip }}”
    </div>

    <div class="flex gap-3">
      <div
        v-for="(hand, hi) in spot.hands"
        :key="hi"
        class="flex flex-col items-center gap-1 rounded-lg p-1.5"
        :class="isActive && hi === spot.activeHandIndex && hand.outcome === null ? 'ring-2 ring-[var(--accent-gold)]' : ''"
      >
        <span
          v-if="isActive && hi === spot.activeHandIndex && hand.outcome === null"
          class="sr-only"
        >Active hand</span>
        <div class="flex">
          <PlayingCard
            v-for="(card, ci) in hand.cards"
            :key="ci"
            :card="card"
            :face-up="true"
            size="sm"
            :style="{ marginLeft: ci === 0 ? '0' : '-2.4rem' }"
          />
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-semibold text-[var(--accent-cream)]">{{ totalLabel(hand.cards) }}</span>
          <span
            v-if="hand.doubled"
            class="text-[9px] uppercase text-[var(--accent-gold)]"
          >2×</span>
          <span
            v-if="hand.outcome"
            class="rounded px-1 py-0.5 text-[9px] font-bold"
            :class="OUTCOME_BADGE[hand.outcome]!.cls"
          >
            {{ OUTCOME_BADGE[hand.outcome]!.text }}
          </span>
        </div>
        <div :class="{ 'payout-flash': hand.outcome !== null && hand.net > 0 }">
          <ChipStack
            :amount="hand.bet"
            size="sm"
          />
        </div>
      </div>
    </div>

    <div
      class="flex items-center gap-1 text-[11px]"
      :class="isHero ? 'text-[var(--accent-gold)] font-bold' : 'text-[var(--accent-cream)]/70'"
    >
      <UIcon
        v-if="persona"
        name="i-lucide-bot"
        class="h-3 w-3"
      />
      <span>{{ persona ? persona.name : 'You' }}</span>
    </div>
  </div>
</template>
