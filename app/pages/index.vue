<script setup lang="ts">
import { PRESETS, cloneRules, validateRuleSet } from '~/utils/engine/rules'
import type { PersonaId } from '~/utils/engine/bots'
import type { PlayMode, PlaySpeed, AdvisorIntensity, CountVisibility } from '~/stores/useBlackjackStore'

const store = useBlackjackStore()
const { startSession, restoreSession } = useGameLoop()
const router = useRouter()
const route = useRoute()
const urlSeed = computed(() => {
  const raw = Number(route.query.seed)
  return Number.isFinite(raw) && raw > 0 ? raw : undefined
})

const presetKey = ref('VEGAS_STRIP_6D')
const customRules = ref(cloneRules(PRESETS.CUSTOM!))
const botIds = ref<PersonaId[]>([])
const mode = ref<PlayMode>('casino')
const speed = ref<PlaySpeed>('normal')
const flair = ref(true)
const bankrollChoice = ref(50_000)

const advisor = ref<AdvisorIntensity>('coach')
const countVisibility = ref<CountVisibility>('self-check')
const advancedDeviations = ref(false)

const advisorOptions = [
  { label: 'Coach — tell me before I act', value: 'coach' },
  { label: 'Feedback — grade me after', value: 'feedback' },
  { label: 'Exam — grade silently', value: 'exam' }
]
const countOptions = [
  { label: 'Shown — RC/TC on screen', value: 'shown' },
  { label: 'Self-check — press C to verify', value: 'self-check' },
  { label: 'Off', value: 'off' }
]

const bankrollOptions = [20_000, 50_000, 100_000, 500_000]
  .map(v => ({ label: `$${(v / 100).toLocaleString()}`, value: v }))

const activeRules = computed(() =>
  presetKey.value === 'CUSTOM' ? customRules.value : PRESETS[presetKey.value]!)
const maxBots = computed(() => Math.min(5, activeRules.value.spots - 1))
const rulesValid = computed(() => validateRuleSet(activeRules.value).length === 0)

const hasSavedSession = ref(false)
onMounted(() => {
  // a session already restored by another page still deserves the Resume banner —
  // otherwise the setup form invites silently overwriting it
  hasSavedSession.value = store.sessionActive || store.restore()
})

function resumeSession(): void {
  if (restoreSession()) router.push('/table')
}

function start(): void {
  if (!rulesValid.value) return
  const trimmedBots = botIds.value.slice(0, maxBots.value)
  startSession({
    rules: cloneRules(activeRules.value),
    mode: mode.value,
    speed: speed.value,
    flair: flair.value,
    botIds: trimmedBots,
    advisor: advisor.value,
    count: countVisibility.value,
    advancedDeviations: countVisibility.value === 'off' ? false : advancedDeviations.value
  }, bankrollChoice.value, urlSeed.value)
  router.push('/table')
}
</script>

<template>
  <main class="mx-auto w-full max-w-4xl flex-1 space-y-6 overflow-y-auto p-4 pb-10">
    <header class="pt-4 text-center">
      <h1
        class="text-3xl font-bold"
        style="color: var(--accent-gold)"
      >
        Blackjack Trainer
      </h1>
      <p class="mt-1 text-sm text-neutral-400">
        Authentic rules from official gaming-commission documents
      </p>
    </header>

    <UAlert
      v-if="hasSavedSession"
      color="primary"
      variant="soft"
      title="Session in progress"
      description="You have a saved table — resume where you left off?"
      data-testid="resume-banner"
      :actions="[{ label: 'Resume', onClick: resumeSession }]"
    />

    <section>
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Table rules
      </h2>
      <PresetPicker v-model="presetKey" />
      <div
        v-if="presetKey === 'CUSTOM'"
        class="mt-3"
      >
        <RulesEditor v-model="customRules" />
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Table companions
      </h2>
      <BotPicker
        v-model="botIds"
        :max="maxBots"
      />
    </section>

    <section>
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Training
      </h2>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Advisor">
          <USelect
            v-model="advisor"
            :items="advisorOptions"
            data-testid="advisor-select"
          />
        </UFormField>
        <UFormField label="Card counting">
          <USelect
            v-model="countVisibility"
            :items="countOptions"
            data-testid="count-select"
          />
        </UFormField>
        <UFormField
          v-if="countVisibility !== 'off'"
          label="Count deviations"
        >
          <USwitch
            v-model="advancedDeviations"
            label="Illustrious 18 + Fab 4 (advanced)"
            data-testid="advanced-switch"
          />
        </UFormField>
      </div>
    </section>

    <section class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Bankroll">
        <USelect
          v-model="bankrollChoice"
          :items="bankrollOptions"
          data-testid="bankroll"
        />
      </UFormField>
      <UFormField label="Presentation">
        <USelect
          v-model="mode"
          :items="[{ label: 'Casino procedure (paced)', value: 'casino' }, { label: 'Quick play (instant)', value: 'quick' }]"
        />
      </UFormField>
      <UFormField
        v-if="mode === 'casino'"
        label="Dealing speed"
      >
        <USelect
          v-model="speed"
          :items="[{ label: 'Relaxed', value: 'relaxed' }, { label: 'Normal', value: 'normal' }, { label: 'Brisk', value: 'brisk' }]"
        />
      </UFormField>
    </section>
    <div class="flex items-center justify-between">
      <USwitch
        v-model="flair"
        label="Table talk & flair"
      />
      <UButton
        size="xl"
        color="primary"
        :disabled="!rulesValid"
        data-testid="start"
        @click="start"
      >
        Take a seat
      </UButton>
    </div>
  </main>
</template>
