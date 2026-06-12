<script setup lang="ts">
import { ILLUSTRIOUS_18, FAB_4 } from '~/utils/engine/counting'
import {
  TWENTY_ONE_PLUS_THREE_PAYS, LUCKY_LADIES_PAYS, MATCH_THE_DEALER_PAYS, BUSTER_PAYS
} from '~/utils/engine/sideBets'
import { PRESETS } from '~/utils/engine/rules'

const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const activeRules = computed(() => store.settings?.rules ?? PRESETS.VEGAS_STRIP_6D!)

const tabs = [
  { label: 'Strategy chart', value: 'chart' },
  { label: 'Rules lab', value: 'rules' },
  { label: 'Counting', value: 'counting' },
  { label: 'Side bets', value: 'sidebets' },
  { label: 'Myths', value: 'myths' },
  { label: 'Procedure', value: 'procedure' },
  { label: 'Glossary', value: 'glossary' }
]
const tab = ref('chart')

const HILO_ROWS = [
  { cards: '2 3 4 5 6', tag: '+1', value: 1 },
  { cards: '7 8 9', tag: '0', value: 0 },
  { cards: '10 J Q K A', tag: '−1', value: -1 }
] // mirrors engine hiLoValue — the unit suite pins those values

const DEVIATIONS = [...ILLUSTRIOUS_18, ...FAB_4]

const MYTHS = [
  {
    title: 'Third base controls the dealer',
    claim: '"A bad player at third base takes the dealer\'s bust card."',
    truth: 'The unseen card is equally likely to help or hurt — over all orderings the dealer\'s outcome distribution is identical. Lucky Lou will never believe this.',
    persona: 'lou'
  },
  {
    title: 'Hot dealers and cold shoes',
    claim: '"This dealer has been hot all night — switch tables."',
    truth: 'Cards have no memory between rounds beyond composition, and dealers make zero decisions. Streaks are what randomness looks like.',
    persona: 'lou'
  },
  {
    title: 'Insurance protects good hands',
    claim: '"Always insure a 20 — protect your hand!"',
    truth: 'Insurance is a separate bet on the hole card being a ten. With a 20 you hold two of the tens yourself — the insurance bet is even worse. Take it only at TC ≥ +3.',
    persona: 'ivan'
  },
  {
    title: 'Due to win',
    claim: '"I\'ve lost six in a row — I\'m due."',
    truth: 'Every round is drawn from the same shoe distribution. The shoe owes you nothing; expected value is the only thing that converges.',
    persona: 'lou'
  },
  {
    title: 'Never bust — let the dealer do it',
    claim: '"Never hit a hand that can break."',
    truth: 'Standing on 16 vs 10 loses ~54% of your stake; hitting loses ~41%. Refusing to bust just means losing slowly to made dealer hands. Nancy\'s leak, quantified on the Analysis page.',
    persona: 'nancy'
  }
]

const PROCEDURE = [
  { step: 'Shuffle & cut', text: 'Plug, riffle, turn, strip, cut — then a player cuts the deck stack (MA §5(k)). The cut card goes in at the penetration depth.' },
  { step: 'Burn', text: 'The first card off the new shoe is burned face down — it never plays and never joins the count (MA §6(c)).' },
  { step: 'Deal order', text: 'First base to third base, one card up each, dealer up-card, second round, dealer hole card face down (MA §6(d); WA permits an alternative order).' },
  { step: 'Peek', text: 'With an ace or ten up, the dealer checks the hole card with a reader before play continues; insurance is offered first on an ace (MA §6(i), §9).' },
  { step: 'Hand signals', text: 'Brush the felt to hit, wave flat to stand — signals must be visible to the camera, voice alone is not enough (AC guide).' },
  { step: 'Cut card out', text: 'When the cut card appears mid-shoe, the current round finishes and the shoe is reshuffled (MA §5(h), §6(k)).' },
  { step: 'Announcements', text: 'The dealer announces point totals, blackjack, bust, and "Dealer\'s card" on the reveal — this app mirrors those calls in the live region.' }
]

const GLOSSARY = [
  ['Basic strategy', 'The EV-maximizing play for every hand vs every up-card, derived from the rules — no counting involved.'],
  ['Blackjack / natural', 'Ace + ten-value as the first two cards. Pays 3:2 (or 6:5 on bad tables). A split 21 is not a blackjack.'],
  ['Bust', 'Hand total over 21 — an immediate loss, even if the dealer later busts too.'],
  ['Cut card', 'A colored card placed at the penetration depth; when it comes out, the shoe gets reshuffled.'],
  ['DAS', 'Double after split — being allowed to double a hand created by splitting. Worth about +0.14% to the player.'],
  ['Deviation', 'A count-driven departure from basic strategy (e.g. stand 16 vs 10 at TC ≥ 0).'],
  ['Even money', 'Taking 1:1 on your blackjack against a dealer ace — mathematically identical to insuring it. Book says decline.'],
  ['H17 / S17', 'Whether the dealer hits or stands on soft 17. H17 adds ≈0.2% to the house edge.'],
  ['House edge', 'Long-run cost per unit wagered playing perfect basic strategy. The setup screen shows the model estimate per rule set.'],
  ['Penetration', 'How deep the shoe is dealt before reshuffle. Deeper = better for counters.'],
  ['Push', 'A tie — the bet is returned.'],
  ['Running count', 'Sum of Hi-Lo tags over every card you have seen this shoe.'],
  ['True count', 'Running count divided by estimated decks remaining — normalizes the count to shoe depth.'],
  ['Late surrender', 'Forfeit half the bet after the dealer confirms no blackjack. Correct only on a few of the worst hands.']
]

const SIDEBET_TABLES = [
  { name: '21+3 (MA §28(f) / AC Xtreme)', pays: TWENTY_ONE_PLUS_THREE_PAYS },
  { name: 'Lucky Ladies (MA §24)', pays: LUCKY_LADIES_PAYS },
  { name: 'Buster Blackjack (MA §27)', pays: BUSTER_PAYS }
]
const MTD = MATCH_THE_DEALER_PAYS
</script>

<template>
  <main class="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Learn
    </h1>
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
    />

    <section v-if="tab === 'chart'">
      <p class="mb-3 text-xs text-neutral-400">
        Generated by the EV engine for <span class="font-semibold">{{ activeRules.name }}</span> — tap any cell for the math.
      </p>
      <StrategyChartView :rules="activeRules" />
    </section>

    <section v-else-if="tab === 'rules'">
      <RuleExplorer />
    </section>

    <section
      v-else-if="tab === 'counting'"
      class="space-y-3 text-sm text-neutral-300"
    >
      <h2 class="font-semibold text-[var(--accent-cream)]">
        Hi-Lo in three steps
      </h2>
      <table class="text-xs font-mono">
        <tbody>
          <tr
            v-for="row in HILO_ROWS"
            :key="row.tag"
          >
            <td class="pr-4 text-neutral-400">
              {{ row.cards }}
            </td>
            <td :class="row.value > 0 ? 'text-emerald-400' : row.value < 0 ? 'text-red-400' : 'text-neutral-400'">
              {{ row.tag }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="text-xs text-neutral-400">
        1) Add the tag of every card you see. 2) Divide by decks remaining (estimate the discard tray
        to the nearest half deck) — that's the true count. 3) Each true-count point above +1 is worth
        roughly half a percent to you. Example: RC +9 with 3 decks left → TC +3 → ≈1% player edge.
      </p>
      <h2 class="pt-2 font-semibold text-[var(--accent-cream)]">
        Deviations (advanced)
      </h2>
      <p class="text-xs text-neutral-400">
        The Illustrious 18 + Fab 4 — the only departures from basic strategy worth memorizing first. Insurance at TC ≥ +3 is the single most valuable line.
      </p>
      <table
        class="w-full text-xs"
        data-testid="deviation-table"
      >
        <thead>
          <tr class="text-left text-neutral-400">
            <th class="py-1">
              Play
            </th><th>Threshold</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="dev in DEVIATIONS"
            :key="dev.id"
            class="border-t border-neutral-800 text-neutral-300"
          >
            <td class="py-1">
              {{ dev.description }}
            </td>
            <td class="font-mono">
              {{ dev.minTrueCount !== undefined ? `TC ≥ ${dev.minTrueCount}` : `TC ≤ ${dev.maxTrueCount}` }}
            </td>
            <td class="capitalize">
              {{ dev.play.replace('-', ' ') }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section
      v-else-if="tab === 'sidebets'"
      class="space-y-4 text-sm"
    >
      <UAlert
        color="warning"
        variant="soft"
        title="Every table below is the official pay schedule — and every one of these bets costs several times the main game's edge."
        description="Track what they actually cost you on the Analysis page ledger."
      />
      <div
        v-for="table in SIDEBET_TABLES"
        :key="table.name"
      >
        <h2 class="font-semibold text-[var(--accent-cream)]">
          {{ table.name }}
        </h2>
        <table class="mt-1 w-full text-xs text-neutral-300">
          <tbody>
            <tr
              v-for="(pays, variant) in table.pays"
              :key="variant"
              class="border-t border-neutral-800 align-top"
            >
              <td class="py-1 pr-3 font-mono text-neutral-400">
                {{ variant }}
              </td>
              <td class="py-1">
                <span
                  v-for="(mult, outcome) in pays"
                  :key="outcome"
                  class="mr-3 inline-block"
                >{{ outcome }} <span class="font-mono text-[var(--accent-gold)]">{{ mult }}:1</span></span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <h2 class="font-semibold text-[var(--accent-cream)]">
          Match the Dealer (MA §23, deck-dependent)
        </h2>
        <table class="mt-1 w-full text-xs text-neutral-300">
          <tbody>
            <tr
              v-for="(pays, decks) in MTD"
              :key="decks"
              class="border-t border-neutral-800"
            >
              <td class="py-1 pr-3 font-mono text-neutral-400">
                {{ decks }} decks
              </td>
              <td class="py-1">
                <span
                  v-for="(mult, tier) in pays"
                  :key="tier"
                  class="mr-3 inline-block"
                >{{ tier }} <span class="font-mono text-[var(--accent-gold)]">{{ mult }}:1</span></span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section
      v-else-if="tab === 'myths'"
      class="grid gap-3 sm:grid-cols-2"
    >
      <div
        v-for="myth in MYTHS"
        :key="myth.title"
        class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
      >
        <h2 class="text-sm font-semibold text-[var(--accent-cream)]">
          {{ myth.title }}
        </h2>
        <p class="mt-1 text-xs italic text-neutral-500">
          {{ myth.claim }}
        </p>
        <p class="mt-1 text-xs text-neutral-300">
          {{ myth.truth }}
        </p>
      </div>
    </section>

    <section
      v-else-if="tab === 'procedure'"
      class="space-y-2"
    >
      <ol class="space-y-2">
        <li
          v-for="(item, i) in PROCEDURE"
          :key="item.step"
          class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm"
        >
          <span class="font-semibold text-[var(--accent-gold)]">{{ i + 1 }}. {{ item.step }}</span>
          <p class="mt-0.5 text-xs text-neutral-400">
            {{ item.text }}
          </p>
        </li>
      </ol>
      <p class="text-[11px] text-neutral-600">
        Sources: 205 CMR (Massachusetts), Bally's AC gaming guide, WA Gambling Commission rules — all in <code>docs/</code>.
      </p>
    </section>

    <section
      v-else
      class="text-sm"
    >
      <dl class="space-y-2">
        <div
          v-for="[term, def] in GLOSSARY"
          :key="term"
          class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5"
        >
          <dt class="text-xs font-semibold text-[var(--accent-cream)]">
            {{ term }}
          </dt>
          <dd class="mt-0.5 text-xs text-neutral-400">
            {{ def }}
          </dd>
        </div>
      </dl>
    </section>
  </main>
</template>
