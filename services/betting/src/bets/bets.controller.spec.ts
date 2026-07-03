import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = 'a2222222-2222-4222-8222-222222222222';

const PLACE_BODY = {
  marketId: 'qf-1',
  selectionId: 'sel-bra',
  stake: 100,
  acceptedPrice: 2.0,
  idempotencyKey: 'c1111111-1111-4111-8111-111111111111',
};

const BET = {
  id: 'b1111111-1111-4111-8111-111111111111',
  accountId: ACCOUNT_ID,
  marketId: PLACE_BODY.marketId,
  selectionId: PLACE_BODY.selectionId,
  stake: 100,
  price: 2.0,
  potentialReturn: 200,
  status: 'pending',
  placedAt: '2026-07-03T10:00:00.000Z',
  settledAt: null,
};

describe('BetsController (e2e, real JwtAuthGuard)', () => {
  let app: INestApplication;
  const bets = { placeBet: vi.fn(), findBets: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BetsController],
      providers: [
        { provide: BetsService, useValue: bets },
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
    bets.placeBet.mockResolvedValue(BET);
    bets.findBets.mockResolvedValue([BET]);
  });

  const bearer = () => `Bearer ${signToken(ACCOUNT_ID)}`;

  describe('auth (not @Public)', () => {
    it('POST /bets returns 401 without a Bearer token', async () => {
      await request(app.getHttpServer()).post('/bets').send(PLACE_BODY).expect(401);
      expect(bets.placeBet).not.toHaveBeenCalled();
    });

    it('POST /bets returns 401 for an invalid token', async () => {
      await request(app.getHttpServer())
        .post('/bets')
        .set('authorization', 'Bearer not-a-real-token')
        .send(PLACE_BODY)
        .expect(401);
      expect(bets.placeBet).not.toHaveBeenCalled();
    });

    it('GET /bets returns 401 without a Bearer token', async () => {
      await request(app.getHttpServer()).get('/bets').expect(401);
      expect(bets.findBets).not.toHaveBeenCalled();
    });
  });

  describe('POST /bets', () => {
    it('places a bet for the TOKEN account and returns 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/bets')
        .set('authorization', bearer())
        .send(PLACE_BODY)
        .expect(201);

      expect(bets.placeBet).toHaveBeenCalledWith(ACCOUNT_ID, PLACE_BODY);
      expect(response.body.id).toBe(BET.id);
    });

    it("cannot set another account's id — an accountId smuggled into the body is discarded", async () => {
      await request(app.getHttpServer())
        .post('/bets')
        .set('authorization', bearer())
        .send({ ...PLACE_BODY, accountId: OTHER_ACCOUNT_ID })
        .expect(201);

      // zod strips the unknown key; the service only ever sees the token's account
      expect(bets.placeBet).toHaveBeenCalledWith(ACCOUNT_ID, PLACE_BODY);
    });

    it('rejects a contract-invalid body with 400 before any money logic runs', async () => {
      await request(app.getHttpServer())
        .post('/bets')
        .set('authorization', bearer())
        .send({ ...PLACE_BODY, stake: -5 })
        .expect(400);

      expect(bets.placeBet).not.toHaveBeenCalled();
    });

    it('rejects a non-uuid idempotencyKey with 400', async () => {
      await request(app.getHttpServer())
        .post('/bets')
        .set('authorization', bearer())
        .send({ ...PLACE_BODY, idempotencyKey: 'not-a-uuid' })
        .expect(400);
      expect(bets.placeBet).not.toHaveBeenCalled();
    });
  });

  describe('GET /bets', () => {
    it('validates the query and passes the filters through', async () => {
      await request(app.getHttpServer())
        .get(`/bets?accountId=${ACCOUNT_ID}&status=pending`)
        .set('authorization', bearer())
        .expect(200);

      expect(bets.findBets).toHaveBeenCalledWith({ accountId: ACCOUNT_ID, status: 'pending' });
    });

    it('lists bets with no filters for a bare query', async () => {
      const response = await request(app.getHttpServer())
        .get('/bets')
        .set('authorization', bearer())
        .expect(200);

      expect(bets.findBets).toHaveBeenCalledWith({});
      expect(response.body).toHaveLength(1);
    });

    it('rejects a non-uuid accountId filter with 400', async () => {
      await request(app.getHttpServer())
        .get('/bets?accountId=bob')
        .set('authorization', bearer())
        .expect(400);
      expect(bets.findBets).not.toHaveBeenCalled();
    });

    it('rejects an unknown status filter with 400', async () => {
      await request(app.getHttpServer())
        .get('/bets?status=maybe')
        .set('authorization', bearer())
        .expect(400);
      expect(bets.findBets).not.toHaveBeenCalled();
    });
  });
});
