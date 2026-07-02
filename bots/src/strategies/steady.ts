import { affordableStake, allSelections, biddableMarkets, intend } from './shared';
import type { Strategy } from './types';

/** Flat fraction of the current bankroll, every round. */
export const STEADY_FRACTION = 0.05;

/**
 * 🛡️ Steady — backs the shortest available price each round with a flat 5%
 * of the current bankroll. Favourites, discipline, no drama.
 */
export const steady: Strategy = (markets, bankroll, history) => {
  const options = allSelections(biddableMarkets(markets, history));
  if (options.length === 0) return [];
  const favourite = options.reduce((shortest, candidate) =>
    candidate.selection.price < shortest.selection.price ? candidate : shortest
  );
  const stake = affordableStake(bankroll * STEADY_FRACTION, bankroll);
  if (stake === 0) return [];
  const reason = `${favourite.selection.name} at ${favourite.selection.price} is the shortest price on the board — steady 5%`;
  return [intend(favourite, stake, reason)];
};
