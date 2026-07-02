# Workstream: Punter Web

**You own:** `apps/punter-web/` — nothing else.
**Port:** 5173 · **Consumes:** pricing :4001, betting :4002, simulator :4003 · **Read-only:** `contracts/`

## Mission

The face of the platform. A dark, premium sportsbook where the audience browses World Cup
markets, places bets, and watches the **Road to the Final** — a circular knockout bracket
radiating from a glowing golden trophy. This is the screen everyone photographs.

> **Build/reveal order (not requirement order): bracket → markets → bet slip → my bets →
> confetti.** The bracket ships first because it renders from `@arena/contracts` + the
> simulator's `/state` alone (no other service), so it's the fastest big visual. Each feature
> is gated behind its flag; post a one-line progress update as you finish each. See
> `docs/mental-map.md`.

## Requirements

1. **Account bootstrap.** On first visit, create an account via `POST :4002/accounts` (prompt
   for a punter name), persist the account id in `localStorage`, show balance in the header —
   kept fresh after every bet.
2. **Markets page.** Fixtures with odds from `GET :4001/markets`, grouped by round, team names
   and flags from `@arena/contracts` `TEAMS`. Poll every ~5s; prices that changed since last
   poll flash. Suspended/settled markets render appropriately.
3. **Bet slip.** Click a price → slip (selection, price, stake input, potential return). Submit
   via `POST :4002/bets` with a fresh `crypto.randomUUID()` idempotency key and the displayed
   price as `acceptedPrice`. Handle 409 price-moved gracefully (show new price, ask again).
4. **My bets.** `GET :4002/bets?accountId=` — pending/won/lost with returns. Poll during
   simulator runs.
5. **⭐ The bracket.** An SVG circular knockout bracket in the style of the event's key art:
   fixtures as nodes on concentric rings (R32 outside → final at the centre), team flags/names
   on nodes, golden trophy glow in the middle. Fed by `FIXTURES` + `GET :4003/state`: played
   fixtures show scores, winner paths light up golden toward the centre, eliminated teams dim.
   During `POST /run` it must visibly animate as results land (poll ~1s while a run is active).
6. **Everything ships dark: feature flags gate every surface.** Poll `GET :4004/flags`
   (~3s) and render each feature only when its flag is on: `punter-markets` → markets page,
   `punter-bet-slip` → bet slip, `punter-my-bets` → my bets, `punter-bracket` → the bracket,
   `punter-confetti` → confetti. Dark means _absent_ — no teasers, no disabled stubs. A flag
   flip must reveal the feature within seconds, no reload. This is how the host releases
   features live during the show.
7. The scaffold already provides the two release-story surfaces: the **flag-driven nav**
   (a feature's nav item appears the moment its flag flips) and the **`/status` page**
   (service health dots). Build each feature as the page behind its nav item, and keep both
   surfaces working.

All service URLs must resolve as `import.meta.env.VITE_<SERVICE>_URL ?? BASE_URLS.<service>`
(see the scaffold's `App.tsx`) — the same build runs on localhost and on Vercel against the
Render services.

## Enterprise bar

- A typed fetch layer that zod-parses every response against contract schemas — no `any` data.
- Components tested with Testing Library (mocked fetch): markets render, slip math, 409 flow,
  bracket advancement rendering. ≥80% coverage on everything you commit; zero lint warnings.
- No new dependencies — SVG by hand, CSS animations, native fetch.

## Demo moment

The finale: the simulator runs, and for two minutes the bracket eats itself alive — paths
igniting ring by ring until one flag sits beside the trophy. Bets flip to won/lost in the
corner as it happens.

## Stretch

- Cash-out teaser: show live value of pending bets as odds move.
- Confetti burst (CSS only) when the champion is decided.
