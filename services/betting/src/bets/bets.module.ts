import { Module } from '@nestjs/common';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';
import { PricingClient } from './pricing-client.service';

@Module({
  controllers: [BetsController],
  providers: [BetsService, PricingClient],
})
export class BetsModule {}
