<script setup lang="ts">
defineProps<{
  label: string
  stake: number // cents
  result?: { label: string, net: number } | null
  active?: boolean
}>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex flex-col items-center gap-1 rounded-full transition-transform"
    :class="active ? 'scale-110' : 'hover:scale-105'"
    :aria-label="`${label} bet circle`"
    @click="$emit('select')"
  >
    <span
      class="flex h-14 w-14 items-center justify-center rounded-full border-2 text-[9px] uppercase tracking-wide"
      :class="active ? 'border-[var(--accent-gold)] text-[var(--accent-gold)]' : 'border-[var(--accent-cream)]/40 text-[var(--accent-cream)]/70'"
      :style="{ background: 'var(--felt-green)' }"
    >
      <ChipStack
        v-if="stake > 0"
        :amount="stake"
        size="sm"
      />
      <span v-else>{{ label }}</span>
    </span>
    <span
      v-if="result"
      class="rounded px-1.5 py-0.5 text-[10px] font-bold"
      :class="result.net > 0 ? 'bg-emerald-700 text-emerald-100' : result.net < 0 ? 'bg-red-900 text-red-200' : 'bg-neutral-700 text-neutral-200'"
    >
      {{ result.net > 0 ? `+$${(result.net / 100).toLocaleString()}` : result.net < 0 ? `-$${(-result.net / 100).toLocaleString()}` : 'PUSH' }}
    </span>
  </button>
</template>
