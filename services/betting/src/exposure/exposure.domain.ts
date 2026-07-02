import type { ExposureReport } from '@arena/contracts';
import { roundMoney } from '../bets/domain';

/**
 * Liability maths as a pure function over per-(market, selection, status)
 * aggregates — the database does the summing (a Prisma groupBy), so the
 * report costs a handful of rows however many bets exist. marketName was
 * denormalised from pricing at placement, so no cross-service call is needed;
 * a market's status is derived from its own bets — 'settled' once settlement
 * (or voiding) has cleared every pending bet, 'open' while money is at risk.
 */

type ExposureMarket = ExposureReport['markets'][number];

/** One groupBy row: the bets on one selection of one market in one status. */
export interface ExposureAggregate {
  marketId: string;
  marketName: string;
  selectionId: string;
  status: string;
  betCount: number;
  stakeSum: number;
  payoutSum: number;
}

interface MarketAccumulator {
  marketName: string;
  totalStaked: number;
  betCount: number;
  resolvedCount: number;
  payoutBySelection: Map<string, number>;
}

function accumulate(byMarket: Map<string, MarketAccumulator>, row: ExposureAggregate): void {
  let market = byMarket.get(row.marketId);
  if (!market) {
    market = {
      marketName: row.marketName,
      totalStaked: 0,
      betCount: 0,
      resolvedCount: 0,
      payoutBySelection: new Map(),
    };
    byMarket.set(row.marketId, market);
  }
  if (row.status === 'pending') {
    market.totalStaked += row.stakeSum;
    market.betCount += row.betCount;
    const payout = market.payoutBySelection.get(row.selectionId) ?? 0;
    market.payoutBySelection.set(row.selectionId, payout + row.payoutSum);
  } else {
    // won, lost or void: the money is no longer at risk on this market.
    market.resolvedCount += row.betCount;
  }
}

/**
 * One board row per market that has ever taken a bet. `maxLiability` is the
 * desk's worst case: the maximum, across the market's selections, of the
 * summed pending payouts on that selection (exactly one selection wins).
 */
export function buildExposureMarkets(rows: ExposureAggregate[]): ExposureMarket[] {
  const byMarket = new Map<string, MarketAccumulator>();
  for (const row of rows) {
    accumulate(byMarket, row);
  }

  return [...byMarket.entries()]
    .map(([marketId, market]) => ({
      marketId,
      marketName: market.marketName,
      totalStaked: roundMoney(market.totalStaked),
      maxLiability: roundMoney(Math.max(0, ...market.payoutBySelection.values())),
      betCount: market.betCount,
      status:
        market.betCount === 0 && market.resolvedCount > 0
          ? ('settled' as const)
          : ('open' as const),
    }))
    .sort((a, b) => a.marketId.localeCompare(b.marketId));
}
