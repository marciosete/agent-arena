import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { FIXTURES, MarketSchema, type Market, type SettlementEvent } from '@arena/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applySettlement } from '../domain/bracket';
import { OUTRIGHT_MARKET_ID } from '../domain/market-builder';
import { settlementFor } from '../testing/settlement';
import type { MarketsRepository } from './markets.repository';
import { PricingService, intFromEnv } from './pricing.service';

const R16_2 = 'R16-2';

const R16_2_SETTLEMENT = settlementFor(R16_2, 'FRA');

function repositoryMock() {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findByFixtureId: vi.fn().mockResolvedValue(null),
    findOutright: vi.fn().mockResolvedValue(null),
    listSettlements: vi.fn().mockResolvedValue([]),
    saveReprice: vi.fn().mockResolvedValue(undefined),
  };
}

/** Home team wins every remaining fixture — a consistent full-tournament run. */
function playAllSettlements(): SettlementEvent[] {
  let bracket = FIXTURES;
  const events: SettlementEvent[] = [];
  for (;;) {
    const next = bracket.find(
      (fixture) => fixture.status !== 'finished' && fixture.homeTeamId && fixture.awayTeamId
    );
    if (!next?.homeTeamId) break;
    const event = settlementFor(next.id, next.homeTeamId);
    events.push(event);
    bracket = applySettlement(bracket, event).fixtures;
  }
  return events;
}

describe('PricingService', () => {
  let repository: ReturnType<typeof repositoryMock>;
  let service: PricingService;

  beforeEach(() => {
    vi.stubEnv('MC_RUNS', '500');
    repository = repositoryMock();
    service = new PricingService(repository as unknown as MarketsRepository);
  });

  /** Seed once and reset counters, so tests observe only their own writes. */
  async function primeSeeded(): Promise<void> {
    await service.refresh();
    repository.saveReprice.mockClear();
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('seeds every priceable market plus the outright on init, idempotently', async () => {
    await service.onModuleInit();
    expect(repository.saveReprice).toHaveBeenCalledTimes(1);
    const [settlement, markets] = repository.saveReprice.mock.calls[0] as [null, Market[]];
    expect(settlement).toBeNull();
    expect(markets).toHaveLength(13); // 12 priceable fixtures + the outright
    expect(markets.every((market) => market.status === 'open')).toBe(true);
    expect(markets.map((market) => market.id)).toContain(OUTRIGHT_MARKET_ID);
    for (const market of markets) {
      expect(MarketSchema.parse(market)).toBeTruthy();
    }
  });

  it('does not crash the service when seeding fails', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    repository.saveReprice.mockRejectedValue(new Error('db down'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'Market seeding failed — is the database reachable?',
      expect.any(Error)
    );
  });

  it('re-establishes the seed lazily after a failed boot (no empty board forever)', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    repository.saveReprice.mockRejectedValueOnce(new Error('db down at boot'));
    await service.onModuleInit(); // swallowed
    await service.getMarkets(); // first read retries the seed
    expect(repository.saveReprice).toHaveBeenCalledTimes(2);
    repository.saveReprice.mockClear();
    await service.getMarkets(); // seeded now — no further writes
    expect(repository.saveReprice).not.toHaveBeenCalled();
  });

  it('warns about and skips recorded settlements that no longer fit the bracket', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    repository.listSettlements.mockResolvedValue([settlementFor('OLD-99', 'FRA')]);
    await service.onModuleInit();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OLD-99'));
    const [, markets] = repository.saveReprice.mock.calls[0] as [null, Market[]];
    expect(markets).toHaveLength(13); // the stale row did not wedge the seed
  });

  it('lists markets in bracket order with the outright last', async () => {
    const outright = { id: OUTRIGHT_MARKET_ID, fixtureId: null } as Market;
    const match = { id: R16_2, fixtureId: R16_2 } as Market;
    repository.findAll.mockResolvedValue([outright, match]);
    expect(await service.getMarkets()).toEqual([match, outright]);
  });

  it('returns the market for a priceable fixture', async () => {
    const match = { id: R16_2, fixtureId: R16_2 } as Market;
    repository.findByFixtureId.mockResolvedValue(match);
    expect(await service.getMarketByFixture(R16_2)).toBe(match);
    expect(repository.findByFixtureId).toHaveBeenCalledWith(R16_2);
  });

  it('404s for an unknown or not-yet-priceable fixture', async () => {
    await expect(service.getMarketByFixture('XX-99')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the outright is not seeded yet', async () => {
    await expect(service.getOutright()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the outright market', async () => {
    const outright = { id: OUTRIGHT_MARKET_ID, fixtureId: null } as Market;
    repository.findOutright.mockResolvedValue(outright);
    expect(await service.getOutright()).toBe(outright);
  });

  it('applies a settlement: settles the market, advances the bracket, reprices the outright', async () => {
    await primeSeeded();
    const sentinel = [{ id: R16_2, fixtureId: R16_2 } as Market];
    repository.findAll.mockResolvedValue(sentinel);
    const result = await service.reprice({ settlement: R16_2_SETTLEMENT });

    expect(repository.saveReprice).toHaveBeenCalledTimes(1);
    const [settlement, markets] = repository.saveReprice.mock.calls[0] as [
      SettlementEvent,
      Market[],
    ];
    expect(settlement).toBe(R16_2_SETTLEMENT);

    const settled = markets.find((market) => market.id === R16_2);
    expect(settled?.status).toBe('settled');
    // Selections stay populated on a settled market — the simulator resolves
    // the winner by team name out of this very payload.
    expect(settled?.selections.map((s) => s.name).sort()).toEqual(['France', 'Paraguay']);

    // QF-1 only has its away slot filled, so it is not priceable yet.
    expect(markets.map((market) => market.id)).not.toContain('QF-1');

    const outright = markets.find((market) => market.id === OUTRIGHT_MARKET_ID);
    expect(outright?.selections).toHaveLength(23);
    expect(outright?.selections.map((s) => s.name)).not.toContain('Paraguay');

    // The endpoint returns the full persisted market list.
    expect(result).toEqual(sentinel);
  });

  it('treats a retry of an applied settlement as an idempotent read', async () => {
    await primeSeeded();
    repository.listSettlements.mockResolvedValue([R16_2_SETTLEMENT]);
    await service.reprice({ settlement: R16_2_SETTLEMENT });
    expect(repository.saveReprice).not.toHaveBeenCalled();
  });

  it('400s a conflicting winner for an already-settled fixture', async () => {
    repository.listSettlements.mockResolvedValue([R16_2_SETTLEMENT]);
    await expect(
      service.reprice({ settlement: settlementFor(R16_2, 'PAR') })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400s an unknown fixture', async () => {
    await expect(
      service.reprice({ settlement: settlementFor('XX-99', 'FRA') })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400s a fixture whose teams are not decided yet', async () => {
    await expect(
      service.reprice({ settlement: settlementFor('QF-1', 'FRA') })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('settles the outright with the champion once the final is played', async () => {
    await primeSeeded();
    const events = playAllSettlements();
    const finale = events[events.length - 1];
    repository.listSettlements.mockResolvedValue(events.slice(0, -1));

    await service.reprice({ settlement: finale });

    const [, markets] = repository.saveReprice.mock.calls[0] as [SettlementEvent, Market[]];
    expect(markets).toHaveLength(24); // all 23 fixtures + the outright
    expect(markets.every((market) => market.status === 'settled')).toBe(true);
    const outright = markets.find((market) => market.id === OUTRIGHT_MARKET_ID);
    const champion = outright?.selections.find((s) => s.probability === 1);
    expect(outright?.selections.length).toBeGreaterThanOrEqual(2);
    expect(champion).toBeDefined();
  });
});

describe('intFromEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('falls back when the variable is unset', () => {
    expect(intFromEnv('MC_TEST_UNSET', 42)).toBe(42);
  });

  it('parses a positive integer override', () => {
    vi.stubEnv('MC_TEST_SET', '250');
    expect(intFromEnv('MC_TEST_SET', 42)).toBe(250);
  });

  it('ignores garbage and non-positive values', () => {
    vi.stubEnv('MC_TEST_BAD', 'not-a-number');
    expect(intFromEnv('MC_TEST_BAD', 42)).toBe(42);
    vi.stubEnv('MC_TEST_NEGATIVE', '-3');
    expect(intFromEnv('MC_TEST_NEGATIVE', 42)).toBe(42);
    vi.stubEnv('MC_TEST_ZERO', '0');
    expect(intFromEnv('MC_TEST_ZERO', 42)).toBe(42);
  });

  it('rejects partial parses instead of silently truncating them', () => {
    // parseInt would read '1e5' as 1 — one Monte Carlo run instead of 100,000.
    vi.stubEnv('MC_TEST_SCI', '1e5');
    expect(intFromEnv('MC_TEST_SCI', 42)).toBe(42);
    vi.stubEnv('MC_TEST_UNDERSCORE', '10_000');
    expect(intFromEnv('MC_TEST_UNDERSCORE', 42)).toBe(42);
    vi.stubEnv('MC_TEST_DECIMAL', '10.5');
    expect(intFromEnv('MC_TEST_DECIMAL', 42)).toBe(42);
  });
});
