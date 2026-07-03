import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SettleRequestSchema, type SettleRequest, type SettleResponse } from '@arena/contracts';
import { ZodValidationPipe } from '@arena/service-auth';
import { AdminGuard } from '../auth/admin.guard';
import { SettlementService } from './settlement.service';

/**
 * The simulator's settle call (finale chain step 5): Bearer service token via
 * the global JwtAuthGuard PLUS the pre-built AdminGuard's x-admin-key
 * (BETTING_ADMIN_KEY) — defence in depth on the control plane.
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
