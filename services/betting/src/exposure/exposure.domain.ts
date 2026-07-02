import type { ExposureReport } from '@arena/contracts';
import { roundMoney } from '../bets/domain';

/**
 * Liability maths as a pure function over persisted bets. marketName was
 * denormalised from pricing at placement, so the report needs no
 * cross-service call; a market's status is derived from its own bets —
 * 'settled' once settlement has cleared every pending bet, 'open' while
 * money is still at risk.
 */

type ExposureMarket = ExposureReport['markets'][number];

/** The slice of a Bet row the exposure maths needs. */
export interface ExposureBet {
  marketId: string;
  marketName: string;
  selectionId: string;
  stake: number;
  potentialReturn: number;
  status: string;
}

interface MarketAccumulator {
  marketName: string;
  totalStaked: number;
  betCount: number;
  settledCount: number;
  payoutBySelection: Map<string, number>;
}

function accumulate(byMarket: Map<string, MarketAccumulator>, bet: ExposureBet): void {
  let market = byMarket.get(bet.marketId);
  if (!market) {
    market = {
      marketName: bet.marketName,
      totalStaked: 0,
      betCount: 0,
      settledCount: 0,
      payoutBySelection: new Map(),
    };
    byMarket.set(bet.marketId, market);
  }
  if (bet.status === 'pending') {
    market.totalStaked += bet.stake;
    market.betCount += 1;
    const payout = market.payoutBySelection.get(bet.selectionId) ?? 0;
    market.payoutBySelection.set(bet.selectionId, payout + bet.potentialReturn);
  } else if (bet.status === 'won' || bet.status === 'lost') {
    market.settledCount += 1;
  }
}

/**
 * One board row per market that has ever taken a bet. `maxLiability` is the
 * desk's worst case: the maximum, across the market's selections, of the
 * summed pending payouts on that selection (exactly one selection wins).
 */
export function buildExposureMarkets(bets: ExposureBet[]): ExposureMarket[] {
  const byMarket = new Map<string, MarketAccumulator>();
  for (const bet of bets) {
    accumulate(byMarket, bet);
  }

  return [...byMarket.entries()]
    .map(([marketId, market]) => ({
      marketId,
      marketName: market.marketName,
      totalStaked: roundMoney(market.totalStaked),
      maxLiability: roundMoney(Math.max(0, ...market.payoutBySelection.values())),
      betCount: market.betCount,
      status:
        market.betCount === 0 && market.settledCount > 0 ? ('settled' as const) : ('open' as const),
    }))
    .sort((a, b) => a.marketId.localeCompare(b.marketId));
}
