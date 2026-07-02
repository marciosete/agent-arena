import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { signToken } from '@arena/service-auth';
import {
  FIXTURES,
  MarketSchema,
  TARGET_OVERROUND,
  TEAMS,
  teamById,
  type Market,
  type SettlementEvent,
} from '@arena/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { replaySettlements } from './domain/bracket';
import { OUTRIGHT_MARKET_ID } from './domain/market-builder';
import { MarketsRepository } from './markets/markets.repository';
import { InMemoryMarketsRepository } from './markets/testing/in-memory-markets.repository';

const MARKETS = '/markets';
const OUTRIGHT = '/outright';
const REPRICE = '/reprice';
const R16_2 = 'R16-2';
const SETTLED_AT = '2026-07-04T23:00:00.000Z';
const AUTH = 'Authorization';

const MarketsResponse = MarketSchema.array();

function settlementFor(fixtureId: string, winnerTeamId: string): SettlementEvent {
  return {
    fixtureId,
    winnerTeamId,
    homeScore: 2,
    awayScore: 0,
    decidedOnPenalties: false,
    settledAt: SETTLED_AT,
  };
}

async function createApp(repository: InMemoryMarketsRepository): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MarketsRepository)
    .useValue(repository)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('pricing API (e2e over the real module graph, in-memory persistence)', () => {
  const repository = new InMemoryMarketsRepository();
  const applied: SettlementEvent[] = [];
  let app: INestApplication;
  let bearer: string;

  const server = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();

  async function postReprice(settlement: SettlementEvent): Promise<Market[]> {
    const response = await request(server())
      .post(REPRICE)
      .set(AUTH, bearer)
      .send({ settlement })
      .expect(200);
    if (!applied.some((s) => s.fixtureId === settlement.fixtureId)) applied.push(settlement);
    return MarketsResponse.parse(response.body);
  }

  beforeAll(async () => {
    app = await createApp(repository);
    bearer = `Bearer ${signToken('e2e-caller')}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps GET /health public', async () => {
    const response = await request(server()).get('/health');
    expect(response.status).toBe(200);
  });

  it('rejects every protected endpoint with 401 for a missing or invalid bearer', async () => {
    const calls = [
      () => request(server()).get(MARKETS),
      () => request(server()).get(`${MARKETS}/${R16_2}`),
      () => request(server()).get(OUTRIGHT),
      () => request(server()).post(REPRICE).send({}),
    ];
    for (const call of calls) {
      const missing = await call();
      expect(missing.status).toBe(401);
      const invalid = await call().set(AUTH, 'Bearer not-a-real-token');
      expect(invalid.status).toBe(401);
    }
  });

  it('GET /markets serves the full contract-valid board with the §3 joins intact', async () => {
    const response = await request(server()).get(MARKETS).set(AUTH, bearer).expect(200);
    const markets = MarketsResponse.parse(response.body);
    expect(markets).toHaveLength(13); // 12 priceable fixtures + the outright

    const teamNames = new Set(TEAMS.map((team) => team.name));
    for (const market of markets) {
      if (market.type === 'MATCH_WINNER') {
        expect(market.fixtureId).toBe(market.id); // market id == fixtureId
        expect(FIXTURES.some((fixture) => fixture.id === market.fixtureId)).toBe(true);
      } else {
        expect(market.id).toBe(OUTRIGHT_MARKET_ID);
        expect(market.fixtureId).toBeNull();
      }
      for (const selection of market.selections) {
        expect(teamNames.has(selection.name)).toBe(true); // Selection.name == Team.name
      }
    }
  });

  it('GET /markets/R16-2 quotes France heavy favourites at a 1.05 book (the demo moment)', async () => {
    const response = await request(server())
      .get(`${MARKETS}/${R16_2}`)
      .set(AUTH, bearer)
      .expect(200);
    const market = MarketSchema.parse(response.body);
    const france = market.selections.find((s) => s.name === 'France');
    const paraguay = market.selections.find((s) => s.name === 'Paraguay');
    expect(france?.price).toBeLessThan(2);
    expect(paraguay?.price).toBeGreaterThan(5);
    const impliedSum = market.selections.reduce((sum, s) => sum + 1 / s.price, 0);
    expect(impliedSum).toBeCloseTo(TARGET_OVERROUND, 1);
  });

  it('GET /markets/:fixtureId 404s for unknown and not-yet-priceable fixtures', async () => {
    const unknown = await request(server()).get(`${MARKETS}/XX-99`).set(AUTH, bearer);
    expect(unknown.status).toBe(404);
    const unpriceable = await request(server()).get(`${MARKETS}/QF-1`).set(AUTH, bearer);
    expect(unpriceable.status).toBe(404);
  });

  it('GET /outright prices every alive team from the Monte Carlo bracket', async () => {
    const response = await request(server()).get(OUTRIGHT).set(AUTH, bearer).expect(200);
    const market = MarketSchema.parse(response.body);
    expect(market.id).toBe(OUTRIGHT_MARKET_ID);
    expect(market.selections).toHaveLength(24);
    const totalProbability = market.selections.reduce((sum, s) => sum + (s.probability ?? 0), 0);
    expect(totalProbability).toBeCloseTo(1, 9);
  });

  it('POST /reprice 400s on a malformed body', async () => {
    const response = await request(server())
      .post(REPRICE)
      .set(AUTH, bearer)
      .send({ settlement: { fixtureId: R16_2 } });
    expect(response.status).toBe(400);
  });

  it('POST /reprice 400s on an impossible settlement', async () => {
    const response = await request(server())
      .post(REPRICE)
      .set(AUTH, bearer)
      .send({ settlement: settlementFor('XX-99', 'FRA') });
    expect(response.status).toBe(400);
  });

  it('POST /reprice settles the market, advances the bracket, reprices the outright and returns Market[]', async () => {
    const markets = await postReprice(settlementFor(R16_2, 'FRA'));

    const settled = markets.find((market) => market.id === R16_2);
    expect(settled?.status).toBe('settled');
    expect(settled?.selections.map((s) => s.name).sort()).toEqual(['France', 'Paraguay']);

    // QF-1 has only its away slot decided — still unpriceable.
    expect(markets.map((market) => market.id)).not.toContain('QF-1');

    const outright = markets.find((market) => market.id === OUTRIGHT_MARKET_ID);
    expect(outright?.selections).toHaveLength(23);
    expect(outright?.selections.map((s) => s.name)).not.toContain('Paraguay');

    // The next feeder result makes QF-1 priceable and a new market appears.
    const afterSecond = await postReprice(settlementFor('R16-1', 'MAR'));
    const quarterFinal = afterSecond.find((market) => market.id === 'QF-1');
    expect(quarterFinal?.status).toBe('open');
    expect(quarterFinal?.selections.map((s) => s.name).sort()).toEqual(['France', 'Morocco']);
  });

  it('treats a retried settlement as idempotent', async () => {
    const before = await request(server()).get(MARKETS).set(AUTH, bearer);
    const markets = await postReprice(settlementFor(R16_2, 'FRA'));
    expect(markets).toEqual(MarketsResponse.parse(before.body));
  });

  it('keeps prices across a restart (fresh app, surviving storage)', async () => {
    const before = await request(server()).get(MARKETS).set(AUTH, bearer);
    const restarted = await createApp(repository);
    try {
      const after = await request(restarted.getHttpServer()).get(MARKETS).set(AUTH, bearer);
      expect(after.body).toEqual(before.body);
    } finally {
      await restarted.close();
    }
  });

  it('runs the finale chain to a champion: every market settles, the outright crowns the winner', async () => {
    let bracket = replaySettlements(FIXTURES, applied);
    let markets: Market[] = [];
    let champion: string | null = null;
    for (;;) {
      const next = bracket.find(
        (fixture) => fixture.status !== 'finished' && fixture.homeTeamId && fixture.awayTeamId
      );
      if (!next?.homeTeamId) break;
      const settlement = settlementFor(next.id, next.homeTeamId);
      markets = await postReprice(settlement);
      bracket = replaySettlements(bracket, [settlement]);
      if (next.feedsInto === null) champion = settlement.winnerTeamId;
    }

    expect(champion).not.toBeNull();
    expect(markets).toHaveLength(24); // all 23 fixtures + the outright
    expect(markets.every((market) => market.status === 'settled')).toBe(true);

    const outright = markets.find((market) => market.id === OUTRIGHT_MARKET_ID);
    const winner = outright?.selections.find((s) => s.probability === 1);
    expect(winner?.name).toBe(teamById(champion ?? '')?.name);
    // ≥2 selections survive settlement so the simulator can resolve by name.
    expect(outright?.selections.length).toBeGreaterThanOrEqual(2);
  });
});
