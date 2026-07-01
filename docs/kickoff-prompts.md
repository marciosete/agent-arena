# Kickoff prompts — one per Claude Code session

Open six terminal tabs in the repo root, start `claude` in each, and paste one block per tab.
Each prompt is tuned to showcase a different frontier capability — that's your narration hook
when you rotate between sessions.

Suggested launch order: **pricing → betting → simulator → punter-web → trader-ops → bots**
(bots last; they degrade gracefully while services come up, but they're more fun once markets
exist).

---

## 1 · Pricing (showcase: plan mode — approve the model before code)

```text
You are the PRICING workstream of Agent Arena. Read CLAUDE.md, docs/specs/pricing.md, and the
contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

Start in plan mode: present me your probability model, margin approach, Monte Carlo design, and
Prisma data model for approval before implementing.

You own ONLY services/pricing/. Implement the full spec with unit tests as you go — the commit
gates require ≥85% coverage on changed files and zero lint warnings. Design your Prisma models,
apply them with `npx prisma migrate dev --name init`, and keep all domain maths in pure tested
modules with PrismaService mocked in unit tests. When done, run
`npm test -w services/pricing`, `npm run typecheck -w services/pricing`, and `npm run lint`,
then report: endpoints shipped, model summary, migration applied, test count.
```

## 2 · Betting (showcase: strict TDD — the money service earns trust test-first)

```text
You are the BETTING workstream of Agent Arena. Read CLAUDE.md, docs/specs/betting.md, and the
contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

Work strictly test-first: for each behaviour in the spec (idempotent bet placement, price
tolerance, transactional wallet debits, idempotent settlement, exposure maths, the append-only
ledger), write the failing test, then make it pass. Money moves here — the nasty edge cases
ARE the spec, and the database enforces the invariants (unique idempotency keys, $transaction).

You own ONLY services/betting/. Design your Prisma models, apply them with
`npx prisma migrate dev --name init`, and mock PrismaService in unit tests. When done, run
`npm test -w services/betting`, `npm run typecheck -w services/betting`, and `npm run lint`,
then report: endpoints shipped, edge cases covered, migration applied, test count.
```

## 3 · Simulator (showcase: autonomous multi-step build with external integrations)

```text
You are the SIMULATOR workstream of Agent Arena. Read CLAUDE.md, docs/specs/simulator.md, and
the contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

You own ONLY services/simulator/. Build the full spec: seedable result generation, bracket
advancement, the play-next / run / state / reset endpoints, and the downstream notifications to
pricing and betting (which may not be running yet — degrade gracefully, never corrupt your
state). Your state is in-memory BY DESIGN — ephemeral theatre with a reset button. Bracket
advancement correctness is the heart of the finale: test it exhaustively.

When done, run `npm test -w services/simulator`, `npm run typecheck -w services/simulator`,
and `npm run lint`, then report: endpoints shipped, how determinism works, test count.
```

## 4 · Punter web (showcase: design taste + visual iteration)

```text
You are the PUNTER-WEB workstream of Agent Arena. Read CLAUDE.md, docs/specs/punter-web.md, and
the contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

You own ONLY apps/punter-web/. Build the spec with special care on requirement 5: the circular
Road-to-the-Final bracket is the signature visual of the whole event — dark arena, concentric
rings, golden winner paths converging on a glowing trophy. Hand-rolled SVG, no new dependencies.
Build the typed zod-parsing fetch layer first, then markets → bet slip → my bets → bracket.

When done, run `npm test -w apps/punter-web`, `npm run typecheck -w apps/punter-web`, and
`npm run lint`, then report: pages shipped, how the bracket animates during a simulator run,
test count.
```

## 5 · Trader ops (showcase: subagent fan-out — one session, parallel component builds)

```text
You are the TRADER-OPS workstream of Agent Arena. Read CLAUDE.md, docs/specs/trader-ops.md, and
the contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

You own ONLY apps/trader-ops/. After a short plan, fan out subagents to build the four surfaces
in parallel — exposure board, punter watchlist, market monitor, settlement feed — then
integrate them into the single dense console yourself and reconcile any seams.

When done, run `npm test -w apps/trader-ops`, `npm run typecheck -w apps/trader-ops`, and
`npm run lint`, then report: surfaces shipped, how the heat thresholds work, test count.
```

## 6 · Bots (showcase: agents building agents)

```text
You are the BOTS workstream of Agent Arena. Read CLAUDE.md, docs/specs/bots.md, and the
contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

You own ONLY bots/. Build the framework and the four-personality roster (Sharp, Mug, Steady,
Chaser) as pure, tested strategy functions behind one resilient HTTP client. Services may not
exist while you build — every call must degrade gracefully. Decision logs are part of the show:
make each bot narrate its reasoning in character.

When done, run `npm test -w bots`, `npm run typecheck -w bots`, and `npm run lint`, then
report: roster shipped, a sample of each personality's log line, test count.
```

---

## Mid-session management prompts (paste into any session as needed)

```text
Status check: summarise what's shipped, what's in progress, current test count, and your
biggest open risk in four bullets.
```

```text
Run /code-review on your working diff and fix anything it finds before reporting done.
```

```text
Integration is live. Your service now has real consumers — run your suite, then verify your
surface against the running platform with one-shot curls (services are up on their contract
ports). Fix mismatches on your side only; the contract is law.
```
