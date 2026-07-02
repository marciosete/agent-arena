# Platform overview — features after the build, and the stack underneath

## What exists after the 3 hours (by service)

### Pricing engine (`services/pricing`, :4001)

- Elo-based win probabilities for every fixture whose two teams are known
- Two-way match-winner market per fixture, priced with a 5% margin (`TARGET_OVERROUND`)
- Outright tournament-winner market priced by ≥10,000-run Monte Carlo simulation of the
  remaining bracket
- **Markets and selections persisted in Postgres via Prisma** — prices survive restarts;
  models designed and migrated live during the build
- `GET /markets`, `GET /markets/:fixtureId`, `GET /outright`
- `POST /reprice`: applies a settlement, advances the winner through the bracket, marks the
  settled market, prices newly-completed fixtures, recomputes the outright — all persisted
- Deterministic (seeded) simulation tests; every response provably matches `MarketSchema`
- _Stretch:_ round filtering, price history (PriceSnapshot table)

### Betting core (`services/betting`, :4002)

- Account creation with $10,000 opening balance; account lookup and listing
- **Postgres-backed money**: wallets, bets and an append-only ledger (audit trail), designed
  and migrated live; every balance movement is a ledger row
- Bet placement with the full rulebook: balance check, market-open check, 5% price tolerance
  (409 on stale prices), **database-enforced idempotency** (unique constraint on the key),
  debit + bet + ledger in one `$transaction`
- Bet listing filterable by account and status
- Idempotent settlement: winning bets paid `potentialReturn`, losers closed, settle-twice is a no-op
- Exposure report: per-market total staked, bet count, max liability — the trader feed
- _Stretch:_ market suspend/reopen, per-account stake limits (responsible gambling hook)

### Tournament simulator (`services/simulator`, :4003)

- Owns live bracket state seeded from the real World Cup fixtures — **in-memory by design**
  (ephemeral, resettable theatre; the deliberate counter-example to the persisted services)
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
- My-bets view: pending/won/lost with returns, live during simulator runs
- **The circular Road-to-the-Final bracket** (hand-rolled SVG): fixtures on concentric rings,
  winner paths igniting gold toward the trophy, animating live as the simulator plays
- Service-health footer (the scaffold's dots, kept)
- _Stretch:_ cash-out teaser, CSS confetti for the champion

### Trader ops (`apps/trader-ops`, :5174)

- Exposure board: per-market staked/bets/max-liability, heat-coloured, liability-sorted,
  with top-line risk tiles
- Punter watchlist doubling as the bot leaderboard (balances vs the $10k opening balance)
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

| Layer                  | Choice                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / package mgmt | Node 22, npm workspaces (single lockfile, hoisted deps)                                                                                               |
| Language               | TypeScript 5.9, `strict` everywhere                                                                                                                   |
| Backend framework      | **NestJS 11** — modules, DI, controllers/providers, `@nestjs/testing`                                                                                 |
| Database               | **Postgres via Prisma 6** on Neon (serverless), env-driven connection strings per service                                                             |
| Contracts & validation | zod 3 schemas in `@arena/contracts` — types + runtime validation + seed data (compiled package: CJS for Nest, TS source for Vite)                     |
| Testing                | Vitest 3 + V8 coverage in every workspace (SWC transform for Nest decorators); supertest for HTTP                                                     |
| Lint/format            | ESLint 9 flat config (typescript-eslint, **sonarjs**, **security**, react-hooks) + Prettier 3, zero-warnings policy                                   |
| Architecture gate      | **dependency-cruiser** — workstream isolation enforced at commit time                                                                                 |
| Quality gates          | husky 9 + lint-staged 16, gitleaks (secrets), shellcheck, yamllint, jscpd (duplication), npm audit, OSV-Scanner                                       |
| CI                     | GitHub Actions: quality, secret-scan, security-audit, license-compliance, **Dependabot** (CodeQL requires GHAS on private repos)                      |
| Continuous delivery    | Render (services, `render.yaml`) + Vercel (apps) auto-deploy from main; **feature flags** (own service, Postgres-backed) decouple release from deploy |
| Dev orchestration      | concurrently (`npm run dev` = all six processes, colour-coded)                                                                                        |

### Per workspace

| Workspace            | Runs as                                    | Key dependencies                                                        | Test environment                  |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------- |
| `contracts`          | compiled package (CJS + type declarations) | zod                                                                     | node                              |
| `services/pricing`   | NestJS (`nest start --watch`)              | @nestjs/\*, @prisma/client, @arena/contracts                            | node, @nestjs/testing + supertest |
| `services/betting`   | NestJS (`nest start --watch`)              | @nestjs/\*, @prisma/client, @arena/contracts                            | node, @nestjs/testing + supertest |
| `services/simulator` | NestJS (`nest start --watch`)              | @nestjs/\*, @arena/contracts (no DB — in-memory by design)              | node, @nestjs/testing + supertest |
| `services/flags`     | NestJS — **pre-built platform infra**      | @nestjs/\*, @prisma/client, @arena/contracts                            | node, @nestjs/testing + supertest |
| `apps/punter-web`    | Vite 7 dev server                          | React 19, @arena/contracts; SVG/CSS by hand — no UI/chart libs          | jsdom + Testing Library           |
| `apps/trader-ops`    | Vite 7 dev server                          | React 19, @arena/contracts; CSS grids/bars — no chart libs              | jsdom + Testing Library           |
| `bots`               | tsx CLI loop                               | @arena/contracts, native fetch, @anthropic-ai/sdk (Pundit stretch only) | node, mocked fetch                |

Design choices worth narrating: **persistence where it earns its keep** (the money and the
prices live in Postgres with migrations and transactions; the simulator is deliberately
ephemeral — narrate that as a design decision), **no HTTP client libraries** (native fetch +
zod parsing), **no UI component libraries** (the bracket is hand-rolled SVG), **contracts as
a compiled shared package** — every service imports the same types, so a contract violation
is a compile error — and **the org chart enforced as code** (dependency-cruiser fails any
commit where one workstream imports from another). Sessions may not add dependencies;
everything above is pre-installed.
