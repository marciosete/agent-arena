/**
 * Pure risk maths for the exposure board — no I/O, no React. Every function is
 * total and non-mutating so the rendering layer can lean on it under test.
 */

import type { ExposureReport } from '@arena/contracts';

/** One market's row in an {@link ExposureReport}. */
export type ExposureMarket = ExposureReport['markets'][number];

/** Heat is green below `mid`, amber from `mid`, red from `high`. */
export interface HeatThresholds {
  mid: number;
  high: number;
}

/** Sensible defaults; a trader can tighten these per book via the board's prop. */
export const DEFAULT_HEAT_THRESHOLDS: HeatThresholds = { mid: 5_000, high: 20_000 };

export type HeatLevel = 'low' | 'mid' | 'high';

/**
 * Classify a worst-case liability against the thresholds. Boundaries are
 * inclusive on the upper side: exactly `mid` is amber, exactly `high` is red.
 */
export function heatLevel(maxLiability: number, thresholds: HeatThresholds): HeatLevel {
  if (maxLiability >= thresholds.high) {
    return 'high';
  }
  if (maxLiability >= thresholds.mid) {
    return 'mid';
  }
  return 'low';
}

/**
 * Markets ordered by worst-case liability, biggest first — the trader's eye
 * lands on the riskiest book. Non-mutating; ties break by market name so the
 * ordering is stable across polls.
 */
export function sortByLiability(markets: readonly ExposureMarket[]): ExposureMarket[] {
  return [...markets].sort((a, b) => {
    if (b.maxLiability !== a.maxLiability) {
      return b.maxLiability - a.maxLiability;
    }
    return a.marketName.localeCompare(b.marketName);
  });
}

export interface ExposureSummary {
  totalStaked: number;
  totalLiability: number;
  openCount: number;
}

/** Book-wide totals for the top-line tiles. */
export function summarise(report: ExposureReport): ExposureSummary {
  return report.markets.reduce<ExposureSummary>(
    (acc, market) => ({
      totalStaked: acc.totalStaked + market.totalStaked,
      totalLiability: acc.totalLiability + market.maxLiability,
      openCount: acc.openCount + (market.status === 'open' ? 1 : 0),
    }),
    { totalStaked: 0, totalLiability: 0, openCount: 0 }
  );
}
