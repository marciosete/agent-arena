import { Injectable } from '@nestjs/common';
import { ExposureReportSchema, type ExposureReport } from '@arena/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { buildExposureMarkets } from './exposure-rules';

/**
 * The trader liability board: live worst-case payout per market, computed
 * from pending bets. marketName was persisted at placement (pricing-owned
 * display data), so the report needs no pricing round-trip.
 */
@Injectable()
export class ExposureService {
  constructor(private readonly prisma: PrismaService) {}

  async report(): Promise<ExposureReport> {
    const pending = await this.prisma.bet.findMany({
      where: { status: 'pending' },
      select: {
        marketId: true,
        marketName: true,
        selectionId: true,
        stake: true,
        potentialReturn: true,
      },
    });
    return ExposureReportSchema.parse({
      generatedAt: new Date().toISOString(),
      markets: buildExposureMarkets(pending),
    });
  }
}
