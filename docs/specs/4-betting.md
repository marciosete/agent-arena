> **Kickoff — session 4.** Launch with `/goal` — see `docs/workshop/kickoff-prompts.md` for the exact
> condition. How goal-driven tasks work: `docs/engineering/goal-oriented-tasks.md`. CLAUDE.md (auto-loaded) has the conventions. Work strictly
> test-first — money moves here.

# Workstream: Betting Core

**You own:** `services/betting/` — nothing else.
**Port:** 4002 · **Stack:** NestJS + Prisma/Postgres · **Contract:** `contracts/src/api.ts` (Betting section) · **Read-only:** `contracts/`

## Mission

You are the ledger. Wallets, bet placement, settlement, and the exposure numbers the trading desk
lives by. This is the service where correctness is non-negotiable — money moves here, and it moves
**in the database**.

> **Accounts + auth are PRE-BUILT platform infra (like flags) — READ-ONLY. Do not rebuild them.**
> Under `src/auth/` and `src/accounts/` (and already in `prisma/schema.prisma`) live: the `Account`
> and `Otp` models; passwordless **email + OTP** login (`POST /auth/request-otp`,
> `POST /auth/verify` → `AuthResponse { token, account }`, marked `@Public()`); admin
> bot-provisioning (`POST /accounts`, `x-admin-key` → `AuthResponse`); the leaderboard reads
> (`GET /accounts`, `GET /accounts/:id`); the global **`JwtAuthGuard`** (wired as `APP_GUARD` — it
> derives the account from the Bearer token) and the **`AdminGuard`** (`x-admin-key`); and
> `ZodValidationPipe` — all from `@arena/service-auth`. See the auth model in
> `docs/engineering/integration.md` §1. **You build the money on top:** the `Bet`/`LedgerEntry`
> models, `POST /bets`, `GET /bets`, `POST /settle`, `GET /exposure`.

## Data model (design it, then `npx prisma migrate dev`)

`Account` and `Otp` are already defined + migrated (pre-built). Add your models to
`prisma/schema.prisma` and migrate — suggested shape, refine as you see fit:

- **Account** — PRE-BUILT (`id` uuid, `email @unique` **nullable — null for bots**, `name` (not
  unique), `balance` default `OPENING_BALANCE`, `isBot`, `createdAt`). Matches `AccountSchema` in
  the contract. Reference it; don't redefine it.
- **Bet** — id, accountId, marketId, selectionId, stake, price, potentialReturn, status
  (`pending|won|lost|void` — `BetStatusSchema`), placedAt, settledAt?, **idempotencyKey `@unique`**
  (the DB enforces idempotency, not an if-statement). API shape = `BetSchema`.
- **LedgerEntry** — id, accountId, delta, balanceAfter, reason, refBetId?, createdAt —
  **append-only**: no updates, no deletes. Internal audit model (no frozen endpoint — see §5 note).

The scaffold's `PrismaService` is wired (global module); the connection string comes from
`BETTING_DATABASE_URL` (see `.env.example`). Import `OPENING_BALANCE` (10,000) from `@arena/contracts`.

## Requirements

1. **Accounts & wallets — PRE-BUILT, reference only.** Humans are find-or-created **by email** on a
   successful `POST /auth/verify` (email + OTP + optional nickname `name`); bots via admin-keyed
   `POST /accounts` `{ name, isBot }` (`CreateAccountRequestSchema`) → `AuthResponse`. A new wallet
   opens at `OPENING_BALANCE` (10,000). `GET /accounts` / `GET /accounts/:id` (Bearer; 404 unknown)
   feed the leaderboard. **There is NO name-only find-or-create in the betting domain — do not build
   it.** Your job is to move money on these wallets correctly.
2. **`POST /bets`** 🔒 Bearer — the core build. Body `PlaceBetRequestSchema`
   `{ marketId, selectionId, stake, acceptedPrice, idempotencyKey }` — **there is NO `accountId`:
   derive the account from the token** (a punter can only bet from their own wallet — no IDOR). Steps
   (see `docs/engineering/integration.md` §5):
   - **idempotency**: `idempotencyKey` is `@unique`; a replay returns the **original** bet, no second
     debit (unique constraint + catch, or upsert — let the DB be the referee).
   - **funds**: `stake > 0` and `stake ≤ balance` (the schema already caps `stake ≤ OPENING_BALANCE`
     and `positive`); reject NaN/overflow.
   - **live price check (a real HTTP call, not a local assumption)**: fetch the market from **pricing
     with a service token** — `signToken('betting')` from `@arena/service-auth` as the Bearer —
     `GET :4001/markets/:fixtureId` (or `/markets` / `/outright`); match the market by `marketId` and
     the selection by `selectionId`. The market must be `open`, and the live selection price must be
     within a betting-local **`PRICE_TOLERANCE`** (5% — betting's own constant, not a shared contract
     value; clients never assume the number) of `acceptedPrice`, else **409** (price moved / market closed).
   - lock `price` = the live price and `potentialReturn = stake × price` (decimal odds; the returned
     stake is included in `potentialReturn`).
   - in **one `$transaction`**: debit the wallet, insert the `pending` `Bet`, append a `LedgerEntry`.
     Return the `Bet`.
3. **`GET /bets?accountId=&status=`** 🔒 Bearer — the my-bets view. Validate the query with
   `BetQuerySchema` (`accountId` uuid optional, `status` optional). Reads carry no per-user check
   (integration §1): any logged-in caller may read; `accountId` is just a filter.
4. **`POST /settle`** 🔒 Bearer **+ `x-admin-key`** — called by the **simulator** with a service token
   - `BETTING_ADMIN_KEY` (finale chain: `integration.md` §4 step 5, §5). Body `SettleRequestSchema`
     `{ settlement: SettlementEvent, winningSelections: [{ marketId, selectionId }] }`. In **one
     `$transaction`**, for each settled market (the distinct `marketId`s in `winningSelections`): mark
     `pending` bets on the winning `selectionId` → **`won`** (credit `potentialReturn` + append a
     `LedgerEntry`); mark all other `pending` bets on that market → **`lost`**. Only `pending` bets are
     touched, so a repeat call is a **no-op** (idempotent per settlement). Return
     `SettleResponse { settledBets, totalPaidOut }`. Guard = global `JwtAuthGuard` + the pre-built
     `AdminGuard`.
5. **`GET /exposure`** 🔒 Bearer — the trader liability board (`ExposureReportSchema`:
   `{ generatedAt, markets[] }`). For each market with staked (`pending`) bets:
   `totalStaked` = Σ stake, `betCount`, and **`maxLiability`** = worst-case gross payout = the
   maximum, across the market's selections, of Σ `potentialReturn` of `pending` bets on that
   selection. `marketName`/`status` are pricing-owned: resolve them by persisting `marketName` at
   placement (you already fetched the market for the price check) with `status` = `settled` once
   you've settled it else `open`, **or** by a service-token `GET :4001/markets` call.

## Security (public repo + public API — see `docs/engineering/security.md`)

- Enforce every money rule **server-side**: `stake > 0`, `stake ≤ balance`, no NaN/overflow; the
  account comes from the **token**, never the body. Wallet debit + bet + ledger in one `$transaction`.
- Idempotency is a **DB unique constraint** on the key, not an `if`-check that races.
- `/settle` is guarded (Bearer + `x-admin-key`). Error bodies never expose connection strings or
  stack traces.

## Enterprise bar

- Domain rules (tolerance maths, liability maths, settlement outcomes) as pure functions with
  exhaustive unit tests — no DB needed to test the maths.
- Controllers thin; providers orchestrate; **mock `PrismaService`** in unit tests (standard
  Nest DI override). The nasty cases are the spec: double-spend, unknown selection,
  settle-twice, stake > balance, replayed idempotency key, price moved.
- Zod-validate everything inbound (a `ZodValidationPipe` is idiomatic). Meaningful 400/401/404/409s.
- ≥85% coverage on everything you commit; zero lint warnings; no cross-workstream imports.

## Definition of Done

Meet the **gates in `docs/engineering/definition-of-done.md`** (run and paste the evidence). Plus a named
passing test for each — paste the test names:

- protected endpoints (`POST /bets`, `GET /bets`, `POST /settle`, `GET /exposure`) return **401** on
  a missing/invalid token (don't `@Public()` them) · **a bet cannot set another account's id** — the
  account is derived from the token (no `accountId` in the body) · rejects stake > balance · **409
  when the live price moved > tolerance or the market is not `open`** · **replayed idempotency key
  returns the original bet, no double debit** · wallet debit + bet + ledger in one `$transaction`
  (rolls back on any failure) · settlement **credits winners** (`potentialReturn`) and marks losers
  `lost` · **settle-twice is a no-op** · `/settle` rejects a missing/wrong `x-admin-key` (**401**,
  via the pre-built `AdminGuard`; the key is `BETTING_ADMIN_KEY`)
- the exposure report's max-liability maths
- Prisma migration applied (`npx prisma migrate status` shown)

## Demo moment

Place the same bet twice with one idempotency key — one row, one debit, the unique constraint
did the work. Then settle a fixture and reconcile the `LedgerEntry` trail: every cent accounted for.

## Stretch

- Market suspend/reopen (needs a contract amendment — negotiate with the host first) → surfaces as
  `status: 'suspended'` in exposure and can `void` open bets.
- Per-account max-stake limits (responsible gambling hook — an industry must-have).
