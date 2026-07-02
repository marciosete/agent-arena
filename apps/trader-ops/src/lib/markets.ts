import { TARGET_OVERROUND, type Market } from '@arena/contracts';

/** Direction a selection's decimal price shifted between two polls. */
export type PriceMove = 'up' | 'down';

/** Index every selection's current price by its id, last write wins. */
function priceIndex(markets: readonly Market[]): Map<string, number> {
  const prices = new Map<string, number>();
  for (const market of markets) {
    for (const selection of market.selections) {
      prices.set(selection.id, selection.price);
    }
  }
  return prices;
}

/**
 * Which selections moved (and which way) from `prev` to `next`, keyed by
 * selection id. A selection missing from `prev` or holding an equal price gets
 * no entry; a null `prev` (first poll) yields no moves at all.
 */
export function diffPrices(
  prev: readonly Market[] | null,
  next: readonly Market[]
): Record<string, PriceMove> {
  const moves: Record<string, PriceMove> = {};
  if (prev === null) {
    return moves;
  }
  const before = priceIndex(prev);
  for (const market of next) {
    for (const selection of market.selections) {
      const prior = before.get(selection.id);
      if (prior !== undefined && prior !== selection.price) {
        moves[selection.id] = selection.price > prior ? 'up' : 'down';
      }
    }
  }
  return moves;
}

/** The book's implied total probability: sum of 1/price across selections. */
export function overround(market: Market): number {
  return market.selections.reduce((sum, selection) => sum + 1 / selection.price, 0);
}

/** How far the book's margin sits from the house target, in percent (signed). */
export function overroundDriftPct(market: Market): number {
  return ((overround(market) - TARGET_OVERROUND) / TARGET_OVERROUND) * 100;
}
