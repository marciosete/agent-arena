import { describe, expect, it } from 'vitest';
import { ExposureReportSchema } from '@arena/contracts';
import { buildExposureMarkets, type ExposureAggregate } from './exposure.domain';

const MATCH_MARKET_NAME = 'Brazil v Chile — Match Winner';

function aggregate(overrides: Partial<ExposureAggregate>): ExposureAggregate {
  return {
    marketId: 'r16-1',
    marketName: MATCH_MARKET_NAME,
    selectionId: 'sel-bra',
    status: 'pending',
    betCount: 1,
    stakeSum: 100,
    payoutSum: 155,
    ...overrides,
  };
}

describe('buildExposureMarkets', () => {
  it('returns an empty board when no bets exist', () => {
    expect(buildExposureMarkets([])).toEqual([]);
  });

  it('sums stakes and counts pending bets per market', () => {
    const markets = buildExposureMarkets([
      aggregate({ betCount: 2, stakeSum: 150, payoutSum: 232.5 }),
    ]);
    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({
      marketId: 'r16-1',
      marketName: MATCH_MARKET_NAME,
      totalStaked: 150,
      betCount: 2,
      status: 'open',
    });
  });

  it('maxLiability is the WORST selection: max across selections of Σ potentialReturn', () => {
    const markets = buildExposureMarkets([
      aggregate({ betCount: 2, stakeSum: 200, payoutSum: 310 }),
      aggregate({ selectionId: 'sel-chi', stakeSum: 100, payoutSum: 240 }),
    ]);
    // Brazil pays 310 in total; Chile pays 240 — the desk's worst case is 310.
    expect(markets[0].maxLiability).toBe(310);
    expect(markets[0].totalStaked).toBe(300);
    expect(markets[0].betCount).toBe(3);
  });

  it('excludes settled bets from the liability maths', () => {
    const markets = buildExposureMarkets([
      aggregate({}),
      aggregate({ status: 'won', payoutSum: 9_999 }),
      aggregate({ status: 'lost', payoutSum: 9_999 }),
    ]);
    expect(markets[0]).toMatchObject({ totalStaked: 100, betCount: 1, maxLiability: 155 });
  });

  it('reports a fully-settled market as settled with zero outstanding liability', () => {
    const markets = buildExposureMarkets([
      aggregate({ status: 'won' }),
      aggregate({ status: 'lost', selectionId: 'sel-chi' }),
    ]);
    expect(markets[0]).toMatchObject({
      status: 'settled',
      totalStaked: 0,
      betCount: 0,
      maxLiability: 0,
    });
  });

  it('counts VOID bets as resolved so an all-void market is not open forever', () => {
    const markets = buildExposureMarkets([aggregate({ status: 'void' })]);
    expect(markets[0]).toMatchObject({ status: 'settled', totalStaked: 0, maxLiability: 0 });
  });

  it('keeps markets independent and orders them by marketId', () => {
    const markets = buildExposureMarkets([
      aggregate({ marketId: 'sf-1', marketName: 'SF one' }),
      aggregate({ marketId: 'outright', marketName: 'Tournament Winner', payoutSum: 700 }),
    ]);
    expect(markets.map((m) => m.marketId)).toEqual(['outright', 'sf-1']);
    expect(markets[0].maxLiability).toBe(700);
  });

  it('rounds money sums to cents', () => {
    const markets = buildExposureMarkets([
      aggregate({ stakeSum: 0.1, payoutSum: 0.11 }),
      aggregate({ stakeSum: 0.2, payoutSum: 0.22 }),
    ]);
    expect(markets[0].totalStaked).toBe(0.3);
    expect(markets[0].maxLiability).toBe(0.33);
  });

  it('produces contract-valid ExposureReport markets', () => {
    const markets = buildExposureMarkets([
      aggregate({}),
      aggregate({ status: 'won', marketId: 'qf-1' }),
    ]);
    const report = { generatedAt: new Date().toISOString(), markets };
    expect(() => ExposureReportSchema.parse(report)).not.toThrow();
  });
});
