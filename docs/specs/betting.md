# Workstream: Betting Core

**You own:** `services/betting/` — nothing else.
**Port:** 4002 · **Contract:** `contracts/src/api.ts` (Betting section) · **Read-only:** `contracts/`

## Mission

You are the ledger. Accounts, wallets, bet placement, settlement, and the exposure numbers the
trading desk lives by. This is the service where correctness is non-negotiable — money moves here.

## Requirements

1. **`POST /accounts`** — validated with `CreateAccountRequestSchema`. Every account opens with
   `OPENING_BALANCE` (10,000). Returns an `AccountSchema` payload.
2. **`GET /accounts` / `GET /accounts/:id`** — list and fetch (404 unknown).
3. **`POST /bets`** — validated with `PlaceBetRequestSchema`. Rules:
   - account exists; stake ≤ balance; market exists and is `open` (fetch market state from
     pricing `GET /markets/:fixtureId` or cache of `GET /markets`);
   - **price tolerance**: reject with 409 if the current price differs from `acceptedPrice` by
     more than 5%;
   - **idempotency**: same `idempotencyKey` returns the original bet, never a duplicate;
   - atomically debit the wallet, record the bet as `pending` with `potentialReturn = stake × price`.
4. **`GET /bets?accountId=&status=`** — filterable listing (validate query with `BetQuerySchema`).
5. **`POST /settle`** — validated with `SettleRequestSchema`; called by sim. For each affected
   market: bets on the winning selection → `won`, credit `potentialReturn`; others → `lost`.
   Must be idempotent per fixture (second call = no-op). Returns `SettleResponseSchema`.
6. **`GET /exposure`** — `ExposureReportSchema`: per market, total staked, bet count, and
   **max liability** (worst-case payout across selections minus stakes held).
7. **Audit log**: every balance movement appends an immutable ledger entry
   (who, what, when, delta, balance-after). Expose `GET /accounts/:id/ledger` (shape is yours —
   it's within your service; document it in your README).

## Enterprise bar

- Wallet/ledger logic in pure modules behind a small repository interface (in-memory today, DB
  tomorrow) — unit-tested, including the nasty cases: double-spend attempt, unknown selection,
  settle-twice, stake > balance.
- Zod-validate everything inbound. Meaningful 400/404/409 bodies.
- ≥80% coverage on everything you commit; zero lint warnings.

## Demo moment

Place the same bet twice with one idempotency key — one bet exists, one debit. Then settle a
fixture and watch `GET /exposure` collapse to zero for that market while wallets update.

## Stretch

- Market suspend/reopen (needs a contract amendment — negotiate with the host first).
- Per-account max-stake limits (responsible gambling hook — very Sportsbet).
