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

## Data model (design it, then `npx prisma migrate dev`)

Define Prisma models in `prisma/schema.prisma` — suggested shape, refine as you see fit:

- **Market** — id, type, fixtureId?, name, status, updatedAt
- **Selection** — id, marketId, name, price, probability
- _(stretch)_ **PriceSnapshot** — marketId, selectionId, price, createdAt — the price history

The scaffold's `PrismaService` is wired (global module); the connection string comes from
`PRICING_DATABASE_URL` (see `.env.example`). Seed/refresh markets on module init from the
contracts `FIXTURES` (idempotent upserts — restarts must not duplicate markets).

## Requirements

1. **Probability model.** For a fixture between two known teams, derive win probabilities from
   the Elo ratings in `TEAMS` (logistic expectation). Knockout football always produces a
   winner, so `MATCH_WINNER` markets have exactly two selections — extra time and penalties
   are baked into the probability.
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
6. **`POST /reprice`** — body validated with `RepriceRequestSchema`. Apply the settlement
   (winner advances into the next fixture's slot), then recompute and persist all markets:
   newly-priceable fixtures gain markets, the settled fixture's market flips to `settled`.
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

- `GET /markets`, `GET /markets/:fixtureId`, `GET /outright` return payloads that
  `MarketSchema.parse` accepts
- `POST /reprice` advances the bracket and re-prices affected markets
- The Monte Carlo outright is deterministic under a fixed seed
- Prisma migration applied (`npx prisma migrate status` shown); domain maths in pure modules
  with `PrismaService` mocked

## Demo moment

`curl :4001/markets/R16-2 | jq` — France heavy favourites over Paraguay, prices summing to a
1.05 book. Kill the service, restart it — the prices are still there. That's the point.

## Stretch

- `GET /markets?round=QF` filtering.
- Price history via PriceSnapshot + `GET /markets/:id/history`.
