Build apps/punter-web to the Definition of Done in docs/specs/1-punter.md, and keep going until every DoD item passes with its evidence (test / coverage / lint / typecheck / build output) pasted into the conversation.

CONTEXT — you are ONE of six Claude Code sessions building this platform IN PARALLEL, right now, in a shared working tree. You own apps/punter-web only; other sessions are simultaneously building pricing, betting, simulator, the trader app, and the bots. The ONLY coordination between you is the frozen @arena/contracts surface and docs/engineering/integration.md — build your side to that contract; never wait on, coordinate with, or edit another session's component.

Before building, read in full: docs/specs/1-punter.md (your brief + DoD) and docs/engineering/integration.md (the cross-service contract — auth model, the bracket↔market join, who you call + how). CLAUDE.md is auto-loaded for conventions.

Ground rules (shaped by the parallel build):

- Stay strictly in apps/punter-web/. contracts/ is FROZEN + read-only — everyone depends on it: import from @arena/contracts, never edit it, never touch another workstream's files.
- Files WILL change under you as other sessions edit their own directories — that's expected. Never `git add -A` / `git add .` (it would sweep their work into your changes); do NOT commit, push, or
  start dev servers.
- The services you call are being built in parallel and may be unreachable or half-finished — build against the contract TYPES and degrade gracefully (skeletons / empty states); never crash on a
  failed fetch. Real end-to-end wiring lands as each service ships.
- Auth is PRE-BUILT: gate the app with @arena/web-auth (AuthProvider + RequireAuth) and call services via its apiFetch (Bearer attached). Do NOT build login/OTP/JWT yourself.
- This is the customer-facing hero: make the circular Road-to-the-Final bracket genuinely beautiful — premium, dark, deliberate. Emoji flags; no crests or trophy photos (IP).

Verify with the workspace's own checks (npm test -w apps/punter-web, npm run test:coverage -w apps/punter-web, typecheck, lint) and paste the output per DoD item. Before reporting done, run /code-review on your diff and fix what it finds. If genuinely blocked (a missing contract, a
dependency you can't stub), stop and report specifics rather than guessing.
