import { describe, expect, it } from 'vitest';
import { buildExposureMarkets, type PendingExposure } from './exposure-rules';

const MARKET = 'qf-1';
const MARKET_NAME = 'Brazil vs Argentina — Match Winner';
const SEL_HOME = 'sel-bra';
const SEL_AWAY = 'sel-arg';

function pending(overrides: Partial<PendingExposure> = {}): PendingExposure {
  return {
    marketId: MARKET,
    marketName: MARKET_NAME,
    selectionId: SEL_HOME,
    stake: 100,
    potentialReturn: 250,
    ...overrides,
  };
}

describe('buildExposureMarkets', () => {
  it('returns an empty board when nothing is staked', () => {
    expect(buildExposureMarkets([])).toEqual([]);
  });

  it('aggregates one market: total staked, bet count, name, open status', () => {
    const markets = buildExposureMarkets([pending(), pending({ stake: 50, potentialReturn: 105 })]);

    expect(markets).toEqual([
      {
        marketId: MARKET,
        marketName: MARKET_NAME,
        totalStaked: 150,
        maxLiability: 355,
        betCount: 2,
        status: 'open',
      },
    ]);
  });

  it('takes max liability as the WORST selection, not the sum of all selections', () => {
    const markets = buildExposureMarkets([
      // Selection A pays out 200 + 105 = 305 if it wins…
      pending({ stake: 100, potentialReturn: 200 }),
      pending({ stake: 50, potentialReturn: 105 }),
      // …selection B pays out 300 if IT wins. Only one selection can win.
      pending({ selectionId: SEL_AWAY, stake: 200, potentialReturn: 300 }),
    ]);

    expect(markets[0].maxLiability).toBe(305);
    expect(markets[0].totalStaked).toBe(350);
    expect(markets[0].betCount).toBe(3);
  });

  it('groups by market and orders the board by max liability, biggest first', () => {
    const markets = buildExposureMarkets([
      pending({ stake: 10, potentialReturn: 20 }),
      pending({
        marketId: 'outright',
        marketName: 'Tournament Winner',
        selectionId: 'sel-champion',
        stake: 400,
        potentialReturn: 2000,
      }),
    ]);

    expect(markets.map((m) => m.marketId)).toEqual(['outright', MARKET]);
    expect(markets[0]).toMatchObject({ marketName: 'Tournament Winner', maxLiability: 2000 });
  });

  it('rounds float-noisy sums to cents', () => {
    const markets = buildExposureMarkets([
      pending({ stake: 0.1, potentialReturn: 0.1 }),
      pending({ stake: 0.2, potentialReturn: 0.2 }),
    ]);

    expect(markets[0].totalStaked).toBe(0.3);
    expect(markets[0].maxLiability).toBe(0.3);
  });
});
