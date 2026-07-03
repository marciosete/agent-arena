import type { Market } from '@arena/contracts';

/** Direction a selection's decimal price moved between two market snapshots. */
export type PriceMove = 'up' | 'down';

/** Stable per-selection key within a market: `${marketId}:${selectionId}`. */
export function moveKey(marketId: string, selectionId: string): string {
  return `${marketId}:${selectionId}`;
}

/**
 * Diff two market snapshots and report a direction for every selection whose price
 * changed AND is present in both snapshots (matched by market id + selection id).
 * Unchanged prices and selections that only appear in `next` are omitted; a null
 * previous snapshot (the first poll) yields no moves.
 */
export function diffPrices(prev: Market[] | null, next: Market[]): Record<string, PriceMove> {
  const moves: Record<string, PriceMove> = {};
  if (!prev) {
    return moves;
  }

  const prevPrices = new Map<string, number>();
  for (const market of prev) {
    for (const sel of market.selections) {
      prevPrices.set(moveKey(market.id, sel.id), sel.price);
    }
  }

  for (const market of next) {
    for (const sel of market.selections) {
      const key = moveKey(market.id, sel.id);
      const before = prevPrices.get(key);
      if (before === undefined) {
        continue;
      }
      if (sel.price > before) {
        moves[key] = 'up';
      } else if (sel.price < before) {
        moves[key] = 'down';
      }
    }
  }

  return moves;
}

/**
 * The book total: Σ (1/price) across a market's selections. A fair book sums to
 * 1.0; the target is 1.05 — the 5% margin, made visible.
 */
export function overround(market: Market): number {
  return market.selections.reduce((sum, sel) => sum + 1 / sel.price, 0);
}
