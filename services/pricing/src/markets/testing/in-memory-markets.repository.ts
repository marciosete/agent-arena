import type { Market, SettlementEvent } from '@arena/contracts';
import { OUTRIGHT_MARKET_ID, type PricedMarket } from '../../domain/market-builder';

/** Mirror the real adapter's read-side order: favourite first, id tiebreak. */
function clone(market: Market): Market;
function clone(market: Market | null): Market | null;
function clone(market: Market | null): Market | null {
  if (!market) return null;
  const copy = structuredClone(market);
  copy.selections.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  return copy;
}

/**
 * Drop-in MarketsRepository double backed by Maps, so e2e specs can run the
 * real module graph (guard → controller → service → domain) without Postgres.
 * Sharing one instance across two apps simulates a service restart against a
 * surviving database.
 */
export class InMemoryMarketsRepository {
  private readonly markets = new Map<string, Market>();
  private readonly settlements: SettlementEvent[] = [];

  async findAll(): Promise<Market[]> {
    return [...this.markets.values()].map((market) => clone(market));
  }

  async findByFixtureId(fixtureId: string): Promise<Market | null> {
    const market = [...this.markets.values()].find(
      (candidate) => candidate.fixtureId === fixtureId
    );
    return clone(market ?? null);
  }

  async findOutright(): Promise<Market | null> {
    return clone(this.markets.get(OUTRIGHT_MARKET_ID) ?? null);
  }

  async listSettlements(): Promise<SettlementEvent[]> {
    return structuredClone(this.settlements);
  }

  async saveReprice(settlement: SettlementEvent | null, markets: PricedMarket[]): Promise<void> {
    for (const market of markets) {
      this.markets.set(market.id, structuredClone(market));
    }
    if (settlement && !this.settlements.some((s) => s.fixtureId === settlement.fixtureId)) {
      this.settlements.push(structuredClone(settlement));
    }
  }
}
