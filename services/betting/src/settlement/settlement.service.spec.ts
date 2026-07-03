import type { SettleRequest } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { SettlementService } from './settlement.service';

const MARKET_ID = 'qf-1';
const WINNING_SELECTION = 'sel-bra';
const SETTLED_AT = '2026-07-03T18:00:00.000Z';

const SETTLE_REQUEST: SettleRequest = {
  settlement: {
    fixtureId: MARKET_ID,
    winnerTeamId: 'BRA',
    homeScore: 2,
    awayScore: 1,
    decidedOnPenalties: false,
    settledAt: SETTLED_AT,
  },
  winningSelections: [{ marketId: MARKET_ID, selectionId: WINNING_SELECTION }],
};

let nextBet = 0;
function pendingBet(overrides: Partial<Record<string, unknown>> = {}) {
  nextBet += 1;
  return {
    id: `bet-${nextBet}`,
    accountId: `acc-${nextBet}`,
    marketId: MARKET_ID,
    selectionId: WINNING_SELECTION,
    stake: 100,
    potentialReturn: 250,
    status: 'pending',
    ...overrides,
  };
}

describe('SettlementService', () => {
  let tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    bet: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    ledgerEntry: { create: ReturnType<typeof vi.fn> };
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: SettlementService;

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ balance: 10_250 }]),
      bet: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ledgerEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx)
      ),
    };
    service = new SettlementService(prisma as unknown as PrismaService);
  });

  it('credits winners their potentialReturn, appends ledger rows and marks losers lost — transactionally', async () => {
    const winner = pendingBet();
    const loser = pendingBet({ selectionId: 'sel-arg' });
    tx.bet.findMany.mockResolvedValueOnce([winner, loser]);

    const response = await service.settle(SETTLE_REQUEST);

    expect(response).toEqual({ settledBets: 2, totalPaidOut: 250 });
    // pass 1 settles everything; pass 2 sweeps, finds nothing pending, stops
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    // only pending bets are considered at all
    expect(tx.bet.findMany).toHaveBeenCalledWith({
      where: { marketId: { in: [MARKET_ID] }, status: 'pending' },
    });
    // winner flipped pending → won with the settlement timestamp
    expect(tx.bet.updateMany).toHaveBeenCalledWith({
      where: { id: winner.id, status: 'pending' },
      data: { status: 'won', settledAt: new Date(SETTLED_AT) },
    });
    // loser flipped pending → lost; no money moves for losers
    expect(tx.bet.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [loser.id] }, status: 'pending' },
      data: { status: 'lost', settledAt: new Date(SETTLED_AT) },
    });
    // the win credit is reconciled in the append-only ledger
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: {
        accountId: winner.accountId,
        delta: 250,
        balanceAfter: 10_250,
        reason: 'bet-won',
        refBetId: winner.id,
      },
    });
  });

  it('is a no-op when called twice: nothing pending → zero settled, zero paid, no wallet writes', async () => {
    tx.bet.findMany.mockResolvedValue([]);

    const response = await service.settle(SETTLE_REQUEST);

    expect(response).toEqual({ settledBets: 0, totalPaidOut: 0 });
    expect(tx.bet.updateMany).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('never pays a bet a racing settlement already flipped (updateMany matched nothing)', async () => {
    tx.bet.findMany.mockResolvedValueOnce([pendingBet()]);
    tx.bet.updateMany.mockResolvedValue({ count: 0 });

    const response = await service.settle(SETTLE_REQUEST);

    expect(response).toEqual({ settledBets: 0, totalPaidOut: 0 });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('settles several markets in one call (the final also settles the outright)', async () => {
    const matchWinner = pendingBet({ potentialReturn: 250 });
    const outrightWinner = pendingBet({
      marketId: 'outright',
      selectionId: 'sel-champion',
      potentialReturn: 1000,
    });
    tx.bet.findMany.mockResolvedValueOnce([matchWinner, outrightWinner]);

    const response = await service.settle({
      ...SETTLE_REQUEST,
      winningSelections: [
        { marketId: MARKET_ID, selectionId: WINNING_SELECTION },
        { marketId: 'outright', selectionId: 'sel-champion' },
      ],
    });

    expect(response).toEqual({ settledBets: 2, totalPaidOut: 1250 });
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(2);
  });

  it('rounds the total paid out to cents', async () => {
    tx.bet.findMany.mockResolvedValueOnce([
      pendingBet({ potentialReturn: 0.1 }),
      pendingBet({ potentialReturn: 0.2 }),
    ]);

    const response = await service.settle(SETTLE_REQUEST);

    expect(response.totalPaidOut).toBe(0.3);
  });

  it('sweeps a straggler bet whose placement committed after the first snapshot', async () => {
    const early = pendingBet();
    const straggler = pendingBet();
    tx.bet.findMany.mockResolvedValueOnce([early]).mockResolvedValueOnce([straggler]);

    const response = await service.settle(SETTLE_REQUEST);

    // pass 1 pays the early bet, pass 2 catches the straggler, pass 3 confirms clean
    expect(response).toEqual({ settledBets: 2, totalPaidOut: 500 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(2);
  });

  it('gives the payout loop a finale-sized transaction budget (not the 5s default)', async () => {
    tx.bet.findMany.mockResolvedValueOnce([pendingBet()]);

    await service.settle(SETTLE_REQUEST);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5000,
      timeout: 30_000,
    });
  });

  it("aborts the whole transaction when a winner's account row is missing — the ledger must never lie", async () => {
    tx.bet.findMany.mockResolvedValueOnce([pendingBet()]);
    tx.$queryRaw.mockResolvedValue([]); // credit UPDATE matched no account row

    await expect(service.settle(SETTLE_REQUEST)).rejects.toThrow(
      /missing while crediting a won bet/
    );
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('answers zeros for an empty winningSelections list without opening a transaction', async () => {
    const response = await service.settle({ ...SETTLE_REQUEST, winningSelections: [] });

    expect(response).toEqual({ settledBets: 0, totalPaidOut: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
