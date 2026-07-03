import { Module } from '@nestjs/common';
import { MarketsController } from './markets.controller';
import { MarketsRepository, PrismaMarketsRepository } from './markets.repository';
import { PricingService } from './pricing.service';

@Module({
  controllers: [MarketsController],
  providers: [PricingService, { provide: MarketsRepository, useClass: PrismaMarketsRepository }],
})
export class MarketsModule {}
