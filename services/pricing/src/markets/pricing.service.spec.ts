import { FIXTURES, MarketSchema, type Market } from '@arena/contracts';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { initialBracketState } from '../domain/bracket';
import { buildMatchWinnerMarket, OUTRIGHT_MARKET_ID } from '../domain/market-builder';
import { requireTeam } from '../domain/teams';
import { makeSettlement } from '../testing/settlement';
import { PricingService } from './pricing.service';
import { InMemoryMarketsRepository } from './testing/in-memory-markets.repository';

const R32_9 = 'R32-9';
const R32_13 = 'R32-13';
const R32_14 = 'R32-14';
const R16_5 = 'R16-5';
const R16_7 = 'R16-7';
const ARG = 'ARG';
const SETTLED = 'settled';
const OPEN = 'open';
const ARGENTINA = 'Argentina';
const CABO_VERDE = 'Cabo Verde';

async function createSeeded(): Promise<{
  service: PricingService;
  repository: InMemoryMarketsRepository;
}> {
  const repository = new InMemoryMarketsRepository();
  const service = new PricingService(repository);
  await service.onModuleInit();
  return { service, repository };
}

function seedRows() {
  return [...initialBracketState()].map(([id, slots]) => ({ id, ...slots }));
}

describe('seeding', () => {
  it('publishes the 10 priceable match markets plus the outright, all contract-valid', async () => {
    const { service } = await createSeeded();
    const markets = await service.getMarkets();
    MarketSchema.array().parse(markets);
    expect(markets).toHaveLength(11);
    const outright = markets.at(-1);
    expect(outright?.id).toBe(OUTRIGHT_MARKET_ID);
    expect(outright?.selections).toHaveLength(20); // seed results eliminated 4 teams
    for (const market of markets) {
      expect(market.status).toBe(OPEN);
    }
  });

  it('prices fixtures determined by results already in the seed (R16-5: Portugal v Spain)', async () => {
    const { service } = await createSeeded();
    const market = await service.getMarketByFixtureId(R16_5);
    expect(market.name).toBe('Portugal v Spain');
    expect(market.status).toBe(OPEN);
  });

  it('is idempotent: a restart re-seed changes nothing', async () => {
    const { service } = await createSeeded();
    const before = await service.getMarkets();
    await service.seedMarkets();
    expect(await service.getMarkets()).toEqual(before);
  });

  it('names every selection by its exact Team.name and keys markets by fixtureId (§3 join)', async () => {
    const { repository } = await createSeeded();
    for (const market of await repository.findAllMarkets()) {
      if (market.type === 'MATCH_WINNER') {
        expect(market.fixtureId).toBe(market.id);
      } else {
        expect(market.id).toBe(OUTRIGHT_MARKET_ID);
        expect(market.fixtureId).toBeNull();
      }
      for (const selection of market.selections) {
        expect(selection.name).toBe(requireTeam(selection.teamId).name);
        expect(selection.id).toBe(`${market.id}:${selection.teamId}`);
      }
    }
  });

  it('heals a database seeded before a contract bracket update', async () => {
    const repository = new InMemoryMarketsRepository();
    // Rows as an old deploy persisted them: no winners, no propagated slots,
    // plus a market still open for a fixture the new seed records as decided.
    await repository.createFixtureStatesIfMissing(
      FIXTURES.map((fixture) => ({
        id: fixture.id,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        winnerTeamId: null,
      }))
    );
    await repository.upsertMarkets([
      buildMatchWinnerMarket(R32_9, requireTeam('POR'), requireTeam('CRO')),
    ]);
    const service = new PricingService(repository);
    await service.seedMarkets();

    const markets = await service.getMarkets();
    expect(markets.find((market) => market.id === R32_9)?.status).toBe(SETTLED);
    const healed = markets.find((market) => market.id === R16_5);
    expect(healed?.selections.map((selection) => selection.name)).toEqual(
      expect.arrayContaining(['Portugal', 'Spain'])
    );
    const outright = markets.find((market) => market.id === OUTRIGHT_MARKET_ID);
    expect(outright?.selections).toHaveLength(20);
    expect(outright?.selections.map((selection) => selection.name)).not.toContain('Croatia');
  });

  it('rejects seeding when a fixture references an unknown team', async () => {
    const repository = new InMemoryMarketsRepository();
    await repository.createFixtureStatesIfMissing([
      { id: R32_13, homeTeamId: 'XXX', awayTeamId: 'CPV', winnerTeamId: null },
    ]);
    const service = new PricingService(repository);
    await expect(service.seedMarkets()).rejects.toThrow('Unknown team: XXX');
  });
});

describe('reprice', () => {
  it('settles the market, prunes the outright, records the event, returns Market[]', async () => {
    const { service, repository } = await createSeeded();
    const response = await service.reprice(makeSettlement(R32_13, ARG));
    MarketSchema.array().parse(response);

    const settled = response.find((market) => market.id === R32_13);
    expect(settled?.status).toBe(SETTLED);
    expect(settled?.selections.map((selection) => selection.name)).toContain(ARGENTINA);

    const outright = response.find((market) => market.id === OUTRIGHT_MARKET_ID);
    expect(outright?.selections).toHaveLength(19);
    expect(outright?.selections.map((selection) => selection.name)).not.toContain(CABO_VERDE);

    expect(response.find((market) => market.id === R16_7)).toBeUndefined();
    expect(repository.events).toHaveLength(1);
  });

  it('adds a market for a fixture that just became priceable', async () => {
    const { service } = await createSeeded();
    await service.reprice(makeSettlement(R32_13, ARG));
    const response = await service.reprice(makeSettlement(R32_14, 'EGY'));
    const newlyPriceable = response.find((market) => market.id === R16_7);
    expect(newlyPriceable?.status).toBe(OPEN);
    expect(newlyPriceable?.selections.map((selection) => selection.name)).toEqual(
      expect.arrayContaining([ARGENTINA, 'Egypt'])
    );
  });

  it('is idempotent for a retried settlement', async () => {
    const { service, repository } = await createSeeded();
    const first = await service.reprice(makeSettlement(R32_13, ARG));
    const second = await service.reprice(makeSettlement(R32_13, ARG));
    expect(second).toEqual(first);
    expect(repository.events).toHaveLength(1);
  });

  it('rejects a conflicting winner for an already-settled fixture (409)', async () => {
    const { service } = await createSeeded();
    await service.reprice(makeSettlement(R32_13, ARG));
    await expect(service.reprice(makeSettlement(R32_13, 'CPV'))).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('rejects an unknown fixture (404)', async () => {
    const { service } = await createSeeded();
    await expect(service.reprice(makeSettlement('NOPE', ARG))).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('rejects a winner who is not a competitor (400)', async () => {
    const { service } = await createSeeded();
    await expect(service.reprice(makeSettlement(R32_13, 'FRA'))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects a fixture whose slots are not yet determined (400)', async () => {
    const { service } = await createSeeded();
    await expect(service.reprice(makeSettlement(R16_7, ARG))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('creates the market on the fly if a settled fixture was never priced (defensive)', async () => {
    const repository = new InMemoryMarketsRepository();
    await repository.createFixtureStatesIfMissing(seedRows());
    const service = new PricingService(repository);
    const response = await service.reprice(makeSettlement(R32_13, ARG));
    const settled = response.find((market) => market.id === R32_13);
    expect(settled?.status).toBe(SETTLED);
    expect(settled?.selections).toHaveLength(2);
  });

  it('plays the whole tournament: outright settles with the champion resolvable by name', async () => {
    const { service, repository } = await createSeeded();
    let response: Market[] = [];
    for (const fixture of FIXTURES) {
      const state = await repository.getBracketState();
      const winner = state.get(fixture.id)?.homeTeamId as string;
      response = await service.reprice(makeSettlement(fixture.id, winner));
    }
    MarketSchema.array().parse(response);

    for (const market of response) {
      expect(market.status).toBe(SETTLED);
    }
    const outright = response.find((market) => market.id === OUTRIGHT_MARKET_ID);
    expect(outright?.selections).toHaveLength(2);

    const state = await repository.getBracketState();
    const champion = state.get('F-1')?.winnerTeamId as string;
    expect(outright?.selections.map((selection) => selection.name)).toContain(
      requireTeam(champion).name
    );
    // Fixtures already decided in the seed take the idempotent path: no event.
    const preSettled = FIXTURES.filter((fixture) => fixture.winnerTeamId !== null).length;
    expect(repository.events).toHaveLength(FIXTURES.length - preSettled);
  });
});

describe('queries', () => {
  it('serves the match-winner market for a fixture', async () => {
    const { service } = await createSeeded();
    const market = await service.getMarketByFixtureId('R16-2');
    expect(market.name).toBe('Paraguay v France');
  });

  it('404s for unknown, unpriceable, and non-fixture ids', async () => {
    const { service } = await createSeeded();
    for (const id of ['NOPE', R16_7, OUTRIGHT_MARKET_ID]) {
      await expect(service.getMarketByFixtureId(id)).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('serves the outright, and 404s when it is missing', async () => {
    const { service } = await createSeeded();
    const outright = await service.getOutright();
    expect(outright.fixtureId).toBeNull();
    const empty = new PricingService(new InMemoryMarketsRepository());
    await expect(empty.getOutright()).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Monte Carlo seeding', () => {
  afterEach(() => {
    delete process.env.PRICING_MC_SEED;
  });

  it('honours PRICING_MC_SEED and falls back to the default on garbage', async () => {
    process.env.PRICING_MC_SEED = '42';
    const seeded = await createSeeded();
    const outrightSeeded = await seeded.service.getOutright();

    process.env.PRICING_MC_SEED = 'not-a-number';
    const garbage = await createSeeded();
    const outrightGarbage = await garbage.service.getOutright();

    delete process.env.PRICING_MC_SEED;
    const fallback = await createSeeded();
    const outrightDefault = await fallback.service.getOutright();

    expect(outrightGarbage).toEqual(outrightDefault);
    expect(outrightSeeded).not.toEqual(outrightDefault);
  });
});
