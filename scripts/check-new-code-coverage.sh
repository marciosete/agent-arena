#!/bin/bash

# Check test coverage on STAGED source files only (≥85% required), per workspace.
# Existing untouched code is not penalised — only what you're committing.

set -e

THRESHOLD=85
WORKSPACES=(contracts services/pricing services/betting services/simulator apps/punter-web apps/trader-ops bots)

echo "🔍 Checking test coverage on changed files (≥${THRESHOLD}% required)..."

STAGED_FILES=$(git diff --cached --name-only --diff-filter=AMR | grep -E '\.(ts|tsx)$' |
  grep -v '\.test\.' |
  grep -v '\.spec\.' |
  grep -v '__tests__' |
  grep -v '\.d\.ts$' |
  grep -v '\.config\.' |
  grep -v '\.setup\.' |
  grep -v '/index\.ts$' |
  grep -v '/main\.ts$' |
  grep -v '/main\.tsx$' |
  grep -v '^scripts/' || true)

if [[ -z "$STAGED_FILES" ]]; then
  echo "✅ No coverable source files staged. Skipping coverage check."
  exit 0
fi

FAILED_WORKSPACES=()

for ws in "${WORKSPACES[@]}"; do
  WS_FILES=$(echo "$STAGED_FILES" | grep "^${ws}/" || true)
  if [[ -z "$WS_FILES" ]]; then
    continue
  fi

  INCLUDE_ARGS=()
  while IFS= read -r file; do
    if [[ -n "$file" ]]; then
      INCLUDE_ARGS+=("--coverage.include=${file#"${ws}"/}")
    fi
  done <<<"$WS_FILES"

  FILE_COUNT=${#INCLUDE_ARGS[@]}
  echo ""
  echo "📈 ${ws}: checking coverage on ${FILE_COUNT} changed file(s)..."

  if ! (cd "$ws" && npx vitest run \
    --coverage.enabled=true \
    "${INCLUDE_ARGS[@]}" \
    "--coverage.thresholds.lines=${THRESHOLD}" \
    "--coverage.thresholds.functions=${THRESHOLD}" \
    "--coverage.thresholds.branches=${THRESHOLD}" \
    "--coverage.thresholds.statements=${THRESHOLD}" \
    --passWithNoTests); then
    FAILED_WORKSPACES+=("$ws")
  fi
done

if [[ ${#FAILED_WORKSPACES[@]} -gt 0 ]]; then
  echo ""
  echo "❌ New code coverage: FAILED (≥${THRESHOLD}% required) in: ${FAILED_WORKSPACES[*]}"
  echo "   Add tests for your changed files."
  exit 1
fi

echo ""
echo "✅ New code coverage: PASSED (≥${THRESHOLD}%)"
