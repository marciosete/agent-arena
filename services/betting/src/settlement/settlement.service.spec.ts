import { SettleResponseSchema, type SettleRequest } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettlementService } from './settlement.service';
import type { PrismaService } from '../prisma/prisma.service';

const WINNER_ACCOUNT = 'a1111111-1111-4111-8111-111111111111';
const OTHER_WINNER_ACCOUNT = 'b2222222-2222-4222-8222-222222222222';
const MARKET_ID = 'r16-1';
const WINNING_SELECTION = 'sel-bra';
const LOSING_SELECTION = 'sel-chi';
const SETTLED_AT_ISO = '2026-07-03T10:00:00.000Z';

function settleRequest(overrides: Partial<SettleRequest> = {}): SettleRequest {
  return {
    settlement: {
      fixtureId: MARKET_ID,
      winnerTeamId: 'BRA',
      homeScore: 2,
      awayScore: 1,
      decidedOnPenalties: false,
      settledAt: SETTLED_AT_ISO,
    },
    winningSelections: [{ marketId: MARKET_ID, selectionId: WINNING_SELECTION }],
    ...overrides,
  };
}

function pendingBet(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'bet-1',
    accountId: WINNER_ACCOUNT,
    marketId: MARKET_ID,
    selectionId: WINNING_SELECTION,
    stake: 100,
    potentialReturn: 155,
    status: 'pending',
    ...overrides,
  };
}

function makeMocks() {
  const tx = {
    bet: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    account: { update: vi.fn() },
    ledgerEntry: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { tx, prisma };
}

describe('SettlementService.settle', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let service: SettlementService;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.tx.bet.findMany.mockResolvedValue([]);
    mocks.tx.bet.update.mockResolvedValue({});
    mocks.tx.bet.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.account.update.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, balance: 10_055 })
    );
    mocks.tx.ledgerEntry.create.mockResolvedValue({});
    service = new SettlementService(mocks.prisma as unknown as PrismaService);
  });

  it('credits each winner potentialReturn, marks the bet won and appends a ledger entry', async () => {
    mocks.tx.bet.findMany.mockResolvedValue([pendingBet()]);

    const response = await service.settle(settleRequest());

    expect(mocks.tx.account.update).toHaveBeenCalledWith({
      where: { id: WINNER_ACCOUNT },
      data: { balance: { increment: 155 } },
    });
    expect(mocks.tx.bet.update).toHaveBeenCalledWith({
      where: { id: 'bet-1' },
      data: { status: 'won', settledAt: new Date(SETTLED_AT_ISO) },
    });
    expect(mocks.tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: WINNER_ACCOUNT,
        delta: 155,
        balanceAfter: 10_055,
        refBetId: 'bet-1',
      }),
    });
    expect(response).toEqual({ settledBets: 1, totalPaidOut: 155 });
  });

  it('marks every other pending bet on a settled market lost — no credit, no ledger entry', async () => {
    mocks.tx.bet.findMany.mockResolvedValue([
      pendingBet({ id: 'loser-1', selectionId: LOSING_SELECTION }),
      pendingBet({ id: 'loser-2', selectionId: LOSING_SELECTION, accountId: OTHER_WINNER_ACCOUNT }),
    ]);

    const response = await service.settle(settleRequest());

    expect(mocks.tx.bet.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['loser-1', 'loser-2'] } },
      data: { status: 'lost', settledAt: new Date(SETTLED_AT_ISO) },
    });
    expect(mocks.tx.account.update).not.toHaveBeenCalled();
    expect(mocks.tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(response).toEqual({ settledBets: 2, totalPaidOut: 0 });
  });

  it('only ever touches PENDING bets on the settled markets (settle-twice is a no-op)', async () => {
    // Second call: settlement already ran, so no pending bets match the query.
    mocks.tx.bet.findMany.mockResolvedValue([]);

    const response = await service.settle(settleRequest());

    expect(mocks.tx.bet.findMany).toHaveBeenCalledWith({
      where: { marketId: { in: [MARKET_ID] }, status: 'pending' },
    });
    expect(mocks.tx.bet.update).not.toHaveBeenCalled();
    expect(mocks.tx.bet.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.account.update).not.toHaveBeenCalled();
    expect(response).toEqual({ settledBets: 0, totalPaidOut: 0 });
  });

  it('settles multiple markets in one call (the final also settles the outright)', async () => {
    const request = settleRequest({
      winningSelections: [
        { marketId: MARKET_ID, selectionId: WINNING_SELECTION },
        { marketId: 'outright', selectionId: 'sel-out-bra' },
      ],
    });
    mocks.tx.bet.findMany.mockResolvedValue([
      pendingBet(),
      pendingBet({
        id: 'bet-2',
        marketId: 'outright',
        selectionId: 'sel-out-bra',
        potentialReturn: 700,
      }),
      pendingBet({ id: 'bet-3', marketId: 'outright', selectionId: 'sel-out-arg' }),
    ]);

    const response = await service.settle(request);

    expect(mocks.tx.bet.findMany).toHaveBeenCalledWith({
      where: { marketId: { in: [MARKET_ID, 'outright'] }, status: 'pending' },
    });
    expect(response).toEqual({ settledBets: 3, totalPaidOut: 855 });
    expect(() => SettleResponseSchema.parse(response)).not.toThrow();
  });

  it('runs the whole settlement in ONE $transaction (all-or-nothing money)', async () => {
    mocks.tx.bet.findMany.mockResolvedValue([pendingBet()]);

    await service.settle(settleRequest());

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('propagates a mid-settlement failure so the transaction rolls back', async () => {
    mocks.tx.bet.findMany.mockResolvedValue([pendingBet()]);
    mocks.tx.ledgerEntry.create.mockRejectedValue(new Error('ledger write failed'));

    await expect(service.settle(settleRequest())).rejects.toThrow('ledger write failed');
  });

  it('rounds the total paid out to cents', async () => {
    mocks.tx.bet.findMany.mockResolvedValue([
      pendingBet({ potentialReturn: 0.1 }),
      pendingBet({ id: 'bet-2', potentialReturn: 0.2 }),
    ]);

    const response = await service.settle(settleRequest());

    expect(response.totalPaidOut).toBe(0.3);
  });
});
