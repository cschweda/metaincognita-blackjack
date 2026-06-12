<script setup lang="ts">
import type { Action } from '~/utils/engine/hand'
import { isBlackjack } from '~/utils/engine/hand'
import type { SideBetKind } from '~/utils/engine/round'
import { useCounting } from '~/composables/useCounting'
import { adviseHand, adviseInsurance } from '~/utils/advisor'
import CountPanel from '~/components/panels/CountPanel.vue'

const store = useBlackjackStore()
const loop = useGameLoop()
const router = useRouter()

const {
  phase, dealerRow, spotsView, announcements, liveText, queueIdle,
  canAct, legalActions, heroSpotId, inPlay, hasGame, trayFill,
  heroTurn, lastDecision
} = loop

const lastBet = ref<{ main: number, side: Partial<Record<SideBetKind, number>> } | null>(null)

const rules = computed(() => store.settings?.rules)
const heroView = computed(() => spotsView.value.find(s => s.occupant === 'hero') ?? null)

const counting = useCounting()

const advisorRec = computed(() => {
  const t = heroTurn.value
  if (!t || !rules.value || !store.settings || store.settings.advisor !== 'coach') return null
  return adviseHand(
    { cards: t.cards, fromSplit: t.fromSplit },
    t.dealerUp, rules.value, counting.tc.value, store.settings.advancedDeviations,
    legalActions.value
  )
})

const insuranceAdvice = computed(() => {
  if (!store.settings || store.settings.advisor !== 'coach' || phase.value !== 'insurance') return undefined
  return adviseInsurance(counting.tc.value, store.settings.advancedDeviations).reasoning
})

/** True after a deal that carried side stakes — keeps the coach's caution visible through
 *  the NEXT betting phase (the moment the habit is correctable), not just mid-deal. */
const sideStakesPlaced = ref(false)
const countPanel = ref<InstanceType<typeof CountPanel> | null>(null)

onMounted(() => {
  if (!hasGame.value && !loop.restoreSession()) {
    router.replace('/')
  }
})
const heroHasBlackjack = computed(() => {
  const cards = heroView.value?.hands[0]?.cards
  return !!cards && cards.length === 2 && isBlackjack(cards, false)
})
const betweenRounds = computed(() => phase.value === 'betting' || (phase.value === 'complete' && queueIdle.value))
const latestAnnouncement = computed(() => announcements.value[announcements.value.length - 1]?.text ?? '')

function onDeal(main: number, side: Partial<Record<SideBetKind, number>>): void {
  lastBet.value = { main, side }
  sideStakesPlaced.value = Object.values(side).some(v => (v ?? 0) > 0)
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
  } else if (key === 'c' && store.settings?.count === 'self-check') {
    countPanel.value?.focusCheck()
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

      <div class="pointer-events-none absolute right-3 top-3 z-10 flex w-64 flex-col gap-2">
        <div class="pointer-events-auto">
          <AdvisorPanel
            :intensity="store.settings!.advisor"
            :recommendation="advisorRec"
            :last-decision="lastDecision"
            :show-side-bet-caution="store.settings!.advisor === 'coach' && betweenRounds && sideStakesPlaced"
          />
        </div>
        <div class="pointer-events-auto">
          <CountPanel ref="countPanel" />
        </div>
      </div>
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
        :evs="advisorRec?.evs"
        :insurance-advice="insuranceAdvice"
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
