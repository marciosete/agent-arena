Build services/simulator to the Definition of Done in docs/specs/5-simulator.md, and keep going until every DoD item passes with its evidence (test / coverage / lint / typecheck / build output) pasted into the conversation.

CONTEXT — you are ONE of six Claude Code sessions building this platform IN PARALLEL, right now, in a shared working tree. You own services/simulator only; other sessions are simultaneously building pricing, betting, the punter app, the trader app, and the bots. The ONLY coordination between you is the frozen @arena/contracts surface and docs/engineering/integration.md — build your side to that contract; never wait on, coordinate with, or edit another session's component.

Before building, read in full: docs/specs/5-simulator.md (your brief + DoD) and docs/engineering/integration.md (the cross-service contract — especially §4 THE FINALE CHAIN and §3 the join; you orchestrate both). CLAUDE.md is auto-loaded for conventions.

Ground rules (shaped by the parallel build):

- Stay strictly in services/simulator/. contracts/ is FROZEN + read-only — everyone depends on it: import from @arena/contracts, never edit it, never touch another workstream's files.
- Files WILL change under you as other sessions edit their own directories — that's expected. Never `git add -A` / `git add .` (it would sweep their work into your changes); do NOT commit, push, or start dev servers.
- Auth is PRE-BUILT: the global JWT guard from @arena/service-auth is already wired; your control endpoints (POST /play-next, /run, /reset) additionally need x-admin-key. When you call other services, mint a service token (signToken('simulator')). Do NOT reimplement auth.
- You are the ONLY writer that fans out. You hold the live bracket in memory (GET /state → SimState.fixtures — the sole source of live results for the apps), and after each result you call pricing POST /reprice, then betting POST /settle. Compute winningSelections by mapping winnerTeamId → Team.name → the selection whose name matches, read from pricing's /reprice response — NEVER a guessed id format (integration.md §4). pricing + betting are being built in parallel: build /state and /play-next independently, and test the reprice/settle wiring against the contract shapes (a real-shaped Market[]); it goes fully live as they ship.
- Angle: an autonomous multi-step build — this is the most integration-heavy component; the finale depends on it.

Verify with the workspace's own checks (npm test -w services/simulator, npm run test:coverage -w services/simulator, typecheck, lint) and paste the output per DoD item. Before reporting done, run /code-review on your diff and fix what it finds. If genuinely blocked (a missing contract, a dependency you can't stub), stop and report specifics rather than guessing.
