# Run of Show — Agent Arena: Road to the Final

**Format:** one host, ~20 Sportsbet engineers watching, 3 hours.
**Thesis:** one engineer running a fleet of Claude Code sessions ships a squad's worth of
enterprise-grade software — through real quality gates — in one sitting.

## Screen layout

- **Terminal, full screen, big font (18pt+):** 6 tabs = 6 Claude sessions (name the tabs:
  pricing, betting, simulator, punter, trader, bots) + tab 7 `npm run dev` + tab 8 `npm run ticker`.
- **Browser:** punter-web (5173), trader-ops (5174), and this repo in an editor for spec/code
  walkthroughs.
- The key art (circular bracket image) as the desktop wallpaper. It is also the design brief
  for punter-web's finale visual.

## Pre-flight (morning of — 30 min, before anyone arrives)

- [ ] Update `contracts/src/data/fixtures.json` with last night's real Round-of-32 results
      (set scores/winner/status, fill the R16 team slots) — `npm test -w contracts` validates it.
      Commit: `checkpoint-0.1: real bracket as of this morning`.
- [ ] **Database**: `.env` files are already wired to Neon (databases `betting` and `pricing`).
      Verify connectivity with `npx prisma migrate status` in each service — **on the venue
      wifi**, not just at home. Before the first migration exists, success looks like
      "The current database is not managed by Prisma Migrate" — that means it connected.
- [ ] `npm install && npm test && npm run dev` — everything green, all health dots online.
- [ ] `claude` logged in; `gitleaks`, `shellcheck`, `yamllint`, `osv-scanner`, `jq` on PATH
      (`brew install` if not).
- [ ] **Production**: Render (4 services) and Vercel (2 apps) deploys green on the latest
      main. Pre-warm the four Render `/health` URLs (free tier sleeps; see docs/deployment.md).
      Reset all flags to dark: `curl -X PUT .../flags/<key> -d '{"enabled":false}'` for each.
- [ ] Do-not-disturb on, notifications off, font sizes checked from the back of the room.
- [ ] Optional: `ANTHROPIC_API_KEY` exported if you want the Pundit bot stretch goal.

## The continuous-delivery storyline (weave through the day)

This is the "not vibe coding" spine: **integration, review, deploy and release are four
separate, visible steps.**

- **From minute 0**: the punter app is LIVE in production (Vercel URL on screen) — and empty.
  The flag strip shows five dark flags. "We will deploy all day. We will release when we choose."
- **Every checkpoint commit** → gates run on camera → push → Render/Vercel auto-deploy.
  Production updates continuously; the audience sees deploys are boring and constant.
- **Once, mid-show (~1:30), do the full loop ceremonially** with the first finished feature
  (markets page): branch → PR → `/code-review` in a session finds something, fix it → CI
  checks green on the PR → merge → watch the Vercel deploy land → open production: _still
  dark_ → flip `punter-markets` in trader-ops (or curl) → **the feature appears in prod on
  the big screen without a deploy**. That flip is the single most enterprise moment of the
  day — let it breathe.
- **The finale becomes a release schedule**: flip `punter-bet-slip`, `punter-my-bets`,
  `punter-bracket` one by one as the sim runs; `punter-confetti` last, as the champion lands.
- **The kill switch**: flip a flag off live to show rollback-without-deploy. One second.

## Timeline

| Clock         | Beat                   | What you do                                                                                                                                                                                                                                                                                                             | What you say                                                                                                                                                                                                                                                   |
| ------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:10     | **Frame it**           | Show the bracket wallpaper, the repo tree, CLAUDE.md, one spec, the contracts package. Run `npm test` live: green.                                                                                                                                                                                                      | "I'm not going to write code today. I'm going to run an engineering org of six. The org chart is this directory tree. The inter-team API is this frozen contracts package. And the quality bar is the same one your platform teams enforce — watch the hooks." |
| 0:10–0:15     | **Prove the gates**    | Sabotage live: paste a fake AWS key into a file, `git commit` → gitleaks blocks it on screen. Revert.                                                                                                                                                                                                                   | "Everything the fleet ships today goes through this. Secrets, lint, 80% coverage on changed files, duplication, vulnerability scans. Enterprise-grade isn't a vibe, it's a hook."                                                                              |
| 0:15–0:40     | **Launch the fleet**   | Open 6 tabs, paste kickoff prompts from `docs/kickoff-prompts.md` one by one. Linger on pricing: it starts in plan mode — read the plan aloud, approve it.                                                                                                                                                              | Narrate each session's showcase angle: plan-mode approval, TDD, subagent fan-out, agents-building-agents.                                                                                                                                                      |
| 0:40–1:45     | **Manage, don't code** | Rotate tabs every ~7 min. Approve plans, answer sessions' questions, paste the status-check prompt, show a `/code-review` run on betting's diff. Keep `npm run dev` visible: health dots flip green as services ship; punter-web grows on every hot reload. Take audience questions _while the fleet works behind you_. | "This is the actual job now: I read plans, review diffs, and unblock. Six workstreams are moving while I talk to you. The ticker is counting."                                                                                                                 |
| ~1:00 & ~1:30 | **Checkpoints**        | `git add -A && git commit` (gates run visibly, coverage per workspace scrolls) → `git tag checkpoint-1` / `checkpoint-2`.                                                                                                                                                                                               | "Milestone commit. If anything explodes later, we roll back to a tag — same discipline as prod."                                                                                                                                                               |
| 1:45–2:15     | **Integration hour**   | Paste the integration prompt into every session. Start the full stack, walk the flow live: create account in punter-web → place a bet on France → watch it appear in trader-ops exposure → `curl :4003/play-next` → bet settles, balance moves. Debug whatever breaks IN a session, live.                               | "Something always breaks at integration. Watch how fast a session diagnoses across service boundaries — this is the part that used to eat a sprint."                                                                                                           |
| 2:15–2:20     | **Checkpoint-3**       | Commit + tag `checkpoint-3-integrated`. Full pre-push gate run on screen (suite + typecheck + OSV).                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                              |
| 2:20–2:45     | **🏆 THE FINALE**      | Punter-web bracket on the big screen, trader-ops beside it. Start the bots (`npm run dev -w bots`) — league table scrolling. Then `curl -X POST :4003/run -d '{"intervalMs":2000}'`. The tournament plays out: bracket ignites ring by ring, bets settle, leaderboard reorders, a champion emerges. Let the room react. | "Two hours ago this was an empty shell. Now it's a sportsbook with a trading desk, a punter app, and four degenerate robots — settling a simulated World Cup."                                                                                                 |
| 2:45–3:00     | **The receipts**       | Ticker full screen: files, LOC, tests, commits. `git log --oneline`. Open a random test file and the audit-log module — "read it, it's good code." Close on the bracket with the champion.                                                                                                                              | "One engineer. Three hours. N services, M tests, every commit through the same gates you use. That's the multiplier — and it's the _floor_, because these models are the worst they'll ever be."                                                               |

## Failure playbook

- **A session goes sideways** → don't debug in front of a dead room >3 min. `Esc`, tell it what
  you want differently, or `git checkout <last-tag> -- <its-directory>` and relaunch that one
  session from its kickoff prompt. Joke: "even agents get PIP'd."
- **A service won't integrate** → the sim was built to degrade gracefully; run the finale with
  whatever settles. The bracket animates off sim state alone.
- **Total disaster** → `git reset --hard <last-good-tag>`; every checkpoint boots a working demo.
- **Buffer time** → the schedule holds ~15 min of slack; if you're ahead, feed sessions the
  stretch goals (Pundit bot, cash-out teaser, chaos dial).

## Judging the claim honestly (someone will ask)

- "Did you write the specs live?" — No, and that's the point: **spec-writing is the human job.**
  Show `docs/specs/`, written the day before _with_ Claude. The 3 hours bought implementation.
- "Is the code any good?" — Open the gates: 80% enforced coverage, sonar rules, security scans,
  plus a live `/code-review`. Invite them to `git clone` and audit.
- "What does this cost?" — A few dollars of tokens per workstream vs. weeks of engineer-time.
  Do that maths on a slide if procurement is in the room.
