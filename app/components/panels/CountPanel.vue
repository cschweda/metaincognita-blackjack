<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCounting } from '~/composables/useCounting'

const store = useBlackjackStore()
const counting = useCounting()

const visibility = computed(() => store.settings?.count ?? 'off')
const checkInput = ref<number | null>(null)
const quizInput = ref<number | null>(null)
const inputEl = ref<{ inputRef?: HTMLInputElement } | null>(null)

function submitCheck(): void {
  if (checkInput.value === null || Number.isNaN(checkInput.value)) return
  counting.checkCount(checkInput.value)
  checkInput.value = null
}

function submitQuiz(): void {
  if (quizInput.value === null || Number.isNaN(quizInput.value)) return
  counting.answerShuffleQuiz(quizInput.value)
  quizInput.value = null
}

const open = ref(true) // collapsible (spec §6)

function focusCheck(): void {
  open.value = true
  if (inputEl.value?.inputRef) {
    inputEl.value.inputRef.focus()
  } else {
    // UInput spreads attrs onto the native input — the testid IS the input element
    document.querySelector<HTMLInputElement>('[data-testid="count-input"]')?.focus()
  }
}

defineExpose({ focusCheck })
</script>

<template>
  <div
    v-if="visibility !== 'off'"
    class="rounded-lg border border-neutral-800 bg-neutral-950/85 p-2.5 text-xs backdrop-blur"
  >
    <button
      type="button"
      class="mb-1.5 flex w-full items-center justify-between font-semibold uppercase tracking-wide text-neutral-400"
      :aria-expanded="open"
      data-testid="count-toggle"
      @click="open = !open"
    >
      Hi-Lo Count
      <UIcon
        :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="h-3 w-3"
      />
    </button>

    <div v-show="open">
      <div
        v-if="visibility === 'shown'"
        class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-neutral-300"
        data-testid="count-values"
      >
        <span>RC</span><span class="text-right text-[var(--accent-cream)]">{{ counting.rc.value > 0 ? '+' : '' }}{{ counting.rc.value }}</span>
        <span>TC</span><span class="text-right text-[var(--accent-cream)]">{{ counting.tc.value.toFixed(1) }}</span>
        <span>Decks left</span><span class="text-right">{{ counting.decksRemaining.value.toFixed(1) }}</span>
        <span>Edge est.</span><span class="text-right">{{ (counting.advantage.value * 100).toFixed(2) }}%</span>
      </div>

      <div v-else>
        <p class="text-neutral-400">
          Count hidden — keep it in your head, press <kbd class="rounded bg-neutral-800 px-1">C</kbd> to check.
        </p>
        <div class="mt-1.5 flex items-center gap-1.5">
          <UInput
            ref="inputEl"
            v-model.number="checkInput"
            type="number"
            size="xs"
            placeholder="RC?"
            data-testid="count-input"
            @keydown.enter="submitCheck"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            data-testid="count-check"
            @click="submitCheck"
          >
            Check
          </UButton>
        </div>
        <p
          v-if="counting.lastCheck.value"
          class="mt-1"
          :class="counting.lastCheck.value.correct ? 'text-emerald-400' : 'text-red-400'"
          data-testid="count-verdict"
        >
          {{ counting.lastCheck.value.correct
            ? `✓ RC is ${counting.lastCheck.value.actual}`
            : `✗ you said ${counting.lastCheck.value.entered} — RC was ${counting.lastCheck.value.actual}` }}
        </p>
      </div>

      <div
        v-if="counting.shuffleQuiz.value"
        class="mt-2 rounded bg-sky-950/60 p-1.5"
        data-testid="shuffle-quiz"
      >
        <p class="text-sky-300">
          Shoe shuffled — what was the final RC?
        </p>
        <div class="mt-1 flex items-center gap-1.5">
          <UInput
            v-model.number="quizInput"
            type="number"
            size="xs"
            data-testid="shuffle-quiz-input"
            @keydown.enter="submitQuiz"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            data-testid="shuffle-quiz-submit"
            @click="submitQuiz"
          >
            Answer
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
