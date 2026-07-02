---
description: Strict functional-LOC count (product + test aggregated) with force multiplier vs 120 LOC/eng/day
argument-hint: '[engineers] [days]'
allowed-tools: Bash(bash .claude/loc.sh:*)
---

Strict lines-of-code accounting for Agent Arena. Counts functional code
(TypeScript/TSX) — product **and** test code aggregated into a single figure;
test files are matched by `.test.`, `.spec.` (NestJS co-located specs), or a
`__tests__/` path. Excludes generated/third-party dirs, config files
(`*.config.*`), `scripts/*.sh` tooling, docs, and CSS/HTML UI assets. Shows the
counted set two ways — **by commit day** (net functional LOC from git history,
each day with its own multiplier) and **by workspace** (current tree) — then
computes the overall force multiplier against a baseline of 120 LOC / engineer /
coding day.

### Scope (rules the script enforces — also printed in the report)

- **Counted (multiplier):** `.ts` and `.tsx` only, product + test aggregated,
  minus `*.config.ts` (vite/vitest/etc.).
- **Test detection:** a file is test code if its path contains `.test.`,
  `.spec.`, or a `__tests__/` segment; everything else `.ts/.tsx` is product.
- **Reported but not counted:** `.css` and `.html` (the UI-assets line).
- **Excluded extensions:** every other extension — `.json`, `.md`, `.yml`,
  `.yaml`, `.sh`, `.mjs`, `.cjs`, `.prisma`, `.sql`, `.toml`, `.properties`,
  `.example`, husky hooks, etc.
- **Excluded folders:** `node_modules/`, `dist/`, `coverage/`,
  `services/*/generated/`, `.scannerwork/`, `.vercel/`, `.husky/_/`, and
  anything else `.gitignore`d (via `git ls-files --exclude-standard`).
- `docs/` and `scripts/` contain no `.ts/.tsx`, so they drop out by extension,
  not by a folder rule.

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
