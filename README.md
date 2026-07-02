# ⚽ Agent Arena — Road to the Final 🏆

**One engineer. A fleet of Claude agents. Three hours. A full sportsbook for the World Cup
knockout stage.**

This monorepo is the stage for a live agentic-engineering showcase: six parallel Claude Code
sessions, each owning a workstream, build a working mini-sportsbook — pricing engine, betting
core, punter app, trader console, tournament simulator, and autonomous betting bots — on top
of frozen, contract-first APIs. Services are NestJS; money and markets live in Postgres
(Neon) via Prisma.

## Quickstart

```bash
npm install          # installs all workspaces, builds contracts, generates prisma clients, installs git hooks
cp services/betting/.env.example services/betting/.env    # then paste your Neon URLs
cp services/pricing/.env.example services/pricing/.env
cp services/flags/.env.example services/flags/.env
npm run dev          # start everything (apps + services, colour-coded)
npm test             # full test suite
npm run ticker       # big-screen build telemetry
```

Punter app: http://localhost:5173 · Trader ops: http://localhost:5174

## Layout

```
contracts/             🧊 FROZEN — zod schemas, REST contracts, ports, WC2026 seed data
services/pricing/      odds & markets            (:4001, NestJS + Prisma)
services/betting/      accounts, bets, exposure  (:4002, NestJS + Prisma)
services/simulator/    tournament fast-forward   (:4003, NestJS, in-memory by design)
services/flags/        🧊 feature flags          (:4004, pre-built platform infra — release ≠ deploy)
apps/punter-web/       customer sportsbook       (:5173, React + Vite)
apps/trader-ops/       trader console            (:5174, React + Vite)
bots/                  autonomous punter agents
docs/engineering/      architecture, definition-of-done, goal-oriented-tasks, deployment, security
docs/domain/           glossary — the betting domain's ubiquitous language
docs/product/          platform overview
docs/specs/            one spec per workstream
docs/workshop/         run of show, kickoff prompts, mental map (event scaffolding)
render.yaml            Render blueprint — 4 services auto-deploy from main
```

## Continuous delivery

Main auto-deploys to production on every green push — Render for the services,
Vercel for the apps. **Everything ships dark behind feature flags**; releasing is a
flag flip in the trader console, not a deploy. Full story: [docs/engineering/deployment.md](docs/engineering/deployment.md).

## Quality gates (progressive, modelled on euda-app)

| Stage      | Gate                                                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pre-commit | gitleaks secrets scan · shellcheck · yamllint · eslint `--max-warnings 0` + prettier on staged files · typecheck touched workspaces · **dependency-cruiser architecture boundaries** · **≥85% coverage on changed files** · jscpd duplication <3% · npm audit (warn) |
| pre-push   | full test suite · typecheck all workspaces · duplication <3% repo-wide · npm audit (blocking high/critical) · OSV-Scanner (blocking HIGH/CRITICAL)                                                                                                                   |
| CI         | lint · yamllint · format · architecture · typecheck · tests+coverage · build · duplication · gitleaks · npm audit · OSV · license compliance · **CodeQL** · **Dependabot** · GHAS secret scanning + push protection                                                  |

The bar is deliberately real: the point of the showcase is not "agents write code fast",
it's "agents ship **enterprise-grade** code fast — through the same gates humans face."

## Code quality dashboard (SonarQube)

Self-hosted SonarQube Community — one project per workspace — tracking coverage,
duplication, bugs, and code smells. Everything to run it lives in
[`infra/sonarqube/`](infra/sonarqube/): a pinned Docker Compose stack (SonarQube CE +
Postgres) plus a Render blueprint for a shared cloud instance.

```bash
npm run sonar:up          # SonarQube at http://localhost:9000 (admin/admin), first boot ~2-4 min
cp infra/sonarqube/.env.example infra/sonarqube/.env    # add a global analysis token
npm run sonar:full        # regenerate coverage + scan all 8 projects
npm run sonar -- trader   # scan one (Punter|trader|betting|flags|pricing|simulator|contracts|bots)
```

Full setup, scanning, and Render deploy: [infra/sonarqube/README.md](infra/sonarqube/README.md).

## House rules for build sessions

See [CLAUDE.md](CLAUDE.md). Short version: own your directory, treat `contracts/` as law,
never commit — the host does, at checkpoints.
