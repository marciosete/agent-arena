import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, ZodValidationPipe } from '@arena/service-auth';
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

  /**
   * Admin-only reset: clears every market and reseeds fresh OPEN markets from
   * the current FIXTURES (Reset-bracket cascade). AdminGuard runs after the
   * global JwtAuthGuard, which stamps request.isAdmin from the token's claim —
   * non-admins get 403, no token gets 401.
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK) // reset mutates in place; nothing is "created"
  @UseGuards(AdminGuard)
  reset(): Promise<Market[]> {
    return this.pricing.reset();
  }
}
