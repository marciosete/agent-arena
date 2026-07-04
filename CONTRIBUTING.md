# Contributing to Agent Arena

Thanks for your interest in **Agent Arena — Road to the Final**, a World Cup sportsbook built
as a TypeScript monorepo. This guide is for people who have forked the repo and want to run it,
change something, and open a pull request. The bar here is deliberately enterprise-grade — the
whole point of the project is shipping real code through real gates — so please read the quality
section before you start.

## Prerequisites

- **Node.js ≥ 22** and **npm ≥ 11** (enforced via `engines` in the root `package.json`).
- **git**.
- A **Postgres** connection for the persisted services. We use [Neon](https://neon.tech); any
  Postgres will do. The `pricing`, `betting`, `simulator`, and `flags` services each expect their
  own database URL. Pure frontend or `bots` work needs no database.

## Getting set up

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/<you>/agent-arena.git
cd agent-arena

# 2. Install everything
npm install
```

`npm install` does more than fetch dependencies. Its `postinstall` step **builds
`@arena/contracts` and `@arena/service-auth`** (the shared packages every service compiles
against) and runs **`prisma generate`** across the workspaces that have a schema, so the typed
Prisma clients exist. The `prepare` step installs the **husky git hooks** — the quality gates
below then run automatically on commit and push.

Next, give each persisted service its environment. Copy the checked-in `.env.example` files and
paste your own Postgres URLs (`.env` is gitignored — never commit real connection strings):

```bash
cp services/betting/.env.example   services/betting/.env
cp services/pricing/.env.example   services/pricing/.env
cp services/flags/.env.example     services/flags/.env
cp services/simulator/.env.example services/simulator/.env
# bots/.env.example too, if you work on the bots
```

Then start everything (colour-coded, apps + services):

```bash
npm run dev     # punter-web :5173 · trader-ops :5174 · pricing :4001 · betting :4002 · simulator :4003 · flags :4004
npm test        # full suite
```

## Monorepo layout

This is an **npm workspaces** repo. The top-level members are `contracts`, `service-auth`,
`web-auth`, `services/*`, `apps/*`, and `bots`. See the README for the full directory map and
`docs/engineering/architecture.md` for ports and responsibilities. Two rules matter most for
contributors:

- **`@arena/contracts` is FROZEN and the single source of truth** for cross-service types,
  request/response zod schemas, REST contracts, ports, and the World Cup 2026 seed data. Import
  from it; do **not** edit `contracts/` casually. A change there ripples across every service and
  must be coordinated (see Branch & PR flow).
- **`@arena/service-auth`** (backend JWT guard, `signToken`/`verifyToken`, `ZodValidationPipe`)
  and **`@arena/web-auth`** (frontend `AuthProvider`, `LoginPage`, `RequireAuth`, `apiFetch`) are
  shared, pre-built auth libraries. Auth is platform-wide — **never re-implement it.**
- **Services never import each other.** They integrate over HTTP using the contracts. This
  boundary is enforced by dependency-cruiser (`npm run check:architecture`).

## Working on a change

Iterate inside the one workspace you're changing, then run the repo-wide checks:

```bash
# per-workspace (e.g. dir = services/betting or apps/punter-web)
npm test           -w <dir>    # that workspace's tests
npm run test:coverage -w <dir> # tests with coverage
npm run typecheck  -w <dir>    # tsc --noEmit

# repo-wide
npm run lint                   # eslint across the repo — zero warnings tolerated
npm run check:architecture     # dependency-cruiser module boundaries
npm run check:duplicates       # jscpd duplication check
```

Test file conventions:

- **Nest services co-locate `*.spec.ts`** next to the code under test.
- **Apps and libraries use `*.test.ts(x)`.**

Keep controllers thin and put business logic in pure functions / providers so it unit-tests
without I/O (mock `PrismaService`). Validate every inbound body and params against the contract
zod schemas and return a 400 on bad input. The full house conventions are in
[`CLAUDE.md`](CLAUDE.md); what "done" means is in
[`docs/engineering/definition-of-done.md`](docs/engineering/definition-of-done.md).

## The quality bar

This is the reason the project exists. Gates run **automatically via husky hooks**, and again in
CI — nothing merges that hasn't passed them. Summary:

| Stage          | Gates                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pre-commit** | gitleaks secret scan · eslint `--max-warnings 0` + prettier on staged files · typecheck touched workspaces · dependency-cruiser boundaries · **≥85% coverage on changed files** · jscpd duplication <3% |
| **pre-push**   | full test suite · typecheck all workspaces · repo-wide duplication <3% · dependency audits (npm audit / OSV-Scanner, blocking HIGH/CRITICAL)                                                            |
| **CI**         | lint · format · architecture · typecheck · tests + coverage · build · duplication · gitleaks · audits · license compliance · CodeQL · secret-scanning + push protection                                 |

The non-negotiables for any changed file: **≥85% coverage** (lines, branches, functions,
statements — and no weak/trivial tests), **zero ESLint warnings** (sonarjs + security rules),
Prettier-formatted, within the module boundaries, and no secrets. A self-hosted **SonarQube**
project per workspace tracks coverage, duplication, bugs, and code smells (`npm run sonar:up`;
see [`infra/sonarqube/`](infra/sonarqube/)).

If a hook blocks you, fix the underlying issue rather than bypassing it — the gate is the point.
`npm run quality-gate` runs the main checks together locally before you push.

## Branch & PR flow

- **`main` is protected.** External contributors cannot push to it directly; you open a **pull
  request** that must pass **all CI status checks** before it can merge. Direct pushes are
  identity-gated to the repo owner.
- **Branch off `main`** for your work, and keep each change **scoped to one workstream** where
  possible (pricing, betting, simulator, flags, punter-web, trader-ops, or bots).
- **Don't touch `contracts/` casually.** It's the frozen shared contract; changes there need to
  be coordinated because they affect every consumer. Call it out explicitly in your PR.
- Write **clear, conventional-ish commit messages** (e.g. `fix(betting): …`, `feat(pricing): …`).
- Before requesting review, make sure `npm run lint`, `npm run check:architecture`,
  `npm run check:duplicates`, and the relevant `npm test`/coverage all pass locally.

## Where things live

- **[`CLAUDE.md`](CLAUDE.md)** — house conventions (contract-first, thin controllers,
  parse-don't-trust, secrets from the environment).
- **[`docs/engineering/`](docs/engineering/)** — `architecture.md`, `integration.md` (the
  authoritative cross-service dependency + auth map — read it before building anything that calls
  another component), `deployment.md`, `security.md`, `definition-of-done.md`,
  `goal-oriented-tasks.md`.
- **[`docs/domain/glossary.md`](docs/domain/glossary.md)** — the betting domain's ubiquitous
  language.
- **[`docs/specs/`](docs/specs/)** — one spec per workstream, each with its own Definition of Done.
- **README.md** — project overview, layout, and the full quality-gates table.

Welcome aboard, and enjoy the run to the final. ⚽🏆
