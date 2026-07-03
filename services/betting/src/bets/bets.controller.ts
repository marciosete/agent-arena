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
import { CurrentAccountId } from './current-account-id.decorator';

/**
 * Bet placement + the my-bets view. Both sit behind the global JwtAuthGuard:
 * placement acts on the token's own wallet; the read is open to any
 * logged-in caller with `accountId` as a plain filter (integration.md §1).
 */
@Controller('bets')
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Post()
  place(
    @CurrentAccountId() accountId: string,
    @Body(new ZodValidationPipe(PlaceBetRequestSchema)) body: PlaceBetRequest
  ): Promise<Bet> {
    return this.bets.placeBet(accountId, body);
  }

  @Get()
  find(@Query(new ZodValidationPipe(BetQuerySchema)) query: BetQuery): Promise<Bet[]> {
    return this.bets.findBets(query);
  }
}
