import { Injectable } from '@nestjs/common';
import { ExposureReportSchema, type ExposureReport } from '@arena/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { buildExposureMarkets } from './exposure.domain';

/**
 * The trading desk's liability board: staked totals and worst-case payout per
 * market, computed from the bets we persisted — marketName was captured from
 * pricing at placement, so no cross-service call is needed here.
 */
@Injectable()
export class ExposureService {
  constructor(private readonly prisma: PrismaService) {}

  async report(): Promise<ExposureReport> {
    const bets = await this.prisma.bet.findMany({
      select: {
        marketId: true,
        marketName: true,
        selectionId: true,
        stake: true,
        potentialReturn: true,
        status: true,
      },
    });
    return ExposureReportSchema.parse({
      generatedAt: new Date().toISOString(),
      markets: buildExposureMarkets(bets),
    });
  }
}
