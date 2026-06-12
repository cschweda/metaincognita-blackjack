<script setup lang="ts">
const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const tabs = [
  { label: 'Strategy flash', value: 'flash' },
  { label: 'Count the cards', value: 'count' },
  { label: 'True count', value: 'tc' },
  { label: 'Deviations', value: 'quiz' }
]
const tab = ref('flash')
</script>

<template>
  <main class="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto p-4 pb-10">
    <h1 class="pt-2 text-xl font-bold text-[var(--accent-cream)]">
      Drills
    </h1>
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
    />
    <StrategyFlash v-if="tab === 'flash'" />
    <CountDrill v-else-if="tab === 'count'" />
    <TrueCountDrill v-else-if="tab === 'tc'" />
    <DeviationQuiz v-else />
  </main>
</template>
