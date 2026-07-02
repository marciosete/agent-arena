# Architecture

| Workstream | Directory             | Port | Persistence                                                 | Job                                                                                                |
| ---------- | --------------------- | ---- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| pricing    | `services/pricing/`   | 4001 | Postgres (Prisma)                                           | Model probabilities, publish markets with odds                                                     |
| betting    | `services/betting/`   | 4002 | Postgres (Prisma)                                           | Accounts, wallets, bets, settlement, exposure                                                      |
| simulator  | `services/simulator/` | 4003 | in-memory (by design — ephemeral state with a reset button) | Fast-forward the tournament, emit results                                                          |
| _flags_    | `services/flags/`     | 4004 | Postgres (Prisma)                                           | **Platform infrastructure, pre-built — READ-ONLY like contracts.** Feature flags: release ≠ deploy |
| punter-web | `apps/punter-web/`    | 5173 | —                                                           | Customer sportsbook UI + bracket visualization                                                     |
| trader-ops | `apps/trader-ops/`    | 5174 | —                                                           | Internal liability/exposure console                                                                |
| bots       | `bots/`               | —    | —                                                           | Autonomous punter agents betting into the platform                                                 |

**Continuous delivery:** main auto-deploys to production (Render + Vercel) after CI. Every
feature ships **dark** behind a flag from the flags service and is released by flipping it —
see `docs/deployment.md`. Client URLs resolve env-first with localhost fallback:
`import.meta.env.VITE_<SERVICE>_URL ?? BASE_URLS.<service>` in apps,
`process.env.<SERVICE>_URL ?? BASE_URLS.<service>` in bots.

Services are **NestJS 11** (modules, DI, controllers, providers — canonical patterns).
Persisted services use **Prisma** on Postgres (Neon); you design the models in
`prisma/schema.prisma` and apply them with `npx prisma migrate dev`.

Everything speaks the REST surface defined in `contracts/src/api.ts` (ports, endpoints,
request/response zod schemas). Seed data (real World Cup 2026 bracket) is exported as
`TEAMS` and `FIXTURES` from `@arena/contracts`.

Your spec lives in `docs/specs/`, named by launch order (`1-punter.md`, `2-trader.md`,
`3-pricing.md`, `4-betting.md`, `5-simulator.md`, `6-bots.md`). Read yours before writing code.

## Style

- TypeScript strict; no `any` unless truly unavoidable.
- Small modules, pure functions for domain maths (pricing, staking, settlement) so they're
  trivially testable; Nest providers orchestrate them.
- Database access only through `PrismaService`. Use `$transaction` where money moves.
