# Workstream: Tournament Simulator

**You own:** `sim/` — nothing else.
**Port:** 4003 · **Contract:** `contracts/src/api.ts` (Sim section) · **Read-only:** `contracts/`

## Mission

You are fate. When the host presses the button, you play out the rest of the World Cup —
fixture by fixture — and drive the whole platform: results settle bets, reprice markets, and
animate the bracket on the big screen. You are the finale's engine.

## Requirements

1. **Bracket state.** Own an in-memory copy of `FIXTURES` (start from the scaffold's
   `initialState`). A played fixture gets scores, a winner, status `finished`; the winner
   advances into `feedsInto`/`feedsIntoSlot` on the next fixture.
2. **Result generation.** Winner drawn from Elo-derived probabilities; scores generated
   plausibly (Poisson-ish, 0–4 goals typical); level scores ⇒ `decidedOnPenalties: true`.
   RNG must be **seedable** for deterministic tests.
3. **`POST /play-next`** — simulate the next unplayed fixture in kickoff order, then notify
   the platform _in this order_:
   1. `POST pricing:4001/reprice` with the `SettlementEvent`;
   2. `POST betting:4002/settle` with the settlement + winning selections (match-winner market
      of that fixture; plus the outright market when the final is played).
      Downstream failures must not corrupt your state — log and carry on (degraded mode).
      Returns updated `SimStateSchema`.
4. **`POST /run`** — validated `RunRequestSchema`. Play everything to the final, pausing
   `intervalMs` between fixtures (async loop — respond immediately, expose progress via
   `GET /state`). The champion ends up in `SimState.champion`.
5. **`GET /state` / `POST /reset`** — as scaffolded, kept true throughout.

## Enterprise bar

- Advancement logic (winner → correct slot of correct fixture) is pure and exhaustively
  unit-tested — this is the piece that silently breaks brackets.
- HTTP calls to pricing/betting in a thin client module, zod-parsing responses, tested with
  mocked fetch.
- ≥80% coverage on everything you commit; zero lint warnings.

## Demo moment

`curl -X POST :4003/run -d '{"intervalMs": 2000}'` and the whole room watches the tournament
resolve every two seconds — bets settling, odds recomputing, bracket collapsing to a champion.

## Stretch

- Upset dial: a `chaos` parameter (0–1) flattening probabilities so longshots win more.
- Server-Sent Events stream of results so UIs don't have to poll.
