# Workstream: Pricing Engine

**You own:** `services/pricing/` — nothing else.
**Port:** 4001 · **Contract:** `contracts/src/api.ts` (Pricing section) · **Read-only:** `contracts/`

## Mission

You are the trading floor's quant. Turn team strength into probabilities, probabilities into
prices, and publish a market for every fixture in the remaining World Cup bracket — plus the
outright tournament-winner market.

## Requirements

1. **Probability model.** For a fixture between two known teams, derive win probabilities from
   the Elo ratings in `TEAMS` (logistic expectation). Knockout football always produces a
   winner, so `MATCH_WINNER` markets have exactly two selections (home/away) — extra time and
   penalties are baked into the probability.
2. **Margin.** Convert fair probabilities to decimal prices with the bookmaker margin applied
   proportionally so the overround equals `TARGET_OVERROUND` (1.05). Price = margin-adjusted,
   never below 1.01. Keep `probability` (the fair value) on each selection.
3. **`GET /markets`** — every priceable market. A fixture is priceable when both team slots are
   known. Include the outright market.
4. **`GET /markets/:fixtureId`** — the match-winner market for one fixture (404 if unknown or
   not yet priceable).
5. **`GET /outright`** — tournament-winner market: one selection per team still alive, priced by
   **Monte Carlo simulation** of the whole remaining bracket (≥10,000 runs) following the
   `feedsInto`/`feedsIntoSlot` links.
6. **`POST /reprice`** — body validated with `RepriceRequestSchema`. Apply the settlement
   (winner advances into the next fixture's slot), then recompute all markets. Newly-priceable
   fixtures get markets; the settled fixture's market becomes `settled`.
7. Every response must parse against the `MarketSchema` from contracts — write a test proving it.

## Enterprise bar

- Domain logic (Elo→probability, margin application, bracket advancement, Monte Carlo) in pure,
  unit-tested modules. Routes stay thin.
- Zod-validate every inbound body; 400 + helpful message on garbage.
- Seedable RNG for the Monte Carlo so tests are deterministic.
- ≥80% coverage on everything you commit; zero lint warnings.

## Demo moment

`curl :4001/markets/R16-2 | jq` — France heavy favourites over Paraguay, prices that sum to a
1.05 book. Then `curl :4001/outright | jq` — a full ranked list of title chances, live from
10k simulated tournaments.

## Stretch

- `GET /markets?round=QF` filtering.
- Price history: remember prices per reprice generation, expose `GET /markets/:id/history`.
