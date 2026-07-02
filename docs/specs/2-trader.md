> **Kickoff — session 2.** Launch with `/goal` — see `docs/kickoff-prompts.md` for the exact
> condition. CLAUDE.md auto-loads (shared rules + universal Definition of Done).

# Workstream: Trader Ops

**You own:** `apps/trader-ops/` — nothing else.
**Port:** 5174 · **Consumes:** betting :4002, pricing :4001, simulator :4003 · **Read-only:** `contracts/`

## Mission

The back office. While punters see glamour, traders see risk: where is the book exposed, which
market could hurt us, who is winning too much. Dense, fast, dark — a Bloomberg terminal for a
World Cup book.

> **Build order: flags release panel → exposure board → leaderboard → market monitor +
> settlement feed.** The flags panel ships first because it's the release console the host
> drives the whole show from. Post a one-line progress update as you finish each. See
> `docs/mental-map.md`.

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
5. **Release console: the feature-flag panel.** List `GET :4004/flags` with toggle switches;
   flipping one calls `PUT :4004/flags/:key` (optimistic UI, roll back on error). This panel
   is how features get RELEASED to production during the show — give it the gravitas of a
   deploy button, including a confirm on flips. Show each flag's key, description, state and
   last-updated time. **Writes are guarded**: the PUT needs an `x-admin-key` header. Never
   bake the key into the bundle — prompt for it once (small inline form), keep it in
   localStorage, send it on every flip, and surface a clear message on 401.
6. Single dense screen — no routing needed. Auto-refresh indicators so traders trust the data.

All service URLs must resolve as `import.meta.env.VITE_<SERVICE>_URL ?? BASE_URLS.<service>`
(see punter-web's scaffold `App.tsx` for the pattern) — the same build runs on localhost and
on Vercel against the Render services.

## Enterprise bar

- Same typed, zod-parsing fetch layer discipline as the punter app (build your own — you can't
  import from another workstream's directory).
- Testing Library coverage of the risk maths rendering: liability sorting, heat thresholds,
  leaderboard ordering. ≥80% coverage on everything you commit; zero lint warnings.
- No new dependencies — CSS grids and bars, not chart libraries.

## Definition of Done

Meet the **universal gates in `CLAUDE.md`** (run + paste the evidence: tests, typecheck, lint,
≥85% coverage, build; own directory only; contracts frozen; no deps; not pushed). Plus prove
these — paste the name of the test for each:

- Flags panel flips a flag via `PUT :4004/flags/:key` with the `x-admin-key` header (key from a
  prompt, kept in localStorage); 401 surfaced clearly
- Exposure board (heat thresholds), leaderboard ordering, market monitor, and settlement feed
  each render from their endpoint

## Demo moment

Split screen with punter-web during the finale: punters cheer the bracket while trader-ops
shows liability draining out of settled markets and the bots' balances diverging in real time.

## Stretch

- "Suspend market" button — disabled with a tooltip: _pending contract amendment_ (governance
  joke that lands well; the endpoint doesn't exist in the frozen contract).
- Margin health: actual overround per market vs `TARGET_OVERROUND` drift.
