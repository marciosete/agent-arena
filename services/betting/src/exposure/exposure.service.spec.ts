import { ExposureReportSchema } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExposureService } from './exposure.service';
import type { PrismaService } from '../prisma/prisma.service';

const MARKET_ID = 'r16-1';
const MARKET_NAME = 'Brazil v Chile — Match Winner';

function betGroup(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    marketId: MARKET_ID,
    marketName: MARKET_NAME,
    selectionId: 'sel-bra',
    status: 'pending',
    _count: { _all: 2 },
    _sum: { stake: 150, potentialReturn: 232.5 },
    ...overrides,
  };
}

describe('ExposureService.report', () => {
  let prisma: { bet: { groupBy: ReturnType<typeof vi.fn> } };
  let service: ExposureService;

  beforeEach(() => {
    prisma = { bet: { groupBy: vi.fn().mockResolvedValue([]) } };
    service = new ExposureService(prisma as unknown as PrismaService);
  });

  it('returns a contract-valid, timestamped report over the aggregated bets', async () => {
    prisma.bet.groupBy.mockResolvedValue([
      betGroup(),
      betGroup({ selectionId: 'sel-chi', _count: { _all: 1 }, _sum: { stake: 50, potentialReturn: 120 } }),
    ]);

    const report = await service.report();

    expect(() => ExposureReportSchema.parse(report)).not.toThrow();
    expect(Date.parse(report.generatedAt)).not.toBeNaN();
    expect(report.markets).toEqual([
      {
        marketId: MARKET_ID,
        marketName: MARKET_NAME,
        totalStaked: 200,
        maxLiability: 232.5,
        betCount: 3,
        status: 'open',
      },
    ]);
  });

  it('aggregates in the DATABASE: one groupBy, no per-bet rows loaded', async () => {
    await service.report();

    expect(prisma.bet.groupBy).toHaveBeenCalledWith({
      by: ['marketId', 'marketName', 'selectionId', 'status'],
      _count: { _all: true },
      _sum: { stake: true, potentialReturn: true },
    });
  });

  it('treats null aggregate sums (empty groups) as zero', async () => {
    prisma.bet.groupBy.mockResolvedValue([
      betGroup({ status: 'lost', _count: { _all: 3 }, _sum: { stake: null, potentialReturn: null } }),
    ]);

    const report = await service.report();

    expect(report.markets).toEqual([
      {
        marketId: MARKET_ID,
        marketName: MARKET_NAME,
        totalStaked: 0,
        maxLiability: 0,
        betCount: 0,
        status: 'settled',
      },
    ]);
  });

  it('returns an empty board when nothing has been staked', async () => {
    const report = await service.report();
    expect(report.markets).toEqual([]);
  });
});
