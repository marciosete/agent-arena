/**
 * Pure risk maths for the EXPOSURE / LIABILITY board. No React, no I/O — every
 * function here is unit-tested in isolation and reused by the panel component.
 */

/** Worst-case liability bands. Swap these to re-tune what "hot" means. */
export interface HeatThresholds {
  /** At or above this, a market glows amber. */
  amber: number;
  /** At or above this, a market glows red. */
  red: number;
}

export const DEFAULT_HEAT_THRESHOLDS: HeatThresholds = { amber: 2_500, red: 10_000 };

export type HeatLevel = 'low' | 'amber' | 'red';

/** Band a worst-case liability against the (configurable) heat thresholds. */
export function heatLevel(
  maxLiability: number,
  thresholds: HeatThresholds = DEFAULT_HEAT_THRESHOLDS
): HeatLevel {
  if (maxLiability >= thresholds.red) {
    return 'red';
  }
  if (maxLiability >= thresholds.amber) {
    return 'amber';
  }
  return 'low';
}

/**
 * Worst risk first: sort by max liability desc, breaking ties on total staked
 * desc and then market id asc for a stable order. Never mutates the input.
 */
export function sortByLiability<
  T extends { maxLiability: number; totalStaked: number; marketId: string },
>(markets: readonly T[]): T[] {
  return [...markets].sort((a, b) => {
    if (b.maxLiability !== a.maxLiability) {
      return b.maxLiability - a.maxLiability;
    }
    if (b.totalStaked !== a.totalStaked) {
      return b.totalStaked - a.totalStaked;
    }
    return a.marketId.localeCompare(b.marketId);
  });
}

/** Top-line book aggregates for the stat tiles. */
export interface ExposureTotals {
  totalStaked: number;
  maxLiability: number;
  openCount: number;
}

/** Sum staked and liability across the book and count the open markets. */
export function exposureTotals(
  markets: readonly { totalStaked: number; maxLiability: number; status: string }[]
): ExposureTotals {
  return markets.reduce<ExposureTotals>(
    (acc, market) => ({
      totalStaked: acc.totalStaked + market.totalStaked,
      maxLiability: acc.maxLiability + market.maxLiability,
      openCount: acc.openCount + (market.status === 'open' ? 1 : 0),
    }),
    { totalStaked: 0, maxLiability: 0, openCount: 0 }
  );
}
