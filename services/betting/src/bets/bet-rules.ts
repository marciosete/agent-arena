import { roundMoney } from '../money/money';

/**
 * Pure price rules for bet placement. No I/O — exhaustively unit-tested.
 */

/**
 * Betting-local price tolerance: the live price may differ from the punter's
 * `acceptedPrice` by at most this fraction of the accepted price. This is our
 * internal rule, not a shared contract value — clients just send the price
 * they displayed and handle a 409 when it moved.
 */
export const PRICE_TOLERANCE = 0.05;

/** Absorbs IEEE-754 noise so an exactly-on-boundary comparison stays inclusive. */
const FLOAT_EPSILON = 1e-9;

/**
 * Decimal-odds payout locked at placement: stake × price, stake included.
 */
export function computePotentialReturn(stake: number, price: number): number {
  return roundMoney(stake * price);
}

/**
 * True when the live selection price is within {@link PRICE_TOLERANCE} of the
 * price the punter accepted (inclusive boundary, in either direction).
 */
export function isPriceWithinTolerance(acceptedPrice: number, livePrice: number): boolean {
  return Math.abs(livePrice - acceptedPrice) <= acceptedPrice * PRICE_TOLERANCE + FLOAT_EPSILON;
}
