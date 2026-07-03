import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import { ResetResponseSchema } from '@arena/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetController } from './reset.controller';
import { ResetService } from './reset.service';

const RESET_RESPONSE = { betsVoided: 4, botsRemoved: 2, walletsReset: 6 };

describe('ResetController (e2e, real JwtAuthGuard + AdminGuard)', () => {
  let app: INestApplication;
  const reset = { reset: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ResetController],
      providers: [
        { provide: ResetService, useValue: reset },
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
    reset.reset.mockResolvedValue(RESET_RESPONSE);
  });

  // An allowlisted operator (or admin service token) — admin claim baked in.
  const adminBearer = () => `Bearer ${signToken('operator', { admin: true })}`;
  // An ordinary punter token — valid session, but no admin authority.
  const punterBearer = () => `Bearer ${signToken('punter')}`;

  it('POST /reset returns 401 without a Bearer token', async () => {
    await request(app.getHttpServer()).post('/reset').expect(401);
    expect(reset.reset).not.toHaveBeenCalled();
  });

  it('POST /reset returns 401 for an invalid/garbage token', async () => {
    await request(app.getHttpServer())
      .post('/reset')
      .set('authorization', 'Bearer not-a-real-token')
      .expect(401);
    expect(reset.reset).not.toHaveBeenCalled();
  });

  it('POST /reset returns 403 for a valid NON-admin token', async () => {
    await request(app.getHttpServer())
      .post('/reset')
      .set('authorization', punterBearer())
      .expect(403);
    expect(reset.reset).not.toHaveBeenCalled();
  });

  it('POST /reset runs with an admin token and returns a contract-valid ResetResponse', async () => {
    const response = await request(app.getHttpServer())
      .post('/reset')
      .set('authorization', adminBearer())
      .expect(200);

    expect(ResetResponseSchema.parse(response.body)).toEqual(RESET_RESPONSE);
    expect(reset.reset).toHaveBeenCalledTimes(1);
  });
});
