#!/bin/bash

# Nightly mutation testing with Stryker across the logic-bearing workspaces.
# Runs per workspace (cwd matters — each owns its own vitest config), mirroring
# check-new-code-coverage.sh. Gated workspaces set thresholds.break=80, so
# Stryker exits non-zero when the mutation score drops below it; declarative
# packages (contracts) run report-only (break=null) for signal without blocking.
#
# This is intentionally NOT wired into pre-commit/pre-push or the deploy gates:
# mutation testing is slow and occasionally non-deterministic, so it lives in an
# independent nightly build (.github/workflows/mutation.yml).

set -uo pipefail

WORKSPACES=(
  service-auth
  services/pricing
  services/betting
  services/simulator
  services/flags
  bots
  contracts
)

FAILED=()
SKIPPED=()

for ws in "${WORKSPACES[@]}"; do
  if [[ ! -f "${ws}/stryker.config.json" ]]; then
    echo "⚠️  ${ws}: no stryker.config.json — skipping."
    continue
  fi

  echo ""
  echo "🧬 Mutation testing ${ws}..."
  log="$(mktemp)"
  if (cd "$ws" && npx stryker run) 2>&1 | tee "$log"; then
    rm -f "$log"
    continue
  fi

  # A workspace with no business logic yet (e.g. a scaffold service) produces
  # zero mutants — Stryker exits non-zero, but that's not a threshold failure.
  # The gate activates automatically once real logic (and mutants) land.
  if grep -qiE "No files found for mutation|No tests were executed|No mutants" "$log"; then
    SKIPPED+=("$ws")
  else
    FAILED+=("$ws")
  fi
  rm -f "$log"
done

echo ""
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  echo "⚠️  Skipped (no mutable source yet): ${SKIPPED[*]}"
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "❌ Mutation score below break threshold in: ${FAILED[*]}"
  echo "   Add tests that kill the surviving mutants (see each reports/mutation/mutation.html)."
  exit 1
fi

echo "✅ Mutation testing passed — all gated workspaces at or above threshold."
