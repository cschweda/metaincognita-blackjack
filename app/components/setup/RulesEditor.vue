<script setup lang="ts">
import { computed } from 'vue'
import type { RuleSet } from '~/utils/engine/rules'
import { validateRuleSet } from '~/utils/engine/rules'
import { houseEdge } from '~/utils/engine/basicStrategy'

const rules = defineModel<RuleSet>({ required: true })
/** Hosts that render their own edge readout (RuleExplorer) turn this off. */
const props = withDefaults(defineProps<{ showEdge?: boolean }>(), { showEdge: true })

const errors = computed(() => validateRuleSet(rules.value))
const edge = computed(() =>
  props.showEdge && errors.value.length === 0 ? (houseEdge(rules.value) * 100).toFixed(2) : null)

const deckOptions = [1, 2, 4, 6, 8].map(v => ({ label: `${v} deck${v > 1 ? 's' : ''}`, value: v }))
const payoutOptions = [{ label: '3 to 2', value: '3:2' }, { label: '6 to 5', value: '6:5' }]
const doubleOptions = [
  { label: 'Any first two cards', value: 'any2' },
  { label: 'Hard 9–11 only', value: '9-11' },
  { label: 'Hard 10–11 only', value: '10-11' }
]
const splitOptions = [2, 3, 4].map(v => ({ label: `${v} hands`, value: v }))
const surrenderOptions = [{ label: 'Late surrender', value: 'late' }, { label: 'Not offered', value: 'none' }]
const spotsOptions = [7, 9].map(v => ({ label: `${v} spots`, value: v }))
</script>

<template>
  <div class="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <UFormField label="Decks">
        <USelect
          v-model="rules.decks"
          :items="deckOptions"
        />
      </UFormField>
      <UFormField label="Blackjack pays">
        <USelect
          v-model="rules.blackjackPayout"
          :items="payoutOptions"
        />
      </UFormField>
      <UFormField label="Doubling">
        <USelect
          v-model="rules.doubleOn"
          :items="doubleOptions"
        />
      </UFormField>
      <UFormField label="Max split hands">
        <USelect
          v-model="rules.maxSplitHands"
          :items="splitOptions"
        />
      </UFormField>
      <UFormField label="Surrender">
        <USelect
          v-model="rules.surrender"
          :items="surrenderOptions"
        />
      </UFormField>
      <UFormField label="Table spots">
        <USelect
          v-model="rules.spots"
          :items="spotsOptions"
        />
      </UFormField>
    </div>
    <div class="flex flex-wrap gap-x-6 gap-y-2">
      <USwitch
        v-model="rules.dealerHitsSoft17"
        label="Dealer hits soft 17 (H17)"
      />
      <USwitch
        v-model="rules.doubleAfterSplit"
        label="Double after split"
      />
      <USwitch
        v-model="rules.resplitAces"
        label="Resplit aces"
      />
      <USwitch
        v-model="rules.insurance"
        label="Insurance"
      />
      <USwitch
        v-model="rules.evenMoneyOffered"
        label="Even money"
      />
      <USwitch
        v-model="rules.dealerPeek"
        label="Dealer peeks for blackjack"
      />
      <USwitch
        v-model="rules.fiveCard21Pays2to1"
        label="Five-card 21 pays 2:1 (MA §16)"
      />
    </div>
    <UFormField :label="`Penetration — cut card at ${Math.round(rules.penetration * 100)}%`">
      <USlider
        v-model="rules.penetration"
        :min="0.5"
        :max="0.9"
        :step="0.05"
      />
    </UFormField>
    <p
      v-if="!rules.dealerPeek"
      class="text-xs text-amber-400"
    >
      No-peek here is NOT European no-hole-card: the dealer still takes (and uses) a hole card;
      doubles and splits lose in full to a dealer blackjack.
    </p>
    <ul
      v-if="errors.length"
      class="space-y-1 text-xs text-red-400"
    >
      <li
        v-for="error in errors"
        :key="error"
      >
        • {{ error }}
      </li>
    </ul>
    <p
      v-else-if="edge"
      class="text-xs text-neutral-400"
    >
      House edge ≈{{ edge }}% (model estimate)
    </p>
  </div>
</template>
