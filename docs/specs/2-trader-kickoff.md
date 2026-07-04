Build apps/trader-ops to the Definition of Done in docs/specs/2-trader.md, and keep going until every DoD item passes with its evidence (test / coverage / lint / typecheck / build output) pasted into the conversation.

CONTEXT — you are ONE of six Claude Code sessions building this platform IN PARALLEL, right now, in a shared working tree. You own apps/trader-ops only; other sessions are simultaneously building pricing, betting, simulator, the punter app, and the bots. The ONLY coordination between you is the frozen @arena/contracts surface and docs/engineering/integration.md — build your side to that contract; never wait on, coordinate with, or edit another session's component.

Before building, read in full: docs/specs/2-trader.md (your brief + DoD) and docs/engineering/integration.md (the cross-service contract — auth model, who you call + how). CLAUDE.md is auto-loaded for conventions.

Ground rules (shaped by the parallel build):

- Stay strictly in apps/trader-ops/. contracts/ is FROZEN + read-only — everyone depends on it: import from @arena/contracts, never edit it, never touch another workstream's files.
- Files WILL change under you as other sessions edit their own directories — that's expected. Never `git add -A` / `git add .` (it would sweep their work into your changes); do NOT commit, push, or start dev servers.
- The services you call (betting, flags, simulator) are being built in parallel and may be unreachable or half-finished — build against the contract TYPES and degrade gracefully (skeletons / empty states); never crash on a failed fetch.
- Auth is PRE-BUILT: gate the app with @arena/web-auth and call services via its apiFetch. Reads (exposure, leaderboard, flags, state) are any-logged-in-user; the flag FLIP (PUT /flags/:key) is admin-only — authorised by the `admin` claim in the token via the shared AdminGuard, so an admin operator just flips via apiFetch (no extra header) and a non-admin gets 403. Do NOT build login/JWT yourself.
- Angle: fan out subagents for the four surfaces — the exposure/liability board, the leaderboard, the feature-flag release panel (ship this first), and optional finale control.

Verify with the workspace's own checks (npm test -w apps/trader-ops, npm run test:coverage -w apps/trader-ops, typecheck, lint) and paste the output per DoD item. Before reporting done, run /code-review on your diff and fix what it finds. If genuinely blocked (a missing contract, a dependency you can't stub), stop and report specifics rather than guessing.
