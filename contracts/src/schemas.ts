import { z } from 'zod';

/**
 * Core domain schemas for Agent Arena.
 * These are the single source of truth shared by every service and app.
 * FROZEN during the event — do not modify.
 */

export const RoundSchema = z.enum(['R32', 'R16', 'QF', 'SF', 'F']);
export type Round = z.infer<typeof RoundSchema>;

export const TeamIdSchema = z.string().length(3);

export const TeamSchema = z.object({
  id: TeamIdSchema,
  name: z.string().min(1),
  flag: z.string().min(1),
  elo: z.number().int().min(1200).max(2400),
});
export type Team = z.infer<typeof TeamSchema>;

export const FixtureStatusSchema = z.enum(['scheduled', 'in_play', 'finished']);
export type FixtureStatus = z.infer<typeof FixtureStatusSchema>;

export const FixtureSchema = z.object({
  id: z.string().min(1),
  round: RoundSchema,
  kickoff: z.string().datetime(),
  /** null = to be determined by an earlier fixture */
  homeTeamId: TeamIdSchema.nullable(),
  awayTeamId: TeamIdSchema.nullable(),
  /** id of the fixture the winner advances to; null for the final */
  feedsInto: z.string().nullable(),
  /** which slot the winner fills in the next fixture; null for the final */
  feedsIntoSlot: z.enum(['home', 'away']).nullable(),
  status: FixtureStatusSchema,
  homeScore: z.number().int().min(0).nullable(),
  awayScore: z.number().int().min(0).nullable(),
  /** knockout football always produces a winner (pens if needed) */
  winnerTeamId: TeamIdSchema.nullable(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export const MarketStatusSchema = z.enum(['open', 'suspended', 'settled']);
export type MarketStatus = z.infer<typeof MarketStatusSchema>;

export const MarketTypeSchema = z.enum(['MATCH_WINNER', 'OUTRIGHT']);
export type MarketType = z.infer<typeof MarketTypeSchema>;

export const SelectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** decimal odds, e.g. 2.50 */
  price: z.number().min(1.01),
  /** model probability used to derive the price (before margin) */
  probability: z.number().min(0).max(1).optional(),
});
export type Selection = z.infer<typeof SelectionSchema>;

export const MarketSchema = z.object({
  id: z.string().min(1),
  type: MarketTypeSchema,
  /** null for outright markets */
  fixtureId: z.string().nullable(),
  name: z.string().min(1),
  status: MarketStatusSchema,
  selections: z.array(SelectionSchema).min(2),
});
export type Market = z.infer<typeof MarketSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  /** login identity for human punters; null for bots (provisioned via admin key) */
  email: z.string().email().nullable(),
  name: z.string().min(1).max(50),
  balance: z.number().min(0),
  isBot: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Account = z.infer<typeof AccountSchema>;

export const BetStatusSchema = z.enum(['pending', 'won', 'lost', 'void']);
export type BetStatus = z.infer<typeof BetStatusSchema>;

export const BetSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  marketId: z.string().min(1),
  selectionId: z.string().min(1),
  stake: z.number().positive(),
  /** decimal odds locked in at placement time */
  price: z.number().min(1.01),
  potentialReturn: z.number().positive(),
  status: BetStatusSchema,
  placedAt: z.string().datetime(),
  settledAt: z.string().datetime().nullable(),
});
export type Bet = z.infer<typeof BetSchema>;

export const SettlementEventSchema = z.object({
  fixtureId: z.string().min(1),
  winnerTeamId: TeamIdSchema,
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  /** true when decided on penalties (scores level after extra time) */
  decidedOnPenalties: z.boolean(),
  settledAt: z.string().datetime(),
});
export type SettlementEvent = z.infer<typeof SettlementEventSchema>;
