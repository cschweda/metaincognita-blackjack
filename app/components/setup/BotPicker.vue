<script setup lang="ts">
import { PERSONAS } from '~/utils/engine/bots'
import type { PersonaId } from '~/utils/engine/bots'

const selected = defineModel<PersonaId[]>({ required: true })
const props = defineProps<{ max: number }>()

function toggle(id: PersonaId): void {
  if (selected.value.includes(id)) selected.value = selected.value.filter(x => x !== id)
  else if (selected.value.length < props.max) selected.value = [...selected.value, id]
}
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    <button
      v-for="persona in PERSONAS"
      :key="persona.id"
      type="button"
      class="rounded-lg border p-3 text-left transition-colors disabled:opacity-50"
      :class="selected.includes(persona.id) ? 'border-[var(--accent-gold)] bg-neutral-900' : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-600'"
      :aria-pressed="selected.includes(persona.id)"
      :disabled="!selected.includes(persona.id) && selected.length >= max"
      :data-testid="`bot-${persona.id}`"
      @click="toggle(persona.id)"
    >
      <div class="flex items-center gap-2">
        <UIcon
          name="i-lucide-bot"
          class="h-4 w-4 text-neutral-400"
        />
        <span class="font-semibold text-neutral-100">{{ persona.name }}</span>
      </div>
      <p class="mt-1 text-[11px] leading-snug text-neutral-400">
        {{ persona.flavor }}
      </p>
    </button>
  </div>
  <p class="mt-1 text-[11px] text-neutral-400">
    {{ selected.length }}/{{ max }} seats filled — more players = more visible cards per round
  </p>
</template>
