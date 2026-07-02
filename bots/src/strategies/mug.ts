import type { Bet, Market } from '@arena/contracts';
import { allSelections, biddableMarkets, intend } from './shared';
import type { IntendedBet } from './types';

/** Anything paying more than 3.0 smells like easy money to the Mug. */
export const LONGSHOT_PRICE = 3.0;
export const MUG_STAKE = 200;

/**
 * 🎲 Mug — picks a random longshot every round and lumps a flat $200 on it.
 * Pure given the injected rng (must return a number in [0, 1)).
 */
export function mug(
  markets: Market[],
  bankroll: number,
  history: Bet[],
  rng: () => number
): IntendedBet[] {
  if (bankroll < MUG_STAKE) return [];
  const longshots = allSelections(biddableMarkets(markets, history)).filter(
    ({ selection }) => selection.price > LONGSHOT_PRICE
  );
  if (longshots.length === 0) return [];
  const pick = longshots[Math.floor(rng() * longshots.length)];
  const reason = `${pick.selection.price} on ${pick.selection.name}?! that's basically free money`;
  return [intend(pick, MUG_STAKE, reason)];
}
