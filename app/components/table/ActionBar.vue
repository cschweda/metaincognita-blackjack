<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Action } from '~/utils/engine/hand'
import type { RuleSet } from '~/utils/engine/rules'
import type { SideBetKind } from '~/utils/engine/round'

const props = withDefaults(defineProps<{
  phase: 'betting' | 'insurance' | 'playerTurns' | 'complete'
  rules: RuleSet
  legalActions: Action[]
  bankroll: number
  canDeal: boolean
  heroHasBlackjack: boolean
  lastBet: { main: number, side: Partial<Record<SideBetKind, number>> } | null
  /** The live hand's main bet from the engine — survives refresh, unlike lastBet. */
  heroBet?: number | null
  /** Cents committed but not yet settled — caps what insurance may still spend. */
  inPlay?: number
  /** False while the table is presenting — freezes the insurance buttons. */
  insuranceEnabled?: boolean
  /** Per-action EVs — coach mode only; renders a tooltip + sr-only hint per button. */
  evs?: Partial<Record<Action, number>>
  insuranceAdvice?: string
}>(), { heroBet: null, inPlay: 0, insuranceEnabled: true, evs: undefined, insuranceAdvice: undefined })

const emit = defineEmits<{
  deal: [main: number, side: Partial<Record<SideBetKind, number>>]
  act: [action: Action]
  insurance: [decision: number | 'even-money' | null]
}>()

const CHIP_VALUES = [100, 500, 2500, 10000, 50000] // cents
const mainBet = ref(0)
const sideStakes = ref<Partial<Record<SideBetKind, number>>>({})
const target = ref<'main' | SideBetKind>('main')

const enabledSideBets = computed<Array<{ kind: SideBetKind, label: string }>>(() => {
  const out: Array<{ kind: SideBetKind, label: string }> = []
  if (props.rules.sideBets.twentyOnePlusThree !== 'off') out.push({ kind: 'twentyOnePlusThree', label: '21+3' })
  if (props.rules.sideBets.luckyLadies !== 'off') out.push({ kind: 'luckyLadies', label: 'Lucky Ladies' })
  if (props.rules.sideBets.matchTheDealer) out.push({ kind: 'matchTheDealer', label: 'Match Dealer' })
  if (props.rules.sideBets.buster !== 'off') out.push({ kind: 'buster', label: 'Buster' })
  return out
})

const committed = computed(() =>
  mainBet.value + Object.values(sideStakes.value).reduce((s, v) => s + (v ?? 0), 0))

function addChip(value: number): void {
  if (committed.value + value > props.bankroll) return
  if (target.value === 'main') {
    if (mainBet.value + value > props.rules.maxBet) return
    mainBet.value += value
  } else {
    const cur = sideStakes.value[target.value] ?? 0
    if (cur + value > mainBet.value) return // side bets may not exceed the main bet (MA §17(g), §27(c))
    sideStakes.value = { ...sideStakes.value, [target.value]: cur + value }
  }
}

function clearBets(): void {
  mainBet.value = 0
  sideStakes.value = {}
  target.value = 'main'
}

/** Re-place the previous wager, clamped to what the bankroll still covers — a rebet
 *  must never arm a bet that silently disables Deal (the table goes dead with no error). */
function rebet(): void {
  if (!props.lastBet) return
  const main = Math.min(props.lastBet.main, props.bankroll)
  let total = main
  const side: Partial<Record<SideBetKind, number>> = {}
  for (const [kind, stake] of Object.entries(props.lastBet.side) as Array<[SideBetKind, number | undefined]>) {
    if (stake && stake <= main && total + stake <= props.bankroll) {
      side[kind] = stake
      total += stake
    }
  }
  mainBet.value = main
  sideStakes.value = side
}

/** A double-click's second click must not start a second round. */
const dealCooldown = ref(false)

const dealDisabled = computed(() =>
  !props.canDeal || dealCooldown.value || mainBet.value < props.rules.minBet || committed.value > props.bankroll)

function deal(): void {
  if (dealDisabled.value) return
  dealCooldown.value = true
  setTimeout(() => {
    dealCooldown.value = false
  }, 350)
  emit('deal', mainBet.value, { ...sideStakes.value })
}

const insuranceAmount = computed(() =>
  Math.floor((props.heroBet ?? props.lastBet?.main ?? props.rules.minBet) / 2))
const insuranceOn = computed(() => props.insuranceEnabled)
const insuranceUnaffordable = computed(() =>
  insuranceAmount.value > props.bankroll - (props.inPlay ?? 0))

const ACTION_META: Record<Action, { label: string, key: string }> = {
  hit: { label: 'Hit', key: 'H' },
  stand: { label: 'Stand', key: 'S' },
  double: { label: 'Double', key: 'D' },
  split: { label: 'Split', key: 'P' },
  surrender: { label: 'Surrender', key: 'R' }
}
const ACTION_ORDER: Action[] = ['hit', 'stand', 'double', 'split', 'surrender']

defineExpose({ mainBet, sideStakes, addChip, clearBets, rebet, deal })
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-t-xl bg-neutral-950/85 p-3 backdrop-blur">
    <!-- BETTING -->
    <template v-if="phase === 'betting' || phase === 'complete'">
      <div class="flex items-center gap-2">
        <UButton
          v-for="value in CHIP_VALUES"
          :key="value"
          size="sm"
          variant="soft"
          color="neutral"
          :disabled="committed + value > bankroll"
          :data-testid="`chip-${value}`"
          :aria-label="`Add $${value / 100} chip`"
          @click="addChip(value)"
        >
          ${{ value / 100 }}
        </UButton>
        <span class="mx-2 h-5 w-px bg-neutral-700" />
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          :disabled="committed === 0"
          @click="clearBets"
        >
          Clear
        </UButton>
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          :disabled="!lastBet"
          data-testid="rebet"
          @click="rebet"
        >
          Rebet <kbd class="ml-1 text-[9px] opacity-60">B</kbd>
        </UButton>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <UButton
          size="xs"
          :variant="target === 'main' ? 'solid' : 'outline'"
          color="primary"
          data-testid="target-main"
          aria-label="Bet target: main bet"
          :aria-pressed="target === 'main'"
          @click="target = 'main'"
        >
          Main {{ mainBet > 0 ? `$${mainBet / 100}` : '' }}
        </UButton>
        <UButton
          v-for="sb in enabledSideBets"
          :key="sb.kind"
          size="xs"
          :variant="target === sb.kind ? 'solid' : 'outline'"
          color="neutral"
          :data-testid="`target-${sb.kind}`"
          :aria-label="`Bet target: ${sb.label}`"
          :aria-pressed="target === sb.kind"
          @click="target = sb.kind"
        >
          {{ sb.label }} {{ (sideStakes[sb.kind] ?? 0) > 0 ? `$${(sideStakes[sb.kind] ?? 0) / 100}` : '' }}
        </UButton>
        <UButton
          color="primary"
          size="lg"
          :disabled="dealDisabled"
          data-testid="deal"
          @click="deal"
        >
          Deal <kbd class="ml-1 text-[10px] opacity-70">Space</kbd>
        </UButton>
      </div>
      <p
        v-if="mainBet > 0 && mainBet < rules.minBet"
        class="text-xs text-amber-400"
      >
        Table minimum is ${{ rules.minBet / 100 }}
      </p>
      <p
        v-if="committed > bankroll"
        class="text-xs text-amber-400"
        data-testid="bankroll-hint"
      >
        That's more than your ${{ (bankroll / 100).toLocaleString() }} bankroll — clear some chips
      </p>
    </template>

    <!-- INSURANCE -->
    <template v-else-if="phase === 'insurance'">
      <p class="text-sm text-[var(--accent-cream)]">
        Dealer shows an ace — insurance pays 2 to 1
      </p>
      <div class="flex gap-2">
        <UButton
          v-if="heroHasBlackjack && rules.evenMoneyOffered"
          color="primary"
          :disabled="!insuranceOn"
          data-testid="even-money"
          @click="emit('insurance', 'even-money')"
        >
          Even money
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          :disabled="!insuranceOn || insuranceUnaffordable"
          data-testid="take-insurance"
          @click="emit('insurance', insuranceAmount)"
        >
          Insure ${{ insuranceAmount / 100 }}
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          :disabled="!insuranceOn"
          data-testid="decline-insurance"
          @click="emit('insurance', null)"
        >
          No insurance
        </UButton>
      </div>
      <p
        v-if="insuranceAdvice"
        class="text-xs text-neutral-400"
        data-testid="insurance-advice"
      >
        {{ insuranceAdvice }}
      </p>
    </template>

    <!-- PLAYER TURNS -->
    <template v-else>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <UButton
          v-for="action in ACTION_ORDER"
          :key="action"
          size="lg"
          :color="action === 'surrender' ? 'neutral' : 'primary'"
          :variant="action === 'hit' || action === 'stand' ? 'solid' : 'soft'"
          :disabled="!legalActions.includes(action)"
          :title="evs?.[action] !== undefined ? `EV ${(evs[action]! * 100).toFixed(1)}%` : undefined"
          :data-testid="`act-${action}`"
          @click="emit('act', action)"
        >
          {{ ACTION_META[action].label }}
          <kbd class="ml-1 text-[10px] opacity-60">{{ ACTION_META[action].key }}</kbd>
          <span
            v-if="evs?.[action] !== undefined"
            class="sr-only"
          >EV {{ (evs[action]! * 100).toFixed(1) }}%</span>
        </UButton>
      </div>
    </template>
  </div>
</template>
