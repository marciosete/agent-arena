import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  CreateAccountRequestSchema,
  RequestOtpRequestSchema,
  VerifyOtpRequestSchema,
  type AuthResponse,
  type CreateAccountRequest,
  type RequestOtpRequest,
  type VerifyOtpRequest,
} from '@arena/contracts';
import { AdminGuard, Public, ZodValidationPipe } from '@arena/service-auth';
import { AuthService } from './auth.service';

/**
 * Token-minting and bot-provisioning routes. The two OTP routes are @Public()
 * — they can't require a session JWT because they're how a caller *obtains*
 * one. `POST /accounts` is NOT public: it runs through the global JwtAuthGuard
 * (which verifies the bearer and stamps `request.isAdmin` from the token's
 * admin claim) and is then gated by the shared identity-based {@link
 * AdminGuard}, so only an admin token can provision a bot.
 */
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Always 200 `{ ok: true }`, whether or not the email maps to an account —
   * the response must not reveal which addresses exist.
   */
  @Public()
  @Post('auth/request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(
    @Body(new ZodValidationPipe(RequestOtpRequestSchema)) body: RequestOtpRequest
  ): Promise<{ ok: true }> {
    await this.auth.requestOtp(body.email);
    return { ok: true };
  }

  @Public()
  @Post('auth/verify')
  verify(
    @Body(new ZodValidationPipe(VerifyOtpRequestSchema)) body: VerifyOtpRequest
  ): Promise<AuthResponse> {
    return this.auth.verify(body.email, body.code, body.name);
  }

  /**
   * Bot provisioning — bots have no inbox, so an admin mints them a wallet and
   * a (non-admin) token. Requires an admin bearer via the shared AdminGuard.
   */
  @Post('accounts')
  @UseGuards(AdminGuard)
  createAccount(
    @Body(new ZodValidationPipe(CreateAccountRequestSchema)) body: CreateAccountRequest
  ): Promise<AuthResponse> {
    return this.auth.provisionBot(body.name);
  }
}
