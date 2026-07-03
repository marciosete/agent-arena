import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

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
  const settlement = { settle: vi.fn() };

  beforeAll(async () => {
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
    settlement.settle.mockResolvedValue({ settledBets: 2, totalPaidOut: 250 });
  });

  // The simulator settles with an admin-claim service token.
  const adminBearer = () => `Bearer ${signToken('simulator', { admin: true })}`;
  // An ordinary punter token — valid session, but no admin authority.
  const punterBearer = () => `Bearer ${signToken('punter')}`;

  it('POST /settle returns 401 without a Bearer token', async () => {
    await request(app.getHttpServer()).post('/settle').send(SETTLE_BODY).expect(401);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('POST /settle returns 401 for an invalid/garbage token', async () => {
    await request(app.getHttpServer())
      .post('/settle')
      .set('authorization', 'Bearer not-a-real-token')
      .send(SETTLE_BODY)
      .expect(401);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('POST /settle returns 403 for a valid NON-admin token', async () => {
    await request(app.getHttpServer())
      .post('/settle')
      .set('authorization', punterBearer())
      .send(SETTLE_BODY)
      .expect(403);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('settles with an admin token and returns the SettleResponse', async () => {
    const response = await request(app.getHttpServer())
      .post('/settle')
      .set('authorization', adminBearer())
      .send(SETTLE_BODY)
      .expect(200);

    expect(settlement.settle).toHaveBeenCalledWith(SETTLE_BODY);
    expect(response.body).toEqual({ settledBets: 2, totalPaidOut: 250 });
  });

  it('rejects a contract-invalid settle body with 400', async () => {
    await request(app.getHttpServer())
      .post('/settle')
      .set('authorization', adminBearer())
      .send({ settlement: { fixtureId: 'qf-1' }, winningSelections: [] })
      .expect(400);

    expect(settlement.settle).not.toHaveBeenCalled();
  });
});
