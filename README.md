# ⚽ Agent Arena — Road to the Final 🏆

**One engineer. A fleet of Claude agents. Three hours. A full sportsbook for the World Cup
knockout stage.**

This monorepo is the stage for a live agentic-engineering showcase: six parallel Claude Code
sessions, each owning a workstream, build a working mini-Sportsbet — pricing engine, betting
core, punter app, trader console, tournament simulator, and autonomous betting bots — on top
of frozen, contract-first APIs.

## Quickstart

```bash
npm install          # installs all workspaces + git hooks
npm run dev          # start everything (apps + services, colour-coded)
npm test             # full test suite
npm run ticker       # big-screen build telemetry
```

Punter app: http://localhost:5173 · Trader ops: http://localhost:5174

## Layout

```
contracts/           🧊 FROZEN — zod schemas, REST contracts, ports, WC2026 seed data
services/pricing/    odds & markets            (:4001)
services/betting/    accounts, bets, exposure  (:4002)
sim/                 tournament fast-forward   (:4003)
apps/punter-web/     customer sportsbook       (:5173)
apps/trader-ops/     trader console            (:5174)
bots/                autonomous punter agents
docs/specs/          one spec per workstream
docs/                run of show, kickoff prompts
```

## Quality gates (progressive, modelled on euda-app)

| Stage      | Gate                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pre-commit | gitleaks secrets scan · shellcheck · eslint `--max-warnings 0` + prettier on staged files · **≥80% coverage on changed files** · jscpd duplication <3% · npm audit (warn) |
| pre-push   | full test suite · typecheck all workspaces · OSV-Scanner (blocks on HIGH/CRITICAL)                                                                                        |
| CI         | lint · format · typecheck · tests+coverage · build · duplication · gitleaks · npm audit · OSV · license compliance                                                        |

The bar is deliberately real: the point of the showcase is not "agents write code fast",
it's "agents ship **enterprise-grade** code fast — through the same gates humans face."

## House rules for build sessions

See [CLAUDE.md](CLAUDE.md). Short version: own your directory, treat `contracts/` as law,
never commit — the host does, at checkpoints.
