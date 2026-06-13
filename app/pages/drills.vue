<script setup lang="ts">
const store = useBlackjackStore()
onMounted(() => {
  if (!store.sessionActive) store.restore()
})

const tabs = [
  { label: 'Strategy', value: 'flash' },
  { label: 'Counting', value: 'count' },
  { label: 'Pairs', value: 'pair' },
  { label: 'True count', value: 'tc' },
  { label: 'Deviations', value: 'quiz' },
  { label: 'Countdown', value: 'countdown' }
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
    <PairCancel v-else-if="tab === 'pair'" />
    <TrueCountDrill v-else-if="tab === 'tc'" />
    <DeckCountdown v-else-if="tab === 'countdown'" />
    <DeviationQuiz v-else />
  </main>
</template>
