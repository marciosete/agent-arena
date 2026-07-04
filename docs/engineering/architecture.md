# Architecture

| Workstream | Directory             | Port | Persistence       | Job                                                                                                |
| ---------- | --------------------- | ---- | ----------------- | -------------------------------------------------------------------------------------------------- |
| pricing    | `services/pricing/`   | 4001 | Postgres (Prisma) | Model probabilities, publish markets with odds                                                     |
| betting    | `services/betting/`   | 4002 | Postgres (Prisma) | Accounts, wallets, bets, settlement, exposure                                                      |
| simulator  | `services/simulator/` | 4003 | Postgres (Prisma) | Fast-forward the tournament, emit results (bracket persisted + write-through cached)               |
| _flags_    | `services/flags/`     | 4004 | Postgres (Prisma) | **Platform infrastructure, pre-built — READ-ONLY like contracts.** Feature flags: release ≠ deploy |
| punter-web | `apps/punter-web/`    | 5173 | —                 | Customer sportsbook UI + bracket visualization                                                     |
| trader-ops | `apps/trader-ops/`    | 5174 | —                 | Internal liability/exposure console                                                                |
| bots       | `bots/`               | —    | —                 | Autonomous punter agents betting into the platform                                                 |

**Continuous delivery:** main auto-deploys to production (Render + Vercel) after CI. Every
feature ships **dark** behind a flag from the flags service and is released by flipping it —
see `docs/engineering/deployment.md`. Client URLs resolve env-first with localhost fallback:
`import.meta.env.VITE_<SERVICE>_URL ?? BASE_URLS.<service>` in apps,
`process.env.<SERVICE>_URL ?? BASE_URLS.<service>` in bots.

Services are **NestJS 11** (modules, DI, controllers, providers — canonical patterns).
Persisted services use **Prisma** on Postgres (Neon); you design the models in
`prisma/schema.prisma` and apply them with `npx prisma migrate dev`.

Everything speaks the REST surface defined in `contracts/src/api.ts` (ports, endpoints,
request/response zod schemas). Seed data (real World Cup 2026 bracket) is exported as
`TEAMS` and `FIXTURES` from `@arena/contracts`.

**Auth is pre-built platform infrastructure** (like flags — READ-ONLY, not a workstream), in two
shared packages: `@arena/service-auth` (backend — a global JWT guard already wired into every
service, `signToken`/`verifyToken`, `ZodValidationPipe`) and `@arena/web-auth` (frontend —
`AuthProvider`, `LoginPage`, `RequireAuth`, `apiFetch`). Every endpoint requires a Bearer JWT except
`/health` and betting's `/auth/*`; humans sign in with email + OTP, bots are admin-provisioned,
services mint service tokens.

**Before building anything that talks to another component, read
`docs/engineering/integration.md`** — the authoritative cross-service dependency map: the auth
model, who calls whom, the bracket↔market join, and the finale settlement chain.

## Style

- TypeScript strict; no `any` unless truly unavoidable.
- Small modules, pure functions for domain maths (pricing, staking, settlement) so they're
  trivially testable; Nest providers orchestrate them.
- Database access only through `PrismaService`. Use `$transaction` where money moves.
