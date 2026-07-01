/**
 * Staking utilities for punter agents.
 * Kelly criterion: stake the fraction of bankroll that maximises long-run growth.
 */

/**
 * Fraction of bankroll to stake given our estimated win probability and the
 * offered decimal price. Returns 0 when there is no edge.
 */
export function kellyFraction(probability: number, decimalPrice: number): number {
  if (probability <= 0 || probability >= 1 || decimalPrice <= 1) {
    return 0;
  }
  const b = decimalPrice - 1;
  const q = 1 - probability;
  const fraction = (b * probability - q) / b;
  return Math.max(0, fraction);
}

/**
 * Concrete stake for a bankroll, capped at a maximum fraction so one bad
 * price never sinks the bot. Rounded to cents.
 */
export function kellyStake(
  probability: number,
  decimalPrice: number,
  bankroll: number,
  maxFraction = 0.1
): number {
  const fraction = Math.min(kellyFraction(probability, decimalPrice), maxFraction);
  return Math.round(fraction * bankroll * 100) / 100;
}
