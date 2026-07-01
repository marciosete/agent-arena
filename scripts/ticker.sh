#!/bin/bash

# Live build telemetry for the big screen: what has the fleet shipped so far?
# Usage: ./scripts/ticker.sh [refresh-seconds]

INTERVAL="${1:-10}"
SRC_DIRS=(apps services contracts bots sim)

count_files() {
  find "${SRC_DIRS[@]}" \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/coverage/*' \
    2>/dev/null | wc -l | tr -d ' '
}

count_loc() {
  find "${SRC_DIRS[@]}" \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/coverage/*' \
    -print0 2>/dev/null | xargs -0 cat 2>/dev/null | wc -l | tr -d ' '
}

count_tests() {
  find "${SRC_DIRS[@]}" \( -name '*.test.ts' -o -name '*.test.tsx' \) \
    -not -path '*/node_modules/*' -print0 2>/dev/null |
    xargs -0 grep -hE '^[[:space:]]*(it|test)\(' 2>/dev/null | wc -l | tr -d ' '
}

while true; do
  clear
  echo "  ═══════════════════════════════════════════════════"
  echo "        ⚽  AGENT ARENA — BUILD TELEMETRY  🏆"
  echo "  ═══════════════════════════════════════════════════"
  echo ""
  printf "     TypeScript files      %6s\n" "$(count_files)"
  printf "     Lines of code         %6s\n" "$(count_loc)"
  printf "     Tests written         %6s\n" "$(count_tests)"
  printf "     Commits on main       %6s\n" "$(git rev-list --count HEAD 2>/dev/null || echo 0)"
  printf "     Last checkpoint       %6s\n" "$(git describe --tags --abbrev=0 2>/dev/null || echo '—')"
  echo ""
  echo "     One engineer. A fleet of agents. $(date '+%H:%M:%S')"
  echo ""
  sleep "$INTERVAL"
done
