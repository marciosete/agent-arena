> **Kickoff — session 5.** Launch with `/goal` — see `docs/kickoff-prompts.md` for the exact
> condition. CLAUDE.md auto-loads (shared rules + universal Definition of Done).

# Workstream: Tournament Simulator

**You own:** `services/simulator/` — nothing else.
**Port:** 4003 · **Stack:** NestJS, in-memory by design · **Contract:** `contracts/src/api.ts` (Simulator section) · **Read-only:** `contracts/`

## Mission

You are fate. When the host presses the button, you play out the rest of the World Cup —
fixture by fixture — and drive the whole platform: results settle bets, reprice markets, and
animate the bracket on the big screen. You are the finale's engine.

Simulation state is deliberately **not** persisted: it's ephemeral, resettable theatre. If
anyone asks why there's no database here, that's the answer — a design decision, not a gap.

## Requirements

1. **Bracket state.** Own an in-memory copy of `FIXTURES` (the scaffold's `SimulatorService`
   starts it). A played fixture gets scores, a winner, status `finished`; the winner advances
   into `feedsInto`/`feedsIntoSlot` on the next fixture.
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

**Security — the control plane is guarded.** `/reset` already carries `@UseGuards(AdminGuard)`;
your `POST /play-next` and `POST /run` MUST carry it too. The guard requires the `x-admin-key`
header to match `SIMULATOR_ADMIN_KEY` (reads stay public; local dev without the key stays open).
The deployed simulator drives the finale — an unguarded control endpoint is a live-demo
hijack waiting to happen. When the simulator calls betting `/settle`, send its own admin key
in the header too (betting's settle endpoint should be guarded — coordinate with that spec).

## Enterprise bar

- Advancement logic (winner → correct slot of correct fixture) is pure and exhaustively
  unit-tested — this is the piece that silently breaks brackets.
- HTTP calls to pricing/betting in one thin injectable client, zod-parsing responses, tested
  with mocked fetch.
- ≥85% coverage on everything you commit; zero lint warnings; no cross-workstream imports.

## Definition of Done

Meet the **universal gates in `CLAUDE.md`** (run + paste the evidence: tests, typecheck, lint,
≥85% coverage, build; own directory only; contracts frozen; no deps; not pushed). Plus prove
these — paste the name of the test for each:

- **Bracket advancement** puts each winner in the correct slot of the correct next fixture, all
  the way to the final
- Result generation is deterministic under a fixed seed
- `POST /play-next`, `POST /run`, `GET /state`, `POST /reset` all work; `play-next` calls
  pricing `/reprice` then betting `/settle` (mocked fetch) and survives either being down

## Demo moment

`curl -X POST :4003/run -d '{"intervalMs": 2000}' -H 'content-type: application/json'` and the
whole room watches the tournament resolve every two seconds — bets settling, odds recomputing,
bracket collapsing to a champion.

## Stretch

- Upset dial: a `chaos` parameter (0–1) flattening probabilities so longshots win more.
- Server-Sent Events stream of results so UIs don't have to poll.
