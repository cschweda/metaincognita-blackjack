<script setup lang="ts">
import { PRESETS, cloneRules, validateRuleSet } from '~/utils/engine/rules'
import { houseEdge } from '~/utils/engine/basicStrategy'

const draft = ref(cloneRules(PRESETS.VEGAS_STRIP_6D!))
const baseline = houseEdge(PRESETS.VEGAS_STRIP_6D!)

const valid = computed(() => validateRuleSet(draft.value).length === 0)
const edge = computed(() => valid.value ? houseEdge(draft.value) : null)
const delta = computed(() => edge.value === null ? null : (edge.value - baseline) * 100)

function reset(): void {
  draft.value = cloneRules(PRESETS.VEGAS_STRIP_6D!)
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs text-neutral-400">
      Toggle a rule, watch the edge move. Baseline: Vegas Strip 6-deck ({{ (baseline * 100).toFixed(2) }}%).
    </p>
    <RulesEditor v-model="draft" />
    <div class="flex items-center gap-3">
      <p
        v-if="edge !== null"
        class="text-sm font-semibold text-[var(--accent-cream)]"
        data-testid="explorer-edge"
      >
        House edge ≈{{ (edge * 100).toFixed(2) }}%
        <span
          v-if="delta !== null && Math.abs(delta) >= 0.005"
          :class="delta > 0 ? 'text-red-400' : 'text-emerald-400'"
        >({{ delta > 0 ? '+' : '' }}{{ delta.toFixed(2) }} vs baseline)</span>
      </p>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        @click="reset"
      >
        Reset
      </UButton>
    </div>
  </div>
</template>
