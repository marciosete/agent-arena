import { TARGET_OVERROUND } from '@arena/contracts';

/** Contract floor for decimal odds. */
export const MIN_PRICE = 1.01;
/** Cap for ~zero-probability longshots (keeps prices finite). */
export const MAX_PRICE = 1000;

/**
 * Fair probability → decimal price with the bookmaker margin applied
 * proportionally, so a market's implied probabilities sum to
 * TARGET_OVERROUND (1.05). Rounded to 2 dp, clamped to [1.01, 1000].
 */
export function priceFromProbability(probability: number): number {
  if (probability <= 0) {
    return MAX_PRICE;
  }
  const priced = 1 / (probability * TARGET_OVERROUND);
  const rounded = Math.round(priced * 100) / 100;
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, rounded));
}
