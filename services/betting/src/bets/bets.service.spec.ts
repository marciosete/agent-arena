import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { BetSchema, type PlaceBetRequest } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { PricingClient } from './pricing-client.service';
import { BetsService } from './bets.service';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = 'a2222222-2222-4222-8222-222222222222';
const BET_ID = 'b1111111-1111-4111-8111-111111111111';
const IDEMPOTENCY_KEY = 'c1111111-1111-4111-8111-111111111111';
const MARKET_ID = 'qf-1';
const SELECTION_ID = 'sel-bra';

const MARKET = {
  id: MARKET_ID,
  type: 'MATCH_WINNER' as const,
  fixtureId: MARKET_ID,
  name: 'Brazil vs Argentina — Match Winner',
  status: 'open' as const,
  selections: [
    { id: SELECTION_ID, name: 'Brazil', price: 2.0 },
    { id: 'sel-arg', name: 'Argentina', price: 1.9 },
  ],
};

const PLACE_REQUEST: PlaceBetRequest = {
  marketId: MARKET_ID,
  selectionId: SELECTION_ID,
  stake: 100,
  acceptedPrice: 2.0,
  idempotencyKey: IDEMPOTENCY_KEY,
};

function betRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: BET_ID,
    accountId: ACCOUNT_ID,
    marketId: MARKET_ID,
    marketName: MARKET.name,
    selectionId: SELECTION_ID,
    stake: 100,
    price: 2.0,
    potentialReturn: 200,
    status: 'pending',
    placedAt: new Date('2026-07-03T10:00:00.000Z'),
    settledAt: null,
    idempotencyKey: IDEMPOTENCY_KEY,
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('BetsService', () => {
  let tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    account: { findUnique: ReturnType<typeof vi.fn> };
    bet: { create: ReturnType<typeof vi.fn> };
    ledgerEntry: { create: ReturnType<typeof vi.fn> };
  };
  let prisma: {
    bet: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let pricing: { fetchMarket: ReturnType<typeof vi.fn> };
  let service: BetsService;

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ balance: 9900 }]),
      account: { findUnique: vi.fn() },
      bet: { create: vi.fn().mockResolvedValue(betRow()) },
      ledgerEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    prisma = {
      bet: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx)
      ),
    };
    pricing = { fetchMarket: vi.fn().mockResolvedValue(MARKET) };
    service = new BetsService(
      prisma as unknown as PrismaService,
      pricing as unknown as PricingClient
    );
  });

  describe('placeBet', () => {
    it('debits the wallet, locks the live price and writes bet + ledger inside ONE $transaction', async () => {
      const bet = await service.placeBet(ACCOUNT_ID, PLACE_REQUEST);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // the guarded debit ran against the tx client
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      // the bet row is created with the account from the TOKEN and the LIVE price
      const created = tx.bet.create.mock.calls[0][0].data;
      expect(created.accountId).toBe(ACCOUNT_ID);
      expect(created.price).toBe(2.0);
      expect(created.potentialReturn).toBe(200);
      expect(created.marketName).toBe(MARKET.name);
      expect(created.idempotencyKey).toBe(IDEMPOTENCY_KEY);
      // the ledger entry reconciles the debit
      const ledger = tx.ledgerEntry.create.mock.calls[0][0].data;
      expect(ledger).toMatchObject({
        accountId: ACCOUNT_ID,
        delta: -100,
        balanceAfter: 9900,
        reason: 'bet-placed',
        refBetId: BET_ID,
      });
      expect(BetSchema.parse(bet).status).toBe('pending');
    });

    it('locks the CURRENT live price when it drifted within tolerance (not the accepted price)', async () => {
      const drifted = {
        ...MARKET,
        selections: [{ id: SELECTION_ID, name: 'Brazil', price: 2.04 }, MARKET.selections[1]],
      };
      pricing.fetchMarket.mockResolvedValue(drifted);
      tx.bet.create.mockResolvedValue(betRow({ price: 2.04, potentialReturn: 204 }));

      await service.placeBet(ACCOUNT_ID, PLACE_REQUEST);

      const created = tx.bet.create.mock.calls[0][0].data;
      expect(created.price).toBe(2.04);
      expect(created.potentialReturn).toBe(204);
    });

    it('returns the ORIGINAL bet on a replayed idempotency key — no pricing call, no second debit', async () => {
      prisma.bet.findUnique.mockResolvedValue(betRow());

      const bet = await service.placeBet(ACCOUNT_ID, PLACE_REQUEST);

      expect(bet.id).toBe(BET_ID);
      expect(pricing.fetchMarket).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets the DB unique constraint referee a concurrent replay (P2002 → original bet)', async () => {
      // fast path sees nothing; the insert then collides with the racing twin
      prisma.bet.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(betRow());
      tx.bet.create.mockRejectedValue(uniqueViolation());

      const bet = await service.placeBet(ACCOUNT_ID, PLACE_REQUEST);

      expect(bet.id).toBe(BET_ID);
      expect(prisma.bet.findUnique).toHaveBeenCalledTimes(2);
    });

    it("refuses to replay ANOTHER account's idempotency key (409, no bet leak)", async () => {
      prisma.bet.findUnique.mockResolvedValue(betRow({ accountId: OTHER_ACCOUNT_ID }));

      await expect(service.placeBet(ACCOUNT_ID, PLACE_REQUEST)).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('409s a reused idempotency key whose payload differs — never silently the wrong bet', async () => {
      prisma.bet.findUnique.mockResolvedValue(betRow({ stake: 50, selectionId: 'sel-arg' }));

      await expect(service.placeBet(ACCOUNT_ID, PLACE_REQUEST)).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a sub-cent stake with 400 before any lookup runs', async () => {
      await expect(
        service.placeBet(ACCOUNT_ID, { ...PLACE_REQUEST, stake: 0.004 })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bet.findUnique).not.toHaveBeenCalled();
      expect(pricing.fetchMarket).not.toHaveBeenCalled();
    });

    it('rejects a stake above the wallet balance with 400 — nothing is written', async () => {
      tx.$queryRaw.mockResolvedValue([]); // guarded debit found no row with balance >= stake
      tx.account.findUnique.mockResolvedValue({ id: ACCOUNT_ID, balance: 50 });

      await expect(service.placeBet(ACCOUNT_ID, PLACE_REQUEST)).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(tx.bet.create).not.toHaveBeenCalled();
      expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it('rejects a token whose account no longer exists with 401', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      tx.account.findUnique.mockResolvedValue(null);

      await expect(service.placeBet(ACCOUNT_ID, PLACE_REQUEST)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it('409s when the live price moved beyond tolerance — the wallet is never touched', async () => {
      const moved = {
        ...MARKET,
        selections: [{ id: SELECTION_ID, name: 'Brazil', price: 2.5 }, MARKET.selections[1]],
      };
      pricing.fetchMarket.mockResolvedValue(moved);

      await expect(service.placeBet(ACCOUNT_ID, PLACE_REQUEST)).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('409s when the market is not open', async () => {
      pricing.fetchMarket.mockResolvedValue({ ...MARKET, status: 'settled' });

      await expect(service.placeBet(ACCOUNT_ID, PLACE_REQUEST)).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('400s when the selection does not belong to the market', async () => {
      await expect(
        service.placeBet(ACCOUNT_ID, { ...PLACE_REQUEST, selectionId: 'sel-not-here' })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('propagates a ledger failure so the $transaction rolls the debit back', async () => {
      tx.ledgerEntry.create.mockRejectedValue(new Error('ledger write failed'));

      await expect(service.placeBet(ACCOUNT_ID, PLACE_REQUEST)).rejects.toThrow(
        'ledger write failed'
      );
      // the debit and bet insert happened INSIDE the same transaction callback,
      // so Prisma discards them when the callback rejects
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.bet.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findBets', () => {
    it('filters by accountId and status and maps rows to contract Bets', async () => {
      prisma.bet.findMany.mockResolvedValue([betRow()]);

      const bets = await service.findBets({ accountId: ACCOUNT_ID, status: 'pending' });

      expect(prisma.bet.findMany).toHaveBeenCalledWith({
        where: { accountId: ACCOUNT_ID, status: 'pending' },
        orderBy: { placedAt: 'desc' },
      });
      expect(bets).toHaveLength(1);
      expect(BetSchema.parse(bets[0]).placedAt).toBe('2026-07-03T10:00:00.000Z');
    });

    it('applies no filters when the query is empty', async () => {
      prisma.bet.findMany.mockResolvedValue([]);

      await service.findBets({});

      expect(prisma.bet.findMany).toHaveBeenCalledWith({
        where: { accountId: undefined, status: undefined },
        orderBy: { placedAt: 'desc' },
      });
    });

    it('serialises settled bets with an ISO settledAt', async () => {
      prisma.bet.findMany.mockResolvedValue([
        betRow({ status: 'won', settledAt: new Date('2026-07-03T12:00:00.000Z') }),
      ]);

      const [bet] = await service.findBets({ status: 'won' });

      expect(bet.settledAt).toBe('2026-07-03T12:00:00.000Z');
    });
  });
});
