> **Kickoff — session 4.** From a repo-root session: `/goal @docs/specs/4-betting.md`.
> CLAUDE.md auto-loads; skim `contracts/src/api.ts` + `contracts/src/schemas.ts` first.
> Work strictly test-first — money moves here. Post a one-line progress update per milestone.

# Workstream: Betting Core

**You own:** `services/betting/` — nothing else.
**Port:** 4002 · **Stack:** NestJS + Prisma/Postgres · **Contract:** `contracts/src/api.ts` (Betting section) · **Read-only:** `contracts/`

## Mission

You are the ledger. Accounts, wallets, bet placement, settlement, and the exposure numbers the
trading desk lives by. This is the service where correctness is non-negotiable — money moves
here, and it moves **in the database**.

## Data model (design it, then `npx prisma migrate dev`)

Define Prisma models in `prisma/schema.prisma` — suggested shape, refine as you see fit:

- **Account** — id, name, balance, isBot, createdAt
- **Bet** — id, accountId, marketId, selectionId, stake, price, potentialReturn, status,
  placedAt, settledAt, **idempotencyKey `@unique`** (the DB enforces idempotency, not an if-statement)
- **LedgerEntry** — id, accountId, delta, balanceAfter, reason, refBetId?, createdAt —
  **append-only**: no updates, no deletes

The scaffold's `PrismaService` is wired (global module); the connection string comes from
`BETTING_DATABASE_URL` (see `.env.example`).

## Requirements

1. **`POST /accounts`** — validated with `CreateAccountRequestSchema`. Opens with
   `OPENING_BALANCE` (10,000) and writes the opening ledger entry in the same transaction.
2. **`GET /accounts` / `GET /accounts/:id`** — list and fetch (404 unknown).
3. **`POST /bets`** — validated with `PlaceBetRequestSchema`. Rules:
   - account exists; stake ≤ balance; market exists and is `open` (check pricing via
     `GET :4001/markets` or a short-lived cache);
   - **price tolerance**: 409 if current price differs from `acceptedPrice` by more than 5%;
   - **idempotency**: same `idempotencyKey` returns the original bet (unique constraint +
     catch, or upsert — let the database be the referee);
   - wallet debit + bet insert + ledger entry in **one `$transaction`**.
4. **`GET /bets?accountId=&status=`** — filterable listing (validate query with `BetQuerySchema`).
5. **`POST /settle`** — validated with `SettleRequestSchema`; called by the simulator. Winners →
   `won` + credit `potentialReturn` + ledger entry; losers → `lost`. Transactional and
   **idempotent per fixture** (second call = no-op). **Guard this endpoint** with an
   x-admin-key check (`BETTING_ADMIN_KEY`, same pattern as flags/simulator) — settlement moves
   money and must not be publicly callable. The simulator sends the header when it settles.
6. **`GET /exposure`** — `ExposureReportSchema`: per market, total staked, bet count, and
   **max liability** (worst-case payout across selections minus stakes held).
7. **`GET /accounts/:id/ledger`** — the audit trail (shape is yours; document it in a README).

## Security (public repo + public API — see CLAUDE.md)

- Enforce every money rule **server-side**: stake ≤ balance, stake > 0, no NaN/overflow.
  Never trust the client's numbers. Wallet debit + bet + ledger in one `$transaction`.
- Idempotency is a **DB unique constraint** on the key, not an `if`-check that races.
- `/settle` is guarded (above). Error bodies never expose connection strings or stack traces.

## Enterprise bar

- Domain rules (tolerance maths, liability maths, settlement outcomes) as pure functions with
  exhaustive unit tests — no DB needed to test the maths.
- Controllers thin; providers orchestrate; **mock `PrismaService`** in unit tests (standard
  Nest DI override). The nasty cases are the spec: double-spend, unknown selection,
  settle-twice, stake > balance, replayed idempotency key.
- Zod-validate everything inbound (a ZodValidationPipe is idiomatic). Meaningful 400/404/409s.
- ≥85% coverage on everything you commit; zero lint warnings; no cross-workstream imports.

## Demo moment

Place the same bet twice with one idempotency key — one row, one debit, the unique constraint
did the work. Then settle a fixture and read the ledger back: every cent accounted for.

## Stretch

- Market suspend/reopen (needs a contract amendment — negotiate with the host first).
- Per-account max-stake limits (responsible gambling hook — an industry must-have).
