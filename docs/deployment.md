# Deployment — continuous delivery, dark launches, flag releases

The enterprise story this repo demonstrates end to end:

> **Integration** is continuous (trunk-based, every checkpoint merges to main) ·
> **review** happens before every merge (Claude code-review + the commit gates) ·
> **deploy** is automatic (green main → Render + Vercel) ·
> **release** is a business decision (a feature-flag flip in Postgres — no deploy).

Everything ships **dark**. The punter app is in production all day; features appear
the moment their flag flips.

## Topology

| What                               | Where                       | How it deploys                                                                                     |
| ---------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| pricing, betting, simulator, flags | **Render** (4 web services) | `render.yaml` blueprint, auto-deploy on push to main; Prisma migrations run on boot (`start:prod`) |
| punter-web, trader-ops             | **Vercel** (2 projects)     | auto-build on push to main                                                                         |
| Postgres (betting, pricing, flags) | **Neon**                    | already provisioned                                                                                |

## One-time setup (~20 min, needs your dashboards)

### Render

1. Dashboard → **New → Blueprint** → select `marciosete/agent-arena`. Render reads
   `render.yaml` and proposes the four services.
2. When prompted for the `sync: false` env vars, paste the values from the local
   `.env` files (`services/*/.env`) — the three Neon connection strings.
3. Apply. First deploy takes a few minutes; each service must go green on `/health`.
4. Note the four public URLs (e.g. `https://arena-pricing.onrender.com`).
5. Recommended: in each service → Settings → Build & Deploy, set **Auto-Deploy** to
   "After CI Checks Pass" so Render waits for GitHub CI before rolling out.

### Vercel

1. **Add New → Project** → import `marciosete/agent-arena` → set **Root Directory**
   to `apps/punter-web` (framework auto-detects Vite). Repeat for `apps/trader-ops`.
2. In each project → Settings → Environment Variables, add (values = Render URLs):
   - `VITE_PRICING_URL` → `https://arena-pricing.onrender.com`
   - `VITE_BETTING_URL` → `https://arena-betting.onrender.com`
   - `VITE_SIMULATOR_URL` → `https://arena-simulator.onrender.com`
   - `VITE_FLAGS_URL` → `https://arena-flags.onrender.com`
3. Redeploy so the env vars bake into the build.

## Releasing a feature (the money moment)

Deploys happen all day; releases are flag flips:

```bash
# see the flag board
curl https://arena-flags.onrender.com/flags | jq

# RELEASE the markets page to production — no deploy involved
curl -X PUT https://arena-flags.onrender.com/flags/punter-markets \
  -H 'content-type: application/json' -d '{"enabled": true}'

# kill switch: dark again in one second
curl -X PUT https://arena-flags.onrender.com/flags/punter-markets \
  -H 'content-type: application/json' -d '{"enabled": false}'
```

The trader-ops workstream builds a toggle panel for this, so by the finale you flip
flags from the back office instead of curl.

## Gotchas

- **Free-tier spin-down**: Render free services sleep after ~15 min idle and take
  ~30–60s to wake. Pre-warm all four `/health` URLs before the show (it's in the
  run-of-show pre-flight), or upgrade the instances for the day.
- **npm 11**: the build command pins it — same lockfile rule as CI.
- **Flag writes are unauthenticated** — fine for a one-day demo on obscure URLs;
  in a real system that PUT sits behind SSO. Say that line on stage; it lands.
- **The demo runs locally regardless.** The deployed platform is the CD story;
  localhost is the fallback if a venue firewall hates you. Same code, same flags DB.
