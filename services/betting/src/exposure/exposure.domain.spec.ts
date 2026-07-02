import { describe, expect, it } from 'vitest';
import { ExposureReportSchema } from '@arena/contracts';
import { buildExposureMarkets, type ExposureBet } from './exposure.domain';

const MATCH_MARKET_NAME = 'Brazil v Chile — Match Winner';

function bet(overrides: Partial<ExposureBet>): ExposureBet {
  return {
    marketId: 'r16-1',
    marketName: MATCH_MARKET_NAME,
    selectionId: 'sel-bra',
    stake: 100,
    potentialReturn: 155,
    status: 'pending',
    ...overrides,
  };
}

describe('buildExposureMarkets', () => {
  it('returns an empty board when no bets exist', () => {
    expect(buildExposureMarkets([])).toEqual([]);
  });

  it('sums stakes and counts pending bets per market', () => {
    const markets = buildExposureMarkets([bet({}), bet({ stake: 50, potentialReturn: 77.5 })]);
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
      bet({ potentialReturn: 155 }),
      bet({ potentialReturn: 155 }),
      bet({ selectionId: 'sel-chi', stake: 100, potentialReturn: 240 }),
    ]);
    // Brazil pays 310 in total; Chile pays 240 — the desk's worst case is 310.
    expect(markets[0].maxLiability).toBe(310);
  });

  it('excludes settled bets from the liability maths', () => {
    const markets = buildExposureMarkets([
      bet({}),
      bet({ status: 'won', potentialReturn: 9_999 }),
      bet({ status: 'lost', potentialReturn: 9_999 }),
    ]);
    expect(markets[0]).toMatchObject({ totalStaked: 100, betCount: 1, maxLiability: 155 });
  });

  it('reports a fully-settled market as settled with zero outstanding liability', () => {
    const markets = buildExposureMarkets([
      bet({ status: 'won' }),
      bet({ status: 'lost', selectionId: 'sel-chi' }),
    ]);
    expect(markets[0]).toMatchObject({
      status: 'settled',
      totalStaked: 0,
      betCount: 0,
      maxLiability: 0,
    });
  });

  it('keeps markets independent and orders them by marketId', () => {
    const markets = buildExposureMarkets([
      bet({ marketId: 'sf-1', marketName: 'SF one' }),
      bet({ marketId: 'outright', marketName: 'Tournament Winner', potentialReturn: 700 }),
    ]);
    expect(markets.map((m) => m.marketId)).toEqual(['outright', 'sf-1']);
    expect(markets[0].maxLiability).toBe(700);
  });

  it('rounds money sums to cents', () => {
    const markets = buildExposureMarkets([
      bet({ stake: 0.1, potentialReturn: 0.11 }),
      bet({ stake: 0.2, potentialReturn: 0.22 }),
    ]);
    expect(markets[0].totalStaked).toBe(0.3);
    expect(markets[0].maxLiability).toBe(0.33);
  });

  it('produces contract-valid ExposureReport markets', () => {
    const markets = buildExposureMarkets([bet({}), bet({ status: 'won', marketId: 'qf-1' })]);
    const report = { generatedAt: new Date().toISOString(), markets };
    expect(() => ExposureReportSchema.parse(report)).not.toThrow();
  });
});
