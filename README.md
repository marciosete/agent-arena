# ⚽ Agent Arena — Road to the Final 🏆

**One engineer. A fleet of Claude agents. Three hours. A full sportsbook for the World Cup
knockout stage.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![Node](https://img.shields.io/badge/node-22-339933.svg)

This monorepo is the stage — and the artifact — of a live agentic-engineering showcase: six
parallel [Claude Code](https://claude.com/claude-code) sessions, each owning a workstream, build
a working mini-sportsbook — pricing engine, betting core, punter app, trader console, tournament
simulator, and autonomous betting bots — on top of frozen, contract-first APIs. Services are
NestJS; money, markets, and the live bracket live in Postgres (Neon) via Prisma.

It's now open-sourced so you can **read how it was built and re-run the exercise yourself** →
[**docs/workshop/run-it-yourself.md**](docs/workshop/run-it-yourself.md).

> The `post-workshop` git tag marks the codebase exactly as it stood at the end of the live
> build. Everything after it (identity-based admin, the reset cascade, a persisted simulator,
> this documentation) is open-source polish.

## Quickstart

```bash
npm install          # installs all workspaces, builds contracts + service-auth, generates prisma clients, installs git hooks

# copy each persisted service's env, then paste your Neon URLs + a shared SESSION_SECRET
cp services/pricing/.env.example   services/pricing/.env
cp services/betting/.env.example   services/betting/.env
cp services/flags/.env.example     services/flags/.env
cp services/simulator/.env.example services/simulator/.env
cp bots/.env.example               bots/.env

npm run dev          # start everything (apps + services, colour-coded)
npm test             # full test suite
npm run ticker       # big-screen build telemetry
```

**Minimum config** to log in and play locally: a `<SERVICE>_DATABASE_URL` per service, the **same**
`SESSION_SECRET` across all of them (the JWT signing key — `openssl rand -hex 32`), and
`ADMIN_EMAILS=you@example.com` on betting (makes you an admin: reset, finale control, flag flips).
OTP email is optional locally — with `RESEND_API_KEY` unset, sign-in codes print to the betting
console. Full walkthrough: [docs/workshop/run-it-yourself.md](docs/workshop/run-it-yourself.md).

Punter app: http://localhost:5173 · Trader ops: http://localhost:5174

## Layout

```
contracts/             🧊 FROZEN — zod schemas, REST contracts, ports, WC2026 seed data (the single source of truth)
service-auth/          shared backend auth — HS256 JWT, guards, identity-based admin, zod pipe
web-auth/              shared frontend auth — AuthProvider, LoginPage, RequireAuth, apiFetch
services/pricing/      odds & markets            (:4001, NestJS + Prisma)
services/betting/      accounts, bets, exposure  (:4002, NestJS + Prisma)
services/simulator/    tournament fast-forward   (:4003, NestJS + Prisma — persisted, write-through cached)
services/flags/        🧊 feature flags          (:4004, pre-built platform infra — release ≠ deploy)
apps/punter-web/       customer sportsbook       (:5173, React + Vite)
apps/trader-ops/       trader console            (:5174, React + Vite)
bots/                  autonomous punter agents
docs/engineering/      architecture, integration, definition-of-done, goal-oriented-tasks, deployment, security
docs/domain/           glossary — the betting domain's ubiquitous language
docs/product/          platform overview
docs/specs/            one spec (+ kickoff prompt) per workstream
docs/workshop/         run it yourself, run of show, kickoff prompts, mental map
render.yaml            Render blueprint — services deploy from main
```

## Architecture at a glance

Seven components integrate **only** over the frozen contract in `@arena/contracts` — services never
import each other, and each persisted service owns its own database. Auth (email + OTP → JWT, with
an identity-based `admin` claim) and feature flags are **pre-built platform infrastructure**: the
workstreams build on top and never reimplement them.

The system map (who-calls-whom), the auth model, the bracket↔market join, and the finale + reset
cascade are documented — with a diagram — in
[docs/engineering/architecture.md](docs/engineering/architecture.md) and
[docs/engineering/integration.md](docs/engineering/integration.md).

## Continuous delivery

Main auto-deploys to production on every green push — Render for the services, Vercel for the apps.
**Everything ships dark behind feature flags**; releasing is a flag flip in the trader console, not
a deploy. Full story: [docs/engineering/deployment.md](docs/engineering/deployment.md).

## Quality gates (progressive)

| Stage      | Gate                                                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pre-commit | gitleaks secrets scan · shellcheck · yamllint · eslint `--max-warnings 0` + prettier on staged files · typecheck touched workspaces · **dependency-cruiser architecture boundaries** · **≥85% coverage on changed files** · jscpd duplication <3% · npm audit (warn) |
| pre-push   | full test suite · typecheck all workspaces · duplication <3% repo-wide · npm audit (blocking high/critical) · OSV-Scanner (blocking HIGH/CRITICAL)                                                                                                                   |
| CI         | lint · yamllint · format · architecture · typecheck · tests+coverage · build · duplication · gitleaks · **SonarQube Cloud quality gate** · CodeQL · Dependabot · license compliance                                                                                  |

The bar is deliberately real: the point of the showcase is not "agents write code fast", it's
"agents ship **enterprise-grade** code fast — through the same gates humans face." `main` is
branch-protected: outside contributors open a PR that must pass every check before merge.

## Code quality dashboard (SonarQube)

Self-hosted SonarQube Community — one project per workspace — tracking coverage, duplication, bugs,
and code smells. Everything to run it lives in [`infra/sonarqube/`](infra/sonarqube/): a pinned
Docker Compose stack (SonarQube CE + Postgres) plus a Render blueprint for a shared cloud instance.

```bash
npm run sonar:up          # SonarQube at http://localhost:9000 (admin/admin), first boot ~2-4 min
cp infra/sonarqube/.env.example infra/sonarqube/.env    # add a global analysis token
npm run sonar:full        # regenerate coverage + scan all projects
npm run sonar -- trader   # scan one (punter|trader|betting|flags|pricing|simulator|contracts|bots)
```

Full setup, scanning, and Render deploy: [infra/sonarqube/README.md](infra/sonarqube/README.md).

## Learn from it / re-run it

- **[Run the workshop yourself](docs/workshop/run-it-yourself.md)** — fork it, provision a database,
  and build the platform with your own fleet of AI coding sessions.
- **[Mental map](docs/workshop/mental-map.md)** and **[run of show](docs/workshop/run-of-show.md)** —
  how the six workstreams fit together and the order they're revealed.
- **[Kickoff prompts](docs/workshop/kickoff-prompts.md)** — the exact `/goal` launch for each session.
- **[CLAUDE.md](CLAUDE.md)** — the house conventions every build session works under.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — set up, run the tests, and open a PR.

## License

[MIT](LICENSE) © Marcio Sete. Built live with [Claude Code](https://claude.com/claude-code).
