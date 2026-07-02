import type { Bet, Market } from '@arena/contracts';

/** A bet a strategy wants placed; the bot runtime adds auth + idempotency key. */
export interface IntendedBet {
  marketId: string;
  selectionId: string;
  selectionName: string;
  /** current market price — sent as acceptedPrice */
  price: number;
  stake: number;
  /** the bot's reasoning, logged as part of the show */
  reason: string;
}

/**
 * Pure decision function: no I/O, no clock, no ambient randomness.
 * `history` is the bot's own bets — pending ones for dedupe, settled ones
 * (won/lost) so staking can react to results.
 */
export type Strategy = (markets: Market[], bankroll: number, history: Bet[]) => IntendedBet[];
