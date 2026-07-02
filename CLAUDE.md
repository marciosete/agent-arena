# World Cup sportsbook

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

## Architecture & stack

The workstream map (ownership, ports, persistence), the NestJS/Prisma stack, the
continuous-delivery model, and code style are in **`docs/architecture.md`**. Your spec lives in
`docs/specs/` (named by launch order) — read yours before writing code.

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

## Definition of Done

How you prove you're finished — and how the `/goal` evaluator checks it — is in
**`docs/definition-of-done.md`**. Your spec's Definition of Done builds on it.
