import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { signToken } from '@arena/service-auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponseSchema, SimStateSchema } from '@arena/contracts';
import { AppModule } from './app.module';
import { SimulatorService } from './simulator/simulator.service';

// Every non-@Public route now requires a session JWT; the default dev secret is
// fine in tests. Admin routes still need x-admin-key on top of the token.
const BEARER = `Bearer ${signToken('test-account-id')}`;
const AUTH = 'Authorization';
const ADMIN_HEADER = 'x-admin-key';
const ADMIN_KEY = 'test-sim-key';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Point downstream at an unroutable local port: play-next must exercise its
    // degraded mode here, never a real pricing/betting instance.
    process.env.PRICING_URL = 'http://127.0.0.1:59999';
    process.env.BETTING_URL = 'http://127.0.0.1:59999';
    process.env.SIMULATOR_SEED = '42';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PRICING_URL;
    delete process.env.BETTING_URL;
    delete process.env.SIMULATOR_SEED;
  });

  it('serves /health without a token (public)', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(HealthResponseSchema.parse(response.body).service).toBe('simulator');
  });

  it('rejects /state without a bearer token (401)', async () => {
    await request(app.getHttpServer()).get('/state').expect(401);
  });

  it('serves the seeded bracket on /state with a token', async () => {
    const response = await request(app.getHttpServer()).get('/state').set(AUTH, BEARER).expect(200);
    expect(SimStateSchema.parse(response.body).champion).toBeNull();
  });

  it('allows reset when no admin key is configured', async () => {
    delete process.env.SIMULATOR_ADMIN_KEY;
    const response = await request(app.getHttpServer()).post('/reset').set(AUTH, BEARER);
    expect(response.status).toBe(201);
  });

  describe('with SIMULATOR_ADMIN_KEY configured', () => {
    beforeAll(() => {
      process.env.SIMULATOR_ADMIN_KEY = ADMIN_KEY;
    });

    afterAll(() => {
      delete process.env.SIMULATOR_ADMIN_KEY;
    });

    it('keeps /state reachable without the admin key', async () => {
      const response = await request(app.getHttpServer()).get('/state').set(AUTH, BEARER);
      expect(response.status).toBe(200);
    });

    it('rejects the control plane without the admin key (401)', async () => {
      for (const path of ['/play-next', '/run', '/reset']) {
        const response = await request(app.getHttpServer()).post(path).set(AUTH, BEARER);
        expect(response.status, path).toBe(401);
      }
    });

    it('rejects the control plane without a bearer token even with the admin key (401)', async () => {
      const response = await request(app.getHttpServer())
        .post('/play-next')
        .set(ADMIN_HEADER, ADMIN_KEY);
      expect(response.status).toBe(401);
    });

    it('accepts reset with the admin key', async () => {
      const response = await request(app.getHttpServer())
        .post('/reset')
        .set(AUTH, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY);
      expect(response.status).toBe(201);
    });

    it('plays the next fixture on /play-next and exposes it on /state (degraded downstream)', async () => {
      const played = await request(app.getHttpServer())
        .post('/play-next')
        .set(AUTH, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY)
        .expect(201);
      const state = SimStateSchema.parse(played.body);
      expect(state.playedFixtureIds).toEqual(['R32-9']);

      const opener = state.fixtures.find((fixture) => fixture.id === 'R32-9');
      expect(opener?.status).toBe('finished');
      expect(opener?.winnerTeamId).not.toBeNull();
      const next = state.fixtures.find((fixture) => fixture.id === 'R16-5');
      expect(next?.homeTeamId).toBe(opener?.winnerTeamId);

      const polled = await request(app.getHttpServer()).get('/state').set(AUTH, BEARER).expect(200);
      expect(SimStateSchema.parse(polled.body)).toEqual(state);
    });

    it('rejects /run with an out-of-contract body (400)', async () => {
      const response = await request(app.getHttpServer())
        .post('/run')
        .set(AUTH, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY)
        .send({ intervalMs: -5 });
      expect(response.status).toBe(400);
    });

    it('starts /run immediately and fast-forwards to a champion', async () => {
      const response = await request(app.getHttpServer())
        .post('/run')
        .set(AUTH, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY)
        .send({ intervalMs: 0 })
        .expect(201);
      SimStateSchema.parse(response.body);

      const simulator = app.get(SimulatorService);
      await expect.poll(() => simulator.getState().champion, { timeout: 10_000 }).not.toBeNull();
      expect(simulator.getState().remainingFixtureIds).toEqual([]);

      // leave the suite on the seed state
      const reset = await request(app.getHttpServer())
        .post('/reset')
        .set(AUTH, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY)
        .expect(201);
      expect(SimStateSchema.parse(reset.body).playedFixtureIds).toEqual([]);
    });
  });
});
