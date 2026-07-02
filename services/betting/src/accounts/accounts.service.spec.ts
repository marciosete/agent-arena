import { NotFoundException } from '@nestjs/common';
import { AccountSchema, OPENING_BALANCE } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsService } from './accounts.service';
import type { PrismaService } from '../prisma/prisma.service';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const BOT_ID = 'b2222222-2222-4222-8222-222222222222';
const CREATED_AT_ISO = '2026-07-02T00:00:00.000Z';

interface PrismaMock {
  account: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
}

function makePrismaMock(): PrismaMock {
  return { account: { findMany: vi.fn(), findUnique: vi.fn() } };
}

function accountRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ACCOUNT_ID,
    email: 'punter@example.com',
    name: 'punter',
    balance: OPENING_BALANCE,
    isBot: false,
    createdAt: new Date(CREATED_AT_ISO),
    ...overrides,
  };
}

describe('AccountsService', () => {
  let prisma: PrismaMock;
  let service: AccountsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AccountsService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('maps every row to the contract shape (ISO createdAt, nullable bot email)', async () => {
      prisma.account.findMany.mockResolvedValue([
        accountRow(),
        accountRow({ id: BOT_ID, email: null, name: 'GriddyBot', isBot: true }),
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(() => result.forEach((account) => AccountSchema.parse(account))).not.toThrow();
      expect(result[0].createdAt).toBe(CREATED_AT_ISO);
      expect(result[1].email).toBeNull();
      expect(prisma.account.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
    });

    it('returns an empty array when there are no accounts', async () => {
      prisma.account.findMany.mockResolvedValue([]);
      await expect(service.findAll()).resolves.toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the mapped account when it exists', async () => {
      prisma.account.findUnique.mockResolvedValue(accountRow());

      const result = await service.findOne(ACCOUNT_ID);

      expect(AccountSchema.parse(result).id).toBe(ACCOUNT_ID);
      expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID } });
    });

    it('throws NotFoundException when the account is unknown', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
