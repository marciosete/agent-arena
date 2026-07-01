# @arena/contracts — FROZEN 🧊

**This package is read-only during the event.** Every workstream imports from it; nobody edits it.
It is the coordination mechanism that lets six Claude Code sessions build in parallel without
colliding: if everyone implements exactly this surface, everything integrates.

## What lives here

| File             | Contents                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| `src/schemas.ts` | Domain schemas (zod): Team, Fixture, Market, Bet, Account, Settlement        |
| `src/api.ts`     | Service topology: ports, base URLs, REST endpoints, request/response schemas |
| `src/data/`      | Seed data: the real World Cup 2026 bracket as of 2 July 2026                 |

## Service topology

| Process    | Port | Owns                                                   |
| ---------- | ---- | ------------------------------------------------------ |
| pricing    | 4001 | Odds computation, markets, Monte Carlo pricing         |
| betting    | 4002 | Accounts, wallets, bet placement, settlement, exposure |
| sim        | 4003 | Tournament fast-forward, result generation             |
| punter-web | 5173 | Customer-facing sportsbook UI                          |
| trader-ops | 5174 | Internal trading/liability dashboard                   |

The REST surface of each service is documented as comment blocks in `src/api.ts`,
with zod schemas for every request and response body. Parse, don't trust:
validate inbound payloads with the schemas.

## Usage

```ts
import { FIXTURES, TEAMS, PORTS, MarketSchema, type Market } from '@arena/contracts';
```

## Note on seed data

`src/data/fixtures.json` reflects the real bracket as of the evening of 2 July 2026.
Eight Round-of-32 fixtures were still unplayed; their Round-of-16 slots are `null` (TBD).
The host may refresh scores/teams in `data/` on the morning of the event — the schemas and
API surface stay frozen regardless.
