import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { FIXTURES, TEAMS, type Fixture, type Market, type RepriceRequest } from '@arena/contracts';
import {
  SettlementError,
  aliveTeams,
  applySettlement,
  finalFixture,
  priceableFixtures,
  replaySettlements,
} from '../domain/bracket';
import {
  buildMatchWinnerMarket,
  buildOutrightMarket,
  buildSettledOutrightMarket,
  sortMarkets,
  type PricedMarket,
} from '../domain/market-builder';
import { DEFAULT_MC_RUNS, simulateChampionProbabilities } from '../domain/monte-carlo';
import { mulberry32 } from '../domain/rng';
import { MarketsRepository } from './markets.repository';

/** Fixed default so successive reprices (and restarts) quote identical books. */
const DEFAULT_MC_SEED = 20_260_703;

/**
 * Positive-integer env override with a safe fallback. Strict digits-only parse:
 * parseInt would silently read 'MC_RUNS=1e5' as 1 run and price the outright
 * off a single simulated bracket.
 */
export function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw !== undefined && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : fallback;
}

/**
 * The price authority. Pure domain maths (Elo → probability → margin, bracket
 * advancement, Monte Carlo outright) lives in ../domain; this provider
 * orchestrates it against the repository. Bracket state is event-sourced:
 * FIXTURES seed ⊕ recorded settlements, replayed at boot.
 */
@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private readonly mcRuns = intFromEnv('MC_RUNS', DEFAULT_MC_RUNS);
  private readonly mcSeed = intFromEnv('MC_SEED', DEFAULT_MC_SEED);
  private seeded = false;

  constructor(private readonly repository: MarketsRepository) {}

  /**
   * Idempotent seed/refresh. A boot-time failure must not crash the service
   * (house style — flags does the same), but the invariant is re-established
   * lazily: every read/reprice retries the seed until one succeeds.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.refresh();
    } catch (error) {
      this.logger.error('Market seeding failed — is the database reachable?', error);
    }
  }

  async refresh(): Promise<void> {
    const bracket = await this.liveBracket();
    await this.repository.saveReprice(null, this.buildAllMarkets(bracket));
    this.seeded = true;
  }

  private async ensureSeeded(): Promise<void> {
    if (!this.seeded) {
      await this.refresh();
    }
  }

  async getMarkets(): Promise<Market[]> {
    await this.ensureSeeded();
    return sortMarkets(await this.repository.findAll(), FIXTURES);
  }

  async getMarketByFixture(fixtureId: string): Promise<Market> {
    await this.ensureSeeded();
    const market = await this.repository.findByFixtureId(fixtureId);
    if (!market) {
      throw new NotFoundException(
        `No market for fixture '${fixtureId}' — unknown or not yet priceable`
      );
    }
    return market;
  }

  async getOutright(): Promise<Market> {
    await this.ensureSeeded();
    const market = await this.repository.findOutright();
    if (!market) {
      throw new NotFoundException('Outright market not seeded yet');
    }
    return market;
  }

  /**
   * The finale chain (integration.md §4): advance the bracket, settle the
   * fixture's market, reprice everything downstream plus the outright, persist
   * it all, and return the full updated market list — the simulator resolves
   * winning selections out of this response. Retries of an already-applied
   * settlement are idempotent.
   */
  async reprice(request: RepriceRequest): Promise<Market[]> {
    await this.ensureSeeded();
    const bracket = await this.liveBracket();
    let advanced: Fixture[] | null = null;
    try {
      const result = applySettlement(bracket, request.settlement);
      advanced = result.changed ? result.fixtures : null;
    } catch (error) {
      if (error instanceof SettlementError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (advanced) {
      await this.repository.saveReprice(request.settlement, this.buildAllMarkets(advanced));
    }
    return this.getMarkets();
  }

  private async liveBracket(): Promise<Fixture[]> {
    const { fixtures, skipped } = replaySettlements(
      FIXTURES,
      await this.repository.listSettlements()
    );
    if (skipped.length > 0) {
      // Stale rows (e.g. a re-seeded bracket) degrade to a warning, never a 500.
      this.logger.warn(
        `Skipped ${skipped.length} recorded settlement(s) that no longer fit the bracket: ` +
          skipped.map((settlement) => settlement.fixtureId).join(', ')
      );
    }
    return fixtures;
  }

  private buildAllMarkets(bracket: Fixture[]): PricedMarket[] {
    const matchMarkets = priceableFixtures(bracket).map((fixture) =>
      buildMatchWinnerMarket(fixture, TEAMS)
    );
    return [...matchMarkets, this.buildOutright(bracket)];
  }

  private buildOutright(bracket: Fixture[]): PricedMarket {
    const final = finalFixture(bracket);
    if (final?.status === 'finished') {
      return buildSettledOutrightMarket(final, TEAMS);
    }
    const probabilities = simulateChampionProbabilities(
      bracket,
      TEAMS,
      this.mcRuns,
      mulberry32(this.mcSeed)
    );
    return buildOutrightMarket(probabilities, aliveTeams(bracket), TEAMS);
  }
}
