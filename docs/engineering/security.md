# Security posture — public repo, adversarial audience

The repo and the `hackathon.beer` APIs are public, and ~20 engineers with source access and
Claude Code will probe them. This is the honest state of the defenses.

## What's actually a control here

Attackers use `curl` and scripts, not a victim's browser — so **browser-only controls
(CORS, SameSite) are not defenses** against this audience. The real controls are the
server-side auth guards. We lean on those.

## In place

| Control                           | Status                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No secrets in git history         | ✅ verified — no `.env` ever committed; gitleaks full-history scan clean                                                                                       |
| CI secrets safe from fork PRs     | ✅ workflows use `pull_request` (not `pull_request_target`); GitHub withholds secrets from fork runs                                                           |
| Secret scanning + push protection | ✅ GHAS enabled on the repo                                                                                                                                    |
| Admin actions guarded by identity | ✅ flag flips, simulator control, settlement, reset + bot provisioning need a token with the unforgeable `admin` claim (shared `AdminGuard`); no `x-admin-key` |
| Admin allowlist                   | ✅ `admin` claim stamped at login for `ADMIN_EMAILS` addresses; service-to-service uses admin service tokens                                                   |
| Input validation                  | ✅ every inbound payload parsed with zod contract schemas                                                                                                      |
| Prisma parameterized queries      | ✅ no raw SQL; no `$queryRawUnsafe`                                                                                                                            |
| Timing-safe key comparison        | ✅ guards use `crypto.timingSafeEqual`                                                                                                                         |

## Known limitations (accepted for a one-day demo)

- **No rate limiting.** Free-tier Render services can be knocked over by volume. Mitigation:
  the demo runs **locally as the ultimate fallback** (same code, same DB) — a DoS'd public
  URL doesn't stop the show. Upgrade the Render instances for the day if you want resilience.
- **Every endpoint now requires a valid JWT** (only `GET /health` and betting `/auth/*` are
  public), enforced across all services by the shared `@arena/service-auth` guard. Placing a bet
  derives the account from the token (no `accountId` in the body), so there's no cross-account
  IDOR. `GET /accounts/:id` still exposes balances to any _logged-in_ user by design (that's the
  leaderboard) — no real PII.
- **All four Neon databases share one role** (`neondb_owner`). Connection strings aren't
  public, but if one leaked, it reaches all four DBs. Post-event, or if you want defense in
  depth: create a scoped role per database. Rotate the shared password after the event
  regardless (it passed through the setup chat).
- **Admin authority is identity-based, not a shared key** — the `admin` claim is stamped at
  login for `ADMIN_EMAILS` addresses, so admin actions are attributable to a user. The residual
  trust is that any holder of `SESSION_SECRET` (the backend services) can mint an admin token —
  acceptable because that secret is backend-only and never leaves the server.

## If a pentester "wins"

The blast radius is contained: virtual money only, no PII, no payment rails, a resettable
simulator bracket (admin `/reset` cascade), and every database is disposable (drop and re-migrate).
The worst realistic outcome is demo disruption — which the local fallback neutralizes.

## Rotate after the event

The shared **`SESSION_SECRET`** (signs every JWT — a leak forges any session, including admin
tokens), the **`RESEND_API_KEY`**, the Neon password, and the `VERCEL_TOKEN` — all handled during
setup and should be cycled. (The old per-service `*_ADMIN_KEY`s were removed with the move to
identity-based admin.)
