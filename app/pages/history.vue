<script setup lang="ts">
import { OUTCOME_BADGE } from '~/utils/outcomeBadges'
import { pctEV } from '~/utils/advisor'

const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const rounds = computed(() => [...store.history].reverse())

function heroNet(round: (typeof rounds.value)[number]): number {
  const hero = round.spots.find(s => s.occupant === 'hero')
  if (!hero) return 0
  return hero.hands.reduce((sum, h) => sum + h.net, 0)
    + hero.sideBets.reduce((sum, b) => sum + b.net, 0)
    + hero.insuranceNet
}

function money(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString()}`
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString()
}
</script>

<template>
  <main class="mx-auto w-full max-w-3xl flex-1 space-y-3 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Hand history
    </h1>

    <p
      v-if="rounds.length === 0"
      class="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500"
      data-testid="history-empty"
    >
      No rounds yet — play a few hands and your decisions land here, graded against the book.
    </p>

    <article
      v-for="round in rounds"
      :key="round.round"
      class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm"
      :data-testid="`round-${round.round}`"
    >
      <header class="flex items-baseline justify-between gap-2">
        <span class="font-semibold text-neutral-200">Round {{ round.round }}</span>
        <span class="text-xs text-neutral-500">{{ time(round.at) }}</span>
        <span
          class="ml-auto font-mono font-semibold"
          :class="heroNet(round) > 0 ? 'text-emerald-400' : heroNet(round) < 0 ? 'text-red-400' : 'text-neutral-400'"
        >{{ money(heroNet(round)) }}</span>
      </header>

      <p class="mt-1 text-xs text-neutral-400">
        Dealer: <span class="font-mono">{{ round.dealer.cards.join(' ') }}</span>
        — {{ round.dealer.busted ? 'bust' : round.dealer.blackjack ? 'blackjack' : round.dealer.total }}
      </p>

      <div
        v-for="(spot, si) in round.spots"
        :key="si"
        class="mt-1.5"
      >
        <div
          v-for="(hand, hi) in spot.hands"
          :key="hi"
          class="flex flex-wrap items-center gap-1.5 text-xs"
        >
          <span :class="spot.occupant === 'hero' ? 'font-semibold text-[var(--accent-gold)]' : 'text-neutral-500'">
            {{ spot.occupant === 'hero' ? 'You' : spot.occupant }}
          </span>
          <span class="font-mono text-neutral-300">{{ hand.cards.join(' ') }}</span>
          <span class="text-neutral-500">${{ hand.bet / 100 }}</span>
          <span
            class="rounded px-1 py-0.5 text-[9px] font-bold"
            :class="OUTCOME_BADGE[hand.outcome]?.cls"
          >{{ OUTCOME_BADGE[hand.outcome]?.text ?? hand.outcome }}</span>
        </div>
        <p
          v-if="spot.sideBets.length"
          class="mt-0.5 text-[11px] text-neutral-500"
        >
          Side: {{ spot.sideBets.map(b => `${b.name} ${money(b.net)}`).join(' · ') }}
        </p>
      </div>

      <!-- a dealer-blackjack round can carry an insurance record with zero decisions -->
      <div
        v-if="round.heroDecisions?.length || round.heroInsurance"
        class="mt-2 space-y-1 border-t border-neutral-800 pt-2"
      >
        <div
          v-for="(d, di) in round.heroDecisions"
          :key="di"
          class="text-xs"
          :data-testid="`decision-${round.round}-${di}`"
        >
          <p class="flex flex-wrap items-center gap-1.5">
            <span :class="d.correct ? 'text-emerald-400' : 'text-red-400'">{{ d.correct ? '✓' : '✗' }}</span>
            <span class="font-mono text-neutral-300">{{ d.cards.join(' ') }} vs {{ d.dealerUp }}</span>
            <span class="text-neutral-400">{{ d.action }}</span>
            <span
              v-if="!d.correct"
              class="text-neutral-500"
            >book: {{ d.book }}<template v-if="d.costCents > 0"> · cost ${{ (d.costCents / 100).toFixed(2) }}</template></span>
            <span
              v-if="d.deviationId"
              class="rounded bg-purple-900 px-1 text-[9px] uppercase text-purple-200"
            >count call</span>
            <span class="ml-auto font-mono text-neutral-600">RC {{ d.rc > 0 ? '+' : '' }}{{ d.rc }} · TC {{ d.tc.toFixed(1) }}</span>
          </p>
          <details class="mt-0.5 text-neutral-500">
            <summary class="cursor-pointer text-[11px]">
              EV table
            </summary>
            <table class="mt-1 font-mono text-[11px]">
              <tbody>
                <tr
                  v-for="(ev, action) in d.evs"
                  :key="action"
                >
                  <td class="pr-3">
                    {{ action }}
                  </td>
                  <td>
                    {{ pctEV(ev) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
        <p
          v-if="round.heroInsurance"
          class="text-xs"
        >
          <span :class="round.heroInsurance.correct ? 'text-emerald-400' : 'text-red-400'">{{ round.heroInsurance.correct ? '✓' : '✗' }}</span>
          <span class="ml-1.5 text-neutral-400">insurance: {{ round.heroInsurance.took === null ? 'declined' : round.heroInsurance.took === 'even-money' ? 'even money' : `$${round.heroInsurance.took / 100}` }}</span>
          <span class="ml-1.5 text-neutral-500">(book: {{ round.heroInsurance.book }})</span>
        </p>
      </div>
    </article>
  </main>
</template>
