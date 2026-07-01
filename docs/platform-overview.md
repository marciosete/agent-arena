# Platform overview — features after the build, and the stack underneath

## What exists after the 3 hours (by service)

### Pricing engine (`services/pricing`, :4001)

- Elo-based win probabilities for every fixture whose two teams are known
- Two-way match-winner market per fixture, priced with a 5% margin (`TARGET_OVERROUND`)
- Outright tournament-winner market priced by ≥10,000-run Monte Carlo simulation of the
  remaining bracket
- `GET /markets`, `GET /markets/:fixtureId`, `GET /outright`
- `POST /reprice`: applies a settlement, advances the winner through the bracket, marks the
  settled market, prices newly-completed fixtures, recomputes the outright
- Deterministic (seeded) simulation tests; every response provably matches `MarketSchema`
- _Stretch:_ round filtering, per-market price history

### Betting core (`services/betting`, :4002)

- Account creation with $10,000 opening balance; account lookup and listing
- Wallets with atomic debit/credit and an immutable ledger (audit trail) per account
- Bet placement with the full rulebook: balance check, market-open check, 5% price tolerance
  (409 on stale prices), idempotency keys (retries can never double-charge)
- Bet listing filterable by account and status
- Idempotent settlement: winning bets paid `potentialReturn`, losers closed, settle-twice is a no-op
- Exposure report: per-market total staked, bet count, max liability — the trader feed
- _Stretch:_ market suspend/reopen, per-account stake limits (responsible gambling hook)

### Tournament simulator (`sim`, :4003)

- Owns live bracket state seeded from the real World Cup fixtures
- Elo-weighted, seedable result generation with plausible scorelines and penalty shootouts
- `POST /play-next`: resolves one fixture, advances the winner, notifies pricing (reprice) and
  betting (settle) — resilient if either is down
- `POST /run`: fast-forwards the whole tournament with configurable pacing (the finale button)
- `GET /state` (poll target for both UIs), `POST /reset`
- _Stretch:_ chaos dial (more upsets), Server-Sent Events result stream

### Punter web (`apps/punter-web`, :5173)

- Account bootstrap on first visit, persisted in localStorage; live balance in the header
- Markets by round with team flags; ~5s polling; price changes flash
- Bet slip: stake entry, potential-return maths, idempotent submission, graceful
  price-moved (409) recovery
- My-bets view: pending/won/lost with returns, live during sim runs
- **The circular Road-to-the-Final bracket** (hand-rolled SVG): fixtures on concentric rings,
  winner paths igniting gold toward the trophy, animating live as the sim plays
- Service-health footer (the scaffold's dots, kept)
- _Stretch:_ cash-out teaser, CSS confetti for the champion

### Trader ops (`apps/trader-ops`, :5174)

- Exposure board: per-market staked/bets/max-liability, heat-coloured, liability-sorted,
  with top-line risk tiles
- Punter watchlist doubling as the bot leaderboard (balances vs the $10k open)
- Market monitor: offered price vs fair probability (margin made visible), movement highlights
- Live settlement feed: results, penalty flags, which markets settled
- _Stretch:_ disabled "suspend" button (contract-governance joke), overround drift monitor

### Bots (`bots`)

- Framework: each bot = personality + account + loop (observe markets → estimate → size stake →
  bet with idempotency key), narrating decisions in character
- Roster: **Sharp** (own Elo model, bets only with edge, Kelly staking), **Mug** (random
  longshots, flat $200), **Steady** (favourites, flat 5% of bankroll), **Chaser** (martingale —
  doomed by design)
- League-table printout each round; graceful handling of missing services; clean SIGINT exit
- _Stretch:_ **The Pundit** — a fifth bot calling the Claude API for trash-talk commentary

## Tech stack

### Shared foundation (root)

| Layer                  | Choice                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Runtime / package mgmt | Node 22, npm workspaces (single lockfile, hoisted deps)                                                             |
| Language               | TypeScript 5.9, `strict`, source-run (no build step for services)                                                   |
| Contracts & validation | zod 3 schemas in `@arena/contracts` — types + runtime validation + seed data                                        |
| Testing                | Vitest 3 + V8 coverage in every workspace                                                                           |
| Lint/format            | ESLint 9 flat config (typescript-eslint, **sonarjs**, **security**, react-hooks) + Prettier 3, zero-warnings policy |
| Quality gates          | husky 9 + lint-staged 16, gitleaks (secrets), shellcheck, jscpd (duplication), npm audit, OSV-Scanner               |
| CI                     | GitHub Actions: quality, secret-scan, security-audit, license-compliance workflows                                  |
| Dev orchestration      | concurrently (`npm run dev` = all five processes, colour-coded)                                                     |

### Per workspace

| Workspace          | Runs as                                       | Key dependencies                                                        | Test environment        |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------------------- | ----------------------- |
| `contracts`        | imported source package (no server, no build) | zod                                                                     | node                    |
| `services/pricing` | tsx watch (TS executed directly)              | fastify 5, @fastify/cors, @arena/contracts                              | node, `app.inject()`    |
| `services/betting` | tsx watch                                     | fastify 5, @fastify/cors, @arena/contracts                              | node, `app.inject()`    |
| `sim`              | tsx watch                                     | fastify 5, @fastify/cors, @arena/contracts                              | node, `app.inject()`    |
| `apps/punter-web`  | Vite 7 dev server                             | React 19, @arena/contracts; SVG/CSS by hand — no UI/chart libs          | jsdom + Testing Library |
| `apps/trader-ops`  | Vite 7 dev server                             | React 19, @arena/contracts; CSS grids/bars — no chart libs              | jsdom + Testing Library |
| `bots`             | tsx CLI loop                                  | @arena/contracts, native fetch, @anthropic-ai/sdk (Pundit stretch only) | node, mocked fetch      |

Design choices worth narrating: **no databases** (in-memory stores behind repository
interfaces — the seam where Postgres would slot in), **no HTTP client libraries** (native
fetch + zod parsing), **no UI component libraries** (the bracket is hand-rolled SVG), and
**contracts as a source package** — every service imports the same TypeScript, so a contract
violation is a compile error, not a runtime surprise. Sessions may not add dependencies;
everything above is pre-installed.
