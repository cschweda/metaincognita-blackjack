<script setup lang="ts">
import { computed } from 'vue'
import { formatCents } from '~/utils/format'

const props = withDefaults(defineProps<{
  amount: number // cents
  size?: 'sm' | 'md'
}>(), { size: 'md' })

// denomination → CSS custom property (family tokens in main.css)
const DENOMS: Array<{ value: number, token: string, label: string }> = [
  { value: 50000, token: 'var(--chip-orange)', label: '500' },
  { value: 10000, token: 'var(--chip-black)', label: '100' },
  { value: 2500, token: 'var(--chip-green)', label: '25' },
  { value: 500, token: 'var(--chip-red)', label: '5' },
  { value: 100, token: 'var(--chip-white)', label: '1' }
]

const chips = computed(() => {
  const out: Array<{ token: string, label: string }> = []
  let rest = props.amount
  for (const d of DENOMS) {
    while (rest >= d.value && out.length < 12) {
      out.push({ token: d.token, label: d.label })
      rest -= d.value
    }
  }
  return out
})

const dollars = computed(() => formatCents(props.amount))
const px = computed(() => (props.size === 'sm' ? 22 : 30))
</script>

<template>
  <div
    v-if="amount > 0"
    class="relative inline-flex flex-col-reverse items-center"
    role="img"
    :title="dollars"
    :aria-label="`Bet ${dollars}`"
  >
    <div
      v-for="(chip, i) in chips"
      :key="i"
      class="rounded-full border-2 border-dashed border-white/50 shadow-sm"
      :style="{
        width: `${px}px`,
        height: `${px * 0.28}px`,
        background: chip.token,
        marginTop: i === 0 ? '0' : `-${px * 0.16}px`
      }"
    />
    <span class="mt-0.5 text-[10px] font-semibold text-[var(--accent-cream)]">{{ dollars }}</span>
  </div>
</template>
