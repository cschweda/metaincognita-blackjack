<script setup lang="ts">
defineProps<{
  streak: number
  best: number
}>()
</script>

<template>
  <div class="flex items-center justify-between text-xs text-neutral-400">
    <span>Streak: <span class="font-mono font-bold text-[var(--accent-gold)]">{{ streak }}</span></span>
    <span>Best: <span class="font-mono">{{ best }}</span></span>
  </div>
</template>
