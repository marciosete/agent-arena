# Agent Arena — the mental map

**One sentence:** _Contracts is the rulebook everyone builds against; Flags is the release
lever; four services and two apps get built live by the fleet; the Simulator is the engine
that makes it all pay off inside three hours._

Colour key (from the diagram): 🔵 apps (what the room sees) · 🟣 services (the engine room) ·
⚪ platform + agents.

**8 elements, but only 6 are built live tomorrow (= 6 sessions).** The other two —
🧊 **Contracts** and 🧊 **Flags** — are pre-built, deployed, and frozen: they're the scaffolding
that lets six independent AI sessions build the rest without colliding. The fleet is the six
workstreams: Pricing, Betting, Simulator, Punter, Trader, Bots.

---

## The eight elements

### 🧊 Contracts — the rulebook · DONE (frozen)

- **Purpose:** shared source of truth that lets six sessions build in parallel without talking.
- **Capabilities:** zod schemas for every object (Team, Fixture, Market, Bet, Account,
  Settlement, Flag); every service's REST surface; ports; real WC2026 seed data (24 teams,
  23 fixtures with bracket wiring).
- **State of play:** 100% done, frozen, self-validating.
- **Tomorrow:** nothing to build — just your morning refresh of the bracket scores.

### 🧊 Flags — the release lever · DONE (deployed)

- **Purpose:** decouples release from deploy — everything ships dark; a flag flip reveals it
  in production in seconds.
- **Capabilities:** flag board (`GET /flags`, any logged-in user); admin-only flips
  (`PUT`, identity-based `AdminGuard`); five flags seeded dark; live at flags.hackathon.beer.
- **State of play:** 100% built, deployed, verified.
- **Tomorrow:** nothing to build — it gets _used_ all day (trader builds a UI over it).

### 🟣 Pricing — the quant · SCAFFOLD

- **Purpose:** turns team strength into odds — a price for every match and for the title.
- **State of play:** NestJS + Prisma scaffold, health check only.
- **Milestones tomorrow (build in this order):**
  1. Elo → win probability + margin engine (fair vs offered price; pure, tested)
  2. Persisted markets served via `GET /markets`
  3. Monte Carlo outright (10k tournaments) via `GET /outright`
  4. Reprice-on-result (`POST /reprice`: advance bracket, re-price)

### 🟣 Betting — the ledger · SCAFFOLD

- **Purpose:** where money moves — accounts, wallets, bets, settlement; correctness is sacred.
- **State of play:** scaffold, health check, stub accounts endpoint.
- **Milestones tomorrow:**
  1. Accounts + wallets (open with 10,000 donut dollars)
  2. Bet placement rulebook (balance check, price-moved 409, DB-enforced idempotency,
     one transaction) + append-only ledger
  3. `GET /bets` + exposure report for the desk
  4. Guarded settlement (sim-triggered, idempotent, pays winners)

### 🟣 Simulator — fate · SCAFFOLD

- **Purpose:** fast-forwards the remaining World Cup so bets pay off inside the show; the
  finale's engine.
- **State of play:** scaffold serving the real bracket (`/state`), guarded `/reset`.
- **Milestones tomorrow:**
  1. Result engine (Elo-weighted winners, plausible scores, penalties) + bracket advancement
     (pure, exhaustively tested — the finale lives on this)
  2. `POST /play-next` + `GET /state`
  3. `POST /run` (fast-forward whole tournament, paced)
  4. Downstream wiring: each result triggers pricing reprice + betting settle

### 🔵 Punter — the storefront · DEPLOYED SHELL

- **Purpose:** the public face — browse odds, place bets, watch the bracket burn to the trophy.
- **State of play:** live shell — hero, flag-driven nav (empty), `/status`.
- **Milestones tomorrow (each behind its own flag — this is the reveal order):**
  1. **Bracket** — the circular Road-to-the-Final SVG (renders from contracts + sim `/state`;
     needs no other service — the fastest big visual)
  2. Markets page — live odds by round, prices flash on change
  3. Bet slip + account bootstrap (enter a name → 10k) — place a bet
  4. My bets — pending/won/lost, live
  5. Confetti — the champion moment

### 🔵 Trader — the back office · DEPLOYED SHELL

- **Purpose:** the house's view — risk, liability, leaderboard, and the release console.
- **State of play:** bare deployed shell.
- **Milestones tomorrow:**
  1. **Flags release panel** — toggle switches (admin login); _the_ release button of the day
  2. Exposure board — heat-mapped liability per market
  3. Punter watchlist / leaderboard — balances vs the 10k open (the finale scoreboard)
  4. Market monitor (offered vs fair — the margin, visible) + settlement feed

### ⚪ Bots — agents built by agents · SCAFFOLD

- **Purpose:** autonomous punters with personalities betting into the platform — the meta-moment.
- **State of play:** scaffold + tested Kelly-staking math.
- **Milestones tomorrow:**
  1. Resilient HTTP client + one bot end-to-end (Sharp: edge + Kelly)
  2. Full roster (Mug longshots, Steady flat, Chaser martingale-doomed)
  3. League-table loop, narrating each decision in character

---

## Build & release order — engineered for visible progress

Two ideas remove the "one hour of nothing" fear:

1. **Launch order ≠ release order.** All six sessions launch together (the fleet spectacle),
   but flags mean _you_ choose when each finished piece appears. Pacing is a release decision,
   not a build-scheduling problem.
2. **The bracket needs no backend** — it renders from frozen contracts + the sim's `/state`,
   which already works in production. So it's the _first_ big visual, not the last.

Dependency spine: `pricing → markets · betting → bet slip · everything → simulator finale`.
That yields a reveal roughly every time you flip a flag:

| Beat                            | The room sees                                                        |
| ------------------------------- | -------------------------------------------------------------------- |
| Fleet launches                  | Six sessions planning/building; prod live and empty                  |
| **Trader: flags panel**         | First delivery is the _release console itself_ — you stop using curl |
| **Flip: bracket** 🚩            | The circular bracket appears on the public site — the real World Cup |
| **Flip: markets** 🚩            | Real odds go live; France favourite; the margin narrated             |
| **Flip: bet slip + my bets** 🚩 | Betting is live → invite the room in: "phones out, 10k each"         |
| **Bots unleashed**              | Four personalities bet; the leaderboard reorders against the humans  |
| **Finale: sim run** 🚩          | Tournament plays out — bracket ignites, bets settle, confetti        |

The simulator and betting cook invisibly through the first stretch — fine, because the screen
always has a freshly-released thing on it.

## Progress protocol

Every session is asked to **post a one-line progress update as it completes each milestone**
(what shipped · what's next). That gives the host a running feed to narrate from and to decide
when a flag is ready to flip — no need to dig through terminals.

## Identity / auth (deliberately simple)

No passwords. A punter enters a **name** → an account with 10k opens → the browser holds the
account id in localStorage. That _is_ the auth model, and it's the right level for a demo.
(Optional cheap hardening: reject duplicate names so nobody impersonates the leader.)
