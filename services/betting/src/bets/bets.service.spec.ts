import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BetSchema, type Market, type PlaceBetRequest } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BetsService } from './bets.service';
import type { PricingClient } from '../pricing/pricing-client';
import type { PrismaService } from '../prisma/prisma.service';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = 'b2222222-2222-4222-8222-222222222222';
const BET_ID = 'd4444444-4444-4444-8444-444444444444';
const IDEMPOTENCY_KEY = 'c3333333-3333-4333-8333-333333333333';
const MARKET_ID = 'r16-1';
const MARKET_NAME = 'Brazil v Chile — Match Winner';
const SELECTION_ID = 'sel-bra';
const PLACED_AT_ISO = '2026-07-03T09:00:00.000Z';

const OPEN_MARKET: Market = {
  id: MARKET_ID,
  type: 'MATCH_WINNER',
  fixtureId: MARKET_ID,
  name: MARKET_NAME,
  status: 'open',
  selections: [
    { id: SELECTION_ID, name: 'Brazil', price: 1.55 },
    { id: 'sel-chi', name: 'Chile', price: 2.4 },
  ],
};

function placeRequest(overrides: Partial<PlaceBetRequest> = {}): PlaceBetRequest {
  return {
    marketId: MARKET_ID,
    selectionId: SELECTION_ID,
    stake: 100,
    acceptedPrice: 1.55,
    idempotencyKey: IDEMPOTENCY_KEY,
    ...overrides,
  };
}

function betRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: BET_ID,
    accountId: ACCOUNT_ID,
    marketId: MARKET_ID,
    marketName: MARKET_NAME,
    selectionId: SELECTION_ID,
    stake: 100,
    price: 1.55,
    potentialReturn: 155,
    status: 'pending',
    placedAt: new Date(PLACED_AT_ISO),
    settledAt: null,
    idempotencyKey: IDEMPOTENCY_KEY,
    ...overrides,
  };
}

function makeMocks() {
  const tx = {
    account: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    bet: { create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    ledgerEntry: { create: vi.fn() },
  };
  const prisma = {
    bet: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const pricing = { fetchMarket: vi.fn() };
  return { tx, prisma, pricing };
}

describe('BetsService.placeBet', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let service: BetsService;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.prisma.bet.findUnique.mockResolvedValue(null);
    mocks.pricing.fetchMarket.mockResolvedValue(OPEN_MARKET);
    mocks.tx.account.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.account.update.mockResolvedValue({ id: ACCOUNT_ID, balance: 10_000 });
    mocks.tx.account.findUniqueOrThrow.mockResolvedValue({ id: ACCOUNT_ID, balance: 9_900 });
    mocks.tx.bet.create.mockResolvedValue(betRow());
    mocks.tx.bet.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.bet.findUniqueOrThrow.mockResolvedValue(betRow());
    mocks.tx.ledgerEntry.create.mockResolvedValue({});
    service = new BetsService(
      mocks.prisma as unknown as PrismaService,
      mocks.pricing as unknown as PricingClient
    );
  });

  it('debits the wallet, inserts the pending bet and appends a ledger entry in ONE $transaction', async () => {
    const bet = await service.placeBet(ACCOUNT_ID, placeRequest());

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    // Guarded atomic debit: the WHERE carries the funds check, so a concurrent
    // double-spend loses the race in the database, not in application code.
    expect(mocks.tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID, balance: { gte: 100 } },
      data: { balance: { decrement: 100 } },
    });
    expect(mocks.tx.bet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: ACCOUNT_ID,
        marketId: MARKET_ID,
        marketName: MARKET_NAME,
        selectionId: SELECTION_ID,
        stake: 100,
        price: 1.55,
        potentialReturn: 155,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    });
    expect(mocks.tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: ACCOUNT_ID,
        delta: -100,
        balanceAfter: 9_900,
        refBetId: BET_ID,
      }),
    });
    expect(() => BetSchema.parse(bet)).not.toThrow();
    expect(bet.status).toBe('pending');
    expect(bet.placedAt).toBe(PLACED_AT_ISO);
  });

  it('locks the LIVE price, not the accepted one, and computes potentialReturn from it', async () => {
    // Live 1.5 vs accepted 1.55 — inside the 5% band, so the bet stands at 1.5.
    mocks.pricing.fetchMarket.mockResolvedValue({
      ...OPEN_MARKET,
      selections: [{ id: SELECTION_ID, name: 'Brazil', price: 1.5 }, OPEN_MARKET.selections[1]],
    });

    await service.placeBet(ACCOUNT_ID, placeRequest());

    expect(mocks.tx.bet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ price: 1.5, potentialReturn: 150 }),
    });
  });

  it('returns the ORIGINAL bet on a replayed idempotency key without debiting again', async () => {
    mocks.prisma.bet.findUnique.mockResolvedValue(betRow());

    const bet = await service.placeBet(ACCOUNT_ID, placeRequest());

    expect(bet.id).toBe(BET_ID);
    expect(mocks.pricing.fetchMarket).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('survives the replay RACE: a P2002 unique violation resolves to the original bet', async () => {
    mocks.tx.bet.create.mockRejectedValue({ code: 'P2002', meta: { target: ['idempotencyKey'] } });
    mocks.prisma.bet.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(betRow());

    const bet = await service.placeBet(ACCOUNT_ID, placeRequest());

    expect(bet.id).toBe(BET_ID);
    expect(mocks.prisma.bet.findUnique).toHaveBeenLastCalledWith({
      where: { idempotencyKey: IDEMPOTENCY_KEY },
    });
  });

  it('rejects a replayed key that belongs to ANOTHER account with 409 (no cross-account reads)', async () => {
    mocks.prisma.bet.findUnique.mockResolvedValue(betRow({ accountId: OTHER_ACCOUNT_ID }));

    await expect(service.placeBet(ACCOUNT_ID, placeRequest())).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('rejects stake > balance with 400 and never writes the bet or ledger', async () => {
    mocks.tx.account.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.account.findUnique.mockResolvedValue({ id: ACCOUNT_ID, balance: 50 });

    await expect(service.placeBet(ACCOUNT_ID, placeRequest())).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(mocks.tx.bet.create).not.toHaveBeenCalled();
    expect(mocks.tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('rejects a token whose account no longer exists with 401', async () => {
    mocks.tx.account.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.account.findUnique.mockResolvedValue(null);

    await expect(service.placeBet(ACCOUNT_ID, placeRequest())).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('rejects with 409 when the market is not open (settled/suspended)', async () => {
    mocks.pricing.fetchMarket.mockResolvedValue({ ...OPEN_MARKET, status: 'settled' });

    await expect(service.placeBet(ACCOUNT_ID, placeRequest())).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects with 409 when the live price moved beyond the 5% tolerance', async () => {
    // Accepted 1.55 but live 1.70 — a 9.7% move; the punter must re-accept.
    mocks.pricing.fetchMarket.mockResolvedValue({
      ...OPEN_MARKET,
      selections: [{ id: SELECTION_ID, name: 'Brazil', price: 1.7 }, OPEN_MARKET.selections[1]],
    });

    await expect(service.placeBet(ACCOUNT_ID, placeRequest())).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown selection id with 404', async () => {
    await expect(
      service.placeBet(ACCOUNT_ID, placeRequest({ selectionId: 'sel-nope' }))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects with 404 when pricing returns a DIFFERENT market than requested', async () => {
    mocks.pricing.fetchMarket.mockResolvedValue({ ...OPEN_MARKET, id: 'qf-9', fixtureId: 'qf-9' });

    await expect(service.placeBet(ACCOUNT_ID, placeRequest())).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates a failure inside the transaction so the whole placement rolls back', async () => {
    mocks.tx.ledgerEntry.create.mockRejectedValue(new Error('ledger write failed'));

    await expect(service.placeBet(ACCOUNT_ID, placeRequest())).rejects.toThrow(
      'ledger write failed'
    );
  });

  it('rejects a sub-cent stake with 400 BEFORE any pricing call or debit', async () => {
    await expect(service.placeBet(ACCOUNT_ID, placeRequest({ stake: 0.004 }))).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(mocks.pricing.fetchMarket).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('quantises the stake to cents so debit, bet and ledger carry the same number', async () => {
    await service.placeBet(ACCOUNT_ID, placeRequest({ stake: 10.106 }));

    expect(mocks.tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID, balance: { gte: 10.11 } },
      data: { balance: { decrement: 10.11 } },
    });
    expect(mocks.tx.bet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stake: 10.11 }),
    });
    expect(mocks.tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delta: -10.11 }),
    });
  });

  it('snaps a drifted wallet balance back to cents inside the placement transaction', async () => {
    mocks.tx.account.findUniqueOrThrow.mockResolvedValue({
      id: ACCOUNT_ID,
      balance: 9_899.900000000001,
    });

    await service.placeBet(ACCOUNT_ID, placeRequest());

    expect(mocks.tx.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { balance: 9_899.9 },
    });
    expect(mocks.tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ balanceAfter: 9_899.9 }),
    });
  });

  it('rejects a replayed key whose payload differs from the original bet (409)', async () => {
    mocks.prisma.bet.findUnique.mockResolvedValue(betRow());

    await expect(
      service.placeBet(ACCOUNT_ID, placeRequest({ selectionId: 'sel-chi', stake: 250 }))
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('voids and refunds a bet whose market settled between the price check and the commit', async () => {
    // The window: open at validation time, settled by the post-commit re-check.
    mocks.pricing.fetchMarket
      .mockResolvedValueOnce(OPEN_MARKET)
      .mockResolvedValueOnce({ ...OPEN_MARKET, status: 'settled' });
    mocks.tx.bet.findUniqueOrThrow.mockResolvedValue(
      betRow({ status: 'void', settledAt: new Date(PLACED_AT_ISO) })
    );

    const bet = await service.placeBet(ACCOUNT_ID, placeRequest());

    expect(mocks.tx.bet.updateMany).toHaveBeenCalledWith({
      where: { id: BET_ID, status: 'pending' },
      data: { status: 'void', settledAt: expect.any(Date) },
    });
    expect(mocks.tx.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { balance: { increment: 100 } },
    });
    expect(mocks.tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delta: 100, reason: 'bet-voided', refBetId: BET_ID }),
    });
    expect(bet.status).toBe('void');
  });

  it('does NOT refund when settlement already resolved the bet (guarded void claim)', async () => {
    mocks.pricing.fetchMarket
      .mockResolvedValueOnce(OPEN_MARKET)
      .mockResolvedValueOnce({ ...OPEN_MARKET, status: 'settled' });
    mocks.tx.bet.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.bet.findUniqueOrThrow.mockResolvedValue(
      betRow({ status: 'won', settledAt: new Date(PLACED_AT_ISO) })
    );

    const bet = await service.placeBet(ACCOUNT_ID, placeRequest());

    expect(mocks.tx.account.update).not.toHaveBeenCalled();
    expect(bet.status).toBe('won');
  });

  it('leaves the bet pending when the post-commit market re-check fails (settlement stays authoritative)', async () => {
    mocks.pricing.fetchMarket
      .mockResolvedValueOnce(OPEN_MARKET)
      .mockRejectedValueOnce(new Error('pricing unavailable'));

    const bet = await service.placeBet(ACCOUNT_ID, placeRequest());

    expect(bet.status).toBe('pending');
    expect(mocks.tx.bet.updateMany).not.toHaveBeenCalled();
  });
});

describe('BetsService.findBets', () => {
  it('filters by accountId and status and maps rows to the contract shape', async () => {
    const mocks = makeMocks();
    mocks.prisma.bet.findMany.mockResolvedValue([
      betRow(),
      betRow({
        id: 'e5555555-5555-4555-8555-555555555555',
        status: 'won',
        settledAt: new Date(PLACED_AT_ISO),
      }),
    ]);
    const service = new BetsService(
      mocks.prisma as unknown as PrismaService,
      mocks.pricing as unknown as PricingClient
    );

    const bets = await service.findBets({ accountId: ACCOUNT_ID, status: 'pending' });

    expect(mocks.prisma.bet.findMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID, status: 'pending' },
      orderBy: { placedAt: 'desc' },
    });
    expect(bets).toHaveLength(2);
    for (const bet of bets) {
      expect(() => BetSchema.parse(bet)).not.toThrow();
    }
    expect(bets[1].settledAt).toBe(PLACED_AT_ISO);
  });

  it('returns everything when the query has no filters', async () => {
    const mocks = makeMocks();
    mocks.prisma.bet.findMany.mockResolvedValue([]);
    const service = new BetsService(
      mocks.prisma as unknown as PrismaService,
      mocks.pricing as unknown as PricingClient
    );

    await expect(service.findBets({})).resolves.toEqual([]);
    expect(mocks.prisma.bet.findMany).toHaveBeenCalledWith({
      where: { accountId: undefined, status: undefined },
      orderBy: { placedAt: 'desc' },
    });
  });
});
