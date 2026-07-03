import { UnauthorizedException, Logger } from '@nestjs/common';
import { OPENING_BALANCE } from '@arena/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyToken, verifyTokenClaims } from '@arena/service-auth';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { hashCode } from './otp';
import type { PrismaService } from '../prisma/prisma.service';

const EMAIL = 'punter@example.com';
const CODE = '123456';
const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const OTP_ID = 'otp-1';

interface PrismaMock {
  otp: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  account: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
}

function makePrismaMock(): PrismaMock {
  return {
    otp: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    account: { findUnique: vi.fn(), create: vi.fn() },
  };
}

function accountRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ACCOUNT_ID,
    email: EMAIL,
    name: 'punter',
    balance: OPENING_BALANCE,
    isBot: false,
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    ...overrides,
  };
}

function liveOtp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: OTP_ID,
    email: EMAIL,
    codeHash: hashCode(CODE),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: PrismaMock;
  let email: { sendOtp: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    email = { sendOtp: vi.fn().mockResolvedValue(undefined) };
    service = new AuthService(prisma as unknown as PrismaService, email as unknown as EmailService);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ADMIN_EMAILS;
  });

  describe('requestOtp', () => {
    it('creates a hashed, expiring code row and sends it', async () => {
      prisma.otp.create.mockResolvedValue(liveOtp());

      await service.requestOtp(EMAIL);

      expect(prisma.otp.create).toHaveBeenCalledTimes(1);
      const data = prisma.otp.create.mock.calls[0][0].data;
      expect(data.email).toBe(EMAIL);
      expect(data.codeHash).toHaveLength(64);
      expect(data.codeHash).not.toBe(CODE);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(email.sendOtp).toHaveBeenCalledTimes(1);
      // the raw code is sent, never persisted
      const sentCode = email.sendOtp.mock.calls[0][1];
      expect(data.codeHash).toBe(hashCode(sentCode));
    });

    it('swallows errors so the caller cannot detect failures (no enumeration)', async () => {
      prisma.otp.create.mockRejectedValue(new Error('db down'));

      await expect(service.requestOtp(EMAIL)).resolves.toBeUndefined();
      expect(email.sendOtp).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('mints a session and reuses an existing account (find-or-create hit)', async () => {
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(accountRecord());

      const result = await service.verify(EMAIL, CODE);

      expect(prisma.account.create).not.toHaveBeenCalled();
      expect(prisma.otp.update).toHaveBeenCalledWith({
        where: { id: OTP_ID },
        data: { consumedAt: expect.any(Date) },
      });
      expect(result.account.id).toBe(ACCOUNT_ID);
      expect(result.account.balance).toBe(OPENING_BALANCE);
      expect(verifyToken(result.token)).toBe(ACCOUNT_ID);
    });

    it('stamps an ADMIN session token for an allowlisted operator email', async () => {
      process.env.ADMIN_EMAILS = `someone-else@x.test, ${EMAIL}`;
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(accountRecord());

      const result = await service.verify(EMAIL, CODE);

      expect(verifyTokenClaims(result.token)).toEqual({ sub: ACCOUNT_ID, admin: true });
    });

    it('mints a NON-admin token for an ordinary punter (email not on the allowlist)', async () => {
      process.env.ADMIN_EMAILS = 'only-the-operator@x.test';
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(accountRecord());

      const result = await service.verify(EMAIL, CODE);

      expect(verifyTokenClaims(result.token)).toEqual({ sub: ACCOUNT_ID, admin: false });
    });

    it('creates a new account from the email local-part when none exists (no nickname)', async () => {
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(accountRecord({ name: 'punter' }));

      await service.verify(EMAIL, CODE);

      expect(prisma.account.create).toHaveBeenCalledTimes(1);
      const data = prisma.account.create.mock.calls[0][0].data;
      expect(data.email).toBe(EMAIL);
      expect(data.name).toBe('punter');
      expect(data.isBot).toBe(false);
      expect(data.balance).toBe(OPENING_BALANCE);
    });

    it('uses the provided nickname (trimmed) for a brand-new account', async () => {
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(accountRecord({ name: 'Griddy' }));

      await service.verify(EMAIL, CODE, '  Griddy  ');

      const data = prisma.account.create.mock.calls[0][0].data;
      expect(data.name).toBe('Griddy');
    });

    it('truncates a very long nickname to 50 characters', async () => {
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(accountRecord({ name: 'z'.repeat(50) }));

      await service.verify(EMAIL, CODE, 'z'.repeat(80));

      expect(prisma.account.create.mock.calls[0][0].data.name).toHaveLength(50);
    });

    it('falls back to the email local-part when the nickname is only whitespace', async () => {
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(accountRecord({ name: 'punter' }));

      await service.verify(EMAIL, CODE, '   ');

      expect(prisma.account.create.mock.calls[0][0].data.name).toBe('punter');
    });

    it('keeps the existing name and ignores the nickname when the account already exists', async () => {
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(accountRecord({ name: 'original' }));

      const result = await service.verify(EMAIL, CODE, 'IgnoreMe');

      expect(prisma.account.create).not.toHaveBeenCalled();
      expect(result.account.name).toBe('original');
    });

    it('truncates a very long local-part to 50 characters', async () => {
      const longLocal = 'a'.repeat(80);
      const longEmail = `${longLocal}@example.com`;
      prisma.otp.findFirst.mockResolvedValue(liveOtp({ email: longEmail }));
      prisma.otp.update.mockResolvedValue(liveOtp({ consumedAt: new Date() }));
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(
        accountRecord({ email: longEmail, name: 'a'.repeat(50) })
      );

      await service.verify(longEmail, CODE);

      expect(prisma.account.create.mock.calls[0][0].data.name).toHaveLength(50);
    });

    it('rejects when there is no live code', async () => {
      prisma.otp.findFirst.mockResolvedValue(null);
      await expect(service.verify(EMAIL, CODE)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a replay of an already-consumed code (filtered out by the query)', async () => {
      // findFirst filters consumedAt: null, so a consumed row surfaces as null.
      prisma.otp.findFirst.mockResolvedValue(null);
      await expect(service.verify(EMAIL, CODE)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.otp.update).not.toHaveBeenCalled();
    });

    it('locks out after too many attempts without checking the code', async () => {
      prisma.otp.findFirst.mockResolvedValue(liveOtp({ attempts: 5 }));
      await expect(service.verify(EMAIL, CODE)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.otp.update).not.toHaveBeenCalled();
    });

    it('increments attempts and rejects on a wrong code', async () => {
      prisma.otp.findFirst.mockResolvedValue(liveOtp());
      prisma.otp.update.mockResolvedValue(liveOtp({ attempts: 1 }));

      await expect(service.verify(EMAIL, '000000')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.otp.update).toHaveBeenCalledWith({
        where: { id: OTP_ID },
        data: { attempts: { increment: 1 } },
      });
      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('provisionBot', () => {
    it('creates a bot wallet with no email and a signed session', async () => {
      prisma.account.create.mockResolvedValue(
        accountRecord({ email: null, name: 'GriddyBot', isBot: true })
      );

      const result = await service.provisionBot('GriddyBot');

      expect(prisma.account.create).toHaveBeenCalledWith({
        data: { name: 'GriddyBot', email: null, isBot: true, balance: OPENING_BALANCE },
      });
      expect(result.account.isBot).toBe(true);
      expect(result.account.email).toBeNull();
      expect(verifyToken(result.token)).toBe(ACCOUNT_ID);
    });

    it('mints a NON-admin token even if the allowlist is set — bots bet as ordinary users', async () => {
      process.env.ADMIN_EMAILS = 'operator@x.test';
      prisma.account.create.mockResolvedValue(
        accountRecord({ email: null, name: 'GriddyBot', isBot: true })
      );

      const result = await service.provisionBot('GriddyBot');

      expect(verifyTokenClaims(result.token)).toEqual({ sub: ACCOUNT_ID, admin: false });
    });
  });
});
