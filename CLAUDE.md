# Agent Arena — Road to the Final

A World Cup sportsbook being built **live** by parallel Claude Code sessions, each owning one
workstream. You are one of those sessions. The audience is watching. Ship like a senior engineer.

## The golden rules (non-negotiable)

1. **You own exactly ONE directory** — the one named in your kickoff prompt. Never create,
   edit, or delete files outside it.
2. **`contracts/` is frozen.** Import from `@arena/contracts`; never modify it. If a contract
   seems wrong, flag it to the host — don't work around it.
3. **Never edit shared config**: root `package.json`, lockfile, `eslint.config.mjs`,
   `tsconfig.base.json`, `.husky/`, `scripts/`, `.github/`. They are pre-built.
4. **Never add dependencies.** Everything you need is installed. If you believe you need a new
   package, ask the host.
5. **Never run `git commit` or `git push`.** The host commits at milestones (avoids index-lock
   races between parallel sessions).
6. **Never start long-running dev servers yourself** — the host runs `npm run dev` in a separate
   terminal. To verify HTTP behaviour, use your service's injection tests
   (`app.inject(...)`) or a one-shot `curl`.

## Architecture

| Workstream | Directory           | Port | Job                                                |
| ---------- | ------------------- | ---- | -------------------------------------------------- |
| pricing    | `services/pricing/` | 4001 | Model probabilities, publish markets with odds     |
| betting    | `services/betting/` | 4002 | Accounts, wallets, bets, settlement, exposure      |
| sim        | `sim/`              | 4003 | Fast-forward the tournament, emit results          |
| punter-web | `apps/punter-web/`  | 5173 | Customer sportsbook UI + bracket visualization     |
| trader-ops | `apps/trader-ops/`  | 5174 | Internal liability/exposure console                |
| bots       | `bots/`             | —    | Autonomous punter agents betting into the platform |

Everything speaks the REST surface defined in `contracts/src/api.ts` (ports, endpoints,
request/response zod schemas). Seed data (real World Cup 2026 bracket) is exported as
`TEAMS` and `FIXTURES` from `@arena/contracts`.

Your spec lives at `docs/specs/<workstream>.md`. Read it before writing code.

## Commands

```bash
npm test -w <dir>               # run one workspace's tests (e.g. -w services/pricing)
npm run test:coverage -w <dir>  # with coverage
npm run typecheck -w <dir>      # tsc for one workspace
npm run lint                    # eslint across the repo (zero warnings tolerated)
npx prettier --write <files>    # format
```

## Quality bar (enforced by hooks — you cannot merge around it)

- **Tests first-class**: co-locate in `src/__tests__/`, `*.test.ts`. Changed files need
  **≥80% coverage** (lines, branches, functions, statements) at commit time.
- **Zero ESLint warnings** (sonarjs + security rules active). Prettier-formatted.
- **Parse, don't trust**: validate every inbound request body/params with the zod schemas
  from `@arena/contracts`. Return 400 with a useful message on validation failure.
- **No secrets in code** — gitleaks blocks the commit.
- **No duplication >3%** on staged files (jscpd).
- Services keep app construction (`buildServer`) separate from listening (`index.ts`) so
  everything is injectable/testable — follow the existing pattern.

## Style

- TypeScript strict; no `any` unless truly unavoidable.
- Small modules, pure functions for domain logic (easy to test), fastify routes as thin shells.
- In-memory state is fine for today — wrap it behind a small repository interface so the
  audience sees where a database would slot in.
