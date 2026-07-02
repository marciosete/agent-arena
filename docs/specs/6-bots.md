> **Kickoff — session 6.** Launch with `/goal` — see `docs/kickoff-prompts.md` for the exact
> condition. Build rules: `docs/live-build.md`. CLAUDE.md (auto-loaded) has the conventions.

# Workstream: Bots

**You own:** `bots/` — nothing else.
**Consumes:** pricing :4001, betting :4002 · **Read-only:** `contracts/`

## Mission

Agents built by an agent. A roster of autonomous punters with distinct personalities who open
accounts, study the markets, and bet real (virtual) money into the platform your colleagues are
building. When the sim runs, they win and lose in public.

## Requirements

1. **Bot framework.** A bot = personality (name + emoji + strategy) + account + loop:
   fetch markets → estimate probabilities → pick bets → size stakes → place via
   `POST :4002/bets` (fresh `crypto.randomUUID()` idempotency key each attempt, current price
   as `acceptedPrice`). Log every decision with its reasoning — the logs are part of the show.
2. **The roster** (at least these four):
   - **📐 Sharp** — own Elo model from `TEAMS`; bets only when his fair price beats the market;
     Kelly staking via the scaffold's `kellyStake` (cap 10%).
   - **🎲 Mug** — random selections, loves longshots (price > 3.0), flat $200 stakes.
   - **🛡️ Steady** — shortest available price each round, flat 5% of current bankroll.
   - **🔥 Chaser** — doubles stake after a loss, resets after a win (yes, he ends badly —
     that's the point; someone in the audience will recognise the strategy).
3. **Runner.** `npm run dev -w bots` starts the roster on an interval loop (configurable via
   env, default ~10s between rounds), prints a league table (name, balance, open bets, P&L)
   after each round, exits cleanly on SIGINT.
4. **Resilience.** Services may not exist yet while you build — every HTTP call handles
   connection-refused/4xx/5xx gracefully (skip round, log, retry next tick). Zod-parse all
   responses.
5. **Env-aware URLs.** Resolve service bases as `process.env.PRICING_URL ?? BASE_URLS.pricing`
   (same for betting) so the roster can be pointed at the deployed Render services with two
   env vars.

## Enterprise bar

- Strategies as pure functions `(markets, bankroll, history) → intended bets` — exhaustively
  unit-tested with fixture data (no HTTP in strategy tests).
- HTTP client in one thin module, tested with mocked fetch.
- ≥80% coverage on everything you commit; zero lint warnings.

## Definition of Done

Meet the **gates in `docs/definition-of-done.md`** (run and paste the evidence). Plus prove
these — paste the name of the test for each:

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
