---
description: Strict LOC count (functional + test only) with force multiplier vs 120 LOC/eng/day
argument-hint: '[engineers] [days]'
allowed-tools: Bash(bash .claude/loc.sh:*)
---

Strict lines-of-code accounting for Agent Arena. Counts ONLY functional product
code + test code (TypeScript/TSX); excludes generated/third-party dirs, config
files, `scripts/*.sh` tooling, docs, and CSS/HTML UI assets. Shows the counted
set two ways — **by commit day** (net LOC from git history, each day with its own
multiplier) and **by workspace** (current tree) — then computes the overall force
multiplier against a baseline of 120 LOC / engineer / coding day.

Report:

!`bash .claude/loc.sh $ARGUMENTS`

Relay the report above to the user, then add 1–2 sentences:

- Lead with the overall force multiplier and the engineer-days-of-output figure.
- If there is more than one commit day, call out the trend (which day shipped most).
- State the baseline assumptions actually used (engineers, and where "coding days"
  came from — it defaults to the count of distinct git commit dates). Remind them
  they can override with `/loc <engineers> <days>`.
- Flag it only if an assumption looks off (e.g. coding days = 1 because every
  commit landed on the same date), or if the reconciliation "note:" line appears
  (history net ≠ current tree, meaning counted files were deleted/rewritten).

Trust the script's numbers — do not recount yourself.
