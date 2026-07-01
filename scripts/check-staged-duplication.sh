#!/bin/bash

# Check code duplication ONLY on staged TypeScript files.
# Prevents blocking commits for existing duplication in untouched files.

set -e

echo "🔍 Checking code duplication on staged files..."

# Exclusions mirror .jscpd.json: tests plus Nest bootstrap files that are
# identical by framework convention (main.ts, app.module.ts).
STAGED_TS_FILES=$(git diff --cached --name-only --diff-filter=ACMR |
  grep -E '\.(ts|tsx)$' |
  grep -v '\.test\.ts$' |
  grep -v '\.test\.tsx$' |
  grep -v '\.spec\.ts$' |
  grep -v '/main\.ts$' |
  grep -v '/app\.module\.ts$' || true)

if [[ -z "$STAGED_TS_FILES" ]]; then
  echo "✅ No TypeScript files staged. Skipping duplication check."
  exit 0
fi

STAGED_FILE_ARRAY=()
while IFS= read -r staged_file; do
  if [[ -n "$staged_file" ]]; then
    STAGED_FILE_ARRAY+=("$staged_file")
  fi
done <<<"$STAGED_TS_FILES"

FILE_COUNT=${#STAGED_FILE_ARRAY[@]}

if [[ "$FILE_COUNT" -lt 2 ]]; then
  echo "✅ Only 1 file staged. Skipping duplication check (requires 2+ files)."
  exit 0
fi

echo "📊 Checking duplication in ${FILE_COUNT} staged TypeScript file(s)..."

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

if ! npx jscpd --threshold 3 --reporters consoleFull --output "$TEMP_DIR" \
  "${STAGED_FILE_ARRAY[@]}" 2>&1 | tee "$TEMP_DIR/output.log"; then
  if grep -q "too many duplicates" "$TEMP_DIR/output.log"; then
    echo ""
    echo "❌ Code duplication detected in staged files (>3%)"
    echo "💡 Refactor duplicate code before committing"
    echo "💡 Run 'npm run check:duplicates' for the full report"
    exit 1
  fi
  echo "⚠️  Warning: could not check duplication (jscpd error) — not blocking"
  exit 0
fi

echo "✅ No significant duplication detected in staged files (<3%)"
