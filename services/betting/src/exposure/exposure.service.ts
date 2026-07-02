import { Injectable } from '@nestjs/common';
import { ExposureReportSchema, type ExposureReport } from '@arena/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { buildExposureMarkets, type ExposureAggregate } from './exposure.domain';

/** The groupBy row shape Prisma returns for the exposure aggregation. */
interface BetGroup {
  marketId: string;
  marketName: string;
  selectionId: string;
  status: string;
  _count: { _all: number };
  _sum: { stake: number | null; potentialReturn: number | null };
}

/**
 * The trading desk's liability board: staked totals and worst-case payout per
 * market. The trader app polls this continuously, so the summing happens in
 * the database — one aggregate row per (market, selection, status), not one
 * row per bet ever placed.
 */
@Injectable()
export class ExposureService {
  constructor(private readonly prisma: PrismaService) {}

  async report(): Promise<ExposureReport> {
    const groups: BetGroup[] = await this.prisma.bet.groupBy({
      by: ['marketId', 'marketName', 'selectionId', 'status'],
      _count: { _all: true },
      _sum: { stake: true, potentialReturn: true },
    });
    const rows: ExposureAggregate[] = groups.map((group) => ({
      marketId: group.marketId,
      marketName: group.marketName,
      selectionId: group.selectionId,
      status: group.status,
      betCount: group._count._all,
      stakeSum: group._sum.stake ?? 0,
      payoutSum: group._sum.potentialReturn ?? 0,
    }));
    return ExposureReportSchema.parse({
      generatedAt: new Date().toISOString(),
      markets: buildExposureMarkets(rows),
    });
  }
}
