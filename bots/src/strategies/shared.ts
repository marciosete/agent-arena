import { OPENING_BALANCE, type Bet, type Market, type Selection } from '@arena/contracts';
import type { IntendedBet } from './types';

/** Stakes below a dollar aren't worth the API call. */
export const MIN_STAKE = 1;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Open markets the bot doesn't already have a pending bet on. */
export function biddableMarkets(markets: Market[], history: Bet[]): Market[] {
  const pending = new Set(
    history.filter((bet) => bet.status === 'pending').map((bet) => bet.marketId)
  );
  return markets.filter((market) => market.status === 'open' && !pending.has(market.id));
}

export interface PricedSelection {
  market: Market;
  selection: Selection;
}

export function allSelections(markets: Market[]): PricedSelection[] {
  return markets.flatMap((market) => market.selections.map((selection) => ({ market, selection })));
}

/**
 * Clamp a desired stake to what the wallet and the bet contract allow.
 * Returns 0 (no bet) when the affordable amount drops below MIN_STAKE.
 */
export function affordableStake(stake: number, bankroll: number): number {
  const clamped = round2(Math.min(stake, bankroll, OPENING_BALANCE));
  return clamped >= MIN_STAKE ? clamped : 0;
}

export function intend(pick: PricedSelection, stake: number, reason: string): IntendedBet {
  return {
    marketId: pick.market.id,
    selectionId: pick.selection.id,
    selectionName: pick.selection.name,
    price: pick.selection.price,
    stake,
    reason,
  };
}
