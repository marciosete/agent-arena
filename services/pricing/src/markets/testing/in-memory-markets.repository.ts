import type { SettlementEvent } from '@arena/contracts';
import type { FixtureSlots } from '../../domain/bracket';
import type { PricedMarket } from '../../domain/market-builder';
import {
  MarketsRepository,
  type FixtureStatePatch,
  type FixtureStateRow,
  type RepriceUpdate,
} from '../markets.repository';

/**
 * In-memory MarketsRepository with the same semantics as the Prisma one
 * (create-only fixture seeding, wholesale selection replacement, settle
 * flips, recorded events). Lets service/controller tests run without a DB.
 */
export class InMemoryMarketsRepository extends MarketsRepository {
  private readonly markets = new Map<string, PricedMarket>();
  private readonly fixtures = new Map<string, FixtureSlots>();
  readonly events: SettlementEvent[] = [];

  findAllMarkets(): Promise<PricedMarket[]> {
    return Promise.resolve([...this.markets.values()].map((market) => structuredClone(market)));
  }

  findMarketById(id: string): Promise<PricedMarket | null> {
    const market = this.markets.get(id);
    return Promise.resolve(market === undefined ? null : structuredClone(market));
  }

  getBracketState(): Promise<Map<string, FixtureSlots>> {
    return Promise.resolve(structuredClone(this.fixtures));
  }

  createFixtureStatesIfMissing(rows: FixtureStateRow[]): Promise<void> {
    for (const row of rows) {
      if (!this.fixtures.has(row.id)) {
        this.fixtures.set(row.id, {
          homeTeamId: row.homeTeamId,
          awayTeamId: row.awayTeamId,
          winnerTeamId: row.winnerTeamId,
        });
      }
    }
    return Promise.resolve();
  }

  applyFixturePatches(patches: FixtureStatePatch[]): Promise<void> {
    this.applyPatches(patches);
    return Promise.resolve();
  }

  upsertMarkets(markets: PricedMarket[]): Promise<void> {
    for (const market of markets) {
      this.markets.set(market.id, structuredClone(market));
    }
    return Promise.resolve();
  }

  settleMarkets(ids: string[]): Promise<void> {
    for (const id of ids) {
      const market = this.markets.get(id);
      if (market) {
        market.status = 'settled';
      }
    }
    return Promise.resolve();
  }

  // Mirrors the Prisma deleteMany-everything: no row survives an admin reset.
  clearAll(): Promise<void> {
    this.markets.clear();
    this.fixtures.clear();
    this.events.length = 0;
    return Promise.resolve();
  }

  // Async so validation failures reject, like a failed Prisma transaction.
  async applyReprice(update: RepriceUpdate): Promise<void> {
    // Validate everything first so a failure leaves no partial writes —
    // mirroring the Prisma implementation's transaction rollback.
    const marketIdsAfterUpserts = new Set([
      ...this.markets.keys(),
      ...update.upsertMarkets.map((market) => market.id),
    ]);
    for (const id of update.settleMarketIds) {
      if (!marketIdsAfterUpserts.has(id)) {
        throw new Error(`Cannot settle unknown market: ${id}`);
      }
    }

    this.applyPatches(update.fixtureStates);
    for (const market of update.upsertMarkets) {
      this.markets.set(market.id, structuredClone(market));
    }
    for (const id of update.settleMarketIds) {
      const market = this.markets.get(id) as PricedMarket;
      market.status = 'settled';
    }
    this.events.push(structuredClone(update.event));
  }

  private applyPatches(patches: FixtureStatePatch[]): void {
    for (const patch of patches) {
      const current = this.fixtures.get(patch.id);
      if (!current) {
        continue; // mirrors updateMany matching zero rows
      }
      // Winner writes are guarded on the winner still being unset (Prisma parity).
      if (patch.set.winnerTeamId !== undefined && current.winnerTeamId !== null) {
        continue;
      }
      this.fixtures.set(patch.id, { ...current, ...patch.set });
    }
  }
}
