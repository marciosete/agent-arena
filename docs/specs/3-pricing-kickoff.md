Build services/pricing to the Definition of Done in docs/specs/3-pricing.md, and keep going until every DoD item passes with its evidence (test / coverage / lint / typecheck / build output) pasted into the conversation.

CONTEXT — you are ONE of six Claude Code sessions building this platform IN PARALLEL, right now, in a shared working tree. You own services/pricing only; other sessions are simultaneously building betting, simulator, the punter app, the trader app, and the bots. The ONLY coordination between you is the frozen @arena/contracts surface and docs/engineering/integration.md — build your side to that contract; never wait on, coordinate with, or edit another session's component.

Before building, read in full: docs/specs/3-pricing.md (your brief + DoD) and docs/engineering/integration.md (the cross-service contract — especially §3 the bracket↔market join and §4 the finale / reprice chain). CLAUDE.md is auto-loaded for conventions.

Ground rules (shaped by the parallel build):

- Stay strictly in services/pricing/. contracts/ is FROZEN + read-only — everyone depends on it: import from @arena/contracts, never edit it, never touch another workstream's files.
- Files WILL change under you as other sessions edit their own directories — that's expected. Never `git add -A` / `git add .` (it would sweep their work into your changes); do NOT commit, push, or start dev servers.
- Auth is PRE-BUILT: the global JWT guard from @arena/service-auth is already wired — register it, do NOT reimplement auth. Your callers send tokens (apps + bots read markets; betting reads /markets/:fixtureId at bet time; the simulator calls /reprice with a service token).
- LOAD-BEARING contract (everyone downstream depends on it): name every Selection by the exact Team.name from TEAMS; a MATCH_WINNER market's id == its fixtureId; the OUTRIGHT market's id == 'outright'. POST /reprice must advance the bracket, settle the fixture's market, reprice the downstream markets + the OUTRIGHT, and RETURN the updated Market[] (the simulator reads the winning selections back from it). Overround target 1.05.
- Angle: start in plan mode — design the Elo → probability → margin engine and get it approved before you implement.

Verify with the workspace's own checks (npm test -w services/pricing, npm run test:coverage -w services/pricing, typecheck, lint; prisma migrate for your models) and paste the output per DoD item. Before reporting done, run /code-review on your diff and fix what it finds. If genuinely blocked (a missing contract, a dependency you can't stub), stop and report specifics rather than guessing.
