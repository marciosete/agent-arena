import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExposureController } from './exposure.controller';
import { ExposureService } from './exposure.service';

const EXPOSURE_PATH = '/exposure';
const REPORT = {
  generatedAt: '2026-07-03T10:00:00.000Z',
  markets: [
    {
      marketId: 'r16-1',
      marketName: 'Brazil v Chile — Match Winner',
      totalStaked: 150,
      maxLiability: 310,
      betCount: 2,
      status: 'open',
    },
  ],
};

describe('ExposureController (e2e)', () => {
  let app: INestApplication;
  const exposure = { report: vi.fn().mockResolvedValue(REPORT) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExposureController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: ExposureService, useValue: exposure },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get(EXPOSURE_PATH).expect(401);
    expect(exposure.report).not.toHaveBeenCalled();
  });

  it('returns the liability report to any logged-in caller', async () => {
    const response = await request(app.getHttpServer())
      .get(EXPOSURE_PATH)
      .set('authorization', `Bearer ${signToken('trader')}`)
      .expect(200);

    expect(response.body).toEqual(REPORT);
  });
});
