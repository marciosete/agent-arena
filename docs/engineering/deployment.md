# Deployment — continuous delivery, dark launches, flag releases

The enterprise story this repo demonstrates end to end:

> **Integration** is continuous (trunk-based, every checkpoint merges to main) ·
> **review** happens before every merge (Claude code-review + the commit gates) ·
> **deploy** is automatic (green main → Render + Vercel) ·
> **release** is a business decision (a feature-flag flip in Postgres — no deploy).

Everything ships **dark**. The punter app is in production all day; features appear
the moment their flag flips.

## Topology

| What                               | Where                       | How it deploys                                                                                                                                                        |
| ---------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pricing, betting, simulator, flags | **Render** (4 web services) | Render auto-deploy **off**; the CI `deploy-backends` job triggers each deploy via the Render API after all gates pass, then waits for `live` — migrations run on boot |
| punter-web, trader-ops             | **Vercel** (2 projects)     | Vercel git auto-deploy **disabled**; the CI `deploy-frontends` job (needs all gates, main only) is the only prod path                                                 |
| Postgres (betting, pricing, flags) | **Neon**                    | already provisioned                                                                                                                                                   |

**No green, no deploy.** A failing test, a lint warning, a leaked secret, a coverage miss —
anything that fails the gates keeps production untouched, frontends and backends alike. Both
deploy jobs fan in on the same seven parallel gate lanes (lint/format, typecheck,
architecture+duplication, test+build, yaml, SonarQube, secret scan); CI is the single control
plane for all six services.

**Domains** (`hackathon.beer`, DNS managed at the registrar — records point `www`/`trader`/apex
at Vercel and the service subdomains at Render): `www` → punter-web (apex 308s to www) ·
`trader` → trader-ops · `pricing` / `betting` / `simulator` / `flags` → CNAMEs to the Render
services. The Vercel env vars point at these stable subdomains.

## Releasing a feature (the money moment)

Deploys happen all day; releases are flag flips:

The trader-ops console is the release panel: **sign in with an admin email**
(`ADMIN_EMAILS` on betting) and the flag toggles just work — flipping a flag reveals a
feature in production with no deploy. Under the hood every call carries your Bearer token:

```bash
# reads need any logged-in token; the flip needs an ADMIN token (see below)
TOKEN=… # an admin operator's JWT (from signing in with an ADMIN_EMAILS address)

# see the flag board
curl https://flags.hackathon.beer/flags -H "authorization: Bearer $TOKEN" | jq

# RELEASE the markets page to production — no deploy involved
curl -X PUT https://flags.hackathon.beer/flags/punter-markets \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"enabled": true}'

# kill switch: dark again in one second
curl -X PUT https://flags.hackathon.beer/flags/punter-markets \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"enabled": false}'
```

## Gotchas

- **Free-tier spin-down**: Render free services sleep after ~15 min idle and take
  ~30–60s to wake. Pre-warm all four `/health` URLs before the show (it's in the
  run-of-show pre-flight), or upgrade the instances for the day.
- **npm 11**: the build command pins it — same lockfile rule as CI.
- **Flag writes are admin-guarded by identity**: `PUT /flags/:key` needs a token with the
  `admin` claim (`AdminGuard`) — stamped at login for `ADMIN_EMAILS` addresses. Reads need any
  valid token. There is no `x-admin-key` and nothing to arm in the UI: the operator signs in
  with an admin email and the release panel works.
