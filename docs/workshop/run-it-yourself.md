# Run it yourself — build the sportsbook with a fleet of Claude sessions

This is the flagship "learn by doing" doc. You forked the repo; now **re-run the workshop**:
stand up the platform locally and let **six parallel Claude Code sessions** build the
sportsbook the way it was originally built — each session owning one workstream, coordinating
only through the frozen contract.

You do not write the features. You provision the world, launch the fleet, and act as the
engineering manager: read plans, review diffs, unblock, and drive the finale. Budget ~2–3
hours the first time.

---

## 1. What you'll build & the idea

A working mini-sportsbook for the World Cup knockout stage: an odds engine, a betting ledger,
a tournament simulator, a public punter app, a trader console, and a squad of autonomous
betting bots. Six things, built by **six Claude Code sessions running at the same time**, one
per workstream.

The trick that makes parallel work without collisions: the sessions **never talk to each
other.** They coordinate through exactly two frozen artifacts —

- **`@arena/contracts`** — the single source of truth: zod schemas, REST shapes, ports, and the
  real WC2026 seed data. It is 🧊 frozen and read-only; everyone imports from it, nobody edits it.
- **`docs/engineering/integration.md`** — the auth model, who-calls-whom, and the finale chain.

Two more pieces are **pre-built platform infrastructure** and also frozen — sessions build on
top of them, they never reimplement them:

- **Auth** — passwordless email + 6-digit OTP → a signed JWT; admin is **identity-based** (your
  login email, if it's in the allowlist, gets an `admin` claim). Shared via `@arena/service-auth`
  (backend) and `@arena/web-auth` (frontend).
- **Feature flags** — everything ships dark; a flag flip reveals it. Release ≠ deploy.

So the exercise is: launch six sessions against six specs, watch them build to a contract, and
integrate the result into a working platform.

---

## 2. Prerequisites

- **Claude Code**, installed and logged in (`claude` on your PATH).
- **Node 22** and **npm 11** (`node -v` → v22.x, `npm -v` → 11.x). The repo pins these.
- A free **Neon** account (Postgres) — <https://neon.tech>. This is the only external service
  you need for the full local exercise.
- Optional, only if you also want to deploy to production: a **Render** account (the four
  services) and a **Vercel** account (the two apps). Local alone is enough to do the whole thing.

You do **not** need an email provider — OTP codes print to the console locally (see step 4).

---

## 3. Provision databases (Neon)

Four of the six services persist state, so create **four Postgres databases** — one each for
**pricing**, **betting**, **flags**, and **simulator** (the simulator now persists its bracket
too, so it has its own DB). The apps and the bots have no database.

1. Create a Neon project (one project is fine).
2. In it, create four databases: `pricing`, `betting`, `flags`, `simulator`.
3. Copy each one's **connection string** (the `postgresql://…?sslmode=require` URL). You'll paste
   them in the next step.

---

## 4. Configure env

Copy each service's example env file, then fill it in:

```bash
cp services/pricing/.env.example   services/pricing/.env
cp services/betting/.env.example   services/betting/.env
cp services/flags/.env.example     services/flags/.env
cp services/simulator/.env.example services/simulator/.env
cp bots/.env.example               bots/.env
```

Now set the values. There are only three ideas:

**a) Each service's database URL** — paste the matching Neon string:

| File                      | Variable                 |
| ------------------------- | ------------------------ |
| `services/pricing/.env`   | `PRICING_DATABASE_URL`   |
| `services/betting/.env`   | `BETTING_DATABASE_URL`   |
| `services/flags/.env`     | `FLAGS_DATABASE_URL`     |
| `services/simulator/.env` | `SIMULATOR_DATABASE_URL` |

**b) One shared `SESSION_SECRET`, identical everywhere.** This is the JWT signing/verification
key. Every service and the bots must use the **same value**, or tokens minted by one component
won't verify at another (and the bots won't be able to provision accounts). Generate one:

```bash
openssl rand -hex 32
```

Paste that same string into `SESSION_SECRET` in **betting, flags, simulator, and bots** `.env`
files. (Pricing verifies tokens too but reads the same shared secret; set it there as well if
present.) Don't leave it unset — the built-in dev fallback is rejected for admin actions.

**c) Make yourself the admin.** In `services/betting/.env`, set `ADMIN_EMAILS` to the email you'll
log in with:

```
ADMIN_EMAILS=you@example.com
```

At login, betting stamps an `admin` claim on your JWT because your email is on this allowlist.
That single claim unlocks the whole control plane platform-wide — **flag flips, the bracket
reset, and running the tournament finale.** Use a real address you can check the OTP for.

**d) OTP email is optional locally.** Leave `RESEND_API_KEY` **unset**. With no provider
configured, betting falls back to printing the code to its own console
(`[dev] OTP for you@example.com: 123456`) — so you just read the code out of the `npm run dev`
output. No email account required. (Set `RESEND_API_KEY` + `RESEND_FROM` only if you want real
emails, e.g. for a deployed run.)

**e) Bots** (`bots/.env`) need the shared `SESSION_SECRET` (above) plus the service URLs. Locally
you can leave `PRICING_URL` / `BETTING_URL` unset — they default to the contract's localhost
ports. Point them at your Render URLs only for a deployed run.

---

## 5. Install, migrate, run

Install everything (this also builds `@arena/contracts` + `@arena/service-auth` and generates the
Prisma clients via a postinstall hook):

```bash
npm install
```

Apply the migrations to your four Neon databases. Each service reads its own `.env`, so run
`migrate deploy` inside each one:

```bash
for s in pricing betting flags simulator; do
  ( cd services/$s && npx prisma migrate deploy )
done
```

Start the whole platform — all services + both apps, color-coded in one terminal:

```bash
npm run dev
```

Ports (memorize these — you'll curl and browse them all day):

| Component  | URL                   |
| ---------- | --------------------- |
| punter-web | http://localhost:5173 |
| trader-ops | http://localhost:5174 |
| pricing    | http://localhost:4001 |
| betting    | http://localhost:4002 |
| simulator  | http://localhost:4003 |
| flags      | http://localhost:4004 |

Sanity check: `curl http://localhost:4004/health` should return OK, and the punter app should
load at :5173. (`npm run dev` runs the six long-lived processes above; the **bots** run
separately — see step 6.)

> Note: on a fresh fork the service directories already contain the finished code. To truly
> re-run the _build_ exercise, work on a branch and let each session rebuild its workstream — or
> just read along as the fleet reproduces it. Either way, the setup above is what the sessions
> need underneath them.

---

## 6. Do the build — launch the six sessions

This is the heart of it. Open **six terminal tabs**, run `claude` in each, and give each one a
single kickoff: the `/goal` slash command pointed at that workstream's kickoff spec. `/goal` sets
the spec as the session's **completion contract** and keeps the session working — across many
turns — until its Definition of Done verifiably holds (see
`docs/engineering/goal-oriented-tasks.md`).

Launch **in this order, top to bottom** (they then run in parallel). Apps first — they produce the
fastest visible wins; services cook behind them; bots last, since they need markets and accounts
to exist:

| #   | Tab       | Kickoff command                            |
| --- | --------- | ------------------------------------------ |
| 1   | punter    | `/goal @docs/specs/1-punter-kickoff.md`    |
| 2   | trader    | `/goal @docs/specs/2-trader-kickoff.md`    |
| 3   | pricing   | `/goal @docs/specs/3-pricing-kickoff.md`   |
| 4   | betting   | `/goal @docs/specs/4-betting-kickoff.md`   |
| 5   | simulator | `/goal @docs/specs/5-simulator-kickoff.md` |
| 6   | bots      | `/goal @docs/specs/6-bots-kickoff.md`      |

Each `*-kickoff.md` is the full launch brief: it tells the session it's one of six building in a
shared tree, to stay strictly in its own directory, to treat `contracts/` as frozen law, to build
against the contract types and degrade gracefully when a peer service isn't up yet, and to **not
commit, push, or start dev servers**. CLAUDE.md auto-loads the conventions and quality bar; the
spec carries the rest. Nothing else to paste. (Full launch sheet + the showcase angle for each
session: `docs/workshop/kickoff-prompts.md`.)

Then you **manage, you don't code**:

- Rotate through the tabs. Approve plans (pricing is worth starting in plan mode — read its Elo
  model aloud and approve it before it builds).
- Paste a status check when you want a pulse: _"Summarise what's shipped, what's in progress,
  current test count, and your biggest open risk in four bullets."_
- Ask a session to self-review before it declares done: _"Run /code-review on your working diff
  and fix anything it finds."_
- Keep `npm run dev` visible — health dots flip green and the apps hot-reload as each surface
  lands. In local dev the apps show **every** feature regardless of flags, so you see progress
  without flipping anything.
- **You** are the one who commits, at checkpoints — the sessions never do. Stage only the
  relevant directory; never `git add -A` (a shared tree means that would sweep another session's
  work into your commit).

When the fleet has integrated, start the bots in a seventh tab so they bet into the live platform:

```bash
npm run dev -w bots
```

---

## 7. Drive the finale & reset

Now settle a tournament end to end.

1. **Log in as your admin email.** Open the punter app (:5173) or trader app (:5174), sign in with
   the email you put in `ADMIN_EMAILS`, and grab the OTP from the betting console output. Your JWT
   comes back with the `admin` claim — that's what authorizes everything below.
2. **Reset to a clean bracket.** In the **trader console**, use the **Reset-bracket** control. It
   cascades: it resets the **simulator** to the seed bracket and fans out to **pricing** (fresh
   markets) and **betting** (clears bets/wallets) — one authoritative reset across the three
   stateful services.
3. **Place some bets** — as yourself in the punter app, and let the bots bet too.
4. **Run the tournament.** Trigger the simulator to play out: `POST /play-next` advances one
   fixture, `POST /run` fast-forwards the rest (pass an `intervalMs` pause so the room can watch).
   The trader console exposes these controls; you can also curl them with your admin Bearer token.

Each result flows through the **finale chain** (the one sequence to get right, described in full
in `docs/engineering/integration.md` §4): simulator decides a winner and advances the bracket →
calls **pricing** `POST /reprice` → resolves the winning selections **by team name** → calls
**betting** `POST /settle`, which pays winners in one transaction. The UIs poll and animate:
the punter bracket ignites ring by ring, my-bets flip won/lost, the trader leaderboard reorders,
and when the champion lands the confetti fires. That's the whole platform working as one.

---

## 8. (Optional) Deploy to production

Everything above is local. To put it on the internet the way the original run did:

- **Services → Render, apps → Vercel.** The `render.yaml` blueprint provisions the four NestJS
  services; the two Vite apps go to Vercel. Deploys are **gated by CI** (no green, no deploy) and
  releases are flag flips, not deploys. The full model — topology, domains, the dark-launch
  storyline, free-tier spin-down gotchas — is in `docs/engineering/deployment.md`.
- **Per-service databases.** Point each service's `*_DATABASE_URL` (set as a secret in the Render
  dashboard, `sync: false` in the blueprint) at its own Neon database, exactly as locally.
- **Admin stays identity-based.** Set the same shared `SESSION_SECRET` on every service and set
  `ADMIN_EMAILS` on betting to your operator email — logging in with that address is what makes
  you admin in production (Reset / finale / flag flips). For real OTP emails, set `RESEND_API_KEY`
  and `RESEND_FROM` on the betting service.

---

That's the whole loop: provision, configure, launch the fleet, manage, settle. The point isn't
that agents write code fast — it's that six of them ship a coherent, contract-first platform
through real quality gates while one human directs. Have fun; flip a flag; let the confetti land.
