import { Module } from '@nestjs/common';
import { MarketsController } from './markets.controller';
import { MarketsRepository } from './markets.repository';
import { PricingService } from './pricing.service';

@Module({
  controllers: [MarketsController],
  providers: [MarketsRepository, PricingService],
})
export class MarketsModule {}
