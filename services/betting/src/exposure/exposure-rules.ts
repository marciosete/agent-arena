import type { ExposureReport } from '@arena/contracts';
import { roundMoney } from '../money/money';

/** The slice of a pending Bet row that the liability board needs. */
export interface PendingExposure {
  marketId: string;
  /** pricing-owned display name, persisted on the bet at placement */
  marketName: string;
  selectionId: string;
  stake: number;
  potentialReturn: number;
}

export type ExposureMarket = ExposureReport['markets'][number];

/**
 * Aggregate pending bets into the trader liability board. Per market:
 * `totalStaked` = Σ stake, `betCount`, and `maxLiability` = the worst-case
 * gross payout — the MAX across the market's selections of Σ potentialReturn
 * on that selection (only one selection can win, so liabilities on different
 * selections never add). Markets appear only while they still have pending
 * bets, so their status is always `open`; settlement empties them off the
 * board. Ordered biggest liability first — it's a risk board.
 */
export function buildExposureMarkets(pendingBets: readonly PendingExposure[]): ExposureMarket[] {
  const byMarket = new Map<
    string,
    { marketName: string; totalStaked: number; betCount: number; bySelection: Map<string, number> }
  >();

  for (const bet of pendingBets) {
    const market = byMarket.get(bet.marketId) ?? {
      marketName: bet.marketName,
      totalStaked: 0,
      betCount: 0,
      bySelection: new Map<string, number>(),
    };
    market.totalStaked += bet.stake;
    market.betCount += 1;
    market.bySelection.set(
      bet.selectionId,
      (market.bySelection.get(bet.selectionId) ?? 0) + bet.potentialReturn
    );
    byMarket.set(bet.marketId, market);
  }

  return [...byMarket.entries()]
    .map(([marketId, market]) => ({
      marketId,
      marketName: market.marketName,
      totalStaked: roundMoney(market.totalStaked),
      maxLiability: roundMoney(Math.max(...market.bySelection.values())),
      betCount: market.betCount,
      status: 'open' as const,
    }))
    .sort((a, b) => b.maxLiability - a.maxLiability);
}
