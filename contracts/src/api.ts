import { z } from 'zod';
import { BetStatusSchema, SettlementEventSchema, TeamIdSchema } from './schemas';

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

// ── Shared ─────────────────────────────────────────────────────────────

export const HealthResponseSchema = z.object({
  service: z.string(),
  status: z.literal('ok'),
  time: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ── Pricing service (:4001) ────────────────────────────────────────────
// GET  /health                → HealthResponse
// GET  /markets               → Market[]        (all markets, priced)
// GET  /markets/:fixtureId    → Market          (match-winner market for fixture)
// GET  /outright              → Market          (tournament winner market)
// POST /reprice               → Market[]        (recompute after a result; body: RepriceRequest)

export const RepriceRequestSchema = z.object({
  settlement: SettlementEventSchema,
});
export type RepriceRequest = z.infer<typeof RepriceRequestSchema>;

// ── Betting service (:4002) ────────────────────────────────────────────
// GET  /health                → HealthResponse
// POST /accounts              → Account         (body: CreateAccountRequest)
// GET  /accounts/:id          → Account
// GET  /accounts              → Account[]
// POST /bets                  → Bet             (body: PlaceBetRequest)
// GET  /bets?accountId=:id    → Bet[]
// POST /settle                → SettleResponse  (body: SettleRequest; called by sim)
// GET  /exposure              → ExposureReport  (trader back office)

export const CreateAccountRequestSchema = z.object({
  name: z.string().min(1).max(50),
  isBot: z.boolean().default(false),
});
export type CreateAccountRequest = z.infer<typeof CreateAccountRequestSchema>;

export const PlaceBetRequestSchema = z.object({
  accountId: z.string().uuid(),
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
// GET  /flags                 → FeatureFlag[]
// PUT  /flags/:key            → FeatureFlag   (body: UpdateFlagRequest)

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
// GET  /state                 → SimState        (current bracket incl. simulated results)
// POST /play-next             → SimState        (simulate the next unplayed fixture)
// POST /run                   → SimState        (body: RunRequest; fast-forward to the final)
// POST /reset                 → SimState        (back to real-world state)

export const RunRequestSchema = z.object({
  /** ms pause between simulated fixtures so UIs can animate; 0 = instant */
  intervalMs: z.number().int().min(0).max(30_000).default(2_000),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

export const SimStateSchema = z.object({
  champion: TeamIdSchema.nullable(),
  playedFixtureIds: z.array(z.string()),
  remainingFixtureIds: z.array(z.string()),
});
export type SimState = z.infer<typeof SimStateSchema>;
