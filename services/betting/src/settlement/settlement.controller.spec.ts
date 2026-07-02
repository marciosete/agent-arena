import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

const ADMIN_KEY = 'settle-secret';
const ADMIN_HEADER = 'x-admin-key';
const SETTLE_PATH = '/settle';
const RESPONSE = { settledBets: 2, totalPaidOut: 310 };

function settleBody() {
  return {
    settlement: {
      fixtureId: 'r16-1',
      winnerTeamId: 'BRA',
      homeScore: 2,
      awayScore: 1,
      decidedOnPenalties: false,
      settledAt: '2026-07-03T10:00:00.000Z',
    },
    winningSelections: [{ marketId: 'r16-1', selectionId: 'sel-bra' }],
  };
}

describe('SettlementController (e2e)', () => {
  let app: INestApplication;
  const settlement = { settle: vi.fn().mockResolvedValue(RESPONSE) };
  const bearer = `Bearer ${signToken('simulator')}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SettlementController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: SettlementService, useValue: settlement },
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
    settlement.settle.mockResolvedValue(RESPONSE);
    process.env.BETTING_ADMIN_KEY = ADMIN_KEY;
  });

  afterEach(() => {
    delete process.env.BETTING_ADMIN_KEY;
  });

  it('returns 401 without a Bearer token, even with a valid admin key', async () => {
    await request(app.getHttpServer())
      .post(SETTLE_PATH)
      .set(ADMIN_HEADER, ADMIN_KEY)
      .send(settleBody())
      .expect(401);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('returns 401 when the x-admin-key header is missing', async () => {
    await request(app.getHttpServer())
      .post(SETTLE_PATH)
      .set('authorization', bearer)
      .send(settleBody())
      .expect(401);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('returns 401 when the x-admin-key is wrong', async () => {
    await request(app.getHttpServer())
      .post(SETTLE_PATH)
      .set('authorization', bearer)
      .set(ADMIN_HEADER, 'guessed-key')
      .send(settleBody())
      .expect(401);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('settles with a valid token + admin key and returns the SettleResponse', async () => {
    const response = await request(app.getHttpServer())
      .post(SETTLE_PATH)
      .set('authorization', bearer)
      .set(ADMIN_HEADER, ADMIN_KEY)
      .send(settleBody())
      .expect(200);

    expect(settlement.settle).toHaveBeenCalledWith(settleBody());
    expect(response.body).toEqual(RESPONSE);
  });

  it('rejects a body without winningSelections with 400', async () => {
    await request(app.getHttpServer())
      .post(SETTLE_PATH)
      .set('authorization', bearer)
      .set(ADMIN_HEADER, ADMIN_KEY)
      .send({ settlement: settleBody().settlement })
      .expect(400);
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it('rejects a malformed settlement event with 400', async () => {
    const body = settleBody();
    body.settlement.winnerTeamId = 'BRAZIL';
    const response = await request(app.getHttpServer())
      .post(SETTLE_PATH)
      .set('authorization', bearer)
      .set(ADMIN_HEADER, ADMIN_KEY)
      .send(body);
    expect(response.status).toBe(400);
    expect(settlement.settle).not.toHaveBeenCalled();
  });
});
