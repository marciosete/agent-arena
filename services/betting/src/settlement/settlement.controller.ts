import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SettleRequestSchema, type SettleRequest, type SettleResponse } from '@arena/contracts';
import { ZodValidationPipe } from '@arena/service-auth';
import { AdminGuard } from '../auth/admin.guard';
import { SettlementService } from './settlement.service';

/**
 * Control-plane endpoint: Bearer JWT (global guard) PLUS the pre-built
 * AdminGuard's x-admin-key — defence in depth, matching POST /accounts.
 * Called by the simulator with a service token after each result.
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
