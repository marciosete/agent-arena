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
import { AuthService } from './auth.service';
import { AdminGuard } from './admin.guard';
import { ZodValidationPipe } from './zod-validation.pipe';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Always 200 `{ ok: true }`, whether or not the email maps to an account —
   * the response must not reveal which addresses exist.
   */
  @Post('auth/request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(
    @Body(new ZodValidationPipe(RequestOtpRequestSchema)) body: RequestOtpRequest
  ): Promise<{ ok: true }> {
    await this.auth.requestOtp(body.email);
    return { ok: true };
  }

  @Post('auth/verify')
  verify(
    @Body(new ZodValidationPipe(VerifyOtpRequestSchema)) body: VerifyOtpRequest
  ): Promise<AuthResponse> {
    return this.auth.verify(body.email, body.code);
  }

  /** Bot provisioning — bots have no inbox, so they're created by admin key. */
  @Post('accounts')
  @UseGuards(AdminGuard)
  createAccount(
    @Body(new ZodValidationPipe(CreateAccountRequestSchema)) body: CreateAccountRequest
  ): Promise<AuthResponse> {
    return this.auth.provisionBot(body.name);
  }
}
