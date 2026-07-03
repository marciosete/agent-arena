import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { ResetResponse } from '@arena/contracts';
import { AdminGuard } from '@arena/service-auth';
import { ResetService } from './reset.service';

/**
 * Admin-only `POST /reset` (Reset-bracket cascade). Verified by the global
 * JwtAuthGuard, which stamps `request.isAdmin` from the token, then gated by the
 * shared identity-based AdminGuard — non-admin callers get 403. Takes no body,
 * so there is nothing to validate.
 */
@Controller()
export class ResetController {
  constructor(private readonly reset: ResetService) {}

  @Post('reset')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  run(): Promise<ResetResponse> {
    return this.reset.reset();
  }
}
