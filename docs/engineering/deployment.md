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

```bash
# see the flag board
curl https://flags.hackathon.beer/flags | jq

# RELEASE the markets page to production — no deploy involved
# (the admin key lives in services/flags/.env — writes are guarded)
curl -X PUT https://flags.hackathon.beer/flags/punter-markets \
  -H "x-admin-key: $FLAGS_ADMIN_KEY" \
  -H 'content-type: application/json' -d '{"enabled": true}'

# kill switch: dark again in one second
curl -X PUT https://flags.hackathon.beer/flags/punter-markets \
  -H "x-admin-key: $FLAGS_ADMIN_KEY" \
  -H 'content-type: application/json' -d '{"enabled": false}'
```

The trader-ops workstream builds a toggle panel for this, so by the finale you flip
flags from the back office instead of curl.

## Gotchas

- **Free-tier spin-down**: Render free services sleep after ~15 min idle and take
  ~30–60s to wake. Pre-warm all four `/health` URLs before the show (it's in the
  run-of-show pre-flight), or upgrade the instances for the day.
- **npm 11**: the build command pins it — same lockfile rule as CI.
- **Flag writes are guarded**: `PUT /flags/:key` requires the `x-admin-key` header matching
  the service's `FLAGS_ADMIN_KEY` (set on Render; value in `services/flags/.env`). Reads are
  public. The trader-ops panel asks for the key once and keeps it in localStorage — it must
  never be baked into the public bundle.
