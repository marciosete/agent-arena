# Security posture — public repo, adversarial audience

The repo and the `hackathon.beer` APIs are public, and ~20 engineers with source access and
Claude Code will probe them. This is the honest state of the defenses.

## What's actually a control here

Attackers use `curl` and scripts, not a victim's browser — so **browser-only controls
(CORS, SameSite) are not defenses** against this audience. The real controls are the
server-side auth guards. We lean on those.

## In place

| Control                           | Status                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| No secrets in git history         | ✅ verified — no `.env` ever committed; gitleaks full-history scan clean                             |
| CI secrets safe from fork PRs     | ✅ workflows use `pull_request` (not `pull_request_target`); GitHub withholds secrets from fork runs |
| Secret scanning + push protection | ✅ GHAS enabled on the repo                                                                          |
| Flag writes guarded               | ✅ `PUT /flags/:key` needs `x-admin-key` (`FLAGS_ADMIN_KEY`); reads public                           |
| Simulator control plane guarded   | ✅ `POST /reset` (+ `/play-next`, `/run` when built) needs `x-admin-key` (`SIMULATOR_ADMIN_KEY`)     |
| Settlement guard (betting)        | 📋 specced — `/settle` must carry `BETTING_ADMIN_KEY`; built tomorrow                                |
| Input validation                  | ✅ every inbound payload parsed with zod contract schemas                                            |
| Prisma parameterized queries      | ✅ no raw SQL; no `$queryRawUnsafe`                                                                  |
| Timing-safe key comparison        | ✅ guards use `crypto.timingSafeEqual`                                                               |

## Known limitations (accepted for a one-day demo)

- **No rate limiting.** Free-tier Render services can be knocked over by volume. Mitigation:
  the demo runs **locally as the ultimate fallback** (same code, same DB) — a DoS'd public
  URL doesn't stop the show. Upgrade the Render instances for the day if you want resilience.
- **Read endpoints are unauthenticated** (markets, flags, accounts, bets, state). That's by
  design — it's a public sportsbook demo. IDOR on `GET /accounts/:id` exposes balances by id;
  acceptable because there's no real PII and no cross-account mutation path.
- **All three Neon databases share one role** (`neondb_owner`). Connection strings aren't
  public, but if one leaked, it reaches all three DBs. Post-event, or if you want defense in
  depth: create a scoped role per database. Rotate the shared password after the event
  regardless (it passed through the setup chat).
- **Admin keys are shared per service, not per user.** Fine for a single operator; not an
  audit trail of who flipped what.

## If a pentester "wins"

The blast radius is contained: virtual money only, no PII, no payment rails, ephemeral
simulator state with a `/reset`, and every database is disposable (drop and re-migrate).
The worst realistic outcome is demo disruption — which the local fallback neutralizes.

## Rotate after the event

`FLAGS_ADMIN_KEY`, `SIMULATOR_ADMIN_KEY`, `BETTING_ADMIN_KEY` (once created), the Neon
password, and the `VERCEL_TOKEN` — all handled during setup and should be cycled.
