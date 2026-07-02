import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { JwtAuthGuard, signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = 'b2222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = 'c3333333-3333-4333-8333-333333333333';
const MARKET_ID = 'r16-1';
const SELECTION_ID = 'sel-bra';
const BETS_PATH = '/bets';

const PLACED_BET = {
  id: 'd4444444-4444-4444-8444-444444444444',
  accountId: ACCOUNT_ID,
  marketId: MARKET_ID,
  selectionId: SELECTION_ID,
  stake: 100,
  price: 1.55,
  potentialReturn: 155,
  status: 'pending',
  placedAt: '2026-07-03T09:00:00.000Z',
  settledAt: null,
};

function placeBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    marketId: MARKET_ID,
    selectionId: SELECTION_ID,
    stake: 100,
    acceptedPrice: 1.55,
    idempotencyKey: IDEMPOTENCY_KEY,
    ...overrides,
  };
}

describe('BetsController (e2e)', () => {
  let app: INestApplication;
  const bets = {
    placeBet: vi.fn().mockResolvedValue(PLACED_BET),
    findBets: vi.fn().mockResolvedValue([PLACED_BET]),
  };
  const bearer = `Bearer ${signToken(ACCOUNT_ID)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BetsController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: BetsService, useValue: bets },
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
    bets.placeBet.mockResolvedValue(PLACED_BET);
    bets.findBets.mockResolvedValue([PLACED_BET]);
  });

  describe('POST /bets auth', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).post(BETS_PATH).send(placeBody()).expect(401);
      expect(bets.placeBet).not.toHaveBeenCalled();
    });

    it('returns 401 for a garbage token', async () => {
      const response = await request(app.getHttpServer())
        .post(BETS_PATH)
        .set('authorization', 'Bearer not-a-jwt')
        .send(placeBody());
      expect(response.status).toBe(401);
      expect(bets.placeBet).not.toHaveBeenCalled();
    });
  });

  describe('POST /bets placement', () => {
    it('derives the account from the token and returns the placed bet', async () => {
      const response = await request(app.getHttpServer())
        .post(BETS_PATH)
        .set('authorization', bearer)
        .send(placeBody())
        .expect(201);

      expect(bets.placeBet).toHaveBeenCalledWith(ACCOUNT_ID, placeBody());
      expect(response.body.id).toBe(PLACED_BET.id);
    });

    it('CANNOT set another account id — a smuggled body accountId is discarded', async () => {
      await request(app.getHttpServer())
        .post(BETS_PATH)
        .set('authorization', bearer)
        .send(placeBody({ accountId: OTHER_ACCOUNT_ID }))
        .expect(201);

      // Zod strips the unknown key; the service only ever sees the token's account.
      expect(bets.placeBet).toHaveBeenCalledWith(ACCOUNT_ID, placeBody());
    });

    it('rejects a non-positive stake with 400', async () => {
      await request(app.getHttpServer())
        .post(BETS_PATH)
        .set('authorization', bearer)
        .send(placeBody({ stake: 0 }))
        .expect(400);
      expect(bets.placeBet).not.toHaveBeenCalled();
    });

    it('rejects a stake above the schema cap with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(BETS_PATH)
        .set('authorization', bearer)
        .send(placeBody({ stake: 10_001 }));
      expect(response.status).toBe(400);
      expect(bets.placeBet).not.toHaveBeenCalled();
    });

    it('rejects a non-uuid idempotency key with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(BETS_PATH)
        .set('authorization', bearer)
        .send(placeBody({ idempotencyKey: 'twice-please' }));
      expect(response.status).toBe(400);
      expect(bets.placeBet).not.toHaveBeenCalled();
    });
  });

  describe('GET /bets', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get(BETS_PATH).expect(401);
      expect(bets.findBets).not.toHaveBeenCalled();
    });

    it('passes validated accountId/status filters to the service', async () => {
      const response = await request(app.getHttpServer())
        .get(BETS_PATH)
        .query({ accountId: ACCOUNT_ID, status: 'pending' })
        .set('authorization', bearer)
        .expect(200);

      expect(bets.findBets).toHaveBeenCalledWith({ accountId: ACCOUNT_ID, status: 'pending' });
      expect(response.body).toEqual([PLACED_BET]);
    });

    it('accepts an empty query (all bets)', async () => {
      await request(app.getHttpServer()).get(BETS_PATH).set('authorization', bearer).expect(200);
      expect(bets.findBets).toHaveBeenCalledWith({});
    });

    it('rejects an unknown status filter with 400', async () => {
      const response = await request(app.getHttpServer())
        .get(BETS_PATH)
        .query({ status: 'sideways' })
        .set('authorization', bearer);
      expect(response.status).toBe(400);
      expect(bets.findBets).not.toHaveBeenCalled();
    });

    it('rejects a non-uuid accountId filter with 400', async () => {
      const response = await request(app.getHttpServer())
        .get(BETS_PATH)
        .query({ accountId: 'not-a-uuid' })
        .set('authorization', bearer);
      expect(response.status).toBe(400);
      expect(bets.findBets).not.toHaveBeenCalled();
    });
  });
});
