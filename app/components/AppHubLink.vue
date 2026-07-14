<!-- The suite's exit door: back to the floor at metaincognita.com, where every
     Metaincognita game lives. Nine games hung off that hub and not one linked home.

     This is suite chrome, not game chrome (guidelines §5) — it is deliberately gold
     on the Tailwind amber scale in all nine apps rather than taking a per-game accent,
     so a player learns the door once and finds it everywhere.

     Three things here are load-bearing, not stylistic:
       - No `target` — this is an exit, not a side trip. A new tab would leave the
         trainer running behind it.
       - Never gated, never confirmed. It is NOT "Leave table", which really does end
         a session and keeps its confirmation. This one destroys nothing, and the whole
         point of it is that a player can always get out.
       - The aria-label must CONTAIN the visible wordmark verbatim, or it fails WCAG
         2.5.3 Label in Name — "Meta Incognita" reads fine and breaks on the space. -->
<template>
  <a
    href="https://metaincognita.com"
    aria-label="METAINCOGNITA — exit the simulator, back to all the games"
    data-testid="hub-link"
    class="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-amber-400 transition-colors hover:border-amber-400/60 hover:bg-amber-500/10 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
  >
    <UIcon
      name="i-lucide-log-out"
      class="h-3.5 w-3.5"
      aria-hidden="true"
    />
    <span class="text-[10px] font-semibold tracking-[0.12em]">METAINCOGNITA</span>
  </a>
</template>
