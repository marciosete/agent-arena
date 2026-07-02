Build services/betting to the Definition of Done in docs/specs/4-betting.md, and keep going until every DoD item passes with its evidence (test / coverage / lint / typecheck / build output) pasted into the conversation.

CONTEXT — you are ONE of six Claude Code sessions building this platform IN PARALLEL, right now, in a shared working tree. You own services/betting only; other sessions are simultaneously building pricing, simulator, the punter app, the trader app, and the bots. The ONLY coordination between you is the frozen @arena/contracts surface and docs/engineering/integration.md — build your side to that contract; never wait on, coordinate with, or edit another session's component.

Before building, read in full: docs/specs/4-betting.md (your brief + DoD) and docs/engineering/integration.md (the cross-service contract — auth model §1, bet placement §5, the settlement chain §4). CLAUDE.md is auto-loaded for conventions.

Ground rules (shaped by the parallel build):

- Stay strictly in services/betting/. contracts/ is FROZEN + read-only — everyone depends on it: import from @arena/contracts, never edit it, never touch another workstream's files.
- Files WILL change under you as other sessions edit their own directories — that's expected. Never `git add -A` / `git add .` (it would sweep their work into your changes); do NOT commit, push, or start dev servers.
- CRITICAL — auth + accounts are PRE-BUILT and READ-ONLY (under src/auth/, src/accounts/, and the Account/Otp Prisma models): email+OTP login, JWT signing, the global guard, admin bot-provisioning, and the leaderboard reads — all from @arena/service-auth. Do NOT rebuild any of it. You build the MONEY on top: the Bet/LedgerEntry models, POST /bets, GET /bets, POST /settle, GET /exposure.
- POST /bets has NO accountId (derive the account from the token — no IDOR); enforce idempotency on idempotencyKey; validate the live price by calling pricing GET /markets/:fixtureId with a service token (signToken('betting')) — 409 if it moved. POST /settle (Bearer + x-admin-key) settles bets by winningSelections. Money moves in a $transaction.
- Angle: strict TDD — money moves here; write the failing test first for every rule (double-spend, settle-twice, stake > balance, price moved, replayed key).

Verify with the workspace's own checks (npm test -w services/betting, npm run test:coverage -w services/betting, typecheck, lint; prisma migrate for your models) and paste the output per DoD item. Before reporting done, run /code-review on your diff and fix what it finds. If genuinely blocked (a missing contract, a dependency you can't stub), stop and report specifics rather than guessing.
