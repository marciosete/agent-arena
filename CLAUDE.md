# World Cup sportsbook

A TypeScript monorepo: NestJS services (`pricing`, `betting`, `simulator`, and the `flags`
platform service) and React apps (`punter-web`, `trader-ops`), sharing types, API contracts,
ports, and seed data through the `@arena/contracts` package.

## Architecture & stack

The service map, ports, persistence, continuous-delivery model, and code style are in
**`docs/engineering/architecture.md`**.

## Conventions

- **`@arena/contracts` is the single source of truth** for cross-service types,
  request/response shapes, ports, and seed data. Import from it; changes to it are coordinated, not ad-hoc.
- **Auth is platform-wide and pre-built** — never re-implement it. Every service requires a Bearer
  JWT on every endpoint (a global guard from `@arena/service-auth`) except `/health` and betting's
  `/auth/*`; the apps authenticate through `@arena/web-auth`. The auth model plus every cross-service
  dependency and integration point live in **`docs/engineering/integration.md`** — read it before
  building anything that calls another component.
- **Parse, don't trust:** validate every inbound body and params against the contract zod
  schemas (a `ZodValidationPipe` is idiomatic); return 400 with a useful message on bad input.
- **Thin controllers, testable domain logic:** keep business logic in pure functions and
  providers that unit-test without I/O; mock `PrismaService` in unit tests. Database access only through `PrismaService`; use `$transaction` where money moves.
- **Secrets come from the environment** — never hardcode or print database connection strings;
  Prisma reads them via `env(...)` in `schema.prisma` (`.env` is gitignored).

## Quality bar (enforced by hooks + CI)

- **≥85% coverage** on changed files (lines, branches, functions, statements). No weak test;
- **zero ESLint warnings** (sonarjs + security rules); Prettier-formatted.
- **Module boundaries enforced** by dependency-cruiser — services never import each other; they integrate over HTTP per the contracts.
- **gitleaks** blocks secrets; **jscpd** keeps duplication under 3%.
- Nest services co-locate `*.spec.ts`;
- apps and libraries use `*.test.ts(x)`.

## Commands

```bash
npm test -w <dir>               # run one workspace's tests
npm run test:coverage -w <dir>  # with coverage
npm run typecheck -w <dir>      # tsc for one workspace
npm run lint                    # eslint across the repo (zero warnings tolerated)
npm run check:architecture      # dependency-cruiser boundary check
npx nest g <schematic> <name>   # generate Nest building blocks (inside a service)
npx prisma migrate dev --name x # create + apply a migration (inside a service)
npx prisma generate             # refresh the typed client after schema changes
```

## Definition of Done

What "done" means for a change is in **`docs/engineering/definition-of-done.md`**. For driving a large change to completion as a goal-oriented task, see **`docs/engineering/goal-oriented-tasks.md`**.
