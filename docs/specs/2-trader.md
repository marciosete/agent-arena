> **Kickoff — session 2.** Launch with `/goal` — see `docs/workshop/kickoff-prompts.md` for the exact
> condition. How goal-driven tasks work: `docs/engineering/goal-oriented-tasks.md`. CLAUDE.md (auto-loaded) has the conventions.

# Workstream: Trader Ops

**You own:** `apps/trader-ops/` — nothing else.
**Port:** 5174 · **Consumes:** betting :4002, pricing :4001, simulator :4003, flags :4004 · **Read-only:** `contracts/`

## Mission

The back office. While punters see glamour, traders see risk: where is the book exposed, which
market could hurt us, who is winning too much. Dense, fast, dark — a Bloomberg terminal for a
World Cup book.

> **Build order: flags release panel → exposure board → leaderboard → market monitor +
> settlement feed.** The flags panel ships first because it's the release console the host
> drives the whole show from. Post a one-line progress update as you finish each. See
> `docs/workshop/mental-map.md`.

> **Auth is pre-built and REQUIRED.** trader-ops is gated behind login (`@arena/web-auth`, shared
> with the punter app): no valid JWT → `/login`. Wrap the app in
> `<AuthProvider bettingUrl={…}><RequireAuth>…</RequireAuth></AuthProvider>` and send the token on
> every call (use its `apiFetch`) — **all services now require a JWT**. Any logged-in user can read
> these boards; **flipping a flag is an admin write** and needs the flags admin key
> (`FLAGS_ADMIN_KEY`) sent as `x-admin-key` _on top of_ the JWT (the panel prompts for it, never
> bundled). The leaderboard shows each account's **nickname** (the `name` field, set at signup). The
> auth model is `docs/engineering/integration.md` §1; every wire this app makes — endpoint + auth —
> is §2. Read both first.

## Requirements

1. **Exposure board.** Poll `GET :4002/exposure` (~3s) → `ExposureReport`
   (`{ generatedAt, markets[] }`; each market `{ marketId, marketName, totalStaked, maxLiability,
betCount, status: open|suspended|settled }`). Table: market, status, total staked, bet count,
   max liability. Sort by liability; heat-colour the liability column (green → amber → red against
   configurable thresholds). Top-line tiles: total staked, total worst-case liability, open market count.
2. **Punter watchlist.** `GET :4002/accounts` → `Account[]` — each row keyed by the account's
   `name` (nickname) and `balance`, measured against the `OPENING_BALANCE` (10k) every account
   starts with; biggest winners flagged. This doubles as the **bot leaderboard** during the finale.
3. **Market monitor.** `GET :4001/markets` — current prices with fair probability alongside
   (the margin made visible). Highlight prices that moved since the previous poll.
4. **Settlement feed.** Poll `GET :4003/state` → `SimState` (live `fixtures` + `champion`; the ONLY
   source of live scores/winners — `docs/engineering/integration.md` §3). As a fixture flips to
   `finished`, append to a live feed (newest on top): result, penalties flag (`Fixture` has no such
   boolean — derive it: level score `homeScore == awayScore` with a `winnerTeamId` ⇒ decided on
   pens), and which `MATCH_WINNER` market settled (join by `fixtureId`). **Optional finale control:**
   drive the show with simulator `POST :4003/play-next` · `/run` · `/reset`, each **Bearer +
   `x-admin-key`** (`SIMULATOR_ADMIN_KEY` — a _different_ key from the flags one; reuse the
   inline-prompt pattern from the flag panel). Full result→settle pipeline: `integration.md` §4.
5. **Release console: the feature-flag panel.** List `GET :4004/flags` (Bearer read) →
   `FeatureFlag[]` with toggle switches; flipping one calls `PUT :4004/flags/:key` with body
   `{ enabled }` (optimistic UI, roll back on error). This panel is how features get RELEASED to
   production during the show (`docs/engineering/integration.md` §6) — give it the gravitas of a
   deploy button, including a confirm on flips. Show each flag's `key`, `description`, `enabled`
   state and `updatedAt` last-updated time. **Writes need a second gate**: the PUT requires the
   flags admin key (`FLAGS_ADMIN_KEY`) sent as an `x-admin-key` header _in addition to_ the Bearer
   JWT — a read-only JWT alone is rejected. Never bake the key into the bundle — prompt for it once
   (small inline form), keep it in localStorage, send it on every flip, and surface a clear message on 401.
6. Single dense screen — no routing needed. Auto-refresh indicators so traders trust the data.

All service URLs must resolve as `import.meta.env.VITE_<SERVICE>_URL ?? BASE_URLS.<service>`
(see punter-web's scaffold `App.tsx` for the pattern) — the same build runs on localhost and
on Vercel against the Render services.

## Enterprise bar

- Same typed, zod-parsing fetch layer discipline as the punter app (build your own — you can't
  import from another workstream's directory).
- Testing Library coverage of the risk maths rendering: liability sorting, heat thresholds,
  leaderboard ordering. ≥85% coverage on everything you commit; zero lint warnings.
- No new dependencies — CSS grids and bars, not chart libraries.

## Definition of Done

Meet the **gates in `docs/engineering/definition-of-done.md`** (run and paste the evidence). Plus prove
these — paste the name of the test for each:

- **No token ⇒ `/login`**: an unauthenticated visit redirects to the login route (`RequireAuth`),
  and every read (`/exposure`, `/accounts`, `/markets`, `/state`, `/flags`) carries the Bearer JWT
  via `apiFetch`
- Flags panel flips a flag via `PUT :4004/flags/:key` (body `{ enabled }`) with the `x-admin-key`
  header (key from a prompt, kept in localStorage) — and a flip **without** the admin key is
  rejected and surfaced clearly (401)
- Exposure board (heat thresholds), leaderboard ordering, market monitor, and settlement feed
  each render from their endpoint

## Demo moment

Split screen with punter-web during the finale: punters cheer the bracket while trader-ops
shows liability draining out of settled markets and the bots' balances diverging in real time.

## Stretch

- "Suspend market" button — disabled with a tooltip: _pending contract amendment_ (governance
  joke that lands well; the endpoint doesn't exist in the frozen contract).
- Margin health: actual overround per market vs `TARGET_OVERROUND` drift.
