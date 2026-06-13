#!/usr/bin/env bash
# Kill this project's running dev server(s), clear build/dev caches, start fresh.
# Scoped to THIS repo on purpose — sibling metaincognita projects often run their own
# dev servers (e.g. slots on :3000) and must not be touched. Nuxt picks the next free
# port by itself; pass flags through if you want one: ./start-dev-server.sh --port 3010
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# ── 1. kill any dev server belonging to this repo ────────────────────────────
# The `nuxt dev` PARENT (which owns the listening socket) is spawned with a RELATIVE
# argv (`node ./node_modules/...`), so argv matching misses it and leaves half-dead
# zombies holding ports. Identify servers by what cannot lie: processes LISTENING on
# a TCP port whose working directory is this repo — plus any argv stragglers (workers
# carry the absolute node_modules path).
repo_server_pids() {
  {
    for pid in $(lsof -ti tcp -s tcp:LISTEN 2>/dev/null | sort -u); do
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { print substr($0, 2); exit }')"
      [ "$cwd" = "$PROJECT_DIR" ] && echo "$pid"
    done
    pgrep -f "${PROJECT_DIR}/node_modules/.*nuxt" 2>/dev/null || true
  } | sort -u
}

PIDS="$(repo_server_pids)"
if [ -n "$PIDS" ]; then
  echo "Stopping existing dev server(s) for this repo (pid(s): $(echo "$PIDS" | tr '\n' ' '))"
  echo "$PIDS" | xargs kill 2>/dev/null || true
  # poll for exit so ports are actually released, escalate to KILL if anything lingers
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ -z "$(repo_server_pids)" ] && break
    sleep 0.5
  done
  REMAINING="$(repo_server_pids)"
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
