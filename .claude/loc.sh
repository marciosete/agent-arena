#!/bin/bash
#
# Strict LOC accounting + force multiplier for Agent Arena.
#
# Counts ONLY functional product code + test code (TypeScript / TSX).
# Excluded on purpose:
#   - node_modules/ + package-lock.json  (generated / third-party / lock)
#   - *.config.ts, *.config.mjs          (config: vite, vitest, eslint, tsconfig ...)
#   - scripts/*.sh                        (CI + demo tooling, e.g. ticker.sh)
#   - *.md / *.json / *.yml               (docs + config)
#   - *.css / *.html                      (UI assets — reported separately, not counted)
#
# Functional code = product + test, aggregated into a single count (not split).
#
# Two views of the same counted set:
#   BY COMMIT DAY  net functional LOC (added-removed) attributed to each commit date
#   BY WORKSPACE   current-tree functional line counts per package
#
# Force multiplier: measured LOC vs a baseline of 120 LOC / engineer / coding day.
#   per day    day_LOC   / (120 x engineers)
#   overall    total_LOC / (120 x engineers x days)
#
# Usage: ./.claude/loc.sh [engineers] [days]
#   engineers  team size for the baseline   (default: 1)
#   days       coding days for the baseline (default: distinct git commit dates)
#
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

BASELINE_PER_DAY=120
ENGINEERS="${1:-1}"

IS_TEST='(/__tests__/|\.test\.|\.spec\.)'
IS_CONFIG='\.config\.'

# sum lines of a newline-separated file list read from stdin
loc() {
  local files; files=$(cat)
  [ -z "$files" ] && { echo 0; return; }
  echo "$files" | tr '\n' '\0' | xargs -0 wc -l 2>/dev/null | tail -1 | awk '{print $1+0}'
}

# Working-tree source files: tracked + new, minus .gitignored, minus anything not
# on disk. Reflects the live state during an active build (files being moved,
# services rewritten, new work still uncommitted) — the index alone lies here.
src_files() {
  git ls-files --cached --others --exclude-standard "${1:-}"'*.ts' "${1:-}"'*.tsx' \
    | sort -u | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done
}
product_files() { src_files "${1:-}" | grep -vE "$IS_TEST" | grep -vE "$IS_CONFIG" || true; }
test_files()    { src_files "${1:-}" | grep -E  "$IS_TEST" || true; }

# ---- current-tree snapshot (authoritative for "what exists now") --------
PROD=$(product_files | loc)
TEST=$(test_files | loc)
TOTAL=$((PROD + TEST))
UI=$(git ls-files --cached --others --exclude-standard '*.css' '*.html' \
  | sort -u | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done | loc)

# ---- historical net LOC per commit day ---------------------------------
# emits: "<date>\t<product-net>\t<test-net>\t<commits>", one row per day, ascending
DAY_ROWS=$(git log --numstat --no-renames --pretty=format:'#C%x09%ad' --date=short 2>/dev/null | awk -F'\t' '
  $1=="#C" { day=$2; commits[day]++; next }
  $3!="" {
    p=$3; a=$1; r=$2;
    if (p !~ /\.ts$/ && p !~ /\.tsx$/) next;   # counted extensions only
    if (p ~ /\.config\./) next;                # drop config
    if (a=="-") next;                          # skip binary
    n = a - r;
    if (p ~ /__tests__/ || p ~ /\.test\./ || p ~ /\.spec\./) t[day]+=n; else pr[day]+=n;
  }
  END { for (d in commits) printf "%s\t%d\t%d\t%d\n", d, (pr[d]+0), (t[d]+0), commits[d]; }
' | sort)

DAYS_ACTUAL=$(echo "$DAY_ROWS" | grep -c . || echo 1)
[ "${DAYS_ACTUAL:-0}" -lt 1 ] && DAYS_ACTUAL=1
DAYS="${2:-$DAYS_ACTUAL}"

BASELINE=$((BASELINE_PER_DAY * ENGINEERS * DAYS))
PER_DAY_BASE=$((BASELINE_PER_DAY * ENGINEERS))
MULT=$(awk -v a="$TOTAL" -v b="$BASELINE" 'BEGIN{ printf (b>0 ? "%.1f" : "0.0"), (b>0 ? a/b : 0) }')
ENG_DAYS=$(awk -v a="$TOTAL" -v d="$BASELINE_PER_DAY" 'BEGIN{ printf "%.1f", a/d }')

# ---- report -------------------------------------------------------------
printf '  ═══════════════════════════════════════════════════════════\n'
printf '        ⚽  AGENT ARENA — STRICT LOC + MULTIPLIER  🏆\n'
printf '  ═══════════════════════════════════════════════════════════\n\n'

printf '  BY COMMIT DAY (net functional LOC, from git history)\n'
printf '  %-12s %8s %11s %8s\n' 'DATE' 'COMMITS' 'FUNCTIONAL' 'MULT'
printf '  %-12s %8s %11s %8s\n' '------------' '-------' '----------' '----'
HIST_TOTAL=0; HIST_COMMITS=0
while IFS=$'\t' read -r d dp dt dc; do
  [ -z "${d:-}" ] && continue
  dtotal=$((dp + dt))
  dmult=$(awk -v a="$dtotal" -v b="$PER_DAY_BASE" 'BEGIN{ printf (b>0 ? "%.1f" : "0.0"), (b>0 ? a/b : 0) }')
  printf '  %-12s %8s %11s %7sx\n' "$d" "$dc" "$dtotal" "$dmult"
  HIST_TOTAL=$((HIST_TOTAL + dtotal)); HIST_COMMITS=$((HIST_COMMITS + dc))
done <<< "$DAY_ROWS"
HIST_MULT=$(awk -v a="$HIST_TOTAL" -v b="$((PER_DAY_BASE * DAYS_ACTUAL))" 'BEGIN{ printf (b>0 ? "%.1f" : "0.0"), (b>0 ? a/b : 0) }')
printf '  %-12s %8s %11s %8s\n' '------------' '-------' '----------' '----'
printf '  %-12s %8s %11s %7sx\n\n' "AGGREGATE" "$HIST_COMMITS" "$HIST_TOTAL" "$HIST_MULT"

if [ "$HIST_TOTAL" -ne "$TOTAL" ]; then
  printf '  note: committed history %s vs working tree %s (Δ %+d) — uncommitted work in\n' "$HIST_TOTAL" "$TOTAL" "$((TOTAL - HIST_TOTAL))"
  printf '        flight (files being moved/rewritten). Headline multiplier below uses the working tree.\n\n'
fi

printf '  BY WORKSPACE (current tree)\n'
printf '  %-22s %11s\n' 'WORKSPACE' 'FUNCTIONAL'
printf '  %-22s %11s\n' '----------------------' '----------'
for pkg in $(git ls-files --cached --others --exclude-standard '*/package.json' \
  | grep -v node_modules | while IFS= read -r f; do [ -f "$f" ] && dirname "$f"; done | sort -u); do
  wp=$(product_files "$pkg/" | loc)
  wt=$(test_files    "$pkg/" | loc)
  wtotal=$((wp + wt))
  [ "$wtotal" -eq 0 ] && continue
  printf '  %-22s %11s\n' "$pkg" "$wtotal"
done
printf '  %-22s %11s\n' '----------------------' '----------'
printf '  %-22s %11s\n\n' 'TOTAL' "$TOTAL"

printf '  Functional LOC            %8s   (product + test, aggregated)\n' "$TOTAL"
printf '  UI assets (css/html)      %8s   (excluded from multiplier)\n\n' "$UI"

printf '  ── Force multiplier ───────────────────────────────────────\n'
printf '  Baseline                  %8s   LOC / engineer / coding day\n' "$BASELINE_PER_DAY"
printf '  Engineers                 %8s\n' "$ENGINEERS"
printf '  Coding days               %8s   %s\n' "$DAYS" "$([ "$DAYS" = "$DAYS_ACTUAL" ] && echo '(distinct commit dates)' || echo "(override; $DAYS_ACTUAL actual)")"
printf '  Expected @ baseline       %8s   LOC (%s eng × %s day)\n' "$BASELINE" "$ENGINEERS" "$DAYS"
printf '  Output in engineer-days   %8s   (%s LOC ÷ %s)\n' "$ENG_DAYS" "$TOTAL" "$BASELINE_PER_DAY"
printf '  ▶  FORCE MULTIPLIER       %7sx\n\n' "$MULT"

printf '  ── Scope (what these numbers count) ───────────────────────\n'
printf '  Counted (multiplier)   .ts .tsx  — product + test aggregated,\n'
printf '                         excluding *.config.ts (vite/vitest/etc.)\n'
printf '  Test detection         a file counts as test if its path has\n'
printf '                         .test. | .spec. | a __tests__/ segment\n'
printf '  Reported, not counted  .css .html  — the UI-assets line above\n'
printf '  Excluded extensions    every other extension: .json .md .yml\n'
printf '                         .yaml .sh .mjs .cjs .prisma .sql .toml\n'
printf '                         .properties .example, husky hooks, etc.\n'
printf '  Excluded folders       node_modules/ dist/ coverage/\n'
printf '                         services/*/generated/ .scannerwork/\n'
printf '                         .vercel/ .husky/_/ + anything .gitignored\n'
printf '  Note                   docs/ & scripts/ hold no .ts/.tsx, so they\n'
printf '                         drop out by extension, not a folder rule.\n'
printf '  ═══════════════════════════════════════════════════════════\n'
