import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { signToken } from '@arena/service-auth';
import { MarketSchema, TARGET_OVERROUND } from '@arena/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { makeSettlement } from '../testing/settlement';
import { MarketsRepository } from './markets.repository';
import { InMemoryMarketsRepository } from './testing/in-memory-markets.repository';

const MARKETS_PATH = '/markets';
const OUTRIGHT_PATH = '/outright';
const REPRICE_PATH = '/reprice';
const RESET_PATH = '/reset';
const R16_2_PATH = '/markets/R16-2';
const AUTH_HEADER = 'Authorization';
const R32_13 = 'R32-13';

const PROTECTED_ENDPOINTS = [
  { method: 'get', path: MARKETS_PATH },
  { method: 'get', path: R16_2_PATH },
  { method: 'get', path: OUTRIGHT_PATH },
  { method: 'post', path: REPRICE_PATH },
  { method: 'post', path: RESET_PATH },
] as const;

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MarketsRepository)
    .useValue(new InMemoryMarketsRepository())
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

function bearer(): string {
  return `Bearer ${signToken('simulator')}`;
}

describe('auth: every protected endpoint requires a valid Bearer JWT (DoD)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each(PROTECTED_ENDPOINTS)('$method $path → 401 with no token', async ({ method, path }) => {
    await request(app.getHttpServer())[method](path).expect(401);
  });

  it.each(PROTECTED_ENDPOINTS)(
    '$method $path → 401 with an invalid token',
    async ({ method, path }) => {
      await request(app.getHttpServer())
        [method](path)
        .set(AUTH_HEADER, 'Bearer nonsense')
        .expect(401);
    }
  );

  it('keeps GET /health public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});

describe('market reads', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /markets returns every priced market, MarketSchema-valid (DoD)', async () => {
    const response = await request(app.getHttpServer())
      .get(MARKETS_PATH)
      .set(AUTH_HEADER, bearer())
      .expect(200);
    const markets = MarketSchema.array().parse(response.body);
    expect(markets).toHaveLength(11);
  });

  it('GET /markets/R16-2 prices France as heavy favourites in a 1.05 book (DoD + demo)', async () => {
    const response = await request(app.getHttpServer())
      .get(R16_2_PATH)
      .set(AUTH_HEADER, bearer())
      .expect(200);
    const market = MarketSchema.parse(response.body);
    expect(market.id).toBe('R16-2');
    expect(market.fixtureId).toBe('R16-2');
    const [favourite, outsider] = market.selections;
    expect(favourite?.name).toBe('France');
    expect(outsider?.name).toBe('Paraguay');
    expect(favourite?.price ?? 0).toBeLessThan(outsider?.price ?? 0);
    const overround = market.selections.reduce((sum, selection) => sum + 1 / selection.price, 0);
    expect(overround).toBeCloseTo(TARGET_OVERROUND, 2);
  });

  it('GET /markets/:fixtureId → 404 for unknown, unpriceable, and non-fixture ids', async () => {
    for (const id of ['NOPE', 'R16-7', 'outright']) {
      const response = await request(app.getHttpServer())
        .get(`${MARKETS_PATH}/${id}`)
        .set(AUTH_HEADER, bearer());
      expect(response.status).toBe(404);
    }
  });

  it('GET /outright returns the tournament-winner market, MarketSchema-valid (DoD)', async () => {
    const response = await request(app.getHttpServer())
      .get(OUTRIGHT_PATH)
      .set(AUTH_HEADER, bearer())
      .expect(200);
    const market = MarketSchema.parse(response.body);
    expect(market.id).toBe('outright');
    expect(market.fixtureId).toBeNull();
    expect(market.selections).toHaveLength(20);
  });
});

describe('POST /reprice', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects a garbage body with 400 (zod-validated)', async () => {
    const response = await request(app.getHttpServer())
      .post(REPRICE_PATH)
      .set(AUTH_HEADER, bearer())
      .send({ settlement: { fixtureId: 42 } });
    expect(response.status).toBe(400);
  });

  it('404s an unknown fixture and 400s a non-competitor winner', async () => {
    const unknown = await request(app.getHttpServer())
      .post(REPRICE_PATH)
      .set(AUTH_HEADER, bearer())
      .send({ settlement: makeSettlement('NOPE', 'ARG') });
    expect(unknown.status).toBe(404);
    const nonCompetitor = await request(app.getHttpServer())
      .post(REPRICE_PATH)
      .set(AUTH_HEADER, bearer())
      .send({ settlement: makeSettlement('R32-14', 'FRA') });
    expect(nonCompetitor.status).toBe(400);
  });

  it('advances the bracket and returns the updated Market[] (DoD)', async () => {
    const response = await request(app.getHttpServer())
      .post(REPRICE_PATH)
      .set(AUTH_HEADER, bearer())
      .send({ settlement: makeSettlement('R32-13', 'ARG') })
      .expect(200);
    const markets = MarketSchema.array().parse(response.body);

    const settled = markets.find((market) => market.id === 'R32-13');
    expect(settled?.status).toBe('settled');
    expect(settled?.selections.map((selection) => selection.name)).toContain('Argentina');

    const outright = markets.find((market) => market.id === 'outright');
    expect(outright?.selections).toHaveLength(19);
    expect(outright?.selections.map((selection) => selection.name)).not.toContain('Cabo Verde');
  });

  it('409s a conflicting winner for an already-settled fixture', async () => {
    const response = await request(app.getHttpServer())
      .post(REPRICE_PATH)
      .set(AUTH_HEADER, bearer())
      .send({ settlement: makeSettlement('R32-13', 'CPV') });
    expect(response.status).toBe(409);
  });
});

describe('POST /reset (admin-guarded)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('403s a valid but non-admin token (identity-based AdminGuard)', async () => {
    const response = await request(app.getHttpServer())
      .post(RESET_PATH)
      .set(AUTH_HEADER, `Bearer ${signToken('x')}`);
    expect(response.status).toBe(403);
  });

  it('clears and reseeds fresh OPEN markets for an admin token', async () => {
    // Mutate state first: settle R32-13 so the reseed has something to undo.
    await request(app.getHttpServer())
      .post(REPRICE_PATH)
      .set(AUTH_HEADER, bearer())
      .send({ settlement: makeSettlement(R32_13, 'ARG') })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(RESET_PATH)
      .set(AUTH_HEADER, `Bearer ${signToken('x', { admin: true })}`)
      .expect(200);

    const markets = MarketSchema.array().parse(response.body);
    expect(markets).toHaveLength(11);
    for (const market of markets) {
      expect(market.status).toBe('open');
    }
    expect(markets.find((market) => market.id === R32_13)?.status).toBe('open');
  });
});
