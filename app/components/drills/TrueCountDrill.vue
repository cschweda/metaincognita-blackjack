<script setup lang="ts">
const props = withDefaults(defineProps<{
  rng?: () => number
}>(), { rng: () => Math.random() })

interface Question {
  rc: number
  decksRemaining: number // half-deck steps, 0.5–6
  decksTotal: number
}

function makeQuestion(): Question {
  const rc = Math.floor(props.rng() * 25) - 12 // −12..+12
  const decksTotal = 6
  const decksRemaining = 0.5 + Math.round(props.rng() * 11) * 0.5 // 0.5..6.0
  return { rc, decksRemaining, decksTotal }
}

const question = ref<Question>(makeQuestion())
const entered = ref<number | null>(null)
const verdict = ref<{ correct: boolean, actual: number } | null>(null)
const { streak, best, grade } = useDrillStreak('true-count')
const { srText, focusEl, announce, clear } = useDrillFeedback()

const verdictText = computed(() => verdict.value
  ? `${verdict.value.correct ? '✓' : '✗'} TC = ${question.value.rc} ÷ ${question.value.decksRemaining} = ${verdict.value.actual.toFixed(1)}`
  : '')

const trayPct = computed(() =>
  Math.round(((question.value.decksTotal - question.value.decksRemaining) / question.value.decksTotal) * 100))

function submit(): void {
  if (entered.value === null || Number.isNaN(entered.value)) return
  const actual = question.value.rc / question.value.decksRemaining
  const correct = Math.abs(entered.value - actual) <= 0.5
  verdict.value = { correct, actual }
  grade(correct)
  announce(verdictText.value)
}

function next(): void {
  clear()
  question.value = makeQuestion()
  entered.value = null
  verdict.value = null
}
</script>

<template>
  <div class="space-y-3">
    <p
      class="sr-only"
      role="status"
      data-testid="tc-sr"
    >
      {{ srText }}
    </p>
    <DrillScoreHeader
      :streak="streak"
      :best="best"
    />

    <div
      class="flex items-center justify-center gap-6"
      data-testid="tc-question"
    >
      <div class="text-center">
        <p class="text-[10px] uppercase text-neutral-400">
          Running count
        </p>
        <p class="font-mono text-2xl font-bold text-[var(--accent-cream)]">
          {{ question.rc > 0 ? '+' : '' }}{{ question.rc }}
        </p>
      </div>
      <div class="text-center">
        <p class="mb-1 text-[10px] uppercase text-neutral-400">
          Discard tray ({{ question.decksTotal }} decks)
        </p>
        <div class="relative mx-auto h-20 w-10 overflow-hidden rounded border border-[var(--rail-walnut)] bg-black/40">
          <div
            class="absolute inset-x-0 bottom-0 bg-neutral-200/70"
            :style="{ height: `${trayPct}%` }"
          />
        </div>
        <p class="mt-1 text-[10px] text-neutral-400">
          {{ question.decksRemaining }} decks left
        </p>
      </div>
    </div>

    <div
      v-if="!verdict"
      class="flex items-center justify-center gap-2"
    >
      <UInput
        v-model.number="entered"
        type="number"
        step="0.5"
        size="sm"
        placeholder="True count?"
        data-testid="tc-answer"
        @keydown.enter="submit"
      />
      <UButton
        color="primary"
        size="sm"
        data-testid="tc-submit"
        @click="submit"
      >
        Check
      </UButton>
    </div>

    <div
      v-else
      class="text-center"
      data-testid="tc-verdict"
    >
      <p
        class="text-sm font-semibold"
        :class="verdict.correct ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ verdictText }}
      </p>
      <UButton
        ref="focusEl"
        class="mt-2"
        color="neutral"
        variant="soft"
        size="sm"
        data-testid="tc-next"
        @click="next"
      >
        Next
      </UButton>
    </div>
  </div>
</template>
