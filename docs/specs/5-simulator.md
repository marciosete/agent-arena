> **Kickoff — session 5.** Launch with `/goal` — see `docs/workshop/kickoff-prompts.md` for the exact
> condition. How goal-driven tasks work: `docs/engineering/goal-oriented-tasks.md`. CLAUDE.md (auto-loaded) has the conventions.

# Workstream: Tournament Simulator

**You own:** `services/simulator/` — nothing else.
**Port:** 4003 · **Stack:** NestJS, in-memory by design · **Contract:** `contracts/src/api.ts` (Simulator section) · **Read-only:** `contracts/`

## Mission

You are fate. When the host presses the button, you play out the rest of the World Cup —
fixture by fixture — and drive the whole platform: results settle bets, reprice markets, and
animate the bracket on the big screen. You are the finale's engine.

Simulation state is deliberately **not** persisted: it's ephemeral, resettable theatre. If
anyone asks why there's no database here, that's the answer — a design decision, not a gap.

**Integration (`docs/engineering/integration.md` §2, §4).** _Called by:_ punter-web + trader-ops
poll `GET /state` for the live bracket/settlement feed; the operator (trader app or a script) hits
the control plane (`/play-next`, `/run`, `/reset`). _Calls out:_ pricing `POST /reprice` then
betting `POST /settle` after every result. You are the only writer that fans out.

## Requirements

1. **Bracket state.** Own an in-memory copy of `FIXTURES` (the scaffold's `SimulatorService`
   starts it). A played fixture gets scores, a winner, status `finished`; the winner advances
   into `feedsInto`/`feedsIntoSlot` on the next fixture.
2. **Result generation.** Winner drawn from **Elo-derived** win probabilities — the standard
   logistic curve `P(home) = 1 / (1 + 10^((eloAway − eloHome) / 400))` over the two slots' `Team.elo`
   (look teams up in `TEAMS`); scores generated plausibly (Poisson-ish, 0–4 goals typical) and **kept
   consistent with the drawn winner** (winner's goals ≥ loser's; equal ⇒ `decidedOnPenalties: true`,
   `winnerTeamId` = the drawn winner). `homeScore`/`awayScore` are oriented to the fixture's
   `homeTeamId`/`awayTeamId`. RNG must be **seedable** for deterministic tests.
3. **`POST /play-next` — the finale chain.** Simulate the next unplayed fixture in kickoff order
   (both slots are filled by the time you reach it — advancement guarantees it; if nothing is
   unplayed, it's a no-op returning current state), then drive the settlement pipeline — **the one
   sequence to get right (`docs/engineering/integration.md` §4):**
   1. Build a `SettlementEvent { fixtureId, winnerTeamId, homeScore, awayScore, decidedOnPenalties,
settledAt }` from the played fixture.
   2. `POST pricing /reprice` with `RepriceRequestSchema` `{ settlement }`. Pricing advances the
      bracket, settles that fixture's market, reprices downstream + outright, and **returns the
      updated `Market[]`**.
   3. **Resolve `winningSelections` FROM that returned `Market[]` — the fragile step (the §3 join).**
      For the just-settled `MATCH_WINNER` market (the one with `fixtureId === settlement.fixtureId`),
      pick the `Selection` whose `name` equals the winner's team name (`teamById(winnerTeamId).name`
      from `TEAMS`). When the **final** is played, ALSO add the `OUTRIGHT` market's (`type:
'OUTRIGHT'`, `fixtureId: null`) selection whose `name` matches the champion. Resolve ids **by
      team name from pricing's response — never guess an id format** (pricing owns selection ids).
   4. `POST betting /settle` with `SettleRequestSchema` `{ settlement, winningSelections }`.

   Downstream failures must not corrupt your state — log and carry on (degraded mode). Returns the
   updated `SimState`.

4. **`POST /run`** — validated `RunRequestSchema`. Play everything to the final, pausing
   `intervalMs` between fixtures (async loop — respond immediately, expose progress via
   `GET /state`). The champion ends up in `SimState.champion`.
5. **`GET /state` / `POST /reset`** — as scaffolded, kept true throughout. `GET /state` returns
   `SimState`, whose **`fixtures: Fixture[]` is the live bracket and the ONLY source of live results**
   the punter bracket + trader feed render from (`docs/engineering/integration.md` §3): played
   fixtures carry `status: 'finished'`, scores, `winnerTeamId`, and the winner propagated into the
   next fixture's slot. You hold the single mutable copy in memory; `POST /reset` restores the seed.

**Security — everything requires auth; the control plane needs admin on top.** Register the shared
`JwtAuthGuard` from `@arena/service-auth` globally (`APP_GUARD`) and mark `GET /health` `@Public()`
— so **every endpoint (incl. `GET /state`) requires a valid JWT**. The control endpoints
`POST /play-next`, `POST /run`, `POST /reset` ALSO carry `@UseGuards(AdminGuard)` — the shared,
identity-based guard from `@arena/service-auth`: a JWT proves _authenticated_, and the token's
`admin` claim proves _authorized_ to drive the finale. No `x-admin-key`.

**Outbound calls need an admin service token.** When you call pricing (`/reprice`, and `/reset` in
the cascade) and betting (`/settle`, and `/reset` in the cascade) — all JWT-protected, and the
mutating ones admin-only — sign an **admin service JWT** with `signToken('simulator', { admin: true })`
from `@arena/service-auth` (it reads the shared `SESSION_SECRET`) and send it as `Authorization: Bearer`.
The `admin` claim carries the authority — there is no `x-admin-key`. Full platform auth model:
`docs/engineering/integration.md` §1.

## Enterprise bar

- Advancement logic (winner → correct slot of correct fixture) is pure and exhaustively
  unit-tested — this is the piece that silently breaks brackets.
- HTTP calls to pricing/betting in one thin injectable client — resolve base URLs env-first
  (`process.env.PRICING_URL ?? BASE_URLS.pricing`, `process.env.BETTING_URL ?? BASE_URLS.betting`),
  attach the admin service token (the `admin` claim authorizes settle/reset — no `x-admin-key`), and
  zod-parse every response (`MarketSchema`, `SettleResponseSchema`, `ResetResponseSchema`). Tested with mocked fetch.
- ≥85% coverage on everything you commit; zero lint warnings; no cross-workstream imports.

## Definition of Done

Meet the **gates in `docs/engineering/definition-of-done.md`** (run and paste the evidence). Plus prove
these — paste the name of the test for each:

- **Bracket advancement** puts each winner in the correct slot of the correct next fixture, all
  the way to the final
- Result generation is deterministic under a fixed seed
- **`winningSelections` resolves the winning `selectionId` BY team name** from a real-shaped
  `Market[]` (the §3 join) — including the `OUTRIGHT` champion when the final is played
- **Control endpoints require admin** (`/play-next`, `/run`, `/reset`): **403** for a valid
  **non-admin** token, **401** for a missing/invalid token, success for a token with the `admin`
  claim (shared `AdminGuard`); `GET /state` requires any valid Bearer JWT
- **`GET /state` exposes the live bracket** — a played fixture shows `finished` + scores +
  `winnerTeamId` + the advanced winner in the next slot; **the bracket persists** (write-through to
  Postgres + reload on boot), so a restart doesn't lose it
- `POST /play-next`, `POST /run`, `GET /state`, `POST /reset` all work; `play-next` calls
  pricing `/reprice` then betting `/settle` (mocked fetch) and survives either being down;
  **`/reset` cascades** to pricing `/reset` + betting `/reset` (and degrades gracefully if either is down)

## Demo moment

`curl -X POST :4003/run -d '{"intervalMs": 2000}' -H 'content-type: application/json' -H
"authorization: Bearer $ADMIN_JWT"` (an admin operator's token, or a service token) and the whole
room watches the tournament resolve every two seconds — bets settling, odds recomputing, bracket
collapsing to a champion.

## Stretch

- Upset dial: a `chaos` parameter (0–1) flattening probabilities so longshots win more.
- Server-Sent Events stream of results so UIs don't have to poll.
