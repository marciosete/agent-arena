# Agent Arena — Road to the Final

A World Cup sportsbook being built **live** by parallel Claude Code sessions, each owning one
workstream. You are one of those sessions. The audience is watching. Ship like a senior engineer.

## The golden rules (non-negotiable)

1. **You own exactly ONE directory** — the one named in your kickoff prompt. Never create,
   edit, or delete files outside it.
2. **`contracts/` is frozen.** Import from `@arena/contracts`; never modify it. If a contract
   seems wrong, flag it to the host — don't work around it.
3. **Never edit shared config**: root `package.json`, lockfile, `eslint.config.mjs`,
   `tsconfig.base.json`, `.dependency-cruiser.cjs`, `.husky/`, `scripts/`, `.github/`.
   They are pre-built.
4. **Never add dependencies.** Everything you need is installed. If you believe you need a new
   package, ask the host.
5. **Don't `git commit` until the host tells you to** — then commit only your own directory's
   changes, with a clear message, and stop. **Never `git push`** (the host pushes at
   checkpoints; that's what triggers the gated pipeline). Committing only on command keeps
   parallel sessions from racing on the shared git index.
6. **Never start long-running dev servers yourself** — the host runs `npm run dev` in a separate
   terminal. Verify HTTP behaviour through your Nest testing-module specs or a one-shot `curl`.
7. **Never print or hardcode database connection strings.** They live in your workspace's
   `.env` (gitignored). Prisma reads them via `env(...)` in `schema.prisma`.

> **Guardrails — honor on discipline (no longer machine-enforced).** These paths and
> commands were blocked by a `deny` list in `.claude/settings.json`; that list has been
> removed, so nothing stops you from crossing them — don't:
>
> - `Bash(git push:*)` — rule 5 (the host pushes at checkpoints); `Bash(git commit:*)` only
>   when the host asks for it (rule 5)
> - `Read(./.env)` — rule 7 (never read or surface secrets)
> - `Edit(./contracts/**)` — rule 2 (`contracts/` is frozen)
> - `Edit(./package.json)`, `Edit(./package-lock.json)`, `Edit(./eslint.config.mjs)`,
>   `Edit(./tsconfig.base.json)`, `Edit(./.husky/**)`, `Edit(./scripts/**)`,
>   `Edit(./.github/**)` — rule 3 (shared config is pre-built)

## Architecture

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

## Commands

```bash
npm test -w <dir>               # run one workspace's tests (e.g. -w services/pricing)
npm run test:coverage -w <dir>  # with coverage
npm run typecheck -w <dir>      # tsc for one workspace
npm run lint                    # eslint across the repo (zero warnings tolerated)
npm run check:architecture      # dependency-cruiser boundary check
npx nest g <schematic> <name>   # generate Nest building blocks (run inside your service)
npx prisma migrate dev --name x # create + apply a migration (inside your service)
npx prisma generate             # refresh the typed client after schema changes
```

## Quality bar (enforced by hooks — you cannot merge around it)

- **Tests first-class**: Nest services use co-located `*.spec.ts`; other workspaces use
  `*.test.ts(x)`. Changed files need **≥85% coverage** (lines, branches, functions,
  statements) at commit time.
- **Zero ESLint warnings** (sonarjs + security rules active). Prettier-formatted.
- **Architecture is enforced**: dependency-cruiser fails the commit if a workstream imports
  from another workstream. Integration happens over HTTP, per the contracts.
- **Parse, don't trust**: validate every inbound request body/params with the zod schemas
  from `@arena/contracts` (a small ZodValidationPipe is a classic Nest pattern). Return 400
  with a useful message on validation failure.
- **No secrets in code** — gitleaks blocks the commit. No duplication >3% (jscpd).
- Keep controllers thin; domain logic lives in providers/pure modules that are easy to test.
  Mock `PrismaService` in unit tests (standard Nest DI override).

## Style

- TypeScript strict; no `any` unless truly unavoidable.
- Small modules, pure functions for domain maths (pricing, staking, settlement) so they're
  trivially testable; Nest providers orchestrate them.
- Database access only through `PrismaService`. Use `$transaction` where money moves.
