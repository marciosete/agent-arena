import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { signToken } from '@arena/service-auth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIXTURES, HealthResponseSchema, SimStateSchema } from '@arena/contracts';
import { AppModule } from './app.module';
import { BracketStore } from './simulator/bracket.store';
import { DownstreamClient } from './simulator/downstream.client';
import { SimulatorService } from './simulator/simulator.service';
import { FakeDownstream } from './simulator/testing/fake-downstream';
import { InMemoryBracketStore } from './simulator/testing/in-memory-bracket.store';

// Every non-@Public route requires a session JWT (the default dev secret is fine
// in tests). Control routes additionally require the token's `admin` claim — the
// shared identity-based AdminGuard, no x-admin-key headers. A plain punter token
// authenticates but is not authorized; an admin token is both.
const PUNTER = `Bearer ${signToken('punter-account-id')}`;
const ADMIN = `Bearer ${signToken('operator-account-id', { admin: true })}`;
const AUTH_HEADER = 'Authorization';
const CONTROL_PATHS = ['/play-next', '/run', '/reset'];

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
      // In-memory store so the e2e never touches a real database.
      .overrideProvider(BracketStore)
      .useValue(new InMemoryBracketStore())
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
    for (const path of CONTROL_PATHS) {
      const response = await request(app.getHttpServer()).post(path);
      expect(response.status, path).toBe(401);
    }
  });

  it('serves the seeded bracket on /state with any valid token', async () => {
    const response = await request(app.getHttpServer())
      .get('/state')
      .set(AUTH_HEADER, PUNTER)
      .expect(200);
    expect(SimStateSchema.parse(response.body).champion).toBeNull();
  });

  it('rejects every control endpoint for a non-admin token (403)', async () => {
    for (const path of CONTROL_PATHS) {
      const response = await request(app.getHttpServer()).post(path).set(AUTH_HEADER, PUNTER);
      expect(response.status, path).toBe(403);
    }
  });

  it('rejects an invalid /run body with 400 (admin token)', async () => {
    const response = await request(app.getHttpServer())
      .post('/run')
      .set(AUTH_HEADER, ADMIN)
      .send({ intervalMs: -1 });
    expect(response.status).toBe(400);
  });

  it('resets with an admin token (201) and cascades to pricing + betting resets', async () => {
    const before = { pricing: downstream.resetPricingCalls, betting: downstream.resetBettingCalls };
    const response = await request(app.getHttpServer()).post('/reset').set(AUTH_HEADER, ADMIN);
    expect(response.status).toBe(201);
    expect(SimStateSchema.parse(response.body).champion).toBeNull();
    // The controller awaits the cascade, so both downstream resets are recorded.
    expect(downstream.resetPricingCalls).toBe(before.pricing + 1);
    expect(downstream.resetBettingCalls).toBe(before.betting + 1);
  });

  it('play-next (admin) plays a fixture and GET /state exposes the live bracket', async () => {
    // The seed already records the real R32-9..12 results; the first fixture the
    // simulator itself plays is R32-15 (SUI v ALG, earliest unplayed). Runs on
    // the fresh bracket left by the reset test above.
    const seedPlayed = FIXTURES.filter((f) => f.status === 'finished').map((f) => f.id);
    const finaleStart = downstream.callOrder.length;
    const played = await request(app.getHttpServer())
      .post('/play-next')
      .set(AUTH_HEADER, ADMIN)
      .expect(201);
    expect(SimStateSchema.parse(played.body).playedFixtureIds).toEqual([...seedPlayed, 'R32-15']);

    const response = await request(app.getHttpServer())
      .get('/state')
      .set(AUTH_HEADER, PUNTER)
      .expect(200);
    const state = SimStateSchema.parse(response.body);

    // The played fixture carries the result...
    const fixture = state.fixtures.find((f) => f.id === 'R32-15');
    expect(fixture?.status).toBe('finished');
    expect(fixture?.homeScore).not.toBeNull();
    expect(fixture?.awayScore).not.toBeNull();
    expect(fixture?.winnerTeamId).not.toBeNull();
    // ...and its winner advanced into the next fixture's slot (R32-15 → R16-8 home).
    const next = state.fixtures.find((f) => f.id === 'R16-8');
    expect(next?.homeTeamId).toBe(fixture?.winnerTeamId);

    // The finale chain fanned out: reprice then settle.
    expect(downstream.callOrder.slice(finaleStart, finaleStart + 2)).toEqual(['reprice', 'settle']);
  });

  it('run (admin) fast-forwards to a champion, observable via GET /state', async () => {
    await request(app.getHttpServer())
      .post('/run')
      .set(AUTH_HEADER, ADMIN)
      .send({ intervalMs: 0 })
      .expect(201);

    await vi.waitFor(async () => {
      const response = await request(app.getHttpServer()).get('/state').set(AUTH_HEADER, PUNTER);
      expect(SimStateSchema.parse(response.body).champion).not.toBeNull();
    });

    const response = await request(app.getHttpServer()).get('/state').set(AUTH_HEADER, PUNTER);
    const state = SimStateSchema.parse(response.body);
    expect(state.remainingFixtureIds).toEqual([]);
    expect(state.fixtures.every((f) => f.status === 'finished')).toBe(true);
  });

  it('accepts a body-less /run (admin) — the contract intervalMs default applies', async () => {
    // Runs after the tournament resolved, so starting another run is a no-op;
    // the point is that Express 5's undefined body still parses (not 400).
    const response = await request(app.getHttpServer()).post('/run').set(AUTH_HEADER, ADMIN);
    expect(response.status).toBe(201);
  });

  it('reset (admin) restores the seed bracket', async () => {
    const response = await request(app.getHttpServer())
      .post('/reset')
      .set(AUTH_HEADER, ADMIN)
      .expect(201);
    const state = SimStateSchema.parse(response.body);
    expect(state.champion).toBeNull();
    // Reset returns to the SEED, which includes the real results already played.
    expect(state.playedFixtureIds).toEqual(
      FIXTURES.filter((f) => f.status === 'finished').map((f) => f.id)
    );
    expect(state.fixtures.find((f) => f.id === 'R32-15')?.status).toBe('scheduled');
    expect(state.fixtures.find((f) => f.id === 'R32-9')?.status).toBe('finished');
  });
});
