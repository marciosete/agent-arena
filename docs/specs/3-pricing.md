> **Kickoff — session 3.** Launch with `/goal` — see `docs/workshop/kickoff-prompts.md` for the exact
> condition. How goal-driven tasks work: `docs/engineering/goal-oriented-tasks.md`. CLAUDE.md (auto-loaded) has the conventions. Start in plan
> mode and get your model approved first.

# Workstream: Pricing Engine

**You own:** `services/pricing/` — nothing else.
**Port:** 4001 · **Stack:** NestJS + Prisma/Postgres · **Contract:** `contracts/src/api.ts` (Pricing section) · **Read-only:** `contracts/`

## Mission

You are the trading floor's quant. Turn team strength into probabilities, probabilities into
prices, and publish a market for every fixture in the remaining World Cup bracket — plus the
outright tournament-winner market. Markets are **persisted**: prices survive a restart, and
every reprice is a recorded event.

> **Auth is pre-built and REQUIRED — you do not implement it.** Register the shared `JwtAuthGuard`
> from `@arena/service-auth` globally (`APP_GUARD`) in your `AppModule` and mark `GET /health`
> `@Public()` — every other endpoint then requires a valid `Authorization: Bearer <jwt>` (verified
> with the shared `SESSION_SECRET`). The guard is pre-wired; you only register it. Callers already
> send a token: the **apps** (after login) and **bots** read `GET /markets` + `GET /outright`;
> **betting** reads `GET /markets/:fixtureId` at bet time; the **simulator** calls `POST /reprice`.
> Services mint theirs with `signToken('<svc>')`. Full model: [integration.md](../engineering/integration.md) §1.

> **Where you sit.** You are the platform's price authority — everyone reads prices, nobody's prices
> but yours. The apps and bots poll your markets for the odds board and to find value; **betting
> calls `GET /markets/:fixtureId` at bet time to re-check the live price and that the market is still
> `open`** before accepting a bet (integration.md §5); the **simulator drives `POST /reprice` after
> every result and reads the winning selections back out of your response** (the finale chain,
> integration.md §4 steps 3–4). You never call another service — callers poll you.

## Data model (design it, then `npx prisma migrate dev`)

Define Prisma models in `prisma/schema.prisma` — suggested shape, refine as you see fit:

- **Market** — id, type, fixtureId?, name, status, updatedAt
- **Selection** — id, marketId, name, price, probability
- _(stretch)_ **PriceSnapshot** — marketId, selectionId, price, createdAt — the price history

The scaffold's `PrismaService` is wired (global module); the connection string comes from
`PRICING_DATABASE_URL` (see `.env.example`). Seed/refresh markets on module init from the
contracts `FIXTURES` (idempotent upserts — restarts must not duplicate markets).

## Requirements

1. **Probability model & the load-bearing naming join.** For a fixture between two known teams,
   derive win probabilities from the Elo ratings in `TEAMS` (logistic expectation). Knockout
   football always produces a winner, so `MATCH_WINNER` markets have exactly two selections —
   extra time and penalties are baked into the probability. **This naming is a hard contract, not a
   convenience:** every `MATCH_WINNER` market's `fixtureId` MUST equal its `Fixture.id` (the
   `OUTRIGHT` market has `fixtureId: null`), and every `Selection.name` MUST exactly equal the
   represented team's `name` from `TEAMS` (selections carry no `teamId`). This is the only join the
   platform has: the punter maps a bracket slot to its price by `fixtureId` and labels a selection by
   team name, and the simulator turns a `winnerTeamId` into the winning `selectionId` by matching
   `TEAMS[…].name` against `Selection.name` (integration.md §3). A wrong name settles bets against the
   wrong outcome — so a test asserts it.
2. **Margin.** Convert fair probabilities to decimal prices with the margin applied
   proportionally so the overround equals `TARGET_OVERROUND` (1.05). Never below 1.01. Keep
   `probability` (the fair value) on each selection.
3. **`GET /markets`** — every priceable market (a fixture is priceable when both team slots are
   known), including the outright. Served from the database.
4. **`GET /markets/:fixtureId`** — the match-winner market for one fixture (404 if unknown or
   not yet priceable).
5. **`GET /outright`** — tournament-winner market: one selection per team still alive, priced by
   **Monte Carlo simulation** of the whole remaining bracket (≥10,000 runs) following the
   `feedsInto`/`feedsIntoSlot` links. Computation in memory; results persisted.
6. **`POST /reprice`** — body validated with `RepriceRequestSchema` (`{ settlement: SettlementEvent }`;
   400 on garbage). Called by the simulator with a service token after every result (integration.md
   §4 steps 3–4). Apply the settlement: advance the winner into the next fixture's open
   `feedsInto`/`feedsIntoSlot`, flip the settled fixture's `MATCH_WINNER` market to `settled`, add
   markets for any fixtures that just became priceable, and reprice the affected downstream markets
   **and the `OUTRIGHT`**. Persist it all, then **return the full updated `Market[]`** (the response
   type in the contract) — the simulator reads the winning selections back out of this response (by
   team name, per §3), so the just-settled market and, after the final, the `OUTRIGHT` must be
   present and correct.
7. Every response must parse against `MarketSchema` from contracts — write a test proving it.

## Enterprise bar

- Domain maths (Elo→probability, margin, bracket advancement, Monte Carlo) in pure, exhaustively
  unit-tested modules — no DB needed to test the maths. Seedable RNG so tests are deterministic.
- Controllers thin; providers orchestrate; **mock `PrismaService`** in unit tests.
- Zod-validate inbound bodies; 400 + helpful message on garbage.
- ≥85% coverage on everything you commit; zero lint warnings; no cross-workstream imports.

## Definition of Done

Meet the **gates in `docs/engineering/definition-of-done.md`** (run and paste the evidence). Plus prove
these — paste the name of the test for each:

- Every protected endpoint (`/markets`, `/markets/:fixtureId`, `/outright`, `/reprice`) returns
  **401** with a missing or invalid `Authorization` header, and `GET /health` stays public
- `GET /markets`, `GET /markets/:fixtureId`, `GET /outright` return payloads that
  `MarketSchema.parse` accepts
- Every `Selection.name` equals its `Team.name` from `TEAMS`, every `MATCH_WINNER` market carries its
  `fixtureId`, and the `OUTRIGHT` market has `fixtureId: null` (the §3 join)
- `POST /reprice` advances the bracket, flips the settled fixture's market to `settled`, reprices the
  affected markets **and the `OUTRIGHT`**, and **returns the updated `Market[]`**
- The Monte Carlo outright is deterministic under a fixed seed
- Prisma migration applied (`npx prisma migrate status` shown); domain maths in pure modules
  with `PrismaService` mocked

## Demo moment

`curl :4001/markets/R16-2 | jq` — France heavy favourites over Paraguay, prices summing to a
1.05 book. Kill the service, restart it — the prices are still there. That's the point.

## Stretch

- `GET /markets?round=QF` filtering.
- Price history via PriceSnapshot + `GET /markets/:id/history`.
