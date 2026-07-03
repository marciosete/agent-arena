import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExposureController } from './exposure.controller';
import { ExposureService } from './exposure.service';

const REPORT = {
  generatedAt: '2026-07-03T12:00:00.000Z',
  markets: [
    {
      marketId: 'qf-1',
      marketName: 'Brazil vs Argentina — Match Winner',
      totalStaked: 160,
      maxLiability: 250,
      betCount: 2,
      status: 'open',
    },
  ],
};

describe('ExposureController (e2e, real JwtAuthGuard)', () => {
  let app: INestApplication;
  const exposure = { report: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExposureController],
      providers: [
        { provide: ExposureService, useValue: exposure },
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
    exposure.report.mockResolvedValue(REPORT);
  });

  it('GET /exposure returns 401 without a Bearer token', async () => {
    await request(app.getHttpServer()).get('/exposure').expect(401);
    expect(exposure.report).not.toHaveBeenCalled();
  });

  it('returns the liability board to any logged-in caller (reads carry no per-user check)', async () => {
    const response = await request(app.getHttpServer())
      .get('/exposure')
      .set('authorization', `Bearer ${signToken('any-trader')}`)
      .expect(200);

    expect(response.body).toEqual(REPORT);
  });
});
