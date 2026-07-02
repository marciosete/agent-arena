import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '@arena/service-auth';
import { RepriceRequestSchema, type Market, type RepriceRequest } from '@arena/contracts';
import { PricingService } from './pricing.service';

/**
 * The REST surface from contracts/src/api.ts (Pricing section). Every route is
 * protected by the globally-registered JwtAuthGuard; thin handlers delegate to
 * the service.
 */
@Controller()
export class MarketsController {
  constructor(private readonly pricing: PricingService) {}

  @Get('markets')
  getMarkets(): Promise<Market[]> {
    return this.pricing.getMarkets();
  }

  @Get('outright')
  getOutright(): Promise<Market> {
    return this.pricing.getOutright();
  }

  @Get('markets/:fixtureId')
  getMarket(@Param('fixtureId') fixtureId: string): Promise<Market> {
    return this.pricing.getMarketByFixture(fixtureId);
  }

  @Post('reprice')
  @HttpCode(HttpStatus.OK)
  reprice(
    @Body(new ZodValidationPipe(RepriceRequestSchema)) request: RepriceRequest
  ): Promise<Market[]> {
    return this.pricing.reprice(request);
  }
}
