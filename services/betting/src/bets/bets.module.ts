import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';

@Module({
  imports: [PricingModule],
  controllers: [BetsController],
  providers: [BetsService],
})
export class BetsModule {}
