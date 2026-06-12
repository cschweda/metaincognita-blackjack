<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const store = useBlackjackStore()
const { endSession } = useGameLoop()

const isSetup = computed(() => route.path === '/')
const onTable = computed(() => route.path === '/table')
const showLeaveConfirm = ref(false)
const version = '0.2.0'

const NAV = [
  { to: '/history', label: 'History', icon: 'i-lucide-scroll-text' },
  { to: '/analysis', label: 'Analysis', icon: 'i-lucide-bar-chart-3' },
  { to: '/learn', label: 'Learn', icon: 'i-lucide-book-open' },
  { to: '/drills', label: 'Drills', icon: 'i-lucide-target' }
]

function handleBack() {
  showLeaveConfirm.value = true
}

function confirmLeave() {
  endSession()
  showLeaveConfirm.value = false
  router.push('/')
}

function subPageBack() {
  navigateTo(store.sessionActive ? '/table' : '/')
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-neutral-950">
    <nav class="z-50 flex h-9 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3">
      <div class="flex items-center gap-2">
        <button
          v-if="onTable"
          class="flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          @click="handleBack"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="h-3.5 w-3.5"
          />
          <span>Leave table</span>
        </button>
        <button
          v-else-if="!isSetup"
          class="flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          data-testid="back-to-table"
          @click="subPageBack"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="h-3.5 w-3.5"
          />
          <span>{{ store.sessionActive ? 'Table' : 'Setup' }}</span>
        </button>
        <span
          v-else
          class="select-none text-xs text-neutral-600"
        >
          <span class="text-[var(--accent-gold)]/70">Blackjack</span> Trainer
        </span>
      </div>
      <div
        v-if="store.sessionActive && !isSetup"
        class="flex items-center gap-2 text-xs text-neutral-400"
      >
        <span>Bankroll</span>
        <span class="font-mono font-semibold text-[var(--accent-cream)]">${{ (store.bankroll / 100).toLocaleString() }}</span>
      </div>
    </nav>

    <div class="flex min-h-0 flex-1 flex-col">
      <slot />
    </div>

    <nav class="z-50 flex h-9 shrink-0 items-center justify-between border-t border-neutral-800 bg-neutral-900 px-3">
      <div class="flex items-center gap-3">
        <button
          v-for="link in NAV"
          :key="link.to"
          class="flex items-center gap-1.5 text-xs transition-colors"
          :class="route.path === link.to ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'"
          :aria-current="route.path === link.to ? 'page' : undefined"
          :data-testid="`nav-${link.label.toLowerCase()}`"
          @click="navigateTo(link.to)"
        >
          <UIcon
            :name="link.icon"
            class="h-3.5 w-3.5"
          />
          <span class="hidden sm:inline">{{ link.label }}</span>
        </button>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-[10px] text-neutral-600">v{{ version }} — training simulator; no real-money play</span>
        <a
          href="https://github.com/cschweda/metaincognita-blackjack"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <UIcon
            name="i-simple-icons-github"
            class="h-3.5 w-3.5"
          />
          <span>GitHub</span>
        </a>
      </div>
    </nav>

    <UModal
      v-model:open="showLeaveConfirm"
      title="Leave the table?"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p class="text-sm text-neutral-400">
          Leaving ends the session: bankroll, history, and the current round are cleared.
        </p>
      </template>
      <template #footer>
        <UButton
          variant="outline"
          color="neutral"
          label="Stay"
          @click="showLeaveConfirm = false"
        />
        <UButton
          color="error"
          label="Leave table"
          @click="confirmLeave"
        />
      </template>
    </UModal>
  </div>
</template>
