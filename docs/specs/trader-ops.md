# Workstream: Trader Ops

**You own:** `apps/trader-ops/` — nothing else.
**Port:** 5174 · **Consumes:** betting :4002, pricing :4001, sim :4003 · **Read-only:** `contracts/`

## Mission

The back office. While punters see glamour, traders see risk: where is the book exposed, which
market could hurt us, who is winning too much. Dense, fast, dark — a Bloomberg terminal for a
World Cup book.

## Requirements

1. **Exposure board.** Poll `GET :4002/exposure` (~3s). Table: market, status, total staked,
   bet count, max liability. Sort by liability; heat-colour the liability column (green → amber
   → red against configurable thresholds). Top-line tiles: total staked, total worst-case
   liability, open market count.
2. **Punter watchlist.** `GET :4002/accounts` — balances vs the 10k opening balance, biggest
   winners flagged. This doubles as the **bot leaderboard** during the finale.
3. **Market monitor.** `GET :4001/markets` — current prices with fair probability alongside
   (the margin made visible). Highlight prices that moved since the previous poll.
4. **Settlement feed.** Poll `GET :4003/state`; as fixtures finish, append to a live feed:
   result, penalties flag, which markets settled. Newest on top.
5. Single dense screen — no routing needed. Auto-refresh indicators so traders trust the data.

## Enterprise bar

- Same typed, zod-parsing fetch layer discipline as the punter app (build your own — you can't
  import from another workstream's directory).
- Testing Library coverage of the risk maths rendering: liability sorting, heat thresholds,
  leaderboard ordering. ≥80% coverage on everything you commit; zero lint warnings.
- No new dependencies — CSS grids and bars, not chart libraries.

## Demo moment

Split screen with punter-web during the finale: punters cheer the bracket while trader-ops
shows liability draining out of settled markets and the bots' balances diverging in real time.

## Stretch

- "Suspend market" button — disabled with a tooltip: _pending contract amendment_ (governance
  joke that lands well; the endpoint doesn't exist in the frozen contract).
- Margin health: actual overround per market vs `TARGET_OVERROUND` drift.
