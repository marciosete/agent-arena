import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

const ADMIN_KEY = 'test-admin-key';
const SETTLE_BODY = {
  settlement: {
    fixtureId: 'qf-1',
    winnerTeamId: 'BRA',
    homeScore: 2,
    awayScore: 1,
    decidedOnPenalties: false,
    settledAt: '2026-07-03T18:00:00.000Z',
  },
  winningSelections: [{ marketId: 'qf-1', selectionId: 'sel-bra' }],
};

describe('SettlementController (e2e, real JwtAuthGuard + AdminGuard)', () => {
  let app: INestApplication;
  let previousAdminKey: string | undefined;
  const settlement = { settle: vi.fn() };

  beforeAll(async () => {
    previousAdminKey = process.env.BETTING_ADMIN_KEY;
    process.env.BETTING_ADMIN_KEY = ADMIN_KEY;

    const moduleRef = await Test.createTestingModule({
      controllers: [SettlementController],
      providers: [
        { provide: SettlementService, useValue: settlement },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousAdminKey === undefined) {
      delete process.env.BETTING_ADMIN_KEY;
    } else {
      process.env.BETTING_ADMIN_KEY = previousAdminKey;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    settlement.settle.mockResolvedValue({ settledBets: 2, totalPaidOut: 250 });
  });

  const serviceBearer = () => `Bearer ${signToken('simulator')}`;

  it('POST /settle returns 401 without a Bearer token, even with the right admin key', async () => {
    await request(app.getHttpServer())
      .post('/settle')
      .set('x-admin-key', ADMIN_KEY)
      .send(SETTLE_BODY)
      .expect(401);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('POST /settle returns 401 with a valid Bearer but a MISSING x-admin-key', async () => {
    await request(app.getHttpServer())
      .post('/settle')
      .set('authorization', serviceBearer())
      .send(SETTLE_BODY)
      .expect(401);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('POST /settle returns 401 with a valid Bearer but the WRONG x-admin-key', async () => {
    await request(app.getHttpServer())
      .post('/settle')
      .set('authorization', serviceBearer())
      .set('x-admin-key', 'guessed-key')
      .send(SETTLE_BODY)
      .expect(401);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('settles with Bearer + correct x-admin-key and returns the SettleResponse', async () => {
    const response = await request(app.getHttpServer())
      .post('/settle')
      .set('authorization', serviceBearer())
      .set('x-admin-key', ADMIN_KEY)
      .send(SETTLE_BODY)
      .expect(200);

    expect(settlement.settle).toHaveBeenCalledWith(SETTLE_BODY);
    expect(response.body).toEqual({ settledBets: 2, totalPaidOut: 250 });
  });

  it('rejects a contract-invalid settle body with 400', async () => {
    await request(app.getHttpServer())
      .post('/settle')
      .set('authorization', serviceBearer())
      .set('x-admin-key', ADMIN_KEY)
      .send({ settlement: { fixtureId: 'qf-1' }, winningSelections: [] })
      .expect(400);

    expect(settlement.settle).not.toHaveBeenCalled();
  });
});
