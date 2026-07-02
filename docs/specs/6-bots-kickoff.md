Build bots to the Definition of Done in docs/specs/6-bots.md, and keep going until every DoD item passes with its evidence (test / coverage / lint / typecheck / build output) pasted into the conversation.

CONTEXT — you are ONE of six Claude Code sessions building this platform IN PARALLEL, right now, in a shared working tree. You own bots/ only; other sessions are simultaneously building pricing, betting, simulator, the punter app, and the trader app. The ONLY coordination between you is the frozen @arena/contracts surface and docs/engineering/integration.md — build your side to that contract; never wait on, coordinate with, or edit another session's component.

Before building, read in full: docs/specs/6-bots.md (your brief + DoD) and docs/engineering/integration.md (the cross-service contract — the bot auth row in §1, bet placement §5, the join §3). CLAUDE.md is auto-loaded for conventions.

Ground rules (shaped by the parallel build):

- Stay strictly in bots/. contracts/ is FROZEN + read-only — everyone depends on it: import from @arena/contracts, never edit it, never touch another workstream's files.
- Files WILL change under you as other sessions edit their own directories — that's expected. Never `git add -A` / `git add .` (it would sweep their work into your changes); do NOT commit, push, or start dev servers.
- Bots have NO inbox, so NO email/OTP. A bot's first and ONLY auth step is admin-keyed POST /accounts ({ name, isBot: true } with x-admin-key = BETTING_ADMIN_KEY) → { token, account }; it reuses that Bearer token on every call. POST /bets has no accountId (token-derived), needs an idempotencyKey, and may 409 if the price moved (skip it, don't crash).
- Bots are Node, not Vite: resolve service URLs with process.env.<SERVICE>_URL ?? BASE_URLS.<service>. You depend on betting (accounts + bets) and pricing (markets) existing — they're being built in parallel, so build the HTTP client + strategies against the contract TYPES and integrate as they come online (you launch last for this reason).
- Angle: agents building agents — ship the HTTP client + the Sharp (Elo/Kelly) bot first, then Steady / Chaser / Mug.

Verify with the workspace's own checks (npm test -w bots, npm run test:coverage -w bots, typecheck, lint) and paste the output per DoD item. Before reporting done, run /code-review on your diff and fix what it finds. If genuinely blocked (a missing contract, a dependency you can't stub), stop and report specifics rather than guessing.
