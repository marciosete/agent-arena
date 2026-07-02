# Launch sheet — the six sessions

Each workstream is one Claude Code session. Its complete brief is its spec in `docs/specs/`,
named by launch order. To start a session:

```
# in a new terminal tab, at the repo root:
claude
# then, in the session:
/goal @docs/specs/1-punter.md
```

`/goal` sets the spec as the session's completion contract and keeps it working until the
Definition of Done holds. CLAUDE.md auto-loads (product conventions + quality bar); the spec
carries the per-workstream detail and Definition of Done; how goal-driven tasks work is in
**`docs/goal-oriented-tasks.md`**. Nothing else to paste.

Because the evaluator only reads what's surfaced in the conversation, use the explicit-condition
form (more reliable than a bare `@path`) — and put the event's parallel-session rules right in
the condition so each session stays in its lane:

```text
/goal Build apps/punter-web per docs/specs/1-punter.md until its Definition of Done holds and I
have pasted the passing test/lint/coverage/build output for each item. Stay in apps/punter-web;
do not commit, push, or start dev servers. Stop and report if blocked after ~20 turns.
```

Use the same condition per session, swapping the directory and spec.

## Order (launch top-to-bottom; they run in parallel)

Apps first — they produce the fastest visible wins (bracket needs only contracts + the live
simulator `/state`; flags panel needs only the live flags service). Services cook behind them.
Bots last (they need markets + accounts to exist).

| #   | Session   | Tag this                           | Say this too (the showcase angle)           | Ships first (milestone 1)              |
| --- | --------- | ---------------------------------- | ------------------------------------------- | -------------------------------------- |
| 1   | Punter    | `/goal @docs/specs/1-punter.md`    | design taste — make the bracket beautiful   | the circular Road-to-the-Final bracket |
| 2   | Trader    | `/goal @docs/specs/2-trader.md`    | fan out subagents for the four surfaces     | the flags release panel                |
| 3   | Pricing   | `/goal @docs/specs/3-pricing.md`   | start in plan mode; approve the model first | Elo → probability + margin engine      |
| 4   | Betting   | `/goal @docs/specs/4-betting.md`   | strict TDD — money moves here               | accounts + wallets                     |
| 5   | Simulator | `/goal @docs/specs/5-simulator.md` | autonomous multi-step build + integrations  | result engine + bracket advancement    |
| 6   | Bots      | `/goal @docs/specs/6-bots.md`      | agents building agents                      | HTTP client + the Sharp bot            |

> **Launch order ≠ reveal order.** You launch all six early; you _reveal_ each finished piece
> when you flip its flag. The reveal choreography lives in `docs/mental-map.md` and
> `docs/run-of-show.md`. Simulator has no visible payoff until the finale — if you're worried
> about its runway, bump it earlier in the launch order; it's the one that can't be rushed.

## Mid-session management prompts (paste into any session as needed)

```text
Status check: summarise what's shipped, what's in progress, current test count, and your
biggest open risk in four bullets.
```

```text
Run /code-review on your working diff and fix anything it finds before reporting done.
```

```text
Integration is live. Your service now has real consumers — run your suite, then verify your
surface against the running platform with one-shot curls (services are up on their contract
ports). Fix mismatches on your side only; the contract is law.
```

```text
Commit your work now: stage only your own directory, write a clear message, do NOT push.
```
