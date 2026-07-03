import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthResponseSchema } from '@arena/contracts';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const AUTH_RESPONSE = {
  token: 'a-signed-token',
  account: {
    id: 'a1111111-1111-4111-8111-111111111111',
    email: 'punter@example.com',
    name: 'punter',
    balance: 10_000,
    isBot: false,
    createdAt: '2026-07-02T00:00:00.000Z',
  },
};

describe('AuthController (e2e, real JwtAuthGuard + AdminGuard)', () => {
  let app: INestApplication;
  const auth = {
    requestOtp: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue(AUTH_RESPONSE),
    provisionBot: vi.fn().mockResolvedValue({
      ...AUTH_RESPONSE,
      account: { ...AUTH_RESPONSE.account, email: null, name: 'GriddyBot', isBot: true },
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auth.requestOtp.mockResolvedValue(undefined);
    auth.verify.mockResolvedValue(AUTH_RESPONSE);
  });

  // An allowlisted operator (or admin service token) provisions bots.
  const adminBearer = () => `Bearer ${signToken('operator', { admin: true })}`;
  // An ordinary punter token — valid session, but no admin authority.
  const punterBearer = () => `Bearer ${signToken('punter')}`;

  describe('POST /auth/request-otp (public)', () => {
    it('returns { ok: true } and delegates to the service', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email: 'punter@example.com' })
        .expect(200);
      expect(response.body).toEqual({ ok: true });
      expect(auth.requestOtp).toHaveBeenCalledWith('punter@example.com');
    });

    it('returns the same { ok: true } for an unknown email (no enumeration)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email: 'stranger@nowhere.test' })
        .expect(200);
      expect(response.body).toEqual({ ok: true });
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email: 'not-an-email' })
        .expect(400);
      expect(auth.requestOtp).not.toHaveBeenCalled();
    });

    it('rejects a missing body with 400', async () => {
      const response = await request(app.getHttpServer()).post('/auth/request-otp').send({});
      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/verify (public)', () => {
    it('returns a contract-valid AuthResponse on success', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ email: 'punter@example.com', code: '123456' })
        .expect(201);
      expect(AuthResponseSchema.parse(response.body).account.id).toBe(AUTH_RESPONSE.account.id);
      expect(auth.verify).toHaveBeenCalledWith('punter@example.com', '123456', undefined);
    });

    it('forwards an optional nickname to the service', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ email: 'punter@example.com', code: '123456', name: 'Griddy' })
        .expect(201);
      expect(auth.verify).toHaveBeenCalledWith('punter@example.com', '123456', 'Griddy');
    });

    it('rejects a nickname longer than 50 characters with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ email: 'punter@example.com', code: '123456', name: 'z'.repeat(51) })
        .expect(400);
      expect(auth.verify).not.toHaveBeenCalled();
    });

    it('maps an UnauthorizedException to 401', async () => {
      auth.verify.mockRejectedValueOnce(new UnauthorizedException('Invalid or expired code'));
      const response = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ email: 'punter@example.com', code: '000000' });
      expect(response.status).toBe(401);
    });

    it('rejects a malformed code with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ email: 'punter@example.com', code: '12' })
        .expect(400);
      expect(auth.verify).not.toHaveBeenCalled();
    });
  });

  describe('POST /accounts (admin only)', () => {
    it('provisions a bot for an admin bearer token', async () => {
      const response = await request(app.getHttpServer())
        .post('/accounts')
        .set('authorization', adminBearer())
        .send({ name: 'GriddyBot', isBot: true })
        .expect(201);
      expect(AuthResponseSchema.parse(response.body).account.isBot).toBe(true);
      expect(auth.provisionBot).toHaveBeenCalledWith('GriddyBot');
    });

    it('returns 401 without a Bearer token', async () => {
      await request(app.getHttpServer()).post('/accounts').send({ name: 'GriddyBot' }).expect(401);
      expect(auth.provisionBot).not.toHaveBeenCalled();
    });

    it('returns 403 for a valid NON-admin token', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('authorization', punterBearer())
        .send({ name: 'GriddyBot' })
        .expect(403);
      expect(auth.provisionBot).not.toHaveBeenCalled();
    });

    it('rejects a bad body with 400 after passing the admin guard', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('authorization', adminBearer())
        .send({ name: '' })
        .expect(400);
      expect(auth.provisionBot).not.toHaveBeenCalled();
    });
  });
});
