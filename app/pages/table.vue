<script setup lang="ts">
import type { Action } from '~/utils/engine/hand'
import { isBlackjack } from '~/utils/engine/hand'
import type { SideBetKind } from '~/utils/engine/round'

const store = useBlackjackStore()
const loop = useGameLoop()
const router = useRouter()

const {
  phase, dealerRow, spotsView, announcements, liveText, queueIdle,
  canAct, legalActions, heroSpotId, inPlay, hasGame, trayFill
} = loop

const lastBet = ref<{ main: number, side: Partial<Record<SideBetKind, number>> } | null>(null)

onMounted(() => {
  if (!hasGame.value && !loop.restoreSession()) {
    router.replace('/')
  }
})

const rules = computed(() => store.settings?.rules)
const heroView = computed(() => spotsView.value.find(s => s.occupant === 'hero') ?? null)
const heroHasBlackjack = computed(() => {
  const cards = heroView.value?.hands[0]?.cards
  return !!cards && cards.length === 2 && isBlackjack(cards, false)
})
const betweenRounds = computed(() => phase.value === 'betting' || (phase.value === 'complete' && queueIdle.value))
const latestAnnouncement = computed(() => announcements.value[announcements.value.length - 1]?.text ?? '')

function onDeal(main: number, side: Partial<Record<SideBetKind, number>>): void {
  lastBet.value = { main, side }
  loop.beginRound(main, side)
}

function onAct(action: Action): void {
  loop.act(action)
}

function onInsurance(decision: number | 'even-money' | null): void {
  loop.heroInsurance(decision)
}

function backToSetup(): void {
  loop.endSession()
  router.push('/')
}

// Keyboard map (spec §6): H/S/D/P/R act, B rebet, Space deal
const actionBar = ref<{ rebet: () => void, deal: () => void } | null>(null)
const KEYS: Record<string, Action> = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' }
function onKey(e: KeyboardEvent): void {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  const key = e.key.toLowerCase()
  if (key === ' ' && betweenRounds.value) {
    e.preventDefault()
    actionBar.value?.deal()
  } else if (key === 'b' && betweenRounds.value) {
    actionBar.value?.rebet()
  } else if (KEYS[key] && canAct.value && legalActions.value.includes(KEYS[key]!)) {
    onAct(KEYS[key]!)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main
    v-if="rules"
    class="flex min-h-0 flex-1 flex-col"
  >
    <UAlert
      v-if="!store.storageAvailable"
      color="warning"
      variant="soft"
      class="m-2"
      title="Storage unavailable — this session won't survive a refresh"
    />

    <!-- felt -->
    <div class="relative min-h-0 flex-1 p-2">
      <BlackjackTable :rules="rules">
        <template #dealer>
          <DealerArea
            :cards="dealerRow"
            :tray-fill="trayFill"
            :penetration="rules.penetration"
            :announcement="latestAnnouncement"
            :live-text="liveText"
          />
        </template>
        <template #seat="{ spotId }">
          <SpotSeat
            v-if="spotsView.find(s => s.spotId === spotId)"
            :spot="spotsView.find(s => s.spotId === spotId)!"
            :is-hero="spotId === heroSpotId"
            :is-active="phase === 'playerTurns' && spotId === heroSpotId && canAct"
          />
          <div
            v-else
            class="h-10 w-10 rounded-full border border-dashed border-[var(--accent-cream)]/15"
            aria-hidden="true"
          />
        </template>
      </BlackjackTable>
    </div>

    <!-- controls -->
    <div class="shrink-0 px-2 pb-2">
      <div class="mb-1 flex items-center justify-between px-1 text-xs text-neutral-400">
        <span v-if="inPlay > 0">In play: <span class="font-mono text-[var(--accent-cream)]">${{ (inPlay / 100).toLocaleString() }}</span></span>
        <span v-else>Place your bet — table ${{ (rules.minBet / 100).toLocaleString() }}–${{ (rules.maxBet / 100).toLocaleString() }}</span>
        <span>Session: {{ store.session.roundsPlayed }} rounds</span>
      </div>
      <ActionBar
        ref="actionBar"
        :phase="betweenRounds ? 'betting' : phase === 'insurance' ? 'insurance' : 'playerTurns'"
        :rules="rules"
        :legal-actions="legalActions"
        :bankroll="store.bankroll"
        :can-deal="betweenRounds && queueIdle"
        :hero-has-blackjack="heroHasBlackjack"
        :last-bet="lastBet"
        @deal="onDeal"
        @act="onAct"
        @insurance="onInsurance"
      />
    </div>

    <!-- busted -->
    <UModal
      :open="store.busted"
      :dismissible="false"
      title="Bankroll busted"
    >
      <template #body>
        <p class="text-sm text-neutral-400">
          You're below the table minimum after {{ store.session.roundsPlayed }} rounds.
          The shoe doesn't care — that's the lesson. Set up a new session to keep practicing.
        </p>
      </template>
      <template #footer>
        <UButton
          color="primary"
          label="Back to setup"
          @click="backToSetup"
        />
      </template>
    </UModal>
  </main>
</template>
