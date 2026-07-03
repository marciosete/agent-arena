import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  FIXTURES,
  fixtureById,
  type Fixture,
  type Market,
  type SettlementEvent,
} from '@arena/contracts';
import {
  aliveTeams,
  applySettlement,
  initialBracketState,
  isFinalFixture,
  priceableFixtureIds,
  type BracketState,
} from '../domain/bracket';
import {
  buildMatchWinnerMarket,
  buildOutrightMarket,
  OUTRIGHT_MARKET_ID,
  sortMarkets,
  toContractMarket,
  type PricedMarket,
} from '../domain/market-builder';
import { championProbabilities, OUTRIGHT_RUNS } from '../domain/monte-carlo';
import { createRng } from '../domain/rng';
import { requireTeam } from '../domain/teams';
import { MarketsRepository, type FixtureStatePatch } from './markets.repository';

const DEFAULT_MC_SEED = 20_260_703;

function monteCarloSeed(): number {
  const parsed = Number.parseInt(process.env.PRICING_MC_SEED ?? '', 10);
  return Number.isNaN(parsed) ? DEFAULT_MC_SEED : parsed;
}

@Injectable()
export class PricingService implements OnModuleInit {
  constructor(private readonly repository: MarketsRepository) {}

  async onModuleInit(): Promise<void> {
    await this.seedMarkets();
  }

  /**
   * Idempotent seed/refresh: fixture states are create-only (a restart never
   * clobbers progressed bracket state), open markets are re-priced via
   * upserts (never duplicated), settled markets are left untouched. Results
   * already in the contract seed are re-applied as guarded patches, healing
   * rows persisted before a contract-data update (the morning-of bracket
   * refresh) — no reprice ever arrives for pre-seed results.
   */
  async seedMarkets(): Promise<void> {
    await this.repository.createFixtureStatesIfMissing(
      [...initialBracketState()].map(([id, slots]) => ({ id, ...slots }))
    );
    await this.repository.applyFixturePatches(seedResultPatches());
    const [state, outright, existing] = await Promise.all([
      this.repository.getBracketState(),
      this.repository.findMarketById(OUTRIGHT_MARKET_ID),
      this.repository.findAllMarkets(),
    ]);
    const markets = priceableFixtureIds(state).map((fixtureId) =>
      this.buildFixtureMarket(fixtureId, state)
    );
    if (outright === null || outright.status === 'open') {
      markets.push(this.buildOutright(state));
    }
    await this.repository.upsertMarkets(markets);

    // Markets left open for fixtures the seed now records as decided.
    const stale = existing
      .filter(
        (market) =>
          market.type === 'MATCH_WINNER' &&
          market.status === 'open' &&
          market.fixtureId !== null &&
          state.get(market.fixtureId)?.winnerTeamId != null
      )
      .map((market) => market.id);
    if (stale.length > 0) {
      await this.repository.settleMarkets(stale);
    }
  }

  async getMarkets(): Promise<Market[]> {
    const markets = await this.repository.findAllMarkets();
    return sortMarkets(markets).map(toContractMarket);
  }

  async getMarketByFixtureId(fixtureId: string): Promise<Market> {
    const market = await this.repository.findMarketById(fixtureId);
    if (market?.type !== 'MATCH_WINNER') {
      throw new NotFoundException(`No market for fixture ${fixtureId}`);
    }
    return toContractMarket(market);
  }

  async getOutright(): Promise<Market> {
    const market = await this.repository.findMarketById(OUTRIGHT_MARKET_ID);
    if (market === null) {
      throw new NotFoundException('Outright market not found');
    }
    return toContractMarket(market);
  }

  /**
   * The finale chain (integration.md §4): advance the bracket, settle the
   * fixture's market, price fixtures that just became priceable, reprice the
   * OUTRIGHT, and return the full updated Market[] — the simulator reads the
   * winning selections back out of this response by team name.
   */
  async reprice(settlement: SettlementEvent): Promise<Market[]> {
    const fixture = fixtureById(settlement.fixtureId);
    if (!fixture) {
      throw new NotFoundException(`Unknown fixture: ${settlement.fixtureId}`);
    }
    const state = await this.repository.getBracketState();
    const slots = state.get(settlement.fixtureId);
    if (!slots) {
      throw new NotFoundException(`Unknown fixture: ${settlement.fixtureId}`);
    }
    if (slots.winnerTeamId !== null) {
      if (slots.winnerTeamId === settlement.winnerTeamId) {
        return this.getMarkets(); // idempotent retry — already applied
      }
      throw new ConflictException(
        `Fixture ${settlement.fixtureId} already settled with a different winner`
      );
    }
    if (
      settlement.winnerTeamId !== slots.homeTeamId &&
      settlement.winnerTeamId !== slots.awayTeamId
    ) {
      throw new BadRequestException(
        `Team ${settlement.winnerTeamId} is not a competitor in fixture ${settlement.fixtureId}`
      );
    }

    const nextState = applySettlement(state, settlement.fixtureId, settlement.winnerTeamId);
    const { upsertMarkets, settleMarketIds } = await this.buildMarketChanges(
      settlement,
      state,
      nextState
    );
    await this.repository.applyReprice({
      fixtureStates: fixturePatches(fixture, settlement.winnerTeamId),
      upsertMarkets,
      settleMarketIds,
      event: settlement,
    });
    return this.getMarkets();
  }

  /** The settled fixture's market flips, new priceable fixtures get markets, the OUTRIGHT reprices. */
  private async buildMarketChanges(
    settlement: SettlementEvent,
    state: BracketState,
    nextState: BracketState
  ): Promise<{ upsertMarkets: PricedMarket[]; settleMarketIds: string[] }> {
    const settleMarketIds = [settlement.fixtureId];
    const upsertMarkets: PricedMarket[] = [];
    const settledMarket = await this.repository.findMarketById(settlement.fixtureId);
    if (settledMarket === null) {
      // Defensive: a fixture that reached settlement was necessarily priceable.
      upsertMarkets.push(this.buildFixtureMarket(settlement.fixtureId, state));
    }

    if (isFinalFixture(settlement.fixtureId)) {
      // Champion decided: settle the outright, keep its last selections so the
      // simulator can resolve the winning selection by name (§4 step 4).
      settleMarketIds.push(OUTRIGHT_MARKET_ID);
    } else {
      const alreadyPriceable = new Set(priceableFixtureIds(state));
      for (const fixtureId of priceableFixtureIds(nextState)) {
        if (!alreadyPriceable.has(fixtureId)) {
          upsertMarkets.push(this.buildFixtureMarket(fixtureId, nextState));
        }
      }
      upsertMarkets.push(this.buildOutright(nextState));
    }
    return { upsertMarkets, settleMarketIds };
  }

  private buildFixtureMarket(fixtureId: string, state: BracketState): PricedMarket {
    const slots = state.get(fixtureId);
    if (slots?.homeTeamId == null || slots.awayTeamId === null) {
      throw new Error(`Fixture ${fixtureId} is not priceable`);
    }
    return buildMatchWinnerMarket(
      fixtureId,
      requireTeam(slots.homeTeamId),
      requireTeam(slots.awayTeamId)
    );
  }

  private buildOutright(state: BracketState): PricedMarket {
    const probabilities = championProbabilities(state, OUTRIGHT_RUNS, createRng(monteCarloSeed()));
    return buildOutrightMarket(probabilities, aliveTeams(state));
  }
}

/**
 * Patch only the fields this settlement owns — the winner here, one slot
 * downstream — so sibling reprices feeding the same fixture cannot clobber
 * each other's slot.
 */
function fixturePatches(fixture: Fixture, winnerTeamId: string): FixtureStatePatch[] {
  const patches: FixtureStatePatch[] = [{ id: fixture.id, set: { winnerTeamId } }];
  if (fixture.feedsInto !== null && fixture.feedsIntoSlot !== null) {
    patches.push({
      id: fixture.feedsInto,
      set:
        fixture.feedsIntoSlot === 'home'
          ? { homeTeamId: winnerTeamId }
          : { awayTeamId: winnerTeamId },
    });
  }
  return patches;
}

/** Winner/slot patches for every result the contract seed already records. */
function seedResultPatches(): FixtureStatePatch[] {
  return FIXTURES.filter((fixture) => fixture.winnerTeamId !== null).flatMap((fixture) =>
    fixturePatches(fixture, fixture.winnerTeamId as string)
  );
}
