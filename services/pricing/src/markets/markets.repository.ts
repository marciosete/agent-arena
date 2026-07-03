import { Injectable } from '@nestjs/common';
import { MarketStatusSchema, MarketTypeSchema, type SettlementEvent } from '@arena/contracts';
import type { FixtureSlots } from '../domain/bracket';
import type { PricedMarket, PricedSelection } from '../domain/market-builder';
import { PrismaService } from '../prisma/prisma.service';

export interface FixtureStateRow extends FixtureSlots {
  id: string;
}

/**
 * A targeted fixture-state write: only the fields this settlement owns (the
 * settled fixture's winner, the downstream fixture's one slot), so sibling
 * reprices feeding the same downstream fixture can never clobber each other.
 */
export interface FixtureStatePatch {
  id: string;
  set: Partial<FixtureSlots>;
}

/** One settlement's worth of writes, applied atomically. */
export interface RepriceUpdate {
  /** Winner/slot patches for the settled + downstream fixtures. */
  fixtureStates: FixtureStatePatch[];
  /** Full-content market upserts (the selection set is replaced). */
  upsertMarkets: PricedMarket[];
  /** Markets to flip to 'settled' (selections kept — schema requires ≥2). */
  settleMarketIds: string[];
  /** Every reprice is a recorded event. */
  event: SettlementEvent;
}

/** Persistence boundary — Prisma in production, in-memory in tests. */
export abstract class MarketsRepository {
  abstract findAllMarkets(): Promise<PricedMarket[]>;
  abstract findMarketById(id: string): Promise<PricedMarket | null>;
  abstract getBracketState(): Promise<Map<string, FixtureSlots>>;
  abstract createFixtureStatesIfMissing(rows: FixtureStateRow[]): Promise<void>;
  /** Guarded winner/slot patches outside a reprice (seed-result healing). */
  abstract applyFixturePatches(patches: FixtureStatePatch[]): Promise<void>;
  abstract upsertMarkets(markets: PricedMarket[]): Promise<void>;
  abstract settleMarkets(ids: string[]): Promise<void>;
  abstract applyReprice(update: RepriceUpdate): Promise<void>;
}

interface SelectionRow {
  id: string;
  teamId: string;
  name: string;
  price: number;
  probability: number;
}

interface MarketRow {
  id: string;
  type: string;
  fixtureId: string | null;
  name: string;
  status: string;
  selections: SelectionRow[];
}

/** Parse, don't trust — even our own rows go through the contract enums. */
function toPricedMarket(row: MarketRow): PricedMarket {
  return {
    id: row.id,
    type: MarketTypeSchema.parse(row.type),
    fixtureId: row.fixtureId,
    name: row.name,
    status: MarketStatusSchema.parse(row.status),
    selections: row.selections.map((selection): PricedSelection => ({
      id: selection.id,
      teamId: selection.teamId,
      name: selection.name,
      price: selection.price,
      probability: selection.probability,
    })),
  };
}

@Injectable()
export class PrismaMarketsRepository extends MarketsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findAllMarkets(): Promise<PricedMarket[]> {
    const rows = await this.prisma.market.findMany({ include: { selections: true } });
    return rows.map(toPricedMarket);
  }

  async findMarketById(id: string): Promise<PricedMarket | null> {
    const row = await this.prisma.market.findUnique({
      where: { id },
      include: { selections: true },
    });
    return row === null ? null : toPricedMarket(row);
  }

  async getBracketState(): Promise<Map<string, FixtureSlots>> {
    const rows = await this.prisma.fixtureState.findMany();
    return new Map(
      rows.map((row) => [
        row.id,
        {
          homeTeamId: row.homeTeamId,
          awayTeamId: row.awayTeamId,
          winnerTeamId: row.winnerTeamId,
        },
      ])
    );
  }

  async createFixtureStatesIfMissing(rows: FixtureStateRow[]): Promise<void> {
    await this.prisma.fixtureState.createMany({ data: rows, skipDuplicates: true });
  }

  async applyFixturePatches(patches: FixtureStatePatch[]): Promise<void> {
    await this.prisma.$transaction(patches.map((patch) => this.fixturePatchOp(patch)));
  }

  async upsertMarkets(markets: PricedMarket[]): Promise<void> {
    await this.prisma.$transaction(markets.flatMap((market) => this.marketWriteOps(market)));
  }

  async settleMarkets(ids: string[]): Promise<void> {
    await this.prisma.market.updateMany({
      where: { id: { in: ids } },
      data: { status: 'settled' },
    });
  }

  async applyReprice(update: RepriceUpdate): Promise<void> {
    await this.prisma.$transaction([
      ...update.fixtureStates.map((patch) => this.fixturePatchOp(patch)),
      ...update.upsertMarkets.flatMap((market) => this.marketWriteOps(market)),
      ...update.settleMarketIds.map((id) =>
        this.prisma.market.update({ where: { id }, data: { status: 'settled' } })
      ),
      this.prisma.repriceEvent.create({
        data: {
          fixtureId: update.event.fixtureId,
          winnerTeamId: update.event.winnerTeamId,
          payload: update.event,
        },
      }),
    ]);
  }

  /**
   * A winner write is guarded on winnerTeamId still being null, so a late
   * conflicting write degrades to a no-op instead of an overwrite of the
   * committed result.
   */
  private fixturePatchOp(patch: FixtureStatePatch) {
    return this.prisma.fixtureState.updateMany({
      where:
        patch.set.winnerTeamId === undefined
          ? { id: patch.id }
          : { id: patch.id, winnerTeamId: null },
      data: patch.set,
    });
  }

  /** Upsert the market row, then replace its selection set wholesale. */
  private marketWriteOps(market: PricedMarket) {
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
      this.prisma.selection.deleteMany({ where: { marketId: market.id } }),
      this.prisma.selection.createMany({
        data: market.selections.map((selection) => ({
          id: selection.id,
          marketId: market.id,
          teamId: selection.teamId,
          name: selection.name,
          price: selection.price,
          probability: selection.probability,
        })),
      }),
    ];
  }
}
