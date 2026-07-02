import { Injectable } from '@nestjs/common';
import type { Market, SettlementEvent } from '@arena/contracts';
import type {
  Market as MarketRow,
  Prisma,
  Selection as SelectionRow,
  Settlement as SettlementRow,
} from '../../generated/client';
import type { PricedMarket } from '../domain/market-builder';
import { OUTRIGHT_MARKET_ID } from '../domain/market-builder';
import { PrismaService } from '../prisma/prisma.service';

/** Selections favourite-first with a deterministic tiebreak — the order UIs render. */
const INCLUDE_SELECTIONS = {
  selections: { orderBy: [{ price: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.MarketInclude;

function toContractMarket(row: MarketRow & { selections: SelectionRow[] }): Market {
  return {
    id: row.id,
    type: row.type,
    fixtureId: row.fixtureId,
    name: row.name,
    status: row.status,
    selections: row.selections.map((selection) => ({
      id: selection.id,
      name: selection.name,
      price: selection.price,
      probability: selection.probability,
    })),
  };
}

function toContractSettlement(row: SettlementRow): SettlementEvent {
  return {
    fixtureId: row.fixtureId,
    winnerTeamId: row.winnerTeamId,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    decidedOnPenalties: row.decidedOnPenalties,
    settledAt: row.settledAt.toISOString(),
  };
}

/**
 * The service's only Prisma surface: markets/selections mapped to the contract
 * shape, and settlements recorded + replayed as events.
 */
@Injectable()
export class MarketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Market[]> {
    const rows = await this.prisma.market.findMany({
      include: INCLUDE_SELECTIONS,
      orderBy: { id: 'asc' },
    });
    return rows.map(toContractMarket);
  }

  async findByFixtureId(fixtureId: string): Promise<Market | null> {
    const row = await this.prisma.market.findUnique({
      where: { fixtureId },
      include: INCLUDE_SELECTIONS,
    });
    return row ? toContractMarket(row) : null;
  }

  async findOutright(): Promise<Market | null> {
    const row = await this.prisma.market.findUnique({
      where: { id: OUTRIGHT_MARKET_ID },
      include: INCLUDE_SELECTIONS,
    });
    return row ? toContractMarket(row) : null;
  }

  /**
   * Recorded settlements, oldest first (fixtureId breaks same-millisecond
   * timestamp ties deterministically; replay itself is order-insensitive).
   */
  async listSettlements(): Promise<SettlementEvent[]> {
    const rows = await this.prisma.settlement.findMany({
      orderBy: [{ appliedAt: 'asc' }, { fixtureId: 'asc' }],
    });
    return rows.map(toContractSettlement);
  }

  /**
   * Persist one reprice atomically: upsert every market and its selections
   * (pruning selections that dropped off, e.g. eliminated outright teams) and
   * record the settlement event. `settlement` is null for the boot-time seed.
   */
  async saveReprice(settlement: SettlementEvent | null, markets: PricedMarket[]): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = markets.flatMap((market) =>
      this.marketOperations(market)
    );
    if (settlement) {
      operations.push(
        this.prisma.settlement.upsert({
          where: { fixtureId: settlement.fixtureId },
          create: { ...settlement, settledAt: new Date(settlement.settledAt) },
          update: {},
        })
      );
    }
    await this.prisma.$transaction(operations);
  }

  private marketOperations(market: PricedMarket): Prisma.PrismaPromise<unknown>[] {
    return [
      this.prisma.market.upsert({
        where: { id: market.id },
        create: {
          id: market.id,
          type: market.type,
          fixtureId: market.fixtureId,
          name: market.name,
          status: market.status,
        },
        update: { name: market.name, status: market.status },
      }),
      this.prisma.selection.deleteMany({
        where: { marketId: market.id, id: { notIn: market.selections.map((s) => s.id) } },
      }),
      ...market.selections.map((selection) =>
        this.prisma.selection.upsert({
          where: { id: selection.id },
          create: {
            id: selection.id,
            marketId: market.id,
            name: selection.name,
            price: selection.price,
            probability: selection.probability,
          },
          update: {
            name: selection.name,
            price: selection.price,
            probability: selection.probability,
          },
        })
      ),
    ];
  }
}
