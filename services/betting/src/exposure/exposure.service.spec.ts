import { ExposureReportSchema } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExposureService } from './exposure.service';
import type { PrismaService } from '../prisma/prisma.service';

const MARKET_ID = 'r16-1';
const MARKET_NAME = 'Brazil v Chile — Match Winner';

function betRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    marketId: MARKET_ID,
    marketName: MARKET_NAME,
    selectionId: 'sel-bra',
    stake: 100,
    potentialReturn: 155,
    status: 'pending',
    ...overrides,
  };
}

describe('ExposureService.report', () => {
  let prisma: { bet: { findMany: ReturnType<typeof vi.fn> } };
  let service: ExposureService;

  beforeEach(() => {
    prisma = { bet: { findMany: vi.fn().mockResolvedValue([]) } };
    service = new ExposureService(prisma as unknown as PrismaService);
  });

  it('returns a contract-valid, timestamped report over all persisted bets', async () => {
    prisma.bet.findMany.mockResolvedValue([
      betRow(),
      betRow({ selectionId: 'sel-chi', stake: 50, potentialReturn: 120 }),
    ]);

    const report = await service.report();

    expect(() => ExposureReportSchema.parse(report)).not.toThrow();
    expect(Date.parse(report.generatedAt)).not.toBeNaN();
    expect(report.markets).toEqual([
      {
        marketId: MARKET_ID,
        marketName: MARKET_NAME,
        totalStaked: 150,
        maxLiability: 155,
        betCount: 2,
        status: 'open',
      },
    ]);
  });

  it('reads only the fields the liability maths needs', async () => {
    await service.report();

    expect(prisma.bet.findMany).toHaveBeenCalledWith({
      select: {
        marketId: true,
        marketName: true,
        selectionId: true,
        stake: true,
        potentialReturn: true,
        status: true,
      },
    });
  });

  it('returns an empty board when nothing has been staked', async () => {
    const report = await service.report();
    expect(report.markets).toEqual([]);
  });
});
