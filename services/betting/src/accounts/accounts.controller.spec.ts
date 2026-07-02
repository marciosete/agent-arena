import { Test } from '@nestjs/testing';
import { NotFoundException, type INestApplication } from '@nestjs/common';
import { AccountSchema, OPENING_BALANCE } from '@arena/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

const ACCOUNT = {
  id: 'a1111111-1111-4111-8111-111111111111',
  email: 'punter@example.com',
  name: 'punter',
  balance: OPENING_BALANCE,
  isBot: false,
  createdAt: '2026-07-02T00:00:00.000Z',
};

describe('AccountsController (e2e)', () => {
  let app: INestApplication;
  const accounts = {
    findAll: vi.fn(),
    findOne: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [{ provide: AccountsService, useValue: accounts }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /accounts', () => {
    it('returns the list of contract-valid accounts', async () => {
      accounts.findAll.mockResolvedValue([ACCOUNT]);

      const response = await request(app.getHttpServer()).get('/accounts').expect(200);

      expect(response.body).toHaveLength(1);
      expect(AccountSchema.parse(response.body[0]).id).toBe(ACCOUNT.id);
      expect(accounts.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /accounts/:id', () => {
    it('returns a single contract-valid account', async () => {
      accounts.findOne.mockResolvedValue(ACCOUNT);

      const response = await request(app.getHttpServer())
        .get(`/accounts/${ACCOUNT.id}`)
        .expect(200);

      expect(AccountSchema.parse(response.body).id).toBe(ACCOUNT.id);
      expect(accounts.findOne).toHaveBeenCalledWith(ACCOUNT.id);
    });

    it('maps an unknown account to 404', async () => {
      accounts.findOne.mockRejectedValueOnce(new NotFoundException('Account nope not found'));
      await request(app.getHttpServer()).get('/accounts/nope').expect(404);
    });
  });
});
