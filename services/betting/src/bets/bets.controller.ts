import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  BetQuerySchema,
  PlaceBetRequestSchema,
  type Bet,
  type BetQuery,
  type PlaceBetRequest,
} from '@arena/contracts';
import { ZodValidationPipe } from '@arena/service-auth';
import { BetsService } from './bets.service';
import { SessionAccountId } from './session-account-id.decorator';

/**
 * Bet placement + the my-bets view. Protected by the global JwtAuthGuard; the
 * account placing a bet comes from the session token, never the body.
 */
@Controller('bets')
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Post()
  place(
    @SessionAccountId() accountId: string,
    @Body(new ZodValidationPipe(PlaceBetRequestSchema)) body: PlaceBetRequest
  ): Promise<Bet> {
    return this.bets.placeBet(accountId, body);
  }

  @Get()
  find(@Query(new ZodValidationPipe(BetQuerySchema)) query: BetQuery): Promise<Bet[]> {
    return this.bets.findBets(query);
  }
}
