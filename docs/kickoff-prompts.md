# Kickoff prompts — one per Claude Code session

Open six terminal tabs in the repo root, start `claude` in each, and paste one block per tab.
Each prompt is tuned to showcase a different frontier capability — that's your narration hook
when you rotate between sessions.

Suggested launch order: **pricing → betting → simulator → punter-web → trader-ops → bots**
(bots last; they degrade gracefully while services come up, but they're more fun once markets
exist).

Every prompt lists **milestones in build/release order** and asks the session to **post a
one-line progress update as it finishes each** — that's the host's feed for narrating and for
deciding when a flag is ready to flip. Milestones are also in `docs/mental-map.md`.

---

## 1 · Pricing (showcase: plan mode — approve the model before code)

```text
You are the PRICING workstream of Agent Arena. Read CLAUDE.md, docs/specs/pricing.md, and the
contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

Start in plan mode: present me your probability model, margin approach, Monte Carlo design, and
Prisma data model for approval before implementing.

You own ONLY services/pricing/. Build in these milestones, and post a one-line progress update
as you complete each one:
  1. Elo -> win probability + margin engine (fair vs offered price; pure, tested modules)
  2. Persisted markets served via GET /markets
  3. Monte Carlo outright (>=10k tournaments) via GET /outright
  4. Reprice-on-result: POST /reprice advances the bracket and re-prices everything

The commit gates require >=85% coverage on changed files and zero lint warnings. Design your
Prisma models, apply with `npx prisma migrate dev --name init`, keep domain maths in pure
tested modules with PrismaService mocked. When done, run `npm test -w services/pricing`,
`npm run typecheck -w services/pricing`, and `npm run lint`.
```

## 2 · Betting (showcase: strict TDD — the money service earns trust test-first)

```text
You are the BETTING workstream of Agent Arena. Read CLAUDE.md, docs/specs/betting.md, and the
contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

Work strictly test-first — money moves here, so the nasty edge cases ARE the spec, and the
database enforces the invariants (unique idempotency keys, $transaction). You own ONLY
services/betting/. Build in these milestones, and post a one-line progress update as you
complete each one:
  1. Accounts + wallets (open with OPENING_BALANCE = 10,000)
  2. Bet placement rulebook (balance check, price-moved 409, DB-enforced idempotency, one
     transaction) + append-only ledger
  3. GET /bets (filterable) + exposure report
  4. Guarded settlement (POST /settle, x-admin-key, idempotent, pays winners)

Design your Prisma models, apply with `npx prisma migrate dev --name init`, mock PrismaService
in unit tests. When done, run `npm test -w services/betting`,
`npm run typecheck -w services/betting`, and `npm run lint`.
```

## 3 · Simulator (showcase: autonomous multi-step build with external integrations)

```text
You are the SIMULATOR workstream of Agent Arena. Read CLAUDE.md, docs/specs/simulator.md, and
the contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

You own ONLY services/simulator/. State is in-memory BY DESIGN — ephemeral theatre with a reset
button. Build in these milestones, and post a one-line progress update as you complete each one:
  1. Result engine (seedable: Elo-weighted winners, plausible scores, penalties) + bracket
     advancement (pure, exhaustively tested — the finale lives on this)
  2. POST /play-next + GET /state kept true
  3. POST /run (fast-forward the whole tournament, paced by intervalMs)
  4. Downstream wiring: each result triggers pricing /reprice then betting /settle (with the
     x-admin-key), degrading gracefully if either is down

When done, run `npm test -w services/simulator`, `npm run typecheck -w services/simulator`,
and `npm run lint`.
```

## 4 · Punter web (showcase: design taste + visual iteration)

```text
You are the PUNTER-WEB workstream of Agent Arena. Read CLAUDE.md, docs/specs/punter-web.md, and
the contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

You own ONLY apps/punter-web/. Build the typed zod-parsing fetch layer first, then work these
milestones IN THIS ORDER (it's the on-stage reveal order — each gated behind its flag). Post a
one-line progress update as you complete each one:
  1. THE BRACKET — the circular Road-to-the-Final SVG (dark arena, concentric rings, golden
     winner paths converging on a glowing trophy). Renders from @arena/contracts FIXTURES +
     GET :4003/state — needs no other service, so it's first. This is the signature visual.
  2. Markets page — live odds by round from GET :4001/markets, prices flash on change
  3. Bet slip + account bootstrap (enter a name -> 10k) — place a bet via POST :4002/bets
  4. My bets — pending/won/lost, live during a simulator run
  5. Champion confetti

Hand-rolled SVG, no new dependencies. When done, run `npm test -w apps/punter-web`,
`npm run typecheck -w apps/punter-web`, and `npm run lint`.
```

## 5 · Trader ops (showcase: subagent fan-out — one session, parallel component builds)

```text
You are the TRADER-OPS workstream of Agent Arena. Read CLAUDE.md, docs/specs/trader-ops.md, and
the contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

You own ONLY apps/trader-ops/. After a short plan, build these milestones — you may fan out
subagents for the independent surfaces, then integrate. Post a one-line progress update as you
complete each one:
  1. FLAGS RELEASE PANEL — toggle switches over GET/PUT :4004/flags (prompt once for the
     x-admin-key, keep in localStorage). This is THE release console for the whole show, so
     it's first.
  2. Exposure board — heat-mapped liability per market from GET :4002/exposure
  3. Punter watchlist / leaderboard — balances vs the 10k open (the finale scoreboard)
  4. Market monitor (offered vs fair price) + live settlement feed

When done, run `npm test -w apps/trader-ops`, `npm run typecheck -w apps/trader-ops`, and
`npm run lint`.
```

## 6 · Bots (showcase: agents building agents)

```text
You are the BOTS workstream of Agent Arena. Read CLAUDE.md, docs/specs/bots.md, and the
contracts package (contracts/src/api.ts, contracts/src/schemas.ts) before writing any code.

You own ONLY bots/. Services may not exist while you build — every HTTP call must degrade
gracefully. Build these milestones, and post a one-line progress update as you complete each one:
  1. Resilient HTTP client + ONE bot end-to-end (Sharp: own Elo model, bets only with edge,
     Kelly staking)
  2. Full roster (Mug: random longshots; Steady: flat 5%; Chaser: martingale, doomed)
  3. League-table loop, each bot narrating its reasoning in character

When done, run `npm test -w bots`, `npm run typecheck -w bots`, and `npm run lint`.
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
