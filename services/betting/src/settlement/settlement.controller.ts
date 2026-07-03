import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SettleRequestSchema, type SettleRequest, type SettleResponse } from '@arena/contracts';
import { AdminGuard, ZodValidationPipe } from '@arena/service-auth';
import { SettlementService } from './settlement.service';

/**
 * The simulator's settle call (finale chain step 5): a Bearer service token,
 * verified by the global JwtAuthGuard, that must carry the admin claim — the
 * shared identity-based AdminGuard reads `request.isAdmin` and rejects
 * non-admin callers with 403.
 */
@Controller()
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Post('settle')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  settle(
    @Body(new ZodValidationPipe(SettleRequestSchema)) body: SettleRequest
  ): Promise<SettleResponse> {
    return this.settlement.settle(body);
  }
}
