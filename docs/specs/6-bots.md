> **Kickoff — session 6.** Launch with `/goal` — see `docs/workshop/kickoff-prompts.md` for the exact
> condition. How goal-driven tasks work: `docs/engineering/goal-oriented-tasks.md`. CLAUDE.md (auto-loaded) has the conventions.

# Workstream: Bots

**You own:** `bots/` — nothing else.
**Consumes:** pricing :4001, betting :4002 (optionally simulator :4003) · **Read-only:** `contracts/`

## Mission

Agents built by an agent. A roster of autonomous punters with distinct personalities who open
accounts, study the markets, and bet real (virtual) money into the platform your colleagues are
building. When the sim runs, they win and lose in public.

> **Auth is REQUIRED — all services now need a JWT.** Bots have no inbox, so they **skip the
> human email→OTP login entirely** and instead **provision themselves** once at startup:
> `POST :4002/accounts { name, isBot: true }` authenticated with an **admin service token the bot
> mints itself** — `signToken('bots', { admin: true })` from `@arena/service-auth` (bots hold
> `SESSION_SECRET`), sent as `Authorization: Bearer <token>` (there is **no `x-admin-key`**) →
> returns `{ token, account }` (the `AuthResponse` shape; `account.balance` starts at
> `OPENING_BALANCE` = 10,000). This is the bot's **first** step and the **only** way it
> authenticates. Keep the **account** token it returns and send it as `Authorization: Bearer <token>`
> on **every** subsequent call (reading `GET :4001/markets` is JWT-protected too). No token → 401
> everywhere. Full bot auth row: `docs/engineering/integration.md` §1.

## Requirements

1. **Bot framework.** A bot = personality (name + emoji + strategy) + provisioned account +
   session token + loop: fetch markets (`GET :4001/markets`, Bearer → `Market[]`) → estimate
   probabilities → pick bets → size stakes → place via `POST :4002/bets` (Bearer). The body is
   exactly `PlaceBetRequest { marketId, selectionId, stake, acceptedPrice, idempotencyKey }` —
   the selection's current price as `acceptedPrice`, a fresh `crypto.randomUUID()` as
   `idempotencyKey` each attempt, and **no `accountId` (betting derives it from the token — a bot
   can only bet from its own wallet)**. Betting re-checks the live price and may reply `409` if it
   moved past tolerance or the market closed — treat that as a normal skip, not a crash
   (bet-placement flow: `docs/engineering/integration.md` §5). Log every decision with its
   reasoning — the logs are part of the show.
2. **The roster** (at least these four):
   - **📐 Sharp** — own Elo model over `TEAMS` (from `@arena/contracts`); matches each team to
     its market selection by name (**`Selection.name` == `Team.name`**, the load-bearing join —
     integration.md §3), and bets only when his fair price beats the market's; Kelly staking via
     the scaffold's `kellyStake` helper (a pure function in `bots/`, cap 10%).
   - **🎲 Mug** — random selections, loves longshots (price > 3.0), flat $200 stakes.
   - **🛡️ Steady** — shortest available price each round, flat 5% of current bankroll.
   - **🔥 Chaser** — doubles stake after a loss, resets after a win (yes, he ends badly —
     that's the point; someone in the audience will recognise the strategy).
3. **Runner.** `npm run dev -w bots` starts the roster on an interval loop (configurable via
   env, default ~10s between rounds), prints a league table (name, balance, open bets, P&L)
   after each round, exits cleanly on SIGINT. Each bot starts at `OPENING_BALANCE` (10,000);
   refresh live balance from betting `GET :4002/accounts/:id` and own bets (open + settled
   outcomes) from `GET :4002/bets?accountId=<own id>` — both plain Bearer reads (any logged-in
   caller may read; integration.md §1). Feed those settled outcomes to strategies as `history` so
   Chaser can see its last result and Steady/Sharp size off the current bankroll.
4. **Resilience.** Services may not exist yet while you build — every HTTP call handles
   connection-refused/4xx/5xx gracefully (skip round, log, retry next tick). Zod-parse every
   response against its `@arena/contracts` schema (`MarketSchema`, `AccountSchema`, `BetSchema`,
   and `SimStateSchema` if you poll simulator `GET :4003/state` — the live bracket + results,
   Bearer — to react to outcomes).
5. **Env-aware URLs.** Resolve service bases as `process.env.PRICING_URL ?? BASE_URLS.pricing`
   (same for `BETTING_URL`, plus `SIMULATOR_URL` if you poll `/state`) so the roster can be
   pointed at the deployed Render services with env vars. `BASE_URLS` and `OPENING_BALANCE` come
   from `@arena/contracts` (bots are Node, so `process.env.*`, never Vite's `import.meta.env`).

## Enterprise bar

- Strategies as pure functions `(markets, bankroll, history) → intended bets` — exhaustively
  unit-tested with fixture data (no HTTP in strategy tests).
- HTTP client in one thin module, tested with mocked fetch.
- ≥85% coverage on everything you commit; zero lint warnings.

## Definition of Done

Meet the **gates in `docs/engineering/definition-of-done.md`** (run and paste the evidence). Plus prove
these — paste the name of the test for each:

- A bot provisions itself and places an accepted bet: `POST :4002/accounts { name, isBot: true }`
  authenticated with a **minted admin service token** (`signToken('bots', { admin: true })`) returns
  `{ token, account }`, and that **account** token then places a bet betting accepts — named test
  (mocked fetch) asserting the provision call carries a `Authorization: Bearer` **admin** token
  (claims `{ sub: 'bots', admin: true }`) and **no `x-admin-key`** header, the reused account
  `Authorization: Bearer` token on the bet, and a body carrying an `idempotencyKey` with **no
  `accountId`**
- Each strategy is a pure function with a named test (Sharp bets only with edge + capped Kelly ·
  Mug longshots · Steady flat 5% · Chaser doubles-after-loss)
- The HTTP client degrades gracefully on connection-refused / 4xx / 5xx (mocked fetch) — no
  crash, skip the round
- The runner prints a league table and exits cleanly on SIGINT

## Demo moment

Four terminals of bot commentary scrolling while the trader-ops leaderboard reorders live.
Sharp grinds upward, Chaser flames out spectacularly during the sim run.

## Stretch

- **🧠 The Pundit** — a fifth bot that calls the Claude API (`@anthropic-ai/sdk` is installed;
  needs `ANTHROPIC_API_KEY` in env) to write one-line trash-talk commentary on each bet it
  places. Agents all the way down.
