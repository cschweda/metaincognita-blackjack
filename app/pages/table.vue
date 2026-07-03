<script setup lang="ts">
import type { Action } from '~/utils/engine/hand'
import { isBlackjack } from '~/utils/engine/hand'
import type { SideBetKind } from '~/utils/engine/round'
import { useCounting } from '~/composables/useCounting'
import { betForTc, bucketForTc } from '~/utils/betRamp'
import { adviseHand, adviseInsurance, summarizeRound } from '~/utils/advisor'
import type { RoundSummary } from '~/utils/advisor'
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
/** One lookup per render, not two finds per seat. */
const spotBySeat = computed(() => new Map(spotsView.value.map(s => [s.spotId, s])))

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

/** Settled-round recap — non-null only after settlement is fully presented; cleared by the next deal. */
const roundSummary = computed<RoundSummary | null>(() => {
  if (phase.value !== 'complete' || !queueIdle.value) return null
  const last = store.history[store.history.length - 1]
  return last ? summarizeRound(last) : null
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

/** Opt-in ramp coaching (Bet Lab): one bet-size line between rounds. Every gate must hold —
 *  saved toggle, counting on, advanced deviations, not exam — or the table stays unchanged. */
const betHint = computed<string | null>(() => {
  if (!store.settings || !rules.value) return null
  const ramp = store.training.betRamp
  if (!ramp || !store.training.betHintsEnabled) return null
  if (store.settings.count === 'off' || !store.settings.advancedDeviations) return null
  if (store.settings.advisor === 'exam') return null
  if (!betweenRounds.value) return null
  const tc = counting.tc.value
  const tcText = `${tc >= 0 ? '+' : '−'}${Math.abs(tc).toFixed(1)}`
  if (ramp.wongOut && bucketForTc(tc) === 0) return `Ramp: sit out — TC ${tcText}`
  const cents = betForTc(ramp, tc, rules.value)
  const units = Math.round((cents / ramp.unitCents) * 10) / 10
  return `Ramp: bet ${units} unit${units === 1 ? '' : 's'} ($${(cents / 100).toLocaleString()}) — TC ${tcText}`
})
const latestAnnouncement = computed(() => announcements.value[announcements.value.length - 1]?.text ?? '')

function onDeal(main: number, side: Partial<Record<SideBetKind, number>>): void {
  lastBet.value = { main, side }
  sideStakesPlaced.value = Object.values(side).some(v => (v ?? 0) > 0)
  loop.beginRound(main, side)
}

function onAct(action: Action): void {
  if (!canAct.value) return // a click that raced the round's end — nothing to act on
  loop.act(action, heroTurn.value?.handIndex)
}

function onInsurance(decision: number | 'even-money' | null): void {
  loop.heroInsurance(decision)
}

function backToSetup(): void {
  loop.endSession()
  router.push('/')
}

watch(canAct, (v) => {
  if (!v) return
  void nextTick(() => {
    if (document.activeElement instanceof HTMLInputElement) return
    const btn = document.querySelector<HTMLElement>('[data-testid^="act-"]:not([disabled])')
    btn?.focus()
  })
})
watch(phase, (p) => {
  if (p !== 'insurance') return
  void nextTick(() => {
    document.querySelector<HTMLElement>('[data-testid="decline-insurance"]')?.focus()
  })
})

// Keyboard map (spec §6): H/S/D/P/R act, B rebet, Space deal
const studyMode = ref(false)

const actionBar = ref<{ rebet: () => void, deal: () => void } | null>(null)
const KEYS: Record<string, Action> = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' }
function onKey(e: KeyboardEvent): void {
  if (!store.training.keyboardShortcuts) return // WCAG 2.1.4: single-key shortcuts are optional
  if (studyMode.value) return
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
    <UAlert
      v-if="store.crossTabConflict"
      color="warning"
      variant="soft"
      class="m-2"
      title="This session was changed in another tab"
      description="Two tabs share one saved session and the last write wins — keep playing in one tab only."
    />

    <!-- felt -->
    <BotChips :spots="spotsView" />
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
          <div
            v-if="spotBySeat.get(spotId)"
            :class="spotId === heroSpotId ? '' : 'hidden md:block'"
          >
            <SpotSeat
              :spot="spotBySeat.get(spotId)!"
              :is-hero="spotId === heroSpotId"
              :is-active="phase === 'playerTurns' && spotId === heroSpotId && canAct"
            />
          </div>
          <!-- empty-seat markers only when companions are at the table: a heads-up
               session reads as exactly you vs the dealer (first-time clarity) -->
          <div
            v-else-if="(store.settings?.botIds.length ?? 0) > 0"
            class="hidden h-10 w-10 rounded-full border border-dashed border-[var(--accent-cream)]/15 md:block"
            aria-hidden="true"
          />
        </template>
      </BlackjackTable>

      <div class="pointer-events-none absolute right-2 top-2 z-10 flex w-52 flex-col gap-2 md:w-64">
        <div class="pointer-events-auto">
          <AdvisorPanel
            :intensity="store.settings!.advisor"
            :recommendation="advisorRec"
            :last-decision="lastDecision"
            :show-side-bet-caution="store.settings!.advisor === 'coach' && betweenRounds && sideStakesPlaced"
            :round-summary="roundSummary"
            :bankroll-cents="store.bankroll"
            :bet-hint="betHint"
          />
        </div>
        <div class="pointer-events-auto">
          <CountPanel ref="countPanel" />
        </div>
      </div>
      <RoundOutcome :summary="roundSummary" />
      <StudyHotspots
        v-if="studyMode && rules"
        :rules="rules"
      />
    </div>

    <!-- controls -->
    <div class="shrink-0 px-2 pb-2">
      <div class="mb-1 flex items-center justify-between px-1 text-xs text-neutral-400">
        <span v-if="inPlay > 0">In play: <span class="font-mono text-[var(--accent-cream)]">${{ (inPlay / 100).toLocaleString() }}</span></span>
        <span v-else>Place your bet — table ${{ (rules.minBet / 100).toLocaleString() }}–${{ (rules.maxBet / 100).toLocaleString() }}</span>
        <div class="flex items-center gap-2">
          <UButton
            size="xs"
            :variant="store.training.keyboardShortcuts ? 'solid' : 'outline'"
            color="neutral"
            icon="i-lucide-keyboard"
            :aria-pressed="store.training.keyboardShortcuts"
            aria-label="Keyboard shortcuts (H/S/D/P/R, B, C, Space)"
            title="Single-key table shortcuts — turn off if they conflict with assistive input"
            data-testid="shortcuts-toggle"
            @click="store.setKeyboardShortcuts(!store.training.keyboardShortcuts)"
          >
            Keys
          </UButton>
          <UButton
            size="xs"
            :variant="studyMode ? 'solid' : 'outline'"
            color="neutral"
            icon="i-lucide-graduation-cap"
            :aria-pressed="studyMode"
            data-testid="study-toggle"
            @click="studyMode = !studyMode"
          >
            Study
          </UButton>
          <span>Session: {{ store.session.roundsPlayed }} rounds</span>
        </div>
      </div>
      <ActionBar
        ref="actionBar"
        :phase="betweenRounds ? 'betting' : phase === 'insurance' ? 'insurance' : 'playerTurns'"
        :rules="rules"
        :legal-actions="studyMode ? [] : legalActions"
        :bankroll="store.bankroll"
        :can-deal="betweenRounds && queueIdle && !studyMode"
        :hero-has-blackjack="heroHasBlackjack"
        :last-bet="lastBet"
        :hero-bet="heroView?.hands[0]?.bet ?? null"
        :in-play="inPlay"
        :insurance-enabled="queueIdle"
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
