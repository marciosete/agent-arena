import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { AuthResponseSchema } from '@arena/contracts';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const ADMIN_KEY = 'betting-secret';
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

describe('AuthController (e2e)', () => {
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
      providers: [{ provide: AuthService, useValue: auth }],
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

  afterEach(() => {
    delete process.env.BETTING_ADMIN_KEY;
  });

  describe('POST /auth/request-otp', () => {
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

  describe('POST /auth/verify', () => {
    it('returns a contract-valid AuthResponse on success', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ email: 'punter@example.com', code: '123456' })
        .expect(201);
      expect(AuthResponseSchema.parse(response.body).account.id).toBe(AUTH_RESPONSE.account.id);
      expect(auth.verify).toHaveBeenCalledWith('punter@example.com', '123456');
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

  describe('POST /accounts', () => {
    it('provisions a bot when no admin key is configured (local dev)', async () => {
      delete process.env.BETTING_ADMIN_KEY;
      const response = await request(app.getHttpServer())
        .post('/accounts')
        .send({ name: 'GriddyBot', isBot: true })
        .expect(201);
      expect(AuthResponseSchema.parse(response.body).account.isBot).toBe(true);
      expect(auth.provisionBot).toHaveBeenCalledWith('GriddyBot');
    });

    it('rejects when the admin key is set but absent from the request (401)', async () => {
      process.env.BETTING_ADMIN_KEY = ADMIN_KEY;
      await request(app.getHttpServer()).post('/accounts').send({ name: 'GriddyBot' }).expect(401);
      expect(auth.provisionBot).not.toHaveBeenCalled();
    });

    it('provisions when the correct admin key is supplied', async () => {
      process.env.BETTING_ADMIN_KEY = ADMIN_KEY;
      await request(app.getHttpServer())
        .post('/accounts')
        .set('x-admin-key', ADMIN_KEY)
        .send({ name: 'GriddyBot' })
        .expect(201);
      expect(auth.provisionBot).toHaveBeenCalledWith('GriddyBot');
    });

    it('rejects a bad body with 400 after passing the guard', async () => {
      process.env.BETTING_ADMIN_KEY = ADMIN_KEY;
      await request(app.getHttpServer())
        .post('/accounts')
        .set('x-admin-key', ADMIN_KEY)
        .send({ name: '' })
        .expect(400);
      expect(auth.provisionBot).not.toHaveBeenCalled();
    });
  });
});
