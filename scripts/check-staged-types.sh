#!/bin/bash

# TypeScript-check ONLY the workspaces that have staged TS files.
# Full project context per workspace, but untouched workspaces don't slow the commit.

set -e

WORKSPACES=(contracts services/pricing services/betting services/simulator apps/punter-web apps/trader-ops bots)

STAGED_TS=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' || true)

if [[ -z "$STAGED_TS" ]]; then
  echo "✅ No TypeScript files staged. Skipping type check."
  exit 0
fi

FAILED=()
for ws in "${WORKSPACES[@]}"; do
  if echo "$STAGED_TS" | grep -q "^${ws}/"; then
    echo "🔍 Typechecking ${ws}..."
    if ! npm run typecheck -w "$ws"; then
      FAILED+=("$ws")
    fi
  fi
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo ""
  echo "❌ Type errors in: ${FAILED[*]}"
  echo "💡 Run 'npm run typecheck' for details"
  exit 1
fi

echo "✅ TypeScript clean in all touched workspaces."
