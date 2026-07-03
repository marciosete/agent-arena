import { describe, expect, it, vi } from 'vitest';
import { buildMatchWinnerMarket } from '../domain/market-builder';
import { requireTeam } from '../domain/teams';
import type { PrismaService } from '../prisma/prisma.service';
import { makeSettlement } from '../testing/settlement';
import { PrismaMarketsRepository } from './markets.repository';

const R16_2 = 'R16-2';
const R32_9 = 'R32-9';
const OP_MARKET_UPSERT = 'market.upsert';
const OP_SELECTION_DELETE = 'selection.deleteMany';
const OP_SELECTION_CREATE = 'selection.createMany';
const OP_FIXTURE_UPDATE = 'fixtureState.updateMany';
const OP_MARKET_UPDATE = 'market.update';
const OP_EVENT_CREATE = 'repriceEvent.create';
const OP_MARKET_DELETE = 'market.deleteMany';
const OP_EVENT_DELETE = 'repriceEvent.deleteMany';
const OP_FIXTURE_DELETE = 'fixtureState.deleteMany';

interface RecordedOp {
  op: string;
  args: never;
}

function createPrismaMock() {
  const record = (op: string) => vi.fn((args: unknown) => ({ op, args }) as RecordedOp);
  return {
    market: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: record(OP_MARKET_UPSERT),
      update: record(OP_MARKET_UPDATE),
      updateMany: vi.fn(),
      deleteMany: record(OP_MARKET_DELETE),
    },
    selection: {
      deleteMany: record(OP_SELECTION_DELETE),
      createMany: record(OP_SELECTION_CREATE),
    },
    fixtureState: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: record(OP_FIXTURE_UPDATE),
      deleteMany: record(OP_FIXTURE_DELETE),
    },
    repriceEvent: { create: record(OP_EVENT_CREATE), deleteMany: record(OP_EVENT_DELETE) },
    $transaction: vi.fn((ops: RecordedOp[]) => Promise.resolve(ops)),
  };
}

function createRepository() {
  const prisma = createPrismaMock();
  const repository = new PrismaMarketsRepository(prisma as unknown as PrismaService);
  return { prisma, repository };
}

function demoMarket() {
  return buildMatchWinnerMarket(R16_2, requireTeam('PAR'), requireTeam('FRA'));
}

const marketRow = {
  id: R16_2,
  type: 'MATCH_WINNER',
  fixtureId: R16_2,
  name: 'Paraguay v France',
  status: 'open',
  selections: [
    {
      id: `${R16_2}:FRA`,
      marketId: R16_2,
      teamId: 'FRA',
      name: 'France',
      price: 1.08,
      probability: 0.8823,
    },
  ],
};

describe('PrismaMarketsRepository reads', () => {
  it('maps market rows through the contract enums', async () => {
    const { prisma, repository } = createRepository();
    prisma.market.findMany.mockResolvedValue([marketRow]);
    const markets = await repository.findAllMarkets();
    expect(markets).toHaveLength(1);
    expect(markets[0]?.type).toBe('MATCH_WINNER');
    expect(markets[0]?.selections[0]?.teamId).toBe('FRA');
  });

  it('rejects rows with a status outside the contract enum', async () => {
    const { prisma, repository } = createRepository();
    prisma.market.findMany.mockResolvedValue([{ ...marketRow, status: 'bogus' }]);
    await expect(repository.findAllMarkets()).rejects.toThrow();
  });

  it('finds one market by id, passing null through', async () => {
    const { prisma, repository } = createRepository();
    prisma.market.findUnique.mockResolvedValue(null);
    expect(await repository.findMarketById(R16_2)).toBeNull();
    prisma.market.findUnique.mockResolvedValue(marketRow);
    const market = await repository.findMarketById(R16_2);
    expect(market?.id).toBe(R16_2);
    expect(prisma.market.findUnique).toHaveBeenCalledWith({
      where: { id: R16_2 },
      include: { selections: true },
    });
  });

  it('builds the bracket state map from fixture rows', async () => {
    const { prisma, repository } = createRepository();
    prisma.fixtureState.findMany.mockResolvedValue([
      {
        id: R32_9,
        homeTeamId: 'POR',
        awayTeamId: 'CRO',
        winnerTeamId: null,
        updatedAt: new Date(),
      },
    ]);
    const state = await repository.getBracketState();
    expect(state.get(R32_9)).toEqual({ homeTeamId: 'POR', awayTeamId: 'CRO', winnerTeamId: null });
  });
});

describe('PrismaMarketsRepository writes', () => {
  it('seeds fixture states create-only (skipDuplicates)', async () => {
    const { prisma, repository } = createRepository();
    const rows = [{ id: R32_9, homeTeamId: 'POR', awayTeamId: 'CRO', winnerTeamId: null }];
    await repository.createFixtureStatesIfMissing(rows);
    expect(prisma.fixtureState.createMany).toHaveBeenCalledWith({
      data: rows,
      skipDuplicates: true,
    });
  });

  it('applies fixture patches transactionally with the winner guard', async () => {
    const { prisma, repository } = createRepository();
    await repository.applyFixturePatches([
      { id: R32_9, set: { winnerTeamId: 'POR' } },
      { id: 'R16-5', set: { awayTeamId: 'ESP' } },
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.fixtureState.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: R32_9, winnerTeamId: null },
      data: { winnerTeamId: 'POR' },
    });
    expect(prisma.fixtureState.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'R16-5' },
      data: { awayTeamId: 'ESP' },
    });
  });

  it('settles markets by id in one updateMany', async () => {
    const { prisma, repository } = createRepository();
    await repository.settleMarkets([R32_9, 'R32-10']);
    expect(prisma.market.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [R32_9, 'R32-10'] } },
      data: { status: 'settled' },
    });
  });

  it('clears every row in one transaction, selections before markets (FK order)', async () => {
    const { prisma, repository } = createRepository();
    await repository.clearAll();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0]?.[0] as RecordedOp[];
    expect(ops.map((operation) => operation.op)).toEqual([
      OP_SELECTION_DELETE,
      OP_MARKET_DELETE,
      OP_EVENT_DELETE,
      OP_FIXTURE_DELETE,
    ]);
    expect(prisma.selection.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.market.deleteMany).toHaveBeenCalledOnce();
  });

  it('upserts a market then replaces its selection set, in one transaction', async () => {
    const { prisma, repository } = createRepository();
    await repository.upsertMarkets([demoMarket()]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0]?.[0] as RecordedOp[];
    expect(ops.map((operation) => operation.op)).toEqual([
      OP_MARKET_UPSERT,
      OP_SELECTION_DELETE,
      OP_SELECTION_CREATE,
    ]);
    expect(prisma.selection.deleteMany).toHaveBeenCalledWith({ where: { marketId: R16_2 } });
    const createArgs = prisma.selection.createMany.mock.calls[0]?.[0] as {
      data: Array<{ marketId: string; teamId: string }>;
    };
    expect(createArgs.data).toHaveLength(2);
    expect(createArgs.data[0]?.marketId).toBe(R16_2);
  });

  it('applies a reprice atomically: fixtures, markets, settles, then the event', async () => {
    const { prisma, repository } = createRepository();
    const event = makeSettlement(R32_9, 'POR');
    await repository.applyReprice({
      fixtureStates: [
        { id: R32_9, set: { winnerTeamId: 'POR' } },
        { id: 'R16-5', set: { homeTeamId: 'POR' } },
      ],
      upsertMarkets: [demoMarket()],
      settleMarketIds: [R32_9],
      event,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0]?.[0] as RecordedOp[];
    expect(ops.map((operation) => operation.op)).toEqual([
      OP_FIXTURE_UPDATE,
      OP_FIXTURE_UPDATE,
      OP_MARKET_UPSERT,
      OP_SELECTION_DELETE,
      OP_SELECTION_CREATE,
      OP_MARKET_UPDATE,
      OP_EVENT_CREATE,
    ]);
    // A winner write is guarded on the winner still being unset…
    expect(prisma.fixtureState.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: R32_9, winnerTeamId: null },
      data: { winnerTeamId: 'POR' },
    });
    // …while a slot fill touches only its own column.
    expect(prisma.fixtureState.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'R16-5' },
      data: { homeTeamId: 'POR' },
    });
    expect(prisma.market.update).toHaveBeenCalledWith({
      where: { id: R32_9 },
      data: { status: 'settled' },
    });
    expect(prisma.repriceEvent.create).toHaveBeenCalledWith({
      data: { fixtureId: R32_9, winnerTeamId: 'POR', payload: event },
    });
  });
});
