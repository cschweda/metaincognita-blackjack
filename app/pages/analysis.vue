<script setup lang="ts">
import {
  adherenceRows, bankrollSeries, botPnl, countAccuracy, evLostCents,
  heroPnlCents, sideBetLedger, topMistakes
} from '~/utils/analysis'
import { PERSONAS } from '~/utils/engine/bots'

const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const rows = computed(() => adherenceRows(store.training))
const overall = computed(() => {
  const d = rows.value.reduce((s, r) => s + r.decisions, 0)
  const c = rows.value.reduce((s, r) => s + r.correct, 0)
  return { decisions: d, pct: d === 0 ? 0 : Math.round((c / d) * 100) }
})
const mistakes = computed(() => topMistakes(store.training.mistakeBag))
const evLost = computed(() => evLostCents(store.history))
const pnl = computed(() => heroPnlCents(store.history))
const counts = computed(() => countAccuracy(store.training.countChecks))
const recentCounts = computed(() => countAccuracy(store.training.countChecks.slice(-10)))
const ledger = computed(() => sideBetLedger(store.history))
const bots = computed(() => botPnl(store.history).map(b => ({
  ...b, name: PERSONAS.find(p => p.id === b.id)?.name ?? b.id
})))

const series = computed(() => bankrollSeries(store.history, store.bankroll))
const sparkPoints = computed(() => {
  const s = series.value
  if (s.length < 2) return ''
  const min = Math.min(...s)
  const max = Math.max(...s)
  const span = Math.max(1, max - min)
  return s.map((v, i) =>
    `${(i / (s.length - 1)) * 200},${36 - ((v - min) / span) * 32}`).join(' ')
})

function money(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString()}`
}
</script>

<template>
  <main class="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Session analysis
    </h1>

    <section class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <p class="text-xs uppercase tracking-wide text-neutral-400">
          Book adherence
        </p>
        <p
          class="mt-1 text-2xl font-bold text-[var(--accent-gold)]"
          data-testid="adherence-overall"
        >
          {{ overall.pct }}%
        </p>
        <p class="text-xs text-neutral-400">
          {{ overall.decisions }} graded decisions
        </p>
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <p class="text-xs uppercase tracking-wide text-neutral-400">
          EV lost to mistakes
        </p>
        <p class="mt-1 text-2xl font-bold text-red-400">
          ${{ (evLost / 100).toFixed(2) }}
        </p>
        <p class="text-xs text-neutral-400">
          vs actual P&L {{ money(pnl) }} — variance is loud, mistakes are quiet
        </p>
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <p class="text-xs uppercase tracking-wide text-neutral-400">
          Count accuracy
        </p>
        <p class="mt-1 text-2xl font-bold text-[var(--accent-cream)]">
          {{ counts.total === 0 ? '—' : `${Math.round((counts.exact / counts.total) * 100)}%` }}
        </p>
        <p class="text-xs text-neutral-400">
          {{ counts.total }} checks · {{ counts.withinOne }} within ±1
        </p>
        <p
          v-if="counts.total > 10"
          class="text-xs text-neutral-400"
        >
          trend: last 10 at {{ Math.round((recentCounts.exact / Math.max(1, recentCounts.total)) * 100) }}%
        </p>
      </div>
    </section>

    <section class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <h2 class="text-sm font-semibold text-neutral-300">
        Adherence by category
      </h2>
      <div
        v-for="row in rows"
        :key="row.category"
        class="mt-2"
      >
        <div class="flex justify-between text-xs text-neutral-400">
          <span class="capitalize">{{ row.category }}</span>
          <span>{{ row.decisions === 0 ? 'no decisions yet' : `${row.pct}% of ${row.decisions}` }}</span>
        </div>
        <div class="mt-0.5 h-1.5 rounded bg-neutral-800">
          <div
            class="h-1.5 rounded bg-[var(--accent-gold)]"
            :style="{ width: `${row.pct}%` }"
          />
        </div>
      </div>
    </section>

    <section class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <h2 class="text-sm font-semibold text-neutral-300">
          Most repeated mistakes
        </h2>
        <p
          v-if="mistakes.length === 0"
          class="mt-2 text-xs text-neutral-400"
        >
          Clean sheet so far.
        </p>
        <ol class="mt-2 space-y-1 text-xs text-neutral-400">
          <li
            v-for="m in mistakes"
            :key="m.key"
            class="flex justify-between"
          >
            <span>{{ m.label }}</span>
            <span class="font-mono">×{{ m.count }}</span>
          </li>
        </ol>
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <h2 class="text-sm font-semibold text-neutral-300">
          Bankroll
        </h2>
        <svg
          viewBox="0 0 200 40"
          class="mt-2 h-10 w-full"
          aria-hidden="true"
        >
          <polyline
            :points="sparkPoints"
            fill="none"
            stroke="var(--accent-gold)"
            stroke-width="1.5"
          />
        </svg>
        <p class="text-xs text-neutral-400">
          {{ store.history.length }} rounds · now ${{ (store.bankroll / 100).toLocaleString() }}
        </p>
      </div>
    </section>

    <section class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <h2 class="text-sm font-semibold text-neutral-300">
          Side-bet ledger
        </h2>
        <p
          v-if="ledger.length === 0"
          class="mt-2 text-xs text-neutral-400"
        >
          No side bets placed — the book approves.
        </p>
        <table
          v-else
          class="mt-2 w-full text-xs text-neutral-400"
        >
          <tbody>
            <tr
              v-for="row in ledger"
              :key="row.name"
            >
              <td>{{ row.name }}</td>
              <td class="text-right font-mono">
                staked ${{ (row.staked / 100).toLocaleString() }}
              </td>
              <td
                class="text-right font-mono"
                :class="row.net < 0 ? 'text-red-400' : 'text-emerald-400'"
              >
                {{ money(row.net) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <h2 class="text-sm font-semibold text-neutral-300">
          Bot P&L — cost of their leak
        </h2>
        <p
          v-if="bots.length === 0"
          class="mt-2 text-xs text-neutral-400"
        >
          No companions this session.
        </p>
        <table
          v-else
          class="mt-2 w-full text-xs text-neutral-400"
        >
          <tbody>
            <tr
              v-for="bot in bots"
              :key="bot.id"
            >
              <td>{{ bot.name }}</td>
              <td
                class="text-right font-mono"
                :class="bot.net < 0 ? 'text-red-400' : 'text-emerald-400'"
              >
                {{ money(bot.net) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
