import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '@arena/service-auth';
import { RepriceRequestSchema, type Market, type RepriceRequest } from '@arena/contracts';
import { PricingService } from './pricing.service';

/**
 * The pricing REST surface (contracts/src/api.ts, Pricing section). Every
 * route requires a Bearer JWT via the globally registered JwtAuthGuard.
 */
@Controller()
export class MarketsController {
  constructor(private readonly pricing: PricingService) {}

  @Get('markets')
  getMarkets(): Promise<Market[]> {
    return this.pricing.getMarkets();
  }

  @Get('markets/:fixtureId')
  getMarketForFixture(@Param('fixtureId') fixtureId: string): Promise<Market> {
    return this.pricing.getMarketByFixtureId(fixtureId);
  }

  @Get('outright')
  getOutright(): Promise<Market> {
    return this.pricing.getOutright();
  }

  @Post('reprice')
  @HttpCode(HttpStatus.OK) // repricing mutates in place; nothing is "created"
  reprice(
    @Body(new ZodValidationPipe(RepriceRequestSchema)) body: RepriceRequest
  ): Promise<Market[]> {
    return this.pricing.reprice(body.settlement);
  }
}
