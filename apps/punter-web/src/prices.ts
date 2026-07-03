import { useEffect, useRef, useState } from 'react';
import type { Market } from '@arena/contracts';

export type FlashDirection = 'up' | 'down';

export function snapshotPrices(markets: Market[]): Map<string, number> {
  const prices = new Map<string, number>();
  for (const market of markets) {
    for (const selection of market.selections) {
      prices.set(selection.id, selection.price);
    }
  }
  return prices;
}

/** Which selections moved since the last poll, and in which direction. */
export function diffPrices(
  previous: Map<string, number>,
  markets: Market[]
): Map<string, FlashDirection> {
  const moves = new Map<string, FlashDirection>();
  for (const market of markets) {
    for (const selection of market.selections) {
      const before = previous.get(selection.id);
      if (before !== undefined && before !== selection.price) {
        moves.set(selection.id, selection.price > before ? 'up' : 'down');
      }
    }
  }
  return moves;
}

/**
 * Track price movement across polls: returns the selections that just moved
 * (green up / red down) and clears the flash after ~a second.
 */
export function usePriceFlashes(
  markets: Market[] | null,
  clearAfterMs = 1_200
): Map<string, FlashDirection> {
  const previousRef = useRef<Map<string, number>>(new Map());
  const [flashes, setFlashes] = useState<Map<string, FlashDirection>>(new Map());

  useEffect(() => {
    if (!markets) {
      return;
    }
    const moves = diffPrices(previousRef.current, markets);
    previousRef.current = snapshotPrices(markets);
    if (moves.size === 0) {
      return;
    }
    setFlashes(moves);
    const timer = setTimeout(() => setFlashes(new Map()), clearAfterMs);
    return () => clearTimeout(timer);
  }, [markets, clearAfterMs]);

  return flashes;
}
