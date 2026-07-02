import { TARGET_OVERROUND } from '@arena/contracts';

/** Decimal odds floor — the MarketSchema minimum. */
export const MIN_PRICE = 1.01;
/** Cap so zero-probability Monte Carlo longshots stay finite and schema-valid. */
export const MAX_PRICE = 1000;

/**
 * Fair probability → decimal price with the bookmaker margin applied
 * proportionally: every selection's implied probability is its fair value
 * scaled by `overround`, so a full book's implied probabilities sum to
 * exactly the 1.05 target. Quoted to 2 dp, clamped to [1.01, 1000].
 */
export function priceFromProbability(probability: number, overround = TARGET_OVERROUND): number {
  const fair = 1 / (probability * overround);
  const quoted = Math.round(fair * 100) / 100;
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, quoted));
}
