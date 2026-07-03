import { ExposureReportSchema } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { ExposureService } from './exposure.service';

describe('ExposureService', () => {
  let prisma: { bet: { findMany: ReturnType<typeof vi.fn> } };
  let service: ExposureService;

  beforeEach(() => {
    prisma = { bet: { findMany: vi.fn().mockResolvedValue([]) } };
    service = new ExposureService(prisma as unknown as PrismaService);
  });

  it('builds a contract-valid liability report from PENDING bets only', async () => {
    prisma.bet.findMany.mockResolvedValue([
      {
        marketId: 'qf-1',
        marketName: 'Brazil vs Argentina — Match Winner',
        selectionId: 'sel-bra',
        stake: 100,
        potentialReturn: 250,
      },
      {
        marketId: 'qf-1',
        marketName: 'Brazil vs Argentina — Match Winner',
        selectionId: 'sel-arg',
        stake: 60,
        potentialReturn: 120,
      },
    ]);

    const report = await service.report();

    expect(prisma.bet.findMany).toHaveBeenCalledWith({
      where: { status: 'pending' },
      select: {
        marketId: true,
        marketName: true,
        selectionId: true,
        stake: true,
        potentialReturn: true,
      },
    });
    const parsed = ExposureReportSchema.parse(report);
    expect(parsed.markets).toEqual([
      {
        marketId: 'qf-1',
        marketName: 'Brazil vs Argentina — Match Winner',
        totalStaked: 160,
        maxLiability: 250,
        betCount: 2,
        status: 'open',
      },
    ]);
  });

  it('stamps generatedAt with the current time as an ISO datetime', async () => {
    const before = Date.now();
    const report = await service.report();

    expect(Date.parse(report.generatedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(report.markets).toEqual([]);
  });
});
