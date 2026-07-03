import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { signToken } from '@arena/service-auth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HealthResponseSchema, SimStateSchema } from '@arena/contracts';
import { AppModule } from './app.module';
import { DownstreamClient } from './simulator/downstream.client';
import { SimulatorService } from './simulator/simulator.service';
import { FakeDownstream } from './simulator/testing/fake-downstream';

// Every non-@Public route now requires a session JWT; the default dev secret is
// fine in tests. Admin routes still need x-admin-key on top of the token.
const BEARER = `Bearer ${signToken('test-account-id')}`;
const ADMIN_KEY = 'test-sim-key';
const AUTH_HEADER = 'Authorization';
const ADMIN_HEADER = 'x-admin-key';

describe('AppModule (e2e)', () => {
  let app: INestApplication;
  let downstream: FakeDownstream;

  beforeAll(async () => {
    downstream = new FakeDownstream(() => app.get(SimulatorService).getState());
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DownstreamClient)
      .useValue(downstream)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves /health without a token (public)', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(HealthResponseSchema.parse(response.body).service).toBe('simulator');
  });

  it('rejects /state without a bearer token (401)', async () => {
    await request(app.getHttpServer()).get('/state').expect(401);
  });

  it('rejects every control endpoint without a bearer token (401)', async () => {
    await request(app.getHttpServer()).post('/play-next').expect(401);
    await request(app.getHttpServer()).post('/run').expect(401);
    await request(app.getHttpServer()).post('/reset').expect(401);
  });

  it('serves the seeded bracket on /state with a token', async () => {
    const response = await request(app.getHttpServer())
      .get('/state')
      .set(AUTH_HEADER, BEARER)
      .expect(200);
    expect(SimStateSchema.parse(response.body).champion).toBeNull();
  });

  it('allows reset when no admin key is configured', async () => {
    delete process.env.SIMULATOR_ADMIN_KEY;
    const response = await request(app.getHttpServer()).post('/reset').set(AUTH_HEADER, BEARER);
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
      const response = await request(app.getHttpServer()).get('/state').set(AUTH_HEADER, BEARER);
      expect(response.status).toBe(200);
    });

    it('rejects play-next, run and reset without the admin key (401)', async () => {
      for (const path of ['/play-next', '/run', '/reset']) {
        const response = await request(app.getHttpServer()).post(path).set(AUTH_HEADER, BEARER);
        expect(response.status, path).toBe(401);
      }
    });

    it('rejects a wrong admin key (401)', async () => {
      const response = await request(app.getHttpServer())
        .post('/play-next')
        .set(AUTH_HEADER, BEARER)
        .set(ADMIN_HEADER, 'not-the-key');
      expect(response.status).toBe(401);
    });

    it('rejects an invalid /run body with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/run')
        .set(AUTH_HEADER, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY)
        .send({ intervalMs: -1 });
      expect(response.status).toBe(400);
    });

    it('accepts reset with the admin key', async () => {
      const response = await request(app.getHttpServer())
        .post('/reset')
        .set(AUTH_HEADER, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY);
      expect(response.status).toBe(201);
    });

    it('play-next plays a fixture and GET /state exposes the live bracket', async () => {
      const played = await request(app.getHttpServer())
        .post('/play-next')
        .set(AUTH_HEADER, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY)
        .expect(201);
      expect(SimStateSchema.parse(played.body).playedFixtureIds).toEqual(['R32-9']);

      const response = await request(app.getHttpServer())
        .get('/state')
        .set(AUTH_HEADER, BEARER)
        .expect(200);
      const state = SimStateSchema.parse(response.body);

      // The played fixture carries the result...
      const fixture = state.fixtures.find((f) => f.id === 'R32-9');
      expect(fixture?.status).toBe('finished');
      expect(fixture?.homeScore).not.toBeNull();
      expect(fixture?.awayScore).not.toBeNull();
      expect(fixture?.winnerTeamId).not.toBeNull();
      // ...and its winner advanced into the next fixture's slot (R32-9 → R16-5 home).
      const next = state.fixtures.find((f) => f.id === 'R16-5');
      expect(next?.homeTeamId).toBe(fixture?.winnerTeamId);

      // The finale chain fanned out: reprice then settle.
      expect(downstream.callOrder.slice(0, 2)).toEqual(['reprice', 'settle']);
    });

    it('run fast-forwards to a champion, observable via GET /state', async () => {
      await request(app.getHttpServer())
        .post('/run')
        .set(AUTH_HEADER, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY)
        .send({ intervalMs: 0 })
        .expect(201);

      await vi.waitFor(async () => {
        const response = await request(app.getHttpServer()).get('/state').set(AUTH_HEADER, BEARER);
        expect(SimStateSchema.parse(response.body).champion).not.toBeNull();
      });

      const response = await request(app.getHttpServer()).get('/state').set(AUTH_HEADER, BEARER);
      const state = SimStateSchema.parse(response.body);
      expect(state.remainingFixtureIds).toEqual([]);
      expect(state.fixtures.every((f) => f.status === 'finished')).toBe(true);
    });

    it('accepts a body-less /run — the contract intervalMs default applies', async () => {
      // Runs after the tournament resolved, so starting another run is a no-op;
      // the point is that Express 5's undefined body still parses (not 400).
      const response = await request(app.getHttpServer())
        .post('/run')
        .set(AUTH_HEADER, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY);
      expect(response.status).toBe(201);
    });

    it('reset restores the seed bracket', async () => {
      const response = await request(app.getHttpServer())
        .post('/reset')
        .set(AUTH_HEADER, BEARER)
        .set(ADMIN_HEADER, ADMIN_KEY)
        .expect(201);
      const state = SimStateSchema.parse(response.body);
      expect(state.champion).toBeNull();
      expect(state.playedFixtureIds).toEqual([]);
      expect(state.fixtures.find((f) => f.id === 'R32-9')?.status).toBe('scheduled');
    });
  });
});
