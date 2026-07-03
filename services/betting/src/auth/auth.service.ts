import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AccountSchema, OPENING_BALANCE, type Account, type AuthResponse } from '@arena/contracts';
import { isAdminEmail, signToken } from '@arena/service-auth';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { codesMatch, generateCode, hashCode } from './otp';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const MAX_NAME_LENGTH = 50;
const INVALID_CODE_MESSAGE = 'Invalid or expired code';

/** Prisma's Account row — the fields we map onto the contract shape. */
interface AccountRecord {
  id: string;
  email: string | null;
  name: string;
  balance: number;
  isBot: boolean;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService
  ) {}

  /**
   * Issue a fresh code for `email`. Any failure is swallowed so the controller
   * can always return an identical response — an attacker can't probe which
   * addresses exist or whether delivery succeeded.
   */
  async requestOtp(email: string): Promise<void> {
    try {
      const code = generateCode();
      await this.prisma.otp.create({
        data: {
          email,
          codeHash: hashCode(code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });
      await this.email.sendOtp(email, code);
    } catch (error) {
      this.logger.error('requestOtp failed', error);
    }
  }

  /**
   * Verify a code and mint a session. On success the account is found-or-created
   * by email; `name` seeds the nickname of a brand-new account (ignored when the
   * account already exists). Failures are deliberately indistinguishable (same
   * exception) to avoid leaking whether an address or a live code exists.
   */
  async verify(email: string, code: string, name?: string): Promise<AuthResponse> {
    const otp = await this.prisma.otp.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException(INVALID_CODE_MESSAGE);
    }

    if (!codesMatch(code, otp.codeHash)) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException(INVALID_CODE_MESSAGE);
    }

    // Single-use: burn the code before issuing a session so it can't be replayed.
    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const account = await this.findOrCreateByEmail(email, name);
    // Stamp admin authority from the ADMIN_EMAILS allowlist at login: the claim
    // is baked into the token and read later by the shared AdminGuard.
    return this.toAuthResponse(account, isAdminEmail(account.email));
  }

  /**
   * Admin-only: create a bot wallet (no inbox, so it can't use email OTP). Bots
   * bet as ordinary users, so their token is deliberately NON-admin.
   */
  async provisionBot(name: string): Promise<AuthResponse> {
    const account = await this.prisma.account.create({
      data: { name, email: null, isBot: true, balance: OPENING_BALANCE },
    });
    return this.toAuthResponse(account);
  }

  private async findOrCreateByEmail(email: string, name?: string): Promise<AccountRecord> {
    const existing = await this.prisma.account.findUnique({ where: { email } });
    if (existing) {
      return existing;
    }
    const nickname = name?.trim().slice(0, MAX_NAME_LENGTH);
    return this.prisma.account.create({
      data: {
        email,
        // Prefer the punter's chosen nickname; fall back to the email local-part.
        name:
          nickname && nickname.length > 0
            ? nickname
            : email.split('@')[0].slice(0, MAX_NAME_LENGTH),
        isBot: false,
        balance: OPENING_BALANCE,
      },
    });
  }

  private toAuthResponse(account: AccountRecord, admin = false): AuthResponse {
    const mapped: Account = AccountSchema.parse({
      id: account.id,
      email: account.email,
      name: account.name,
      balance: account.balance,
      isBot: account.isBot,
      createdAt: account.createdAt.toISOString(),
    });
    return { token: signToken(mapped.id, { admin }), account: mapped };
  }
}
