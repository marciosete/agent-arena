import { z } from 'zod';
import {
  AccountSchema,
  BetStatusSchema,
  FixtureSchema,
  SettlementEventSchema,
  TeamIdSchema,
} from './schemas';

/**
 * Service topology and REST contracts.
 * FROZEN during the event — every service implements exactly this surface,
 * every client calls exactly this surface.
 */

export const PORTS = {
  pricing: 4001,
  betting: 4002,
  simulator: 4003,
  flags: 4004,
  punterWeb: 5173,
  traderOps: 5174,
} as const;

/**
 * Local-development defaults. Deployed clients override per service:
 * - Vite apps:  `import.meta.env.VITE_PRICING_URL ?? BASE_URLS.pricing` (etc.)
 * - Node/bots:  `process.env.PRICING_URL ?? BASE_URLS.pricing` (etc.)
 * Servers must bind to `process.env.PORT ?? PORTS.<service>` (Render injects PORT).
 */
export const BASE_URLS = {
  pricing: `http://localhost:${PORTS.pricing}`,
  betting: `http://localhost:${PORTS.betting}`,
  simulator: `http://localhost:${PORTS.simulator}`,
  flags: `http://localhost:${PORTS.flags}`,
} as const;

/** Every account starts with this balance (virtual dollars). */
export const OPENING_BALANCE = 10_000;

/** Bookmaker margin applied on top of fair probabilities (5% overround). */
export const TARGET_OVERROUND = 1.05;

// ── Auth model (platform-wide, pre-built) ──────────────────────────────
// Every endpoint requires `Authorization: Bearer <jwt>`, with exactly two
// exceptions: `GET /health` (all services) and betting's `POST /auth/request-otp`
// + `POST /auth/verify`. Nothing else is public — markets, flags, accounts,
// bets, exposure and sim state all require a valid token; there is simply no
// per-user check on reads (any logged-in caller may read them).
//   • Humans   → betting /auth (email + OTP) issues the token; the apps attach it
//                on every call via @arena/web-auth `apiFetch`.
//   • Bots     → admin-keyed POST /accounts returns a token (bots have no inbox).
//   • Services → mint a service token with @arena/service-auth `signToken('<svc>')`
//                (shared SESSION_SECRET) before calling another service.
// A handful of MUTATIONS need an ADDITIONAL `x-admin-key` on top of the JWT:
// betting POST /accounts + POST /settle, flags PUT /flags/:key, and every
// simulator control endpoint (POST /play-next, /run, /reset).

// ── Shared ─────────────────────────────────────────────────────────────

export const HealthResponseSchema = z.object({
  service: z.string(),
  status: z.literal('ok'),
  time: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ── Pricing service (:4001) ────────────────────────────────────────────
// GET  /health                → HealthResponse
// GET  /markets               → Market[]        🔒 Bearer (all markets, priced)
// GET  /markets/:fixtureId    → Market          🔒 Bearer (match-winner market for a fixture)
// GET  /outright              → Market          🔒 Bearer (tournament winner market)
// POST /reprice               → Market[]        🔒 Bearer (body: RepriceRequest; called by the simulator
//                               with a service token after each result — advances the bracket, reprices,
//                               and returns the updated markets)

export const RepriceRequestSchema = z.object({
  settlement: SettlementEventSchema,
});
export type RepriceRequest = z.infer<typeof RepriceRequestSchema>;

// ── Betting service (:4002) ────────────────────────────────────────────
// Accounts + auth are PRE-BUILT platform infra (passwordless email + OTP → session token).
// GET  /health                → HealthResponse
// POST /auth/request-otp      → { ok: true }    (body: RequestOtpRequest) — emails a 6-digit code; always 200 (no account enumeration)
// POST /auth/verify           → AuthResponse    (body: VerifyOtpRequest) — verifies the code, find-or-create by email, issues a session token
// POST /accounts              → AuthResponse    🔒 x-admin-key (body: CreateAccountRequest) — bot provisioning (bots have no inbox)
// GET  /accounts/:id          → Account         🔒 Bearer (any logged-in user; balances/nicknames show on the leaderboard)
// GET  /accounts              → Account[]        🔒 Bearer (leaderboard source)
// POST /bets                  → Bet             🔒 Bearer (body: PlaceBetRequest; the account is derived from the token, never trusted from the body)
// GET  /bets?accountId=:id    → Bet[]           🔒 Bearer (a punter's own bets — the my-bets view)
// POST /settle                → SettleResponse  🔒 Bearer + x-admin-key (body: SettleRequest; called by the
//                               simulator with a service token after each result)
// GET  /exposure              → ExposureReport  🔒 Bearer (trader back office — staked + max liability per market)
//
// Auth convention: /auth/verify and (admin) /accounts return { token, account }. Send the token
// as `Authorization: Bearer <token>` on protected endpoints. Tokens are signed + expiring.

// Auth (pre-built): passwordless email + one-time code → signed session token.
export const RequestOtpRequestSchema = z.object({
  email: z.string().email(),
});
export type RequestOtpRequest = z.infer<typeof RequestOtpRequestSchema>;

export const VerifyOtpRequestSchema = z.object({
  email: z.string().email(),
  /** the 6-digit code from the email */
  code: z.string().regex(/^\d{6}$/),
  /** nickname for a NEW account — shown on the leaderboard and in the UI; ignored if the
   * account already exists (existing nickname is kept). */
  name: z.string().min(1).max(50).optional(),
});
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;

export const AuthResponseSchema = z.object({
  /** send as `Authorization: Bearer <token>` on protected endpoints */
  token: z.string().min(1),
  account: AccountSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/** Bot provisioning only (admin-keyed) — human accounts are created by /auth/verify. */
export const CreateAccountRequestSchema = z.object({
  name: z.string().min(1).max(50),
  isBot: z.boolean().default(false),
});
export type CreateAccountRequest = z.infer<typeof CreateAccountRequestSchema>;

export const PlaceBetRequestSchema = z.object({
  // No accountId: the betting service derives the account from the Bearer session token,
  // so a punter can only ever bet from their own wallet (no IDOR).
  marketId: z.string().min(1),
  selectionId: z.string().min(1),
  stake: z.number().positive().max(OPENING_BALANCE),
  /** price the punter saw; betting service rejects if it moved beyond tolerance */
  acceptedPrice: z.number().min(1.01),
  /** client-generated key making bet placement idempotent */
  idempotencyKey: z.string().uuid(),
});
export type PlaceBetRequest = z.infer<typeof PlaceBetRequestSchema>;

export const SettleRequestSchema = z.object({
  settlement: SettlementEventSchema,
  /** winning selection per affected market, computed by pricing/sim */
  winningSelections: z.array(
    z.object({ marketId: z.string().min(1), selectionId: z.string().min(1) })
  ),
});
export type SettleRequest = z.infer<typeof SettleRequestSchema>;

export const SettleResponseSchema = z.object({
  settledBets: z.number().int().min(0),
  totalPaidOut: z.number().min(0),
});
export type SettleResponse = z.infer<typeof SettleResponseSchema>;

export const ExposureReportSchema = z.object({
  generatedAt: z.string().datetime(),
  markets: z.array(
    z.object({
      marketId: z.string().min(1),
      marketName: z.string().min(1),
      totalStaked: z.number().min(0),
      /** worst-case payout across selections */
      maxLiability: z.number().min(0),
      betCount: z.number().int().min(0),
      status: z.enum(['open', 'suspended', 'settled']),
    })
  ),
});
export type ExposureReport = z.infer<typeof ExposureReportSchema>;

export const BetQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  status: BetStatusSchema.optional(),
});
export type BetQuery = z.infer<typeof BetQuerySchema>;

// ── Flags service (:4004) ──────────────────────────────────────────────
// Platform infrastructure (pre-built, not a workstream): feature flags as
// data, so RELEASE is decoupled from DEPLOY. Everything ships dark; flipping
// a flag reveals it in production without a deployment.
// GET  /health                → HealthResponse
// GET  /flags                 → FeatureFlag[]  🔒 Bearer (punter feature-gating + trader panel read)
// PUT  /flags/:key            → FeatureFlag    🔒 Bearer + x-admin-key (body: UpdateFlagRequest;
//                               the admin key — FLAGS_ADMIN_KEY — is the EXTRA gate on writes)

export const FeatureFlagSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
  description: z.string(),
  updatedAt: z.string().datetime(),
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

export const UpdateFlagRequestSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateFlagRequest = z.infer<typeof UpdateFlagRequestSchema>;

/** The flag set. Everything starts dark (false) — release is a flag flip. */
export const FLAG_DEFINITIONS = [
  { key: 'punter-markets', description: 'Punter app: markets & odds board' },
  { key: 'punter-bet-slip', description: 'Punter app: bet slip & placement' },
  { key: 'punter-my-bets', description: 'Punter app: my-bets view' },
  { key: 'punter-bracket', description: 'Punter app: Road to the Final bracket' },
  { key: 'punter-confetti', description: 'Punter app: champion confetti' },
] as const;
export type FlagKey = (typeof FLAG_DEFINITIONS)[number]['key'];

// ── Simulator service (:4003) ──────────────────────────────────────────
// GET  /health                → HealthResponse
// GET  /state                 → SimState        🔒 Bearer (live bracket incl. results — punter bracket + trader feed poll this)
// POST /play-next             → SimState        🔒 Bearer + x-admin-key (simulate the next unplayed fixture)
// POST /run                   → SimState        🔒 Bearer + x-admin-key (body: RunRequest; fast-forward to the final)
// POST /reset                 → SimState        🔒 Bearer + x-admin-key (back to real-world state)

export const RunRequestSchema = z.object({
  /** ms pause between simulated fixtures so UIs can animate; 0 = instant */
  intervalMs: z.number().int().min(0).max(30_000).default(2_000),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

export const SimStateSchema = z.object({
  /**
   * The full live bracket: the same fixtures as the `FIXTURES` seed, but with results
   * filled in as they are played — status → 'finished', homeScore/awayScore, winnerTeamId,
   * and the winner propagated into the next fixture's home/away slot (per feedsInto/
   * feedsIntoSlot). This is the ONLY source of live scores + winners: the punter bracket
   * and the trader settlement feed both render from `fixtures`. The id arrays below are
   * conveniences derived from it.
   */
  fixtures: z.array(FixtureSchema),
  /** set once the final is played */
  champion: TeamIdSchema.nullable(),
  playedFixtureIds: z.array(z.string()),
  remainingFixtureIds: z.array(z.string()),
});
export type SimState = z.infer<typeof SimStateSchema>;
