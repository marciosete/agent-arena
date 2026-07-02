# Integration & auth contract

How the seven components fit together. This is the **single, authoritative description of every
cross-service dependency** — each spec in `docs/specs/` links here instead of re-describing (and
drifting on) the wires. If a spec and this document disagree, this document and
`contracts/src/api.ts` win. Read this before building any component that talks to another.

The golden rule: **`@arena/contracts` is the source of truth.** Ports, URLs, every request/response
shape (zod), the flag set, `TEAMS`, `FIXTURES`, `OPENING_BALANCE` (10,000) and `TARGET_OVERROUND`
(1.05) are all exported from it. Import them; never redefine or hardcode.

---

## 1. Auth model (platform-wide, pre-built)

Auth is **already built** — nobody's workstream implements it. It lives in two shared packages:

- **`@arena/service-auth`** (backend) — `signToken`/`verifyToken` (HS256 JWT, shared
  `SESSION_SECRET`), a global `JwtAuthGuard` (already wired as an `APP_GUARD` in every service),
  the `@Public()` decorator, and `ZodValidationPipe`.
- **`@arena/web-auth`** (frontend) — `AuthProvider`/`useAuth`, `LoginPage`, `RequireAuth`, and
  `apiFetch` (attaches the Bearer token automatically).

**Every endpoint requires `Authorization: Bearer <jwt>`.** The only exceptions are `GET /health`
(all services) and betting's `POST /auth/request-otp` + `POST /auth/verify` (marked `@Public()`).
There are **no other public endpoints** — markets, flags, accounts, bets, exposure and sim state all
need a valid token. (There is no per-user check on _reads_: any logged-in caller may read them. The
per-user rule is only on writes — a punter bets from their own wallet, derived from the token.)

Who gets a token, and how:

| Caller                    | How it authenticates                                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Human punter / trader** | Signs in through `@arena/web-auth` `LoginPage` (email → 6-digit OTP → JWT). The app then calls services via `apiFetch`, which attaches the Bearer token. Both apps are wrapped in `<AuthProvider><RequireAuth>` — no valid token ⇒ `/login`. |
| **Bot**                   | Bots have no inbox. A bot is provisioned once via admin-keyed `POST /accounts` (returns `{ token, account }`); it reuses that token as its Bearer on every call.                                                                             |
| **Service → service**     | Mint a short-lived service token with `@arena/service-auth` `signToken('<service>')` (same `SESSION_SECRET`) and send it as the Bearer. Used by betting→pricing and simulator→pricing/betting.                                               |

Some **mutations require an ADDITIONAL `x-admin-key`** on top of the JWT (defence in depth for the
control plane): betting `POST /accounts` + `POST /settle`, flags `PUT /flags/:key`, and every
simulator control endpoint (`POST /play-next`, `/run`, `/reset`). Admin keys are per-service env
vars (`BETTING_ADMIN_KEY`, `FLAGS_ADMIN_KEY`, `SIMULATOR_ADMIN_KEY`); the trader app holds the
flags admin key, the operator/bots hold the others.

**Canonical failure codes** (assert these in every spec's DoD): a missing or invalid Bearer token ⇒
`401 Unauthorized` (from the shared `JwtAuthGuard`); a missing or wrong `x-admin-key` on a control
endpoint ⇒ `403 Forbidden`; a body that fails its zod schema ⇒ `400 Bad Request`; a bet whose price
moved beyond tolerance ⇒ `409 Conflict`.

**Frontend surface (`@arena/web-auth`, pre-built — both apps use exactly this; don't reinvent it).**
Wrap the app in `<AuthProvider bettingUrl={…}><RequireAuth>…</RequireAuth></AuthProvider>`. Then
`useAuth()` returns `{ session, requestOtp(email), verify(email, code, name?), logout(),
refreshBalance() }`, where `session` is `{ token, account }` or `null` and `account` is a contract
`Account` (`id`, `name` = nickname, `balance`, `email`, `isBot`). Call services with
`apiFetch(url, init)` — it attaches the Bearer automatically. `RequireAuth` renders `LoginPage`
(email → OTP → nickname) whenever there is no valid session, and resets the URL to `/` after sign-in.

---

## 2. Who calls whom

Arrows are runtime HTTP calls. Every arrow carries a Bearer JWT (§1); extra requirements noted.

```
punter-web ──GET /flags────────────────▶ flags
punter-web ──GET /markets, /outright───▶ pricing
punter-web ──POST /bets, GET /bets─────▶ betting        (bet placement + my-bets)
punter-web ──GET /accounts/:id─────────▶ betting        (wallet refresh; via web-auth)
punter-web ──GET /state────────────────▶ simulator      (bracket + live results)

trader-ops ──GET /exposure, /accounts──▶ betting        (liability board + leaderboard)
trader-ops ──GET /flags────────────────▶ flags          (read)
trader-ops ──PUT /flags/:key───────────▶ flags          (+ x-admin-key: the release switch)
trader-ops ──GET /state────────────────▶ simulator      (settlement feed)
trader-ops ──POST /play-next,/run,/reset▶ simulator     (+ x-admin-key: finale control, optional)

betting ────GET /markets/:fixtureId────▶ pricing        (validate price + market open at bet time; service token)

simulator ──POST /reprice──────────────▶ pricing        (after each result; service token)
simulator ──POST /settle───────────────▶ betting        (after each result; service token + x-admin-key)

bots ───────POST /accounts─────────────▶ betting        (provision self; x-admin-key ⇒ token)
bots ───────GET /markets───────────────▶ pricing        (find value)
bots ───────POST /bets─────────────────▶ betting        (place bets with own token)
bots ───────GET /accounts/:id, /bets───▶ betting        (own bankroll + settled results for strategy)
bots ───────GET /state─────────────────▶ simulator      (react to results; optional)
```

pricing and betting never call the apps; the apps and bots poll. The simulator is the only writer
that fans out (reprice + settle).

---

## 3. The two joins everything depends on

**Bracket ↔ market join.** A `Market` with `type: 'MATCH_WINNER'` sets `fixtureId` to the `Fixture`
it prices (the `OUTRIGHT` market has `fixtureId: null`). **`Selection.name` MUST equal the
`Team.name`** of the team that selection represents. That single naming convention is load-bearing:

- the **punter** joins a bracket slot to its live price by `fixtureId`, and labels the selection by
  team name;
- the **simulator** turns a `winnerTeamId` into a winning `selectionId` by finding the selection
  whose `name` matches that team's `Team.name` (look the team up in `TEAMS`).

So: `winnerTeamId` (3-letter `TeamId`) → `TEAMS[…].name` → the `Selection` whose `name` matches →
its `selectionId`. Pricing owns selection ids; everyone else resolves them **by name**, never by
guessing an id format.

**Market ids are derivable, so no one scans the full list to resolve one.** A `MATCH_WINNER`
market's `id` **equals its `fixtureId`**; the `OUTRIGHT` market's `id` is the fixed string
`'outright'`. So any holder of a `marketId` — a punter's bet, the exposure board, the simulator —
fetches that market directly (`GET /markets/:fixtureId` for a match, `GET /outright` for the
outright) and can tell the two apart by whether `marketId === 'outright'`. (Selection ids are still
resolved by name, per above — only _market_ ids are derivable.)

**Live results come only from `GET /state`.** `FIXTURES` from the contract is the _static_ seed
(structure + real R32 results already played). The **simulator** holds the single mutable copy and
exposes it as `SimState.fixtures` — the same fixtures with `status`/`homeScore`/`awayScore`/
`winnerTeamId` filled in and the winner propagated into the next fixture's `home`/`away` slot (per
`feedsInto`/`feedsIntoSlot`). The punter bracket and the trader feed render from `SimState.fixtures`,
**not** from `FIXTURES`.

`decidedOnPenalties` is **not** a `Fixture` field (it lives only on `SettlementEvent`). Any UI that
shows a "(pens)" indicator off `/state` derives it identically: a `finished` fixture with
`homeScore == awayScore` and a non-null `winnerTeamId` was decided on penalties.

---

## 4. The finale chain (the one sequence to get right)

Every result flows through the same pipeline. This is where the six workstreams meet, so each step
names its contract:

1. **Trigger.** Operator (trader app or a script) → simulator `POST /play-next` (one fixture) or
   `POST /run` (fast-forward, `intervalMs` pause between fixtures) — Bearer + `x-admin-key`.
2. **Simulate.** Simulator picks the next unplayed `Fixture`, decides a winner (elo-weighted),
   mutates its bracket copy (score, `winnerTeamId`, `status: 'finished'`, advance the winner), and
   builds a `SettlementEvent { fixtureId, winnerTeamId, homeScore, awayScore, decidedOnPenalties,
settledAt }`.
3. **Reprice.** Simulator → pricing `POST /reprice { settlement }`. Pricing fills the next
   fixture's open slot, marks that fixture's `MATCH_WINNER` market `settled`, reprices the newly-
   determined downstream markets and the `OUTRIGHT`, and returns the updated `Market[]`. That array
   includes the just-settled `MATCH_WINNER` market **with its `selections` still populated** (every
   `Market` carries ≥2 selections by schema — names stay intact even when `settled`) plus the
   repriced `OUTRIGHT`, so step 4 resolves winners from this one response — no second round-trip.
4. **Resolve winners.** From the returned markets the simulator computes `winningSelections`: for the
   just-settled `MATCH_WINNER` market, the selection whose `name` == the winner's `Team.name`; when
   the **final** is played, also the `OUTRIGHT` selection for the champion. (This is the §3 join.)
5. **Settle bets.** Simulator → betting `POST /settle { settlement, winningSelections }` (Bearer +
   `x-admin-key`). Betting, in a `$transaction`, marks each matching `pending` bet `won` (credit
   `potentialReturn` to the wallet) or `lost`, and returns `SettleResponse { settledBets,
totalPaidOut }`.
6. **Reflect.** UIs poll and animate: punter bracket + my-bets (`GET /state`, `GET /bets`), trader
   exposure + leaderboard (`GET /exposure`, `GET /accounts`). Champion set ⇒ punter confetti (flag
   `punter-confetti`).

If `winningSelections` is wrong (e.g. selection matched by a guessed id instead of by team name),
bets settle against the wrong outcome — step 4 is the fragile one. Test it against a real
`GET /markets` response, not a hand-built object.

---

## 5. Bet placement (punter → betting → pricing)

1. Punter submits `PlaceBetRequest { marketId, selectionId, stake, acceptedPrice, idempotencyKey }`
   to betting `POST /bets` (Bearer). **There is no `accountId`** — betting derives the account from
   the token, so a punter can only bet from their own wallet.
2. Betting validates: `idempotencyKey` unseen; account has funds; then it checks the live market by
   calling pricing `GET /markets/:fixtureId` (or `/markets`) **with a service token** — the market
   must be `open` and the current price must be within tolerance of `acceptedPrice` (else `409`, the
   price moved). Price and `potentialReturn = stake × price` are locked at placement.
3. Betting debits the wallet and records a `pending` `Bet` in a `$transaction`.

The price **tolerance** is betting's internal rule, **not** a shared constant: clients just send the
`acceptedPrice` they displayed and handle a `409` if the price moved. No other spec should hardcode a
tolerance percentage.

Everything runs behind flags: `punter-markets`, `punter-bet-slip`, `punter-my-bets`,
`punter-bracket`, `punter-confetti` (all start dark; release = flip). Local dev
(`import.meta.env.DEV`) shows every feature so builders never flip a prod flag just to see their work.

---

## 6. Release model (flags)

Everything ships **dark**. A feature is revealed in production by flipping its flag
(`PUT /flags/:key`, from the trader app with the flags admin key) — no redeploy. The punter app
reads `GET /flags` and gates its nav/features on them; in local dev all features show regardless.
See `docs/engineering/deployment.md`.
