import { describe, expect, it, vi } from 'vitest';
import type { PricedMarket } from '../domain/market-builder';
import { MarketsRepository } from './markets.repository';
import type { PrismaService } from '../prisma/prisma.service';

const R16_2 = 'R16-2';
const NOW = new Date('2026-07-04T23:00:00.000Z');
const MARKET_NAME = 'Paraguay v France';

const marketRow = {
  id: R16_2,
  type: 'MATCH_WINNER' as const,
  fixtureId: R16_2,
  name: MARKET_NAME,
  status: 'open' as const,
  updatedAt: NOW,
  selections: [
    { id: 'R16-2:FRA', marketId: R16_2, name: 'France', price: 1.08, probability: 0.88 },
    { id: 'R16-2:PAR', marketId: R16_2, name: 'Paraguay', price: 8.09, probability: 0.12 },
  ],
};

const contractMarket = {
  id: R16_2,
  type: 'MATCH_WINNER',
  fixtureId: R16_2,
  name: MARKET_NAME,
  status: 'open',
  selections: [
    { id: 'R16-2:FRA', name: 'France', price: 1.08, probability: 0.88 },
    { id: 'R16-2:PAR', name: 'Paraguay', price: 8.09, probability: 0.12 },
  ],
};

function prismaMock() {
  return {
    market: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn((args: unknown) => ({ op: 'market.upsert', args })),
    },
    selection: {
      deleteMany: vi.fn((args: unknown) => ({ op: 'selection.deleteMany', args })),
      upsert: vi.fn((args: unknown) => ({ op: 'selection.upsert', args })),
    },
    settlement: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn((args: unknown) => ({ op: 'settlement.upsert', args })),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

function build() {
  const prisma = prismaMock();
  return { prisma, repository: new MarketsRepository(prisma as unknown as PrismaService) };
}

describe('MarketsRepository', () => {
  it('maps market rows to the contract shape, selections favourite-first', async () => {
    const { prisma, repository } = build();
    prisma.market.findMany.mockResolvedValue([marketRow]);
    expect(await repository.findAll()).toEqual([contractMarket]);
    expect(prisma.market.findMany).toHaveBeenCalledWith({
      include: { selections: { orderBy: [{ price: 'asc' }, { id: 'asc' }] } },
      orderBy: { id: 'asc' },
    });
  });

  it('finds one market by its fixture id', async () => {
    const { prisma, repository } = build();
    prisma.market.findUnique.mockResolvedValue(marketRow);
    expect(await repository.findByFixtureId(R16_2)).toEqual(contractMarket);
    expect(prisma.market.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fixtureId: R16_2 } })
    );
  });

  it('returns null for a fixture without a market', async () => {
    const { repository } = build();
    expect(await repository.findByFixtureId('XX-99')).toBeNull();
  });

  it('finds the outright by its fixed id', async () => {
    const { prisma, repository } = build();
    expect(await repository.findOutright()).toBeNull();
    expect(prisma.market.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'outright' } })
    );
  });

  it('lists settlements in applied order with ISO timestamps', async () => {
    const { prisma, repository } = build();
    prisma.settlement.findMany.mockResolvedValue([
      {
        fixtureId: R16_2,
        winnerTeamId: 'FRA',
        homeScore: 2,
        awayScore: 0,
        decidedOnPenalties: false,
        settledAt: NOW,
        appliedAt: NOW,
      },
    ]);
    expect(await repository.listSettlements()).toEqual([
      {
        fixtureId: R16_2,
        winnerTeamId: 'FRA',
        homeScore: 2,
        awayScore: 0,
        decidedOnPenalties: false,
        settledAt: NOW.toISOString(),
      },
    ]);
    expect(prisma.settlement.findMany).toHaveBeenCalledWith({ orderBy: { appliedAt: 'asc' } });
  });

  it('persists a reprice atomically: market + selections upserts, pruning, settlement event', async () => {
    const { prisma, repository } = build();
    const market = contractMarket as PricedMarket;
    const settlement = {
      fixtureId: R16_2,
      winnerTeamId: 'FRA',
      homeScore: 2,
      awayScore: 0,
      decidedOnPenalties: false,
      settledAt: NOW.toISOString(),
    };

    await repository.saveReprice(settlement, [market]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const operations = prisma.$transaction.mock.calls[0][0] as { op: string }[];
    expect(operations.map((operation) => operation.op)).toEqual([
      'market.upsert',
      'selection.deleteMany',
      'selection.upsert',
      'selection.upsert',
      'settlement.upsert',
    ]);
    expect(prisma.market.upsert).toHaveBeenCalledWith({
      where: { id: R16_2 },
      create: {
        id: R16_2,
        type: 'MATCH_WINNER',
        fixtureId: R16_2,
        name: MARKET_NAME,
        status: 'open',
      },
      update: { name: MARKET_NAME, status: 'open' },
    });
    expect(prisma.selection.deleteMany).toHaveBeenCalledWith({
      where: { marketId: R16_2, id: { notIn: ['R16-2:FRA', 'R16-2:PAR'] } },
    });
    expect(prisma.selection.upsert).toHaveBeenCalledWith({
      where: { id: 'R16-2:FRA' },
      create: { id: 'R16-2:FRA', marketId: R16_2, name: 'France', price: 1.08, probability: 0.88 },
      update: { name: 'France', price: 1.08, probability: 0.88 },
    });
    expect(prisma.settlement.upsert).toHaveBeenCalledWith({
      where: { fixtureId: R16_2 },
      create: { ...settlement, settledAt: NOW },
      update: {},
    });
  });

  it('records no settlement event for the boot-time seed', async () => {
    const { prisma, repository } = build();
    await repository.saveReprice(null, [contractMarket as PricedMarket]);
    const operations = prisma.$transaction.mock.calls[0][0] as { op: string }[];
    expect(operations).toHaveLength(4);
    expect(prisma.settlement.upsert).not.toHaveBeenCalled();
  });
});
