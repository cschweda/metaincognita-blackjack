import { nextTick, ref } from 'vue'
import type { Ref } from 'vue'

type FocusTarget = HTMLElement | { $el?: HTMLElement } | null

/** Drill verdict feedback (WCAG 4.1.3): each drill renders ONE persistent sr-only
 *  role="status" region bound to srText — a region that mounts already containing its
 *  message is unreliably announced, so the node persists and only the text changes.
 *  announce() also hands focus to the Next/Again button: the answered button unmounts
 *  with the v-if swap, and without the hand-off focus falls to <body>. */
export function useDrillFeedback(): {
  srText: Ref<string>
  focusEl: Ref<FocusTarget>
  announce: (text: string) => void
  clear: () => void
} {
  const srText = ref('')
  const focusEl = ref<FocusTarget>(null)

  function announce(text: string): void {
    srText.value = text
    void nextTick(() => {
      const target = focusEl.value
      const el = (target as { $el?: HTMLElement } | null)?.$el ?? (target as HTMLElement | null)
      el?.focus?.()
    })
  }

  function clear(): void {
    srText.value = ''
  }

  return { srText, focusEl, announce, clear }
}
