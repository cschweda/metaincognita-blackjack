#!/usr/bin/env bash
# Kill this project's running dev server (if any), clear build/dev caches, start fresh.
# Scoped to THIS repo on purpose — sibling metaincognita projects often run their own
# dev servers (e.g. slots on :3000) and must not be touched. Nuxt picks the next free
# port by itself; pass flags through if you want one: ./start-dev-server.sh --port 3010
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# ── 1. kill any dev server started from this repo ────────────────────────────
# `pnpm dev` / `nuxt dev` processes carry this repo's node_modules path in argv,
# which is what we match — never a bare "nuxt dev" (too broad).
PIDS="$(pgrep -f "${PROJECT_DIR}/node_modules/.*nuxt" || true)"
if [ -n "$PIDS" ]; then
  echo "Stopping existing dev server (pid(s): $(echo "$PIDS" | tr '\n' ' '))"
  # TERM first; poll for exit so the port is actually released, escalate to KILL if needed
  echo "$PIDS" | xargs kill 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -f "${PROJECT_DIR}/node_modules/.*nuxt" >/dev/null 2>&1 || break
    sleep 0.5
  done
  REMAINING="$(pgrep -f "${PROJECT_DIR}/node_modules/.*nuxt" || true)"
  if [ -n "$REMAINING" ]; then
    echo "$REMAINING" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
else
  echo "No existing dev server found for this project."
fi

# ── 2. clear caches and build output ─────────────────────────────────────────
echo "Clearing caches (.nuxt, .output, dist, node_modules/.vite, node_modules/.cache)"
rm -rf .nuxt .output dist node_modules/.vite node_modules/.cache

# ── 3. start fresh ───────────────────────────────────────────────────────────
echo "Starting dev server…"
exec pnpm exec nuxt dev "$@"
