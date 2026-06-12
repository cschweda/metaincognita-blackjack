<script setup lang="ts">
import type { RuleSet } from '~/utils/engine/rules'

const props = defineProps<{
  rules: RuleSet
}>()

interface Hotspot {
  id: string
  left: string
  top: string
  title: string
  body: string
}

const hotspots = computed<Hotspot[]>(() => [
  {
    id: 'shoe',
    left: '36%',
    top: '5%',
    title: 'Shoe & cut card',
    body: `The red cut card sits ${Math.round(props.rules.penetration * 100)}% deep. When it comes out, the current round finishes and the shoe is reshuffled (MA §5(h), §6(k)). Deeper penetration = more useful counts.`
  },
  {
    id: 'discard',
    left: '64%',
    top: '5%',
    title: 'Discard tray',
    body: 'Counters estimate decks remaining from this tray to the nearest half deck — true count = running count ÷ decks remaining.'
  },
  {
    id: 'dealer-rule',
    left: '50%',
    top: '20%',
    title: props.rules.dealerHitsSoft17 ? 'Dealer hits soft 17' : 'Dealer stands on all 17s',
    body: props.rules.dealerHitsSoft17
      ? 'H17 adds roughly 0.2% to the house edge versus S17 — the dealer re-draws soft 17s into stronger hands more often than it busts.'
      : 'S17 is the player-friendly variant: the dealer freezes on every 17, soft or hard (MA §12(b)).'
  },
  {
    id: 'insurance',
    left: '50%',
    top: '42%',
    title: 'Insurance line',
    body: 'Pays 2:1, but the dealer has blackjack less than one time in three. Book play: never — unless you count and the true count is +3 or better (MA §9).'
  },
  {
    id: 'bet',
    left: '50%',
    top: '74%',
    title: 'Betting spot',
    body: `Main bet circle (table $${props.rules.minBet / 100}–$${props.rules.maxBet / 100}) plus any enabled side-bet circles. Side bets run a far higher edge than the main game — ${props.rules.blackjackPayout === '6:5' ? 'and 6:5 blackjack costs you another ~1.4% on top.' : 'the 3:2 main game is the best bet on this felt.'}`
  }
])
</script>

<template>
  <div class="absolute inset-0 z-20">
    <UPopover
      v-for="spot in hotspots"
      :key="spot.id"
      :content="{ side: 'bottom' }"
    >
      <button
        type="button"
        class="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--accent-gold)] bg-neutral-950/80 text-xs font-bold text-[var(--accent-gold)] shadow-lg transition-transform hover:scale-110"
        :style="{ left: spot.left, top: spot.top }"
        :aria-label="`Study: ${spot.title}`"
        :data-testid="`study-hotspot-${spot.id}`"
      >
        i
      </button>
      <template #content>
        <div
          class="max-w-72 p-3 text-xs"
          data-testid="study-popover"
        >
          <p class="font-semibold text-[var(--accent-gold)]">
            {{ spot.title }}
          </p>
          <p class="mt-1 text-neutral-300">
            {{ spot.body }}
          </p>
        </div>
      </template>
    </UPopover>
  </div>
</template>
