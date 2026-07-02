# Glossary — the betting domain

The ubiquitous language of this sportsbook: the terms used across the specs, the contracts, and
the code. Read this to speak the domain fluently.

## The cast

| Term                                 | Meaning                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Bookmaker / the house / the book** | The party offering odds and taking bets. Our platform _is_ the bookmaker; "the book" also means the set of bets taken on a market. |
| **Punter**                           | The customer placing bets (Australian/British usage — the audience's native dialect).                                              |
| **Trader / trading desk**            | Bookmaker staff who set prices and manage risk. Trader-ops is their console.                                                       |
| **Sharp**                            | A skilled, profitable bettor with a real edge. The bot "Sharp" bets only when his model beats the market.                          |
| **Mug punter**                       | A recreational bettor with no edge, betting for fun. Bookmakers love them.                                                         |

## Markets and prices

| Term                                 | Meaning                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fixture**                          | A scheduled match between two teams (e.g. `R16-2`: Paraguay v France).                                                                                                                                                            |
| **Market**                           | A thing you can bet on about a fixture or tournament (e.g. _match winner_). Has a status: `open`, `suspended`, `settled`.                                                                                                         |
| **Selection**                        | One choosable outcome inside a market (France to win; Brazil to lift the trophy).                                                                                                                                                 |
| **Match-winner market**              | "Who wins this game?" In knockout football it's **two-way** — extra time and penalties guarantee a winner, so no draw selection.                                                                                                  |
| **Outright market**                  | Tournament-level market: who wins the whole World Cup. One selection per team still alive.                                                                                                                                        |
| **Odds / price**                     | Interchangeable words. We use **decimal odds**: your total return per $1 staked. $100 at 2.50 returns $250 (=$150 profit).                                                                                                        |
| **Implied probability**              | `1 / decimal price`. A price of 2.50 implies 40%.                                                                                                                                                                                 |
| **Fair price**                       | The price with no profit margin: `1 / true probability`.                                                                                                                                                                          |
| **Margin / overround / vig / juice** | The bookmaker's edge: selling every selection slightly _shorter_ (cheaper) than fair. The implied probabilities of a market then sum to more than 100% — our `TARGET_OVERROUND` of 1.05 means they sum to 105%, i.e. a 5% margin. |
| **Price movement / drift**           | Prices changing as new information (or new results) arrives. Punter-web flashes moved prices; betting-core rejects stale ones.                                                                                                    |
| **Suspending a market**              | Temporarily halting bets — done when the price is uncertain (goal just scored, news breaking).                                                                                                                                    |

## Bets and money

| Term                   | Meaning                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stake**              | The amount wagered.                                                                                                                                                           |
| **Potential return**   | `stake × price` — what a winning bet pays back (stake included).                                                                                                              |
| **Bankroll**           | A bettor's total funds. Every account here opens with $10,000 virtual.                                                                                                        |
| **Settlement**         | Resolving bets once the result is known: winners credited, losers closed. Must be **idempotent** — settling twice must not pay twice.                                         |
| **Void bet**           | A cancelled bet, stake returned (e.g. fixture abandoned). In the contract's `BetStatus`.                                                                                      |
| **Ledger / audit log** | Immutable record of every balance movement. The "show me where the money went" table — non-negotiable in real wagering systems.                                               |
| **Idempotency key**    | Client-generated unique ID sent with a bet. If the request retries (double-click, network blip), the server returns the original bet instead of taking the money twice.       |
| **Price tolerance**    | On placement the client says the price it saw (`acceptedPrice`); the server rejects (HTTP 409) if the real price has moved beyond 5% — protects both sides from stale prices. |

## Risk (the trader's view)

| Term              | Meaning                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Liability**     | What a market would pay out if a given selection wins. **Max liability** = the worst case across selections — the number that keeps traders awake. |
| **Exposure**      | Aggregate risk across markets: total staked, liabilities, where the book is lopsided. `GET /exposure` is trader-ops' heartbeat.                    |
| **Balanced book** | Stakes spread so the bookmaker profits whatever happens (the margin does the work). A lopsided book = real risk on one outcome.                    |
| **P&L**           | Profit and loss. The bot leaderboard is P&L against the $10k opening balance.                                                                      |

## Betting strategy (the bots)

| Term                 | Meaning                                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Edge / value bet** | Betting when _your_ estimated probability beats the price's implied probability. Positive expected value; the only way to win long-term.                                                                                                                                               |
| **Kelly criterion**  | Optimal stake sizing: bet the fraction of bankroll `(b·p − q)/b` where `b` = price − 1, `p` = your win probability, `q = 1−p`. Maximises long-run growth; we cap it at 10% (a "fractional Kelly") because full Kelly is a rollercoaster. Already implemented in `bots/src/staking.ts`. |
| **Flat staking**     | Same stake (or same % of bankroll) every bet. Boring, sensible — bot "Steady".                                                                                                                                                                                                         |
| **Martingale**       | Double your stake after each loss to "win it all back". Mathematically ruinous — bot "Chaser" exists to demonstrate it publicly.                                                                                                                                                       |
| **Arbitrage (arb)**  | Exploiting price differences to lock in profit regardless of outcome.                                                                                                                                                                                                                  |
| **Longshot**         | A low-probability, high-price selection (price > ~3.0). Mug's favourite food.                                                                                                                                                                                                          |

## Modelling (the quant's view)

| Term                       | Meaning                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Elo rating**             | A single number for team strength (chess heritage). Win probability from ratings: `P(A) = 1 / (1 + 10^((eloB − eloA)/400))`. Our seed data carries an Elo per team; ~200 points ≈ 76% favourite.                                                     |
| **Monte Carlo simulation** | Estimate probabilities by simulating something random many times and counting outcomes. Pricing runs the remaining bracket ≥10,000 times to price the outright: France wins 2,100 of 10,000 sims → 21% → fair price 4.76 → offered ~4.5 with margin. |
| **Poisson (goals model)**  | Classic assumption that goals scored follow a Poisson distribution — used by sim to invent plausible scorelines (0–4 goals typical).                                                                                                                 |
| **Seedable RNG**           | A random generator whose sequence is reproducible from a seed — how you unit-test "random" simulations deterministically.                                                                                                                            |

## Tournament structure

| Term                          | Meaning                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Knockout / bracket**        | Single-elimination phase: R32 → R16 (Round of 16) → QF (quarter-finals) → SF (semi-finals) → F (final). 2026 is the first 48-team World Cup, hence a Round of 32.                                         |
| **feedsInto / feedsIntoSlot** | Our contract's bracket wiring: which next fixture a winner advances to, and whether they land in the `home` or `away` slot. The sim's advancement logic and the bracket visual both hang off these links. |
| **TBD slot**                  | A fixture whose team(s) aren't known yet (`null` in seed data) because the feeding game hasn't been played. Un-priceable until filled.                                                                    |
| **Decided on penalties**      | Level after extra time → penalty shootout. Flagged on settlements (`decidedOnPenalties`) — still produces a winner for match-winner markets.                                                              |
