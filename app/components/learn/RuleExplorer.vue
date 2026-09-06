<script setup lang="ts">
import { PRESETS, cloneRules, validateRuleSet } from '~/utils/engine/rules'
import { edgeResolution, houseEdge } from '~/utils/engine/basicStrategy'
import { formatHouseEdge } from '~/utils/format'

const draft = ref(cloneRules(PRESETS.VEGAS_STRIP_6D!))
const baseline = houseEdge(PRESETS.VEGAS_STRIP_6D!)

const valid = computed(() => validateRuleSet(draft.value).length === 0)
const edge = computed(() => valid.value ? houseEdge(draft.value) : null)
/** The delta is only meaningful when BOTH edges are resolvable and the gap clears the model's own
 *  resolution. The header could otherwise read "~even" while the chip beside it asserted a precise
 *  half-point swing in emerald — 0.15pp of which was the artifact the band exists to hide
 *  (round-four review). The old gate was an unrelated 0.005 literal. */
/**
 * A delta is only meaningful when BOTH edges are resolvable AND the gap between them clears the
 * model's resolution. An earlier cut checked only the second condition, so at one deck the header
 * read "House edge ~even" while the chip beside it asserted "(−0.55 vs baseline)" in emerald — one
 * line refusing to name a sign next to a number claiming a precise half-point swing, ~0.15pp of
 * which is the model artifact the band exists to hide (round-five review).
 */
const delta = computed(() => {
  if (edge.value === null) return null
  const draftResolution = edgeResolution(draft.value)
  const baseResolution = edgeResolution(PRESETS.VEGAS_STRIP_6D!)
  // if either endpoint is inside its own band, their difference is not a number worth printing
  if (Math.abs(edge.value) < draftResolution || Math.abs(baseline) < baseResolution) return null
  const gap = edge.value - baseline
  return Math.abs(gap) < Math.max(draftResolution, baseResolution) ? null : gap * 100
})

function reset(): void {
  draft.value = cloneRules(PRESETS.VEGAS_STRIP_6D!)
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs text-neutral-400">
      Toggle a rule, watch the edge move. Baseline: Vegas Strip 6-deck ({{ (baseline * 100).toFixed(2) }}%).
    </p>
    <RulesEditor
      v-model="draft"
      :show-edge="false"
    />
    <div class="flex items-center gap-3">
      <p
        v-if="edge !== null"
        class="text-sm font-semibold text-[var(--accent-cream)]"
        data-testid="explorer-edge"
      >
        House edge ≈{{ formatHouseEdge(edge, edgeResolution(draft)) }}
        <span
          v-if="delta !== null"
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
