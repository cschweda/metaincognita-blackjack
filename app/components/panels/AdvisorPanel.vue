<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdvisorRecommendation, RoundSummary } from '~/utils/advisor'
import { pctEV } from '~/utils/advisor'
import type { AdvisorIntensity, DecisionRecord } from '~/stores/useBlackjackStore'
import type { Action } from '~/utils/engine/hand'

const props = defineProps<{
  intensity: AdvisorIntensity
  /** Pass only in coach mode and only when it's the hero's turn; null otherwise. */
  recommendation: AdvisorRecommendation | null
  lastDecision: DecisionRecord | null
  showSideBetCaution: boolean
  /** Settled-round recap — pass while between rounds; takes over the panel body. */
  roundSummary?: RoundSummary | null
  /** Current bankroll in cents, shown next to the round's net change. */
  bankrollCents?: number
}>()

const summaryClass = computed(() => {
  const s = props.roundSummary
  if (!s) return ''
  if (s.outcome === 'blackjack' || s.netCents > 0) return 'text-[var(--accent-gold)]'
  if (s.netCents < 0) return 'text-red-400'
  return 'text-neutral-200'
})

function signed(cents: number): string {
  const abs = Math.abs(cents) / 100
  const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })
  return `${cents > 0 ? '+' : cents < 0 ? '−' : '±'}$${formatted}`
}

const ACTION_LABEL: Record<Action, string> = {
  hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender'
}

const evRows = computed(() => {
  if (!props.recommendation) return []
  return (Object.entries(props.recommendation.evs) as Array<[Action, number]>)
    .sort((a, b) => b[1] - a[1])
    .map(([action, ev]) => ({ action, label: ACTION_LABEL[action], ev: pctEV(ev) }))
})

const open = ref(true) // collapsible (spec §6)
</script>

<template>
  <div class="rounded-lg border border-neutral-800 bg-neutral-950/85 p-2.5 text-xs backdrop-blur">
    <button
      type="button"
      class="mb-1.5 flex w-full items-center justify-between font-semibold uppercase tracking-wide text-neutral-500"
      :aria-expanded="open"
      data-testid="advisor-toggle"
      @click="open = !open"
    >
      Advisor
      <UIcon
        :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="h-3 w-3"
      />
    </button>

    <div v-show="open">
      <!-- settled-round recap: outcome, why, money — strategy moments hidden in exam mode -->
      <div
        v-if="roundSummary"
        data-testid="advisor-round"
      >
        <p
          class="text-base font-bold"
          :class="summaryClass"
          data-testid="advisor-headline"
        >
          {{ roundSummary.headline }}
        </p>
        <p class="mt-0.5 text-neutral-400">
          {{ roundSummary.why }}
        </p>
        <p
          v-if="bankrollCents !== undefined"
          class="mt-1 font-mono text-neutral-300"
          data-testid="advisor-bankroll"
        >
          Bankroll {{ signed(roundSummary.netCents) }} → ${{ (bankrollCents / 100).toLocaleString() }}
        </p>
        <ul
          v-if="intensity !== 'exam' && roundSummary.moments.length"
          class="mt-1.5 space-y-0.5 text-neutral-400"
          data-testid="advisor-moments"
        >
          <li
            v-for="moment in roundSummary.moments"
            :key="moment"
          >
            {{ moment }}
          </li>
        </ul>
      </div>

      <template v-else-if="intensity === 'coach'">
        <div v-if="recommendation">
          <p
            class="text-base font-bold text-[var(--accent-gold)]"
            data-testid="advisor-action"
          >
            {{ ACTION_LABEL[recommendation.action] }}
            <span
              v-if="recommendation.deviation"
              class="ml-1 rounded bg-purple-900 px-1 py-0.5 text-[9px] uppercase text-purple-200"
            >count call</span>
          </p>
          <p class="mt-0.5 text-neutral-400">
            {{ recommendation.reasoning }}
          </p>
          <table
            class="mt-1.5 w-full font-mono"
            data-testid="advisor-evs"
          >
            <tbody>
              <tr
                v-for="row in evRows"
                :key="row.action"
                :class="row.action === recommendation.action ? 'text-[var(--accent-cream)]' : 'text-neutral-500'"
              >
                <td>{{ row.label }}</td>
                <td class="text-right">
                  {{ row.ev }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-else
          class="text-neutral-500"
        >
          Waiting for your turn…
        </p>
      </template>

      <template v-else-if="intensity === 'feedback'">
        <div
          v-if="lastDecision"
          data-testid="advisor-feedback"
        >
          <p
            v-if="lastDecision.correct"
            class="font-semibold text-emerald-400"
          >
            ✓ Book agrees with {{ ACTION_LABEL[lastDecision.action] }}
          </p>
          <p
            v-else
            class="font-semibold text-red-400"
          >
            ✗ Book: {{ ACTION_LABEL[lastDecision.book] }}
            <span v-if="lastDecision.costCents > 0"> — cost ≈${{ (lastDecision.costCents / 100).toFixed(2) }}</span>
          </p>
        </div>
        <p
          v-else
          class="text-neutral-500"
        >
          Feedback appears after each decision.
        </p>
      </template>

      <p
        v-else
        class="text-neutral-500"
        data-testid="advisor-exam"
      >
        Exam mode — decisions are graded silently in History.
      </p>

      <p
        v-if="showSideBetCaution"
        class="mt-2 rounded bg-amber-950/60 p-1.5 text-amber-300"
        data-testid="advisor-sidebet-caution"
      >
        Side bets carry a far higher house edge than the main game — book play is to skip them.
      </p>
    </div>
  </div>
</template>
